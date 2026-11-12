import "../../shared/server/env";
import express from "express";
import cors from "cors";
import { db, usingEmulator } from "../../shared/server/firebase";
import { publish, pubsubMode } from "../../shared/server/pubsub";
import { geminiMode, geminiJSON } from "../../shared/server/gemini";
import { bqInsert, bigqueryMode } from "../../shared/server/bigquery";
import { recomputeConditions } from "../../shared/server/conditions";
import { getIncident, toFirestore, updateIncident } from "../../shared/server/incidents";
import { listIntakes, classesForIntake, nextCampusClass, nextShuttles, shuttleTrips, timetableStatus, groupsForIntake, planShuttle, shuttleStops } from "../../shared/server/apu";
import { WORKER_URL, LOCAL, DEMO_MODE } from "../../shared/server/env";
import { segments, lineById, snapToLine, stationName } from "../../shared/network";
import os from "node:os";
import { createLetter, getLetter, renderPdf, type LetterRequest } from "./letter";
import { searchPlaces, reversePlace } from "./geo";
import { routeOptions } from "./routeOptions";
import type { Incident, Ping } from "../../shared/types";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) =>
  res.json({ service: "sampai-api", demoMode: DEMO_MODE, pubsub: pubsubMode, gemini: geminiMode, bigquery: bigqueryMode, firestore: usingEmulator ? "emulator" : "gcp" }),
);

// ---------------- sensing ----------------
const lastPingAt = new Map<string, number>();
const RATE_MS = 1500; // per real session
let pingCount = 0;

function validPing(p: any): p is Ping {
  return p && typeof p.sessionId === "string" && typeof p.lat === "number" && typeof p.lon === "number" && (p.mode === "rail" || p.mode === "bus") && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
}

app.post("/ping", async (req, res) => {
  const list: any[] = Array.isArray(req.body?.pings) ? req.body.pings : [req.body];
  const now = Date.now();
  const accepted: Ping[] = [];
  for (const p of list.slice(0, 200)) {
    if (!validPing(p)) continue;
    const last = lastPingAt.get(p.sessionId) ?? 0;
    if (!p.simulated && now - last < RATE_MS) continue; // spoofing / spam guard
    lastPingAt.set(p.sessionId, now);
    accepted.push({ ...p, simulated: !!p.simulated, ts: typeof p.ts === "number" ? p.ts : now, report: p.report === "stopped" || p.report === "moving" ? p.report : null });
  }
  if (!accepted.length) return res.status(202).json({ accepted: 0 });
  await publish("pings", accepted.length === 1 ? accepted[0] : { pings: accepted });
  // 1-in-20 sample to BigQuery, no uid, rounded coordinates
  const sample = accepted.filter(() => ++pingCount % 20 === 0).map((p) => ({ ts: new Date(p.ts).toISOString(), mode: p.mode, line_id: p.lineId ?? null, route_id: p.routeId ?? null, lat: +p.lat.toFixed(3), lon: +p.lon.toFixed(3), speed: p.speed ?? null, motion: p.motion ?? null, simulated: p.simulated }));
  bqInsert("pings_sample", sample);
  // a single phone ping gets told where it was matched on the network (shown on the on-board screen)
  if (accepted.length === 1 && accepted[0].mode === "rail" && accepted[0].lineId) {
    const p = accepted[0];
    const snap = snapToLine(p.lineId!, p.lat, p.lon);
    const onLine = !!snap && snap.distToLineM <= 300;
    return res.status(202).json({
      accepted: 1,
      snap: snap
        ? {
            onLine,
            distToLineM: Math.round(snap.distToLineM),
            segmentId: snap.segment.segmentId,
            between: [snap.segment.fromName, snap.segment.toName],
            atStation: snap.distToStationM < 150 ? stationName(snap.nearestStationId) : null,
          }
        : null,
    });
  }
  res.status(202).json({ accepted: accepted.length });
});

// what the detector sees for one on-board session (proxied from the worker's memory)
app.get("/session/:id", async (req, res) => {
  try {
    const headers: Record<string, string> = {};
    const r = await fetch(`${WORKER_URL}/session/${encodeURIComponent(req.params.id)}`, { headers, signal: AbortSignal.timeout(3000) });
    res.json(await r.json());
  } catch {
    res.json(null);
  }
});

// LAN addresses, so the simulator can show a QR code for testing on a phone over Wi-Fi
app.get("/net", (_req, res) => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address)
    .filter((a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(a));
  res.json({ ips, webPort: 5173 });
});

// ---------------- incidents (public, for lecturers) ----------------
app.get("/incident/:id", async (req, res) => {
  const inc = await getIncident(req.params.id);
  if (!inc) return res.status(404).json({ error: "not found" });
  res.json(inc);
});

