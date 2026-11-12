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
