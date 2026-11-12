import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import {
  ArrowRight,
  ArrowUpRight,
  BellRinging,
  Broadcast,
  Bus,
  CalendarCheck,
  Car,
  CloudRain,
  Cpu,
  DeviceMobile,
  Path,
  PersonSimpleWalk,
  Plus,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Logo } from "../components/Logo";
import { Anchor, Nav, NAV_IDS, goTo } from "../components/SiteNav";
import { HeroMap } from "../components/HeroMap";
import { useUid, useUserDoc } from "../lib/hooks";

/* ------------------------------------------------------------------ data */

const evidence = [
  { src: "Malay Mail", date: "Feb 2026", text: "Kelana Jaya LRT suffers serial breakdowns", href: "https://www.malaymail.com/news/malaysia/2026/02/27/mounting-frustration-as-kelana-jaya-lrt-suffers-serial-breakdowns-just-days-after-double-disruption/210557" },
  { src: "FMT", date: "Mar 2026", text: "LRT, monorail and MRT all disrupted on one day", href: "https://www.freemalaysiatoday.com/category/nation/2026/03/31/kelana-jaya-lrt-monorail-kajang-mrt-hit-by-disruptions" },
  { src: "SoyaCincau", date: "Sep 2026", text: "Signalling disruption between USJ 21 and Taipan", href: "https://soyacincau.com/2026/09/17/kelana-jaya-lrt-line-faces-delays-due-to-signalling-disruption-between-usj-21-and-taipan/" },
  { src: "The Star", date: "Sep 2026", text: "Flash floods hit parts of the Klang Valley", href: "https://www.thestar.com.my/news/nation/2026/09/26/flash-floods-hit-parts-of-klang-valley" },
];

const stack = ["Cloud Run", "Pub/Sub", "Firestore", "Firebase Cloud Messaging", "Cloud Scheduler", "BigQuery", "Looker Studio", "Gemini"];
const sources = ["APSpace timetable", "APU shuttle schedule", "Prasarana rail network (GTFS)", "Rapid KL live bus GPS", "MET Malaysia warnings", "Open-Meteo heat and rain"];

const faqs: { q: string; a: string }[] = [
  { q: "Is Sampai free?", a: "Yes. It is free for APU students. There is nothing to buy and no account to create." },
  { q: "Do I need my student ID or email?", a: "No. Sampai signs you in anonymously. You only type your intake code, so it can read your public APSpace timetable." },
  { q: "Does it track my location all day?", a: "No. Your phone only shares location after you tap “I'm on the train”, and it stops when you reach your station or after 90 minutes. Raw locations are never stored." },
  { q: "Can one person fake a breakdown?", a: "No. An incident needs several riders stopped on the same stretch at the same time, three in normal use. One phone alone never triggers an alert." },
  { q: "What if I'm the only Sampai rider on my train?", a: "You still get alerts raised by other riders, by Rapid KL live bus GPS and by MET Malaysia warnings. The more riders on board, the faster and more confident detection gets." },
  { q: "Will my lecturer accept the notice?", a: "That is your lecturer's call, not ours. The notice gives them facts they can check: a reference number, the time window, how many riders detected it, and a QR code to the public incident record." },
  { q: "Which lines does it cover?", a: "All 8 rail lines in the Prasarana network data, 179 station to station stretches. Alerts and reroutes are tuned for the Sri Petaling line to Bukit Jalil and APU." },
  { q: "What does Gemini do?", a: "It writes the alert in plain English or Bahasa Melayu, picks the best option for your class time, rain and heat, and drafts the notice using only facts from the incident log. Without Gemini, Sampai falls back to templates." },
  { q: "What is simulated in the demo?", a: "Riders and stalls started from the simulator are labelled SIMULATED on screen and in the data. Timetables, shuttle times, bus GPS and weather are live." },
];

/* --------------------------------------------------------------- hooks */

/** Sections rise 32px and fade in once, when they enter the viewport. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!els?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [root]);
}

/* ----------------------------------------------------------- components */

