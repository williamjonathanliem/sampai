import { useEffect, useState, type ReactNode } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { Bus, CloudRain, Train } from "lucide-react";
import { db } from "../lib/firebase";
import { api } from "../lib/api";
import { parseIncident } from "../lib/hooks";
import { SimTag } from "./ui";
import config from "../../../data/config.json";
import type { Conditions, Incident } from "../../../shared/types";

/** A feed is loading, answered, or failed. Never show "all clear" for a feed that hasn't answered. */
type Feed<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error" };

const FEED_TIMEOUT = 10_000;

/** Wraps a Firestore listener: answers from the local cache don't count, and silence turns into "error". */
function useLive<T>(subscribe: (ok: (data: T, fromCache: boolean) => void, fail: () => void) => () => void): Feed<T> {
  const [f, setF] = useState<Feed<T>>({ state: "loading" });
  useEffect(() => {
    let answered = false;
    let cached: { data: T } | null = null;
    let off: () => void = () => {};
    let retry: ReturnType<typeof setTimeout> | null = null;
    // slow server: show the last known answer (cache) rather than an error; only error with nothing at all
    const timer = setTimeout(() => !answered && setF(cached ? { state: "ok", data: cached.data } : { state: "error" }), FEED_TIMEOUT);
    const start = () => {
      off = subscribe(
        (data, fromCache) => {
          if (fromCache) {
            cached = { data };
            return;
          }
          answered = true;
          setF({ state: "ok", data });
        },
        () => {
          // listener died (network, auth not ready yet): keep what we have, try again shortly
          if (cached) setF({ state: "ok", data: cached.data });
          else if (!answered) setF({ state: "error" });
          retry = setTimeout(() => (off(), start()), 5_000);
        },
      );
    };
    start();
    return () => {
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return f;
}

const useConditionsFeed = () =>
  useLive<Conditions | null>((ok, fail) =>
    onSnapshot(doc(db, "conditions", "current"), { includeMetadataChanges: true }, (s) => ok(s.exists() ? (s.data() as Conditions) : null, s.metadata.fromCache), fail),
  );

const useActiveIncidents = () =>
  useLive<Incident[]>((ok, fail) =>
    onSnapshot(
      query(collection(db, "incidents"), where("status", "==", "active")),
      { includeMetadataChanges: true }, // always hear back once the server confirms, even when nothing changed
      (s) => ok(s.docs.map((d) => parseIncident({ ...d.data(), id: d.id })).sort((a, b) => b.startedAt - a.startedAt), s.metadata.fromCache),
      fail,
    ),
  );

type Trip = { time: string; day: string };
type Shuttle = { from: string; next: Trip[]; all: Trip[] };

/** "mon-fri" becomes "Mon to Fri". */
const days = (d: string) => d.split("-").map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" to ");

function useShuttle(): Feed<Shuttle> {
  const [f, setF] = useState<Feed<Shuttle>>({ state: "loading" });
  useEffect(() => {
    let live = true;
    api<Shuttle>(`/apu/shuttle?from=${encodeURIComponent(config.shuttleStopName)}`)
      .then((data) => live && setF({ state: "ok", data }))
      .catch(() => live && setF({ state: "error" }));
    return () => {
      live = false;
    };
  }, []);
  return f;
}

function Row({ icon, label, source, children }: { icon: ReactNode; label: string; source: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 py-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-faint">{label}</div>
        <div className="mt-1 text-[15px] font-semibold text-fg">{children}</div>
        <div className="mt-0.5 text-xs text-muted">{source}</div>
      </div>
    </li>
  );
}

const Skeleton = ({ w = "w-40" }: { w?: string }) => <span className={`block h-5 ${w} animate-pulse rounded-md bg-sunken`} aria-label="Loading" />;
const Unavailable = ({ children }: { children: ReactNode }) => <span className="font-medium text-muted">{children}</span>;

const kindLabel: Record<Incident["type"], string> = { train_stall: "Train stalled", bus_stall: "Bus stuck", bus_route: "Buses stuck", weather: "Weather warning" };

/** What Sampai can see right now, from the same live feeds the app uses. */
export function LiveNow({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const shuttle = useShuttle();
  const cond = useConditionsFeed();
  const incidents = useActiveIncidents();

  return (
    <section className={className} style={style} aria-label="Live now">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-faint">
        <span className="h-2 w-2 rounded-full bg-go" aria-hidden /> Live now on the way to APU
      </div>
      <ul className="mt-2 divide-y divide-line">
        <Row icon={<Bus size={16} />} label="Next APU shuttles from Bukit Jalil LRT" source="APSpace shuttle schedule">
          {shuttle.state === "loading" ? (
            <Skeleton />
          ) : shuttle.state === "error" ? (
            <Unavailable>The APSpace feed didn't answer. Try again in a minute.</Unavailable>
          ) : shuttle.data.next.length ? (
            <span className="flex flex-wrap gap-2">
              {shuttle.data.next.slice(0, 4).map((t) => (
                <span key={t.time} className="tnum rounded-lg bg-sunken px-2 py-0.5">
                  {t.time}
                </span>
              ))}
            </span>
          ) : (
            <Unavailable>
              No more shuttles today
              {shuttle.data.all[0] && (
                <>
                  . First one <span className="tnum">{shuttle.data.all[0].time}</span>
                  {shuttle.data.all[0].day && `, ${days(shuttle.data.all[0].day)}`}
                </>
              )}
            </Unavailable>
          )}
        </Row>

        <Row icon={<CloudRain size={16} />} label="Weather at APU" source="Open-Meteo and MET Malaysia">
          {cond.state === "loading" ? (
            <Skeleton w="w-52" />
          ) : cond.state === "error" ? (
            <Unavailable>Weather feed unavailable right now</Unavailable>
          ) : !cond.data ? (
            <Unavailable>The weather feed hasn't reported yet</Unavailable>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {cond.data.heat.apparentTemp != null && <span className="tnum">Feels like {Math.round(cond.data.heat.apparentTemp)}°C</span>}
              {cond.data.rain.probNextHour != null && <span className="tnum">Rain {Math.round(cond.data.rain.probNextHour)}% next hour</span>}
              {cond.data.metWarnings.filter((w) => w.affectsKL).length > 0 && <span className="text-rain">MET warning for KL</span>}
              {(cond.data.heat.simulated || cond.data.rain.simulated || cond.data.metWarnings.some((w) => w.simulated)) && <SimTag />}
            </span>
          )}
        </Row>

        <Row icon={<Train size={16} />} label="Rail and bus incidents" source="Sampai riders and Rapid KL live bus GPS">
          {incidents.state === "loading" ? (
            <Skeleton w="w-48" />
          ) : incidents.state === "error" ? (
            <Unavailable>Incident feed unavailable right now</Unavailable>
          ) : incidents.data.length === 0 ? (
            <span>None active</span>
          ) : (
            <span className="flex flex-col gap-1">
              {incidents.data.slice(0, 2).map((i) => (
                <span key={i.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-stop">{kindLabel[i.type]}</span>
                  {i.fromName && i.toName && (
                    <span className="font-medium text-fg/80">
                      {i.fromName} to {i.toName}
                    </span>
                  )}
                  {i.simulated && <SimTag />}
                </span>
              ))}
              {incidents.data.length > 2 && <span className="text-xs font-medium text-muted">and {incidents.data.length - 2} more</span>}
            </span>
          )}
        </Row>
      </ul>
    </section>
  );
}
