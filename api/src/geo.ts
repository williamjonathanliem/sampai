/**
 * Address search + reverse geocoding for setting a student's home.
 * Proxied through the api so the student's IP and query don't go straight to a third party,
 * and results are cached. Backed by Photon (OpenStreetMap data, no key).
 */
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

export async function searchPlaces(q: string): Promise<Place[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 3) return [];
  return cached(`s:${query.toLowerCase()}`, async () => {
    const r = await fetch(`${PHOTON}/api/?q=${encodeURIComponent(query)}&limit=6&${BIAS}&bbox=${BBOX}`, { headers, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`geocoder HTTP ${r.status}`);
    const j: any = await r.json();
    const seen = new Set<string>();
    return (j.features ?? []).map(toPlace).filter((p: Place) => {
      const k = `${p.label}|${p.sub}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });
  });
}

export async function reversePlace(lat: number, lon: number): Promise<Place | null> {
  const key = `r:${lat.toFixed(4)},${lon.toFixed(4)}`;
  return cached(key, async () => {
    const r = await fetch(`${PHOTON}/reverse?lat=${lat}&lon=${lon}`, { headers, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return j.features?.[0] ? toPlace(j.features[0]) : null;
  });
}
