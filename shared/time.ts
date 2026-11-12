// Malaysia time helpers (UTC+8, no DST).
const MYT_OFFSET_MS = 8 * 3600_000;

export function myt(ts = Date.now()) {
  const d = new Date(ts + MYT_OFFSET_MS);
  const iso = d.toISOString();
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Mon..7=Sun
  return {
    date: iso.slice(0, 10),
    hhmm: iso.slice(11, 16),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    dow,
  };
}

export const hhmmToMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
};

export const minToHhmm = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

/** Epoch ms for a MYT date (YYYY-MM-DD) + "HH:MM". */
export function mytToEpoch(date: string, hhmm: string) {
  return Date.parse(`${date}T${hhmm}:00+08:00`);
}

export function fmtMyt(ts: number, withDate = false) {
  const t = myt(ts);
  if (!withDate) return t.hhmm;
  const d = new Date(ts + MYT_OFFSET_MS);
  const day = d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return `${day}, ${t.hhmm}`;
}
