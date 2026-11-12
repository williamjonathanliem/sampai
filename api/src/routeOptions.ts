/**
 * Route options from a student's home to APU, like a maps app, plus what only Sampai knows:
 * real APU shuttle departures, the next APSpace class, rain/heat at departure time, live stalls
 * detected by riders, and recent reliability of each line. Walking and driving follow real streets
 * (OpenStreetMap routing), so paths and times are what a student will actually walk or ride.
 */
import { lines, lineById, stationById, segmentsBetween, segmentById, APU } from "../../shared/network";
import { planShuttle, nextShuttleAfter, shuttleStops, trafficFactor } from "../../shared/server/apu";
import { walkRoute, driveRoute, type StreetRoute } from "../../shared/server/osrm";
import { grabFare } from "../../shared/server/options";
import { db } from "../../shared/server/firebase";
import { myt } from "../../shared/time";
import type { RouteLeg } from "../../shared/types";
import { distance } from "@turf/turf";

type LatLon = { lat: number; lon: number };
const LRT_BJ = "LRT - Bukit Jalil";
const BUKIT_JALIL = "SP17";
const BUFFER_MIN = 3;
const TRAIN_WAIT_MIN = 3;
const TRANSFER_MIN = 6;
const GRAB_WAIT_MIN = 6;
const APU_GATE = { lat: 3.05508, lon: 101.70058 }; // main entrance, Jalan Teknologi 5

export interface RouteStep {
  mode: RouteLeg["mode"];
  text: string;
  min: number;
}
export interface TimelineItem {
  at: string;
  text: string;
  mode: RouteLeg["mode"] | "start" | "end";
}
export interface Insight {
  tone: "go" | "warn" | "stop" | "info";
  kind: "rain" | "heat" | "stall" | "watch" | "time" | "money" | "history";
  text: string;
}
export interface PathPiece {
  mode: RouteLeg["mode"];
  color?: string;
  coords: [number, number][];
}
export interface RouteOption {
  id: string;
  title: string;
  kind: "train" | "shuttle" | "walk" | "grab";
  legs: RouteLeg[];
  steps: RouteStep[];
  timeline: TimelineItem[];
  path: PathPiece[];
  totalMin: number;
  walkMin: number;
  outdoorMin: number;
  leaveBy: string;
  leaveTs: number;
  arrive: string;
  arriveTs: number;
  spareMin: number | null;
  late: boolean;
  fareRM: number | null;
  free: boolean;
  insights: Insight[];
  tags: string[];
  pick: boolean;
  pickReason?: string;
}

// ---------------- context: weather by hour, live stalls, history ----------------

