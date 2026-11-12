/**
 * End-to-end smoke test against the local stack (emulators + worker + api).
 *   npx tsx scripts/smoke.ts
 * Creates a demo user, makes 3 simulated riders stall on Sri Petaling -> Bukit Jalil,
 * waits for the incident + alert, then generates a delay letter PDF.
 */
import "../shared/server/env";
import { db } from "../shared/server/firebase";
import { routeFromLegs, segmentById, pointAlong } from "../shared/network";
import config from "../data/config.json";
import fs from "node:fs";

const API = process.env.API_URL || "http://localhost:8080";
const SEG = "PH:SP18>SP17";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const aina = config.demoProfiles[0];
const uid = "smoke-aina";
await db.doc(`users/${uid}`).set({
  displayName: aina.displayName,
  lang: aina.lang,
  homeLocation: aina.homeLocation,
  route: routeFromLegs(aina.route.legs as any),
  classes: aina.classes,
  profileId: aina.id,
  simulated: true,
  updatedAt: Date.now(),
});
console.log("user ok, segments:", routeFromLegs(aina.route.legs as any).segments);

const seg = segmentById.get(SEG)!;
const riders = ["smoke-r1", "smoke-r2", "smoke-r3"];
const t0 = Date.now();
let incidentId: string | null = null;
while (Date.now() - t0 < 70_000) {
  const pings = riders.map((sessionId, i) => {
    const p = pointAlong(seg, 0.45 + i * 0.03);
    return { sessionId, mode: "rail", lineId: "PH", lat: p.lat, lon: p.lon, speed: 0.1, motion: 0.02, ts: Date.now(), simulated: true };
  });
  await fetch(`${API}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pings }) });
  const inc = await db.collection("incidents").where("segmentId", "==", SEG).where("status", "==", "active").get();
  if (!inc.empty) {
    incidentId = inc.docs[0].id;
    console.log(`incident after ${Math.round((Date.now() - t0) / 1000)}s:`, incidentId, inc.docs[0].get("title"));
    break;
  }
  await sleep(2000);
}
if (!incidentId) throw new Error("no incident");

for (let i = 0; i < 20; i++) {
  const a = await db.doc(`alerts/${incidentId}_${uid}`).get();
  if (a.exists) {
    const d = a.data()!;
    console.log("ALERT:", d.generatedBy, "|", d.title, "|", d.body);
    console.log("options:", d.options.map((o: any) => `${o.id} ${o.arrivalTime} onTime=${o.onTime} ${o.fareEstimate ? "RM" + o.fareEstimate : ""} ${o.detail ?? ""}`));
    break;
  }
  await sleep(1000);
}

const r = await fetch(`${API}/letter`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, incidentId, studentName: "Aina (demo)" }) });
const letter: any = await r.json();
console.log("LETTER:", letter.generatedBy, letter.body?.slice(0, 200));
const pdf = await fetch(`${API}/letter/${letter.id}/pdf`);
const out = process.env.SMOKE_PDF || "smoke-letter.pdf";
fs.writeFileSync(out, Buffer.from(await pdf.arrayBuffer()));
console.log("pdf written:", out, pdf.status);

// riders move again -> clears
for (let k = 0; k < 4; k++) {
  const pings = riders.map((sessionId, i) => {
    const p = pointAlong(seg, 0.6 + k * 0.08 + i * 0.01);
    return { sessionId, mode: "rail", lineId: "PH", lat: p.lat, lon: p.lon, speed: 12, motion: 0.8, ts: Date.now(), simulated: true };
  });
  await fetch(`${API}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pings }) });
  await sleep(1500);
}
await sleep(1500);
console.log("status after moving:", (await db.doc(`incidents/${incidentId}`).get()).get("status"));
process.exit(0);