// ---------------- incident report (with or without an alert) ----------------
app.post("/letter", async (req, res) => {
  try {
    const body = req.body as LetterRequest;
    if (!body?.studentName) return res.status(400).json({ error: "studentName is required" });
    const letter = await createLetter(body);
    res.json(letter);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});
app.get("/letter/:id", async (req, res) => {
  const l = await getLetter(req.params.id);
  return l ? res.json(l) : res.status(404).json({ error: "not found" });
});
app.get("/letter/:id/pdf", async (req, res) => {
  const l = await getLetter(req.params.id);
  if (!l) return res.status(404).json({ error: "not found" });
  const pdf = await renderPdf(l);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${req.query.inline ? "inline" : "attachment"}; filename="sampai-report-${l.incidentId}.pdf"`);
  res.send(pdf);
});

// ---------------- address search (home location) ----------------
app.get("/geo/search", async (req, res) => {
  try {
    res.json(await searchPlaces(String(req.query.q ?? "")));
  } catch (e: any) {
    res.status(502).json({ error: e.message });
  }
});
app.get("/geo/reverse", async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "lat and lon required" });
  res.json(await reversePlace(lat, lon).catch(() => null));
});

// ---------------- route options (like a maps app) ----------------
app.get("/route/options", async (req, res) => {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "lat and lon required" });
  const intake = String(req.query.intake ?? "").trim();
  const group = String(req.query.group ?? "").trim() || null;
  try {
    const cls = intake ? await nextCampusClass(intake, Date.now(), group).catch(() => null) : null;
    const cond = await db.doc("conditions/current").get().catch(() => null);
    const options = await routeOptions({ lat, lon }, { classTs: cls?.startTs ?? null, raining: !!cond?.get?.("rain")?.advisory, board: String(req.query.board ?? "") || null });
    res.json({ forClass: cls ? { title: cls.module, date: cls.date, start: cls.start, room: cls.room } : null, options });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------- APSpace (APU timetable + shuttle) ----------------
app.get("/apu/status", async (_req, res) => res.json(await timetableStatus()));
app.get("/apu/intakes", async (req, res) => res.json(await listIntakes(String(req.query.q ?? ""))));
app.get("/apu/timetable", async (req, res) => {
  const intake = String(req.query.intake ?? "");
  if (!intake) return res.status(400).json({ error: "intake required" });
  const group = String(req.query.group ?? "") || undefined;
  const groups = await groupsForIntake(intake);
  // with several groups and none chosen, don't guess: the student picks their group first
  const needsGroup = groups.length > 1 && !group;
  const all = await classesForIntake(intake, { group });
  const now = Date.now();
  res.json({
    intake: intake.toUpperCase(),
    group: group ?? null,
    groups,
    needsGroup,
    next: needsGroup ? null : await nextCampusClass(intake, now, group),
    upcoming: all.filter((c) => c.startTs > now - 3600_000).slice(0, 20),
  });
});
app.get("/apu/stops", (_req, res) => res.json(shuttleStops));
app.get("/apu/plan", async (req, res) => {
  const from = String(req.query.from ?? "LRT - Bukit Jalil");
  const classTs = Number(req.query.classTs);
  const pre = Number(req.query.pre ?? 0);
  if (!Number.isFinite(classTs)) return res.status(400).json({ error: "classTs required" });
  const cond = await db.doc("conditions/current").get().catch(() => null);
  res.json(await planShuttle(from, classTs, pre, { raining: !!cond?.get?.("rain")?.advisory }));
});
app.get("/apu/shuttle", async (req, res) => {
  const from = String(req.query.from ?? "LRT - Bukit Jalil");
  res.json({ from, next: await nextShuttles(from, req.query.after ? Number(req.query.after) : undefined, 4), all: await shuttleTrips(from, "APU") });
});

// ---------------- simulator (everything here is labelled simulated) ----------------
async function callWorker(path: string, body: unknown = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!LOCAL) {
    // Cloud Run service-to-service auth: ID token from the metadata server
    try {
      const t = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(WORKER_URL)}`, { headers: { "Metadata-Flavor": "Google" } });
      headers.Authorization = `Bearer ${await t.text()}`;
    } catch {
      /* not on GCP */
    }
  }
  const r = await fetch(WORKER_URL + path, { method: "POST", headers, body: JSON.stringify(body) });
  return r.ok ? r.json().catch(() => ({})) : { error: `worker ${r.status}` };
}

app.post("/sim/conditions", async (req, res) => {
  const cur = await db.doc("conditions/sim").get();
  const sim = { ...(cur.exists ? cur.data() : {}), ...req.body, setAt: Date.now() };
  if (req.body?.clear) {
    for (const k of Object.keys(sim)) delete (sim as any)[k];
  }
  await recomputeConditions({ sim });
  res.json(await callWorker("/sim/conditions-changed"));
});

app.post("/sim/bus", async (req, res) => {
  const { routeId = "T5800", action = "stall" } = req.body ?? {};
  await publish("bus-positions", { command: action, routeId, simulated: true });
  res.json({ ok: true, routeId, action });
});

