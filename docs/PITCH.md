# Sampai: pitch deck brief

Everything the deck team needs in one place: the story, the numbers, what to show, what to say, what judges will ask, and what's honest to claim. Built for the APU Cloud Innovation Hackathon 2026 (deadline 13 Nov 2026, 12:00 MYT).

- **Live app:** https://sampai.williamjonathan.workers.dev
- **Simulator (demo controls):** https://sampai.williamjonathan.workers.dev/sim
- **Dashboard:** https://sampai.williamjonathan.workers.dev/admin
- **Brand kit (colours, logos, taglines):** https://sampai.williamjonathan.workers.dev/brand and `BRAND.md`
- **Logo files for slides:** `web/public/brand/` (`sampai-logo.svg` for light slides, `sampai-logo-ink.svg` for dark)
- **Code:** https://github.com/williamjonathanliem/sampai

---

## 1. The one-liner

> **Your train stopped. You'll still get to class.**
> Sampai turns APU students' phones into a live sensor for the LRT. It spots a stalled train, buzzes you with the fastest way to campus, and writes an incident report for your lecturer if you're late anyway.

Core tagline: **Get to class, or get proof why you didn't.**
Name: *Sampai* is Malay for "arrived".

---

## 2. The problem (slide 2)

**Malaysia publishes live GPS for every Rapid KL bus. Not for a single train.**

So nobody knows a train has stalled until the people stuck on it do. Students find out on the platform, with no plan B and nothing to show their lecturer.

It happened all year (real headlines, use as evidence on the slide):

| Source | Date | Headline |
|---|---|---|
| Malay Mail | Feb 2026 | Kelana Jaya LRT suffers serial breakdowns |
| FMT | Mar 2026 | LRT, monorail and MRT all disrupted on one day |
| SoyaCincau | Sep 2026 | Signalling disruption between USJ 21 and Taipan |
| The Star | Sep 2026 | Flash floods hit parts of the Klang Valley |

Links are on the landing page ("The gap" section).

**Who feels it:** APU students commuting on the Sri Petaling line to Bukit Jalil, then the APU shuttle or a 45-minute walk. One stalled train = late for class, marked absent, no proof.

**Three pains, one app:**
1. **"I didn't know."** No live signal for trains.
2. **"I didn't know what else to do."** Google Maps doesn't know your class time, the APU shuttle schedule, or that the train you're on just stopped.
3. **"My lecturer didn't believe me."** No official record of short disruptions.

---

## 3. The solution (slide 3)

| Pain | What Sampai does |
|---|---|
| No live train signal | **Riders are the sensor.** Phones on board share speed and motion. Several riders stopped between the same two stations = an incident. |
| No plan B | **A plan timed to your class.** Other lines, the APU shuttle (real APSpace schedule), Rapid KL buses, walking or a taxi, each with "arrive 08:52, on time" or "late". Sampai picks one and says why. |
| No proof | **A verifiable incident report.** Third person, every finding cites its source (Sampai riders, Rapid KL bus GPS, MET Malaysia), the student's journey and lateness, and a QR code the lecturer scans to check it. |

---

## 4. How it works (slide 4, architecture)

**Sense → Detect → Alert and prove.**

1. **Sense.** A rider taps "I'm on the train" (or opts in once to start automatically on their commute). Their phone sends GPS and motion every few seconds, only for that trip, anonymously.
2. **Detect.** Pings go through a message queue to a worker that keeps a sliding window per stretch of track. Riders stopped together on the same stretch = incident, with a confidence level. A rider can also tap "Train's not moving" to confirm faster.
3. **Alert and prove.** Every student whose route uses that stretch and has a class soon gets a push with reroute options. Gemini writes the alert and picks the best option. Every incident is logged for the dashboard and the incident report.

**Designed for Google Cloud:**

| Piece | Google Cloud / Firebase |
|---|---|
| Phone pings, bus and weather feeds | Pub/Sub topics |
| api + worker | Cloud Run (2 Node services) |
| Live state (incidents, alerts, users) | Firestore |
| Push notifications | Firebase Cloud Messaging |
| Anonymous sign-in | Firebase Auth |
| Alert text, best option, report prose | Gemini (AI Studio / Vertex AI) |
| Disruption history | BigQuery + Looker Studio |
| Polling feeds | Cloud Scheduler |

**What the live demo actually runs on (be honest if asked):** Firebase (Firestore, Auth, FCM) on the free Spark plan; the web app on Cloudflare; the api and worker on Render's free plan with Pub/Sub swapped for a direct call (a config switch, same code). The Google Cloud deployment scripts are in `infra/`. Reason: Cloud Run needs a billing account, and we kept the demo at RM 0.

---

## 5. Features to show (slides 5 to 8)

