/**
 * Decide + notify (section 7.5): affected users -> options -> Gemini text -> alert doc + FCM push.
 */
import { db, messaging, usingEmulator } from "../../shared/server/firebase";
import { getIncident } from "../../shared/server/incidents";
import { getConditions } from "../../shared/server/conditions";
import { buildOptions } from "../../shared/server/options";
import { nextCampusClass } from "../../shared/server/apu";
import { geminiJSON } from "../../shared/server/gemini";
import { bqInsert } from "../../shared/server/bigquery";
import { PUBLIC_WEB_URL } from "../../shared/server/env";
import { stationById, APU } from "../../shared/network";
import { myt, hhmmToMin, mytToEpoch, minToHhmm } from "../../shared/time";
import { cfg } from "./config";
import type { AlertDoc, AlertOption, Incident, UserDoc, Conditions } from "../../shared/types";

interface NextClass {
  title: string;
  start: string;
  startTs: number;
  lecturer?: string | null;
  room?: string | null;
  source: "apspace" | "profile" | "demo";
}

export async function nextClassFor(user: UserDoc, now = Date.now()): Promise<NextClass | null> {
  if (user.intake) {
    const c = await nextCampusClass(user.intake, now, user.group).catch(() => null);
    if (c && c.startTs - now < 36 * 3600_000) return { title: c.module, start: c.start, startTs: c.startTs, lecturer: c.lecturer, room: c.room, source: "apspace" };
  }
  const t = myt(now);
  // demo profiles with a relative class ("starts in N min") so a late arrival can be shown at any hour
  const rel = user.simulated ? (user.classes ?? []).find((c) => typeof c.inMin === "number") : undefined;
  if (rel) {
    const startMin = Math.ceil((t.minutes + rel.inMin!) / 5) * 5;
    return { title: rel.title ?? "Class", start: minToHhmm(startMin), startTs: mytToEpoch(t.date, minToHhmm(startMin)), lecturer: rel.lecturer, room: rel.room, source: "demo" };
  }
  const today = (user.classes ?? [])
    .filter((c) => c.day === 0 || c.day === t.dow)
    .map((c) => ({ ...c, ts: mytToEpoch(t.date, c.start) }))
    .filter((c) => c.ts > now)
    .sort((a, b) => a.ts - b.ts)[0];
  if (today) return { title: today.title ?? "Class", start: today.start, startTs: today.ts, lecturer: today.lecturer, room: today.room, source: "profile" };
  if (cfg.demo && user.simulated) {
    // Demo profiles always have a class ~50 min from now, so the stage demo works at any hour.
    const startMin = Math.ceil((t.minutes + 50) / 15) * 15;
    const first = user.classes?.[0];
    return { title: first?.title ?? "Class", start: minToHhmm(startMin), startTs: mytToEpoch(t.date, minToHhmm(startMin)), lecturer: first?.lecturer, room: first?.room, source: "demo" };
  }
  return null;
}

async function affectedUsers(inc: Incident): Promise<Map<string, UserDoc>> {
  const out = new Map<string, UserDoc>();
  const add = (snap: FirebaseFirestore.QuerySnapshot) => snap.docs.forEach((d) => out.set(d.id, d.data() as UserDoc));
  if (inc.segmentId) add(await db.collection("users").where("route.segments", "array-contains", inc.segmentId).get());
  if (inc.routeId) add(await db.collection("users").where("route.busRoutes", "array-contains", inc.routeId).get());
  if (inc.lineId) {
    // riders with an active session on the line
    const s = await db.collection("sessions").where("active", "==", true).where("lineId", "==", inc.lineId).get();
    for (const d of s.docs) {
      const uid = d.get("uid");
      if (uid && !out.has(uid)) {
        const u = await db.doc(`users/${uid}`).get();
        if (u.exists) out.set(uid, u.data() as UserDoc);
      }
    }
  }
  if (inc.type === "weather") add(await db.collection("users").limit(300).get());
  return out;
}

