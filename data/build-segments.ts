/**
 * Builds Sampai's network data from Prasarana GTFS static zips.
 *   npm run data            (downloads fresh zips into data/raw/ if missing)
 * Output (committed): data/out/lines.json, segments.json, bus_routes.json, bus_stops.json
 */
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import * as turf from "@turf/turf";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(here, "raw");
const OUT = path.join(here, "out");
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const APU = { lat: 3.0553, lon: 101.7005 };
const BUS_RADIUS_KM = 7;

type Row = Record<string, string>;

async function zipFor(category: string) {
  const file = path.join(RAW, `${category}.zip`);
  if (!fs.existsSync(file) || process.argv.includes("--fresh")) {
    console.log(`downloading ${category}…`);
    const res = await fetch(`https://api.data.gov.my/gtfs-static/prasarana?category=${category}`);
    if (!res.ok) throw new Error(`${category}: HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return new AdmZip(file);
}

function table(zip: AdmZip, name: string): Row[] {
  const entry = zip.getEntries().find((e) => e.entryName === name || e.entryName.endsWith(`/${name}`) && !e.entryName.startsWith("__MACOSX"));
  if (!entry) return [];
  return parse(entry.getData().toString("utf8"), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
}

const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bUob\b/, "UOB").replace(/\bPwtc\b/, "PWTC").replace(/\bKlcc\b/, "KLCC").replace(/\bBk(\d)/, "BK$1").replace(/\bKl\b/, "KL").replace(/\bIoi\b/, "IOI");

async function buildRail() {
  const zip = await zipFor("rapid-rail-kl");
  const routes = table(zip, "routes.txt");
  const stops = table(zip, "stops.txt");
  const trips = table(zip, "trips.txt");
  const stopTimes = table(zip, "stop_times.txt");
  const shapes = table(zip, "shapes.txt");

  const stopById = new Map(stops.map((s) => [s.stop_id, s]));
  const shapeById = new Map<string, [number, number][]>();
  for (const p of [...shapes].sort((a, b) => +a.shape_pt_sequence - +b.shape_pt_sequence)) {
    if (!shapeById.has(p.shape_id)) shapeById.set(p.shape_id, []);
    shapeById.get(p.shape_id)!.push([+p.shape_pt_lon, +p.shape_pt_lat]);
  }

  const lines: any[] = [];
  const segments: any[] = [];

  for (const r of routes) {
    const trip = trips.find((t) => t.route_id === r.route_id && t.direction_id === "0");
    if (!trip) continue;
    const seq = stopTimes
      .filter((st) => st.trip_id === trip.trip_id)
      .sort((a, b) => +a.stop_sequence - +b.stop_sequence)
      .map((st) => stopById.get(st.stop_id))
      .filter(Boolean) as Row[];
    if (seq.length < 2) continue;

    const stations = seq.map((s) => ({ stopId: s.stop_id, name: titleCase(s.stop_name), lat: +s.stop_lat, lon: +s.stop_lon }));
    const shapeCoords = shapeById.get(trip.shape_id);
    const shapeLine = shapeCoords && shapeCoords.length > 1 ? turf.lineString(shapeCoords) : null;

    lines.push({
      lineId: r.route_id,
      shortName: r.route_short_name,
      name: r.route_long_name,
      category: r.category,
      color: `#${r.route_color}`,
      stations,
      geometry: shapeLine ? shapeLine.geometry : turf.lineString(stations.map((s) => [s.lon, s.lat])).geometry,
    });

    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      let coords: number[][] = [[a.lon, a.lat], [b.lon, b.lat]];
      if (shapeLine) {
        const sliced = turf.lineSlice(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat]), shapeLine);
        const c = sliced.geometry.coordinates;
        // sanity check: the slice should not be wildly longer than the straight line
        const straight = turf.distance([a.lon, a.lat], [b.lon, b.lat], { units: "meters" });
        const slicedLen = turf.length(sliced, { units: "meters" });
        if (c.length >= 2 && slicedLen < straight * 3 + 200) coords = c.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);
      }
      segments.push({
        segmentId: `${r.route_id}:${a.stopId}>${b.stopId}`,
        lineId: r.route_id,
        fromStop: a.stopId,
        toStop: b.stopId,
        fromName: a.name,
        toName: b.name,
        lengthM: Math.round(turf.length(turf.lineString(coords), { units: "meters" })),
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  }

  // simplify line geometries a little to keep the bundle small
  for (const l of lines) {
    const simplified = turf.simplify(turf.feature(l.geometry), { tolerance: 0.00005, highQuality: false });
    l.geometry = { type: "LineString", coordinates: (simplified.geometry as any).coordinates.map(([x, y]: number[]) => [+x.toFixed(6), +y.toFixed(6)]) };
  }

  fs.writeFileSync(path.join(OUT, "lines.json"), JSON.stringify(lines));
  fs.writeFileSync(path.join(OUT, "segments.json"), JSON.stringify(segments));
  console.log(`rail: ${lines.length} lines, ${segments.length} segments`);
  for (const l of lines) console.log(`  ${l.lineId.padEnd(4)} ${l.name} (${l.stations.length} stations)`);
}

