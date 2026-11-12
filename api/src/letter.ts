/**
 * Incident report for a lecturer: third person, every finding tied to its source.
 * Structure: 1 Summary, 2 Findings (what happened, when, according to whom), 3 The student's journey, 4 Conclusion.
 * Findings and journey are built deterministically from records; Gemini only writes the summary and conclusion prose.
 */
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { db } from "../../shared/server/firebase";
import { getIncident } from "../../shared/server/incidents";
import { geminiJSON } from "../../shared/server/gemini";
import { PUBLIC_WEB_URL } from "../../shared/server/env";
import { fmtMyt, hhmmToMin, myt } from "../../shared/time";
import type { AlertDoc, Conditions, Incident, UserDoc } from "../../shared/types";
import { reversePlace } from "./geo";
import { APU } from "../../shared/network";
import { distance } from "@turf/turf";

export interface LetterRequest {
  uid?: string;
  /** omitted or "self": the student asked for a report without an alert */
  incidentId?: string;
  /** arrival time the student typed (HH:MM); wins over Sampai's estimate */
  arrivedAt?: string;
  /** testing only: pretend the report is made at this time (picks which incidents are "recent") */
  asOf?: number;
  studentName: string;
  studentId?: string;
  intake?: string;
  lecturerName?: string;
  classTitle?: string;
  classStart?: string;
  room?: string;
  optionTaken?: string;
  eta?: string;
  lang?: "en" | "ms";
}

export interface Finding {
  text: string;
  source: string;
}

export interface LetterDoc extends LetterRequest {
  id: string;
  refNo: string;
  subject: string;
  /** summary paragraph */
  body: string;
  findings: Finding[];
  journey: { label: string; value: string }[];
  conclusion: string;
  lateMin: number | null;
  createdAt: number;
  generatedBy: "gemini" | "template";
  facts: Record<string, string>;
  simulated: boolean;
  /** made by the student without an alert; no single incident behind it */
  self?: boolean;
}

const FLOOD = /(flood|banjir)/i;

