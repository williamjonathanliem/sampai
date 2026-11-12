import { useEffect, useRef, useState } from "react";
import { BellRinging } from "@phosphor-icons/react";
import { HERO_MAP as M } from "./heroMapData";
import { ROUTE_PATH, BRAND } from "./Logo";
import { useMedia } from "../lib/useMedia";

/**
 * Landing hero: the real Sri Petaling line around Bukit Jalil (Prasarana GTFS geometry),
 * three riders stop on the Sri Petaling to Bukit Jalil stretch, and the real T580 reroute appears.
 */

const LOOP = 11500;
const MOVE = 3000;
const DELAYS = [0, 260, 520];
const STALL_AT = 3700; // riders have stopped
const REROUTE_AT = 5900; // alert and detour
const FADE_AT = 10900; // clear the board before looping

type Phase = 0 | 1 | 2 | 3;

const status: Record<Exclude<Phase, 3>, { tone: "go" | "stop" | "alert"; title: string; body: string }> = {
  0: { tone: "go", title: "3 riders on the Sri Petaling line", body: "Heading for Bukit Jalil. Class at 09:00." },
  1: { tone: "stop", title: "3 riders stopped before Bukit Jalil", body: "Still for 2 minutes between stations. That's a stall." },
  2: { tone: "alert", title: "Sri Petaling line stalled before Bukit Jalil", body: "Take bus T580 from Awan Besar. Arrive 08:52, class at 09:00." },
};

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);

const label = (name: string, [x, y]: readonly [number, number], dy: number, muted = false) => (
  <text key={name} x={x} y={y + dy} textAnchor="middle" fontSize={muted ? 13 : 15} fontWeight={600} fill={muted ? "var(--color-faint)" : "var(--color-fg)"}>
    {name}
  </text>
);

