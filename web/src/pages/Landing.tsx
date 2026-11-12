import { Link } from "react-router-dom";
import { ArrowRight, BellRing, FileCheck2, Radar, ShieldCheck, ExternalLink } from "lucide-react";
import { Wordmark, btn } from "../components/ui";
import { useUid, useUserDoc } from "../lib/hooks";

/** Animated route diagram: riders move along the Sri Petaling line, one stretch stalls, the phone alert lands. */
function StallScene() {
  return (
    <div className="relative mx-auto w-full max-w-[600px] pb-28 sm:pb-24" aria-hidden>
      <div className="rounded-[28px] bg-surface/10 p-5 ring-1 ring-surface/20 sm:p-7">
        <div className="flex items-center justify-between text-[13px] font-semibold">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-warn-fill/70" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-warn-fill" />
            </span>
            Sri Petaling Line · live
          </span>
          <span className="text-surface/70">3 riders on board</span>
        </div>
        <svg viewBox="0 0 560 190" className="mt-4 w-full overflow-visible">
          <path d="M470 70 C 505 70, 512 120, 536 140" fill="none" stroke="currentColor" strokeOpacity=".5" strokeWidth="4" strokeDasharray="2 10" strokeLinecap="round" />
          <line x1="24" y1="70" x2="470" y2="70" stroke="currentColor" strokeOpacity=".95" strokeWidth="14" strokeLinecap="round" />
          <line x1="250" y1="70" x2="470" y2="70" stroke="var(--color-stop)" strokeWidth="14" strokeLinecap="round" className="scene-stall" />
          {[
            { x: 24, name: "Awan Besar", a: "start" },
            { x: 250, name: "Sri Petaling", a: "middle" },
            { x: 470, name: "Bukit Jalil", a: "middle" },
          ].map((st) => (
            <g key={st.name}>
              <circle cx={st.x} cy={70} r={14} fill="var(--color-brand)" stroke="currentColor" strokeWidth="6" />
              <text x={st.x} y={116} textAnchor={st.a as any} fill="currentColor" fontSize="17" fontWeight="700">
                {st.name}
              </text>
            </g>
          ))}
          <g>
            <rect x="500" y="130" width="60" height="34" rx="10" fill="currentColor" />
            <text x="530" y="153" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--color-brand)">
              APU
            </text>
          </g>
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={34} cy={70} r={9} className={`scene-rider scene-rider-${i}`} />
          ))}
        </svg>
      </div>

      {/* the alert that lands on the student's phone */}
      <div className="scene-alert absolute bottom-0 left-4 right-4 rounded-2xl bg-surface p-4 text-fg shadow-[0_22px_48px_oklch(0.2_0.12_290/0.4)] sm:left-auto sm:right-[-12px] sm:w-[330px]">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-muted">
          <BellRing size={14} className="text-stop" /> Sampai · now
        </div>
        <div className="mt-1.5 text-[15px] font-bold leading-snug text-stop">Sri Petaling line stalled before Bukit Jalil</div>
        <div className="mt-1 text-[13.5px] leading-snug text-fg/80">Take bus T580 from Awan Besar, arrive 08:52. You'll still make 09:00.</div>
      </div>
    </div>
  );
}

const evidence = [
  { src: "Malay Mail", date: "Feb 2026", text: "Kelana Jaya LRT suffers serial breakdowns", href: "https://www.malaymail.com/news/malaysia/2026/02/27/mounting-frustration-as-kelana-jaya-lrt-suffers-serial-breakdowns-just-days-after-double-disruption/210557" },
  { src: "FMT", date: "Mar 2026", text: "LRT, monorail and MRT all disrupted on one day", href: "https://www.freemalaysiatoday.com/category/nation/2026/03/31/kelana-jaya-lrt-monorail-kajang-mrt-hit-by-disruptions" },
  { src: "SoyaCincau", date: "Sep 2026", text: "Signalling disruption between USJ 21 and Taipan", href: "https://soyacincau.com/2026/09/17/kelana-jaya-lrt-line-faces-delays-due-to-signalling-disruption-between-usj-21-and-taipan/" },
  { src: "The Star", date: "Sep 2026", text: "Flash floods hit parts of the Klang Valley", href: "https://www.thestar.com.my/news/nation/2026/09/26/flash-floods-hit-parts-of-klang-valley" },
];

