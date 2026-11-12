# Handoff: move the api and worker to Render (free)

**Why:** Cloud Run needs Firebase's Blaze plan (card required). We stay on Spark (free) for Firestore, Auth and push, and host the two Node servers on Render's free plan instead.

**Good news:** the code already supports this through settings. `render.yaml` sets them. You should not need code changes unless something below fails.

## Where things stand

- Web app: Firebase Hosting, https://sampai-437f3.web.app (`npm run deploy:web` from a laptop with `web/.env.production`).
- Database, sign-in, push: Firebase project `sampai-437f3`, Spark plan.
- api + worker: **not deployed yet.** That's this task.
- Without the api, the site loads but route options, address search, reports and the simulator fail.

## Steps (about 30 min)

1. **Firebase service account key.** Firebase console > Project settings > Service accounts > Generate new private key. Downloads a JSON file. Keep it secret. Never commit it.
2. **Render blueprint.** render.com > New > Blueprint > connect the GitHub repo. It reads `render.yaml` and creates `sampai-api` and `sampai-worker`.
3. **Secret file, on both services.** Environment > Secret Files > add `firebase-sa.json` with the JSON from step 1.
4. **Fill the blank env vars:**
   - `GEMINI_API_KEY` on both (AI Studio key, free; the same one in `api/.env` locally).
   - `WORKER_URL` on the api: the worker's Render URL, e.g. `https://sampai-worker.onrender.com`.
   - `PUBLIC_WEB_URL` on both: https://sampai-437f3.web.app (used in report QR codes).
5. **Deploy both.** Check `https://<api>.onrender.com/net` returns JSON.
6. **Point the web app at the api.** In `web/.env.production`: `VITE_API_URL=https://<api>.onrender.com`, then `npm run deploy:web`.
7. **Firestore rules and indexes**, if not done yet: `npx firebase-tools deploy --only firestore --project sampai-437f3` (works on Spark).
8. **Smoke test** on the live site: onboard with an intake code, search a home, see route options, open `/sim`, stall a train, get the alert, make a report.

## Things to know

- **Render free sleeps after 15 min idle.** The first request then takes about 40 s. Before the pitch, open the api `/net` and the worker URL to wake both. Optional: a free uptime pinger (e.g. UptimeRobot every 10 min) keeps them awake.
- **Pub/Sub is off** (`USE_PUBSUB=false`). The api posts the same messages straight to the worker. Same behaviour, no Google Cloud needed.
- **BigQuery is off** (`USE_BIGQUERY=false`). The dashboard still works from Firestore.
- **Gemini** is rate-limited on the free key at busy times; Sampai falls back to `gemini-3.5-flash-lite`, then to templates. Nothing breaks.
- **CORS** already allows any origin (`app.use(cors())` in `api/src/index.ts`).

## If something fails

| Symptom | Likely cause |
|---|---|
| api logs `Could not load the default credentials` | Secret file missing or not named `firebase-sa.json` |
| api tries `127.0.0.1:8085` | `GCP_PROJECT` not set (it falls back to the emulators) |
| Alerts never arrive | `WORKER_URL` wrong, or the worker is asleep |
| Site calls `:8080` | `VITE_API_URL` empty in `web/.env.production`, or not redeployed after setting it |

## Next feature after deploy

"Getting them home": after the last class, show route options APU → home. The APU shuttle runs both ways (APSpace), and the route engine (`api/src/routeOptions.ts`) can be reused with origin and destination swapped.