### Home screen ("what do I do right now")
- **Next class from APSpace** (real timetable by intake code + tutorial group), "Leave by 07:49", "Class starts 08:30".
- **APU shuttle timing** from the real APSpace shuttle schedule, ride time adjusted for traffic at that hour.
- **Before you leave · bring:** umbrella (rain or MET storm warning), water (heat, heatwave at 40°C+), cap or sunscreen (UV 8+), face mask or N95 (haze, from live air quality).
- **Change route** in place, see it on the map, save.
- **Make report** any time, even without an alert.

### Route options (like Google Maps, but it knows your class)
- Every option: leave → arrive, "on time · 6 min spare" or "13 min late", fare (or Free), minutes outdoors.
- Modes: LRT/MRT lines (incl. transfers to the Sri Petaling line), APU shuttle from LRT Bukit Jalil and hostels, **every Rapid KL bus within 7 km of APU** (straight to APU, bus + shuttle, or feeder bus + train), walking, taxi.
- Real street paths (OpenStreetMap routing), no "flying through buildings".
- **What only Sampai knows** on each option: "This line stalled 3 times in the last 30 days", "If this line stalls, Sampai buzzes you", "Runs every 50 min. Miss the 08:14 and the next is 50 min later", "Bring umbrella: 63% chance of rain (11 min outdoors)".
- **Local knowledge maps get wrong:** e.g. a fence blocks Parkhill Residence from Jalan Teknologi on foot, so Sampai routes walkers via LRT Bukit Jalil.
- **Sampai pick** with a one-line reason.

### On the train
- One screen: speed, GPS accuracy, pings sent. "Train's not moving" button. Stops by itself at your station or after 90 minutes.

### The alert
- Push + vibration. "Sri Petaling line stalled before Bukit Jalil." Options sheet with arrival times against your class. "Open Grab" shortcut for the taxi option. "You'll be about 12 min late → Incident report".

### Incident report (the "proof" slide)
- PDF, English or Bahasa Melayu.
- **1. Summary** (third person), **2. Findings** each with a source line, **3. The student's journey** (boarded, alerted, alternative, arrival, class start, lateness), **4. Conclusion**, verification panel with QR code to the public incident page.
- Only claims what the records show. With no disruption on record, it writes a "Journey Report" that says so honestly.

### Dashboard (`/admin`) for student services
- Disruptions by line, by hour, in rain vs dry, worst stretches; add an official operator note that then appears on reports.

---

## 6. Why not just Google Maps? (slide 9, differentiation)

| | Google Maps | Sampai |
|---|---|---|
| Knows a train stalled right now | No (no live train feed in Malaysia) | Yes, from riders on board |
| Knows your class time | No | Yes, from APSpace |
| APU shuttle schedule | No | Yes, from APSpace |
| Tells you before you're stuck | No | Push alert with a plan |
| Proof for your lecturer | No | Incident report with sources + QR |
| Weather "what to bring" per route | No | Yes |
| Local fixes (fences, gates) | Sometimes | Yes, a rules file students can extend |

---

## 7. Numbers you can put on slides

| Number | What |
|---|---|
| 8 | Rail lines covered (Prasarana network data) |
| 179 | Station-to-station stretches monitored |
| 31 | Rapid KL bus route patterns within 7 km of APU used for routing |
| 11 | APU shuttle pick-up points (APSpace) |
| ~10 s | Time to confirm a stall when 2 riders tap "Train's not moving" (tested) |
| 30 s | Detection window in demo mode (2 riders stopped together) |
| 3 riders / 2 min | Threshold in normal use (one phone can never trigger an alert) |
| 6 | Live data sources (below) |
| RM 0 | Running cost of the demo |
| 2 | Languages (English, Bahasa Melayu) |

**Data sources (all live except riders in the simulator):** APU APSpace (timetable + shuttle), Prasarana GTFS rail network, Rapid KL bus GTFS Realtime (data.gov.my), MET Malaysia warnings (data.gov.my), Open-Meteo (rain, heat, UV, air quality), OpenStreetMap (street routing, addresses).

---

## 8. Live demo script (about 2 minutes)

**Before going on stage (5 min early):**
1. Open https://sampai-api.onrender.com/apu/status and wait until `"rows"` is above 0 (wakes the free server, loads APSpace).
2. Laptop: `/sim` and `/admin` in two tabs. Phone: the app, signed in as demo student **Wei Jie** (the "running late" profile) or your own profile.
3. Allow notifications on the phone.

| Time | Say | Do |
|---|---|---|
| 0:00 | "Every APU student has been stuck on a stalled LRT with no idea what to do." | Phone home screen: next class from APSpace, leave-by time, what to bring. |
| 0:15 | "Malaysia shares live GPS for every bus. Not one train. So riders' phones are the sensors." | `/sim`: **Spawn riders**. Dots move along the Sri Petaling line. |
| 0:30 | "Two riders stop between the same stations…" | `/sim`: **Stall train**. |
| 0:45 | | Phone buzzes. Alert: options with arrival times against the class. |
| 1:00 | "Sampai knows your class, the APU shuttle and every bus. It picks the option that still makes class." | Open the alert sheet, point at "Sampai pick". |
| 1:15 | "Late anyway? One tap." | **Incident report** → Generate → show findings with sources → Download PDF → QR. |
| 1:35 | "Weather breaks routes too." | `/sim`: **Heavy rain** or **Haze**. Home: "Bring umbrella" / "N95 mask" appears. |
| 1:50 | "Every disruption is logged for APU." | `/admin`: by line, hour, weather. |

