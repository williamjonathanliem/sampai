import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FilePlus2, Database } from "lucide-react";
import MapView from "../components/MapView";
import { useIncidents } from "../lib/hooks";
import { api } from "../lib/api";
import { lineById } from "../../../shared/network";
import { fmtMyt, myt } from "../../../shared/time";
import type { Incident } from "../../../shared/types";
import { Badge, Button, ButtonLink, OpsBar, SimTag } from "../components/ui";

const LOOKER = import.meta.env.VITE_LOOKER_URL as string | undefined;

/** Horizontal bars: 4px rounded data end, ink labels, per-row hover value. */
function Bars({ rows, unit = "", color = "var(--color-brand)" }: { rows: { label: string; value: number; color?: string }[]; unit?: string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">No data yet</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.label} className="group grid grid-cols-[minmax(0,140px)_1fr_48px] items-center gap-3 rounded-lg px-1 py-1 hover:bg-sunken/70" title={`${r.label}: ${r.value}${unit}`}>
          <span className="truncate text-[13px] text-fg">{r.label}</span>
          <span className="h-3">
            <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color ?? color }} />
          </span>
          <span className="tnum text-right text-[13px] font-semibold text-fg">
            {r.value}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HourChart({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  const peak = (h: number) => (h >= 7 && h <= 9) || (h >= 17 && h <= 19);
  return (
    <div>
      <div className="relative flex h-36 items-end gap-[2px] border-b border-line-strong">
        {counts.map((c, h) => (
          <div key={h} className={`group relative flex h-full flex-1 items-end ${peak(h) ? "bg-stop-soft/70" : ""}`}>
            <div className="w-full rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80" style={{ height: c ? `${(c / max) * 100}%` : 0 }} />
            <div className="tnum pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-fg px-2 py-1 text-[11px] font-semibold text-surface group-hover:block">
              {String(h).padStart(2, "0")}:00 · {c} stall{c === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
      <div className="tnum mt-1.5 flex justify-between text-[11px] text-muted">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
        <span className="inline-block h-3 w-3 rounded-sm bg-stop-soft ring-1 ring-stop/20" /> Peak commute hours (07–09, 17–19)
      </p>
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className}`}>
      <h2 className="mb-4 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function Admin() {
  const all = useIncidents({ max: 1000 });
  const [includeSim, setIncludeSim] = useState(true);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const list = useMemo(() => all.filter((i) => includeSim || !i.simulated), [all, includeSim]);
  const rail = list.filter((i) => i.type === "train_stall");
  const active = list.filter((i) => i.status === "active");

  const stats = useMemo(() => {
    const dur = rail.filter((i) => i.clearedAt).map((i) => (i.clearedAt! - i.startedAt) / 60000);
    const byLine = new Map<string, number>();
    const bySeg = new Map<string, number>();
    const hours = Array(24).fill(0);
    let wet = 0, wetDur = 0, dry = 0, dryDur = 0;
    for (const i of rail) {
      byLine.set(i.lineId ?? "?", (byLine.get(i.lineId ?? "?") ?? 0) + 1);
      const k = `${i.fromName} – ${i.toName}`;
      bySeg.set(k, (bySeg.get(k) ?? 0) + 1);
      hours[Math.floor(myt(i.startedAt).minutes / 60)]++;
      const d = i.clearedAt ? (i.clearedAt - i.startedAt) / 60000 : 0;
      if ((i.weatherAtStart?.rainProb ?? 0) >= 70 || i.weatherAtStart?.metWarning) {
        wet++;
        wetDur += d;
      } else {
        dry++;
        dryDur += d;
      }
    }
    return {
      avg: dur.length ? Math.round(dur.reduce((a, b) => a + b, 0) / dur.length) : 0,
      byLine: [...byLine].sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ label: lineById.get(id)?.name.replace(" Line", "") ?? id, value: v, color: lineById.get(id)?.color })),
      bySeg: [...bySeg].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value]) => ({ label, value })),
      hours,
      weather: [
        { label: "Rain or MET warning", value: wet ? Math.round(wetDur / wet) : 0, color: "var(--color-rain)" },
        { label: "Dry", value: dry ? Math.round(dryDur / dry) : 0, color: "var(--color-faint)" },
      ],
      wetShare: rail.length ? Math.round((wet / rail.length) * 100) : 0,
    };
  }, [rail]);

  const summary = [
    { k: "Active now", v: String(active.length), tone: active.length ? "text-stop" : "text-go" },
    { k: "Train stalls logged", v: String(rail.length), tone: "text-fg" },
    { k: "Average disruption", v: `${stats.avg} min`, tone: "text-fg" },
    { k: "Started in rain", v: `${stats.wetShare}%`, tone: "text-fg" },
  ];

  return (
    <div className="min-h-full">
      <OpsBar
        right={
          <>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-muted">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand)]" checked={includeSim} onChange={(e) => setIncludeSim(e.target.checked)} />
              Include simulated
            </label>
            {LOOKER ? (
              <ButtonLink href={LOOKER} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon={<ExternalLink size={15} />}>
                Looker Studio
              </ButtonLink>
            ) : (
              <span className="hidden items-center gap-1.5 text-xs text-muted md:flex" title="Set VITE_LOOKER_URL to link the report">
                <Database size={14} /> BigQuery: commute.incidents
              </span>
            )}
          </>
        }
      />

      <main className="intro-stagger mx-auto max-w-6xl px-5 pb-16 pt-8" style={{ "--d": "100ms" } as CSSProperties}>
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Disruptions</h1>
        <p className="mt-1 max-w-[70ch] text-[15px] text-muted">Detected from riders' phones, Rapid KL live bus GPS and MET warnings. On Google Cloud, each change also streams to BigQuery for Looker Studio.</p>

        <dl className="mt-6 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-4">
          {summary.map((s, i) => (
            <div key={s.k} className={`px-5 py-4 ${i % 2 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
              <dt className="text-[13px] text-muted">{s.k}</dt>
              <dd className={`tnum mt-1 text-[24px] font-bold tracking-[-0.01em] ${s.tone}`}>{s.v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <section className="overflow-hidden rounded-2xl border border-line bg-surface lg:col-span-2">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[15px] font-semibold">Live map</h2>
              <span className="text-xs text-muted">{active.length ? `${active.length} active` : "All clear"}</span>
            </div>
            <div className="h-[360px] border-t border-line">
              <MapView incidents={active} center={[3.11, 101.67]} zoom={11} showStations={[]} />
            </div>
          </section>
          <Panel title="Stalls by line">
            <Bars rows={stats.byLine} />
            <h2 className="mb-3 mt-7 text-[15px] font-semibold">Average minutes lost</h2>
            <Bars rows={stats.weather} unit=" min" />
          </Panel>
          <Panel title="When stalls start (MYT)">
            <HourChart counts={stats.hours} />
          </Panel>
          <Panel title="Worst stretches" className="lg:col-span-2">
            <Bars rows={stats.bySeg} color="var(--color-stop)" />
          </Panel>
        </div>

        <section className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-[15px] font-semibold">Incidents</h2>
            <span className="text-xs text-muted">Latest {Math.min(60, list.length)} of {list.length}</span>
          </div>
          {list.length ? (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead className="bg-sunken/60 text-xs text-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                    <th className="px-3 py-2.5 font-medium">Started</th>
                    <th className="px-3 py-2.5 font-medium">Incident</th>
                    <th className="px-3 py-2.5 font-medium">Riders</th>
                    <th className="px-3 py-2.5 text-right font-medium">Duration</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.slice(0, 60).map((i: Incident) => (
                    <Fragment key={i.id}>
                      <tr className="hover:bg-sunken/40">
                        <td className="px-5 py-3">
                          <Badge tone={i.status === "active" ? "stop" : "neutral"}>{i.status === "active" ? "Active" : "Cleared"}</Badge>
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-3 text-muted">{fmtMyt(i.startedAt, true)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{i.title}</span>
                            {i.simulated && <SimTag />}
                          </div>
                          {i.officialNote && <div className="mt-0.5 text-xs text-rain">Official: {i.officialNote}</div>}
                        </td>
                        <td className="tnum whitespace-nowrap px-3 py-3 text-muted">
                          {i.source === "riders" ? `${i.riderCount} · ${i.confidence}` : i.source === "met" ? "MET" : i.source === "gtfs-r" ? "Bus GPS" : i.source}
                        </td>
                        <td className="tnum px-3 py-3 text-right">{i.clearedAt ? `${Math.round((i.clearedAt - i.startedAt) / 60000)} min` : "Ongoing"}</td>
                        <td className="whitespace-nowrap px-5 py-3 text-right">
                          <button onClick={() => (setNoteFor(noteFor === i.id ? null : i.id), setNote(""))} className="press mr-3 inline-flex items-center gap-1 font-semibold text-brand">
                            <FilePlus2 size={14} /> Official note
                          </button>
                          <Link to={`/incident/${i.id}`} className="font-semibold text-muted hover:text-fg">
                            Open
                          </Link>
                        </td>
                      </tr>
                      {noteFor === i.id && (
                        <tr className="bg-sunken/40">
                          <td colSpan={6} className="px-5 py-4">
                            <label className="block max-w-2xl">
                              <span className="mb-1.5 block text-[13px] font-semibold">Paste the operator's official update</span>
                              <textarea
                                autoFocus
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                rows={3}
                                placeholder="e.g. the MyRapid post about this disruption"
                                className="w-full rounded-xl border border-line-strong bg-surface p-3 text-[14px] outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)]"
                              />
                              <span className="mt-1 block text-xs text-muted">Gemini summarises it onto the incident. It then appears on incident reports and the public incident page.</span>
                            </label>
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                loading={savingNote}
                                disabled={!note.trim()}
                                onClick={async () => {
                                  setSavingNote(true);
                                  await api("/admin/official-note", { incidentId: i.id, text: note }).catch(() => null);
                                  setSavingNote(false);
                                  setNoteFor(null);
                                }}
                              >
                                Save note
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="border-t border-line px-5 py-10 text-center">
              <p className="font-semibold">No incidents yet</p>
              <p className="mt-1 text-[13px] text-muted">
                Stall a train in the <Link to="/sim" className="font-semibold text-brand">simulator</Link>, or seed 30 days of simulated history there.
              </p>
            </div>
          )}
        </section>
        <p className="mt-6 text-[11px] text-faint">Data: data.gov.my, Prasarana, MET Malaysia (CC BY 4.0), APSpace, Open-Meteo</p>
      </main>
    </div>
  );
}