function dayOf(ts: number, ms: boolean) {
  return new Date(ts).toLocaleDateString(ms ? "ms-MY" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" });
}

function span(a: number, b: number | null | undefined, ms: boolean) {
  if (!b) return ms ? `dari ${fmtMyt(a)} dan masih berterusan semasa laporan ini dikeluarkan` : `from ${fmtMyt(a)}, still ongoing when this report was issued`;
  const d = Math.max(1, Math.round((b - a) / 60000));
  return ms ? `dari ${fmtMyt(a)} hingga ${fmtMyt(b)} (${d} minit)` : `from ${fmtMyt(a)} to ${fmtMyt(b)} (${d} min)`;
}

async function placeNear(c?: { lat: number; lon: number } | null) {
  if (!c) return null;
  const p = await reversePlace(c.lat, c.lon).catch(() => null);
  return p ? p.label : null;
}

/** One finding per incident: what happened, where, when, and who says so. */
async function findingFor(inc: Incident, ms: boolean): Promise<Finding> {
  const when = span(inc.startedAt, inc.clearedAt, ms);
  const conf = ms ? ({ low: "rendah", medium: "sederhana", high: "tinggi" } as const)[inc.confidence] : inc.confidence;
  if (inc.type === "train_stall") {
    const line = inc.lineName ?? "LRT";
    return {
      text: ms ? `Perkhidmatan ${line} antara ${inc.fromName} dan ${inc.toName} terhenti ${when}.` : `The ${line} service between ${inc.fromName} and ${inc.toName} was halted ${when}.`,
      source: [
        ms ? `${inc.riderCount} peranti penumpang Sampai yang berasingan di laluan yang sama (keyakinan ${conf})` : `${inc.riderCount} independent Sampai rider devices on the same stretch (${conf} confidence)`,
        inc.officialNote ? (ms ? `kenyataan Rapid KL: "${inc.officialNote}"` : `Rapid KL statement: "${inc.officialNote}"`) : null,
      ]
        .filter(Boolean)
        .join("; "),
    };
  }
  if (inc.type === "bus_route" || inc.type === "bus_stall") {
    const where = await placeNear(inc.center);
    const route = inc.routeId ? inc.routeId.replace(/0$/, "") : "";
    return {
      text: ms
        ? `Bas Rapid KL laluan ${route} tidak bergerak${where ? ` berhampiran ${where}` : ""} ${when}, menunjukkan kesesakan atau sekatan jalan raya.`
        : `Rapid KL buses on route ${route} were stationary${where ? ` near ${where}` : ""} ${when}, indicating road congestion or a blockage.`,
      source: ms ? "Kedudukan GPS langsung bas Rapid KL (GTFS Realtime, data.gov.my)" : "Rapid KL live bus GPS positions (GTFS Realtime, data.gov.my)",
    };
  }
  // weather
  const flood = FLOOD.test(`${inc.title} ${inc.summary}`);
  return {
    text: ms
      ? `MET Malaysia mengeluarkan "${inc.title}" bagi Kuala Lumpur dan Selangor, berkuat kuasa ${when}.${flood ? " Amaran itu menyebut risiko banjir kilat." : ""}`
      : `MET Malaysia issued a "${inc.title}" covering Kuala Lumpur and Selangor, in force ${when}.${flood ? " The warning notes a risk of flash floods." : ""}`,
    source: ms ? "Suapan amaran cuaca MET Malaysia (data.gov.my)" : "MET Malaysia weather warning feed (data.gov.my)",
  };
}

type Relevant = (o: Incident) => boolean;

/** Disruptions that could have touched this student's trip: their rail line, their bus route or a bus
 *  stuck within 3 km of home or APU, and KL weather warnings. Anything else stays out of the report. */
function relevanceFor(user: UserDoc | null): Relevant {
  const legs = user?.route?.legs ?? [];
  const lineIds = new Set(legs.filter((l) => l.mode === "rail" && l.lineId).map((l) => l.lineId!));
  const routeIds = new Set(legs.filter((l) => l.mode === "bus" && l.routeId).map((l) => l.routeId!));
  const pts = [APU, ...(user?.homeLocation ? [user.homeLocation] : [])];
  const near = (c?: { lat: number; lon: number } | null) => !!c && pts.some((q) => distance([c.lon, c.lat], [q.lon, q.lat], { units: "meters" }) <= 3000);
  return (o) =>
    o.type === "weather" ||
    (o.type === "train_stall" && (lineIds.size === 0 || lineIds.has(o.lineId ?? ""))) ||
    ((o.type === "bus_route" || o.type === "bus_stall") && (routeIds.has(o.routeId ?? "") || near(o.center)));
}

async function gather(inc: Incident, r: LetterRequest, ms: boolean, self = false, relevant: Relevant = () => true) {
  const end = inc.clearedAt ?? Date.now();
  // other incidents that overlapped this one (weather, road congestion seen by buses, other rail stalls)
  const near = await db.collection("incidents").where("startedAt", ">=", inc.startedAt - 3 * 3600_000).get().catch(() => null);
  const others = (near?.docs ?? [])
    .map((d) => ({ ...(d.data() as Incident), id: d.id }))
    .filter((o) => o.id !== inc.id && relevant(o) && o.simulated === inc.simulated && o.startedAt <= end && (o.clearedAt ?? Date.now()) >= inc.startedAt - 30 * 60_000)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(0, 4);

  const findings = self ? [] : [await findingFor(inc, ms)];
  for (const o of others) findings.push(await findingFor(o, ms));

  // MET warning active at the time but not logged as its own incident
  if (!others.some((o) => o.type === "weather") && inc.type !== "weather") {
    const cond = (await db.doc("conditions/current").get().catch(() => null))?.data() as Conditions | undefined;
    const met = !inc.clearedAt || self ? cond?.metWarnings?.find((w) => w.affectsKL && (self || !!w.simulated === inc.simulated)) : null;
    if (met) {
      const flood = FLOOD.test(`${met.title} ${met.text}`);
      findings.push({
        text: ms
          ? `MET Malaysia mengeluarkan "${met.title.replace(/\s*\(SIMULATED\)/, "")}" bagi kawasan Lembah Klang${met.validTo ? `, sah sehingga ${met.validTo.slice(11, 16)}` : ""}.${flood ? " Amaran itu menyebut risiko banjir kilat." : ""}`
          : `MET Malaysia issued a "${met.title.replace(/\s*\(SIMULATED\)/, "")}" for the Klang Valley${met.validTo ? `, valid until ${met.validTo.slice(11, 16)}` : ""}.${flood ? " The warning notes a risk of flash floods." : ""}`,
        source: ms ? "Suapan amaran cuaca MET Malaysia (data.gov.my)" : "MET Malaysia weather warning feed (data.gov.my)",
      });
    } else if (inc.weatherAtStart?.metWarning) {
      findings.push({ text: ms ? "Amaran cuaca MET Malaysia berkuat kuasa bagi Kuala Lumpur ketika gangguan bermula." : "A MET Malaysia weather warning was in force for Kuala Lumpur when the disruption began.", source: ms ? "MET Malaysia (data.gov.my)" : "MET Malaysia (data.gov.my)" });
    }
  }

  let w = inc.weatherAtStart;
  if (!w && self) {
    const cond = (await db.doc("conditions/current").get().catch(() => null))?.data() as Conditions | undefined;
    if (cond) w = { rainProb: cond.rain?.probNextHour ?? null, apparentTemp: cond.heat?.apparentTemp ?? null };
  }
  if (w && (w.rainProb != null || w.apparentTemp != null)) {
    const bits = [
      w.rainProb != null ? (ms ? `kebarangkalian hujan ${Math.round(w.rainProb)}% dalam sejam berikutnya` : `${/^(8|11|18)/.test(String(Math.round(w.rainProb))) ? "an" : "a"} ${Math.round(w.rainProb)}% chance of rain in the following hour`) : null,
      w.apparentTemp != null ? (ms ? `suhu terasa ${Math.round(w.apparentTemp)}°C` : `an apparent temperature of ${Math.round(w.apparentTemp)}°C`) : null,
    ].filter(Boolean);
    findings.push({ text: ms ? `Ramalan cuaca di APU pada ${fmtMyt(inc.startedAt)}: ${bits.join(", ")}.` : `Weather at APU at ${fmtMyt(inc.startedAt)}: ${bits.join(" and ")}.`, source: "Open-Meteo forecast, or MET Norway when Open-Meteo is unavailable" });
  }

  const disrupted = findings.some((f) => !/Open-Meteo|MET Norway/.test(f.source));
  if (self && !disrupted) {
    findings.unshift({
      text: ms
        ? `Tiada gangguan direkodkan oleh penumpang Sampai, GPS bas langsung Rapid KL atau MET Malaysia ${span(inc.startedAt, end, ms)}.`
        : `No disruption was recorded by Sampai riders, Rapid KL live bus GPS or MET Malaysia ${span(inc.startedAt, end, ms)}.`,
      source: ms ? "Log insiden Sampai; MET Malaysia (data.gov.my)" : "Sampai incident log; MET Malaysia (data.gov.my)",
    });
  }

  // the student's own trip: their Sampai on-board session, if they tapped "I'm on the train"
  let departed: number | null = null;
  let notified: number | null = null;
  if (r.uid) {
    const [s, a] = await Promise.all([db.collection("sessions").where("uid", "==", r.uid).get().catch(() => null), db.doc(`alerts/${inc.id}_${r.uid}`).get().catch(() => null)]);
    const ses = (s?.docs ?? []).map((d) => d.data() as { startedAt: number }).filter((x) => x.startedAt <= end && x.startedAt >= inc.startedAt - 2 * 3600_000).sort((x, y) => y.startedAt - x.startedAt)[0];
    departed = ses?.startedAt ?? null;
    if (a?.exists) notified = (a.data() as AlertDoc).sentAt;
  }

  const arrival = r.arrivedAt || r.eta;
  const lateMin = arrival && r.classStart ? hhmmToMin(arrival) - hhmmToMin(r.classStart) : null;
  const L = (en: string, m: string) => (ms ? m : en);
  const journey: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => journey.push({ label, value });
  if (departed) add(L("Boarded / departed", "Menaiki / bertolak"), `${fmtMyt(departed)} (${L("Sampai trip log", "log perjalanan Sampai")})`);
  if (notified) add(L("Alerted to the disruption", "Dimaklumkan tentang gangguan"), fmtMyt(notified));
  if (r.optionTaken) add(L("Alternative taken", "Alternatif diambil"), r.optionTaken);
  if (r.arrivedAt) add(L("Arrival at APU", "Tiba di APU"), `${r.arrivedAt} (${L("reported by the student", "dilaporkan oleh pelajar")})`);
  else if (r.eta) add(L("Arrival at APU", "Tiba di APU"), `${r.eta} (${L("estimated by Sampai", "anggaran Sampai")})`);
  if (r.classStart) add(L("Class start", "Kelas bermula"), `${r.classStart}${r.room ? `, ${r.room}` : ""}`);
  if (lateMin != null) add(L("Lateness", "Kelewatan"), lateMin > 0 ? L(`${lateMin} min`, `${lateMin} minit`) : L("On time", "Tepat masa"));
  return { findings, journey, lateMin, departed, disrupted, arrival };
}

function subjectFor(r: LetterRequest, inc: Incident, ms: boolean, self = false) {
  const cls = r.classTitle ? `${r.classTitle}, ${dayOf(inc.startedAt, ms)}` : dayOf(inc.startedAt, ms);
  if (self) return ms ? `Laporan Perjalanan ke Kelas (${cls})` : `Journey Report: Travel to Class (${cls})`;
  const cause = inc.type === "weather" ? (ms ? "Cuaca Buruk" : "Severe Weather") : inc.type === "train_stall" ? (ms ? "Gangguan Perkhidmatan Rel" : "Rail Service Disruption") : ms ? "Kesesakan Jalan Raya" : "Road Congestion";
  return ms ? `Laporan Insiden: ${cause} Menjejaskan Perjalanan ke Kelas (${cls})` : `Incident Report: ${cause} Affecting Travel to Class (${cls})`;
}

function templateProse(r: LetterRequest, inc: Incident, g: Awaited<ReturnType<typeof gather>>, ms: boolean) {
  const who = r.studentName + (r.studentId ? ` (${r.studentId})` : "");
  const cls = `${r.classTitle ?? (ms ? "kelas" : "class")}${r.classStart ? (ms ? ` jam ${r.classStart}` : ` at ${r.classStart}`) : ""}`;
  const day = dayOf(inc.startedAt, ms);
  const late = g.lateMin != null && g.lateMin > 0;
  const summary = ms
    ? `Pada ${day}, ${who} sedang dalam perjalanan ke ${cls} di APU${g.departed ? `, setelah bertolak pada ${fmtMyt(g.departed)}` : ""}. Perjalanan tersebut terjejas oleh ${g.findings.length > 1 ? "peristiwa-peristiwa" : "peristiwa"} yang direkodkan di bawah.${late ? ` Akibatnya, ${r.studentName} dijangka tiba pada ${r.eta}, iaitu ${g.lateMin} minit selepas kelas bermula.` : ""}`
    : `On ${day}, ${who} was travelling to ${cls} at APU${g.departed ? `, having departed at ${fmtMyt(g.departed)}` : ""}. The journey was disrupted by the ${g.findings.length > 1 ? "events" : "event"} recorded below.${late ? ` ${g.disrupted ? "As a result, " : ""}${r.studentName} ${r.arrivedAt ? "arrived" : "was expected to arrive"} at ${g.arrival}, ${g.lateMin} minutes after the class started.` : ""}`;
  const wx = g.findings.some((f) => /MET/.test(f.source));
  const conclusion = !g.disrupted
    ? ms
      ? `Rekod di atas tidak menunjukkan gangguan pengangkutan awam atau amaran cuaca bagi tempoh tersebut. Butiran perjalanan ${r.studentName} direkodkan seperti di atas untuk rujukan pensyarah.`
      : `The records above show no public transport disruption or weather warning for this period. ${r.studentName}'s journey details are recorded above for the lecturer's reference.`
    : !late
    ? ms
      ? `Berdasarkan rekod di atas, perjalanan ${r.studentName} terjejas oleh keadaan di luar kawalan pelajar. ${r.optionTaken ? `${r.studentName} telah mengambil laluan alternatif sebaik sahaja dimaklumkan dan dijangka tiba tepat pada masanya.` : `${r.studentName} tidak direkodkan sebagai lewat.`} Rekod ini boleh disahkan melalui kod QR.`
      : `On the basis of the records above, ${r.studentName}'s journey was affected by conditions outside the student's control. ${r.optionTaken ? `${r.studentName} took an alternative route once alerted and was expected to arrive on time.` : `${r.studentName} was not recorded as late.`} The record can be verified using the QR code.`
    : ms
    ? `Berdasarkan rekod di atas, kelewatan ${r.studentName} disebabkan oleh keadaan pengangkutan awam${g.findings.some((f) => /MET/.test(f.source)) ? " dan cuaca" : ""} di luar kawalan pelajar.${r.optionTaken ? ` ${r.studentName} telah mengambil laluan alternatif sebaik sahaja dimaklumkan.` : ""} Rekod ini boleh disahkan melalui kod QR.`
    : `On the basis of the records above, ${r.studentName}'s late arrival was caused by public transport${g.findings.some((f) => /MET/.test(f.source)) ? " and weather" : ""} conditions outside the student's control.${r.optionTaken ? ` ${r.studentName} took an alternative route once alerted.` : ""} The record can be verified using the QR code.`;
  return { summary, conclusion };
}

function refNo(inc: Incident) {
  return `SMP/${myt(inc.startedAt).date.replace(/-/g, "")}/${inc.id.split("-").pop()}`;
}

export async function createLetter(r: LetterRequest): Promise<LetterDoc> {
  let inc: Incident | null = null;
  let self = false;
  const userDoc = r.uid ? ((await db.doc(`users/${r.uid}`).get().catch(() => null))?.data() as UserDoc | undefined) ?? null : null;
  const relevant = relevanceFor(userDoc);
  if (r.incidentId && r.incidentId !== "self") {
    inc = await getIncident(r.incidentId);
    if (!inc) throw Object.assign(new Error("incident not found"), { status: 404 });
  } else {
    // no alert: anchor on the most relevant disruption of the last 3 hours, if there is one
    const since = (r.asOf ?? Date.now()) - 3 * 3600_000;
    const recent = await db.collection("incidents").where("startedAt", ">=", since).get().catch(() => null);
    const rank = { train_stall: 0, bus_route: 1, bus_stall: 1, weather: 2 } as Record<string, number>;
    const list = (recent?.docs ?? []).map((d) => ({ ...(d.data() as Incident), id: d.id })).filter(relevant).sort((a, b) => (rank[a.type] ?? 3) - (rank[b.type] ?? 3) || b.startedAt - a.startedAt);
    inc = list[0] ?? null;
    if (inc) r.incidentId = inc.id;
    else {
      self = true;
      const now = Date.now();
      inc = { id: `SELF-${myt(now).date.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, type: "weather", status: "cleared", startedAt: now - 2 * 3600_000, updatedAt: now, clearedAt: null, riderCount: 0, confidence: "low", source: "manual", simulated: false, title: "Journey report" } as Incident;
      r.incidentId = inc.id;
    }
  }

  // fill blanks from the student's alert (class, lecturer from APSpace, option chosen) and profile
  if (r.uid) {
    const [a, u] = await Promise.all([db.doc(`alerts/${inc.id}_${r.uid}`).get(), db.doc(`users/${r.uid}`).get()]);
    if (a.exists) {
      const al = a.data() as AlertDoc;
      r.classTitle ||= al.classTitle ?? undefined;
      r.classStart ||= al.classStart ?? undefined;
      r.lecturerName ||= al.lecturer ?? undefined;
      const best = al.options.find((o) => o.id === al.bestOptionId);
      r.optionTaken ||= best?.label;
      r.eta ||= best?.arrivalTime;
    }
    if (u.exists) r.intake ||= (u.data() as UserDoc).intake ?? undefined;
  }

  const ms = r.lang === "ms";
  const g = await gather(inc, r, ms, self, relevant);
  const fallback = templateProse(r, inc, g, ms);

  const prompt = `You are writing two paragraphs of a formal incident report submitted to a university lecturer. The report documents how a disruption affected a student's journey to class.

Student: ${r.studentName}${r.studentId ? ` (${r.studentId})` : ""}${r.intake ? `, intake ${r.intake}` : ""}
Class: ${r.classTitle ?? "class"}${r.classStart ? ` at ${r.classStart}` : ""}${r.room ? ` in ${r.room}` : ""}, ${dayOf(inc.startedAt, ms)}

Findings (each with its source):
${g.findings.map((f, i) => `${i + 1}. ${f.text} [Source: ${f.source}]`).join("\n")}

Student's journey:
${g.journey.map((j) => `- ${j.label}: ${j.value}`).join("\n") || "- not recorded"}

Return JSON {"summary": "...", "conclusion": "..."}.
- summary: 2 to 3 sentences. Who was travelling where and when, what disrupted the journey (name the service/road/weather and cite the source, e.g. "according to MET Malaysia"), and the result (arrival time and minutes late, if known).
- conclusion: 1 to 2 sentences. ${
    !g.disrupted
      ? "No disruption was recorded. State only that the records show no public transport disruption or weather warning for this period, and that the student's journey details are recorded for the lecturer's reference. Do NOT say the lateness was outside the student's control, and do NOT mention a QR code."
      : `${g.lateMin != null && g.lateMin > 0 ? `State that, on the basis of the records, the ${g.lateMin}-minute late arrival was caused by conditions outside the student's control` : "State that, on the basis of the records, the journey was affected by conditions outside the student's control (the student was not recorded as late)"}, and that the record can be verified by QR code.`
  }
- Voice: THIRD PERSON, impersonal report register ("The student", "${r.studentName}"; never I, me, my, we, you). Not a letter: no salutation, no request, no thanks.
- Use only the facts given. Do not invent roads, times, causes or numbers. Do not apologise or use emotional words.
- Language: ${ms ? "Bahasa Melayu (formal, laporan rasmi)" : "British English"}.`;
  const firstPerson = /\b(I|my|me|we|our|you|your)\b/;
  const overclaims = (o: { conclusion: string }) => !g.disrupted && /(outside (of )?the student's control|beyond (the student's|their) control|QR|di luar kawalan|kod QR)/i.test(o.conclusion);
  const bad = (o: { summary: string; conclusion: string } | null) =>
    !o?.summary || !o?.conclusion
      ? "empty"
      : !ms && firstPerson.test(`${o.summary} ${o.conclusion}`)
        ? `first person: "${`${o.summary} ${o.conclusion}`.match(firstPerson)![0]}"`
        : overclaims(o)
          ? "claims a cause the records do not show"
          : null;
  let out = await geminiJSON<{ summary: string; conclusion: string }>(prompt);
  let why = out ? bad(out) : "gemini unavailable";
  if (out && why) {
    out = await geminiJSON<{ summary: string; conclusion: string }>(`${prompt}\n\nYour previous answer was rejected (${why}). Rewrite strictly in the third person.`);
    why = out ? bad(out) : "gemini unavailable";
  }
  const okG = !why;
  if (why) console.warn(`[letter] using template: ${why}`);
  const prose = okG ? out! : fallback;

  const facts: Record<string, string> = self
    ? {
        [ms ? "Jenis laporan" : "Report type"]: ms ? "Diminta oleh pelajar (tiada amaran)" : "Requested by the student (no alert)",
        [ms ? "Tempoh disemak" : "Period checked"]: `${fmtMyt(inc.startedAt, true)} - ${fmtMyt(Date.now())}`,
        [ms ? "Rujukan" : "Reference"]: inc.id,
      }
    : {
        [ms ? "Rujukan insiden" : "Incident reference"]: inc.id,
        [ms ? "Dikesan pada" : "Detected at"]: fmtMyt(inc.startedAt, true),
        [ms ? "Status" : "Status"]: inc.status === "active" ? (ms ? "Masih berterusan" : "Ongoing") : ms ? "Selesai" : "Cleared",
      };

  const ref = db.collection("letters").doc();
  const doc: LetterDoc = {
    ...r,
    id: ref.id,
    refNo: refNo(inc),
    subject: subjectFor(r, inc, ms, self),
    body: prose.summary.trim(),
    findings: g.findings,
    journey: g.journey,
    conclusion: prose.conclusion.trim(),
    lateMin: g.lateMin,
    createdAt: Date.now(),
    generatedBy: okG ? "gemini" : "template",
    ...(why ? { templateReason: why } : {}),
    facts,
    simulated: inc.simulated,
    ...(self ? { self: true } : {}),
  };
  await ref.set(JSON.parse(JSON.stringify(doc)));
  return doc;
}

export async function getLetter(id: string) {
  const s = await db.doc(`letters/${id}`).get();
  return s.exists ? (s.data() as LetterDoc) : null;
}

const C = { ink: "#1d1a2e", muted: "#6b6880", accent: "#5b3fc2", line: "#dcdae6", warn: "#8a5a00", panel: "#f6f5fa" };

export async function renderPdf(letter: LetterDoc): Promise<Buffer> {
  const incidentUrl = `${PUBLIC_WEB_URL}/incident/${letter.incidentId}`;
  const qr = letter.self ? null : await QRCode.toBuffer(incidentUrl, { margin: 1, width: 240 });
  const ms = letter.lang === "ms";
  const T = (en: string, m: string) => (ms ? m : en);
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, left: 64, right: 64, bottom: 70 }, info: { Title: letter.subject, Author: "Sampai", Subject: `Incident report ${letter.refNo}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const L = 64;
  const W = doc.page.width - 128;
  const label = (t: string, x: number, y: number, w = 200) => doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text(t.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });
  const heading = (n: number, t: string) => {
    doc.moveDown(1.1);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(C.ink).text(`${n}.  ${t.toUpperCase()}`, L, doc.y, { width: W, characterSpacing: 0.4 });
    doc.moveDown(0.4);
  };

  // header
  doc.rect(0, 0, doc.page.width, 6).fill(C.accent);
  doc.font("Helvetica-Bold").fontSize(17).fillColor(C.ink).text("Sampai", L, 40);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(T("Incident Report", "Laporan Insiden"), L, 60);
  doc.text(`${T("Ref. No.", "No. Rujukan")}: ${letter.refNo}`, L, 40, { width: W, align: "right" });
  doc.text(`${T("Issued", "Dikeluarkan")}: ${fmtMyt(letter.createdAt, true)}`, L, 53, { width: W, align: "right" });
  if (letter.simulated) doc.font("Helvetica-Bold").fillColor(C.warn).text(T("SIMULATED INCIDENT (DEMO)", "SIMULASI (DEMO)"), L, 66, { width: W, align: "right" });
  doc.moveTo(L, 86).lineTo(L + W, 86).strokeColor(C.line).lineWidth(0.8).stroke();

  // title + parties
  doc.font("Helvetica-Bold").fontSize(12.5).fillColor(C.ink).text(letter.subject, L, 100, { width: W, lineGap: 2 });
  let y = doc.y + 12;
  const colW = W / 2 - 12;
  label(T("Prepared for", "Disediakan untuk"), L, y);
  label(T("Concerning", "Berkenaan"), L + W / 2 + 12, y);
  y += 13;
  const to = [letter.lecturerName || T("Lecturer", "Pensyarah"), letter.classTitle, letter.room].filter(Boolean) as string[];
  const about = [letter.studentName, letter.studentId ? `${T("Student ID", "No. Pelajar")}: ${letter.studentId}` : null, letter.intake ? `Intake: ${letter.intake}` : null].filter(Boolean) as string[];
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(C.ink).text(to[0], L, y, { width: colW });
  doc.text(about[0], L + W / 2 + 12, y, { width: colW });
  doc.font("Helvetica").fontSize(10).fillColor(C.ink);
  to.slice(1).forEach((t, i) => doc.text(t, L, y + 15 + i * 14, { width: colW }));
  about.slice(1).forEach((t, i) => doc.text(t, L + W / 2 + 12, y + 15 + i * 14, { width: colW }));
  doc.y = y + 15 + Math.max(to.length, about.length) * 14;
  doc.x = L;

  const para = (t: string) => doc.font("Helvetica").fontSize(10.3).fillColor(C.ink).text(t, L, doc.y, { width: W, align: "justify", lineGap: 2.5 });

  heading(1, T("Summary", "Ringkasan"));
  para(letter.body);

  heading(2, T("Findings", "Penemuan"));
  letter.findings.forEach((f, i) => {
    const top = doc.y;
    doc.font("Helvetica").fontSize(10.3).fillColor(C.ink).text(`${i + 1}.`, L, top, { width: 16 });
    doc.text(f.text, L + 18, top, { width: W - 18, lineGap: 2.5 });
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(C.muted).text(`${T("Source", "Sumber")}: ${f.source}`, L + 18, doc.y + 1, { width: W - 18 });
    doc.moveDown(0.5);
  });

  if (letter.journey.length) {
    heading(3, T("The student's journey", "Perjalanan pelajar"));
    for (const { label: k, value: v } of letter.journey) {
      const top = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor(C.muted).text(k, L, top, { width: 150 });
      const h1 = doc.y;
      doc.fillColor(C.ink).text(v, L + 160, top, { width: W - 160 });
      doc.y = Math.max(h1, doc.y) + 3;
    }
  }

  heading(letter.journey.length ? 4 : 3, T("Conclusion", "Kesimpulan"));
  para(letter.conclusion);

  // verification panel
  const panelH = 132;
  let py = doc.y + 18;
  if (py + panelH > doc.page.height - 80) {
    doc.addPage();
    py = 56;
  }
  doc.roundedRect(L, py, W, panelH, 8).fill(C.panel);
  label(T("Verification", "Pengesahan"), L + 16, py + 13);
  let ry = py + 30;
  for (const [k, v] of Object.entries(letter.facts)) {
    doc.font("Helvetica").fontSize(8.8).fillColor(C.muted).text(k, L + 16, ry, { width: 110 });
    doc.fillColor(C.ink).text(v, L + 130, ry, { width: W - 290 });
    ry += 15;
  }
  doc.font("Helvetica").fontSize(8.3).fillColor(C.muted).text(letter.self ? T("Prepared automatically by Sampai from the public records cited, at the student's request.", "Disediakan secara automatik oleh Sampai daripada rekod awam yang dinyatakan, atas permintaan pelajar.") : T("Prepared automatically by Sampai from the records cited. Scan the code to see the live incident log.", "Disediakan secara automatik oleh Sampai daripada rekod yang dinyatakan. Imbas kod untuk melihat log insiden."), L + 16, ry + 6, { width: W - 160, lineGap: 1 });
  if (qr) doc.image(qr, L + W - 122, py + 12, { width: 106 });

  // footer
  const fy = doc.page.height - 58;
  doc.page.margins.bottom = 0;
  doc.moveTo(L, fy).lineTo(L + W, fy).strokeColor(C.line).lineWidth(0.6).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(
    T(
      `Sources: Sampai rider sensors, Rapid KL GTFS Realtime and MET Malaysia via data.gov.my (CC BY 4.0), Open-Meteo. This report is not an operator statement. Verify at ${incidentUrl}.`,
      `Sumber: sensor penumpang Sampai, GTFS Realtime Rapid KL dan MET Malaysia melalui data.gov.my (CC BY 4.0), Open-Meteo. Laporan ini bukan kenyataan pengendali. Sahkan di ${incidentUrl}.`,
    ),
    L,
    fy + 8,
    { width: W, lineGap: 1 },
  );
  doc.end();
  return done;
}
