/**
 * Address search + reverse geocoding for setting a student's home.
 * Proxied through the api so the student's IP and query don't go straight to a third party,
 * and results are cached. Backed by Photon (OpenStreetMap data, no key).
 */
import { distance } from "@turf/turf";
import localRules from "../../data/local_rules.json";
const PHOTON = "https://photon.komoot.io";
// Klang Valley bounding box (minLon, minLat, maxLon, maxLat), biased toward APU
const BBOX = "101.30,2.70,102.00,3.40";
const BIAS = "lat=3.07&lon=101.68";
const TTL = 60 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();

export interface Place {
  label: string;
  sub: string;
  lat: number;
  lon: number;
}

function toPlace(f: any): Place {
  const p = f.properties ?? {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const label = p.name || street || p.district || p.city || "Unnamed place";
  const sub = [p.name && street ? street : null, p.district, p.city, p.postcode].filter((x, i, a) => x && a.indexOf(x) === i && x !== label).join(", ");
  return { label, sub, lat: +f.geometry.coordinates[1].toFixed(5), lon: +f.geometry.coordinates[0].toFixed(5) };
}

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return data;
}

const headers = { "User-Agent": "Sampai/0.1 (hackathon prototype)" };

const NOMINATIM = "https://nominatim.openstreetmap.org";
const VIEWBOX = "101.30,3.40,102.00,2.70"; // left,top,right,bottom

function fromNominatim(r: any): Place {
  const a = r.address ?? {};
  const label = r.name || [a.house_number, a.road].filter(Boolean).join(" ") || a.suburb || a.city || r.display_name.split(",")[0];
  const sub = [a.road && r.name ? a.road : null, a.suburb || a.neighbourhood, a.city || a.town, a.postcode].filter((x: string | null, i: number, arr: any[]) => x && arr.indexOf(x) === i && x !== label).join(", ");
  return { label, sub, lat: +(+r.lat).toFixed(5), lon: +(+r.lon).toFixed(5) };
}

let photonDownUntil = 0; // skip a geocoder that just failed, so searches stay fast

async function photonSearch(query: string): Promise<Place[]> {
  if (Date.now() < photonDownUntil) throw new Error("photon recently down");
  const r = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=6&${BIAS}&bbox=${BBOX}`, { headers, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`photon HTTP ${r.status}`);
  const j: any = await r.json();
  return (j.features ?? []).map(toPlace);
}

/** Fallback when Photon is down: OpenStreetMap Nominatim, bounded to the Klang Valley (cached; well under 1 req/s). */
async function nominatimSearch(query: string): Promise<Place[]> {
  const r = await fetch(`${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=jsonv2&addressdetails=1&limit=6&countrycodes=my&viewbox=${VIEWBOX}&bounded=1`, { headers, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`nominatim HTTP ${r.status}`);
  return ((await r.json()) as any[]).map(fromNominatim);
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 3) return [];
  return cached(`s:${query.toLowerCase()}`, async () => {
    let list: Place[];
    try {
      list = await photonSearch(query);
    } catch (e: any) {
      if (!String(e.message).includes("recently down")) {
        photonDownUntil = Date.now() + 5 * 60_000;
        console.warn(`[geo] ${e.message}; using Nominatim for the next 5 min`);
      }
      list = await nominatimSearch(query);
    }
    const seen = new Set<string>();
    return withLocal(query, list).filter((p) => {
      const k = `${p.label}|${p.sub}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
  });
}

/** Local pin corrections (data/local_rules.json) for places OpenStreetMap puts in the wrong spot. */
const localPlaces = (localRules.places as { match: string[]; label: string; sub: string; lat: number; lon: number }[]).map(({ match, label, sub, lat, lon }) => ({ match, place: { label, sub, lat, lon } }));
function withLocal(query: string, list: Place[]): Place[] {
  const q = query.toLowerCase();
  const hits = localPlaces.filter((l) => l.match.some((m) => q.includes(m))).map((l) => l.place);
  if (!hits.length) return list;
  // the corrected pin replaces the geocoder's own result for the same place
  return [...hits, ...list.filter((p) => !hits.some((h) => h.label.toLowerCase() === p.label.toLowerCase()))];
}

export async function reversePlace(lat: number, lon: number): Promise<Place | null> {
  const near = localPlaces.find((l) => distance([lon, lat], [l.place.lon, l.place.lat], { units: "meters" }) < 200);
  if (near) return near.place;
  const key = `r:${lat.toFixed(4)},${lon.toFixed(4)}`;
  return cached(key, async () => {
    try {
      const r = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}`, { headers, signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error(`photon HTTP ${r.status}`);
      const j: any = await r.json();
      return j.features?.[0] ? toPlace(j.features[0]) : null;
    } catch {
      const r = await fetch(`${NOMINATIM}/reverse?lat=${lat}&lon=${lon}&format=jsonv2&addressdetails=1&zoom=17`, { headers, signal: AbortSignal.timeout(6000) });
      if (!r.ok) return null;
      return fromNominatim(await r.json());
    }
  });
}
