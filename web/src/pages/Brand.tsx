import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Copy, DownloadSimple, X } from "@phosphor-icons/react";
import { Logo, LogoMark } from "../components/Logo";
import { Nav } from "../components/SiteNav";
import { useReveal } from "../lib/useReveal";
import { useMedia } from "../lib/useMedia";

const colors = [
  { name: "Senja", role: "Primary", meaning: "Dusk violet, the colour of the evening commute. Buttons, selection, focus, the brand moments.", hex: "#5E3EB6", oklch: "oklch(0.47 0.18 290)", fg: "#FDFDFF" },
  { name: "Lampu", role: "Accent", meaning: "Signal lamp yellow. The arrival dot and simulated labels. A fill, never text on light.", hex: "#FACA4B", oklch: "oklch(0.86 0.15 88)", fg: "#1C1B28" },
  { name: "Malam", role: "Ink", meaning: "Night ink for text and dark lockups.", hex: "#1C1B28", oklch: "oklch(0.23 0.025 285)", fg: "#FDFDFF" },
  { name: "Kapur", role: "Background", meaning: "Chalk. The page, high contrast in sunlight and on projectors.", hex: "#F5F5F9", oklch: "oklch(0.972 0.005 285)", fg: "#1C1B28" },
  { name: "Jalan", role: "Running, on time", meaning: "Go. Trains moving, options that make class.", hex: "#0B7643", oklch: "oklch(0.5 0.12 155)", fg: "#FDFDFF" },
  { name: "Henti", role: "Stalled, late", meaning: "Stop. A stalled stretch, an option that misses class.", hex: "#C2272D", oklch: "oklch(0.53 0.19 25)", fg: "#FDFDFF" },
  { name: "Hujan", role: "Weather", meaning: "Rain. MET warnings and covered walk advice.", hex: "#0068A7", oklch: "oklch(0.5 0.13 245)", fg: "#FDFDFF" },
];

const taglines = [
  { label: "Core line", text: "Get to class, or get proof why you didn't." },
  { label: "Hero", text: "Your train stopped. You'll still get to class." },
  { label: "Short", text: "Arrive, with proof." },
  { label: "Pitch", text: "Riders are the sensors." },
  { label: "Bahasa Melayu", text: "Tren rosak? Anda tetap sampai." },
  { label: "Bahasa Melayu, short", text: "Lewat? Ada bukti." },
];

const quotes = [
  "Malaysia publishes live GPS for every bus. Not one train. So we asked the riders.",
  "The train won't tell you it stopped. The people on board already know.",
  "A delay you can prove is a delay you can explain.",
  "Every phone on the platform is a sensor nobody was using.",
];

const textStyles: [string, string, string][] = [
  ["Heading 1", "heading-1", "60 / 60 Semibold"],
  ["Heading 3", "heading-3", "36 / 40 Semibold"],
  ["Heading 5", "heading-5", "24 / 32 Semibold"],
  ["Title 2", "title-2", "18 / 28 Medium"],
  ["Body 3", "body-3", "16 / 24 Regular"],
  ["Caption 3", "caption-3", "12 / 16 Semibold"],
];

const downloads = [
  ["Mark, violet", "/brand/sampai-mark.svg"],
  ["Mark, ink", "/brand/sampai-mark-ink.svg"],
  ["Mark, light", "/brand/sampai-mark-light.svg"],
  ["Logo on chalk", "/brand/sampai-logo.svg"],
  ["Logo on violet", "/brand/sampai-logo-violet.svg"],
  ["Logo on ink", "/brand/sampai-logo-ink.svg"],
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!done && !failed) return;
    const t = setTimeout(() => {
      setDone(false);
      setFailed(false);
    }, 1600);
    return () => clearTimeout(t);
  }, [done, failed]);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(value).then(() => setDone(true), () => setFailed(true))}
      className="lp-press inline-flex min-h-8 items-center gap-1 rounded-lg px-2 py-1 caption-4 text-muted hover:bg-sunken hover:text-fg"
      aria-label={`Copy ${label}`}
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
      {done ? "Copied" : failed ? "Copy blocked" : value}
    </button>
  );
}