/** Large tagline. Words go from muted to full in reading order as the section scrolls up. */
function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const words = lines.map((l) => l.split(" "));
  const total = words.flat().length;
  const [on, setOn] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOn(total);
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.85; // first word lights when the block's top reaches 85% of the screen
      const end = vh * 0.35; // last word lights when it reaches 35%
      const p = Math.min(1, Math.max(0, (start - r.top) / (start - end)));
      const n = Math.round(p * total);
      setOn((prev) => Math.max(prev, n));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // only listen while the block is near the viewport
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        window.addEventListener("scroll", onScroll, { passive: true });
        update();
      } else window.removeEventListener("scroll", onScroll);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [total]);

  let k = 0;
  return (
    <h2 ref={ref} className="max-w-[680px] heading-3 text-fg sm:heading-2 lg:heading-1" aria-label={lines.join(". ")}>
      {words.map((line, li) => (
        <span key={li} className="block" aria-hidden>
          {line.map((w, wi) => {
            const idx = k++;
            return (
              <span key={wi} className={`tl-word ${idx < on ? "on" : ""}`}>
                {w}
                {wi < line.length - 1 ? " " : ""}
              </span>
            );
          })}
        </span>
      ))}
    </h2>
  );
}

function SectionHead({ title, body, className = "" }: { title: ReactNode; body?: ReactNode; className?: string }) {
  return (
    <div className={`max-w-[680px] ${className}`}>
      <h2 className="heading-4 text-fg lg:heading-3">{title}</h2>
      {body && <p className="mt-4 body-3 text-muted">{body}</p>}
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col rounded-3xl bg-surface p-6 ring-1 ring-line ${className}`}>{children}</div>;
}

function CardTitle({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">{icon}</span>
      <h3 className="mt-4 heading-6 text-fg">{title}</h3>
      <p className="mt-2 body-6 text-muted">{body}</p>
    </>
  );
}

function SampleNotice() {
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/incident/sample`, { margin: 0, width: 192, color: { dark: "#1C1B28", light: "#FDFDFF" } })
      .then(setQr)
      .catch(() => setQrError(true));
  }, []);

  const facts: [string, string][] = [
    ["Line", "LRT Sri Petaling line"],
    ["Between", "Sri Petaling and Bukit Jalil"],
    ["Time window", "08:21 to 08:47 MYT, 26 min"],
    ["Detected by", "3 rider devices, medium confidence"],
    ["Alternative taken", "Bus T580 from Awan Besar"],
  ];

  return (
    <figure className="relative rounded-3xl bg-surface p-6 ring-1 ring-line sm:p-8">
      <span className="absolute right-4 top-4 rounded-sm bg-warn-fill px-2 py-0.5 caption-3 uppercase tracking-wider text-fg">Sample</span>
      <div className="flex flex-wrap items-center justify-between gap-3 pr-16">
        <Logo size={22} />
        <span className="caption-5 text-muted tnum">Ref. No. SMP/20261113/7QX2K</span>
      </div>
      <p className="mt-6 caption-3 uppercase tracking-wider text-muted">Public transport disruption notice</p>
      <h3 className="mt-2 title-2 text-fg">Notice of public transport disruption affecting attendance: Cloud Infrastructure and Services</h3>
      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-sunken p-4">
        {facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="caption-4 text-muted">{k}</dt>
            <dd className="caption-1 text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 body-6 text-fg/85">
        Dear Dr. Lim, on 13 November 2026 the LRT service I was travelling on stopped between Sri Petaling and Bukit Jalil. The disruption is logged under the reference above, and I took the T580 bus to reach campus.
      </p>
      <figcaption className="mt-6 flex items-center gap-4 rounded-xl p-0">
        {qr ? (
          <img src={qr} alt="QR code linking to the sample incident record" className="h-16 w-16 rounded-sm" width={64} height={64} />
        ) : qrError ? (
          <span className="flex h-16 w-16 items-center justify-center rounded-sm bg-sunken caption-5 text-muted">No QR</span>
        ) : (
          <span className="h-16 w-16 animate-pulse rounded-sm bg-sunken" />
        )}
        <span className="caption-5 text-muted">Scan to open the public incident record. Generated by Sampai from rider sensor data and public transport feeds. This is not an operator statement.</span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ page */

export default function Landing() {
  const uid = useUid();
  const user = useUserDoc(uid);
  const appHref = user ? "/" : "/onboard";
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);

  useEffect(() => {
    const prev = document.title;
    document.title = "Sampai · Get to class, or get proof why you didn't";
    // A shared link like /welcome#faq still lands on its section, then the URL is cleaned.
    const hash = window.location.hash.slice(1);
    if (hash) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      // arriving from another page: let the entrance start, then glide down to the section
      if (NAV_IDS.includes(hash) || hash === "privacy") setTimeout(() => goTo(hash), 350);
    }
    return () => {
      document.title = prev;
    };
  }, []);

  const wrap = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8";

  return (
    <div ref={root} className="lp min-h-full bg-bg text-fg">
      <a href="#main" className="sr-only z-[70] rounded-lg bg-fg px-3 py-2 button-sm text-surface focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <Nav />

      <main id="main">
        {/* ---------- hero ---------- */}
        <section aria-labelledby="hero-title" className={`${wrap} pb-16 pt-24 lg:pb-24 lg:pt-24`}>
          <div className="grid items-center gap-12 pt-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:pt-16">
            <div>
              <h1 id="hero-title" className="max-w-[680px] heading-3 sm:heading-2 xl:heading-1">
                <span className="intro hero-ink block w-fit sm:whitespace-nowrap" style={{ "--d": "120ms" } as CSSProperties}>Your train stopped</span>
                <span className="intro hero-ink block w-fit sm:whitespace-nowrap" style={{ "--d": "220ms" } as CSSProperties}>You'll still get to class</span>
              </h1>
              <p className="intro mt-6 max-w-[680px] body-3 text-muted lg:title-2 lg:font-normal" style={{ "--d": "320ms" } as CSSProperties}>
                Sampai turns APU students' phones into a live sensor for the LRT. It spots a stalled train, buzzes you with the fastest way to campus, and writes the notice for your lecturer if you're late anyway.
              </p>
              <div className="intro mt-8 flex flex-col items-start gap-4" style={{ "--d": "420ms" } as CSSProperties}>
                <Link to="/onboard" className="lp-press inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-3 py-2 button-md text-surface hover:bg-brand-hover">
                  Try the live demo <ArrowRight size={18} />
                </Link>
                <p className="caption-2 text-muted">Free for APU students. Anonymous sign in. No student ID.</p>
              </div>
              <p style={{ "--d": "520ms" } as CSSProperties} className="intro mt-8 inline-flex items-center gap-2 rounded-full bg-surface px-3 py-2 caption-1 text-fg ring-1 ring-line">
                <span className="h-2 w-2 rounded-full bg-go" aria-hidden />
                Watching 179 rail stretches across 8 Klang Valley lines
              </p>
            </div>
            <div className="intro-pop" style={{ "--d": "260ms" } as CSSProperties}>
              <HeroMap />
            </div>
          </div>
        </section>

        {/* ---------- the gap ---------- */}
        <section id="problem" aria-labelledby="problem-title" className={`${wrap} scroll-mt-24 py-16 lg:py-24`}>
          <div data-reveal className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <div>
              <h2 id="problem-title" className="max-w-[680px] heading-4 text-fg lg:heading-3">
                Rapid KL shares live GPS for every bus. <span className="text-brand">Not for a single train.</span>
              </h2>
              <p className="mt-4 max-w-[560px] body-3 text-muted">
                So nobody knows a train has stalled until the people on it do. It happened all year, and students found out on the platform with nothing to show their lecturer.
              </p>
            </div>
            <ul className="divide-y divide-line rounded-2xl bg-surface px-4 ring-1 ring-line">
              {evidence.map((e) => (
                <li key={e.href}>
                  <a href={e.href} target="_blank" rel="noreferrer" className="group flex items-baseline gap-3 py-4">
                    <span className="w-24 shrink-0 body-4 text-fg">{e.src}</span>
                    <span className="flex-1 body-6 text-fg/80 transition-colors duration-300 ease-brand group-hover:text-fg">{e.text}</span>
                    <span className="hidden shrink-0 caption-5 text-muted tnum sm:inline">{e.date}</span>
                    <ArrowUpRight size={14} className="shrink-0 self-center text-faint transition-transform duration-300 ease-brand group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-label="opens in a new tab" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- benefits (bento) ---------- */}
        <section id="benefits" aria-labelledby="benefits-title" className={`${wrap} scroll-mt-24 py-16 lg:py-24`}>
          <div data-reveal>
            <SectionHead title={<span id="benefits-title">When the line stops, you already know what to do</span>} />
          </div>
          <div data-reveal className="mt-12 grid gap-4 lg:grid-cols-6">
            <Card className="lg:col-span-4">
              <CardTitle
                icon={<Broadcast size={20} />}
                title="Hear it before the platform does"
                body="When several riders stop between two stations, Sampai raises an incident and buzzes everyone whose class it affects. No waiting for an announcement."
              />
              <div className="mt-auto pt-6">
                <div className="flex items-center gap-2 rounded-xl bg-sunken p-4">
                  {["go", "go", "stop", "stop", "stop", "go"].map((t, i) => (
                    <span key={i} className={`h-3 w-3 rounded-full ${t === "stop" ? "bg-stop" : "bg-go"}`} />
                  ))}
                  <span className="ml-2 caption-3 text-stop">3 riders still · 2 min · medium confidence</span>
                </div>
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardTitle
                icon={<CalendarCheck size={20} />}
                title="Planned around your real classes"
                body="Type your intake code. Sampai reads your APSpace timetable and the real APU shuttle departures, so every alert knows when you need to be in the room."
              />
            </Card>
            <Card className="lg:col-span-2">
              <CardTitle
                icon={<CloudRain size={20} />}
                title="Walks that respect the weather"
                body="A MET Malaysia heavy rain warning moves you to the covered path. When it feels like 35°C or more, you get the shaded route."
              />
            </Card>
            <Card className="lg:col-span-4">
              <CardTitle
                icon={<Path size={20} />}
                title="A plan that still gets you there"
                body="Every option shows when you'd arrive and whether you make class. Gemini picks the best one and tells you why in one sentence."
              />
              <ul className="mt-auto space-y-2 pt-6">
                {[
                  { icon: <Bus size={16} />, l: "Bus T580 from Awan Besar", t: "08:52", ok: true },
                  { icon: <Car size={16} />, l: "Grab from Sri Petaling · RM 13 estimate", t: "08:44", ok: true },
                  { icon: <PersonSimpleWalk size={16} />, l: "Walk via covered path", t: "09:04", ok: false },
                ].map((o) => (
                  <li key={o.l} className="flex items-center gap-3 rounded-xl bg-sunken px-4 py-2">
                    <span className="text-muted">{o.icon}</span>
                    <span className="min-w-0 flex-1 truncate caption-1 text-fg">{o.l}</span>
                    <span className="caption-3 text-fg tnum">{o.t}</span>
                    <span className={`rounded-full px-2 py-0.5 caption-3 ${o.ok ? "bg-go-soft text-go" : "bg-stop-soft text-stop"}`}>{o.ok ? "On time" : "Late"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        {/* ---------- tagline reveal ---------- */}
        <section aria-label="Tagline" className={`${wrap} py-24`}>
          <TaglineReveal lines={["The train won't tell you it stopped", "The people on board already know"]} />
        </section>

        {/* ---------- how it works ---------- */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-24 bg-surface py-16 ring-1 ring-line lg:py-24">
          <div className={`${wrap} grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16`}>
            <div data-reveal>
              <SectionHead
                title={<span id="how-title">From a stopped train to your phone, on Google Cloud</span>}
                body="Phones are the sensors, Pub/Sub is the network, Cloud Run and Gemini do the thinking. Built for the APU Cloud Innovation Hackathon 2026."
              />
              <p className="mt-8 caption-3 uppercase tracking-wider text-muted">Built with</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {stack.map((s) => (
                  <li key={s} className="rounded-full bg-brand-soft px-3 py-1 caption-1 text-brand">
                    {s}
                  </li>
                ))}
              </ul>
              <p className="mt-6 caption-3 uppercase tracking-wider text-muted">Live data</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {sources.map((s) => (
                  <li key={s} className="rounded-full bg-bg px-3 py-1 caption-1 text-fg ring-1 ring-line">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <ol data-reveal className="space-y-4">
              {[
                { icon: <DeviceMobile size={20} />, t: "Sense", b: "Riders tap “I'm on the train”. Their phone sends GPS and motion every few seconds, only for that trip, only while on board." },
                { icon: <Cpu size={20} />, t: "Detect", b: "Pings travel through Pub/Sub to a Cloud Run worker that keeps a sliding window for each stretch of track. Three riders still for two minutes between stations means a stall." },
                { icon: <BellRinging size={20} />, t: "Alert and prove", b: "Students on that route with a class soon get a push and a vibration. Gemini writes the alert and the delay notice. Every incident lands in BigQuery for the dashboard." },
              ].map((s, i) => (
                <li key={s.t} className="flex gap-4 rounded-3xl bg-bg p-6 ring-1 ring-line">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-surface">{s.icon}</span>
                  <div>
                    <h3 className="heading-6 text-fg">
                      <span className="mr-2 text-brand tnum">0{i + 1}</span>
                      {s.t}
                    </h3>
                    <p className="mt-2 body-6 text-muted">{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- delay notice ---------- */}
        <section id="proof" aria-labelledby="proof-title" className={`${wrap} scroll-mt-24 py-16 lg:py-24`}>
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
            <div data-reveal>
              <SectionHead
                title={<span id="proof-title">A delay you can prove is a delay you can explain</span>}
                body="Late anyway? One tap turns the incident record into a formal notice addressed to the lecturer on your timetable. Gemini writes it from the incident log and is told to use only those facts."
              />
              <ul className="mt-8 space-y-4">
                {[
                  ["Facts from the log", "Reference number, time window and rider count, straight from the incident record."],
                  ["Checkable in seconds", "A QR code opens the public incident page, so your lecturer can see it for themselves."],
                  ["Your language", "English or Bahasa Melayu, downloaded as a PDF."],
                ].map(([t, b]) => (
                  <li key={t} className="flex gap-4">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                    <p className="body-6 text-muted">
                      <strong className="body-4 text-fg">{t}.</strong> {b}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal>
              <SampleNotice />
            </div>
          </div>
        </section>

        {/* ---------- privacy ---------- */}
        <section id="privacy" aria-labelledby="privacy-title" className={`${wrap} scroll-mt-24 pb-16 lg:pb-24`}>
          <div data-reveal className="grid gap-8 rounded-3xl bg-go-soft p-6 sm:p-8 lg:grid-cols-[1fr_2fr] lg:gap-16 lg:p-12">
            <h2 id="privacy-title" className="flex items-center gap-2 heading-5 text-fg">
              <ShieldCheck size={24} className="text-go" /> Private by design
            </h2>
            <ul className="grid gap-6 sm:grid-cols-3">
              {[
                ["No identity", "Anonymous sign in. No student ID, email or real name."],
                ["Only on board", "Location is shared only during a trip you start, never in the background."],
                ["Nothing raw kept", "Raw locations are never stored, and one phone can never raise an incident alone."],
              ].map(([t, b]) => (
                <li key={t}>
                  <h3 className="body-4 text-fg">{t}</h3>
                  <p className="mt-1 body-6 text-fg/75">{b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" aria-labelledby="faq-title" className={`${wrap} scroll-mt-24 pb-16 lg:pb-24`}>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <div data-reveal className="lg:sticky lg:top-24 lg:self-start">
              <SectionHead title={<span id="faq-title">Questions students and judges ask</span>} body="Short answers. The simulator and dashboard show the rest." />
            </div>
            <div data-reveal className="rounded-3xl bg-surface px-6 ring-1 ring-line">
              {faqs.map((f, i) => (
                <details key={f.q} className={`group py-4 ${i ? "border-t border-line" : ""}`}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-2 title-3 text-fg [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <Plus size={18} className="faq-chev shrink-0 text-muted" />
                  </summary>
                  <p className="pb-2 pt-2 body-6 text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- final CTA ---------- */}
        <section aria-labelledby="cta-title" className={`${wrap} pb-16 lg:pb-24`}>
          <div data-reveal className="flex flex-col items-start gap-8 rounded-3xl bg-brand p-8 text-surface lg:flex-row lg:items-end lg:justify-between lg:p-16">
            <div className="max-w-[680px]">
              <h2 id="cta-title" className="heading-4 lg:heading-2">See Sampai catch a breakdown</h2>
              <p className="mt-4 body-3 text-surface/80">Pick a demo student, then stall a train from the simulator. The phone buzzes about 30 seconds later.</p>
            </div>
            <div className="flex flex-col items-start gap-4 lg:shrink-0">
              <div className="flex flex-wrap gap-3">
                <Link to="/onboard" className="lp-press inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 py-2 button-md text-brand hover:bg-brand-soft">
                  Try the live demo <ArrowRight size={18} />
                </Link>
                <Link to="/sim" className="lp-press inline-flex min-h-11 items-center rounded-xl px-3 py-2 button-md text-surface ring-1 ring-surface/40 hover:bg-surface/10">
                  Open the simulator
                </Link>
              </div>
              <p className="caption-2 text-surface/75">Free for APU students. Anonymous sign in. No student ID.</p>
            </div>
          </div>
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className={`${wrap} pb-12`}>
        <div className="grid gap-8 border-t border-line pt-12 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Logo size={28} />
            <p className="mt-4 max-w-[360px] body-6 text-muted">Get to class, or get proof why you didn't. Built for the APU Cloud Innovation Hackathon 2026.</p>
          </div>
          <nav aria-label="Product">
            <h2 className="caption-3 uppercase tracking-wider text-muted">Product</h2>
            <ul className="mt-4 space-y-2 body-6">
              <li><Link to={appHref} className="text-fg/80 hover:text-fg">Student app</Link></li>
              <li><Link to="/sim" className="text-fg/80 hover:text-fg">Simulator</Link></li>
              <li><Link to="/admin" className="text-fg/80 hover:text-fg">Dashboard</Link></li>
              <li><Link to="/brand" className="text-fg/80 hover:text-fg">Brand kit</Link></li>
            </ul>
          </nav>
          <nav aria-label="About">
            <h2 className="caption-3 uppercase tracking-wider text-muted">About</h2>
            <ul className="mt-4 space-y-2 body-6">
              <li><Anchor to="privacy" className="text-fg/80 hover:text-fg">Privacy</Anchor></li>
              <li><Anchor to="faq" className="text-fg/80 hover:text-fg">FAQ</Anchor></li>
              <li>
                <a href="https://apu-cloud-innovation-hackathon.gdgocapu.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fg/80 hover:text-fg">
                  Hackathon site <ArrowUpRight size={12} />
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <p className="mt-12 caption-5 text-muted">
          Data: data.gov.my, Prasarana and MET Malaysia (CC BY 4.0), APU APSpace, Open-Meteo. Simulated riders and incidents are always labelled SIMULATED.
        </p>
      </footer>
    </div>
  );
}
