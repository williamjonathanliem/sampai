import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ArrowLeft, Download, ExternalLink, Sparkles, PencilLine, FileText } from "lucide-react";
import { db } from "../lib/firebase";
import { api, API_URL } from "../lib/api";
import { useIncident, useUid, useUserDoc } from "../lib/hooks";
import { useDesktop } from "../lib/useMedia";
import type { AlertDoc } from "../../../shared/types";
import { fmtMyt } from "../../../shared/time";
import { Badge, Button, ButtonLink, Field, Input, Segmented, SimTag, btn } from "../components/ui";

export default function Letter() {
  const { incidentId } = useParams();
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
      setLetter(await api("/letter", { uid, incidentId, studentName: name.trim() || "Student", studentId: studentId.trim() || undefined, lecturerName: lecturer.trim() || undefined, lang }));
    } catch (e: any) {
      setErr(`Couldn't generate the notice: ${e.message}. Check the api is running and try again.`);
    } finally {
      setBusy(false);
    }
  }

  const form = (
    <div className="space-y-5">
      <Field label="Your name" hint="Only printed on the letter. Not stored with your profile.">
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
      <Segmented
        value={lang}
        onChange={setLang}
        options={[
          { value: "en", label: "English" },
          { value: "ms", label: "Bahasa Melayu" },
        ]}
      />
      <Button size="lg" className="w-full" disabled={!inc} loading={busy} onClick={generate} icon={<Sparkles size={18} />}>
        {busy ? "Preparing notice" : letter ? "Regenerate notice" : "Generate notice"}
      </Button>
      {busy && <p className="text-center text-[13px] text-muted">Gemini is writing it from the incident record. This takes about 10 seconds.</p>}
      {err && <p className="text-sm text-stop">{err}</p>}
    </div>
  );

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
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{letter.lang === "ms" ? "Kepada" : "To"}</div>
            <div className="mt-1 font-semibold">{letter.lecturerName || "Lecturer"}</div>
            {letter.classTitle && <div className="text-muted">{letter.classTitle}</div>}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{letter.lang === "ms" ? "Daripada" : "From"}</div>
            <div className="mt-1 font-semibold">{letter.studentName}</div>
            <div className="text-muted">{[letter.studentId, letter.intake].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <p className="mt-6">{letter.lang === "ms" ? "Tuan/Puan," : `Dear ${letter.lecturerName || "Sir/Madam"},`}</p>
        <p className="mt-3 border-b border-fg pb-1.5 font-bold uppercase leading-snug tracking-[0.01em]">{letter.subject}</p>
        <div className="mt-4 max-w-[68ch] space-y-3 text-pretty">
          {String(letter.body)
            .split(/\n\s*\n/)
            .map((p: string, i: number) => (
              <p key={i}>{p.trim()}</p>
            ))}
        </div>
        <p className="mt-5">{letter.lang === "ms" ? "Sekian, terima kasih." : "Thank you for your attention."}</p>
        <p className="mt-4">{letter.lang === "ms" ? "Yang benar," : "Yours faithfully,"}</p>
        <div className="mt-8 w-44 border-t border-muted pt-1.5 font-semibold">{letter.studentName}</div>
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
        <p className="mt-3 font-semibold">Your notice appears here</p>
        <p className="mx-auto mt-1 max-w-[36ch] text-[13px] text-muted">Fill in your details and press Generate notice. It states the facts and requests the lateness be recorded as beyond your control.</p>
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
          <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em] lg:mt-0 lg:text-[32px]">Delay notice</h1>
          <p className="mt-1.5 text-[15px] text-muted">An official notice for your lecturer, built only from the incident record. They can scan the QR code to verify it.</p>

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

          {(desktop || !letter) && <div className="mt-6">{form}</div>}
        </div>

        {(desktop || letter) && <div className="mt-6 lg:mt-0">{preview}</div>}
      </div>
    </div>
  );
}