let wxCache: { at: number; hours: { ts: number; rain: number; feels: number }[] } | null = null;
async function weatherAt(ts: number) {
  if (!wxCache || Date.now() - wxCache.at > 30 * 60_000) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${APU.lat}&longitude=${APU.lon}&hourly=precipitation_probability,apparent_temperature&timezone=Asia/Kuala_Lumpur&forecast_days=3`;
      const j: any = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).json();
      wxCache = {
        at: Date.now(),
        hours: (j.hourly?.time ?? []).map((t: string, i: number) => ({ ts: Date.parse(`${t}:00+08:00`), rain: j.hourly.precipitation_probability[i] ?? 0, feels: j.hourly.apparent_temperature[i] ?? 30 })),
      };
    } catch {
      wxCache = { at: Date.now() - 25 * 60_000, hours: [] };
    }
  }
  return wxCache.hours.filter((x) => x.ts <= ts).pop() ?? null;
}

async function liveContext() {
  const now = Date.now();
  const [active, recent] = await Promise.all([
    db.collection("incidents").where("status", "==", "active").get().catch(() => null),
    db.collection("incidents").where("startedAt", ">", now - 30 * 86_400_000).get().catch(() => null),
  ]);
  const stalled = new Map<string, { title: string; simulated: boolean }>(); // segmentId -> incident
  for (const d of active?.docs ?? []) {
    const i = d.data();
    if (i.type === "train_stall" && i.segmentId) stalled.set(i.segmentId, { title: i.title, simulated: !!i.simulated });
  }
  // real (non-simulated) stalls only: route advice must not be based on demo data
  const history = new Map<string, number>();
  for (const d of recent?.docs ?? []) {
    const i = d.data();
    if (i.type !== "train_stall" || i.simulated || !i.lineId) continue;
    history.set(i.lineId, (history.get(i.lineId) ?? 0) + 1);
  }
  return { stalled, history };
}

// ---------------- helpers ----------------

function exitStation(lineId: string) {
  if (lineId === "PH") return BUKIT_JALIL;
  const l = lineById.get(lineId)!;
  return l.stations.reduce((best, s) => (distance([s.lon, s.lat], [APU.lon, APU.lat]) < distance([best.lon, best.lat], [APU.lon, APU.lat]) ? s : best)).stopId;
}
const stationIdx = (lineId: string, stopId: string) => lineById.get(lineId)!.stations.findIndex((s) => s.stopId === stopId);
const rideMin = (lineId: string, a: string, b: string) => Math.max(2, Math.abs(stationIdx(lineId, a) - stationIdx(lineId, b)) * 2 + 1);
const railCoords = (lineId: string, a: string, b: string): [number, number][] =>
  segmentsBetween(lineId, a, b).flatMap((id) => (segmentById.get(id)?.geometry.coordinates ?? []) as [number, number][]);
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : m < 60 ? "a few steps" : `${Math.round(m / 10) * 10} m`);
/** Rapid KL rail fares are distance based, roughly RM 1.20 to RM 6.40 (cashless). An estimate, labelled as such. */
const railFare = (stations: number) => Math.min(6.4, Math.round((1.2 + stations * 0.2) * 10) / 10);
const short = (name: string) => name.replace(" Line", "");

function transferToPH(lineId: string, boardStop: string) {
  const ph = lineById.get("PH")!;
  const line = lineById.get(lineId)!;
  let best: { x: (typeof line.stations)[number]; p: (typeof ph.stations)[number]; total: number } | null = null;
  for (const x of line.stations) {
    const p = ph.stations.find((q) => q.name === x.name || distance([q.lon, q.lat], [x.lon, x.lat], { units: "meters" }) < 350);
    if (!p || x.stopId === boardStop) continue;
    const total = rideMin(lineId, boardStop, x.stopId) + TRANSFER_MIN + rideMin("PH", p.stopId, BUKIT_JALIL);
    if (!best || total < best.total) best = { x, p, total };
  }
  return best;
}

/** One piece of a route; timing is applied afterwards (fixed, or around a real shuttle departure). */
interface Part {
  mode: RouteLeg["mode"];
  min: number;
  step: string; // shown in the step list
  begin: string; // timeline text at the start of this part
  leg: RouteLeg;
  path?: PathPiece;
  shuttleFrom?: string;
  fare?: number;
}

interface Ctx {
  now: number;
  classTs: number | null;
  raining: boolean;
}

interface Timed {
  leaveTs: number;
  arriveTs: number;
  late: boolean;
  spare: number | null;
  wait: number;
  shuttleTime: string | null;
}

async function timeParts(ctx: Ctx, parts: Part[]): Promise<Timed | null> {
  const si = parts.findIndex((p) => p.shuttleFrom);
  if (si < 0) {
    const total = parts.reduce((a, p) => a + p.min, 0);
    const ideal = ctx.classTs ? ctx.classTs - (total + BUFFER_MIN) * 60_000 : ctx.now;
    const leaveTs = Math.max(ideal, ctx.now);
    const arriveTs = leaveTs + total * 60_000;
    const spare = ctx.classTs ? Math.round((ctx.classTs - arriveTs) / 60_000) : null;
    return { leaveTs, arriveTs, late: spare != null && spare < 0, spare, wait: 0, shuttleTime: null };
  }
  const pre = parts.slice(0, si).reduce((a, p) => a + p.min, 0);
  const post = parts.slice(si + 1).reduce((a, p) => a + p.min, 0);
  const from = parts[si].shuttleFrom!;
  let depTs: number | null = null;
  let ride = 12;
  let shuttleTime: string | null = null;
  let leaveTs = ctx.now;
  if (ctx.classTs) {
    const plan = await planShuttle(from, ctx.classTs - post * 60_000, pre, { raining: ctx.raining, now: ctx.now });
    if (plan.shuttle && plan.leaveTs != null && plan.rideMin != null) {
      depTs = Date.parse(`${myt(ctx.classTs).date}T${plan.shuttle}:00+08:00`);
      ride = plan.rideMin;
      shuttleTime = plan.shuttle;
      leaveTs = plan.leaveTs;
    }
  }
  if (depTs == null) {
    const n = await nextShuttleAfter(from, ctx.now + (pre + 2) * 60_000, ctx.raining);
    if (!n) return null; // no more shuttles today
    depTs = n.depTs;
    ride = n.rideMin;
    shuttleTime = n.time;
    leaveTs = ctx.now;
  }
  parts[si].min = ride;
  const atStop = leaveTs + pre * 60_000;
  const wait = Math.max(0, Math.round((depTs - atStop) / 60_000));
  const arriveTs = depTs + (ride + post) * 60_000;
  const spare = ctx.classTs ? Math.round((ctx.classTs - arriveTs) / 60_000) : null;
  return { leaveTs, arriveTs, late: spare != null && spare < 0, spare, wait, shuttleTime };
}

function buildTimeline(parts: Part[], tm: Timed): TimelineItem[] {
  const items: TimelineItem[] = [];
  let t = tm.leaveTs;
  parts.forEach((p, i) => {
    if (p.shuttleFrom) t += tm.wait * 60_000;
    const text = p.begin.replace("{time}", tm.shuttleTime ?? "");
    items.push({ at: myt(t).hhmm, text: i === 0 ? `Leave home. ${text}` : text, mode: p.mode });
    t += p.min * 60_000;
  });
  items.push({ at: myt(tm.arriveTs).hhmm, text: tm.spare != null ? (tm.spare >= 0 ? `Arrive at APU, ${tm.spare} min before class` : `Arrive at APU, ${-tm.spare} min late`) : "Arrive at APU", mode: "end" });
  return items;
}

// ---------------- main ----------------

export async function routeOptions(home: LatLon, opts: { classTs?: number | null; raining?: boolean; board?: string | null; now?: number } = {}): Promise<RouteOption[]> {
  const ctx: Ctx = { now: opts.now ?? Date.now(), classTs: opts.classTs ?? null, raining: !!opts.raining };
  const live = await liveContext();
  const candidates: { id: string; title: string; kind: RouteOption["kind"]; parts: Part[] }[] = [];

  const walkPart = (r: StreetRoute, to: string, toLabel: string, from = "home"): Part => ({
    mode: "walk",
    min: r.minutes,
    step: r.meters < 60 ? `Go to ${toLabel}` : `Walk ${fmtDist(r.meters)} to ${toLabel}`,
    begin: r.meters < 60 ? `Go to ${toLabel}` : `Walk ${fmtDist(r.meters)} to ${toLabel}`,
    leg: { mode: "walk", from, to, label: `Walk to ${toLabel}`, minutes: r.minutes, ...(to === "APU" ? { walkId: "bj-covered" } : {}) },
    path: { mode: "walk", coords: r.coords },
  });
  const shuttlePart = async (stop: { name: string; label: string; lat: number; lon: number }): Promise<Part> => {
    const d = await driveRoute(stop, APU_GATE);
    return {
      mode: "shuttle",
      min: 12,
      step: `APU shuttle from ${stop.label}`,
      begin: `Board the {time} APU shuttle at ${stop.label}`,
      leg: { mode: "shuttle", label: `APU shuttle from ${stop.label}`, from: stop.name, to: "APU", minutes: 12 },
      path: { mode: "shuttle", coords: d.coords },
      shuttleFrom: stop.name,
    };
  };
  const railPart = (lid: string, fromStop: string, to: string, extra: number, text: string): Part => {
    const min = rideMin(lid, fromStop, to) + extra;
    const stations = Math.abs(stationIdx(lid, fromStop) - stationIdx(lid, to));
    return { mode: "rail", min, step: text, begin: text, leg: { mode: "rail", lineId: lid, fromStop, toStop: to, minutes: min }, path: { mode: "rail", color: lineById.get(lid)!.color, coords: railCoords(lid, fromStop, to) }, fare: railFare(stations) };
  };

  // ---- trains: nearest station on each nearby line ----
  const perLine = new Map<string, { stopId: string; name: string; lat: number; lon: number; crow: number }>();
  for (const l of lines)
    for (const s of l.stations) {
      const crow = distance([home.lon, home.lat], [s.lon, s.lat], { units: "meters" });
      const cur = perLine.get(l.lineId);
      if (crow <= 2500 && (!cur || crow < cur.crow)) perLine.set(l.lineId, { ...s, crow });
    }
  const boards = [...perLine.entries()].sort((a, b) => a[1].crow - b[1].crow).slice(0, 3);
  if (opts.board) {
    const st = stationById.get(opts.board);
    if (st && !boards.some(([, b]) => b.stopId === st.stopId)) boards.push([st.lineId, { ...st, crow: 0 }]);
  }
  const bjStation = stationById.get(BUKIT_JALIL)!;
  const bjStop = shuttleStops.find((s) => s.name === LRT_BJ)!;
  const bjWalk = await walkRoute(bjStation, APU_GATE);

  for (const [lineId, b] of boards) {
    const line = lineById.get(lineId)!;
    const toStop = exitStation(lineId);
    const exit = stationById.get(toStop)!;
    const toStation = await walkRoute(home, b);

    if (b.stopId !== toStop) {
      const start = walkPart(toStation, b.stopId, `${b.name} station`);
      const r = railPart(lineId, b.stopId, toStop, TRAIN_WAIT_MIN, `Train: ${short(line.name)} line, ${b.name} to ${exit.name}`);
      if (toStop === BUKIT_JALIL) {
        candidates.push({ id: `train-${lineId}-${b.stopId}-shuttle`, title: `${short(line.name)} line + APU shuttle`, kind: "train", parts: [start, r, await shuttlePart(bjStop)] });
        candidates.push({ id: `train-${lineId}-${b.stopId}-walk`, title: `${short(line.name)} line + walk`, kind: "train", parts: [start, r, walkPart(bjWalk, "APU", "APU", toStop)] });
      } else {
        const d = await driveRoute(exit, APU_GATE);
        const gm = Math.round(d.minutes * trafficFactor(ctx.classTs ?? ctx.now)) + GRAB_WAIT_MIN;
        candidates.push({
          id: `train-${lineId}-${b.stopId}-grab`,
          title: `${short(line.name)} line + Grab`,
          kind: "train",
          parts: [start, r, { mode: "grab", min: gm, step: `Grab ${fmtDist(d.meters)} from ${exit.name}`, begin: `Grab from ${exit.name}, ${fmtDist(d.meters)}`, leg: { mode: "grab", label: `Grab from ${exit.name} to APU`, from: toStop, to: "APU", minutes: gm }, path: { mode: "grab", coords: d.coords }, fare: grabFare(d.meters / 1000, d.minutes, ctx.raining) }],
        });
      }
    } else if (toStop === BUKIT_JALIL) {
      candidates.push({ id: `bj-shuttle-${b.stopId}`, title: "APU shuttle from LRT Bukit Jalil", kind: "shuttle", parts: [walkPart(toStation, LRT_BJ, "LRT Bukit Jalil"), await shuttlePart(bjStop)] });
    }

    // one change onto the Sri Petaling line
    if (lineId !== "PH") {
      const tr = transferToPH(lineId, b.stopId);
      if (tr) {
        const start = walkPart(toStation, b.stopId, `${b.name} station`);
        const r1 = railPart(lineId, b.stopId, tr.x.stopId, TRAIN_WAIT_MIN, `Train: ${short(line.name)} line, ${b.name} to ${tr.x.name}`);
        const r2 = railPart("PH", tr.p.stopId, BUKIT_JALIL, TRANSFER_MIN, `Change at ${tr.x.name} to the Sri Petaling line, ride to Bukit Jalil`);
        candidates.push({ id: `xfer-${lineId}-${b.stopId}-shuttle`, title: `${short(line.name)} → Sri Petaling + APU shuttle`, kind: "train", parts: [start, r1, r2, await shuttlePart(bjStop)] });
      }
    }
  }

  // ---- hostel shuttle near home ----
  const hostel = shuttleStops
    .filter((s) => s.name !== LRT_BJ)
    .map((s) => ({ ...s, crow: distance([home.lon, home.lat], [s.lon, s.lat], { units: "meters" }) }))
    .sort((a, b) => a.crow - b.crow)[0];
  if (hostel && hostel.crow <= 900) {
    const w = await walkRoute(home, hostel);
    if (w.minutes <= 12) candidates.push({ id: `shuttle-${hostel.name}`, title: `APU shuttle from ${hostel.label}`, kind: "shuttle", parts: [walkPart(w, hostel.name, `the ${hostel.label} pick-up`), await shuttlePart(hostel)] });
  }

  // ---- walking ----
  const walkAll = await walkRoute(home, APU_GATE);
  if (walkAll.minutes <= 50) candidates.push({ id: "walk", title: "Walk", kind: "walk", parts: [walkPart(walkAll, "APU", "APU")] });

  // ---- Grab door to door ----
  const drive = await driveRoute(home, APU_GATE);
  const gMin = Math.round(drive.minutes * trafficFactor(ctx.classTs ?? ctx.now)) + GRAB_WAIT_MIN;
  candidates.push({
    id: "grab",
    title: "Grab",
    kind: "grab",
    parts: [{ mode: "grab", min: gMin, step: `Grab, ${fmtDist(drive.meters)} door to door (incl. ~${GRAB_WAIT_MIN} min pickup)`, begin: "Book a Grab", leg: { mode: "grab", label: "Grab to APU", from: "home", to: "APU", minutes: gMin }, path: { mode: "grab", coords: drive.coords }, fare: grabFare(drive.meters / 1000, drive.minutes, ctx.raining) }],
  });

  // ---- time each candidate, add what only Sampai knows ----
  const out: RouteOption[] = [];
  for (const c of candidates) {
    const tm = await timeParts(ctx, c.parts);
    if (!tm) continue;
    const walkMin = c.parts.filter((p) => p.mode === "walk").reduce((a, p) => a + p.min, 0);
    const hasShuttle = c.parts.some((p) => p.shuttleFrom);
    const outdoorMin = walkMin + (hasShuttle ? Math.min(tm.wait, 10) : 0);
    const fare = c.parts.reduce((a, p) => a + (p.fare ?? 0), 0) || null;
    const railParts = c.parts.filter((p) => p.mode === "rail");
    const lineIds = [...new Set(railParts.map((p) => p.leg.lineId!))];
    const segs = railParts.flatMap((p) => segmentsBetween(p.leg.lineId!, p.leg.fromStop!, p.leg.toStop!));
    const wx = await weatherAt(tm.leaveTs);
    const insights: Insight[] = [];

    const stallHere = segs.map((s) => live.stalled.get(s)).find(Boolean);
    if (stallHere) insights.push({ tone: "stop", kind: "stall", text: `Stalled right now: ${stallHere.title}${stallHere.simulated ? " (simulated)" : ""}` });
    const rainPct = Math.max(wx?.rain ?? 0, ctx.raining ? 70 : 0);
    if (outdoorMin >= 5 && rainPct >= 50) insights.push({ tone: "warn", kind: "rain", text: `${outdoorMin} min outdoors, ${rainPct}% chance of rain around ${myt(tm.leaveTs).hhmm}` });
    else if (outdoorMin >= 8 && (wx?.feels ?? 0) >= 35) insights.push({ tone: "warn", kind: "heat", text: `${outdoorMin} min outdoors, feels ${Math.round(wx!.feels)}°C around ${myt(tm.leaveTs).hhmm}` });
    else if (outdoorMin <= 3) insights.push({ tone: "go", kind: "rain", text: "Hardly any time outdoors" });
    for (const lid of lineIds) {
      const n = live.history.get(lid);
      if (n) insights.push({ tone: "info", kind: "history", text: `${short(lineById.get(lid)!.name)} line: ${n} stall${n === 1 ? "" : "s"} detected by riders in the last 30 days` });
    }
    if (lineIds.length) insights.push({ tone: "info", kind: "watch", text: "If this line stalls, Sampai buzzes you with a new plan" });
    if (hasShuttle) insights.push({ tone: "info", kind: "time", text: "Timed to the real APU shuttle schedule, ride adjusted for traffic at that hour" });
    if (tm.spare != null && tm.spare >= 25 && hasShuttle) insights.push({ tone: "info", kind: "time", text: `${tm.spare} min early: the next shuttle would be late` });

    out.push({
      id: c.id,
      title: c.title,
      kind: c.kind,
      legs: c.parts.map((p) => ({ ...p.leg, minutes: p.min })),
      steps: c.parts.map((p) => ({ mode: p.mode, text: p.shuttleFrom ? `${p.step}, departs ${tm.shuttleTime}` : p.step, min: p.min })),
      timeline: buildTimeline(c.parts, tm),
      path: c.parts.filter((p) => p.path).map((p) => p.path!),
      totalMin: Math.round((tm.arriveTs - tm.leaveTs) / 60_000),
      walkMin,
      outdoorMin,
      leaveBy: myt(tm.leaveTs).hhmm,
      leaveTs: tm.leaveTs,
      arrive: myt(tm.arriveTs).hhmm,
      arriveTs: tm.arriveTs,
      spareMin: tm.spare,
      late: tm.late,
      fareRM: fare ? Math.round(fare * 10) / 10 : null,
      free: !fare,
      insights,
      tags: [],
      pick: false,
    });
  }

  // drop options far slower than the best
  const best = Math.min(...out.map((o) => o.totalMin));
  for (let i = out.length - 1; i >= 0; i--) if (out[i].kind !== "grab" && out[i].totalMin > best * 2 + 15) out.splice(i, 1);

  // ---- Sampai pick: on time, not stalled, dry, cheap, without wasting time ----
  const score = (o: RouteOption) =>
    (o.late ? 1000 : 0) +
    (o.insights.some((i) => i.kind === "stall") ? 500 : 0) +
    o.totalMin +
    (o.spareMin != null && o.spareMin > 15 ? (o.spareMin - 15) * 0.5 : 0) +
    (o.fareRM ?? 0) * 2.5 +
    (o.insights.some((i) => i.kind === "rain" && i.tone === "warn") ? o.outdoorMin * 1.5 : 0) +
    (o.insights.some((i) => i.kind === "heat") ? o.outdoorMin * 0.8 : 0) +
    (o.walkMin > 20 ? (o.walkMin - 20) * 0.7 : 0);
  out.sort((a, b) => score(a) - score(b));
  if (out[0]) {
    const p = out[0];
    p.pick = true;
    const why: string[] = [];
    if (p.spareMin != null && !p.late) why.push(p.spareMin <= 15 ? `gets you to class with ${p.spareMin} min to spare` : "makes your class on time");
    if (p.free) why.push("costs nothing");
    else if (p.kind !== "grab" && out.some((o) => o.kind === "grab" && (o.fareRM ?? 0) > (p.fareRM ?? 0) + 5)) why.push(`about RM ${p.fareRM?.toFixed(2)}, far cheaper than Grab`);
    if (p.outdoorMin <= 5) why.push("keeps you out of the weather");
    else if (out.some((o) => o.outdoorMin >= p.outdoorMin + 8)) why.push("less time outdoors than walking");
    if (p.kind === "train") why.push("and Sampai watches the line for you");
    p.pickReason = why.length ? why.join(", ").replace(/^./, (ch) => ch.toUpperCase()) + "." : "Best balance of time, cost and comfort.";
  }
  const fastest = [...out].sort((a, b) => a.totalMin - b.totalMin)[0];
  if (fastest && !fastest.pick) fastest.tags.push("Fastest");
  return out.slice(0, 6);
}