**If something fails:** the alert still appears on the home screen without push; reports fall back to a template without Gemini; play the backup video.

---

## 9. Judge Q&A (prepare these)

**"Can one person fake a breakdown?"**
No. An incident needs several riders stopped on the same stretch at the same time (3 in normal use). One phone alone never triggers an alert, and rider count + confidence are shown everywhere.

**"What if I'm the only Sampai rider on my train?"**
You still get alerts from other riders, Rapid KL live bus GPS and MET Malaysia warnings. More riders = faster, more confident detection. That's the network effect: APU alone has thousands of LRT commuters.

**"Privacy?"**
Anonymous sign-in, no student ID or email. Location is shared only during a trip, stops at your station or after 90 minutes. Raw locations aren't stored.

**"Will lecturers accept the report?"**
Their call. The report only states facts with sources and a QR code to a public incident record, in the third person. It never claims a cause the records don't show.

**"Does it run in the background?"**
On the web, sharing runs while the app is open (opt in once and it starts by itself at commute time near your line). A native wrapper with background location is the next step.

**"Why Gemini?"**
Writes alerts in plain English or Malay, picks the best option for your class, rain and heat, and writes the report prose using only facts from the records. Without Gemini, templates take over. Nothing breaks.

**"How does it scale / why cloud?"**
Pub/Sub absorbs bursts of pings at rush hour, Cloud Run scales the worker per stretch, Firestore pushes live state to every phone, BigQuery keeps history for APU and Prasarana.

**"Is the demo fake?"**
Riders and stalls started from the simulator are labelled SIMULATED on screen and in the data. Timetables, shuttle times, bus GPS, weather and air quality are live. Real phone stall detection was tested with phones.

---

## 10. Honest limits (don't overclaim)

- Rider-based detection needs riders. Day one, coverage depends on adoption (that's why bus GPS and MET warnings are also inputs).
- Web app: background tracking only while the app is open.
- Train ride times between stations are estimates (about 2 min per station); bus times come from Rapid KL's published frequencies, not live arrival predictions.
- Fares are estimates (rail distance fare, taxi formula).
- The live demo runs on free tiers (Render sleeps after 15 min idle; wake it before presenting).
- "Getting home" (APU → home after the last class) is designed but not built.

---

## 11. Roadmap (closing slide)

1. **Getting home:** after your last class, the same plan in reverse (the APU shuttle runs both ways).
2. **Native app** (Capacitor) for background location and station geofences: fully hands-free.
3. **Live train ETAs** from rider speeds, shared back to every rider on the line.
4. **Operator view** for Prasarana / Rapid KL: rider-sourced stall alerts before the control room hears about them.
5. **Other campuses** along the LRT and MRT lines (Taylor's, Sunway, UM): same engine, their timetable feed.

---

## 12. Suggested deck outline (10 slides)

1. **Title:** logo, "Your train stopped. You'll still get to class.", team names.
2. **Problem:** "Live GPS for every bus. Not a single train." + 4 headlines.
3. **The moment:** a student stuck between Sri Petaling and Bukit Jalil at 08:15, class at 08:30. No signal, no plan, no proof.
4. **Solution:** three columns: Sense · Plan · Prove.
5. **How it works:** Sense → Detect → Alert diagram + Google Cloud stack.
6. **Live demo** (or screenshots: home, route options, alert, report).
7. **The report:** PDF screenshot, highlight "Source:" lines and the QR code.
8. **Why not Google Maps:** comparison table (section 6).
9. **Numbers + data sources** (section 7).
10. **Roadmap + ask:** what we'd build next, and what APU could do with the dashboard.

**Visual style:** light chalk background `#F5F5F9`, ink text `#1C1B28`, violet `#5E3EB6` for emphasis, green `#0B7643` = on time, red `#C2272D` = stalled/late, yellow `#FACA4B` only as a dot/accent fill. Font: Manrope. No dark neon "transit app" look, no gradients, no emoji. Calm, plain, decisive copy.

**Screenshots worth taking** (desktop, 1440 px wide):
- Landing hero (`/`)
- Home with "Before you leave · bring" visible (`/app`, after triggering Heavy rain or Haze in `/sim`)
- Route options in the profile (`/profile`) with "Sampai pick" and bus options
- Alert sheet after stalling a train
- Incident report page + PDF (`/letter/...` or `/report`)
- Dashboard (`/admin`)
