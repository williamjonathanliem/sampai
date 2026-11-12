import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db, ensureAuth } from "./firebase";
import { api } from "./api";
import type { AlertDoc, Conditions, Incident, UserDoc, ClassSlot } from "../../../shared/types";
import { myt, mytToEpoch, minToHhmm } from "../../../shared/time";

export function useUid() {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    ensureAuth().then((u) => setUid(u.uid)).catch((e) => console.error("auth", e));
  }, []);
  return uid;
}

export function useUserDoc(uid: string | null) {
  const [user, setUser] = useState<UserDoc | null | undefined>(undefined);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (s) => setUser(s.exists() ? (s.data() as UserDoc) : null), () => setUser(null));
  }, [uid]);
  return user;
}

export const parseIncident = (d: any): Incident => ({ ...d, id: d.id, geometry: typeof d.geometry === "string" ? JSON.parse(d.geometry) : d.geometry ?? null });

export function useIncidents(opts: { activeOnly?: boolean; max?: number } = {}) {
  const [list, setList] = useState<Incident[]>([]);
  useEffect(() => {
    const q = opts.activeOnly
      ? query(collection(db, "incidents"), where("status", "==", "active"))
      : query(collection(db, "incidents"), orderBy("startedAt", "desc"), limit(opts.max ?? 500));
    return onSnapshot(q, (s) => setList(s.docs.map((d) => parseIncident({ ...d.data(), id: d.id })).sort((a, b) => b.startedAt - a.startedAt)), (e) => console.warn("incidents", e));
  }, [opts.activeOnly, opts.max]);
  return list;
}

export function useIncident(id?: string) {
  const [inc, setInc] = useState<Incident | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return;
    return onSnapshot(doc(db, "incidents", id), (s) => setInc(s.exists() ? parseIncident({ ...s.data(), id: s.id }) : null), () => setInc(null));
  }, [id]);
  return inc;
}

/** Returns null until the first snapshot arrives, so callers can tell "loading" from "no alerts". */
export function useAlerts(uid: string | null) {
  const [list, setList] = useState<AlertDoc[] | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(collection(db, "alerts"), where("uid", "==", uid)), (s) => setList(s.docs.map((d) => d.data() as AlertDoc).sort((a, b) => b.sentAt - a.sentAt)));
  }, [uid]);
  return list;
}

export function useConditions() {
  const [c, setC] = useState<Conditions | null>(null);
  useEffect(() => onSnapshot(doc(db, "conditions", "current"), (s) => setC(s.exists() ? (s.data() as Conditions) : null)), []);
  return c;
}

export interface LiveBus {
  id: string;
  routeId: string;
  lat: number;
  lon: number;
  stuck: boolean;
  simulated: boolean;
}

export function useLiveBuses() {
  const [b, setB] = useState<LiveBus[]>([]);
  useEffect(() => onSnapshot(doc(db, "live", "buses"), (s) => setB((s.data()?.buses as LiveBus[]) ?? [])), []);
  return b;
}

export function useNow(ms = 15_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export interface NextClass {
  title: string;
  start: string;
  startTs: number;
  lecturer?: string | null;
  room?: string | null;
  source: "apspace" | "profile" | "demo";
}

/** Same rules as the worker: APSpace timetable first, then the profile, then a demo class ~50 min out. */
export function useNextClass(user: UserDoc | null | undefined, now: number): NextClass | null {
  const [apu, setApu] = useState<any>(null);
  useEffect(() => {
    if (!user?.intake) return setApu(null);
    api(`/apu/timetable?intake=${encodeURIComponent(user.intake)}${user.group ? `&group=${encodeURIComponent(user.group)}` : ""}`).then(setApu).catch(() => setApu(null));
  }, [user?.intake, user?.group]);

  if (!user) return null;
  if (apu?.next) {
    const c = apu.next;
    return { title: c.module, start: c.start, startTs: c.startTs, lecturer: c.lecturer, room: c.room, source: "apspace" };
  }
  const t = myt(now);
  const rel = user.simulated ? (user.classes ?? []).find((c) => typeof c.inMin === "number") : undefined;
  if (rel) {
    const startMin = Math.ceil((t.minutes + rel.inMin!) / 5) * 5;
    return { title: rel.title ?? "Class", start: minToHhmm(startMin), startTs: mytToEpoch(t.date, minToHhmm(startMin)), lecturer: rel.lecturer, room: rel.room, source: "demo" };
  }
  const today = (user.classes ?? [])
    .filter((c: ClassSlot) => c.day === 0 || c.day === t.dow)
    .map((c) => ({ ...c, ts: mytToEpoch(t.date, c.start) }))
    .filter((c) => c.ts > now)
    .sort((a, b) => a.ts - b.ts)[0];
  if (today) return { title: today.title ?? "Class", start: today.start, startTs: today.ts, lecturer: today.lecturer, room: today.room, source: "profile" };
  if (user.simulated) {
    const startMin = Math.ceil((t.minutes + 50) / 15) * 15;
    const first = user.classes?.[0];
    return { title: first?.title ?? "Class", start: minToHhmm(startMin), startTs: mytToEpoch(t.date, minToHhmm(startMin)), lecturer: first?.lecturer, room: first?.room, source: "demo" };
  }
  return null;
}

export interface LiveRider {
  id: string;
  lat: number;
  lon: number;
  segment: string | null;
  atStation: boolean;
  speed: number;
  still: boolean;
  stillForSec: number;
  reported: boolean;
}

/** Real phones on board right now (published by the worker; no uid, rounded positions). */
export function useLiveRiders() {
  const [r, setR] = useState<LiveRider[]>([]);
  useEffect(() => onSnapshot(doc(db, "live", "riders"), (s) => setR((s.data()?.riders as LiveRider[]) ?? [])), []);
  return r;
}
