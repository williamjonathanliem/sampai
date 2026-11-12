import { useEffect, useState } from "react";

/**
 * Decoration for the empty margins either side of the landing page's 1240px column.
 * Left: a rail line grows down the margin as you scroll, a train at its tip, stations lighting up.
 * Right: a road whose traffic (buses and cars) moves with the scroll and gets busier further down,
 * with a green bus route growing alongside. Fixed, behind nothing interactive, aria-hidden.
 * Hidden when the margins are too narrow to hold it; static for reduced motion.
 * Vehicles are drawn top-down by hand (no operator liveries or logos).
 */

const COLUMN = 1240;
const MIN_GUTTER = 120;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

function Train({ x, y, color }: { x: number; y: number; color: string }) {
  // three carriages, nose pointing down
  return (
    <g transform={`translate(${x - 8} ${y - 112})`}>
      {[0, 38, 76].map((dy, i) => (
        <g key={i} transform={`translate(0 ${dy})`}>
          <rect width={16} height={34} rx={i === 2 ? 7 : 4} fill={color} />
          <rect x={4} y={5} width={8} height={i === 2 ? 18 : 24} rx={2} fill="var(--color-surface)" opacity={0.55} />
        </g>
      ))}
      <rect x={4} y={110} width={8} height={3} rx={1.5} fill="var(--color-warn-fill)" />
    </g>
  );
}

function BusTop({ x, y, color, up }: { x: number; y: number; color: string; up: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${up ? 180 : 0})`}>
      <rect x={-9} y={-24} width={18} height={48} rx={4} fill={color} />
      <rect x={-6} y={14} width={12} height={7} rx={2} fill="var(--color-surface)" opacity={0.8} />
      {[-16, -8, 0, 8].map((wy) => (
        <rect key={wy} x={-6} y={wy} width={12} height={5} rx={1} fill="var(--color-surface)" opacity={0.35} />
      ))}
    </g>
  );
}

function CarTop({ x, y, color, up }: { x: number; y: number; color: string; up: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${up ? 180 : 0})`}>
      <rect x={-7} y={-13} width={14} height={26} rx={5} fill={color} />
      <rect x={-5} y={3} width={10} height={6} rx={2} fill="var(--color-surface)" opacity={0.75} />
      <rect x={-5} y={-9} width={10} height={4} rx={1.5} fill="var(--color-surface)" opacity={0.45} />
    </g>
  );
}

export default function SideFlow() {
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [s, setS] = useState({ y: 0, p: reduced ? 1 : 0, vw: typeof window !== "undefined" ? window.innerWidth : 0, vh: typeof window !== "undefined" ? window.innerHeight : 800 });

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setS({ y: window.scrollY, p: reduced ? 1 : clamp(window.scrollY / Math.max(1, max)), vw: window.innerWidth, vh: window.innerHeight });
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const gutter = Math.floor((s.vw - COLUMN) / 2);
  if (gutter < MIN_GUTTER) return null;
  const { vh, p } = s;
  const scroll = reduced ? 0 : s.y;
  const w = gutter;

  // ---- left: rail line, gentle S curve down the margin
  const cx = w * 0.5;
  const amp = Math.min(34, w * 0.18);
  const railPts: [number, number][] = [];
  for (let y = -20; y <= vh + 20; y += 12) railPts.push([cx + Math.sin(y / 190) * amp, y]);
  const railD = "M" + railPts.map(([x, y]) => `${x.toFixed(1)} ${y}`).join(" L");
  const grow = 0.12 + 0.88 * p; // share of the line drawn
  const tipY = -20 + grow * (vh + 40);
  const tipX = cx + Math.sin(tipY / 190) * amp;
  const stations = Array.from({ length: Math.ceil(vh / 150) }, (_, i) => 70 + i * 150).filter((y) => y < vh - 30);

  // ---- right: road with lanes; traffic count grows with scroll, positions move with scroll
  const roadX = w * 0.5;
  const laneL = roadX - 11;
  const laneR = roadX + 11;
  const nVehicles = 3 + Math.round(p * 7);
  const loop = vh + 120;
  const vehicles = Array.from({ length: nVehicles }, (_, i) => {
    const up = i % 2 === 1;
    const speed = 0.35 + ((i * 37) % 5) * 0.09;
    const base = (i * 211) % loop;
    const moved = (base + (up ? -1 : 1) * scroll * speed) % loop;
    const y = (moved + loop) % loop - 60;
    const kind = i % 3 === 0 ? "bus" : "car";
    const carColors = ["var(--color-muted)", "var(--color-rain)", "var(--color-fg)", "var(--color-warn)"];
    return { i, up, y, kind, x: up ? laneL : laneR, color: kind === "bus" ? "var(--color-go)" : carColors[i % carColors.length] };
  });
  const busRouteY = 0.1 * vh + p * 0.9 * vh;

  const layer = "pointer-events-none fixed inset-y-0 z-0 select-none";
  return (
    <>
      <div aria-hidden className={layer} style={{ left: 0, width: w }}>
        <svg width={w} height={vh} viewBox={`0 0 ${w} ${vh}`}>
          <path d={railD} fill="none" stroke="var(--color-line)" strokeWidth={8} strokeLinecap="round" />
          <path d={railD} fill="none" stroke="var(--color-brand)" strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - grow} opacity={0.85} />
          {stations.map((y) => {
            const x = cx + Math.sin(y / 190) * amp;
            const lit = y <= tipY;
            return <circle key={y} cx={x} cy={y} r={7} fill="var(--color-bg)" stroke={lit ? "var(--color-brand)" : "var(--color-line-strong)"} strokeWidth={3.5} />;
          })}
          {/* a second, quieter line crossing the margin */}
          <path d={`M${w * 0.1} ${vh * 0.62} C ${w * 0.4} ${vh * 0.55}, ${w * 0.7} ${vh * 0.72}, ${w + 10} ${vh * 0.66}`} fill="none" stroke="var(--color-stop)" strokeWidth={5} strokeLinecap="round" opacity={0.18 + p * 0.3} />
          <Train x={tipX} y={tipY} color="var(--color-brand)" />
        </svg>
      </div>
      <div aria-hidden className={layer} style={{ right: 0, width: w }}>
        <svg width={w} height={vh} viewBox={`0 0 ${w} ${vh}`}>
          <rect x={roadX - 26} y={0} width={52} height={vh} fill="var(--color-line)" opacity={0.8} />
          <line x1={roadX} y1={0} x2={roadX} y2={vh} stroke="var(--color-surface)" strokeWidth={2} strokeDasharray="12 14" strokeDashoffset={-scroll * 0.5} />
          {/* bus route growing along the kerb */}
          <line x1={roadX + 34} y1={0} x2={roadX + 34} y2={busRouteY} stroke="var(--color-go)" strokeWidth={5} strokeLinecap="round" opacity={0.7} />
          <circle cx={roadX + 34} cy={busRouteY} r={6} fill="var(--color-go)" />
          {vehicles.map((v) => (v.kind === "bus" ? <BusTop key={v.i} x={v.x} y={v.y} color={v.color} up={v.up} /> : <CarTop key={v.i} x={v.x} y={v.y} color={v.color} up={v.up} />))}
        </svg>
      </div>
    </>
  );
}
