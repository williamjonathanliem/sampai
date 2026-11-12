/**
 * Weather + heat (sections 6.3, 6.4, 7.4).
 * MET Malaysia warnings (data.gov.my) + Open-Meteo apparent temperature and rain probability.
 */
import { recomputeConditions, type RealConditions } from "../../shared/server/conditions";
import { createIncident, updateIncident } from "../../shared/server/incidents";
import { geminiJSON } from "../../shared/server/gemini";
import { db } from "../../shared/server/firebase";
import { APU } from "../../shared/network";

const KL_WORDS = /(kuala lumpur|w\.?p\.? kuala lumpur|putrajaya|petaling|selangor|klang|hulu langat|sepang)/i;
const RAIN_WORDS = /(thunderstorm|heavy rain|continuous rain|ribut petir|hujan lebat|hujan berterusan)/i;
const SEA_WORDS = /(rough seas|laut bergelora|waters of|nautical)/i;

async function metWarnings(): Promise<RealConditions["metWarnings"]> {
  try {
    const res = await fetch("https://api.data.gov.my/weather/warning?limit=15", { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    const list: any[] = await res.json();
    const now = Date.now();
    return list
      .filter((w) => {
        const to = Date.parse((w.valid_to ?? "") + "+08:00");
        return Number.isNaN(to) || to > now;
      })
      .map((w) => {
        const title = w.warning_issue?.title_en ?? w.heading_en ?? "Weather warning";
        const text = String(w.text_en ?? "");
        const land = !SEA_WORDS.test(title) && !SEA_WORDS.test(text.slice(0, 200));
        return {
          title,
          text: text.slice(0, 600),
          validFrom: w.valid_from,
          validTo: w.valid_to,
          affectsKL: land && RAIN_WORDS.test(title + " " + text) && KL_WORDS.test(text),
        };
      })
      .slice(0, 5);
  } catch (e: any) {
    console.warn(`[weather] MET failed: ${e.message}`);
    return [];
  }
}

async function airQuality(): Promise<{ aqi: number | null; pm25: number | null }> {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${APU.lat}&longitude=${APU.lon}&current=us_aqi,pm2_5&timezone=Asia/Kuala_Lumpur`;
    const j: any = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).json();
    return { aqi: j.current?.us_aqi ?? null, pm25: j.current?.pm2_5 ?? null };
  } catch (e: any) {
    console.warn(`[weather] air quality failed: ${e.message}`);
    return { aqi: null, pm25: null };
  }
}

async function openMeteo(): Promise<{ apparentTemp: number | null; rainProbNextHour: number | null; uv: number | null }> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${APU.lat}&longitude=${APU.lon}&hourly=apparent_temperature,precipitation_probability&current=temperature_2m,apparent_temperature,precipitation,uv_index&timezone=Asia/Kuala_Lumpur&forecast_days=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const j: any = await res.json();
    // shared hosting IPs hit Open-Meteo's free limits: it answers with {error, reason} and no data
    if (!res.ok || j.error || !j.current) throw new Error(`HTTP ${res.status} ${j.reason ?? "no current data"}`);
    const nowIso = j.current?.time as string; // local time "2026-11-12T16:30"
    const hours: string[] = j.hourly?.time ?? [];
    const idx = Math.max(0, hours.findIndex((h) => h > nowIso) - 1);
    const probs: number[] = (j.hourly?.precipitation_probability ?? []).slice(idx, idx + 2);
    return { apparentTemp: j.current?.apparent_temperature ?? null, rainProbNextHour: probs.length ? Math.max(...probs) : null, uv: j.current?.uv_index ?? null };
  } catch (e: any) {
    console.warn(`[weather] open-meteo failed: ${e.message}; trying met.no`);
    return metNo();
  }
}

/** Fallback forecast: MET Norway (free, no key, needs a User-Agent). Apparent temperature via the NOAA heat index. */
async function metNo(): Promise<{ apparentTemp: number | null; rainProbNextHour: number | null; uv: number | null }> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${APU.lat.toFixed(4)}&lon=${APU.lon.toFixed(4)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Sampai/0.1 (student commute prototype)" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j: any = await res.json();
    const now = j.properties?.timeseries?.[0]?.data;
    const d = now?.instant?.details ?? {};
    const t: number | undefined = d.air_temperature;
    const rh: number | undefined = d.relative_humidity;
    let feels: number | null = t ?? null;
    if (t != null && rh != null && t >= 27) {
      const f = (t * 9) / 5 + 32;
      const hi = -42.379 + 2.04901523 * f + 10.14333127 * rh - 0.22475541 * f * rh - 0.00683783 * f * f - 0.05481717 * rh * rh + 0.00122874 * f * f * rh + 0.00085282 * f * rh * rh - 0.00000199 * f * f * rh * rh;
      feels = Math.round((((hi - 32) * 5) / 9) * 10) / 10;
    }
    const nh = now?.next_1_hours?.details ?? {};
    // probability isn't published for every location; estimate it from the expected amount
    const amt: number | undefined = nh.precipitation_amount;
    const rain = nh.probability_of_precipitation ?? (amt == null ? null : amt >= 1 ? 80 : amt >= 0.3 ? 60 : amt > 0 ? 35 : 10);
    return { apparentTemp: feels, rainProbNextHour: rain, uv: d.ultraviolet_index_clear_sky ?? null };
  } catch (e: any) {
    console.warn(`[weather] met.no failed: ${e.message}`);
    return { apparentTemp: null, rainProbNextHour: null, uv: null };
  }
}

let lastWeather: any = null;
export const weatherStats = () => lastWeather;

export async function pollWeather() {
  const [warnings, om, air] = await Promise.all([metWarnings(), openMeteo(), airQuality()]);
  const real: RealConditions = { ...om, ...air, metWarnings: warnings, fetchedAt: Date.now() };
  const merged = await recomputeConditions({ real });
  await syncWeatherIncident(merged.metWarnings.find((w) => w.affectsKL) ?? null);
  lastWeather = { at: Date.now(), apparentTemp: om.apparentTemp, rainProb: om.rainProbNextHour, klWarnings: warnings.filter((w) => w.affectsKL).length };
  return merged;
}

/** One active weather incident at a time, opened/closed by KL-relevant MET warnings (real or simulated). */
/** One sync at a time: two polls landing together used to open two identical weather incidents. */
let syncing: Promise<void> = Promise.resolve();
export function syncWeatherIncident(w: { title: string; text: string; simulated?: boolean } | null) {
  syncing = syncing.then(() => syncWeatherIncidentNow(w)).catch((e) => console.warn(`[weather] incident sync failed: ${e.message}`));
  return syncing;
}

async function syncWeatherIncidentNow(w: { title: string; text: string; simulated?: boolean } | null) {
  const snap = await db.collection("incidents").where("type", "==", "weather").where("status", "==", "active").get();
  const existing = snap.docs[0];
  if (w && !existing) {
    const parsed = await geminiJSON<{ severity: string; summary: string }>(
      `Summarise this Malaysian weather warning for a student commuting in Kuala Lumpur. Return JSON {"severity":"low|medium|high","summary":"<max 120 chars, plain words>"}.\n\n${w.title}\n${w.text}`,
    );
    await createIncident({
      type: "weather",
      riderCount: 0,
      confidence: "high",
      source: "met",
      simulated: !!w.simulated,
      title: w.title.replace(/\s*\(SIMULATED\)/, ""),
      summary: parsed?.summary ?? "Thunderstorms and heavy rain expected over Kuala Lumpur and Selangor. Allow extra time and use covered paths.",
      center: { lat: APU.lat, lon: APU.lon },
    });
  } else if (!w && existing) {
    await updateIncident(existing.id, {}, "cleared");
  }
}
