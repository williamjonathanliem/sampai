/**
 * Holds 3 simulated riders still on one segment until an incident appears (no clearing).
 *   npx tsx scripts/stall.ts [segmentId]
 */
import "../shared/server/env";
import { db } from "../shared/server/firebase";
import { segmentById, pointAlong } from "../shared/network";

const SEG = process.argv[2] || "PH:SP18>SP17";
const API = process.env.API_URL || "http://localhost:8080";
const seg = segmentById.get(SEG);
if (!seg) throw new Error(`unknown segment ${SEG}`);
const t0 = Date.now();
while (Date.now() - t0 < 90_000) {
  const pings = ["stall-a", "stall-b", "stall-c"].map((sessionId, i) => {
    const p = pointAlong(seg, 0.45 + i * 0.03);
    return { sessionId, mode: "rail", lineId: seg.lineId, lat: p.lat, lon: p.lon, speed: 0.1, motion: 0.02, ts: Date.now(), simulated: true };
  });
  await fetch(`${API}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pings }) });
  const inc = await db.collection("incidents").where("segmentId", "==", SEG).where("status", "==", "active").get();
  if (!inc.empty) {
    console.log(`incident ${inc.docs[0].id} after ${Math.round((Date.now() - t0) / 1000)}s`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.log("no incident");
process.exit(1);
