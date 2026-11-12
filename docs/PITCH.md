# Sampai: pitch deck brief

Everything the deck team needs: the story, the numbers, what to show, what to say, what judges will ask, and what's honest to claim. APU Cloud Innovation Hackathon 2026, challenge *Smart Campus & Student Experience*.

- **Live app:** https://sampai-apu.web.app
- **Simulator (demo controls):** https://sampai-apu.web.app/sim
- **Dashboard:** https://sampai-apu.web.app/admin
- **Brand kit:** https://sampai-apu.web.app/brand and `BRAND.md`. Logos in `web/public/brand/`. Share image: `web/public/og-image.png`.
- **Code:** https://github.com/williamjonathanliem/sampai (judges will read the README first)
- **Submission summary:** `docs/submission.md`

> **Framing rule:** Sampai is a **transport app for getting to class**, across every mode: LRT, Rapid KL bus, APU shuttle, walking, taxi. Rider-based train stall detection is **one** of the live inputs (trains have no public feed), not the headline. Don't oversell it.

---

## 1. The one-liner

> **Get to class, or get proof why you didn't.**
> Sampai plans every trip to APU around your real class, across trains, buses, the APU shuttle, walking and taxi, warns you when something on the way breaks, and writes a sourced report for your lecturer if you're late anyway.

*Sampai* is Malay for "arrived".

---

## 2. The problem (slide 2)

**Getting to APU on public transport is a daily gamble.**

- Students juggle the LRT, Rapid KL buses, the APU shuttle and long walks.
- No app knows all three things that matter: **your class time**, **the APU shuttle schedule**, and **what's going wrong on the way right now**.
- Google Maps doesn't know your class, the shuttle, or that the train you're on just stopped (Malaysia has live GPS for buses, but none for trains).
- When it goes wrong (a stalled train, a bus stuck in traffic, a flash storm), students find out too late, with no plan B and nothing to show their lecturer.

Evidence it happens (real headlines, on the landing page):

| Source | Date | Headline |
|---|---|---|
| Malay Mail | Feb 2026 | Kelana Jaya LRT suffers serial breakdowns |
| FMT | Mar 2026 | LRT, monorail and MRT all disrupted on one day |
| SoyaCincau | Sep 2026 | Signalling disruption between USJ 21 and Taipan |
| The Star | Sep 2026 | Flash floods hit parts of the Klang Valley |

**Three pains, one app:**
1. **"What's my best way in today?"** Too many modes, none planned around class.
2. **"Something broke on the way."** Trains, buses and weather, with no warning and no plan B.
3. **"My lecturer didn't believe me."** No record of why you were late.

---

## 3. The solution (slide 3): Plan · Watch · Prove

| | What Sampai does |
|---|---|
| **Plan** | From your intake code, Sampai reads your APSpace timetable. It compares every way to campus (train, APU shuttle, Rapid KL bus, walking, taxi) with real street paths, the real shuttle schedule and bus timetables, and says when to leave and whether each option makes class. It recommends one and says why. |
| **Watch** | It watches your trip with live sources: Rapid KL bus GPS, MET Malaysia warnings, weather and air quality, and riders on board for trains. If something breaks, you get a push with options that still make class, plus what to bring (umbrella, water, mask). |
| **Prove** | Late anyway? One tap makes a third-person incident report for your lecturer: what happened, according to which source, your journey and lateness, and a QR code to the public record. It never claims a cause the records don't show. |

---

## 4. How it works (slide 4)

```
phone app ──► api ──► route options (APSpace + shuttle + buses + trains + streets)
     ▲          └───► incident reports (records → Gemini → PDF)
     │
Firestore ◄── worker ◄── live sources: Rapid KL bus GPS · MET Malaysia · weather · air quality · riders on board
     │            └──► who's affected → Gemini writes the alert → push (FCM)
```

**Google stack:** Firebase Hosting, Firestore, Firebase Auth (anonymous), Firebase Cloud Messaging, Gemini; designed for Cloud Run, Pub/Sub, BigQuery and Cloud Scheduler (scripts in `infra/`).