async function buildBus() {
  const zip = await zipFor("rapid-bus-kl");
  const routes = table(zip, "routes.txt");
  const stops = table(zip, "stops.txt");
  const trips = table(zip, "trips.txt");
  const stopTimes = table(zip, "stop_times.txt");

  const near = stops.filter((s) => turf.distance([APU.lon, APU.lat], [+s.stop_lon, +s.stop_lat]) <= BUS_RADIUS_KM);
  const nearIds = new Set(near.map((s) => s.stop_id));

  const tripRoute = new Map(trips.map((t) => [t.trip_id, t.route_id]));
  const routesAtStop = new Map<string, Set<string>>();
  for (const st of stopTimes) {
    if (!nearIds.has(st.stop_id)) continue;
    const rid = tripRoute.get(st.trip_id);
    if (!rid) continue;
    if (!routesAtStop.has(st.stop_id)) routesAtStop.set(st.stop_id, new Set());
    routesAtStop.get(st.stop_id)!.add(rid);
  }
  const nearRouteIds = new Set([...routesAtStop.values()].flatMap((s) => [...s]));

  const busStops = near.map((s) => ({
    stopId: s.stop_id,
    name: titleCase(s.stop_name),
    lat: +s.stop_lat,
    lon: +s.stop_lon,
    routes: [...(routesAtStop.get(s.stop_id) ?? [])].sort(),
  }));
  const busRoutes = routes
    .filter((r) => nearRouteIds.has(r.route_id))
    .map((r) => ({ routeId: r.route_id, shortName: r.route_short_name || r.route_id, name: r.route_long_name }));

  fs.writeFileSync(path.join(OUT, "bus_stops.json"), JSON.stringify(busStops));
  fs.writeFileSync(path.join(OUT, "bus_routes.json"), JSON.stringify(busRoutes));

  // ---- bus lines: ordered stops with minute offsets, road shape and frequency timetable ----
  // One pattern per shape (the stop order a bus actually follows). Used for bus route options.
  const shapes = table(zip, "shapes.txt");
  const freqs = table(zip, "frequencies.txt");
  const calendar = table(zip, "calendar.txt");
  const stopById = new Map(stops.map((x) => [x.stop_id, x]));
  const toSec = (t: string) => {
    const [h, m, sec] = t.split(":").map(Number);
    return h * 3600 + m * 60 + (sec || 0);
  };
  const days = Object.fromEntries(calendar.map((c) => [c.service_id, ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d, i) => (c[d] === "1" ? i + 1 : 0)).filter(Boolean)]));
  const shapePts = new Map<string, [number, number][]>();
  for (const p of [...shapes].sort((x, y) => +x.shape_pt_sequence - +y.shape_pt_sequence)) {
    if (!shapePts.has(p.shape_id)) shapePts.set(p.shape_id, []);
    shapePts.get(p.shape_id)!.push([+(+p.shape_pt_lon).toFixed(6), +(+p.shape_pt_lat).toFixed(6)]);
  }
  const timesByTrip = new Map<string, Row[]>();
  for (const st of stopTimes) {
    if (!timesByTrip.has(st.trip_id)) timesByTrip.set(st.trip_id, []);
    timesByTrip.get(st.trip_id)!.push(st);
  }
  const busLines: any[] = [];
  for (const r of routes.filter((x) => nearRouteIds.has(x.route_id))) {
    const rTrips = trips.filter((t) => t.route_id === r.route_id);
    for (const shapeId of [...new Set(rTrips.map((t) => t.shape_id))]) {
      const sTrips = rTrips.filter((t) => t.shape_id === shapeId);
      const rep = sTrips.find((t) => timesByTrip.has(t.trip_id));
      if (!rep) continue;
      const seq = timesByTrip.get(rep.trip_id)!.sort((x, y) => +x.stop_sequence - +y.stop_sequence);
      const t0 = toSec(seq[0].departure_time || seq[0].arrival_time);
      const lineStops = seq
        .map((st) => {
          const s0 = stopById.get(st.stop_id);
          return s0 ? { stopId: st.stop_id, name: titleCase(s0.stop_name).replace(/^(Kl|Sl|Bp)\d+\s+/i, ""), lat: +s0.stop_lat, lon: +s0.stop_lon, offsetMin: Math.round((toSec(st.arrival_time) - t0) / 60) } : null;
        })
        .filter(Boolean);
      // frequency windows per service (weekday/weekend): first departure, last departure, headway
      const windows = sTrips.flatMap((t) =>
        freqs.filter((f) => f.trip_id === t.trip_id).map((f) => ({ days: days[t.service_id] ?? [], start: Math.round(toSec(f.start_time) / 60), end: Math.round(toSec(f.end_time) / 60), headwayMin: Math.round(+f.headway_secs / 60) })),
      );
      const shape = shapePts.get(shapeId) ?? [];
      const simplified = shape.length > 2 ? (turf.simplify(turf.lineString(shape), { tolerance: 0.00004 }).geometry.coordinates as [number, number][]) : shape;
      busLines.push({ routeId: r.route_id, shortName: r.route_short_name || r.route_id, name: r.route_long_name, color: r.route_color ? `#${r.route_color}` : "#2e8a5c", shapeId, stops: lineStops, windows, shape: simplified.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]) });
    }
  }
  fs.writeFileSync(path.join(OUT, "bus_lines.json"), JSON.stringify(busLines));
  console.log(`bus lines: ${busLines.length} patterns, ${Math.round(JSON.stringify(busLines).length / 1024)} KB`);
  console.log(`bus: ${busRoutes.length} routes and ${busStops.length} stops within ${BUS_RADIUS_KM} km of APU`);
}

await buildRail();
await buildBus();
