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

async function openMeteo(): Promise<{ apparentTemp: number | null; rainProbNextHour: number | null }> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${APU.lat}&longitude=${APU.lon}&hourly=apparent_temperature,precipitation_probability&current=temperature_2m,apparent_temperature,precipitation&timezone=Asia/Kuala_Lumpur&forecast_days=2`;
    const j: any = await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).json();
    const nowIso = j.current?.time as string; // local time "2026-11-12T16:30"
    const hours: string[] = j.hourly?.time ?? [];
    const idx = Math.max(0, hours.findIndex((h) => h > nowIso) - 1);
    const probs: number[] = (j.hourly?.precipitation_probability ?? []).slice(idx, idx + 2);
    return { apparentTemp: j.current?.apparent_temperature ?? null, rainProbNextHour: probs.length ? Math.max(...probs) : null };
  } catch (e: any) {
    console.warn(`[weather] open-meteo failed: ${e.message}`);
    return { apparentTemp: null, rainProbNextHour: null };
  }
}

let lastWeather: any = null;
export const weatherStats = () => lastWeather;

export async function pollWeather() {
  const [warnings, om] = await Promise.all([metWarnings(), openMeteo()]);
  const real: RealConditions = { ...om, metWarnings: warnings, fetchedAt: Date.now() };
  const merged = await recomputeConditions({ real });
  await syncWeatherIncident(merged.metWarnings.find((w) => w.affectsKL) ?? null);
  lastWeather = { at: Date.now(), apparentTemp: om.apparentTemp, rainProb: om.rainProbNextHour, klWarnings: warnings.filter((w) => w.affectsKL).length };
  return merged;
}

/** One active weather incident at a time, opened/closed by KL-relevant MET warnings (real or simulated). */
export async function syncWeatherIncident(w: { title: string; text: string; simulated?: boolean } | null) {
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