**Be honest if asked:** the demo's two Node services run on a free host (Render) instead of Cloud Run, because Cloud Run needs a billing account. Same code; Pub/Sub is a config switch. Everything else is Google/Firebase.

---

## 5. Features to show (slides 5 to 8)

**Home ("what do I do right now")**
- Next class from APSpace, "Leave by", class start, trip minutes.
- APU shuttle: which departure to catch, ride time adjusted for traffic.
- Before you leave, bring: umbrella / water / cap / mask, from live weather, MET warnings and air quality.
- Change route in place; Make report any time.

**Route options (like a maps app, but it knows your class)**
- Each option: leave → arrive, "on time · 6 min spare" or "13 min late", fare or Free, minutes outdoors.
- Modes: LRT/MRT (with transfers), APU shuttle from LRT Bukit Jalil and hostels, Rapid KL buses (straight to APU, bus + shuttle, feeder bus + train), walking, taxi.
- Real street paths (no "flying through buildings").
- What only Sampai knows: "Runs every 50 min. Miss the 08:14 and the next is 50 min later", "Bring umbrella: 63% chance of rain, 11 min outdoors", "This line stalled 3 times in 30 days".
- Local knowledge: a fence blocks Parkhill Residence from Jalan Teknologi on foot, so walks go via LRT Bukit Jalil.
- **Sampai pick** with a one-line reason.

**Alerts**
- Push when your route is affected: stuck buses (Rapid KL GPS), a storm warning (MET), or a stalled train (riders). Options against your class, "Open Grab" shortcut for taxis, "You'll be about 12 min late → Incident report".

**Incident report (the "proof" slide)**
- PDF in English or Bahasa Melayu: Summary, Findings (each with a Source line), the student's journey, Conclusion, QR verification.
- Also without an alert ("Make report"): it checks the last 3 hours on your route and says honestly if nothing was recorded.

**Dashboard (`/admin`)** for student services: disruptions by line, hour, rain vs dry, worst stretches, official notes.

---

## 6. Why not just Google Maps? (slide 9)

| | Google Maps | Sampai |
|---|---|---|
| Knows your class time | No | Yes, from APSpace |
| APU shuttle schedule | No | Yes, from APSpace |
| Says if each option makes class | No | Yes |
| Live train problems in Malaysia | No public feed | From riders on board |
| Stuck buses, storm warnings on your route | Partly | Yes, with a new plan |
| What to bring for the weather on your route | No | Yes |
| Proof for your lecturer | No | Sourced report + QR |
| Local fixes (fences, gates) | Sometimes | Yes, a rules file |

---

## 7. Numbers you can put on slides

| Number | What |
|---|---|
| 5 | Ways to campus compared: train, APU shuttle, bus, walk, taxi |
| 31 | Rapid KL bus route patterns within 7 km of APU used for planning |
| 11 | APU shuttle pick-up points (APSpace) |
| 8 / 179 | Rail lines / station-to-station stretches covered |
| 7 | Live data sources (APSpace, Prasarana GTFS, Rapid KL GTFS-R, MET Malaysia, Open-Meteo, OpenStreetMap, riders) |
| 2 | Languages: English, Bahasa Melayu |
| RM 0 | Running cost of the demo |

---

## 8. Live demo script (about 2 minutes)

**5 min before:** open https://sampai-api.onrender.com/apu/status until `"rows"` is above 0 (wakes the free server). Laptop: `/sim` and `/admin`. Phone: the app as demo student **Wei Jie** (running late) or your own profile. Allow notifications.

