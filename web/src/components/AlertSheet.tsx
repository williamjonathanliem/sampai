import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bus, BusFront, Car, Clock, Footprints, TrainFront, Sparkles, X, FileText, ExternalLink, MapPinned } from "lucide-react";
import type { AlertDoc, AlertOption } from "../../../shared/types";
import { fmtMyt, hhmmToMin } from "../../../shared/time";
import { Badge, Button, SimTag, Eyebrow, btn } from "./ui";

export const optionIcon: Record<string, typeof Bus> = { bus: Bus, grab: Car, walk: Footprints, rail: TrainFront, wait: Clock, shuttle: BusFront };

function openGrab() {
  // No public booking API: try the app, fall back to the website.
  const t = setTimeout(() => (window.location.href = "https://www.grab.com/my/transport/"), 900);
  window.addEventListener("blur", () => clearTimeout(t), { once: true });
  window.location.href = "grab://open?screenType=BOOKING";
}

function OptionRow({ o, best, onWalk }: { o: AlertOption; best: boolean; onWalk: (id: string) => void }) {
  const Icon = optionIcon[o.type] ?? Clock;
  return (
    <li className={`px-4 py-4 ${best ? "bg-brand-soft/60" : ""}`}>
      <div className="flex gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${best ? "bg-brand text-surface" : "bg-sunken text-fg"}`}>
          <Icon size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold leading-snug">{o.label}</span>
                {best && <Badge tone="brand">Best</Badge>}
              </div>
              {o.detail && <p className="mt-1 text-[13px] leading-snug text-muted">{o.detail}</p>}
            </div>
            <div className="shrink-0 text-right">
              <div className="tnum text-[17px] font-bold leading-none">{o.arrivalTime}</div>
              <div className={`mt-1 text-xs font-semibold ${o.onTime ? "text-go" : "text-stop"}`}>{o.onTime ? "On time" : "Late"}</div>
            </div>
          </div>
          {(o.type === "grab" || (o.type === "walk" && o.walkId)) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {o.type === "grab" && (
                <>
                  <Button variant="secondary" size="sm" onClick={openGrab} icon={<ExternalLink size={15} />}>
                    Open Grab
                  </Button>
                  {o.fareEstimate != null && <span className="tnum text-[13px] text-muted">about RM {o.fareEstimate.toFixed(2)} (estimate)</span>}
                </>
              )}
              {o.type === "walk" && o.walkId && (
                <Button variant="secondary" size="sm" onClick={() => onWalk(o.walkId!)} icon={<MapPinned size={15} />}>
                  Show {o.covered ? "covered " : ""}path
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

/** Late when no option makes class; lateBy is how late the best case is, in minutes. */
export function lateness(alert: AlertDoc) {
  if (alert.status === "cleared" || !alert.options?.length || !alert.classStart) return { late: false, lateBy: 0 };
  if (alert.options.some((o) => o.onTime)) return { late: false, lateBy: 0 };
  const start = hhmmToMin(alert.classStart);
  const lateBy = Math.max(1, Math.min(...alert.options.map((o) => hhmmToMin(o.arrivalTime) - start)));
  return { late: true, lateBy };
}

export default function AlertSheet({ alert, onClose, onWalk }: { alert: AlertDoc; onClose: () => void; onWalk: (id: string) => void }) {
  const nav = useNavigate();
  const cleared = alert.status === "cleared";
  const { late, lateBy } = lateness(alert);
  const sorted = [...alert.options].sort((a, b) => Number(b.id === alert.bestOptionId) - Number(a.id === alert.bestOptionId));

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center sm:p-6">
      <div className="sheet-backdrop absolute inset-0 bg-fg/45" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-labelledby="alert-title" className="sheet-panel relative flex max-h-[92dvh] w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-[0_-8px_40px_oklch(0.23_0.025_285/0.18)] sm:max-h-[85dvh] sm:max-w-lg sm:rounded-3xl sm:shadow-[0_24px_64px_oklch(0.23_0.025_285/0.25)]">
        <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-line-strong sm:invisible" />
        <button onClick={onClose} aria-label="Close" className={btn("ghost", "sm", "absolute right-3 top-3 w-9 px-0")}>
          <X size={18} />
        </button>

        <div className="overflow-y-auto px-5 pb-4 pt-4">
          <div className="flex flex-wrap items-center gap-2 pr-10">
            <Badge tone={cleared ? "go" : "stop"}>{cleared ? "Resolved" : "Disruption"}</Badge>
            {alert.simulated && <SimTag />}
            <span className="tnum text-xs text-muted">{fmtMyt(alert.sentAt)}</span>
            {alert.generatedBy === "gemini" && (
              <Badge tone="brand" icon={<Sparkles size={13} />}>
                Gemini
              </Badge>
            )}
          </div>
          <h2 id="alert-title" className="mt-3 text-[22px] font-bold leading-[1.2] tracking-[-0.01em] text-balance">
            {alert.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-fg/80">{alert.body}</p>
          {alert.why && !cleared && <p className="mt-1.5 text-[13px] text-muted">{alert.why}</p>}
          {late && (
            <div className="mt-4 rounded-2xl border border-stop/25 bg-stop-soft p-4">
              <div className="flex items-start gap-3">
                <Clock size={20} className="mt-0.5 shrink-0 text-stop" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-stop">You'll be about {lateBy} min late</div>
                  <p className="mt-0.5 text-[13px] leading-snug text-fg/80">
                    Every option arrives after {alert.classTitle ? `${alert.classTitle} starts` : "class starts"}{alert.classStart ? ` at ${alert.classStart}` : ""}. Send your lecturer an official notice backed by this incident record.
                  </p>
                </div>
              </div>
              <Button variant="danger" className="mt-3 w-full" onClick={() => nav(`/letter/${alert.incidentId}`)} icon={<FileText size={17} />}>
                Get delay notice
              </Button>
            </div>
          )}
          {alert.classTitle && !late && (
            <p className="mt-3 text-[13px] text-muted">
              For <span className="font-semibold text-fg">{alert.classTitle}</span> at <span className="tnum font-semibold text-fg">{alert.classStart}</span>
              {alert.lecturer ? ` with ${alert.lecturer}` : ""}
            </p>
          )}

          {!cleared && sorted.length > 0 && (
            <>
              <Eyebrow className="mb-2 mt-6">Your options · arrival at campus</Eyebrow>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {sorted.map((o) => (
                  <OptionRow key={o.id} o={o} best={o.id === alert.bestOptionId} onWalk={(id) => (onWalk(id), onClose())} />
                ))}
              </ul>
            </>
          )}
        </div>

        {!late && (
          <div className="border-t border-line px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3">
            <Button variant="secondary" size="lg" className="w-full" onClick={() => nav(`/letter/${alert.incidentId}`)} icon={<FileText size={18} />}>
              {cleared ? "Get delay notice for this disruption" : "Running late anyway? Get delay notice"}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