function Block({ id, title, body, children }: { id: string; title: string; body?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} data-reveal className="border-t border-line py-16">
      <div className="grid gap-8 lg:grid-cols-[1fr_2.4fr] lg:gap-16">
        <div>
          <h2 id={`${id}-t`} className="heading-5 text-fg">{title}</h2>
          {body && <p className="mt-2 body-6 text-muted">{body}</p>}
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export default function Brand() {
  const wide = useMedia("(min-width: 640px)"); // the big lockup is ~460px wide; phones get a smaller one
  const root = useRef<HTMLDivElement>(null);
  useReveal(root);
  useEffect(() => {
    const prev = document.title;
    document.title = "Sampai brand kit";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div ref={root} className="lp min-h-full bg-bg text-fg">
      <div className="mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <Nav />
        <main className="pt-20 lg:pt-24">
          <section className="grid items-center gap-12 py-12 lg:grid-cols-2 lg:py-16 [&>*]:min-w-0">
            <div>
              <h1 className="heading-3 sm:heading-2 lg:heading-1">
                <span className="intro hero-ink block w-fit" style={{ "--d": "80ms" } as CSSProperties}>Sampai means</span>
                <span className="intro hero-ink block w-fit" style={{ "--d": "180ms" } as CSSProperties}>arrived</span>
              </h1>
              <p className="intro mt-6 max-w-[560px] body-3 text-muted" style={{ "--d": "280ms" } as CSSProperties}>
                Everything here points at one idea: you get there, and if you can't, you have proof. Calm, plain and decisive. No hype, no emoji, no jargon.
              </p>
            </div>
            <div className="intro-pop flex items-center justify-center rounded-3xl bg-brand p-8 sm:p-12 lg:p-16" style={{ "--d": "200ms" } as CSSProperties}>
              <Logo size={wide ? 88 : 56} onDark animated />
            </div>
          </section>

          <Block id="logo" title="Logo" body="A route line shaped like an S runs from a start station to a yellow terminus. The dot is the full stop in “Sampai.”: the trip is complete.">
            <div className="grid gap-4 sm:grid-cols-3">
              {(["violet", "ink", "light"] as const).map((t) => (
                <div key={t} className={`flex aspect-square items-center justify-center rounded-3xl ${t === "light" ? "bg-surface ring-1 ring-line" : t === "ink" ? "bg-[#1C1B28]" : "bg-sunken"}`}>
                  <LogoMark size={128} tone={t} title={`Sampai mark, ${t}`} />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="flex items-center justify-center rounded-3xl bg-surface p-8 ring-1 ring-line"><Logo size={36} /></div>
              <div className="flex items-center justify-center rounded-3xl bg-brand p-8"><Logo size={36} onDark /></div>
              <div className="flex items-center justify-center rounded-3xl bg-[#1C1B28] p-8"><Logo size={36} onDark /></div>
            </div>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                [true, "Keep clear space equal to the terminus dot around the mark."],
                [true, "Use the violet full stop on light surfaces, yellow on violet or ink."],
                [false, "Don't recolour the dot, rotate the mark or flip the route."],
                [false, "Don't place the mark on photos or gradients."],
              ].map(([ok, t]) => (
                <li key={t as string} className="flex gap-2 body-6 text-fg/85">
                  {ok ? <Check size={18} className="mt-0.5 shrink-0 text-go" aria-label="Do" /> : <X size={18} className="mt-0.5 shrink-0 text-stop" aria-label="Don't" />}
                  {t}
                </li>
              ))}
            </ul>
            <ul className="mt-6 flex flex-wrap gap-2">
              {downloads.map(([l, href]) => (
                <li key={href}>
                  <a href={href} download className="lp-press inline-flex min-h-11 items-center gap-2 rounded-xl bg-surface px-3 py-2 button-sm text-fg ring-1 ring-line hover:ring-line-strong">
                    <DownloadSimple size={16} /> {l} (SVG)
                  </a>
                </li>
              ))}
            </ul>
          </Block>

          <Block id="color" title="Colour" body="Malay names for each role. Violet carries the brand, yellow marks arrival, green and red always mean on time and late. Never rely on colour alone: pair it with a label.">
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {colors.map((c) => (
                <li key={c.name} className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
                  <div className="flex h-24 items-end p-4" style={{ background: c.hex, color: c.fg }}>
                    <span className="title-1">{c.name}</span>
                  </div>
                  <div className="p-4">
                    <p className="caption-3 uppercase tracking-wider text-muted">{c.role}</p>
                    <p className="mt-2 body-6 text-fg/85">{c.meaning}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <CopyButton value={c.hex} label={`${c.name} hex`} />
                      <CopyButton value={c.oklch} label={`${c.name} OKLCH`} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Block>

          <Block id="type" title="Typography" body="Manrope for everything, at Semibold or lighter. Numbers and times use tabular figures. Sizes come from the Tailwind type scale only.">
            <ul className="divide-y divide-line rounded-3xl bg-surface px-6 ring-1 ring-line">
              {textStyles.map(([name, cls, spec]) => (
                <li key={name} className="flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8">
                  <span className={`${cls} min-w-0 text-fg`}>Leave by 08:05</span>
                  <span className="shrink-0 caption-4 text-muted">
                    {name} · {spec}
                  </span>
                </li>
              ))}
            </ul>
          </Block>

          <Block id="taglines" title="Taglines" body="Use the core line on the title slide and the app manifest. The others fit hero, social and Malay audiences.">
            <ul className="grid gap-4 sm:grid-cols-2">
              {taglines.map((t, i) => (
                <li key={t.text} className={`rounded-3xl p-6 ${i === 0 ? "bg-brand text-surface sm:col-span-2" : "bg-surface ring-1 ring-line"}`}>
                  <p className={`caption-3 uppercase tracking-wider ${i === 0 ? "text-surface/75" : "text-muted"}`}>{t.label}</p>
                  <p className={`mt-2 ${i === 0 ? "heading-4" : "heading-6"}`}>{t.text}</p>
                </li>
              ))}
            </ul>
          </Block>

          <Block id="quotes" title="Pitch quotes" body="Lines for the deck, the demo voiceover and social posts. They are the team's words, not testimonials, so don't attribute them to students.">
            <ul className="space-y-4">
              {quotes.map((q) => (
                <li key={q} className="rounded-3xl bg-surface p-6 ring-1 ring-line">
                  <blockquote className="heading-6 text-fg">
                    <span className="text-brand">“</span>
                    {q}
                    <span className="text-brand">”</span>
                  </blockquote>
                  <p className="mt-2 caption-4 text-muted">Sampai team</p>
                </li>
              ))}
            </ul>
          </Block>

          <Block id="voice" title="Voice" body="Say what happened, what to do, and whether you make class. Next action first.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-go-soft p-6">
                <p className="flex items-center gap-2 body-4 text-go"><Check size={16} /> Write</p>
                <ul className="mt-4 space-y-2 body-6 text-fg/85">
                  <li>“Take bus T580 from Awan Besar. You'll still make 09:00.”</li>
                  <li>“3 riders stopped between Sri Petaling and Bukit Jalil.”</li>
                  <li>“Notice sent to Dr. Lim.”</li>
                </ul>
              </div>
              <div className="rounded-3xl bg-stop-soft p-6">
                <p className="flex items-center gap-2 body-4 text-stop"><X size={16} /> Avoid</p>
                <ul className="mt-4 space-y-2 body-6 text-fg/85">
                  <li>“Oops! Looks like there's a hiccup on your line 😬”</li>
                  <li>“Our AI powered platform optimizes your journey.”</li>
                  <li>“Service disruption detected. Please be advised.”</li>
                </ul>
              </div>
            </div>
          </Block>
        </main>

        <footer className="border-t border-line py-8 caption-5 text-muted">Sampai · APU Cloud Innovation Hackathon 2026 · Logo files live in /web/public/brand.</footer>
      </div>
    </div>
  );
}
