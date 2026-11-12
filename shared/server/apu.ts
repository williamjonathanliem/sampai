/**
 * APSpace data (APU's student portal). Both feeds are public and need no login.
 *  - Timetable for every intake (gzip JSON on S3)
 *  - APU shuttle schedule (transix)
 */
import zlib from "node:zlib";
import { myt, hhmmToMin, minToHhmm, mytToEpoch } from "../time";
import stopsJson from "../../data/shuttle_stops.json";
import { distance } from "@turf/turf";
import { driveRoute } from "./osrm";

const TIMETABLE_URL = "https://s3-ap-southeast-1.amazonaws.com/open-ws/weektimetable";
const SHUTTLE_URL = "https://api.apiit.edu.my/transix-v2/schedule/active";
const TTL = 30 * 60_000;

interface RawClass {
  INTAKE: string;
  MODID: string;
  MODULE_NAME: string;
  DAY: string;
  LOCATION: string;
  ROOM: string;
  NAME: string;
  TIME_FROM_ISO: string;
  TIME_TO_ISO: string;
  DATESTAMP_ISO: string;
  GROUPING?: string;
}

export interface ApuClass {
  intake: string;
  module: string;
  moduleCode: string;
  lecturer: string;
  room: string;
  date: string; // YYYY-MM-DD (MYT)
  start: string; // HH:MM
  end: string;
  startTs: number;
  online: boolean;
  group?: string;
}

let ttCache: { at: number; rows: RawClass[] } | null = null;
let shuttleCache: { at: number; data: any } | null = null;