const steps = [
  {
    icon: Radar,
    title: "Riders are the sensors",
    body: "Students tap “I'm on the train”. When several phones stop moving between two stations at once, Sampai knows the train has stalled, usually before any announcement.",
    demo: (
      <div className="flex items-center gap-1.5">
        {["go", "go", "stop", "stop", "stop", "go"].map((t, i) => (
          <span key={i} className={`h-3 w-3 rounded-full ${t === "stop" ? "bg-stop" : "bg-go"}`} />
        ))}
        <span className="ml-2 text-xs font-semibold text-stop">3 riders stopped · 30 s</span>
      </div>
    ),
  },
  {
    icon: BellRing,
    title: "You hear first, with a plan",
    body: "If it's on your route and your class is soon, your phone buzzes with the fastest way to still make it: another bus, a Grab with a fare estimate, the APU shuttle, or a covered walk.",
    demo: (
      <div className="space-y-1.5 text-[12px]">
        {[
          ["Bus T580 from Awan Besar", "08:52", true],
          ["Grab from Sri Petaling · RM 13", "08:44", true],
          ["Walk via covered path", "09:04", false],
        ].map(([l, t, ok]) => (
          <div key={l as string} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-2.5 py-1.5 ring-1 ring-line">
            <span className="truncate">{l}</span>
            <span className={`tnum font-semibold ${ok ? "text-go" : "text-stop"}`}>{t}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: FileCheck2,
    title: "Proof for your lecturer",
    body: "Late anyway? One tap produces an official disruption notice from the incident record, addressed to the lecturer on your APSpace timetable, with a QR code they can check.",
    demo: (
      <div className="rounded-lg bg-surface p-2.5 text-[11px] leading-snug ring-1 ring-line">
        <div className="font-bold uppercase tracking-wide">Notice of public transport disruption</div>
        <div className="mt-1 text-muted">Ref. SMP/20261113/7QX2K · 3 rider devices · medium confidence</div>
      </div>
    ),
  },
];

const sources = ["APSpace timetable", "APU shuttle schedule", "Prasarana rail network (GTFS)", "Rapid KL live bus GPS", "MET Malaysia warnings", "Open-Meteo heat and rain", "Gemini"];

export default function Landing() {
  const uid = useUid();
  const user = useUserDoc(uid);
  const appHref = user ? "/" : "/onboard";
  return (
    <div className="min-h-full bg-bg">
      {/* hero: the one place the brand colour floods the page */}
      <section className="relative overflow-hidden bg-brand text-surface">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-[max(env(safe-area-inset-top),18px)] lg:px-10 lg:pb-24">
          <header className="flex items-center justify-between">
            <span className="text-[20px] font-extrabold tracking-[-0.02em]">
              Sampai<span className="text-warn-fill">.</span>
            </span>
            <Link to={appHref} className="press rounded-full px-4 py-2 text-[13px] font-semibold text-surface ring-1 ring-surface/40 hover:bg-surface/10">
              Open the app
            </Link>
          </header>

          <div className="mt-12 grid items-center gap-12 lg:mt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
            <div>
              <h1 className="max-w-[15ch] text-[clamp(2.5rem,6.2vw,4.6rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-balance">
                Your train stopped. You'll still get to class.
              </h1>
              <p className="mt-6 max-w-[46ch] text-[clamp(1rem,1.4vw,1.15rem)] leading-relaxed text-surface/85">
                Sampai turns students' phones into a live sensor for the LRT. It spots a stalled train, tells you the fastest way to APU, and writes the delay notice if you're late anyway.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/onboard" className="press inline-flex h-13 items-center gap-2 rounded-2xl bg-surface px-6 text-[15px] font-bold text-brand hover:bg-surface/90">
                  Try it as a demo student <ArrowRight size={18} />
                </Link>
                <Link to="/onboard?setup=1" className="press inline-flex h-13 items-center rounded-2xl px-5 text-[15px] font-semibold text-surface ring-1 ring-surface/45 hover:bg-surface/10">
                  Set up my commute
                </Link>
              </div>
              <p className="mt-5 text-[13px] text-surface/70">Free for APU students. Anonymous. No student ID needed.</p>
            </div>
            <div className="text-surface">
              <StallScene />
            </div>
          </div>
        </div>
      </section>

      {/* the gap */}
      <section className="mx-auto max-w-6xl px-5 py-16 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <p className="text-[clamp(1.6rem,3.2vw,2.6rem)] font-bold leading-[1.15] tracking-[-0.025em] text-balance">
            Rapid KL shares live GPS for every bus. <span className="text-brand">Not for a single train.</span> So nobody knows a train has stalled until the riders on it do.
          </p>
          <div>
            <p className="text-[15px] leading-relaxed text-muted">It happened all year. Students found out on the platform, then had nothing to show their lecturer.</p>
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {evidence.map((e) => (
                <li key={e.href}>
                  <a href={e.href} target="_blank" rel="noreferrer" className="group flex items-baseline gap-3 py-3 text-[14px]">
                    <span className="w-24 shrink-0 font-semibold">{e.src}</span>
                    <span className="flex-1 text-fg/80 group-hover:text-fg">{e.text}</span>
                    <span className="tnum shrink-0 text-xs text-muted">{e.date}</span>
                    <ExternalLink size={13} className="shrink-0 text-faint group-hover:text-fg" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* how it works */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 lg:px-10 lg:py-24">
          <h2 className="max-w-[20ch] text-[clamp(1.6rem,3vw,2.3rem)] font-bold leading-tight tracking-[-0.025em]">From a stopped train to a plan in under a minute.</h2>
          <ol className="mt-10 grid gap-x-10 gap-y-12 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex flex-col">
                <div className="flex items-center gap-3">
                  <span className="tnum text-[13px] font-bold text-brand">0{i + 1}</span>
                  <span className="h-px flex-1 bg-line-strong" />
                  <s.icon size={18} className="text-brand" />
                </div>
                <h3 className="mt-4 text-[18px] font-bold">{s.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
                <div className="mt-5 rounded-xl bg-sunken p-3.5">{s.demo}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* built on real data + privacy */}
      <section className="mx-auto max-w-6xl px-5 py-16 lg:px-10 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-[22px] font-bold tracking-[-0.015em]">Built on APU's own data</h2>
            <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">Type your intake code and Sampai knows your real classes, rooms and lecturers, and plans around the real shuttle departures from APSpace.</p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {sources.map((s) => (
                <li key={s} className="rounded-full bg-surface px-3 py-1.5 text-[13px] font-medium ring-1 ring-line">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.015em]">
              <ShieldCheck size={22} className="text-go" /> Private by design
            </h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-muted">
              <li>Anonymous sign-in. No student ID, email or real name.</li>
              <li>Location is shared only while you're on board, never in the background.</li>
              <li>Raw locations are never stored. Incidents need several riders, so one phone can't fake a breakdown.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* closing CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16 lg:px-10 lg:pb-24">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-fg px-6 py-10 text-surface sm:px-10 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-[clamp(1.5rem,2.6vw,2rem)] font-bold leading-tight tracking-[-0.02em]">See it catch a breakdown.</h2>
            <p className="mt-2 max-w-[48ch] text-[15px] text-surface/75">Pick a demo student, then stall a train from the simulator. Your phone buzzes about 30 seconds later.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/onboard" className={btn("primary", "lg")}>
              Try the demo <ArrowRight size={18} />
            </Link>
            <Link to="/sim" className="press inline-flex h-14 items-center rounded-2xl px-5 text-[15px] font-semibold text-surface ring-1 ring-surface/30 hover:bg-surface/10">
              Open the simulator
            </Link>
          </div>
        </div>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 text-[12px] text-muted">
          <Wordmark className="text-[16px]" />
          <span>Data: data.gov.my, Prasarana, MET Malaysia (CC BY 4.0), APSpace, Open-Meteo. Built for the APU Cloud Innovation Hackathon 2026.</span>
          <span className="flex gap-4">
            <Link to="/admin" className="hover:text-fg">Dashboard</Link>
            <Link to="/sim" className="hover:text-fg">Simulator</Link>
          </span>
        </footer>
      </section>
    </div>
  );
}
