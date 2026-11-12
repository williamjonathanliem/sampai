/**
 * Builds reroute options for one student and one incident.
 * Sources: Google Routes API (if ROUTES_API_KEY), the fallback table in data/alternatives.json,
 * the APU shuttle schedule (APSpace) and the taxi fare formula in data/config.json.
 */
import alternatives from "../../data/alternatives.json";
import config from "../../data/config.json";
import { distance } from "@turf/turf";
import type { AlertOption, Conditions, Incident, UserDoc } from "../types";
import { APU, stationById, lineById } from "../network";
import { minToHhmm, myt } from "../time";
import { nextShuttles, shuttleRideMinutes } from "./apu";
import { mytToEpoch, hhmmToMin } from "../time";

const ROUTES_KEY = process.env.ROUTES_API_KEY || "";

export interface TripContext {
  now: number;
  classStartTs: number | null;
  conditions: Conditions | null;
  origin: { lat: number; lon: number; label: string } | null; // where the student is (or will be) when they reroute
}

export function grabFare(km: number, min: number, raining: boolean) {
  const f = config.grabFare;
  const raw = Math.max(f.min, f.base + f.perKm * km + f.perMin * min);
  return Math.round((raining ? raw * f.surgeWhenRaining : raw) * 10) / 10;
}

export function grabUrl(to = APU) {
  // Grab has no public booking API. The app link opens Grab if installed; the page falls back to the web.
  return `https://www.grab.com/my/transport/?dropoff=${to.lat},${to.lon}`;
}

function routeMinutes(user: UserDoc) {
  return (user.route?.legs ?? []).reduce((s, l) => s + (l.minutes ?? 0), 0) || 25;
}

/** Driving estimate. Uses Routes API DRIVE + TRAFFIC_AWARE when a key exists, otherwise distance x road factor. */
export async function driveEstimate(from: { lat: number; lon: number }, raining: boolean): Promise<{ km: number; min: number; jam: boolean; source: string }> {
  if (ROUTES_KEY) {
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": ROUTES_KEY, "X-Goog-FieldMask": "routes.duration,routes.staticDuration,routes.distanceMeters" },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
          destination: { location: { latLng: { latitude: APU.lat, longitude: APU.lon } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
        }),
        signal: AbortSignal.timeout(5000),
      });
      const j: any = await res.json();
      const r = j.routes?.[0];
      if (r) {
        const min = parseInt(r.duration) / 60;
        const staticMin = parseInt(r.staticDuration ?? r.duration) / 60;
        return { km: r.distanceMeters / 1000, min: Math.round(min), jam: min > staticMin * 1.4, source: "routes-api" };
      }
    } catch (e: any) {
      console.warn(`[routes] drive failed: ${e.message}`);
    }
  }
  const km = distance([from.lon, from.lat], [APU.lon, APU.lat]) * 1.4;
  const kmh = raining ? 18 : 26;
  return { km: Math.round(km * 10) / 10, min: Math.max(5, Math.round((km / kmh) * 60) + 3), jam: false, source: "estimate" };
}

/** Transit alternatives from Google that avoid the stalled line. Empty array when unavailable. */
async function googleTransit(ctx: TripContext, incident: Incident): Promise<AlertOption[]> {
  if (!ROUTES_KEY || !ctx.origin) return [];
  try {
    const body: any = {
      origin: { location: { latLng: { latitude: ctx.origin.lat, longitude: ctx.origin.lon } } },
      destination: { location: { latLng: { latitude: APU.lat, longitude: APU.lon } } },
      travelMode: "TRANSIT",
      computeAlternativeRoutes: true,
      departureTime: new Date(ctx.now + 60_000).toISOString(),
      transitPreferences: { allowedTravelModes: ["BUS", "LIGHT_RAIL", "SUBWAY", "TRAIN"], routingPreference: "FEWER_TRANSFERS" },
    };
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": ROUTES_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.legs.steps.transitDetails.transitLine.nameShort,routes.legs.steps.transitDetails.transitLine.name,routes.legs.steps.transitDetails.stopDetails.departureStop.name,routes.legs.steps.travelMode",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    const j: any = await res.json();
    const lineName = (lineById.get(incident.lineId ?? "")?.name ?? "").toLowerCase();
    const stalled = [incident.fromName, incident.toName].filter(Boolean).map((s) => s!.toLowerCase());
    const out: AlertOption[] = [];
    for (const [i, r] of (j.routes ?? []).entries()) {
      const steps = (r.legs ?? []).flatMap((l: any) => l.steps ?? []).filter((s: any) => s.transitDetails);
      const names = steps.map((s: any) => s.transitDetails.transitLine?.nameShort || s.transitDetails.transitLine?.name || "transit");
      const usesStalled = steps.some((s: any) => {
        const n = `${s.transitDetails.transitLine?.name ?? ""}`.toLowerCase();
        const stop = `${s.transitDetails.stopDetails?.departureStop?.name ?? ""}`.toLowerCase();
        return (lineName && n.includes(lineName.replace(" line", ""))) && stalled.some((x) => stop.includes(x));
      });
      if (usesStalled || !steps.length) continue;
      const eta = Math.round(parseInt(r.duration) / 60);
      out.push(mkOption(ctx, { id: `google-${i}`, type: steps[0]?.travelMode === "TRANSIT" ? "bus" : "rail", label: names.join(" → "), detail: "Google Routes transit alternative" }, eta));
    }
    return out.slice(0, 2);
  } catch (e: any) {
    console.warn(`[routes] transit failed: ${e.message}`);
    return [];
  }
}