app.post("/sim/reset", async (_req, res) => {
  await callWorker("/sim/reset");
  const [alerts, active] = await Promise.all([db.collection("alerts").where("simulated", "==", true).get(), db.collection("incidents").where("status", "==", "active").get()]);
  const batch = db.batch();
  alerts.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  for (const d of active.docs) if (d.get("simulated")) await updateIncident(d.id, {}, "cleared");
  await recomputeConditions({ sim: null });
  res.json({ ok: true, alertsRemoved: alerts.size });
});

/** Seeds ~30 days of simulated historical incidents so the admin dashboard has patterns to show. */
app.post("/sim/seed-history", async (req, res) => {
  const n = Math.min(400, Number(req.body?.count ?? 140));
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  const weights: Record<string, number> = { KJ: 5, PH: 4, AG: 2, KGL: 2, PYL: 1, MR: 2, SA: 0.5, BRT: 0.5 };
  const lineIds = Object.keys(weights).flatMap((k) => Array(Math.ceil(weights[k] * 2)).fill(k));
  const hours = [7, 7, 8, 8, 8, 9, 9, 12, 13, 17, 17, 18, 18, 18, 19, 22];
  const batch = db.batch();
  const rows: any[] = [];
  for (let i = 0; i < n; i++) {
    const lineId = pick(lineIds);
    const segs = segments.filter((s) => s.lineId === lineId);
    const seg = lineId === "KJ" && Math.random() < 0.4 ? segs.find((s) => /USJ 21|Taipan/i.test(s.fromName + s.toName)) ?? pick(segs) : pick(segs);
    const day = Math.floor(Math.random() * 30);
    const hour = pick(hours);
    const midnightMyt = Math.floor((Date.now() + 8 * 3600_000) / 86400_000) * 86400_000 - 8 * 3600_000;
    const startedAt = midnightMyt - (day + 1) * 86400_000 + hour * 3600_000 + Math.random() * 3600_000;
    const raining = hour >= 15 && Math.random() < 0.45;
    const dur = Math.round(8 + Math.random() * (raining ? 55 : 35));
    const riders = 2 + Math.floor(Math.random() * 9);
    const inc: Incident = {
      id: `HIST-${String(i).padStart(4, "0")}`,
      type: "train_stall",
      status: "cleared",
      lineId,
      lineName: lineById.get(lineId)?.name ?? lineId,
      segmentId: seg.segmentId,
      fromStop: seg.fromStop,
      toStop: seg.toStop,
      fromName: seg.fromName,
      toName: seg.toName,
      geometry: seg.geometry,
      startedAt,
      updatedAt: startedAt + dur * 60000,
      clearedAt: startedAt + dur * 60000,
      riderCount: riders,
      confidence: riders >= 5 ? "high" : riders >= 3 ? "medium" : "low",
      source: "riders",
      weatherAtStart: { apparentTemp: Math.round(30 + Math.random() * 8), rainProb: raining ? 80 : Math.round(Math.random() * 40), metWarning: raining && Math.random() < 0.5 },
      simulated: true,
    };
    inc.title = `${inc.lineName} stalled between ${inc.fromName} and ${inc.toName}`;
    batch.set(db.doc(`incidents/${inc.id}`), toFirestore(inc));
    rows.push({ id: inc.id, change: "cleared", type: inc.type, line_id: lineId, line_name: inc.lineName, segment_id: seg.segmentId, from_stop: seg.fromName, to_stop: seg.toName, started_at: new Date(startedAt).toISOString(), cleared_at: new Date(inc.clearedAt!).toISOString(), duration_min: dur, rider_count: riders, confidence: inc.confidence, source: "riders", apparent_temp: inc.weatherAtStart!.apparentTemp, rain_prob: inc.weatherAtStart!.rainProb, met_warning: inc.weatherAtStart!.metWarning, simulated: true, logged_at: new Date().toISOString() });
  }
  await batch.commit();
  await bqInsert("incidents", rows);
  res.json({ ok: true, seeded: n });
});

// ---------------- admin ----------------
app.post("/admin/official-note", async (req, res) => {
  const { incidentId, text } = req.body ?? {};
  if (!incidentId || !text) return res.status(400).json({ error: "incidentId and text required" });
  const g = await geminiJSON<{ summary: string }>(`Summarise this official public transport operator update in one plain sentence (max 140 chars). Return JSON {"summary": "..."}.\n\n${text}`);
  const note = g?.summary ?? String(text).slice(0, 200);
  await updateIncident(incidentId, { officialNote: note }, "updated");
  res.json({ ok: true, officialNote: note });
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`[api] :${PORT} pubsub=${pubsubMode} gemini=${geminiMode} firestore=${usingEmulator ? "emulator" : "gcp"} worker=${WORKER_URL}`);
  // Render's free plan sleeps: load the APSpace timetable as soon as we wake, so the first
  // intake lookup isn't an empty list; retry once if APSpace is slow.
  timetableStatus()
    .then((t) => (t.rows ? t : new Promise((r) => setTimeout(r, 15_000)).then(timetableStatus)))
    .then((t) => console.log(`[api] APSpace timetable: ${t.rows} rows`))
    .catch(() => null);
});
