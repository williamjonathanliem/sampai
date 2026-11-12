import { db } from "./firebase";
import type { Conditions } from "../types";

export const HEAT_THRESHOLD = Number(process.env.HEAT_THRESHOLD ?? 35);
export const RAIN_THRESHOLD = Number(process.env.RAIN_THRESHOLD ?? 70);

export interface RealConditions {
  apparentTemp: number | null;
  rainProbNextHour: number | null;
  metWarnings: Conditions["metWarnings"];
  aqi?: number | null;
  pm25?: number | null;
  uv?: number | null;
  fetchedAt: number;
}
export interface SimConditions {
  rain?: boolean;
  heat?: number | null;
  haze?: boolean;
  setAt?: number;
}

export function merge(real: RealConditions | null, sim: SimConditions | null): Conditions {
  const now = Date.now();
  const simRain = !!sim?.rain;
  const simHeat = typeof sim?.heat === "number" ? sim.heat : null;
  const apparent = simHeat ?? real?.apparentTemp ?? null;
  const prob = simRain ? 95 : real?.rainProbNextHour ?? null;
  const warnings = [...(real?.metWarnings ?? [])];
  if (simRain) {
    warnings.unshift({
      title: "Thunderstorm and heavy rain warning (SIMULATED)",
      text: "Thunderstorms, heavy rain and strong winds expected over Kuala Lumpur and Petaling within the next hour.",
      affectsKL: true,
      simulated: true,
    });
  }
  return {
    heat: { apparentTemp: apparent, advisory: apparent != null && apparent >= HEAT_THRESHOLD, updatedAt: now, simulated: simHeat != null },
    rain: { probNextHour: prob, advisory: (prob ?? 0) >= RAIN_THRESHOLD || warnings.some((w) => w.affectsKL), updatedAt: now, simulated: simRain },
    metWarnings: warnings,
    // simulated haze: AQI 165 is "unhealthy" (a bad transboundary haze day in the Klang Valley)
    air: (() => {
      const aqi = sim?.haze ? 165 : real?.aqi ?? null;
      return { aqi, pm25: sim?.haze ? 82 : real?.pm25 ?? null, advisory: aqi != null && aqi > 100, simulated: !!sim?.haze };
    })(),
    uv: real?.uv ?? null,
    updatedAt: now,
  };
}

export async function getConditions(): Promise<Conditions | null> {
  const snap = await db.doc("conditions/current").get();
  return snap.exists ? (snap.data() as Conditions) : null;
}

export async function recomputeConditions(patch?: { real?: RealConditions; sim?: SimConditions | null }) {
  if (patch?.real) await db.doc("conditions/real").set(patch.real);
  if (patch && "sim" in patch) await db.doc("conditions/sim").set(patch.sim ?? {});
  const [r, s] = await Promise.all([db.doc("conditions/real").get(), db.doc("conditions/sim").get()]);
  const merged = merge(r.exists ? (r.data() as RealConditions) : null, s.exists ? (s.data() as SimConditions) : null);
  await db.doc("conditions/current").set(merged);
  return merged;
}
