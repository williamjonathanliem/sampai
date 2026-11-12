// Import this first in every server entry point.
// Local dev: read the service's .env (Cloud Run passes real env vars and has no .env file).
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env here */
}
// With no GCP project configured, point firebase-admin at the local emulators.
export const GCP_PROJECT = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
export const LOCAL = !GCP_PROJECT || process.env.LOCAL === "true";
export const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT || GCP_PROJECT || "demo-sampai";

if (!GCP_PROJECT) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8085";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
}

export const DEMO_MODE = (process.env.DEMO_MODE ?? "true") === "true";
export const WORKER_URL = process.env.WORKER_URL || "http://localhost:8081";
export const API_URL = process.env.API_URL || "http://localhost:8080";
export const PUBLIC_WEB_URL = process.env.PUBLIC_WEB_URL || "http://localhost:5173";
