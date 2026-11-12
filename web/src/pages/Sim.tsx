import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { along, length, lineString } from "@turf/turf";
import { Play, Square, OctagonX, CloudRain, Sun, Thermometer, ThermometerSnowflake, Bus, BarChart3, RotateCcw, Smartphone, Wind } from "lucide-react";
import MapView, { C, type Rider } from "../components/MapView";
import { useIncidents, useLiveBuses, useConditions, useLiveRiders } from "../lib/hooks";
import QRCode from "qrcode";
import { db } from "../lib/firebase";
import { api } from "../lib/api";
import { lineById, segmentsOfLine, snapToLine, pointAlong, segmentById } from "../../../shared/network";
import { fmtMyt } from "../../../shared/time";
import { Button, OpsBar, Segmented, Select } from "../components/ui";

interface SimRider {
  id: string;
  pos: number; // metres along the line
  dir: 1 | -1;
  speed: number; // m/s when moving
  stalled: boolean;
}

const LINE = "PH";
const TICK_MS = 1000;
const PING_EVERY = 2; // ticks
const DETECT_SECS = 30; // demo-mode stall window in the worker

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-5 last:border-0">
      <h2 className="mb-3 flex items-center gap-2.5 text-[14px] font-semibold">
        <span className="tnum grid h-6 w-6 place-items-center rounded-full bg-sunken text-xs font-bold text-muted">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Sim() {
  const line = lineById.get(LINE)!;
  const geo = useMemo(() => lineString(line.geometry.coordinates), [line]);
  const lineLen = useMemo(() => length(geo, { units: "meters" }), [geo]);
  // operate roughly between IOI Puchong Jaya and Bandar Tasik Selatan
  const span = useMemo(() => [lineLen * 0.25, lineLen * 0.58] as const, [lineLen]);

  const segs = segmentsOfLine(LINE);
  const [stallSeg, setStallSeg] = useState("PH:SP18>SP17");
  const [count, setCount] = useState(8);
  const [stallCount, setStallCount] = useState<"2" | "3" | "5">("3");
  const [speedMult, setSpeedMult] = useState<"1" | "3" | "6">("1");
  const [running, setRunning] = useState(false);
  const [stalledAt, setStalledAt] = useState<number | null>(null);
  const [riders, setRiders] = useState<SimRider[]>([]);
  const [log, setLog] = useState<{ t: string; msg: string; tone?: "stop" | "go" }[]>([]);
  const [realSessions, setRealSessions] = useState(0);
  const realRiders = useLiveRiders();
  const [phoneUrl, setPhoneUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    // on a deployed (HTTPS) site the phone uses the same address; locally, the laptop's Wi-Fi address
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    const go = (url: string) => {
      setPhoneUrl(url);
      QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#26223a", light: "#ffffff" } }).then(setQr).catch(() => null);
    };
    if (!local) return go(`${location.origin}/ride`);
    api<{ ips: string[]; webPort: number }>("/net")
      .then((n) => n.ips[0] && go(`http://${n.ips[0]}:${location.port || n.webPort}/ride`))
      .catch(() => null);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [, force] = useState(0);
  const ridersRef = useRef<SimRider[]>([]);
  const tickN = useRef(0);
  const incidents = useIncidents({ activeOnly: true });
  const buses = useLiveBuses();
  const cond = useConditions();
  const lastInc = useRef<Set<string>>(new Set());

  const say = (msg: string, tone?: "stop" | "go") => setLog((l) => [{ t: fmtMyt(Date.now()), msg, tone }, ...l].slice(0, 50));

  useEffect(() => onSnapshot(query(collection(db, "sessions"), where("active", "==", true)), (s) => setRealSessions(s.docs.filter((d) => !d.get("simulated")).length)), []);

  useEffect(() => {
    const ids = new Set(incidents.map((i) => i.id));
    for (const i of incidents) if (!lastInc.current.has(i.id)) say(`Incident ${i.id}: ${i.title}${i.source === "riders" ? ` (${i.riderCount} riders, ${i.confidence})` : ""}`, "stop");
    for (const id of lastInc.current) if (!ids.has(id)) say(`Cleared ${id}`, "go");
    lastInc.current = ids;
  }, [incidents]);

  function spawn(n: number) {
    const list: SimRider[] = Array.from({ length: n }, (_, i) => ({
      id: `sim-${Date.now().toString(36)}-${i}`,
      pos: span[0] + Math.random() * (span[1] - span[0]),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 10 + Math.random() * 6,
      stalled: false,
    }));
    ridersRef.current = list;
    setRiders(list);
    setRunning(true);
    setStalledAt(null);
    say(`Spawned ${n} simulated riders on the ${line.name}`);
  }

  function stall() {
    const seg = segmentById.get(stallSeg)!;
    const chosen = ridersRef.current.slice(0, Number(stallCount));
    chosen.forEach((r, i) => {
      const p = pointAlong(seg, 0.42 + i * 0.05);
      let best = 0,
        bestD = Infinity;
      for (let d = span[0] - 2000; d < span[1] + 2000; d += 25) {
        const c = along(geo, Math.max(0, d) / 1000).geometry.coordinates;
        const dd = (c[0] - p.lon) ** 2 + (c[1] - p.lat) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = d;
        }
      }
      r.pos = best;
      r.stalled = true;
    });
    setStalledAt(Date.now());
    say(`Train stalled between ${seg.fromName} and ${seg.toName} with ${chosen.length} riders on board`, "stop");
    if (!running) setRunning(true);
  }

  function resume() {
    ridersRef.current.forEach((r) => (r.stalled = false));
    setStalledAt(null);
    say("Train moving again", "go");
  }

  useEffect(() => {
    if (!running) return;
    const mult = Number(speedMult);
    const t = setInterval(() => {
      tickN.current++;
      const list = ridersRef.current;
      for (const r of list) {
        if (r.stalled) continue;
        r.pos += r.dir * r.speed * mult * (TICK_MS / 1000);
        if (r.pos > span[1]) (r.pos = span[1]), (r.dir = -1);
        if (r.pos < span[0]) (r.pos = span[0]), (r.dir = 1);
        if (stalledAt) {
          // riders reaching the stalled stretch queue behind it
          const c = along(geo, r.pos / 1000).geometry.coordinates;
          const s = snapToLine(LINE, c[1], c[0]);
          if (s?.segment.segmentId === stallSeg && s.distToStationM > 160) r.stalled = true;
        }
      }
      setRiders([...list]);
      if (tickN.current % PING_EVERY === 0 && list.length) {
        const pings = list.map((r) => {
          const c = along(geo, r.pos / 1000).geometry.coordinates;
          return {
            sessionId: r.id,
            mode: "rail",
            lineId: LINE,
            lat: c[1] + (Math.random() - 0.5) * 0.00008,
            lon: c[0] + (Math.random() - 0.5) * 0.00008,
            accuracy: 12 + Math.random() * 10,
            speed: r.stalled ? Math.random() * 0.3 : r.speed * (0.9 + Math.random() * 0.2),
            motion: r.stalled ? +(0.01 + Math.random() * 0.04).toFixed(3) : +(0.4 + Math.random() * 0.8).toFixed(3),
            ts: Date.now(),
            simulated: true,
          };
        });
        api("/ping", { pings }).catch((e) => say(`Ping failed: ${e.message}. Is the api running?`, "stop"));
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [running, speedMult, stalledAt, stallSeg]);

  useEffect(() => {
    if (!stalledAt) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [stalledAt]);

  const realOnMap: Rider[] = realRiders.map((r) => ({ id: `real-${r.id}`, lat: r.lat, lon: r.lon, stalled: r.still, real: true }));
  const mapRiders: Rider[] = riders.map((r) => {
    const c = along(geo, r.pos / 1000).geometry.coordinates;
    return { id: r.id, lat: c[1], lon: c[0], stalled: r.stalled };
  });

  const act = async (key: string, label: string, path: string, body: any = {}) => {
    setBusy(key);
    try {
      await api(path, body);
      say(label);
    } catch (e: any) {
      say(`${label} failed: ${e.message}`, "stop");
    } finally {
      setBusy(null);
    }
  };

  const stallSecs = stalledAt ? Math.round((Date.now() - stalledAt) / 1000) : 0;
  const stallIncident = incidents.find((i) => i.segmentId === stallSeg);
  const stalledRiders = riders.filter((r) => r.stalled).length;

  return (
    <div className="flex h-full flex-col">
      <OpsBar
        badge={
          <span className="inline-flex h-7 items-center rounded-md bg-warn-fill px-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-fg">Simulated</span>
        }
      />
      <div className="sim-stripes h-1.5 shrink-0" aria-hidden />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[46vh] shrink-0 lg:h-auto lg:flex-1">
          <MapView riders={[...mapRiders, ...realOnMap]} incidents={incidents} buses={buses} center={[3.065, 101.67]} zoom={13} />
          <div className="absolute bottom-6 left-3 z-[500] rounded-xl bg-surface px-3.5 py-2.5 text-xs ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: C.go }} />Moving rider</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: C.stop }} />Stalled rider</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: C.muted }} />Live bus</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-muted">
              <Smartphone size={13} /> {riders.length} simulated riders · {realSessions} real phone{realSessions === 1 ? "" : "s"} on board
            </div>
          </div>
        </div>

        <aside className="w-full shrink-0 overflow-y-auto border-line bg-surface lg:w-[400px] lg:border-l">
          <div className="px-5 pb-1 pt-5">
            <h1 className="text-[18px] font-bold">Simulator</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">Fake riders post to the same <code className="rounded bg-sunken px-1 font-mono text-[12px]">/ping</code> endpoint as real phones, flagged simulated.</p>
          </div>

          <section className="border-b border-line px-5 py-5">
            <h2 className="mb-3 flex items-center gap-2.5 text-[14px] font-semibold">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-rain-soft text-rain">
                <Smartphone size={13} />
              </span>
              Add a real phone
            </h2>
            <div className="flex gap-4">
              {qr ? <img src={qr} alt="QR code that opens Sampai's on-board screen on a phone" className="h-28 w-28 shrink-0 rounded-lg ring-1 ring-line" /> : <div className="h-28 w-28 shrink-0 animate-pulse rounded-lg bg-sunken" />}
              <div className="min-w-0 text-[12.5px] leading-relaxed text-muted">
                <p>Scan, pick the line, tap <b className="text-fg">Start sharing</b>. The phone shows up here as a blue dot and counts as a rider, with the simulated ones.</p>
                {phoneUrl?.startsWith("http://") && (
                  <p className="mt-1.5">
                    Same Wi-Fi as this laptop. GPS needs HTTPS: on Android Chrome add <span className="break-all font-mono text-[11px] text-fg">{phoneUrl.replace("/ride", "")}</span> under chrome://flags, "Insecure origins treated as secure".
                  </p>
                )}
              </div>
            </div>
            {realRiders.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {realRiders.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-[12.5px]">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.still ? "bg-stop" : "bg-rain"}`} />
                    <span className="font-mono text-[11px] text-muted">{r.id}</span>
                    <span className="flex-1 truncate">
                      {r.segment ? (r.atStation ? "at a station" : segmentById.get(r.segment) ? `${segmentById.get(r.segment)!.fromName} → ${segmentById.get(r.segment)!.toName}` : r.segment) : "off the line"}
                    </span>
                    <span className="tnum text-muted">{r.still ? `still ${r.stillForSec}s${r.reported ? " · reported" : ""}` : `${r.speed} m/s`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Step n={1} title={`Riders on the ${line.name}`}>
            <label className="flex items-center gap-3">
              <span className="w-12 text-[13px] text-muted">Riders</span>
              <input type="range" min={2} max={30} value={count} onChange={(e) => setCount(+e.target.value)} className="flex-1 accent-[var(--color-brand)]" aria-label="Number of riders" />
              <span className="tnum w-6 text-right text-[14px] font-semibold">{count}</span>
            </label>
            <div className="mt-3 flex items-center gap-3">
              <span className="w-12 text-[13px] text-muted">Speed</span>
              <Segmented className="flex-1" value={speedMult} onChange={setSpeedMult} options={[{ value: "1", label: "1×" }, { value: "3", label: "3×" }, { value: "6", label: "6×" }]} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="go" onClick={() => spawn(count)} icon={<Play size={16} />}>
                {riders.length ? "Respawn" : "Spawn riders"}
              </Button>
              <Button variant="secondary" disabled={!riders.length} onClick={() => (setRunning(false), (ridersRef.current = []), setRiders([]), setStalledAt(null), say("Riders removed"))} icon={<Square size={15} />}>
                Remove
              </Button>
            </div>
          </Step>

          <Step n={2} title="Train breakdown">
            <Select value={stallSeg} onChange={(e) => setStallSeg(e.target.value)} aria-label="Segment to stall">
              {segs.map((s) => (
                <option key={s.segmentId} value={s.segmentId}>
                  {s.fromName} → {s.toName}
                </option>
              ))}
            </Select>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-[13px] text-muted">Riders on the stalled train</span>
              <Segmented className="ml-auto w-36" value={stallCount} onChange={setStallCount} options={[{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "5", label: "5" }]} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="danger" onClick={() => (ridersRef.current.length ? stall() : (spawn(count), setTimeout(stall, 300)))} icon={<OctagonX size={17} />}>
                Stall train
              </Button>
              <Button variant="secondary" disabled={!stalledAt} onClick={resume} icon={<Play size={16} />}>
                Resume
              </Button>
            </div>
            {stalledAt && (
              <div className="mt-4 rounded-xl bg-stop-soft p-3.5" role="status">
                <div className="flex items-center justify-between text-[13px] font-semibold text-stop">
                  <span>{stallIncident ? "Incident raised" : `Detecting… ${stalledRiders} riders still`}</span>
                  <span className="tnum">{stallSecs}s</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-stop transition-[width] duration-700 ease-linear" style={{ width: `${stallIncident ? 100 : Math.min(100, (stallSecs / DETECT_SECS) * 100)}%` }} />
                </div>
                <p className="mt-2 text-xs text-stop/90">Demo mode: 2+ riders still between stations for {DETECT_SECS}s</p>
              </div>
            )}
          </Step>

          <Step n={3} title="Weather and heat">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" loading={busy === "rain"} onClick={() => act("rain", "MET heavy rain warning (simulated)", "/sim/conditions", { rain: true })} icon={<CloudRain size={16} className="text-rain" />}>
                Heavy rain
              </Button>
              <Button variant="secondary" loading={busy === "dry"} onClick={() => act("dry", "Rain warning lifted", "/sim/conditions", { rain: false })} icon={<Sun size={16} />}>
                Clear rain
              </Button>
              <Button variant="secondary" loading={busy === "heat"} onClick={() => act("heat", "Heatwave 37°C (simulated)", "/sim/conditions", { heat: 37 })} icon={<Thermometer size={16} className="text-warn" />}>
                Heatwave 37°C
              </Button>
              <Button variant="secondary" loading={busy === "haze"} onClick={() => act("haze", "Haze, air quality 165 (simulated)", "/sim/conditions", { haze: true })} icon={<Wind size={16} className="text-warn" />}>
                Haze
              </Button>
              <Button variant="secondary" loading={busy === "clean"} onClick={() => act("clean", "Air quality back to live data", "/sim/conditions", { haze: false })} icon={<Wind size={16} />}>
                Clear haze
              </Button>
              <Button variant="secondary" loading={busy === "live"} onClick={() => act("live", "Temperature back to live data", "/sim/conditions", { heat: null })} icon={<ThermometerSnowflake size={16} />}>
                Live temp
              </Button>
            </div>
            <p className="tnum mt-3 text-xs text-muted">
              Now: feels {cond?.heat?.apparentTemp != null ? Math.round(cond.heat.apparentTemp) : "–"}°C, rain {cond?.rain?.probNextHour ?? "–"}% next hour{cond?.rain?.advisory ? ", rain advisory on" : ""}
            </p>
          </Step>

          <Step n={4} title="Buses (GTFS Realtime)">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" loading={busy === "bus"} onClick={() => act("bus", "Two T580 buses stuck (simulated)", "/sim/bus", { routeId: "T5800", action: "stall" })} icon={<Bus size={16} className="text-stop" />}>
                T580 stuck
              </Button>
              <Button variant="secondary" loading={busy === "busok"} onClick={() => act("busok", "T580 moving again", "/sim/bus", { routeId: "T5800", action: "clear" })} icon={<Bus size={16} />}>
                Clear buses
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted">{buses.filter((b) => !b.simulated).length} live Rapid KL buses near APU right now</p>
          </Step>

          <Step n={5} title="Data">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" loading={busy === "seed"} onClick={() => act("seed", "Seeded 30 days of simulated history", "/sim/seed-history", { count: 140 })} icon={<BarChart3 size={16} />}>
                Seed history
              </Button>
              <Button variant="secondary" loading={busy === "reset"} onClick={() => (resume(), act("reset", "Reset: incidents cleared, demo alerts removed", "/sim/reset"))} icon={<RotateCcw size={16} />}>
                Reset demo
              </Button>
            </div>
          </Step>

          <section className="px-5 pb-8 pt-5">
            <h2 className="mb-2 text-[14px] font-semibold">Event log</h2>
            <ol className="h-52 overflow-y-auto rounded-xl bg-sunken p-3 font-mono text-[12px] leading-relaxed" aria-live="polite">
              {log.length ? (
                log.map((l, i) => (
                  <li key={i} className={l.tone === "stop" ? "text-stop" : l.tone === "go" ? "text-go" : "text-fg/80"}>
                    <span className="tnum mr-2 text-faint">{l.t}</span>
                    {l.msg}
                  </li>
                ))
              ) : (
                <li className="text-muted">Spawn riders, then stall a train.</li>
              )}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