export function HeroMap() {
  const box = useRef<HTMLDivElement>(null);
  const ride = useRef<SVGPathElement>(null);
  const riders = useRef<(SVGCircleElement | null)[]>([]);
  const [phase, setPhase] = useState<Phase>(0);
  // phones: zoom into Awan Besar to APU so labels stay readable
  const narrow = useMedia("(max-width: 639px)");
  const view = narrow ? "112 50 428 220" : `0 0 ${M.w} ${M.h}`;

  useEffect(() => {
    const path = ride.current;
    if (!path) return;
    const len = path.getTotalLength();
    const targets = [0.3, 0.5, 0.7].map((f) => (M.rideSplit + (1 - M.rideSplit) * f) * len);
    const startAt = 0.015 * len;
    const put = (i: number, dist: number) => {
      const c = riders.current[i];
      if (!c) return;
      const p = path.getPointAtLength(dist);
      c.setAttribute("cx", p.x.toFixed(1));
      c.setAttribute("cy", p.y.toFixed(1));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      targets.forEach((d, i) => put(i, d));
      setPhase(2);
      return;
    }

    let raf = 0;
    let t0 = performance.now();
    let visible = true;
    let last: Phase = 0;
    const frame = (now: number) => {
      const t = (now - t0) % LOOP;
      DELAYS.forEach((delay, i) => put(i, startAt + (targets[i] - startAt) * ease((t - delay) / MOVE)));
      const p: Phase = t >= FADE_AT ? 3 : t >= REROUTE_AT ? 2 : t >= STALL_AT ? 1 : 0;
      if (p !== last) {
        last = p;
        setPhase(p);
      }
      if (visible) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // pause while off screen
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !visible) {
        visible = true;
        t0 = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!e.isIntersecting) {
        visible = false;
        cancelAnimationFrame(raf);
      }
    });
    if (box.current) io.observe(box.current);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  const on = (from: Phase) => (phase >= from && phase < 3 ? 1 : 0);
  const s = status[phase === 3 ? 2 : phase];
  const busMid = M.bus.stops[2].xy;

  return (
    <figure ref={box} className="w-full">
      <div className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 caption-3 text-fg">
            <span className="h-2 w-4 rounded-full" style={{ background: M.line.color }} aria-hidden />
            Sri Petaling line · Bukit Jalil
          </span>
          <span className="caption-4 text-muted">Example trip</span>
        </div>

        <div className="bg-sunken" aria-hidden>
          <svg viewBox={view} className="block w-full">
            {/* covered walk, Bukit Jalil LRT to APU */}
            <path d={M.walk} fill="none" stroke="var(--color-muted)" strokeWidth={3} strokeDasharray="1 7" strokeLinecap="round" />

            {/* T580 through its real stops */}
            <g style={{ opacity: on(2), transition: "opacity 500ms var(--ease-brand)" }}>
              <path d={M.bus.d} fill="none" stroke="var(--color-brand)" strokeWidth={5} strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" />
              {M.bus.stops.map((b) => (
                <circle key={b.name} cx={b.xy[0]} cy={b.xy[1]} r={4} fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth={3} />
              ))}
              <g transform={`translate(${busMid[0] - 26} ${busMid[1] + 14})`}>
                <rect width={52} height={24} rx={6} fill="var(--color-brand)" />
                <text x={26} y={17} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--color-surface)">
                  T580
                </text>
              </g>
            </g>

            {/* the line, real track geometry */}
            <path d={M.line.d} fill="none" stroke={M.line.color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
            <path
              d={M.stall}
              fill="none"
              stroke="var(--color-stop)"
              strokeWidth={8}
              strokeLinecap="round"
              className={phase === 1 || phase === 2 ? "pulse-stop" : undefined}
              style={{ opacity: on(1), transition: "opacity 300ms var(--ease-brand)" }}
            />
            <path ref={ride} d={M.ride} fill="none" stroke="none" />

            {M.stations.map((st) => (
              <circle key={st.id} cx={st.xy[0]} cy={st.xy[1]} r={8} fill="var(--color-surface)" stroke={M.line.color} strokeWidth={4} />
            ))}
            {M.stations.map((st) => {
              const muted = st.id === "SP20" || st.id === "SP16";
              if (muted && narrow) return null; // outside the phone crop
              const dy = st.id === "SP17" ? 32 : -18;
              return label(st.name, st.xy, dy, muted);
            })}

            {/* APU */}
            <svg x={M.apu[0] - 14} y={M.apu[1] - 14} width={28} height={28} viewBox="0 0 512 512">
              <rect width="512" height="512" rx="120" fill={BRAND.senja} />
              <path d={ROUTE_PATH} fill="none" stroke={BRAND.putih} strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="366" cy="146" r="44" fill={BRAND.lampu} />
            </svg>
            <text x={M.apu[0] + 22} y={M.apu[1] + 5} fontSize={15} fontWeight={700} fill="var(--color-fg)">
              APU
            </text>

            {/* riders */}
            {[0, 1, 2].map((i) => (
              <circle
                key={i}
                ref={(el) => {
                  riders.current[i] = el;
                }}
                cx={-20}
                cy={-20}
                r={7}
                stroke="var(--color-surface)"
                strokeWidth={3}
                style={{
                  fill: phase >= 1 && phase < 3 ? "var(--color-stop)" : "var(--color-go)",
                  opacity: phase === 3 ? 0 : 1,
                  transition: "fill 300ms var(--ease-brand), opacity 400ms var(--ease-brand)",
                }}
              />
            ))}
          </svg>
        </div>

        {/* what the student's phone says right now */}
        <div className="flex min-h-24 items-start gap-3 px-4 py-4 sm:px-6" aria-hidden>
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.tone === "go" ? "bg-go-soft text-go" : "bg-stop-soft text-stop"}`}
            style={{ transition: "background-color 300ms var(--ease-brand), color 300ms var(--ease-brand)" }}
          >
            {s.tone === "alert" ? <BellRinging size={16} weight="bold" /> : <span className={`h-2 w-2 rounded-full ${s.tone === "go" ? "bg-go" : "bg-stop"}`} />}
          </span>
          <div key={phase === 3 ? 2 : phase} className="enter min-w-0 flex-1" style={{ opacity: phase === 3 ? 0 : 1, transition: "opacity 400ms var(--ease-brand)" }}>
            <p className={`body-4 ${s.tone === "go" ? "text-fg" : "text-stop"}`}>{s.title}</p>
            <p className="mt-0.5 caption-2 text-muted">{s.body}</p>
          </div>
          {s.tone === "alert" && phase !== 3 && <span className="enter shrink-0 rounded-full bg-go-soft px-2 py-0.5 caption-3 text-go">On time</span>}
        </div>
      </div>
      <figcaption className="mt-3 caption-5 text-muted">
        Drawn from Prasarana's GTFS track geometry and the real T580 bus stops. The riders and times are an example.
      </figcaption>
    </figure>
  );
}