/** "today" / "tomorrow" / weekday, in the student's language. */
function classWhen(ts: number, now: number, ms: boolean) {
  const d = myt(ts).date;
  if (d === myt(now).date) return ms ? "hari ini" : "today";
  if (d === myt(now + 86_400_000).date) return ms ? "esok" : "tomorrow";
  return new Date(ts).toLocaleDateString(ms ? "ms-MY" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", weekday: "long" });
}

function templateAlert(inc: Incident, user: UserDoc, cls: NextClass | null, best: AlertOption | undefined, cond: Conditions | null, change: string) {
  const ms = user.lang === "ms";
  const line = inc.lineName?.replace(" Line", "") ?? "";
  if (change === "cleared") {
    return ms
      ? { title: `${inc.type === "weather" ? "Amaran cuaca tamat" : `Laluan ${line} pulih`}`, body: "Perkhidmatan bergerak semula. Laluan biasa anda boleh digunakan.", why: "" }
      : { title: inc.type === "weather" ? "Weather warning lifted" : `${line} line moving again`, body: "Service has resumed. Your usual route is fine.", why: "" };
  }
  const late = best && !best.onTime;
  const now = Date.now();
  const soon = cls && cls.startTs - now <= 3 * 3600_000;
  // same arithmetic as the app (arrival HH:MM minus class HH:MM) so both say the same number
  const lateBy = cls && best ? Math.max(1, hhmmToMin(best.arrivalTime) - hhmmToMin(cls.start)) : 0;
  const when = cls ? classWhen(cls.startTs, now, ms) : "";
  const classBit = !cls
    ? ""
    : !soon
      ? ms ? `. Kelas seterusnya ${when} ${cls.start}` : `. Your next class is ${when} at ${cls.start}`
      : late
        ? ms ? `, lewat kira-kira ${lateBy} minit untuk kelas ${cls.start}` : `, about ${lateBy} min late for your ${cls.start} class`
        : ms ? `, sempat untuk kelas ${cls.start}` : `, you'll still make ${cls.start}`;
  if (inc.type === "weather") {
    return ms
      ? { title: "Amaran hujan lebat KL", body: `Guna laluan berbumbung dari LRT Bukit Jalil dan bertolak 10 minit awal${classBit}.`, why: "Ribut petir dijangka dalam sejam." }
      : { title: "Heavy rain warning for KL", body: `Use the covered path from Bukit Jalil LRT and leave 10 min early${classBit}.`, why: "Thunderstorms expected within the hour." };
  }
  const where = inc.type === "train_stall" ? (ms ? `${line} terhenti sebelum ${inc.toName}` : `${line} line stalled before ${inc.toName}`) : inc.title ?? "Disruption";
  const hot = cond?.heat?.advisory ? (ms ? " Panas terik, elak berjalan jauh." : " It's hot, avoid long walks.") : "";
  return {
    title: where.slice(0, 60),
    body: `${best ? (ms ? `Ambil ${best.label}, tiba ${best.arrivalTime}` : `Take ${best.label}, arrive ${best.arrivalTime}`) : ""}${classBit}.${hot}`.slice(0, 160),
    why: best ? (ms ? "Pilihan terpantas yang tidak melalui laluan terhenti." : "Fastest option that avoids the stalled stretch.") : "",
  };
}

export async function handleIncidentEvent(id: string, change: string) {
  const inc = await getIncident(id);
  if (!inc) return { sent: 0 };
  const cond = await getConditions().catch(() => null);
  const users = await affectedUsers(inc);
  const now = Date.now();
  let sent = 0;

  for (const [uid, user] of users) {
    try {
      const cls = await nextClassFor(user, now);
      // rule 7.5: class within 2 hours (or on board right now)
      if (change !== "cleared" && cls && cls.startTs - now > cfg.alertClassWindowMs && inc.type !== "weather") continue;
      if (change !== "cleared" && !cls && inc.type !== "train_stall") continue;

      const alertId = `${inc.id}_${uid}`;
      if (change === "cleared") {
        const ref = db.doc(`alerts/${alertId}`);
        if (!(await ref.get()).exists) continue;
        const t = templateAlert(inc, user, cls, undefined, cond, "cleared");
        // no push for "service resumed": the app shows it quietly, phones don't buzz again
        await ref.set({ status: "cleared", title: t.title, body: t.body, sentAt: now }, { merge: true });
        sent++;
        continue;
      }

      const origin = stationById.get(inc.fromStop ?? "") ?? user.homeLocation ?? null;
      const options = await buildOptions(inc, user, {
        now,
        classStartTs: cls?.startTs ?? null,
        conditions: cond,
        origin: origin ? { lat: origin.lat, lon: origin.lon, label: (origin as any).name ?? (origin as any).label ?? "" } : null,
      });

      let text = templateAlert(inc, user, cls, pickBest(options, cls?.startTs), cond, change);
      let bestOptionId = pickBest(options, cls?.startTs)?.id;
      let generatedBy: AlertDoc["generatedBy"] = "template";

      const g = await geminiJSON<{ title: string; body: string; bestOptionId: string; why: string }>(alertPrompt(inc, user, cls, cond, options, now));
      if (g?.title && g?.body) {
        text = { title: g.title.slice(0, 60), body: g.body.slice(0, 160), why: g.why ?? "" };
        if (options.some((o) => o.id === g.bestOptionId)) bestOptionId = g.bestOptionId;
        generatedBy = "gemini";
      }

      const alert: AlertDoc = {
        id: alertId,
        uid,
        incidentId: inc.id,
        status: "active",
        title: text.title,
        body: text.body,
        why: text.why,
        bestOptionId,
        options,
        classTitle: cls?.title ?? null,
        classStart: cls?.start ?? null,
        lecturer: cls?.lecturer ?? null,
        sentAt: now,
        generatedBy,
        simulated: inc.simulated || !!user.simulated,
      };
      await db.doc(`alerts/${alertId}`).set(alert);
      await push(user, alert.title, alert.body, alertId);
      await bqInsert("alerts", [
        { id: alertId, incident_id: inc.id, change, sent_at: new Date(now).toISOString(), lead_min_before_class: cls ? Math.round((cls.startTs - now) / 60000) : null, best_option: bestOptionId ?? null, best_on_time: options.find((o) => o.id === bestOptionId)?.onTime ?? null, generated_by: generatedBy, simulated: alert.simulated },
      ]);
      sent++;
    } catch (e: any) {
      console.error(`[notify] ${uid}: ${e.message}`);
    }
  }
  console.log(`[notify] ${change} ${id}: ${sent} alert(s) to ${users.size} candidate(s)`);
  return { sent, candidates: users.size };
}

/** Cheapest option that still makes class with a 5-min margin (bus/shuttle/walk before a taxi); else the fastest. */
function pickBest(options: AlertOption[], classStartTs?: number | null) {
  const cost = (o: AlertOption) => (o.type === "grab" ? 3 : o.type === "walk" ? 2 : 1);
  const margin = (o: AlertOption) => (classStartTs ? (classStartTs - Date.now()) / 60000 - o.etaMinutes : 99);
  const comfy = options.filter((o) => o.onTime && margin(o) >= 5);
  if (comfy.length) return [...comfy].sort((a, b) => cost(a) - cost(b) || a.etaMinutes - b.etaMinutes)[0];
  return [...options].sort((a, b) => Number(b.onTime) - Number(a.onTime) || a.etaMinutes - b.etaMinutes)[0];
}

function alertPrompt(inc: Incident, user: UserDoc, cls: NextClass | null, cond: Conditions | null, options: AlertOption[], now: number) {
  return `You write short commute alerts for university students in Kuala Lumpur (APU, Technology Park Malaysia, Bukit Jalil).

Incident: ${JSON.stringify({ type: inc.type, title: inc.title, line: inc.lineName, between: [inc.fromName, inc.toName], routeId: inc.routeId, riders: inc.riderCount, confidence: inc.confidence, summary: inc.summary })}
Student: class "${cls?.title ?? "unknown"}" ${cls ? classWhen(cls.startTs, now, false) : ""} at ${cls?.start ?? "unknown"}, now ${myt(now).hhmm} (Malaysia time). If the class is not today, do not claim they will make it; just give the best way to campus now and mention when the class is, language ${user.lang === "ms" ? "Bahasa Melayu" : "English"}
Conditions: feels-like ${cond?.heat?.apparentTemp ?? "unknown"}°C, rain probability next hour ${cond?.rain?.probNextHour ?? "unknown"}%, MET warnings: ${(cond?.metWarnings ?? []).filter((w) => w.affectsKL).map((w) => w.title).join("; ") || "none"}
Options (arrivalTime = estimated arrival at campus): ${JSON.stringify(options.map((o) => ({ id: o.id, type: o.type, label: o.label, detail: o.detail, arrivalTime: o.arrivalTime, onTime: o.onTime, fareRM: o.fareEstimate })))}

Pick the best option for arriving on time and staying safe and comfortable (avoid long walks in heat or rain; prefer cheaper options when arrival is similar).
Write in ${user.lang === "ms" ? "Bahasa Melayu" : "English"}. Use plain words, no emojis.
Return JSON: { "title": "<max 60 chars>", "body": "<max 160 chars, include the arrival time and whether they make the class>", "bestOptionId": "<id>", "why": "<one sentence>" }`;
}

async function push(user: UserDoc, title: string, body: string, alertId: string) {
  const tokens = user.fcmTokens ?? [];
  if (!tokens.length || usingEmulator) return; // in local mode the Firestore listener shows the banner
  try {
    await messaging().sendEachForMulticast({
      tokens,
      data: { title, body, alertId },
      webpush: {
        notification: { title, body, icon: "/icon-192.png", badge: "/icon-192.png", tag: alertId, renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 400] } as any,
        fcmOptions: { link: `${PUBLIC_WEB_URL}/app?alert=${encodeURIComponent(alertId)}` },
        headers: { Urgency: "high" },
      },
    });
  } catch (e: any) {
    console.warn(`[fcm] send failed: ${e.message}`);
  }
}

export { APU, hhmmToMin };
