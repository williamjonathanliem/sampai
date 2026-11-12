import "./env";
import { FIREBASE_PROJECT } from "./env";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const app = getApps()[0] ?? initializeApp({ projectId: FIREBASE_PROJECT });
export const db = getFirestore(app);
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  /* already set */
}
export const messaging = () => getMessaging(app);
export const usingEmulator = !!process.env.FIRESTORE_EMULATOR_HOST;
