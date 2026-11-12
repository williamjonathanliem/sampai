import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, connectAuthEmulator, onAuthStateChanged, type User } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const env = import.meta.env;
export const usingEmulators = !env.VITE_FIREBASE_PROJECT_ID;

const app = initializeApp(
  usingEmulators
    ? { apiKey: "demo-key", authDomain: "demo-sampai.firebaseapp.com", projectId: "demo-sampai", appId: "demo-app" }
    : {
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        appId: env.VITE_FIREBASE_APP_ID,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      },
);

export const auth = getAuth(app);
export const db = getFirestore(app);
export { app };

if (usingEmulators) {
  const host = location.hostname === "localhost" ? "127.0.0.1" : location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8085);
}

let ready: Promise<User> | null = null;
export function ensureAuth(): Promise<User> {
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const off = onAuthStateChanged(auth, (u) => {
        if (u) {
          off();
          resolve(u);
        }
      });
      signInAnonymously(auth).catch(reject);
    });
  }
  return ready;
}

/**
 * Start over: forget this device's profile and anonymous sign-in, so the next visit is a brand-new student.
 * Deletes the profile doc (alerts stay server-side but belong to the old anonymous id), signs out, clears local prefs.
 */
export async function resetSession() {
  const { signOut } = await import("firebase/auth");
  const { doc, deleteDoc } = await import("firebase/firestore");
  const u = auth.currentUser;
  if (u) await deleteDoc(doc(db, "users", u.uid)).catch(() => null);
  await signOut(auth).catch(() => null);
  ready = null;
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("sampai.")) localStorage.removeItem(k);
  } catch {
    /* private mode */
  }
}
