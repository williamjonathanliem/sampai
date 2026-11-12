import { Bus, BusFront, Car, ChevronRight, Footprints, TrainFront } from "lucide-react";
import type { RouteLeg } from "../../../shared/types";
import { Badge } from "./ui";

export interface RouteStep {
  mode: RouteLeg["mode"];
  text: string;
  min: number;
}

export interface RouteOption {
  id: string;
  title: string;
  kind: "train" | "shuttle" | "walk" | "grab";
  legs: RouteLeg[];
  steps: RouteStep[];
  totalMin: number;
  walkMin: number;
  leaveBy: string;
  leaveTs: number;
  arrive: string;
  arriveTs: number;
  late: boolean;
  fareRM: number | null;
  free: boolean;
  tags: string[];
  note?: string;
}

const icon = { walk: Footprints, rail: TrainFront, shuttle: BusFront, bus: Bus, grab: Car } as const;

/** Same signature for a saved route and an option, so the saved one is pre-selected. */
export const legsKey = (legs: RouteLeg[]) => legs.map((l) => `${l.mode}:${l.lineId ?? ""}:${l.fromStop ?? l.from ?? ""}:${l.toStop ?? l.to ?? ""}`).join("|");

export default function RouteOptionsList({
  options,
  selected,
  onSelect,
  classStartTs,
}: {
  options: RouteOption[];
  selected: string | null;
  onSelect: (id: string) => void;
  classStartTs: number | null;
}) {
  return (
    <ul role="radiogroup" aria-label="Ways to get to APU" className="space-y-2.5">
      {options.map((o) => {
        const on = o.id === selected;
        const early = classStartTs ? Math.round((classStartTs - o.arriveTs) / 60_000) : 0;
        return (
          <li key={o.id}>
            <button
              role="radio"
              aria-checked={on}
              onClick={() => onSelect(o.id)}
              className={`press w-full rounded-2xl border p-4 text-left transition-colors ${on ? "border-brand bg-brand-soft/50 ring-1 ring-brand" : "border-line bg-surface hover:border-line-strong"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* the chain of modes, like a maps app */}
                  <div className="flex flex-wrap items-center gap-1 text-muted">
                    {o.steps.map((s, i) => {
                      const Icon = icon[s.mode as keyof typeof icon] ?? Footprints;
                      return (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <ChevronRight size={13} className="text-faint" />}
                          <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${s.mode === "rail" ? "bg-brand text-surface" : s.mode === "grab" ? "bg-go-soft text-go" : "bg-sunken text-fg"}`}>
                            <Icon size={13} />
                            <span className="tnum">{s.min}</span>
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-2 font-semibold leading-snug">{o.title}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tnum text-[20px] font-bold leading-none">
                    {o.totalMin}
                    <span className="ml-0.5 text-[13px] font-semibold text-muted">min</span>
                  </div>
                  {o.fareRM != null ? <div className="tnum mt-1 text-[12px] text-muted">RM {o.fareRM.toFixed(2)}</div> : o.free ? <div className="mt-1 text-[12px] text-go">Free</div> : null}
                </div>
              </div>

              <div className="tnum mt-2 text-[13px] text-muted">
                Leave <span className="font-semibold text-fg">{o.leaveBy}</span> · arrive <span className={`font-semibold ${o.late ? "text-stop" : "text-fg"}`}>{o.arrive}</span>
                {classStartTs && (o.late ? <span className="text-stop"> · late for class</span> : early >= 20 ? <span> · {early} min early (shuttle times)</span> : null)}
              </div>

              {on && (
                <ol className="mt-3 space-y-1 border-t border-line pt-3 text-[13px]">
                  {o.steps.map((s, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{s.text}</span>
                      <span className="tnum shrink-0 text-muted">{s.min} min</span>
                    </li>
                  ))}
                  {o.note && <li className="pt-1 text-[12px] text-muted">{o.note}</li>}
                </ol>
              )}

              {o.tags.filter((t) => t !== "Free").length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {o.tags
                    .filter((t) => t !== "Free")
                    .map((t) => (
                      <Badge key={t} tone={t === "Fastest" ? "brand" : "neutral"}>
                        {t}
                      </Badge>
                    ))}
                </div>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