function mkOption(ctx: TripContext, base: Omit<AlertOption, "etaMinutes" | "arrivalTime" | "onTime">, etaMinutes: number): AlertOption {
  const arr = ctx.now + etaMinutes * 60_000;
  return {
    ...base,
    etaMinutes,
    arrivalTime: myt(arr).hhmm,
    onTime: ctx.classStartTs ? arr <= ctx.classStartTs : true,
  };
}

export async function buildOptions(incident: Incident, user: UserDoc, ctx: TripContext): Promise<AlertOption[]> {
  const raining = !!(ctx.conditions?.rain?.advisory || ctx.conditions?.metWarnings?.some((w) => w.affectsKL));
  const hot = !!ctx.conditions?.heat?.advisory;
  const table = incident.type === "weather" ? (alternatives as any)._weather : (alternatives as any)[incident.segmentId ?? ""] ?? (alternatives as any)._default;
  const baseMin = routeMinutes(user);
  const opts: AlertOption[] = [];

  // Where to start the taxi from: the alternative's pickup, else the station before the stall, else home
  const stallStation = stationById.get(incident.fromStop ?? "") ?? null;

  for (const alt of table as any[]) {
    if (alt.type === "grab") {
      const from = alt.from ?? (stallStation ? { lat: stallStation.lat, lon: stallStation.lon } : ctx.origin ?? user.homeLocation ?? APU);
      const drive = await driveEstimate(from, raining);
      const o = mkOption(ctx, { id: alt.id, type: "grab", label: alt.label, detail: `${drive.km} km, about ${drive.min} min by car${drive.jam ? " (heavy traffic)" : ""}${raining ? ", rain surge likely" : ""}`, fareEstimate: grabFare(drive.km, drive.min, raining), grabUrl: grabUrl() }, Math.round(baseMin * 0.4) + drive.min);
      opts.push(o);
    } else if (alt.type === "walk") {
      const covered = raining || hot || alt.walkId === "bj-covered";
      const extra = alt.extraMinutes + (raining ? 4 : 0);
      const why = raining ? "covered path, rain expected" : hot ? `shaded path, feels like ${ctx.conditions?.heat?.apparentTemp ?? 35}°C` : "covered path";
      opts.push(mkOption(ctx, { id: alt.id, type: "walk", label: alt.label, detail: why, walkId: covered ? "bj-covered" : "bj-direct", covered }, baseMin + extra));
    } else if (alt.type === "bus") {
      opts.push(mkOption(ctx, { id: alt.id, type: "bus", label: alt.label, detail: alt.detail }, baseMin + alt.extraMinutes + (raining ? 5 : 0)));
    } else {
      opts.push(mkOption(ctx, { id: alt.id, type: alt.type, label: alt.label, detail: alt.detail }, baseMin + alt.extraMinutes));
    }
  }

  // Attach the real next APU shuttle to options that end at Bukit Jalil LRT
  try {
    const usesShuttle = (user.route?.legs ?? []).some((l) => l.mode === "shuttle");
    if (usesShuttle) {
      for (const o of opts) {
        // only options that still end at Bukit Jalil LRT need the shuttle (T580 and walks go straight to campus)
        if (o.type !== "wait" && o.type !== "rail" && o.type !== "shuttle") continue;
        // reach LRT Bukit Jalil, wait for the next real shuttle, then a traffic-adjusted ride
        const firstRide = await shuttleRideMinutes("LRT - Bukit Jalil", ctx.now + o.etaMinutes * 60_000, raining);
        const atStopMin = myt(ctx.now).minutes + o.etaMinutes - firstRide.min;
        const [next] = await nextShuttles("LRT - Bukit Jalil", atStopMin, 1, ctx.now);
        if (next) {
          const dep = mytToEpoch(myt(ctx.now).date, next.time);
          const ride = await shuttleRideMinutes("LRT - Bukit Jalil", dep, raining);
          o.detail = `${o.detail ? o.detail.replace(/\.$/, "") + ". " : ""}APU shuttle ${next.time} from LRT Bukit Jalil, about ${ride.min} min ride`;
          const newEta = hhmmToMin(next.time) + ride.min - myt(ctx.now).minutes;
          if (newEta > o.etaMinutes) Object.assign(o, mkOption(ctx, o, newEta));
        }
      }
    }
  } catch {
    /* shuttle feed optional */
  }

  const google = await googleTransit(ctx, incident);
  const all = [...google, ...opts];
  // de-dup by id, keep order, max 4
  const seen = new Set<string>();
  return all.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true))).slice(0, 4);
}

export { minToHhmm };
