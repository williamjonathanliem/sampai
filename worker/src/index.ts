import "../../shared/server/env";
import express from "express";
import { decodePush, pubsubMode } from "../../shared/server/pubsub";
import { geminiMode } from "../../shared/server/gemini";
import { bigqueryMode } from "../../shared/server/bigquery";
import { usingEmulator } from "../../shared/server/firebase";
import { recomputeConditions, getConditions } from "../../shared/server/conditions";
import { onPing, tick, detectorStats, resetDetector, liveRiders, sessionView } from "./detect/train";
import { db } from "../../shared/server/firebase";
import { pollBus, ingest, simBus, busStats } from "./detect/bus";
import { pollWeather, weatherStats, syncWeatherIncident } from "./weather";
import { handleIncidentEvent } from "./notify";
import { cfg } from "./config";
import type { Ping } from "../../shared/types";

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) =>
  res.json({
    service: "sampai-worker",
    demoMode: cfg.demo,
    pubsub: pubsubMode,
    gemini: geminiMode,
    bigquery: bigqueryMode,
    firestore: usingEmulator ? "emulator" : "gcp",
    detector: detectorStats(),
    bus: busStats(),
    weather: weatherStats(),
  }),
);

// ---- Pub/Sub push endpoints ----
app.post("/pubsub/pings", async (req, res) => {
  const msg = decodePush<Ping | { pings: Ping[] }>(req.body);
  res.status(204).end(); // ack fast; detection is in-memory and quick
  if (!msg) return;
  const list = "pings" in msg ? msg.pings : [msg];
  for (const p of list) await onPing(p).catch((e) => console.error(`[ping] ${e.message}`));
});

app.post("/pubsub/bus", async (req, res) => {
  const msg = decodePush<any>(req.body);
  try {
    if (msg?.command && msg.routeId) await simBus(msg.routeId, msg.command);
    else if (msg?.vehicles) await ingest(msg.vehicles);
  } catch (e: any) {
    console.error(`[bus] ${e.message}`);
  }
  res.status(204).end();
});

app.post("/pubsub/incidents", async (req, res) => {
  const msg = decodePush<{ id: string; change: string }>(req.body);
  if (!msg?.id) return res.status(204).end();
  try {
    await handleIncidentEvent(msg.id, msg.change);
  } catch (e: any) {
    console.error(`[incidents] ${e.message}`);
  }
  res.status(204).end();
});

// ---- Scheduled polls (Cloud Scheduler) ----
app.post("/poll/bus", async (_req, res) => pollBus().then((r) => res.json(r), (e) => res.status(500).json({ error: e.message })));
app.post("/poll/weather", async (_req, res) => {
  try {
    res.json(await pollWeather());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
app.post("/load/gtfs", (_req, res) => res.json({ ok: true, note: "Network data is built offline with `npm run data` and bundled; redeploy to refresh." }));

// ---- Simulator controls that need the worker's memory ----
// the phone's on-board screen asks what the detector sees for its session (via the api)
app.get("/session/:id", (req, res) => res.json(sessionView(req.params.id)));

app.post("/sim/reset", async (_req, res) => {
  await resetDetector();
  res.json({ ok: true });
});
app.post("/sim/conditions-changed", async (_req, res) => {
  // called by the api after it writes conditions/sim
  const c = await recomputeConditions();
  await syncWeatherIncident(c.metWarnings.find((w) => w.affectsKL) ?? null);
  res.json(c);
});

const PORT = Number(process.env.PORT || 8081);
app.listen(PORT, () => {
  console.log(`[worker] :${PORT} demo=${cfg.demo} pubsub=${pubsubMode} gemini=${geminiMode} firestore=${usingEmulator ? "emulator" : "gcp"}`);
});

// sweep for silent incidents, and publish real phones on board (no uid, rounded) for the simulator map
let lastLive = "";
setInterval(async () => {
  await tick().catch((e) => console.error(`[tick] ${e.message}`));
  const riders = liveRiders();
  const sig = JSON.stringify(riders);
  if (sig !== lastLive) {
    lastLive = sig;
    await db.doc("live/riders").set({ updatedAt: Date.now(), riders }).catch(() => null);
  }
}, 5_000);

// In-process polling (Cloud Scheduler's minimum is 1 min; the bus feed updates every 30 s)
if ((process.env.BUS_POLL ?? "true") === "true") {
  const loop = () => pollBus().catch((e) => console.warn(`[bus] ${e.message}`));
  setTimeout(loop, 3_000);
  setInterval(loop, 30_000);
}
if ((process.env.WEATHER_POLL ?? "true") === "true") {
  const loop = () => pollWeather().catch((e) => console.warn(`[weather] ${e.message}`));
  setTimeout(loop, 2_000);
  setInterval(loop, 10 * 60_000);
}
void getConditions;
