import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, OctagonX, Play, TrainFront, MapPin, Gauge, Activity, Signal, CircleCheck, TriangleAlert, Smartphone } from "lucide-react";
import { useUid, useUserDoc, useIncident } from "../lib/hooks";
import { startSession, stopSession, onSensor, report, type SensorState } from "../lib/sensors";
import { lines, lineById } from "../../../shared/network";
import { Badge, Button, Eyebrow, Select, btn } from "../components/ui";

function Stat({ icon: Icon, label, value, warn }: { icon: typeof Gauge; label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-sunken px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
        <Icon size={13} /> {label}
      </div>
      <div className={`tnum mt-0.5 text-[15px] font-semibold ${warn ? "text-warn" : ""}`}>{value}</div>
    </div>
  );
}

/** The on-board screen: the phone is a sensor while this is open. */
export default function Ride() {
  const uid = useUid();
  const user = useUserDoc(uid);
  const nav = useNavigate();
  const [s, setS] = useState<SensorState | null>(null);
  const [lineId, setLineId] = useState("PH");
  const [starting, setStarting] = useState(false);
  const inc = useIncident(s?.view?.incidentId ?? undefined);

  useEffect(() => onSensor(setS), []);
  useEffect(() => {
    const rail = user?.route?.legs.find((l) => l.mode === "rail");
    if (rail?.lineId) setLineId(rail.lineId);
  }, [user?.route?.legs?.length]);

  const rail = user?.route?.legs.find((l) => l.mode === "rail");
  const secure = typeof window !== "undefined" && window.isSecureContext;

  async function start() {
    if (!uid) return;
    setStarting(true);
    try {
      await startSession({ uid, mode: "rail", lineId, destStop: rail?.lineId === lineId ? rail?.toStop : undefined });
    } finally {
      setStarting(false);
    }
  }

  // ---------- not on board yet ----------
  if (!s) {
    return (
      <div className="mx-auto max-w-md px-5 pb-16 pt-[max(env(safe-area-inset-top),14px)]">
        <button onClick={() => nav("/app")} className={btn("ghost", "sm", "-ml-2")}>
          <ArrowLeft size={17} /> Back
        </button>
        <h1 className="mt-4 text-[26px] font-bold tracking-[-0.02em]">On the train</h1>
        <p className="mt-1.5 text-[15px] leading-relaxed text-muted">While this screen is on, your phone's GPS and motion help Sampai spot a stalled train. Shared anonymously, only until you get off.</p>

        {!secure && (
          <div className="mt-5 flex gap-2.5 rounded-xl bg-warn-soft p-3.5 text-[13px] text-warn">
            <TriangleAlert size={17} className="mt-0.5 shrink-0" />
            <span>
              This page isn't on HTTPS, so the browser blocks GPS and motion. Open Sampai from its HTTPS link, or on Android Chrome add this address under <b>chrome://flags → Insecure origins treated as secure</b>.
            </span>
          </div>
        )}

        <div className="mt-6">
          <span className="mb-1.5 block text-[13px] font-semibold">Which line are you on?</span>
          <Select value={lineId} onChange={(e) => setLineId(e.target.value)}>
            {lines.map((l) => (
              <option key={l.lineId} value={l.lineId}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <Button size="lg" className="mt-6 w-full" loading={starting} onClick={start} icon={<TrainFront size={19} />}>
          Start sharing
        </Button>
        <p className="mt-3 text-center text-[12px] text-muted">Your browser will ask for location and motion access.</p>
      </div>
    );
  }

  // ---------- on board ----------
  const v = s.view;
  const snap = s.snap;
  const line = lineById.get(s.lineId ?? "")?.name ?? "the line";
  const where = !s.lastFix
    ? { tone: "neutral" as const, text: "Waiting for GPS…", sub: "Stand near a window if you're inside a station." }
    : !snap
      ? { tone: "neutral" as const, text: "Sending your first location…", sub: "" }
      : !snap.onLine
        ? { tone: "warn" as const, text: `Not on the ${line}`, sub: `${snap.distToLineM} m from the track. Pick the right line, or wait for a better GPS fix.` }
        : snap.atStation
          ? { tone: "go" as const, text: `At ${snap.atStation}`, sub: "Stops at stations are normal and never count as a stall." }
          : { tone: "go" as const, text: `Between ${snap.between[0]} and ${snap.between[1]}`, sub: "" };

  const detector = inc
    ? { tone: "stop" as const, text: "Stall confirmed", sub: `${inc.riderCount} riders stopped here. Students on this route are being alerted.` }
    : v?.still
      ? { tone: "warn" as const, text: `Stopped for ${v.stillForSec}s`, sub: `${v.ridersHere} of ${v.needRiders} riders needed on this stretch · confirms after ${v.needSec}s` }
      : v
        ? { tone: "go" as const, text: `Moving · ${v.speed.toFixed(1)} m/s`, sub: `${v.ridersHere} rider${v.ridersHere === 1 ? "" : "s"} sharing on this stretch` }
        : { tone: "neutral" as const, text: "Listening…", sub: "The detector answers after a couple of pings." };

  const toneCls = { neutral: "bg-sunken text-fg", go: "bg-go-soft text-go", warn: "bg-warn-soft text-warn", stop: "bg-stop-soft text-stop" };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-5 pb-8 pt-[max(env(safe-area-inset-top),14px)]">
      <div className="flex items-center justify-between">
        <Link to="/app" className={btn("ghost", "sm", "-ml-2")}>
          <ArrowLeft size={17} /> Home
        </Link>
        <Badge tone="rain" icon={<span className="relative mr-0.5 flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-rain/60" /><span className="relative h-2 w-2 rounded-full bg-rain" /></span>}>
          Sharing · {Math.max(0, Math.round((Date.now() - s.startedAt) / 60000))} min
        </Badge>
      </div>

      <Eyebrow className="mt-6">{line}</Eyebrow>
      <div className={`mt-2 rounded-2xl p-4 ${toneCls[where.tone]}`}>
        <div className="flex items-start gap-2.5">
          <MapPin size={19} className="mt-0.5 shrink-0" />
          <div>
            <div className="text-[17px] font-bold leading-snug">{where.text}</div>
            {where.sub && <div className="mt-0.5 text-[13px] opacity-85">{where.sub}</div>}
          </div>
        </div>
      </div>

      <div className={`mt-3 rounded-2xl p-4 ${toneCls[detector.tone]}`}>
        <div className="flex items-start gap-2.5">
          {inc ? <TriangleAlert size={19} className="mt-0.5 shrink-0" /> : v?.still ? <OctagonX size={19} className="mt-0.5 shrink-0" /> : <CircleCheck size={19} className="mt-0.5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold leading-snug">{detector.text}</div>
            <div className="mt-0.5 text-[13px] opacity-85">{detector.sub}</div>
            {inc && (
              <Link to={`/incident/${inc.id}`} className="mt-2 inline-block text-[13px] font-semibold underline underline-offset-2">
                See the incident
              </Link>
            )}
          </div>
        </div>
      </div>

      {s.error && <p className="mt-3 rounded-xl bg-stop-soft px-3.5 py-2.5 text-[13px] text-stop">{s.error}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Stat icon={Signal} label="GPS accuracy" value={s.lastFix ? `±${Math.round(s.lastFix.accuracy)} m` : "–"} warn={!!s.lastFix && s.lastFix.accuracy > 100} />
        <Stat icon={Gauge} label="Phone speed" value={s.speed != null ? `${s.speed.toFixed(1)} m/s` : "–"} />
        <Stat icon={Activity} label="Motion" value={s.motionAvailable ? (s.motion != null ? `${s.motion < 0.15 ? "Calm" : "Shaking"} · ${s.motion}` : "Reading…") : "Not available"} warn={!s.motionAvailable} />
        <Stat icon={Smartphone} label="Pings sent" value={`${s.pings}${s.lastPingAt ? ` · ${Math.round((Date.now() - s.lastPingAt) / 1000)}s ago` : ""}`} />
      </div>

      <div className="mt-auto space-y-2.5 pt-8">
        {s.reported ? (
          <Button variant="go" size="lg" className="w-full" onClick={() => report("moving")} icon={<Play size={18} />}>
            We're moving again
          </Button>
        ) : (
          <Button variant="danger" size="lg" className="w-full" onClick={() => report("stopped")} icon={<OctagonX size={19} />}>
            Train's not moving
          </Button>
        )}
        <p className="text-center text-[12px] text-muted">Tap if the train is stuck between stations. Two riders reporting confirms a stall in about 10 seconds.</p>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => stopSession().then(() => nav("/app"))}>
          I'm off the train
        </Button>
      </div>
    </div>
  );
}
