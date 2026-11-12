PROBLEM
Getting to APU on public transport is a daily gamble. Students juggle the LRT, Rapid KL buses, the APU shuttle and long walks, and no single app knows their class time, the shuttle schedule, or what's going wrong on the way right now. When a train stalls, a bus gets stuck in traffic or a storm hits, students find out too late, with no plan B and nothing to show their lecturer.

APPROACH
Sampai plans every trip around the student's real class. From an intake code it reads the APSpace timetable, then compares every way to campus (train, APU shuttle, Rapid KL bus, walking or taxi) and says when to leave and whether each option makes class. It watches the trip with live sources: Rapid KL bus GPS, MET Malaysia warnings, weather and air quality, and riders' phones on board, since trains have no public live feed.

WHAT WE BUILT
- Route options like a maps app, but timed to your class: real street paths, the real APU shuttle schedule, bus timetables, fares and minutes outdoors, with a recommended pick and the reason.
- Live disruption alerts: when something on your route breaks (a stuck bus, a stalled train, a storm warning), a push with new options that still make class.
- What to bring: umbrella, water, sun protection or a mask, from rain, heat, UV and haze on your route.
- Local knowledge maps get wrong, such as fences that block a walking path.
- Incident report: a third-person PDF for the lecturer where every finding cites its source, plus the student's journey and a QR code to the public record. Works with or without an alert.
- A dashboard for APU on disruptions by line, hour and weather.

STACK
React PWA on Firebase Hosting; Firestore, anonymous Firebase Auth and FCM; Node api and worker (built for Cloud Run and Pub/Sub, on a free host for the demo); Gemini for alerts, picks and reports. Data: APSpace, Prasarana GTFS, Rapid KL GTFS-R and MET Malaysia via data.gov.my, Open-Meteo, OpenStreetMap.
