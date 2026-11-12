/**
 * "Recently used" profile values, kept in this browser only, so Start over or a demo switch
 * doesn't mean retyping your name, intake and home. Never sent anywhere.
 */
export interface RecentHome {
  label: string;
  lat: number;
  lon: number;
}
export interface Recent {
  name?: string;
  lang?: "en" | "ms";
  intakes: { intake: string; group?: string | null }[];
  homes: RecentHome[];
}

const KEY = "sampai.recent";
const MAX = 3;

export function loadRecent(): Recent {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (r && Array.isArray(r.intakes) && Array.isArray(r.homes)) return r;
  } catch {
    /* private window or blocked storage */
  }
  return { intakes: [], homes: [] };
}

export function rememberProfile(p: { name?: string; lang?: "en" | "ms"; intake?: string | null; group?: string | null; home?: RecentHome | null }) {
  const r = loadRecent();
  if (p.name && p.name !== "Student") r.name = p.name;
  if (p.lang) r.lang = p.lang;
  if (p.intake) r.intakes = [{ intake: p.intake, group: p.group ?? null }, ...r.intakes.filter((i) => i.intake !== p.intake)].slice(0, MAX);
  if (p.home) {
    const h = p.home;
    r.homes = [h, ...r.homes.filter((x) => Math.abs(x.lat - h.lat) > 1e-4 || Math.abs(x.lon - h.lon) > 1e-4)].slice(0, MAX);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function forgetRecent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
