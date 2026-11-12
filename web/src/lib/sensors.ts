/**
 * Phone as a sensor: GPS + motion -> /ping, only during an active "I'm on board" session.
 * The server answers each ping with where it matched you on the line, and the on-board screen
 * polls what the stall detector sees for this session.
 */
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { api } from "./api";
import { stationById } from "../../../shared/network";
import { distance } from "@turf/turf";

export interface SessionOpts {
  uid: string;
  mode: "rail" | "bus";
  lineId?: string;
  routeId?: string;
  destStop?: string;
}

export interface Snap {
  onLine: boolean;
  distToLineM: number;
  segmentId: string;
  between: [string, string];
  atStation: string | null;
}

export interface DetectorView {
  segment: string | null;
  atStation: boolean;
  speed: number;
  still: boolean;
  stillForSec: number;
  reported: boolean;
  ridersHere: number;
  incidentId: string | null;
  needRiders: number;
  needSec: number;
}

export interface SensorState {
  sessionId: string;
  lineId?: string;
  startedAt: number;
  lastFix?: { lat: number; lon: number; accuracy: number; ts: number };
  speed: number | null;
  motion: number | null;
  motionAvailable: boolean;
  pings: number;
  lastPingAt?: number;
  snap?: Snap | null;
  view?: DetectorView | null;
  reported: boolean;
  error?: string;
}

const PING_MS = 4000;
const MAX_MS = 90 * 60_000;

let watchId: number | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let accel: { t: number; m: number }[] = [];
let state: SensorState | null = null;
let opts: SessionOpts | null = null;
const listeners = new Set<(s: SensorState | null) => void>();
let prevFix: SensorState["lastFix"] | null = null;
let gpsSpeed: number | null = null;
let pendingReport: "stopped" | "moving" | null = null;

const emit = () => listeners.forEach((l) => l(state ? { ...state } : null));
export const onSensor = (fn: (s: SensorState | null) => void) => {
  listeners.add(fn);
  fn(state ? { ...state } : null);
  return () => {
    listeners.delete(fn);
  };
};

function onMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity ?? e.acceleration;
  if (!a || a.x == null) return;
  const m = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
  const now = Date.now();
  accel.push({ t: now, m });
  accel = accel.filter((x) => now - x.t <= 5000);
  if (state && !state.motionAvailable) {
    state.motionAvailable = true;
    emit();
  }
}

function motionVariance() {
  if (accel.length < 5) return null;
  const mean = accel.reduce((s, x) => s + x.m, 0) / accel.length;
  return +(accel.reduce((s, x) => s + (x.m - mean) ** 2, 0) / accel.length).toFixed(4);
}

async function sendPing() {
  if (!state?.lastFix || !opts) return;
  const c = state.lastFix;
  let speed = gpsSpeed;
  if ((speed == null || Number.isNaN(speed)) && prevFix) {
    const dt = (c.ts - prevFix.ts) / 1000;
    speed = dt > 0 ? distance([prevFix.lon, prevFix.lat], [c.lon, c.lat], { units: "meters" }) / dt : null;
  }
  state.speed = speed ?? null;
  state.motion = motionVariance();
  const report = pendingReport;
  pendingReport = null;
  try {
    const r = await api<{ accepted: number; snap?: Snap | null }>("/ping", {
      sessionId: state.sessionId,
      uid: opts.uid,
      mode: opts.mode,
      lineId: opts.lineId ?? null,
      routeId: opts.routeId ?? null,
      lat: c.lat,
      lon: c.lon,
      accuracy: c.accuracy,
      speed: state.speed,
      motion: state.motion,
      ts: Date.now(),
      simulated: false,
      report,
    });
    if (!state) return;
    state.pings++;
    state.lastPingAt = Date.now();
    if (r.snap !== undefined) state.snap = r.snap;
    state.error = undefined;
    // ask the detector what it sees for this session (every other ping, or right after a report)
    if (report || state.pings % 2 === 0) {
      const v = await api<DetectorView | null>(`/session/${encodeURIComponent(state.sessionId)}`).catch(() => null);
      if (state) state.view = v;
    }
  } catch (e: any) {
    if (state) state.error = `Can't reach Sampai: ${e.message}`;
    if (report) pendingReport = report; // retry with the next ping
  }
  emit();
}

/** Must be called from a user tap (iOS motion permission). */
export async function startSession(o: SessionOpts) {
  await stopSession();
  opts = o;
  const DM: any = (window as any).DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === "function") {
    try {
      await DM.requestPermission();
    } catch {
      /* motion denied: GPS only */
    }
  }
  window.addEventListener("devicemotion", onMotion);

  const sessionId = `s_${o.uid.slice(0, 6)}_${Date.now().toString(36)}`;
  const startedAt = Date.now();
  state = { sessionId, lineId: o.lineId, startedAt, speed: null, motion: null, motionAvailable: false, pings: 0, reported: false };
  await setDoc(doc(db, "sessions", sessionId), { uid: o.uid, mode: o.mode, lineId: o.lineId ?? null, routeId: o.routeId ?? null, startedAt, active: true, simulated: false });

  if (!("geolocation" in navigator)) {
    state.error = "This browser has no location access.";
  } else {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        prevFix = state?.lastFix ?? null;
        gpsSpeed = pos.coords.speed;
        if (state) state.lastFix = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, ts: pos.timestamp };
        emit();
      },
      (err) => {
        if (state) state.error = err.code === err.PERMISSION_DENIED ? "Location permission was denied. Allow it in the browser's site settings." : err.message;
        emit();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  timer = setInterval(async () => {
    await sendPing();
    const c = state?.lastFix;
    const dest = o.destStop ? stationById.get(o.destStop) : null;
    if (state && (Date.now() - startedAt > MAX_MS || (c && dest && distance([dest.lon, dest.lat], [c.lon, c.lat], { units: "meters" }) < 120))) stopSession();
  }, PING_MS);
  emit();
  return sessionId;
}

/** "Train's not moving" / "Moving again": sent with an immediate ping. */
export async function report(kind: "stopped" | "moving") {
  if (!state) return;
  pendingReport = kind;
  state.reported = kind === "stopped";
  emit();
  await sendPing();
}

export async function stopSession() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  if (timer) clearInterval(timer);
  window.removeEventListener("devicemotion", onMotion);
  watchId = null;
  timer = null;
  accel = [];
  pendingReport = null;
  const s = state;
  state = null;
  opts = null;
  emit();
  if (s) await updateDoc(doc(db, "sessions", s.sessionId), { active: false, endedAt: Date.now() }).catch(() => null);
}
