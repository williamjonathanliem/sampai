/**
 * Street routing on OpenStreetMap (FOSSGIS OSRM servers): real walking and driving paths and times,
 * so routes follow roads and footpaths instead of cutting through buildings.
 * Checked against Google Maps: LRT Bukit Jalil -> APU on foot is 3.3 km / 45 min in both.
 * Results are cached; if the service is down we fall back to a straight-line estimate marked approx.
 */
import { distance } from "@turf/turf";

type LatLon = { lat: number; lon: number };
export interface StreetRoute {
  meters: number;
  minutes: number;
  coords: [number, number][]; // [lon, lat]
  approx: boolean;
}

const BASE = "https://routing.openstreetmap.de";
const PROFILE = { foot: "routed-foot/route/v1/foot", car: "routed-car/route/v1/driving" } as const;
const cache = new Map<string, StreetRoute>();
const inflight = new Map<string, Promise<StreetRoute>>();

function fallback(a: LatLon, b: LatLon, mode: "foot" | "car"): StreetRoute {
  const m = distance([a.lon, a.lat], [b.lon, b.lat], { units: "meters" }) * (mode === "foot" ? 1.35 : 1.5);
  const minutes = mode === "foot" ? m / 1.3 / 60 : m / (30_000 / 60);
  return { meters: Math.round(m), minutes: Math.max(1, Math.round(minutes)), coords: [[a.lon, a.lat], [b.lon, b.lat]], approx: true };
}

export async function streetRoute(a: LatLon, b: LatLon, mode: "foot" | "car"): Promise<StreetRoute> {
  const key = `${mode}|${a.lat.toFixed(5)},${a.lon.toFixed(5)}|${b.lat.toFixed(5)},${b.lon.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const url = `${BASE}/${PROFILE[mode]}/${a.lon},${a.lat};${b.lon},${b.lat}?overview=simplified&geometries=geojson`;
      const res = await fetch(url, { headers: { "User-Agent": "Sampai/0.1 (hackathon prototype)" }, signal: AbortSignal.timeout(7000) });
      const j: any = await res.json();
      const r = j.routes?.[0];
      if (j.code !== "Ok" || !r) throw new Error(j.code ?? "no route");
      const out: StreetRoute = {
        meters: Math.round(r.distance),
        minutes: Math.max(1, Math.round(r.duration / 60)),
        coords: r.geometry.coordinates.map(([x, y]: number[]) => [+x.toFixed(5), +y.toFixed(5)]),
        approx: false,
      };
      cache.set(key, out);
      return out;
    } catch (e: any) {
      console.warn(`[osrm] ${mode} failed (${e.message}); using straight-line estimate`);
      return fallback(a, b, mode);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export const walkRoute = (a: LatLon, b: LatLon) => streetRoute(a, b, "foot");
export const driveRoute = (a: LatLon, b: LatLon) => streetRoute(a, b, "car");
