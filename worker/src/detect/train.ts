/**
 * Train stall detection from riders' phones.
 * Keeps a sliding window in memory, so run the worker as a single instance.
 */
import { cfg } from "../config";
import { snapToLine, segmentById, busStops } from "../../../shared/network";
import { distance } from "@turf/turf";
import type { Ping } from "../../../shared/types";
import { createIncident, updateIncident, confidenceFor } from "../../../shared/server/incidents";

interface Sample {
  t: number; // receive time
  speed: number;
  motion: number | null;
  atStation: boolean;
  key: string | null; // segment id or bus:<route>
  lat: number;
  lon: number;
}

interface SessionState {
  sessionId: string;
  mode: "rail" | "bus";
  lineOrRoute: string;
  simulated: boolean;
  samples: Sample[];
  stillSince: number | null;
  stillKey: string | null;
  reportedAt: number | null; // last "train's not moving" report
  lastSnap: { key: string | null; atStation: boolean; speed: number; lat: number; lon: number; t: number } | null;
}

interface ActiveIncident {
  id: string;
  key: string;
  sessions: Set<string>;
  riderCount: number;
  startedAt: number;
  simulated: boolean;
}

const sessions = new Map<string, SessionState>();
const active = new Map<string, ActiveIncident>(); // key -> incident
const busy = new Set<string>(); // keys with an incident write in flight

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function detectorStats() {
  const keys: Record<string, number> = {};
  for (const s of sessions.values()) {
    const last = s.samples[s.samples.length - 1];
    if (last?.key && Date.now() - last.t < cfg.sessionStaleMs) keys[last.key] = (keys[last.key] ?? 0) + 1;
  }
  return {
    sessions: sessions.size,
    ridersBySegment: keys,
    active: [...active.values()].map((a) => ({ id: a.id, key: a.key, riders: a.riderCount })),
    thresholds: { minRiders: cfg.stallMinRiders, stallSec: cfg.stallMinMs / 1000 },
  };
}

export async function onPing(p: Ping) {
  const now = Date.now();
  if (!p.sessionId || typeof p.lat !== "number" || typeof p.lon !== "number") return;

  let key: string | null = null;
  let atStation = false;

  if (p.mode === "rail" && p.lineId) {
    const snap = snapToLine(p.lineId, p.lat, p.lon);
    if (!snap || snap.distToLineM > cfg.maxDistToLineM) return; // not on this line
    key = snap.segment.segmentId;
    atStation = snap.distToStationM < cfg.stationRadiusM;
  } else if (p.mode === "bus" && p.routeId) {
    key = `bus:${p.routeId}`;
    atStation = busStops.some((s) => s.routes.includes(p.routeId!) && distance([s.lon, s.lat], [p.lon, p.lat], { units: "meters" }) < cfg.busStopRadiusM);
  } else return;

  let s = sessions.get(p.sessionId);
  if (!s) {
    s = { sessionId: p.sessionId, mode: p.mode, lineOrRoute: (p.lineId ?? p.routeId)!, simulated: !!p.simulated, samples: [], stillSince: null, stillKey: null, reportedAt: null, lastSnap: null };
    sessions.set(p.sessionId, s);
  }

  // speed: phone value, else from the last sample
  let speed = typeof p.speed === "number" && p.speed >= 0 ? p.speed : NaN;
  const prev = s.samples[s.samples.length - 1];
  if (Number.isNaN(speed)) {
    speed = prev ? distance([prev.lon, prev.lat], [p.lon, p.lat], { units: "meters" }) / Math.max(1, (now - prev.t) / 1000) : 0;
  }

  s.samples.push({ t: now, speed, motion: typeof p.motion === "number" ? p.motion : null, atStation, key, lat: p.lat, lon: p.lon });
  s.samples = s.samples.filter((x) => now - x.t <= cfg.windowMs);

  if (p.report === "stopped") s.reportedAt = now;
  if (p.report === "moving") s.reportedAt = null;
  const reported = s.reportedAt != null && now - s.reportedAt < cfg.reportValidMs;

  // still-ness between stations: slow GPS speed, or calm motion with only GPS-jitter speed, or the rider says so
  const last3 = s.samples.slice(-3);
  const medSpeed = median(last3.map((x) => x.speed));
  const motions = last3.map((x) => x.motion).filter((m): m is number => m != null);
  const calm = motions.length === 0 || median(motions) < cfg.stallMotionMax;
  const calmMeasured = motions.length >= 2 && median(motions) < cfg.stallMotionMax;
  const still = !atStation && ((medSpeed < cfg.stallSpeedMps && calm) || (calmMeasured && medSpeed < cfg.jitterSpeedMps) || (reported && medSpeed < cfg.clearSpeedMps));
  s.lastSnap = { key, atStation, speed: medSpeed, lat: p.lat, lon: p.lon, t: now };

  if (still && s.stillKey === key) s.stillSince ??= now;
  else if (still) {
    s.stillSince = now;
    s.stillKey = key;
  } else {
    s.stillSince = null;
    s.stillKey = null;
  }

  await evaluate(key!, now);
  // a moving rider might also clear an incident on the segment they just left
  for (const inc of active.values()) if (inc.sessions.has(p.sessionId) && inc.key !== key) await evaluate(inc.key, now);
}