| Time | Say | Do |
|---|---|---|
| 0:00 | "Every APU student juggles trains, buses and the shuttle, and none of their apps know when class starts." | Phone home: next class from APSpace, leave-by time, what to bring. |
| 0:15 | "Sampai compares every way in and tells you which still makes class." | Change route: options with on time / late, fares, Sampai pick. |
| 0:35 | "Then it watches the trip. Buses have live GPS, weather has MET warnings, and for trains, riders' phones fill the gap." | `/sim`: **T580 stuck** or **Stall train**. |
| 0:50 | | Phone buzzes: new options against the class. |
| 1:05 | "Weather breaks trips too." | `/sim`: **Heavy rain** or **Haze**; home shows "Bring umbrella" / "N95 mask". |
| 1:20 | "Late anyway? One tap." | **Incident report** → Generate → findings with sources → PDF → QR. |
| 1:45 | "And APU sees every disruption." | `/admin`. |

**If something fails:** the alert still shows on the home screen without push; reports fall back to a template without Gemini; play the backup video.

---

## 9. Judge Q&A

**"How is this different from Google Maps?"** It plans around your class and the APU shuttle, says whether each option makes it, watches the trip for problems Maps doesn't see, and gives you proof. See section 6.

**"Where does the live data come from?"** Rapid KL bus GPS and MET Malaysia via data.gov.my, Open-Meteo for weather and air quality, APSpace for classes and shuttles. For trains there's no public feed, so riders who opt in share speed and motion during the trip.

**"Can one person fake a train stall?"** No. It needs several riders stopped on the same stretch at once, and rider count and confidence are shown everywhere.

**"Privacy?"** Anonymous sign-in, no student ID or email. Trip sharing is opt-in, only during the trip, and stops at the destination or after 90 minutes. Raw locations aren't stored.

**"Will lecturers accept the report?"** Their call. It states facts with sources and a QR code to a public record, in the third person, and never claims a cause the records don't show.

**"Why Gemini?"** Writes alerts in English or Malay, picks the best option for your class, rain and heat, and writes report prose from the records only. Templates take over without it.

**"Does it run in the background?"** On the web, while the app is open (opt in once and it starts by itself at commute time). A native app with background location is next.

**"Is the demo fake?"** Simulated riders and incidents are labelled SIMULATED. Timetables, shuttle times, bus GPS, weather and air quality are live.

---

## 10. Honest limits (don't overclaim)

- Train stall detection depends on riders using the app; coverage grows with adoption. Buses and weather don't need riders.
- On the web, trip sharing runs while the app is open.
- Train ride times between stations and fares are estimates; bus times come from published frequencies, not live arrival predictions.
- The demo's servers are on a free host and sleep after 15 min idle; wake them before presenting.
- "Getting home" after the last class is designed but not built.

---

## 11. Roadmap (closing slide)

1. **Getting home:** the same plan in reverse after your last class (the shuttle runs both ways).
2. **Native app** for background trip sharing and station geofences.
3. **Live arrival times** for buses and trains, shared back to riders.
4. **For APU:** shuttle planning from real demand and disruption data.
5. **Other campuses** along the LRT and MRT lines: same engine, their timetable feed.

---

## 12. Suggested deck outline (10 slides)

1. **Title:** logo, "Get to class, or get proof why you didn't.", team names.
2. **Problem:** trains, buses, shuttle, walks, and no app knows your class. Headlines.
3. **The morning:** 08:05, class at 08:30. Which way in? Then the bus is stuck. Then it rains.
4. **Solution:** Plan · Watch · Prove.
5. **How it works:** data sources → Sampai → phone, on Google Cloud + Gemini.
6. **Live demo** (or screenshots: home, route options, alert, report).
7. **The report:** PDF screenshot, highlight the Source lines and QR code.
8. **Why not Google Maps:** section 6 table.
9. **Numbers + data sources:** section 7.
10. **Roadmap + ask.**

**Visual style:** chalk background `#F5F5F9`, ink `#1C1B28`, violet `#5E3EB6` for emphasis, green `#0B7643` on time, red `#C2272D` late or stalled, yellow `#FACA4B` only as a dot accent. Manrope. No dark neon, no gradients, no emoji.

**Screenshots worth taking** (desktop 1440 px): landing; home with "Before you leave · bring" (after Heavy rain or Haze in `/sim`); route options with Sampai pick and bus options; alert sheet; report page + PDF; dashboard.
