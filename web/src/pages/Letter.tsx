import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Download, ExternalLink, Sparkles, PencilLine, FileText } from "lucide-react";
import { db } from "../lib/firebase";
import { api, API_URL } from "../lib/api";
import { useIncident, useUid, useUserDoc } from "../lib/hooks";
import { useDesktop } from "../lib/useMedia";
import type { AlertDoc } from "../../../shared/types";
import { fmtMyt } from "../../../shared/time";
import { Badge, Button, ButtonLink, Field, Input, Segmented, SimTag, btn } from "../components/ui";

function ReportSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-fg">
        {n}. {title}
      </h3>
      {children}
    </section>
  );
}

export default function Letter() {
  const { incidentId } = useParams();
  // /report (no incident): the student asked for a report without an alert; class comes from the query
  const [qs] = useSearchParams();
  const self = !incidentId;
  const nav = useNavigate();
  const desktop = useDesktop();
  const uid = useUid();
  const user = useUserDoc(uid);
  const inc = useIncident(incidentId);
  const [alert, setAlert] = useState<AlertDoc | null>(null);
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [lecturer, setLecturer] = useState("");
  const [lang, setLang] = useState<"en" | "ms">("en");
  const [arrivedAt, setArrivedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [letter, setLetter] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user?.displayName) setName((n) => n || user.displayName!);
    if (user?.lang) setLang(user.lang);
  }, [user]);

  useEffect(() => {
    if (!uid || !incidentId) return;
    getDoc(doc(db, "alerts", `${incidentId}_${uid}`)).then((s) => {
      if (!s.exists()) return;
      const a = s.data() as AlertDoc;
      setAlert(a);
      if (a.lecturer) setLecturer((l) => l || a.lecturer!);
    });
  }, [uid, incidentId]);

  async function generate() {
    setBusy(true);
    setErr("");
    try {
      setLetter(
        await api("/letter", {
          uid,
          incidentId: incidentId ?? "self",
          studentName: name.trim() || "Student",
          studentId: studentId.trim() || undefined,
          lecturerName: lecturer.trim() || qs.get("lecturer") || undefined,
          classTitle: qs.get("class") || undefined,
          classStart: qs.get("start") || undefined,
          room: qs.get("room") || undefined,
          arrivedAt: /^\d\d:\d\d$/.test(arrivedAt) ? arrivedAt : undefined,
          lang,
        }),
      );
    } catch (e: any) {
      setErr(`Couldn't generate the report: ${e.message}. Check the api is running and try again.`);
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <div className="space-y-5">
      <Field label="Your name" hint="Only printed on the report. Not stored with your profile.">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Student ID" hint="Optional">
          <Input value={studentId} onChange={(e) => setStudentId(e.target.value.toUpperCase())} placeholder="TP0XXXXX" />
        </Field>
        <Field label="Lecturer" hint={alert?.lecturer ? "From your APSpace timetable" : undefined}>
          <Input value={lecturer} onChange={(e) => setLecturer(e.target.value)} placeholder="Lecturer" />
        </Field>
      </div>
      <Field label="When did you arrive at APU?" hint="Optional. Leave empty and Sampai uses its own estimate, if it has one.">
        <Input type="time" value={arrivedAt} onChange={(e) => setArrivedAt(e.target.value)} className="tnum" />
      </Field>
      <Segmented
        value={lang}
        onChange={setLang}
        options={[
          { value: "en", label: "English" },
          { value: "ms", label: "Bahasa Melayu" },
        ]}
      />
      <Button size="lg" className="w-full" disabled={!self && !inc} loading={busy} onClick={generate} icon={<Sparkles size={18} />}>
        {busy ? "Preparing report" : letter ? "Regenerate report" : "Generate report"}
      </Button>
      {busy && <p className="text-center text-[13px] text-muted">{self ? "Sampai is checking the last 3 hours for disruptions, then Gemini writes it." : "Gemini is writing it from the incident record."} This takes about 10 seconds.</p>}
      {err && <p className="text-sm text-stop">{err}</p>}
    </div>
  );

  const ms = letter?.lang === "ms";
  const preview = letter ? (
    <div>
      <article className="rounded-2xl border border-line bg-surface p-6 text-[14.5px] leading-[1.65] shadow-[0_1px_3px_oklch(0.23_0.025_285/0.06)] lg:p-10 lg:text-[15px]">
        <div className="mb-6 flex items-center justify-between border-b border-line pb-3 text-xs text-muted">
          <span className="text-[15px] font-extrabold text-fg">
            Sampai<span className="text-brand">.</span>
          </span>
          {letter.generatedBy === "gemini" ? (
            <Badge tone="brand" icon={<Sparkles size={12} />}>
              Written with Gemini
            </Badge>
          ) : (
            <Badge>Template</Badge>
          )}
        </div>
        <div className="tnum flex flex-wrap justify-between gap-2 text-[12px] text-muted">
          <span>
            {letter.lang === "ms" ? "No. Rujukan" : "Ref. No."}: {letter.refNo}
          </span>
          <span>{new Date(letter.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <div className="mt-5 grid gap-4 text-[13.5px] sm:grid-cols-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{ms ? "Disediakan untuk" : "Prepared for"}</div>
            <div className="mt-1 font-semibold">{letter.lecturerName || "Lecturer"}</div>
            {letter.classTitle && <div className="text-muted">{letter.classTitle}</div>}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{ms ? "Berkenaan" : "Concerning"}</div>
            <div className="mt-1 font-semibold">{letter.studentName}</div>
            <div className="text-muted">{[letter.studentId, letter.intake].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <h2 className="mt-6 border-b border-fg pb-1.5 text-[16px] font-bold leading-snug">{letter.subject}</h2>
        <div className="max-w-[68ch] text-pretty">
          <ReportSection n={1} title={ms ? "Ringkasan" : "Summary"}>
            <p>{letter.body}</p>
          </ReportSection>
          <ReportSection n={2} title={ms ? "Penemuan" : "Findings"}>
            <ol className="space-y-3">
              {(letter.findings ?? []).map((f: { text: string; source: string }, i: number) => (
                <li key={i} className="grid grid-cols-[1.25rem_1fr]">
                  <span className="tnum">{i + 1}.</span>
                  <span>
                    {f.text}
                    <span className="mt-0.5 block text-[12.5px] italic text-muted">
                      {ms ? "Sumber" : "Source"}: {f.source}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </ReportSection>
          {letter.journey?.length > 0 && (
            <ReportSection n={3} title={ms ? "Perjalanan pelajar" : "The student's journey"}>
              <dl className="grid grid-cols-[minmax(0,11rem)_1fr] gap-x-4 gap-y-1.5 text-[14px]">
                {letter.journey.map(({ label: k, value: v }: { label: string; value: string }) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className={`tnum ${/lateness|kelewatan/i.test(k) ? "font-semibold text-stop" : ""}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </ReportSection>
          )}
          <ReportSection n={letter.journey?.length ? 4 : 3} title={ms ? "Kesimpulan" : "Conclusion"}>
            <p>{letter.conclusion}</p>
          </ReportSection>
        </div>
        <p className="mt-6 border-t border-line pt-3 text-[12px] text-muted">{ms ? "Disediakan secara automatik oleh Sampai daripada rekod yang dinyatakan. Imbas kod QR dalam PDF untuk mengesahkan." : "Prepared automatically by Sampai from the records cited. Scan the QR code on the PDF to verify."}</p>
      </article>
      <div className="mt-5 grid gap-2.5 sm:grid-cols-[1fr_auto_auto]">
        <ButtonLink href={`${API_URL}/letter/${letter.id}/pdf`} size="lg" icon={<Download size={18} />}>
          Download PDF
        </ButtonLink>
        <ButtonLink href={`${API_URL}/letter/${letter.id}/pdf?inline=1`} target="_blank" rel="noreferrer" variant="secondary" size="lg" icon={<ExternalLink size={16} />}>
          Open PDF
        </ButtonLink>
        {!desktop && (
          <Button variant="secondary" size="lg" onClick={() => setLetter(null)} icon={<PencilLine size={16} />}>
            Edit details
          </Button>
        )}
      </div>
    </div>
  ) : (
    <div className="grid h-full min-h-[420px] place-items-center rounded-2xl border border-dashed border-line-strong p-8 text-center">
      <div>
        <FileText size={28} className="mx-auto text-faint" />
        <p className="mt-3 font-semibold">Your report appears here</p>
        <p className="mx-auto mt-1 max-w-[36ch] text-[13px] text-muted">Fill in your details and press Generate report. It lists each cause with its source, your departure and arrival times, and how late you were.</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-[max(env(safe-area-inset-top),14px)] lg:max-w-6xl lg:px-10 lg:pt-8">
      <button onClick={() => nav(-1)} className={btn("ghost", "sm", "-ml-2")}>
        <ArrowLeft size={17} /> Back
      </button>

      <div className="lg:mt-6 lg:grid lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-12">
        <div>
          <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] lg:mt-0 lg:text-[32px]">Incident report</h1>
          <p className="mt-1.5 text-[15px] text-muted">An incident report for your lecturer: what happened, according to which source, and how it made you late. Built only from records; they can scan the QR code to verify it.</p>

          {inc && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={inc.status === "active" ? "stop" : "neutral"}>{inc.status === "active" ? "Ongoing" : "Resolved"}</Badge>
                {inc.simulated && <SimTag />}
                <span className="tnum text-xs text-muted">{inc.id}</span>
              </div>
              <div className="mt-2 font-semibold leading-snug">{inc.title}</div>
              <div className="tnum mt-1 text-[13px] text-muted">
                From {fmtMyt(inc.startedAt)} · {inc.riderCount} riders · {inc.confidence} confidence
              </div>
            </div>
          )}
          {inc === null && <p className="mt-6 text-sm text-stop">This incident doesn't exist any more. Go back and pick another alert.</p>}
          {self && (
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-[13.5px]">
              <div className="font-semibold">No alert needed</div>
              <p className="mt-1 text-muted">
                Sampai checks the last 3 hours for stalled trains, stuck buses and MET Malaysia warnings, and builds the report around what it finds. If nothing was recorded, the report says so honestly and records your journey.
                {qs.get("class") ? ` Class: ${qs.get("class")}${qs.get("start") ? ` at ${qs.get("start")}` : ""}.` : ""}
              </p>
            </div>
          )}

          {(desktop || !letter) && <div className="mt-6">{form}</div>}
        </div>

        {(desktop || letter) && <div className="mt-6 lg:mt-0">{preview}</div>}
      </div>
    </div>
  );
}
