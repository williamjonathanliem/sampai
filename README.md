# Sampai

> *Sampai* (Malay: "arrived"). Get to class, or get proof why you didn't.

Rapid KL publishes live GPS for buses but **not for trains**. Sampai turns students' phones into a sensor network: when several riders stop moving between two stations, the train has stalled. Sampai detects it, alerts the students whose route and class are affected, reroutes them (bus, Grab, covered walk, APU shuttle), and writes a delay letter for their lecturer from the incident log.

Built for the APU Cloud Innovation Hackathon 2026 (Cloud + IoT + Network, Google Cloud + Gemini).

## What works

| | |
|---|---|
| Train stall detection | Phone pings → Pub/Sub → worker sliding window → incident (≥2 riders still for 30 s in demo mode; 3 riders / 120 s normally) |
| Live data | Prasarana GTFS (8 rail lines, 179 segments), Rapid KL GTFS-Realtime bus GPS, MET Malaysia warnings, Open-Meteo heat + rain |
| APSpace | Real APU timetable by intake code (next class, room, lecturer) and the real APU shuttle schedule |
| Alerts | Firestore live banner + vibration + FCM web push; options with arrival time and "on time / late" |
| Gemini | Alert text + best option, delay letter, MET warning summary, official-note summary (template fallback without a key) |
| Delay letter | PDF with facts table + QR code to a public incident page lecturers can check |
| Dashboard | `/admin`: by line, hour, weather, worst stretches; BigQuery tables for Looker Studio |
| Simulator | `/sim`: spawn riders, stall any segment, heavy rain, heatwave, stuck buses, seed 30 days of history |

## Run it locally (no GCP needed)

Needs Node 20+, Java 11+ (for the Firestore emulator) and the Firebase CLI (`npm i -g firebase-tools`).

```bash
npm install
npm run dev
```

That starts the Firestore + Auth emulators, the worker (`:8081`), the api (`:8080`) and the web app (`:5173`).

- Student app: http://localhost:5173 (pick **Aina**)
- Simulator: http://localhost:5173/sim
- Admin: http://localhost:5173/admin
- Emulator UI: http://localhost:4000

End-to-end check without a browser: `npx tsx scripts/smoke.ts`

### Turn on Gemini locally

Put an AI Studio key in `api/.env` and `worker/.env` (copy the `.env.example` files), then restart:

```
GEMINI_API_KEY=...
```

## Deploy to Google Cloud

```bash
PROJECT=<project-id> bash infra/setup.sh     # APIs, Firestore, service account, topics, BigQuery
# fill web/.env with the Firebase web config + VAPID key (Firebase console > Project settings)
PROJECT=<project-id> bash infra/deploy.sh    # Cloud Run worker + api, push subscriptions, Scheduler, Hosting
```

## Layout

```
api/      Cloud Run "api": /ping, /letter, /incident/:id, /apu/*, /sim/*, /admin/*
worker/   Cloud Run "worker": Pub/Sub push endpoints, train + bus detection, weather, notify
shared/   types, network data helpers, Gemini / Pub/Sub / Firestore / BigQuery / APSpace clients
web/      React + Vite PWA (student, onboarding, simulator, admin, letter, incident pages)
data/     GTFS → lines/segments builder, fallback reroutes, demo profiles, walking paths
infra/    gcloud setup + deploy scripts
```

## Data credits

Prasarana GTFS and GTFS-Realtime, MET Malaysia warnings via [data.gov.my](https://data.gov.my) (CC BY 4.0) · Open-Meteo · APU APSpace public timetable and shuttle feeds · Map tiles © Esri.

Everything simulated is labelled **SIMULATED** on screen and stored with `simulated: true`.
