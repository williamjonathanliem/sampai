import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OctagonAlert, ChevronRight, Thermometer, CloudRain, TriangleAlert, Bell, BellOff, TrainFront, Footprints, Bus, BusFront, Car, CircleCheck, SlidersHorizontal, CalendarClock, X, FileText } from "lucide-react";
import MapView, { boundsForSegments } from "../components/MapView";
import AlertSheet, { lateness } from "../components/AlertSheet";
import { Badge, Button, Eyebrow, SimTag, Wordmark, btn } from "../components/ui";
import { useUid, useUserDoc, useAlerts, useIncidents, useConditions, useNextClass, useNow, useLiveBuses } from "../lib/hooks";
import { useDesktop } from "../lib/useMedia";
import { startSession, onSensor, type SensorState } from "../lib/sensors";
import { enablePush, buzz, localNotify, type PushStatus } from "../lib/push";
import { api } from "../lib/api";
import { stationName, lineById, APU } from "../../../shared/network";
import stopsJson from "../../../data/shuttle_stops.json";

const shuttleStops = stopsJson.stops;
import { minToHhmm, myt, hhmmToMin } from "../../../shared/time";
import type { AlertDoc, RouteLeg } from "../../../shared/types";

const legIcon = { walk: Footprints, rail: TrainFront, bus: Bus, shuttle: BusFront, grab: Car } as const;

function legText(l: RouteLeg) {
  if (l.mode === "rail") return { title: `${stationName(l.fromStop)} to ${stationName(l.toStop)}`, sub: lineById.get(l.lineId!)?.name ?? l.lineId };
  if (l.mode === "shuttle") return { title: l.label ?? "APU shuttle", sub: `${stationName(l.from)} to campus` };
  if (l.mode === "grab") return { title: l.label ?? "Grab to APU", sub: l.from === "home" ? "From home" : `${stationName(l.from)} to campus` };
  if (l.from === "home") return { title: `Walk to ${l.to === "APU" ? "APU" : stationName(l.to)}`, sub: "From home" };
  return { title: l.label ?? "Walk", sub: `${stationName(l.from)} to campus` };
}

