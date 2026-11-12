# Sampai

**Your train stopped. You'll still get to class.**

Sampai is a commute app for APU students in Kuala Lumpur. Riders' phones become live sensors for the LRT, because Malaysia publishes live GPS for every bus but not for a single train. When several riders stop between two stations, Sampai raises an incident, buzzes every student whose next class it affects with a new plan, and writes an incident report for the lecturer if they're late anyway.

Built for the APU Cloud Innovation Hackathon 2026.

**Making the pitch deck?** Start with [docs/PITCH.md](docs/PITCH.md): story, numbers, demo script, judge Q&A and slide outline.

## What it does

| | |
|---|---|
| **Detects stalled trains** | Riders tap "I'm on the train" (or opt in once to auto-share on their commute). Their phone sends GPS and motion every few seconds. Several riders stopped on the same stretch at the same time is an incident. |
| **Alerts with a plan** | Students on that line with a class soon get a push, plus options timed against their class: other trains, the APU shuttle, Rapid KL buses, walking or a taxi. |
| **Plans every trip** | Route options from home to APU, timed to the real APU shuttle schedule (APSpace), Rapid KL bus timetables and traffic. Feeder bus → train → shuttle combinations included. |
| **Real classes** | Type an intake code: Sampai reads the student's APSpace timetable and tutorial group. |
| **What to bring** | Umbrella, water, sun protection or a mask, from rain forecasts, MET Malaysia storm warnings, heat, UV and haze, weighted by minutes outdoors. |
| **Incident reports** | A third-person report for the lecturer: findings with their sources (Sampai riders, Rapid KL bus GPS, MET Malaysia, Open-Meteo), the student's journey and lateness, and a QR code to the public incident record. Works without an alert too. |
| **Dashboard** | `/admin`: disruptions by line, hour and weather, worst stretches, operator notes. |
| **Simulator** | `/sim`: spawn riders, stall a train, trigger rain, heat or haze. Everything simulated is labelled SIMULATED. |

## Architecture

```
phone (web app, PWA)                      Google Cloud / Firebase
 ├─ pings while on board ──► api (Cloud Run) ──► Pub/Sub ──► worker (Cloud Run)
 │                            │                                ├─ sliding-window stall detection
 │                            │                                ├─ Rapid KL bus GTFS-R polling
 │                            │                                ├─ MET Malaysia + Open-Meteo polling
 │                            │                                ├─ Gemini: alert text and best option
 │                            │                                └─ FCM push, BigQuery log
 │                            ├─ route options, geocoding, APSpace proxy
 │                            └─ incident reports (Gemini + PDF)
 └─ live state ◄──────────── Firestore (incidents, alerts, conditions, users)
```

| Folder | What's in it |
|---|---|
| `web/` | React + Vite + Tailwind. Landing, onboarding, home, ride, profile, report, simulator, dashboard. |
| `api/` | Express on Cloud Run. Pings in, routes, geocoding, reports, simulator endpoints. |
| `worker/` | Pub/Sub push handler on Cloud Run. Detection, bus and weather polling, notifications. |
| `shared/` | Types, rail network, time helpers, server clients (Firebase, Gemini, OSRM, APSpace). |
| `data/` | `build-segments.ts` turns Prasarana GTFS into rail segments and bus lines (`data/out/`). `local_rules.json` holds local fixes maps get wrong. |
| `scripts/` | Emulator launcher, smoke test, stall test. |
| `infra/` | `setup.sh` (one-time Google Cloud setup) and `deploy.sh` (Cloud Run deploy). |

## Run it locally

Needs Node 20+ and Java (for the Firebase emulators).

```bash
npm install
```

```bash
npm run data
```

```bash
npm run dev
```

That starts the Firestore and Auth emulators, the worker (port 8081), the api (port 8080) and the web app (port 5173). Open http://localhost:5173.

With no Firebase settings, everything runs against the local emulators (project `demo-sampai`). For Gemini, put an AI Studio key in `api/.env` and `worker/.env` (`GEMINI_API_KEY`). Without it, alerts and reports fall back to templates.

Copy each `.env.example` to `.env` (or `.env.production` for the web build) and fill in what you need. Never commit `.env` files.

## Deploy

**Web app: Cloudflare.** `wrangler.jsonc` at the repo root builds the web workspace and serves `web/dist`, with deep links (`/app`, `/report`, `/incident/:id`) falling back to `index.html`. In the Cloudflare dashboard, set these build variables:

- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_VAPID_KEY`
- `VITE_API_URL`: the deployed api's URL

**api and worker: Render (free).** `render.yaml` defines both services; step-by-step in [docs/render-handoff.md](docs/render-handoff.md). Firebase stays on the free Spark plan.

**Alternative: Cloud Run** (needs the Firebase project on the Blaze plan). Each has a `Dockerfile`. Set `GCP_PROJECT`, `REGION`, `GEMINI_API_KEY`, `PUBLIC_WEB_URL` (the web app's URL) and, for the api, `WORKER_URL`.

## Data sources

- APU APSpace: timetables by intake and group, APU shuttle schedule
- Prasarana GTFS static and Rapid KL bus GTFS Realtime, via data.gov.my (CC BY 4.0)
- MET Malaysia weather warnings, via data.gov.my
- Open-Meteo: forecast, apparent temperature, UV, air quality
- OpenStreetMap: street routing (OSRM) and geocoding (Photon, Nominatim)

## Privacy

Sign-in is anonymous: no student ID or email. Location is shared only while a trip is on, and stops at the destination station or after 90 minutes. Raw locations aren't stored. "Recently used" profile values stay in the browser.

## Status

Prototype. Simulated riders and incidents are always labelled SIMULATED; timetables, shuttle times, bus GPS and weather are live.
