/**
 * FCM web push + vibration. Push needs a real Firebase project + VAPID key;
 * in emulator mode the Firestore listener drives the banner and vibration instead.
 */
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { app, db, usingEmulators } from "./firebase";

export function buzz(pattern: number[] = [250, 120, 250, 120, 500]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS Safari has no vibrate */
  }
}

export type PushStatus = "unsupported" | "local" | "denied" | "enabled" | "error";

export async function enablePush(uid: string, onForeground: (data: Record<string, string>) => void): Promise<PushStatus> {
  if (!("Notification" in window)) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;
  if (usingEmulators || !vapidKey || !("serviceWorker" in navigator)) return "local";
  try {
    const { getMessaging, getToken, onMessage, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return "unsupported";
    const env = import.meta.env;
    const qs = new URLSearchParams({
      apiKey: env.VITE_FIREBASE_API_KEY,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    });
    const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs}`, { scope: "/firebase-cloud-messaging-push-scope" });
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (token) await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });
    onMessage(messaging, (m) => {
      buzz();
      onForeground((m.data as Record<string, string>) ?? {});
    });
    return "enabled";
  } catch (e) {
    console.warn("push", e);
    return "error";
  }
}

/** Local notification fallback (used while the tab is open, e.g. in emulator mode). */
export async function localNotify(title: string, body: string, tag: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const opts: any = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", vibrate: [250, 120, 250, 120, 500], renotify: true };
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts);
    else new Notification(title, opts);
  } catch {
    /* ignore */
  }
}