export default function Home() {
  const uid = useUid();
  const user = useUserDoc(uid);
  const nav = useNavigate();
  const desktop = useDesktop();
  const now = useNow(15_000);
  const rawAlerts = useAlerts(uid);
  // alerts written for an older version of the profile (another route, class or demo student) are stale
  const alertsOrNull = useMemo(() => (rawAlerts && user !== undefined ? rawAlerts.filter((a) => !user?.updatedAt || a.sentAt >= user.updatedAt) : null), [rawAlerts, user?.updatedAt, user === undefined]);
  const alerts = alertsOrNull ?? [];
  const incidents = useIncidents({ activeOnly: true });
  const cond = useConditions();
  const buses = useLiveBuses();
  const cls = useNextClass(user, now);
  const [sheet, setSheet] = useState<AlertDoc | null>(null);
  const [walk, setWalk] = useState<"bj-covered" | "bj-direct" | null>(null);
  const [sensor, setSensor] = useState<SensorState | null>(null);
  const [push, setPush] = useState<PushStatus | null>(null);
  const [promptDismissed, setPromptDismissed] = useState(() => {
    try {
      return localStorage.getItem("sampai.alertsPrompt") === "off" || (typeof Notification !== "undefined" && Notification.permission !== "default");
    } catch {
      return false;
    }
  });
  const showAlertsPrompt = !promptDismissed && push !== "enabled" && push !== "local";
  async function turnOnAlerts() {
    if (!uid) return;
    setPush(await enablePush(uid, () => null));
    setPromptDismissed(true);
  }
  function dismissAlertsPrompt() {
    setPromptDismissed(true);
    try {
      localStorage.setItem("sampai.alertsPrompt", "off");
    } catch {
      /* private mode */
    }
  }
  const [starting, setStarting] = useState(false);
  const [plan, setPlan] = useState<{ from: string; shuttle: string | null; rideMin: number | null; arrive: string | null; leaveBy: string | null; leaveTs: number | null; late: boolean; tooLate: { shuttle: string; arrive: string } | null; source: string } | null>(null);
  const seen = useRef<Map<string, number> | null>(null);

  useEffect(() => onSensor(setSensor), []);
  useEffect(() => {
    if (user === null) nav("/welcome", { replace: true });
  }, [user]);

  // new or changed disruption: vibrate, notify, open the sheet.
  // "Service resumed" updates stay quiet: no sheet, no buzz, just the status line.
  useEffect(() => {
    if (!alertsOrNull) return;
    if (!seen.current) {
      seen.current = new Map(alertsOrNull.map((a) => [a.id, a.sentAt]));
      return;
    }
    for (const a of alertsOrNull) {
      const prev = seen.current.get(a.id);
      if (prev === undefined || prev !== a.sentAt) {
        seen.current.set(a.id, a.sentAt);
        if (a.status === "cleared") {
          if (sheet?.id === a.id) setSheet(null);
          continue;
        }
        buzz();
        localNotify(a.title, a.body, a.id);
        setSheet(a);
        if (a.options?.some((o) => o.type === "walk" && o.covered)) setWalk("bj-covered");
        break;
      }
    }
  }, [alertsOrNull]);

  useEffect(() => {
    if (sheet) {
      const fresh = alerts.find((a) => a.id === sheet.id);
      if (fresh && fresh.sentAt !== sheet.sentAt) setSheet(fresh);
    }
  }, [alerts]);

  const legs = user?.route?.legs ?? [];
  const routeMin = legs.reduce((s, l) => s + (l.minutes ?? 0), 0) || 25;
  const railLeg = legs.find((l) => l.mode === "rail");
  const shuttleIdx = legs.findIndex((l) => l.mode === "shuttle");
  const usesShuttle = shuttleIdx >= 0;
  // shuttle stop: legacy routes stored the station id
  const shuttleFrom = usesShuttle ? (/^SP\d+$/.test(legs[shuttleIdx].from ?? "") ? "LRT - Bukit Jalil" : legs[shuttleIdx].from ?? "LRT - Bukit Jalil") : null;
  const preShuttleMin = usesShuttle ? legs.slice(0, shuttleIdx).reduce((s, l) => s + (l.minutes ?? 0), 0) : 0;
  // with a shuttle the plan works backwards from real departures; otherwise class minus trip minus 5 min buffer
  const leaveTs = plan?.leaveTs ?? (cls ? cls.startTs - (routeMin + 5) * 60_000 : null);
  const leaveBy = plan?.leaveBy ?? (cls ? minToHhmm(hhmmToMin(cls.start) - routeMin - 5) : null);
  const minsToLeave = leaveTs != null ? Math.round((leaveTs - now) / 60_000) : null;
  const classDay = cls ? myt(cls.startTs).date : null;
  const today = myt(now).date;
  const tomorrow = myt(now + 86_400_000).date;
  const dayLabel = !classDay || classDay === today ? "Today" : classDay === tomorrow ? "Tomorrow" : new Date(cls!.startTs).toLocaleDateString("en-GB", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "short" });
  const untilLeave = minsToLeave == null ? "" : minsToLeave <= 0 ? "Now" : minsToLeave < 60 ? `in ${minsToLeave} min` : `in ${Math.floor(minsToLeave / 60)} h ${minsToLeave % 60} min`;

  useEffect(() => {
    if (!usesShuttle || !cls || !shuttleFrom) return setPlan(null);
    api(`/apu/plan?from=${encodeURIComponent(shuttleFrom)}&classTs=${cls.startTs}&pre=${preShuttleMin}`)
      .then((p) => setPlan(p.shuttle ? p : null))
      .catch(() => setPlan(null));
  }, [usesShuttle, shuttleFrom, cls?.startTs, preShuttleMin, Math.floor(now / 60000)]);

  const latest = alerts.find((a) => a.status === "active") ?? null;
  const resumed = !latest ? alerts.find((a) => a.status === "cleared" && now - a.sentAt < 15 * 60_000) ?? null : null;
  // non-rail trips (hostel shuttle, walking): show home, the pick-up and campus instead of a rail stretch
  const tripPath = useMemo(() => {
    if (!user?.homeLocation || (user.route?.segments?.length ?? 0) > 0) return null;
    const stop = shuttleStops.find((s) => s.name === legs.find((l) => l.mode === "shuttle")?.from);
    return [user.homeLocation, ...(stop ? [stop] : []), APU];
  }, [user?.homeLocation?.lat, user?.homeLocation?.lon, user?.route?.segments?.length, legs.length]);
  const fit = useMemo(() => {
    if (tripPath) {
      const lats = tripPath.map((p) => p.lat), lons = tripPath.map((p) => p.lon);
      return [[Math.min(...lats) - 0.004, Math.min(...lons) - 0.004], [Math.max(...lats) + 0.004, Math.max(...lons) + 0.004]] as [[number, number], [number, number]];
    }
    return boundsForSegments(user?.route?.segments ?? []);
  }, [user?.route?.segments?.join(","), tripPath]);

  if (!user)
    return (
      <div className="mx-auto max-w-md space-y-4 px-5 pt-20 lg:max-w-6xl" aria-busy="true">
        <div className="h-24 animate-pulse rounded-2xl bg-sunken" />
        <div className="h-56 animate-pulse rounded-2xl bg-sunken" />
      </div>
    );

  const heat = cond?.heat;
  const rain = cond?.rain;
  const metKL = cond?.metWarnings?.filter((w) => w.affectsKL) ?? [];

  async function board() {
    if (!uid) return;
    setStarting(true);
    try {
      await startSession({ uid, mode: "rail", lineId: railLeg?.lineId ?? "PH", destStop: railLeg?.toStop });
      nav("/ride");
    } finally {
      setStarting(false);
    }
  }

  const map = (
    <section aria-label="Map" className={`relative overflow-hidden rounded-2xl border border-line ${desktop ? "h-full" : "h-60"}`}>
      <MapView tripPath={tripPath} home={tripPath ? user.homeLocation : null} routeSegments={user.route?.segments} incidents={incidents} buses={buses.filter((b) => b.stuck || b.simulated)} walk={walk} fit={fit} me={sensor?.lastFix ?? null} />
      {walk && (
        <button onClick={() => setWalk(null)} className="press absolute bottom-3 left-3 z-[500] flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-xs font-semibold text-rain ring-1 ring-line">
          {walk === "bj-covered" ? "Covered path" : "Walking path"} <X size={14} />
        </button>
      )}
    </section>
  );

  const action = sensor ? (
    <div className="flex items-center gap-3">
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-rain/50" />
        <span className="relative h-3 w-3 rounded-full bg-rain" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold">Sharing while on board</div>
        <div className="tnum truncate text-xs text-muted">
          {sensor.error ? sensor.error : sensor.lastFix ? `${sensor.pings} pings · ${sensor.speed != null ? sensor.speed.toFixed(1) : "–"} m/s · ±${Math.round(sensor.lastFix.accuracy)} m` : "Waiting for GPS…"}
        </div>
      </div>
      <Link to="/ride" className={btn("secondary", "sm")}>
        Open
      </Link>
    </div>
  ) : (
    <>
      <Button size="lg" className="w-full" onClick={board} loading={starting} icon={<TrainFront size={19} />}>
        I'm on the train
      </Button>
      <p className="mt-2 text-center text-[11px] text-muted">Your location is shared anonymously, only while you're on board.</p>
    </>
  );

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col lg:h-full lg:max-w-7xl">
      <header className="flex items-center gap-2 px-5 pb-2 pt-[max(env(safe-area-inset-top),14px)] lg:border-b lg:border-line lg:px-8 lg:py-3">
        <Wordmark />
        <div className="ml-auto flex items-center gap-1">
          {push !== "enabled" && push !== "local" && (
            <button
              onClick={async () => uid && setPush(await enablePush(uid, () => null))}
              aria-label="Turn on alerts"
              title={push === "denied" ? "Notifications are blocked in browser settings" : push === "unsupported" ? "On iPhone, add Sampai to the Home Screen first" : "Turn on alerts"}
              className={btn("ghost", "sm", "w-9 px-0 lg:w-auto lg:px-3")}
            >
              {push === "denied" || push === "unsupported" ? <BellOff size={18} /> : <Bell size={18} />}
              <span className="hidden lg:inline">Turn on alerts</span>
            </button>
          )}
          <Link to="/sim" aria-label="Demo tools" title="Simulator and dashboard" className={btn("ghost", "sm", "w-9 px-0 lg:w-auto lg:px-3")}>
            <SlidersHorizontal size={18} />
            <span className="hidden lg:inline">Simulator &amp; dashboard</span>
          </Link>
          <Link to="/profile" aria-label="Your profile" className="press ml-1 flex h-9 items-center gap-2 rounded-full bg-surface pl-1 pr-3 text-[13px] font-semibold ring-1 ring-line">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{(user.displayName ?? "S")[0]}</span>
            {user.displayName ?? "Student"}
          </Link>
        </div>
      </header>

      <div className="flex-1 lg:grid lg:min-h-0 lg:grid-cols-[minmax(380px,440px)_1fr] lg:gap-8 lg:px-8">
        <main className={`space-y-6 px-5 ${railLeg ? "pb-36" : "pb-12"} pt-2 lg:min-h-0 lg:overflow-y-auto lg:px-0 lg:pb-10 lg:pt-6`}>
          {user.simulated && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <SimTag /> Demo student with fake classes.
              {!latest && (
                <Link to="/sim" className="font-semibold text-brand">
                  Stall a train in the simulator →
                </Link>
              )}
            </div>
          )}

          {latest && (
            <div className="enter overflow-hidden rounded-2xl border border-stop/25 bg-stop-soft">
              <button onClick={() => setSheet(latest)} className="press flex w-full items-start gap-3 p-4 text-left">
                <OctagonAlert size={22} className="mt-0.5 shrink-0 text-stop" />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold leading-snug text-stop">{latest.title}</span>
                  <span className="mt-1 block text-[14px] leading-snug text-fg/85">{latest.body}</span>
                </span>
                <ChevronRight size={20} className="mt-0.5 shrink-0 text-stop" />
              </button>
              {lateness(latest).late && (
                <div className="flex items-center gap-3 border-t border-stop/20 px-4 py-3">
                  <span className="flex-1 text-[13px] font-semibold text-stop">You'll be about {lateness(latest).lateBy} min late</span>
                  <Link to={`/letter/${latest.incidentId}`} className={btn("danger", "sm")}>
                    <FileText size={15} /> Delay notice
                  </Link>
                </div>
              )}
            </div>
          )}

          {resumed && (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <CircleCheck size={16} className="shrink-0 text-go" />
              {resumed.title}. Your usual route is fine.
              <span className="tnum ml-auto text-xs">{myt(resumed.sentAt).hhmm}</span>
            </p>
          )}

          <section aria-label="Next class" className="rounded-2xl border border-line bg-surface">
            {cls ? (
              <>
                <div className="px-5 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <Eyebrow>Next class · {dayLabel}</Eyebrow>
                    {cls.source === "apspace" && <Badge tone="brand">APSpace · {user.intake}{user.group ? ` ${user.group}` : ""}</Badge>}
                    {cls.source === "demo" && <Badge tone="warn">Demo time</Badge>}
                  </div>
                  <div className="mt-2 text-[17px] font-bold leading-snug">{cls.title}</div>
                  <div className="mt-0.5 text-[13px] text-muted">{[cls.room, cls.lecturer].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="mt-4 grid grid-cols-2 border-t border-line">
                  <div className="px-5 py-3.5">
                    <div className="text-xs font-medium text-muted">Leave by</div>
                    <div className={`tnum mt-0.5 text-[30px] font-bold leading-none tracking-[-0.02em] ${minsToLeave != null && minsToLeave <= 5 ? "text-stop" : "text-fg"}`}>{leaveBy}</div>
                    <div className="mt-1.5 text-xs text-muted">{untilLeave}</div>
                  </div>
                  <div className="border-l border-line px-5 py-3.5">
                    <div className="text-xs font-medium text-muted">Class starts</div>
                    <div className="tnum mt-0.5 text-[30px] font-bold leading-none tracking-[-0.02em] text-muted">{cls.start}</div>
                    <div className="mt-1.5 text-xs text-muted">{routeMin} min trip</div>
                  </div>
                </div>
                {plan?.shuttle && (
                  <div className="border-t border-line px-5 py-3 text-[13px]">
                    <div className="flex items-center gap-2">
                      <BusFront size={16} className="shrink-0 text-muted" />
                      <span className="text-muted">
                        Catch the <span className="tnum font-semibold text-fg">{plan.shuttle}</span> APU shuttle from {legs[shuttleIdx]?.label?.replace(/^APU shuttle from /, "") || "LRT Bukit Jalil"}
                      </span>
                      <span className={`tnum ml-auto font-semibold ${plan.late ? "text-stop" : "text-fg"}`}>arr. {plan.arrive}</span>
                    </div>
                    <div className="mt-1 pl-6 text-xs text-muted">
                      About {plan.rideMin} min ride ({plan.source === "routes-api" ? "live traffic" : "traffic estimate for this hour"})
                      {plan.late ? ". No shuttle gets you there before class." : plan.tooLate ? `. The ${plan.tooLate.shuttle} would arrive ${plan.tooLate.arrive}, too late.` : "."}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex gap-3 p-5">
                <CalendarClock size={20} className="mt-0.5 shrink-0 text-muted" />
                <div>
                  <div className="font-semibold">{!user.intake ? "No classes yet" : !user.group ? "Pick your tutorial group" : "No on-campus class coming up"}</div>
                  <p className="mt-1 text-[13px] text-muted">
                    {!user.intake
                      ? "Add your APU intake code and Sampai pulls your timetable from APSpace. "
                      : !user.group
                        ? `APSpace lists every group's classes for ${user.intake}. Choose yours so Sampai shows only your classes. `
                        : `APSpace has no upcoming on-campus class for ${user.intake} ${user.group} this week. Online classes are skipped. `}
                    <Link to="/profile" className="font-semibold text-brand">
                      {!user.intake ? "Add intake" : !user.group ? "Choose group" : "Check intake"}
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </section>

          {desktop && railLeg && <div className="rounded-2xl border border-line bg-surface p-4">{action}</div>}

          {showAlertsPrompt && (
            <div className="flex items-start gap-3 rounded-2xl border border-brand/20 bg-brand-soft/60 p-4">
              <Bell size={20} className="mt-0.5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">Get buzzed when your train stalls</div>
                <p className="mt-0.5 text-[13px] text-muted">Alerts only come when a disruption affects your route and your next class.</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={turnOnAlerts}>Turn on alerts</Button>
                  <Button size="sm" variant="ghost" onClick={dismissAlertsPrompt}>Not now</Button>
                </div>
              </div>
            </div>
          )}

          {!desktop && map}

          <section aria-label="Conditions" className="flex flex-wrap gap-2">
            <Badge tone={heat?.advisory ? "warn" : "neutral"} icon={<Thermometer size={14} />}>
              <span className="tnum">Feels {heat?.apparentTemp != null ? Math.round(heat.apparentTemp) : "–"}°C</span>
              {heat?.advisory ? " · take shade" : ""}
              {heat?.simulated ? " (sim)" : ""}
            </Badge>
            <Badge tone={rain?.advisory ? "rain" : "neutral"} icon={<CloudRain size={14} />}>
              <span className="tnum">Rain {rain?.probNextHour ?? "–"}%</span> next hour{rain?.simulated ? " (sim)" : ""}
            </Badge>
            {metKL.length > 0 && (
              <Badge tone="stop" icon={<TriangleAlert size={14} />}>
                MET {metKL[0].title.replace(/ Warning$/i, "").toLowerCase()} warning
              </Badge>
            )}
          </section>

          <section aria-label="Your route">
            <div className="mb-3 flex items-baseline justify-between">
              <Eyebrow>Your route</Eyebrow>
              <Link to="/profile" className="text-[13px] font-semibold text-brand">
                Change
              </Link>
            </div>
            <ol>
              {legs.map((l, i) => {
                const Icon = legIcon[l.mode as keyof typeof legIcon] ?? Footprints;
                const t = legText(l);
                const last = i === legs.length - 1;
                return (
                  <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                    {!last && <span className="absolute bottom-0 left-[17px] top-9 w-px bg-line-strong" aria-hidden />}
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${l.mode === "rail" ? "bg-brand text-surface" : "bg-sunken text-fg"}`}>
                      <Icon size={17} />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="text-[15px] font-semibold leading-snug">{t.title}</div>
                      <div className="text-[13px] text-muted">{t.sub}</div>
                    </div>
                    <span className="tnum pt-1 text-[13px] text-muted">{l.minutes} min</span>
                  </li>
                );
              })}
            </ol>
          </section>

          {alerts.length > 0 && (
            <section aria-label="Recent alerts">
              <Eyebrow className="mb-2">Recent alerts</Eyebrow>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {alerts.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <button onClick={() => setSheet(a)} className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken/60">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${a.status === "active" ? "bg-stop" : "bg-go"}`} />
                      <span className="flex-1 truncate text-[14px]">{a.title}</span>
                      <span className="tnum text-xs text-muted">{myt(a.sentAt).hhmm}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-center text-[11px] leading-relaxed text-faint lg:text-left">Data: data.gov.my, Prasarana, MET Malaysia (CC BY 4.0), APSpace, Open-Meteo</p>
        </main>

        {desktop && <div className="py-6 lg:min-h-0">{map}</div>}
      </div>

      {!desktop && railLeg && (
        <div className="fixed inset-x-0 bottom-0 z-[800]">
          <div className="mx-auto max-w-md border-t border-line bg-surface px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 shadow-[0_-6px_24px_oklch(0.23_0.025_285/0.06)]">{action}</div>
        </div>
      )}

      {sheet && <AlertSheet alert={sheet} onClose={() => setSheet(null)} onWalk={(id) => setWalk(id as any)} />}
    </div>
  );
}
