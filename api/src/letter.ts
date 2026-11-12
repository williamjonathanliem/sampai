import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { db } from "../../shared/server/firebase";
import { getIncident } from "../../shared/server/incidents";
import { geminiText } from "../../shared/server/gemini";
import { PUBLIC_WEB_URL } from "../../shared/server/env";
import { fmtMyt, myt } from "../../shared/time";
import type { AlertDoc, Incident, UserDoc } from "../../shared/types";

export interface LetterRequest {
  uid?: string;
  incidentId: string;
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

export interface LetterDoc extends LetterRequest {
  id: string;
  refNo: string;
  subject: string;
  body: string;
  createdAt: number;
  generatedBy: "gemini" | "template";
  facts: Record<string, string>;
  simulated: boolean;
}

/** Fact values in the notice's language. Keys stay English (internal); PDF labels are translated. */
function facts(inc: Incident, r: LetterRequest, ms = false) {
  const end = inc.clearedAt ?? null;
  const dur = end ? Math.max(1, Math.round((end - inc.startedAt) / 60000)) : null;
  const locale = ms ? "ms-MY" : "en-GB";
  const day = new Date(inc.startedAt).toLocaleDateString(locale, { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" });
  const conf = ms ? ({ low: "rendah", medium: "sederhana", high: "tinggi" } as const)[inc.confidence] : inc.confidence;
  const line = ms ? (inc.lineName ?? "LRT").replace(/^(.*) Line$/, "Laluan $1") : inc.lineName ?? "LRT";
  const transport =
    inc.type === "train_stall"
      ? ms ? `${line}, antara ${inc.fromName} dan ${inc.toName}` : `${line}, between ${inc.fromName} and ${inc.toName}`
      : inc.type === "weather"
        ? ms ? "Amaran cuaca buruk (MET Malaysia)" : "Severe weather warning (MET Malaysia)"
        : ms ? `Laluan bas Rapid KL ${inc.routeId}` : `Rapid KL bus route ${inc.routeId}`;
  const from = fmtMyt(inc.startedAt);
  const window = ms
    ? `${day}, ${from} hingga ${end ? `${fmtMyt(end)} (${dur} minit)` : "masih berterusan semasa notis dikeluarkan"}`
    : `${day}, ${from} to ${end ? `${fmtMyt(end)} (${dur} min)` : "ongoing at time of issue"}`;
  return {
    Class: ms
      ? `${r.classTitle ?? "kelas"} pada ${day}${r.classStart ? `, jam ${r.classStart}` : ""}${r.room ? ` (${r.room})` : ""}`
      : `${r.classTitle ?? "class"} on ${day}${r.classStart ? ` at ${r.classStart}` : ""}${r.room ? ` (${r.room})` : ""}`,
    Service: transport,
    "Disruption window": window,
    "Detected by":
      inc.source === "riders"
        ? ms ? `${inc.riderCount} peranti penumpang berasingan di laluan yang sama (keyakinan ${conf})` : `${inc.riderCount} independent rider devices on the same stretch (${conf} confidence)`
        : inc.source === "gtfs-r"
          ? ms ? "Kedudukan bas langsung Rapid KL (GTFS Realtime)" : "Rapid KL live bus positions (GTFS Realtime)"
          : inc.source === "met"
            ? ms ? "Suapan amaran MET Malaysia" : "MET Malaysia warning feed"
            : ms ? "Laporan manual" : "Manual report",
    "Operator statement": inc.officialNote || (ms ? "Tiada kenyataan dikeluarkan semasa notis ini" : "None published at time of issue"),
    "Alternative taken": [r.optionTaken, r.eta ? (ms ? `anggaran tiba ${r.eta}` : `estimated arrival ${r.eta}`) : ""].filter(Boolean).join(", ") || (ms ? "Tidak direkodkan" : "Not recorded"),
    "Incident reference": inc.id,
  };
}

const LABELS_MS: Record<string, string> = {
  Class: "Kelas",
  Service: "Perkhidmatan",
  "Disruption window": "Tempoh gangguan",
  "Detected by": "Dikesan oleh",
  "Operator statement": "Kenyataan pengendali",
  "Alternative taken": "Alternatif diambil",
  "Incident reference": "Rujukan insiden",
};

function subjectFor(r: LetterRequest, inc: Incident, ms: boolean) {
  const date = new Date(inc.startedAt).toLocaleDateString(ms ? "ms-MY" : "en-GB", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "long", year: "numeric" });
  const cls = r.classTitle ? `${r.classTitle}, ${date}` : date;
  return ms ? `Notis Gangguan Pengangkutan Awam yang Menjejaskan Kehadiran: ${cls}` : `Notice of Public Transport Disruption Affecting Attendance: ${cls}`;
}

function templateBody(f: Record<string, string>, r: LetterRequest, ms: boolean) {
  if (ms) {
    return [
      `Dengan hormatnya saya merujuk perkara di atas. Saya ingin memaklumkan bahawa perjalanan saya ke ${f.Class} terjejas akibat gangguan perkhidmatan ${f.Service}, ${f["Disruption window"]}.`,
      `Gangguan ini direkodkan secara automatik oleh ${f["Detected by"]} (rujukan ${f["Incident reference"]}). Saya telah menggunakan laluan alternatif (${f["Alternative taken"]}).`,
      `Sehubungan itu, saya memohon agar kelewatan atau ketidakhadiran saya direkodkan sebagai berpunca daripada keadaan di luar kawalan saya, selaras dengan polisi kehadiran universiti. Rekod insiden boleh disahkan melalui kod QR yang dilampirkan.`,
    ].join("\n\n");
  }
  return [
    `I write to formally notify you that my journey to ${f.Class} was affected by a disruption to ${f.Service}, recorded on ${f["Disruption window"]}.`,
    `The disruption was detected by ${f["Detected by"]} and is logged under reference ${f["Incident reference"]}. Operator statement: ${f["Operator statement"].toLowerCase()}. I took an alternative route (${f["Alternative taken"]}).`,
    `I therefore request that my late arrival or absence be recorded as caused by circumstances beyond my control, in line with the university's attendance policy. The incident record can be verified using the QR code on this notice.`,
  ].join("\n\n");
}

function refNo(inc: Incident) {
  return `SMP/${myt(inc.startedAt).date.replace(/-/g, "")}/${inc.id.split("-").pop()}`;
}

export async function createLetter(r: LetterRequest): Promise<LetterDoc> {
  const inc = await getIncident(r.incidentId);
  if (!inc) throw Object.assign(new Error("incident not found"), { status: 404 });

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
  const f = facts(inc, r, ms);
  const prompt = `Write the body of a formal notice from a university student to their lecturer reporting that a public transport disruption affected their attendance.

Facts (use only these; do not invent anything):
${Object.entries(f).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

Requirements:
- Register: official correspondence, as used in Malaysian university administration. Factual and neutral.
- Voice: first person, written by the student (I / my; in Malay: saya). Not passive.
- Do NOT apologise and do not use emotional language ("sorry", "regret", "unfortunately", "inconvenience" are not allowed).
- Paragraph 1: state the class and the disruption (service, time window).
- Paragraph 2: how it was recorded (detected by, reference number, operator statement) and the alternative taken.
- Paragraph 3: request that the lateness or absence be recorded as caused by circumstances beyond the student's control, under the university's attendance policy, and note the record can be verified by the QR code.
- Language: ${ms ? "Bahasa Melayu (formal, surat rasmi)" : "British English"}. Under 170 words. Three paragraphs separated by a blank line.
- Return the body only: no subject line, no salutation, no sign-off, no placeholders in brackets.`;
  const g = await geminiText(prompt);
  const body = (g ?? templateBody(f, r, ms)).replace(/^(dear[^\n]*\n+|tuan[^\n]*\n+)/i, "").trim();

  const ref = db.collection("letters").doc();
  const doc: LetterDoc = {
    ...r,
    id: ref.id,
    refNo: refNo(inc),
    subject: subjectFor(r, inc, ms),
    body,
    createdAt: Date.now(),
    generatedBy: g ? "gemini" : "template",
    facts: f,
    simulated: inc.simulated,
  };
  await ref.set(JSON.parse(JSON.stringify(doc)));
  return doc;
}

export async function getLetter(id: string) {
  const s = await db.doc(`letters/${id}`).get();
  return s.exists ? (s.data() as LetterDoc) : null;
}

const C = { ink: "#1d1a2e", muted: "#6b6880", accent: "#5b3fc2", line: "#dcdae6", warn: "#8a5a00", warnBg: "#fbf3dc", panel: "#f6f5fa" };

export async function renderPdf(letter: LetterDoc): Promise<Buffer> {
  const incidentUrl = `${PUBLIC_WEB_URL}/incident/${letter.incidentId}`;
  const qr = await QRCode.toBuffer(incidentUrl, { margin: 1, width: 240 });
  const ms = letter.lang === "ms";
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, left: 64, right: 64, bottom: 40 }, info: { Title: letter.subject, Author: letter.studentName, Subject: `Disruption notice ${letter.refNo}` } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const L = 64;
  const W = doc.page.width - 128;
  const label = (t: string, x: number, y: number, w = 90) => doc.font("Helvetica").fontSize(8.5).fillColor(C.muted).text(t.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });

