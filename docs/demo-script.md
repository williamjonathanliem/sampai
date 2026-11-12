# Demo script (~90 s)

**Setup before going on stage**
1. Laptop: `npm run dev` (or the deployed URLs). Open `/sim` and `/admin` in two tabs.
2. Phone (Android Chrome for vibration): open the app, pick **Aina**, tap **Turn on alerts**.
3. In `/sim`: press **↺ Reset demo**, then **📊 Seed history** once (for the dashboard).
4. Optional: a teammate opens the app on their phone and taps **I'm on the train** (real pings).

**On stage**

| Time | Say | Do |
|---|---|---|
| 0:00 | "Trains broke down all year. Students find out too late, and have no proof." | Show the phone: Aina, next class from APSpace, leave-by time, real shuttle times. |
| 0:15 | "Malaysia publishes live bus GPS, but not train positions. So riders' phones are the sensors." | `/sim`: **▶ Spawn riders**. Green dots move along the Sri Petaling line. |
| 0:25 | "A train stops between Sri Petaling and Bukit Jalil." | **⛔ Stall train**. Dots turn red. |
| 0:55 | "Several phones stopped between stations: that's a stall." | Incident appears: red segment on the map, event log line. |
| 1:00 | | Phone vibrates; banner + options sheet: T580 bus, Grab with fare estimate, covered walk, all with arrival times. |
| 1:10 | "Gemini picks the best option and writes the delay letter." | Tap **Get delay letter** → **Write my letter** → **Download PDF**. Show the QR code / incident page. |
| 1:20 | "Weather breaks routes too." | **🌧 Heavy rain warning**: walking advice switches to the covered path. |
| 1:30 | "Every disruption is logged for APU and Prasarana." | `/admin`: by line, hour, weather, worst stretches. |

**If something fails**: the Firestore listener still shows the banner without push; the letter falls back to a template without Gemini; a backup video is in the deck.
