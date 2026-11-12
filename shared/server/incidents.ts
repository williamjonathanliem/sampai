import { db } from "./firebase";
import { publish } from "./pubsub";
import { bqInsert } from "./bigquery";
import { getConditions } from "./conditions";
import type { Confidence, Incident } from "../types";
import { lineById, segmentById, stationById } from "../network";

export const confidenceFor = (riders: number): Confidence => (riders >= 5 ? "high" : riders >= 3 ? "medium" : "low");

export type IncidentChange = "started" | "worsened" | "cleared" | "updated";

function newId(prefix: string) {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export function titleFor(i: Partial<Incident>) {
  const line = i.lineName ?? (i.lineId ? lineById.get(i.lineId)?.name : null);
  if (i.type === "train_stall") return `${line ?? "Train"} stalled between ${i.fromName} and ${i.toName}`;
  if (i.type === "bus_stall") return `Bus ${i.routeId} not moving`;
  if (i.type === "bus_route") return `Buses stuck on route ${i.routeId}`;
  if (i.type === "weather") return i.title ?? "Weather warning";
  return "Disruption";
}

export async function createIncident(data: Omit<Incident, "id" | "startedAt" | "updatedAt" | "status" | "confidence"> & { confidence?: Confidence }) {
  const now = Date.now();
  const cond = await getConditions().catch(() => null);
  const seg = data.segmentId ? segmentById.get(data.segmentId) : null;
  const inc: Incident = {
    ...data,
    id: newId(data.type === "weather" ? "WX" : data.type === "train_stall" ? "TR" : "BUS"),
    status: "active",
    startedAt: now,
    updatedAt: now,
    clearedAt: null,
    confidence: data.confidence ?? confidenceFor(data.riderCount),
    lineName: data.lineName ?? (data.lineId ? lineById.get(data.lineId)?.name ?? null : null),
    fromName: data.fromName ?? (seg ? stationById.get(seg.fromStop)?.name : null) ?? null,
    toName: data.toName ?? (seg ? stationById.get(seg.toStop)?.name : null) ?? null,
    geometry: data.geometry ?? seg?.geometry ?? null,
    weatherAtStart: cond
      ? { apparentTemp: cond.heat?.apparentTemp ?? null, rainProb: cond.rain?.probNextHour ?? null, metWarning: (cond.metWarnings ?? []).some((w) => w.affectsKL) }
      : null,
  };
  inc.title = inc.title ?? titleFor(inc);
  // Firestore can't store nested arrays (LineString coordinates), so geometry is stored as JSON text.
  await db.doc(`incidents/${inc.id}`).set(toFirestore(inc));
  await logState(inc, "started");
  await publish("incidents", { id: inc.id, change: "started" });
  console.log(`[incident] started ${inc.id} ${inc.title} riders=${inc.riderCount}`);
  return inc;
}

export async function updateIncident(id: string, patch: Partial<Incident>, change: IncidentChange) {
  const now = Date.now();
  const p: Partial<Incident> = { ...patch, updatedAt: now };
  if (change === "cleared") {
    p.status = "cleared";
    p.clearedAt = now;
  }
  if (typeof p.riderCount === "number" && !p.confidence) p.confidence = confidenceFor(p.riderCount);
  await db.doc(`incidents/${id}`).set(toFirestore(p as Incident), { merge: true });
  const full = await getIncident(id);
  if (full) await logState(full, change);
  if (change !== "updated") await publish("incidents", { id, change });
  console.log(`[incident] ${change} ${id}`);
  return full;
}

export async function getIncident(id: string): Promise<Incident | null> {
  const s = await db.doc(`incidents/${id}`).get();
  return s.exists ? fromFirestore(s.data()) : null;
}

export function toFirestore(i: Partial<Incident>): any {
  const out: any = { ...i };
  if (i.geometry !== undefined) out.geometry = i.geometry ? JSON.stringify(i.geometry) : null;
  return out;
}
export function fromFirestore(d: any): Incident {
  return { ...d, geometry: typeof d?.geometry === "string" ? JSON.parse(d.geometry) : d?.geometry ?? null } as Incident;
}

async function logState(i: Incident, change: IncidentChange) {
  const durationMin = i.clearedAt ? Math.round((i.clearedAt - i.startedAt) / 60000) : null;
  await bqInsert("incidents", [
    {
      id: i.id,
      change,
      type: i.type,
      line_id: i.lineId ?? null,
      line_name: i.lineName ?? null,
      route_id: i.routeId ?? null,
      segment_id: i.segmentId ?? null,
      from_stop: i.fromName ?? null,
      to_stop: i.toName ?? null,
      started_at: new Date(i.startedAt).toISOString(),
      cleared_at: i.clearedAt ? new Date(i.clearedAt).toISOString() : null,
      duration_min: durationMin,
      rider_count: i.riderCount,
      confidence: i.confidence,
      source: i.source,
      apparent_temp: i.weatherAtStart?.apparentTemp ?? null,
      rain_prob: i.weatherAtStart?.rainProb ?? null,
      met_warning: i.weatherAtStart?.metWarning ?? false,
      simulated: i.simulated,
      logged_at: new Date().toISOString(),
    },
  ]);
}
