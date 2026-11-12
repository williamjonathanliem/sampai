PROBLEM
Rapid KL publishes live GPS for every bus, but not for a single train. When an LRT train stalls between stations, nobody knows until the people on board do. APU students on the Sri Petaling line find out stuck in the carriage or on the platform, with no plan B and nothing to show their lecturer.

APPROACH
Riders' phones become the missing sensor. A student taps "I'm on the train" (or opts in once to share automatically at commute time), and the phone sends speed and motion, anonymously and only for that trip. When several riders stop on the same stretch at the same time, Sampai raises an incident with a confidence level; one phone alone can never trigger an alert. Rapid KL live bus GPS and MET Malaysia warnings feed in alongside.

WHAT WE BUILT
- Stall detection: a worker keeps a sliding window per stretch of track; riders can confirm with "Train's not moving".
- Alerts with a plan: students whose route and next APSpace class are affected get a push with options timed against that class: other lines, the APU shuttle (real APSpace schedule), Rapid KL buses, walking or a taxi. Gemini picks the best option and writes the alert.
- Trip planning: real street routes, local fixes maps get wrong, and what to bring for rain, heat, UV and haze.
- Incident report: a third-person PDF for the lecturer. Every finding cites its source (riders, bus GPS, MET Malaysia), plus the student's journey and a QR code to the public record.
- Dashboard for APU by line, hour and weather, and a simulator that labels everything SIMULATED.

STACK
React PWA on Firebase Hosting; Firestore, anonymous Firebase Auth and FCM; Node api and worker (built for Cloud Run and Pub/Sub, running on a free host for the demo); Gemini. Data: APSpace, Prasarana GTFS, Rapid KL GTFS-R and MET Malaysia via data.gov.my, Open-Meteo.