  // letterhead
  doc.rect(0, 0, doc.page.width, 6).fill(C.accent);
  doc.font("Helvetica-Bold").fontSize(17).fillColor(C.ink).text("Sampai", L, 40);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(ms ? "Notis Gangguan Pengangkutan Awam" : "Public Transport Disruption Notice", L, 60);
  doc.font("Helvetica").fontSize(9).fillColor(C.muted).text(`${ms ? "No. Rujukan" : "Ref. No."}: ${letter.refNo}`, L, 40, { width: W, align: "right" });
  doc.text(`${ms ? "Tarikh" : "Date"}: ${fmtMyt(letter.createdAt, true).replace(/, \d\d:\d\d$/, "")}`, L, 53, { width: W, align: "right" });
  if (letter.simulated) doc.font("Helvetica-Bold").fillColor(C.warn).text(ms ? "SIMULASI (DEMO)" : "SIMULATED INCIDENT (DEMO)", L, 66, { width: W, align: "right" });
  doc.moveTo(L, 86).lineTo(L + W, 86).strokeColor(C.line).lineWidth(0.8).stroke();

  // From / To blocks
  let y = 102;
  const colW = W / 2 - 12;
  label(ms ? "Kepada" : "To", L, y);
  label(ms ? "Daripada" : "From", L + W / 2 + 12, y);
  y += 13;
  const to = [letter.lecturerName || (ms ? "Pensyarah" : "Lecturer"), letter.classTitle, letter.room].filter(Boolean) as string[];
  const from = [letter.studentName, letter.studentId ? `${ms ? "No. Pelajar" : "Student ID"}: ${letter.studentId}` : null, letter.intake ? `${ms ? "Intake" : "Intake"}: ${letter.intake}` : null].filter(Boolean) as string[];
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(C.ink).text(to[0], L, y, { width: colW });
  doc.text(from[0], L + W / 2 + 12, y, { width: colW });
  doc.font("Helvetica").fontSize(10).fillColor(C.ink);
  to.slice(1).forEach((t, i) => doc.text(t, L, y + 15 + i * 14, { width: colW }));
  from.slice(1).forEach((t, i) => doc.text(t, L + W / 2 + 12, y + 15 + i * 14, { width: colW }));
  y += 15 + Math.max(to.length, from.length) * 14 + 10;

