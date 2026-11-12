import { Bus, BusFront, Car, ChevronRight, CloudRain, Clock, Footprints, History, OctagonAlert, ShieldCheck, Sparkles, Thermometer, TrainFront, Wallet, Wind } from "lucide-react";
import type { RouteLeg } from "../../../shared/types";

export interface RouteStep {
  mode: RouteLeg["mode"];
  text: string;
  min: number;
}
export interface TimelineItem {
  at: string;
  text: string;
  mode: RouteLeg["mode"] | "start" | "end";
}
export interface Insight {
  tone: "go" | "warn" | "stop" | "info";
  kind: "rain" | "heat" | "air" | "stall" | "watch" | "time" | "money" | "history";
  text: string;
}
export interface PathPiece {
  mode: RouteLeg["mode"];
  color?: string;
  coords: [number, number][];
}
export interface RouteOption {
  id: string;
  title: string;
  kind: "train" | "shuttle" | "walk" | "grab" | "bus";
  legs: RouteLeg[];
  steps: RouteStep[];
  timeline: TimelineItem[];
  path: PathPiece[];
  totalMin: number;
  walkMin: number;
  outdoorMin: number;
  leaveBy: string;
  leaveTs: number;
  arrive: string;
  arriveTs: number;
  spareMin: number | null;
  late: boolean;
  fareRM: number | null;
  free: boolean;
  insights: Insight[];
  tags: string[];
  pick: boolean;
  pickReason?: string;
}

const modeIcon = { walk: Footprints, rail: TrainFront, shuttle: BusFront, bus: Bus, grab: Car } as const;
const modeLabel = { walk: "Walk", rail: "Train", shuttle: "Shuttle", bus: "Bus", grab: "Taxi" } as const;
const insightIcon = { rain: CloudRain, heat: Thermometer, air: Wind, stall: OctagonAlert, watch: ShieldCheck, time: Clock, money: Wallet, history: History } as const;
const toneText = { go: "text-go", warn: "text-warn", stop: "text-stop", info: "text-muted" } as const;

/** Same signature for a saved route and an option, so the saved one is pre-selected. */
export const legsKey = (legs: RouteLeg[]) => legs.map((l) => `${l.mode}:${l.lineId ?? ""}:${l.fromStop ?? l.from ?? ""}:${l.toStop ?? l.to ?? ""}`).join("|");

function Chips({ steps }: { steps: RouteStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {steps.map((s, i) => {
        const Icon = modeIcon[s.mode as keyof typeof modeIcon] ?? Footprints;
        const tone = s.mode === "rail" ? "bg-brand text-surface" : s.mode === "grab" ? "bg-go-soft text-go" : s.mode === "shuttle" ? "bg-fg text-surface" : s.mode === "bus" ? "bg-go text-surface" : "bg-sunken text-fg";
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={13} className="text-faint" aria-hidden />}
            <span className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-semibold ${tone}`}>
              <Icon size={13} aria-hidden />
              {modeLabel[s.mode as keyof typeof modeLabel] ?? s.mode}
              <span className="tnum font-medium opacity-80">{s.min}′</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative mt-1">
      {items.map((t, i) => {
        const last = i === items.length - 1;
        const Icon = t.mode === "end" ? null : modeIcon[t.mode as keyof typeof modeIcon];
        return (
          <li key={i} className="relative grid grid-cols-[3rem_1rem_1fr] gap-x-2 pb-3 last:pb-0">
            <span className={`tnum pt-px text-[13px] font-semibold ${last ? "text-fg" : "text-fg/80"}`}>{t.at}</span>
            <span className="relative flex justify-center">
              <span className={`relative z-10 mt-1 h-2.5 w-2.5 rounded-full ${last ? "bg-brand" : "border-2 border-brand bg-surface"}`} />
              {!last && <span className="absolute bottom-[-12px] top-4 w-px bg-line-strong" aria-hidden />}
            </span>
            <span className={`flex items-start gap-1.5 text-[13.5px] leading-snug ${last ? "font-semibold" : ""}`}>
              {Icon && <Icon size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />}
              {t.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function RouteOptionsList({ options, selected, onSelect }: { options: RouteOption[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ul role="radiogroup" aria-label="Ways to get to APU" className="space-y-2.5">
      {options.map((o) => {
        const on = o.id === selected;
        const insights = on ? o.insights : o.insights.filter((i) => i.tone !== "info").slice(0, 2);
        return (
          <li key={o.id}>
            <div
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onClick={() => onSelect(o.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(o.id))}
              className={`press cursor-pointer rounded-2xl border p-4 text-left transition-colors ${on ? "border-brand bg-surface ring-1 ring-brand" : "border-line bg-surface hover:border-line-strong"}`}
            >
              {o.pick && (
                <div className="mb-2.5 flex items-start gap-2 rounded-xl bg-brand-soft px-3 py-2 text-[13px] text-brand">
                  <Sparkles size={15} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-bold">Sampai pick.</span> {o.pickReason}
                  </span>
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-snug">{o.title}</div>
                  <div className="tnum mt-1 flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    <span className="text-[17px] font-bold text-fg">
                      {o.leaveBy} <span className="font-medium text-faint">→</span> {o.arrive}
                    </span>
                    {o.spareMin != null &&
                      (o.late ? <span className="font-semibold text-stop">{-o.spareMin} min late</span> : <span className="font-semibold text-go">on time · {o.spareMin} min spare</span>)}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tnum text-[22px] font-bold leading-none">
                    {o.totalMin}
                    <span className="ml-0.5 text-[13px] font-semibold text-muted">min</span>
                  </div>
                  <div className={`tnum mt-1 text-[12.5px] font-semibold ${o.free ? "text-go" : "text-muted"}`}>{o.free ? "Free" : o.fareRM != null ? `RM ${o.fareRM.toFixed(2)}` : ""}</div>
                </div>
              </div>

              <div className="mt-3">
                <Chips steps={o.steps} />
              </div>

              {insights.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {insights.map((i, k) => {
                    const Icon = insightIcon[i.kind];
                    return (
                      <li key={k} className={`flex items-start gap-1.5 text-[12.5px] leading-snug ${toneText[i.tone]}`}>
                        <Icon size={14} className="mt-px shrink-0" aria-hidden />
                        {i.text}
                      </li>
                    );
                  })}
                </ul>
              )}

              {on && (
                <div className="mt-3 border-t border-line pt-3">
                  <Timeline items={o.timeline} />
                  {o.fareRM != null && !o.free && <p className="mt-2 text-[11.5px] text-muted">Fares are estimates. Train fare is Rapid KL's distance fare; Taxi fare is an estimate, not a quote.</p>}
                </div>
              )}

              {o.tags.length > 0 && !o.pick && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {o.tags.map((t) => (
                    <span key={t} className="rounded-full bg-sunken px-2 py-0.5 text-[11.5px] font-semibold text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