async function fetchJsonMaybeGzip(url: string) {
  const res = await fetch(url, { headers: { "Accept-Encoding": "gzip" } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
  return JSON.parse(text);
}

async function timetable(): Promise<RawClass[]> {
  if (ttCache && Date.now() - ttCache.at < TTL) return ttCache.rows;
  try {
    const rows = (await fetchJsonMaybeGzip(TIMETABLE_URL)) as RawClass[];
    ttCache = { at: Date.now(), rows };
  } catch (e: any) {
    console.warn(`[apu] timetable fetch failed: ${e.message}`);
    if (!ttCache) ttCache = { at: Date.now() - TTL + 60_000, rows: [] };
  }
  return ttCache.rows;
}

const isOnline = (r: RawClass) => /^ONL/i.test(r.ROOM) || /online/i.test(r.MODID) || r.LOCATION === "ONL";

function toClass(r: RawClass): ApuClass {
  return {
    intake: r.INTAKE,
    module: r.MODULE_NAME,
    moduleCode: r.MODID,
    lecturer: titleName(r.NAME),
    room: r.ROOM,
    date: r.DATESTAMP_ISO,
    start: r.TIME_FROM_ISO.slice(11, 16),
    end: r.TIME_TO_ISO.slice(11, 16),
    startTs: Date.parse(r.TIME_FROM_ISO),
    online: isOnline(r),
    group: r.GROUPING,
  };
}

function titleName(s: string) {
  return (s || "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bBinti\b/g, "binti").replace(/\bBin\b/g, "bin").replace(/\bA\/L\b/gi, "a/l").replace(/\bA\/P\b/gi, "a/p");
}

export async function listIntakes(q = ""): Promise<string[]> {
  const rows = await timetable();
  const set = new Set(rows.map((r) => r.INTAKE));
  const all = [...set].sort();
  const up = q.trim().toUpperCase();
  return up ? all.filter((i) => i.includes(up)).slice(0, 30) : all;
}

export async function classesForIntake(intake: string, opts: { group?: string } = {}): Promise<ApuClass[]> {
  const rows = await timetable();
  const up = intake.trim().toUpperCase();
  const seen = new Set<string>();
  return rows
    .filter((r) => r.INTAKE === up && (!opts.group || !r.GROUPING || r.GROUPING === opts.group))
    .map(toClass)
    // shared lectures appear once per group; keep one copy
    .filter((c) => {
      const k = `${c.moduleCode}|${c.startTs}`;
      return seen.has(k) ? false : (seen.add(k), true);
    })
    .sort((a, b) => a.startTs - b.startTs);
}

/** Tutorial groups for an intake (APSpace lists every group's classes; each student attends one). */
export async function groupsForIntake(intake: string) {
  const rows = await timetable();
  const up = intake.trim().toUpperCase();
  const mine = rows.filter((r) => r.INTAKE === up && r.GROUPING);
  const groups = [...new Set(mine.map((r) => r.GROUPING!))].sort();
  // a class only one group attends helps a student recognise their group
  return groups.map((g) => {
    const own = mine
      .filter((r) => r.GROUPING === g && !mine.some((o) => o.GROUPING !== g && o.MODID === r.MODID && o.TIME_FROM_ISO === r.TIME_FROM_ISO))
      .map(toClass)
      .filter((c) => c.startTs > Date.now() - 7 * 86_400_000)
      .sort((a, b) => a.startTs - b.startTs);
    const ex = own[0];
    return { group: g, example: ex ? `${ex.module.replace(/\s+\(.*\)$/, "")}, ${new Date(ex.startTs).toLocaleDateString("en-GB", { timeZone: "Asia/Kuala_Lumpur", weekday: "short" })} ${ex.start}, ${ex.room}` : null };
  });
}

/** Next on-campus class for the student's group that starts after `fromTs` (default now). */
export async function nextCampusClass(intake: string, fromTs = Date.now(), group?: string | null): Promise<ApuClass | null> {
  const list = await classesForIntake(intake, { group: group || undefined });
  return list.find((c) => !c.online && c.startTs > fromTs) ?? null;
}

export async function timetableStatus() {
  const rows = await timetable();
  return { rows: rows.length, fetchedAt: ttCache?.at ?? null };
}

// ---------------- shuttle ----------------

export interface ShuttleTrip {
  from: string;
  to: string;
  time: string; // HH:MM
  day: string; // mon-fri, fri, sat ...
}

async function shuttleRaw() {
  if (shuttleCache && Date.now() - shuttleCache.at < TTL) return shuttleCache.data;
  try {
    const res = await fetch(SHUTTLE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    shuttleCache = { at: Date.now(), data: await res.json() };
  } catch (e: any) {
    console.warn(`[apu] shuttle fetch failed: ${e.message}`);
    if (!shuttleCache) shuttleCache = { at: Date.now() - TTL + 60_000, data: { trips: [] } };
  }
  return shuttleCache.data;
}

const dayMatches = (day: string, dow: number) => {
  const d = (day || "").toLowerCase();
  const names = ["", "mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  if (d === "mon-fri") return dow >= 1 && dow <= 5;
  if (d === "mon-sat") return dow >= 1 && dow <= 6;
  if (d === "everyday" || d === "daily" || d === "") return true;
  return d.split(/[,\s]+/).includes(names[dow]);
};

export async function shuttleTrips(from?: string, to?: string): Promise<ShuttleTrip[]> {
  const data = await shuttleRaw();
  const trips: ShuttleTrip[] = (data?.trips ?? []).map((t: any) => ({
    from: t.trip_from?.name ?? "",
    to: t.trip_to?.name ?? "",
    time: String(t.time ?? "").slice(11, 16),
    day: t.day ?? "",
  }));
  return trips
    .filter((t) => (!from || t.from.toLowerCase() === from.toLowerCase()) && (!to || t.to.toLowerCase() === to.toLowerCase()))
    .sort((a, b) => hhmmToMin(a.time) - hhmmToMin(b.time));
}

/** Next shuttle departures from `from` to APU at or after `afterMin` (minutes of day, MYT). */
export async function nextShuttles(from = "LRT - Bukit Jalil", afterMin?: number, count = 3, ts = Date.now()) {
  const now = myt(ts);
  const after = afterMin ?? now.minutes;
  const trips = await shuttleTrips(from, "APU");
  return trips.filter((t) => dayMatches(t.day, now.dow) && hhmmToMin(t.time) >= after).slice(0, count);
}


// ---------------- shuttle plan (traffic-aware) ----------------

export const shuttleStops = (stopsJson as { stops: { name: string; label: string; lat: number; lon: number; approx?: boolean }[] }).stops;
const APU_PT = { lat: 3.055899, lon: 101.699959 };
const ROUTES_KEY = process.env.ROUTES_API_KEY || "";
const rideCache = new Map<string, { at: number; min: number; source: string }>();

/** Traffic factor by hour of day (MYT), weekdays. Peak commute hours are much slower around Bukit Jalil / TPM. */
export function trafficFactor(ts: number) {
  const t = myt(ts);
  const m = t.minutes;
  const weekend = t.dow >= 6;
  if (weekend) return 1.1;
  if ((m >= 7 * 60 && m < 9 * 60 + 30) || (m >= 16 * 60 + 30 && m < 19 * 60)) return 1.9; // peak
  if ((m >= 9 * 60 + 30 && m < 10 * 60 + 30) || (m >= 12 * 60 && m < 14 * 60) || (m >= 15 * 60 + 30 && m < 16 * 60 + 30)) return 1.45; // shoulder / lunch
  return 1.2;
}

/** Minutes for the shuttle ride from a stop to APU departing at `departTs`. Google Routes (traffic-aware) when a key exists, else an hour-of-day estimate. */
export async function shuttleRideMinutes(stopName: string, departTs: number, raining = false): Promise<{ min: number; source: "routes-api" | "estimate" }> {
  const stop = shuttleStops.find((s) => s.name.toLowerCase() === stopName.toLowerCase()) ?? shuttleStops[0];
  const slot = Math.floor(departTs / 900_000);
  const key = `${stop.name}|${slot}|${raining}`;
  const hit = rideCache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return { min: hit.min, source: hit.source as any };

  if (ROUTES_KEY) {
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": ROUTES_KEY, "X-Goog-FieldMask": "routes.duration" },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: stop.lat, longitude: stop.lon } } },
          destination: { location: { latLng: { latitude: APU_PT.lat, longitude: APU_PT.lon } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          departureTime: new Date(Math.max(departTs, Date.now() + 60_000)).toISOString(),
        }),
        signal: AbortSignal.timeout(5000),
      });
      const j: any = await res.json();
      const sec = parseInt(j.routes?.[0]?.duration ?? "");
      if (sec) {
        // + boarding and the campus drop-off loop
        const min = Math.round(sec / 60) + 4 + (raining ? 3 : 0);
        rideCache.set(key, { at: Date.now(), min, source: "routes-api" });
        return { min, source: "routes-api" };
      }
    } catch {
      /* fall back to the estimate */
    }
  }
  // free-flow driving time on real streets (OpenStreetMap) + boarding and the campus drop-off loop
  const drive = await driveRoute(stop, APU_PT);
  const base = (drive.approx ? 6 + distance([stop.lon, stop.lat], [APU_PT.lon, APU_PT.lat]) * 2.5 : drive.minutes + 4);
  const min = Math.max(8, Math.round(base * trafficFactor(departTs)) + (raining ? 3 : 0));
  rideCache.set(key, { at: Date.now(), min, source: "estimate" });
  return { min, source: "estimate" };
}

export interface ShuttlePlan {
  from: string;
  shuttle: string | null; // departure HH:MM to catch
  rideMin: number | null;
  arrive: string | null;
  leaveBy: string | null;
  leaveTs: number | null;
  late: boolean; // no shuttle on the class day gets there in time
  tooLate: { shuttle: string; arrive: string } | null; // the next shuttle, which would be late
  source: "routes-api" | "estimate";
}

/**
 * Works backwards from the class: the latest shuttle whose (traffic-adjusted) arrival is at least
 * `bufferMin` before class, then when to leave home given `preMin` minutes of travel before the stop.
 */
export async function planShuttle(from: string, classTs: number, preMin: number, opts: { bufferMin?: number; raining?: boolean; now?: number } = {}): Promise<ShuttlePlan> {
  const buffer = opts.bufferMin ?? 3;
  const now = opts.now ?? Date.now();
  const day = myt(classTs);
  const trips = (await shuttleTrips(from, "APU")).filter((t) => dayMatches(t.day, day.dow));
  const rows = await Promise.all(
    trips.map(async (t) => {
      const dep = mytToEpoch(day.date, t.time);
      const ride = await shuttleRideMinutes(from, dep, opts.raining);
      return { t, dep, ride, arr: dep + ride.min * 60_000 };
    }),
  );
  const ok = rows.filter((r) => r.arr <= classTs - buffer * 60_000 && r.dep - (preMin + 2) * 60_000 >= now - 60_000);
  const best = ok[ok.length - 1] ?? null;
  const next = rows.find((r) => r.dep > (best?.dep ?? now) && r.arr > classTs - buffer * 60_000) ?? null;
  const src = (best ?? next)?.ride.source ?? "estimate";
  if (!best) {
    // nothing makes it: catch the first shuttle you can still reach
    const reachable = rows.find((r) => r.dep - (preMin + 2) * 60_000 >= now - 60_000) ?? null;
    return {
      from,
      shuttle: reachable?.t.time ?? null,
      rideMin: reachable?.ride.min ?? null,
      arrive: reachable ? myt(reachable.arr).hhmm : null,
      leaveBy: reachable ? myt(reachable.dep - (preMin + 2) * 60_000).hhmm : null,
      leaveTs: reachable ? reachable.dep - (preMin + 2) * 60_000 : null,
      late: true,
      tooLate: null,
      source: src,
    };
  }
  const leaveTs = best.dep - (preMin + 2) * 60_000;
  return {
    from,
    shuttle: best.t.time,
    rideMin: best.ride.min,
    arrive: myt(best.arr).hhmm,
    leaveBy: myt(leaveTs).hhmm,
    leaveTs,
    late: false,
    tooLate: next ? { shuttle: next.t.time, arrive: myt(next.arr).hhmm } : null,
    source: src,
  };
}

export { minToHhmm, hhmmToMin };

/** First shuttle from `from` to APU departing at or after `readyTs` (same MYT day), with its traffic-adjusted ride. */
export async function nextShuttleAfter(from: string, readyTs: number, raining = false): Promise<{ depTs: number; time: string; rideMin: number; arriveTs: number } | null> {
  const day = myt(readyTs);
  const trips = (await shuttleTrips(from, "APU")).filter((t) => dayMatches(t.day, day.dow));
  for (const t of trips) {
    const depTs = mytToEpoch(day.date, t.time);
    if (depTs < readyTs) continue;
    const ride = await shuttleRideMinutes(from, depTs, raining);
    return { depTs, time: t.time, rideMin: ride.min, arriveTs: depTs + ride.min * 60_000 };
  }
  return null;
}
