/**
 * Bus stall detection from Rapid KL GTFS Realtime (section 7.3).
 * Positions come from /poll/bus (GTFS-R) or the simulator via the bus-positions topic.
 */
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { distance } from "@turf/turf";
import { cfg } from "../config";
import { busRoutes, busStops } from "../../../shared/network";
import { db } from "../../../shared/server/firebase";
import { createIncident, updateIncident } from "../../../shared/server/incidents";

const FEEDS = [
  "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-kl",
  "https://api.data.gov.my/gtfs-realtime/vehicle-position/prasarana?category=rapid-bus-mrtfeeder",
];
const watchedRoutes = new Set(busRoutes.map((r) => r.routeId));

export interface Vehicle {
  id: string;
  routeId: string;
  lat: number;
  lon: number;
  ts: number;
  simulated?: boolean;
}

interface Track {
  v: Vehicle;
  anchor: { lat: number; lon: number; t: number }; // where it has been sitting since t
  stuck: boolean;
}

const tracks = new Map<string, Track>();
const routeIncidents = new Map<string, string>(); // routeId -> incident id
let lastPoll: { at: number; vehicles: number; watched: number; error?: string } | null = null;

export async function pollBus() {
  const vehicles: Vehicle[] = [];
  for (const url of FEEDS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
      for (const e of feed.entity) {
        const v = e.vehicle;
        if (!v?.position) continue;
        const routeId = v.trip?.routeId ?? "";
        vehicles.push({
          id: v.vehicle?.id ?? v.vehicle?.licensePlate ?? e.id,
          routeId,
          lat: v.position.latitude,
          lon: v.position.longitude,
          ts: Number(v.timestamp ?? 0) * 1000 || Date.now(),
        });
      }
    } catch (e: any) {
      lastPoll = { at: Date.now(), vehicles: 0, watched: 0, error: e.message };
      console.warn(`[bus] poll ${url} failed: ${e.message}`);
    }
  }
  const near = vehicles.filter((v) => watchedRoutes.has(v.routeId));
  lastPoll = { at: Date.now(), vehicles: vehicles.length, watched: near.length };
  await ingest(near);
  return lastPoll;
}

export function busStats() {
  return { lastPoll, tracked: tracks.size, stuck: [...tracks.values()].filter((t) => t.stuck).map((t) => ({ id: t.v.id, routeId: t.v.routeId })), routeIncidents: Object.fromEntries(routeIncidents) };
}

const nearStop = (v: Vehicle) => busStops.some((s) => s.routes.includes(v.routeId) && distance([s.lon, s.lat], [v.lon, v.lat], { units: "meters" }) < cfg.busStopRadiusM);

export async function ingest(vehicles: Vehicle[]) {
  const now = Date.now();
  for (const v of vehicles) {
    const t = tracks.get(v.id);
    if (!t) {
      tracks.set(v.id, { v, anchor: { lat: v.lat, lon: v.lon, t: now }, stuck: false });
      continue;
    }
    t.v = v;
    const moved = distance([t.anchor.lon, t.anchor.lat], [v.lon, v.lat], { units: "meters" });
    if (moved > cfg.busStuckMoveM) {
      t.anchor = { lat: v.lat, lon: v.lon, t: now };
      t.stuck = false;
    } else {
      t.stuck = now - t.anchor.t >= cfg.busStuckMs && !nearStop(v);
    }
  }
  // forget vehicles not seen for 10 min
  for (const [id, t] of tracks) if (now - t.v.ts > 10 * 60_000 && !t.v.simulated) tracks.delete(id);
  await evaluateRoutes();
  await publishLive();
}

async function evaluateRoutes() {
  const byRoute = new Map<string, Track[]>();
  for (const t of tracks.values()) {
    if (!t.stuck) continue;
    if (!byRoute.has(t.v.routeId)) byRoute.set(t.v.routeId, []);
    byRoute.get(t.v.routeId)!.push(t);
  }
  for (const [routeId, stuck] of byRoute) {
    const cluster = stuck.filter((a) => stuck.some((b) => a !== b && distance([a.v.lon, a.v.lat], [b.v.lon, b.v.lat], { units: "meters" }) <= cfg.busClusterM));
    if (cluster.length >= cfg.busRouteMinStuck && !routeIncidents.has(routeId)) {
      routeIncidents.set(routeId, "pending");
      const name = busRoutes.find((r) => r.routeId === routeId);
      const inc = await createIncident({
        type: "bus_route",
        routeId,
        riderCount: cluster.length,
        source: "gtfs-r",
        simulated: cluster.every((c) => c.v.simulated),
        title: `Buses stuck on route ${name?.shortName ?? routeId}`,
        summary: `${cluster.length} buses on ${name?.shortName ?? routeId} (${name?.name ?? ""}) have not moved for ${Math.round(cfg.busStuckMs / 60000)}+ min. Likely a jam or road closure.`,
        center: { lat: cluster[0].v.lat, lon: cluster[0].v.lon },
      });
      routeIncidents.set(routeId, inc.id);
    }
  }
  for (const [routeId, id] of routeIncidents) {
    if (id === "pending") continue;
    if (!byRoute.has(routeId) || (byRoute.get(routeId)?.length ?? 0) < cfg.busRouteMinStuck) {
      routeIncidents.delete(routeId);
      await updateIncident(id, {}, "cleared");
    }
  }
}

/** Live bus positions near APU for the map (one small doc, overwritten). */
async function publishLive() {
  const list = [...tracks.values()].slice(0, 150).map((t) => ({ id: t.v.id, routeId: t.v.routeId, lat: +t.v.lat.toFixed(5), lon: +t.v.lon.toFixed(5), stuck: t.stuck, simulated: !!t.v.simulated }));
  await db.doc("live/buses").set({ updatedAt: Date.now(), buses: list }).catch(() => null);
}

/** Simulator: drop two stuck buses on a route, or remove them. */
export async function simBus(routeId: string, action: "stall" | "clear") {
  for (const [id, t] of tracks) if (t.v.simulated && t.v.routeId === routeId) tracks.delete(id);
  if (action === "stall") {
    const stops = busStops.filter((s) => s.routes.includes(routeId));
    // pick a point between two stops so the buses are not "at a stop"
    const a = stops[Math.floor(stops.length / 2)] ?? { lat: 3.0575, lon: 101.6955 };
    const b = stops[Math.floor(stops.length / 2) + 1] ?? a;
    const mid = { lat: (a.lat + b.lat) / 2 + 0.0006, lon: (a.lon + b.lon) / 2 + 0.0006 };
    const past = Date.now() - cfg.busStuckMs - 1000;
    for (let i = 0; i < 2; i++) {
      const v: Vehicle = { id: `SIM-${routeId}-${i}`, routeId, lat: mid.lat + i * 0.0008, lon: mid.lon + i * 0.0005, ts: Date.now(), simulated: true };
      tracks.set(v.id, { v, anchor: { lat: v.lat, lon: v.lon, t: past }, stuck: !nearStop(v) });
    }
  }
  await evaluateRoutes();
  await publishLive();
}