  // salutation + subject
  doc.font("Helvetica").fontSize(10.5).fillColor(C.ink).text(ms ? "Tuan/Puan," : `Dear ${letter.lecturerName ? letter.lecturerName : "Sir/Madam"},`, L, y);
  y = doc.y + 10;
  doc.font("Helvetica-Bold").fontSize(10.5).text(letter.subject.toUpperCase(), L, y, { width: W, lineGap: 2 });
  y = doc.y + 4;
  doc.moveTo(L, y).lineTo(L + W, y).strokeColor(C.ink).lineWidth(0.6).stroke();

  // body
  doc.font("Helvetica").fontSize(10.5).fillColor(C.ink).text(letter.body.replace(/\n\s*\n/g, "\n"), L, y + 12, { width: W, align: "justify", lineGap: 3, paragraphGap: 8 });

  // sign-off
  doc.moveDown(1);
  doc.text(ms ? "Sekian, terima kasih." : "Thank you for your attention.", L);
  doc.moveDown(1.4);
  doc.text(ms ? "Yang benar," : "Yours faithfully,");
  doc.moveDown(2.2);
  const sigY = doc.y;
  doc.moveTo(L, sigY).lineTo(L + 170, sigY).strokeColor(C.muted).lineWidth(0.6).stroke();
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(C.ink).text(letter.studentName, L, sigY + 5);
  if (letter.studentId) doc.font("Helvetica").fontSize(9.5).fillColor(C.muted).text(letter.studentId, L, doc.y + 1);

  // verification panel
  const rows = Object.entries(letter.facts);
  const panelTop = Math.max(doc.y + 22, 560);
  const textW = W - 150;
  doc.font("Helvetica").fontSize(8.8);
  const rowH = rows.map(([, v]) => Math.max(14, doc.heightOfString(v, { width: textW - 110 }) + 5));
  const panelH = Math.max(150, 30 + rowH.reduce((a, b) => a + b, 0) + 10);
  doc.roundedRect(L, panelTop, W, panelH, 8).fill(C.panel);
  label(ms ? "Pengesahan insiden" : "Incident verification", L + 16, panelTop + 13, 200);
  let ry = panelTop + 30;
  rows.forEach(([k, v], i) => {
    doc.font("Helvetica").fontSize(8.8).fillColor(C.muted).text(ms ? LABELS_MS[k] ?? k : k, L + 16, ry, { width: 100 });
    doc.fillColor(C.ink).text(v, L + 16 + 110, ry, { width: textW - 110 });
    ry += rowH[i];
  });
  doc.image(qr, L + W - 122, panelTop + 14, { width: 106 });
  doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(ms ? "Imbas untuk mengesahkan" : "Scan to verify", L + W - 122, panelTop + 124, { width: 106, align: "center" });

  // footer
  doc.page.margins.bottom = 0;
  const fy = doc.page.height - 58;
  doc.moveTo(L, fy).lineTo(L + W, fy).strokeColor(C.line).lineWidth(0.6).stroke();
  doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(
    ms
      ? `Notis ini dijana oleh Sampai daripada data sensor penumpang dan suapan pengangkutan awam (data.gov.my / Prasarana / MET Malaysia, CC BY 4.0). Ia bukan kenyataan pengendali. Sahkan di ${incidentUrl}.`
      : `Generated by Sampai from rider sensor data and public transport feeds (data.gov.my / Prasarana / MET Malaysia, CC BY 4.0). This is not an operator statement. Verify at ${incidentUrl}.`,
    L,
    fy + 8,
    { width: W, lineGap: 1 },
  );
  doc.end();
  return done;
}