async function evaluate(key: string, now: number) {
  if (busy.has(key)) return;
  const onKey = [...sessions.values()].filter((s) => {
    const last = s.samples[s.samples.length - 1];
    return last && now - last.t < cfg.sessionStaleMs;
  });

  const stalled = onKey.filter((s) => {
    if (s.stillKey !== key || s.stillSince == null) return false;
    const reported = s.reportedAt != null && now - s.reportedAt < cfg.reportValidMs;
    return now - s.stillSince >= (reported ? cfg.reportStallMs : cfg.stallMinMs);
  });
  const inc = active.get(key);

  if (!inc) {
    if (stalled.length >= cfg.stallMinRiders) {
      busy.add(key);
      try {
        const simulated = stalled.every((s) => s.simulated);
        const isBus = key.startsWith("bus:");
        const seg = isBus ? null : segmentById.get(key);
        const created = await createIncident({
          type: isBus ? "bus_stall" : "train_stall",
          lineId: seg?.lineId ?? null,
          routeId: isBus ? key.slice(4) : null,
          segmentId: seg?.segmentId ?? null,
          fromStop: seg?.fromStop ?? null,
          toStop: seg?.toStop ?? null,
          riderCount: stalled.length,
          source: "riders",
          simulated,
          center: (() => {
            const l = stalled[0].samples[stalled[0].samples.length - 1];
            return { lat: l.lat, lon: l.lon };
          })(),
        });
        active.set(key, { id: created.id, key, sessions: new Set(stalled.map((s) => s.sessionId)), riderCount: stalled.length, startedAt: now, simulated });
      } catch (e: any) {
        console.error(`[detect] create failed: ${e.message}`);
      } finally {
        busy.delete(key);
      }
    }
    return;
  }

  // existing incident: grow, or clear
  for (const s of stalled) inc.sessions.add(s.sessionId);
  const involved = [...inc.sessions].map((id) => sessions.get(id)).filter(Boolean) as SessionState[];
  const moving = involved.filter((s) => {
    const last3 = s.samples.slice(-3);
    const lastT = last3[last3.length - 1]?.t ?? 0;
    return now - lastT < cfg.sessionStaleMs && median(last3.map((x) => x.speed)) > cfg.clearSpeedMps;
  });
  const lastSeen = Math.max(0, ...involved.map((s) => s.samples[s.samples.length - 1]?.t ?? 0));

  busy.add(key);
  try {
    if (moving.length >= cfg.clearMinRiders || now - lastSeen > cfg.silenceClearMs) {
      active.delete(key);
      await updateIncident(inc.id, { riderCount: inc.riderCount }, "cleared");
    } else if (stalled.length > inc.riderCount) {
      const before = confidenceFor(inc.riderCount);
      inc.riderCount = stalled.length;
      const worse = confidenceFor(inc.riderCount) !== before;
      await updateIncident(inc.id, { riderCount: inc.riderCount }, worse ? "worsened" : "updated");
    }
  } catch (e: any) {
    console.error(`[detect] update failed: ${e.message}`);
  } finally {
    busy.delete(key);
  }
}

/** Periodic sweep: clears incidents that went silent and forgets stale sessions. */
export async function tick() {
  const now = Date.now();
  for (const key of [...active.keys()]) await evaluate(key, now);
  for (const [id, s] of sessions) {
    const last = s.samples[s.samples.length - 1];
    if (!last || now - last.t > cfg.windowMs) sessions.delete(id);
  }
}

/** Used by the simulator "reset" button. */
export async function resetDetector() {
  for (const inc of active.values()) await updateIncident(inc.id, {}, "cleared").catch(() => null);
  active.clear();
  sessions.clear();
}

/** Real (non-simulated) riders on board right now, for the simulator map. No uid, rounded position. */
export function liveRiders() {
  const now = Date.now();
  return [...sessions.values()]
    .filter((s) => !s.simulated && s.lastSnap && now - s.lastSnap.t < cfg.sessionStaleMs)
    .map((s) => ({
      id: s.sessionId.slice(-6),
      lat: +s.lastSnap!.lat.toFixed(4),
      lon: +s.lastSnap!.lon.toFixed(4),
      segment: s.lastSnap!.key,
      atStation: s.lastSnap!.atStation,
      speed: Math.round(s.lastSnap!.speed * 10) / 10,
      still: s.stillSince != null,
      stillForSec: s.stillSince ? Math.round((now - s.stillSince) / 1000) : 0,
      reported: s.reportedAt != null && now - s.reportedAt < cfg.reportValidMs,
    }));
}

/** What the detector currently thinks about one session (for the phone's on-board screen). */
export function sessionView(sessionId: string) {
  const s = sessions.get(sessionId);
  if (!s?.lastSnap) return null;
  const inc = [...active.values()].find((a) => a.key === s.lastSnap!.key);
  return {
    segment: s.lastSnap.key,
    atStation: s.lastSnap.atStation,
    speed: Math.round(s.lastSnap.speed * 10) / 10,
    still: s.stillSince != null,
    stillForSec: s.stillSince ? Math.round((Date.now() - s.stillSince) / 1000) : 0,
    reported: s.reportedAt != null && Date.now() - s.reportedAt < cfg.reportValidMs,
    ridersHere: [...sessions.values()].filter((o) => o.lastSnap?.key === s.lastSnap!.key && Date.now() - o.lastSnap.t < cfg.sessionStaleMs).length,
    incidentId: inc?.id ?? null,
    needRiders: cfg.stallMinRiders,
    needSec: s.reportedAt ? cfg.reportStallMs / 1000 : cfg.stallMinMs / 1000,
  };
}
