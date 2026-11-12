/**
 * "What to bring" reminders from the weather a student will actually walk through.
 * Shared by the home screen (conditions now) and route options (forecast at departure, minutes outdoors).
 * Thresholds: MET Malaysia heat categories (35°C+ alert, 40°C+ heatwave), Open-Meteo precipitation
 * probability, US AQI bands (101-150 sensitive groups, 151+ unhealthy), WHO UV index bands (8+ very high).
 */
export type BringKind = "umbrella" | "storm" | "water" | "heatwave" | "sun" | "mask" | "mask-n95";

export interface BringItem {
  kind: BringKind;
  item: string; // short noun phrase: "Umbrella"
  why: string; // one line: "70% chance of rain around 08:10"
  tone: "rain" | "warn" | "stop";
}

export interface BringInput {
  rainProb?: number | null; // %
  metStorm?: boolean; // MET thunderstorm / heavy rain warning for KL
  feels?: number | null; // apparent temperature °C
  uv?: number | null;
  aqi?: number | null; // US AQI
  outdoorMin?: number | null; // minutes outside on this trip (null = unknown)
  at?: string | null; // "08:10", for the wording
}

export function bringList(w: BringInput): BringItem[] {
  const out: BringItem[] = [];
  const outside = w.outdoorMin ?? 10;
  const when = w.at ? ` around ${w.at}` : "";
  const rain = w.rainProb ?? 0;

  if (w.metStorm) out.push({ kind: "storm", item: "Umbrella", why: `MET thunderstorm warning for KL${when}. Avoid open walkways`, tone: "stop" });
  else if (rain >= 50 && outside >= 2) out.push({ kind: "umbrella", item: "Umbrella", why: `${rain}% chance of rain${when}`, tone: "rain" });
  else if (rain >= 30 && outside >= 10) out.push({ kind: "umbrella", item: "Small umbrella", why: `${rain}% chance of a shower${when}, ${outside} min outdoors`, tone: "rain" });

  const feels = w.feels ?? null;
  if (feels != null && feels >= 40) out.push({ kind: "heatwave", item: "Water and shade", why: `Heatwave: feels ${Math.round(feels)}°C${when}. Keep walks short`, tone: "stop" });
  else if (feels != null && feels >= 35 && outside >= 5) out.push({ kind: "water", item: "Water bottle", why: `Feels ${Math.round(feels)}°C${when}`, tone: "warn" });

  if ((w.uv ?? 0) >= 8 && outside >= 10 && !w.metStorm && rain < 60) out.push({ kind: "sun", item: "Cap or sunscreen", why: `UV index ${Math.round(w.uv!)} (very high)`, tone: "warn" });

  const aqi = w.aqi ?? null;
  if (aqi != null && aqi > 150) out.push({ kind: "mask-n95", item: "N95 mask", why: `Haze: air quality ${Math.round(aqi)} (unhealthy)`, tone: "stop" });
  else if (aqi != null && aqi > 100 && outside >= 3) out.push({ kind: "mask", item: "Face mask", why: `Hazy: air quality ${Math.round(aqi)}`, tone: "warn" });

  return out;
}
