import linesJson from "../data/out/lines.json";
import segmentsJson from "../data/out/segments.json";
import busRoutesJson from "../data/out/bus_routes.json";
import busStopsJson from "../data/out/bus_stops.json";
import { nearestPointOnLine, point, lineString, distance } from "@turf/turf";
import type { Line, Segment, RouteLeg, UserRoute } from "./types";

export const lines = linesJson as unknown as Line[];
export const segments = segmentsJson as unknown as Segment[];
export const busRoutes = busRoutesJson as { routeId: string; shortName: string; name: string }[];
export const busStops = busStopsJson as { stopId: string; name: string; lat: number; lon: number; routes: string[] }[];

export const lineById = new Map(lines.map((l) => [l.lineId, l]));
export const segmentById = new Map(segments.map((s) => [s.segmentId, s]));
export const stationById = new Map(lines.flatMap((l) => l.stations.map((s) => [s.stopId, { ...s, lineId: l.lineId }] as const)));

export const APU = { lat: 3.055899, lon: 101.699959 };

const segsByLine = new Map<string, Segment[]>();
for (const s of segments) {
  if (!segsByLine.has(s.lineId)) segsByLine.set(s.lineId, []);
  segsByLine.get(s.lineId)!.push(s);
}

export function segmentsOfLine(lineId: string) {
  return segsByLine.get(lineId) ?? [];
}

export interface Snap {
  segment: Segment;
  distToLineM: number;
  distToStationM: number;
  nearestStationId: string;
  progress: number; // 0..1 along the segment from fromStop
}

/** Snap a point to the nearest segment of a line. */
export function snapToLine(lineId: string, lat: number, lon: number): Snap | null {
  const segs = segmentsOfLine(lineId);
  if (!segs.length) return null;
  const p = point([lon, lat]);
  let best: Snap | null = null;
  for (const seg of segs) {
    const ls = lineString(seg.geometry.coordinates);
    const np = nearestPointOnLine(ls, p, { units: "meters" });
    const d = np.properties.dist ?? Infinity;
    if (!best || d < best.distToLineM) {
      const from = stationById.get(seg.fromStop)!;
      const to = stationById.get(seg.toStop)!;
      const dFrom = distance(p, point([from.lon, from.lat]), { units: "meters" });
      const dTo = distance(p, point([to.lon, to.lat]), { units: "meters" });
      best = {
        segment: seg,
        distToLineM: d,
        distToStationM: Math.min(dFrom, dTo),
        nearestStationId: dFrom < dTo ? seg.fromStop : seg.toStop,
        progress: seg.lengthM ? Math.min(1, Math.max(0, (np.properties.location ?? 0) / seg.lengthM)) : 0,
      };
    }
  }
  return best;
}

/** Segment ids covered by a rail leg between two stations on the same line (either direction). */
export function segmentsBetween(lineId: string, fromStop: string, toStop: string): string[] {
  const line = lineById.get(lineId);
  if (!line) return [];
  const ids = line.stations.map((s) => s.stopId);
  let a = ids.indexOf(fromStop), b = ids.indexOf(toStop);
  if (a < 0 || b < 0) return [];
  if (a > b) [a, b] = [b, a];
  const out: string[] = [];
  for (let i = a; i < b; i++) out.push(`${lineId}:${ids[i]}>${ids[i + 1]}`);
  return out;
}

export function routeFromLegs(legs: RouteLeg[]): UserRoute {
  const segs: string[] = [];
  const bus: string[] = [];
  const lns: string[] = [];
  for (const l of legs) {
    if (l.mode === "rail" && l.lineId && l.fromStop && l.toStop) {
      segs.push(...segmentsBetween(l.lineId, l.fromStop, l.toStop));
      lns.push(l.lineId);
    }
    if (l.mode === "bus" && l.routeId) bus.push(l.routeId);
  }
  return { legs, segments: segs, busRoutes: bus, lines: [...new Set(lns)] };
}

/** Point at fraction t (0..1) along a segment's geometry. */
export function pointAlong(seg: Segment, t: number): { lat: number; lon: number } {
  const c = seg.geometry.coordinates;
  const lens: number[] = [0];
  for (let i = 1; i < c.length; i++) lens.push(lens[i - 1] + distance(c[i - 1], c[i], { units: "meters" }));
  const total = lens[lens.length - 1] || 1;
  const target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < c.length; i++) {
    if (lens[i] >= target) {
      const f = (target - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
      return { lon: c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f, lat: c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f };
    }
  }
  return { lon: c[c.length - 1][0], lat: c[c.length - 1][1] };
}

export function stationName(stopId?: string | null) {
  return (stopId && stationById.get(stopId)?.name) || stopId || "";
}
