import { useEffect, useLayoutEffect, useRef, useState, type AnchorHTMLAttributes } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Logo } from "./Logo";
import { useUid, useUserDoc } from "../lib/hooks";

/**
 * The floating site nav. On the landing page it scrolls between sections; on other pages
 * (onboarding, brand kit) the same links go back to the landing section, desktop only.
 */

export const NAV = [
  { id: "problem", label: "The gap" },
  { id: "benefits", label: "What you get" },
  { id: "how", label: "How it works" },
  { id: "proof", label: "Incident report" },
  { id: "faq", label: "FAQ" },
];

export const NAV_IDS = NAV.map((n) => n.id);

const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Smooth scroll to a section (or the top) without writing a #hash into the URL. */
export function goTo(id: string | null) {
  const behavior: ScrollBehavior = prefersReduced() ? "auto" : "smooth";
  if (!id) return window.scrollTo({ top: 0, behavior });
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
}

/** An in-page link: keeps a real href (new tab, copy link still work) but scrolls smoothly and leaves the URL alone. */
export function Anchor({ to, onGo, children, ...rest }: { to: string; onGo?: () => void } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <a
      {...rest}
      href={`#${to}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onGo?.();
        // let a closing menu release the scroll lock first
        requestAnimationFrame(() => goTo(to));
      }}
    >
      {children}
    </a>
  );
}

/** Which section is under the nav, so the nav can mark it. */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = e.target.id;
          if (e.isIntersecting) setActive(id);
          // keep the last section lit across gaps (tagline, privacy); clear only when scrolling back up into the hero
          else if (id === ids[0] && e.boundingClientRect.top > 0) setActive((prev) => (prev === id ? null : prev));
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

/**
 * The highlight behind the active nav item glides to the next one (FLIP, transform only).
 * It starts from wherever it is drawn right now, so fast scrolling through sections never makes it jump.
 */
function useNavPill(active: string | null) {
  const list = useRef<HTMLUListElement>(null);
  const pill = useRef<HTMLSpanElement>(null);

  const place = (animate: boolean) => {
    const ul = list.current;
    const p = pill.current;
    if (!ul || !p) return;
    const link = active ? ul.querySelector<HTMLElement>(`[data-nav="${active}"]`) : null;
    if (!link) {
      p.style.opacity = "0";
      return;
    }
    const x = link.offsetLeft;
    const w = link.offsetWidth;
    const wasVisible = p.style.opacity === "1";
    const from = p.getBoundingClientRect();
    const fromX = from.left - ul.getBoundingClientRect().left;

    p.style.transition = "none";
    p.style.top = `${link.offsetTop}px`;
    p.style.height = `${link.offsetHeight}px`;
    p.style.width = `${w}px`;
    if (animate && wasVisible && !prefersReduced()) {
      p.style.transform = `translateX(${fromX}px) scaleX(${from.width / w})`;
      void p.offsetWidth; // commit the start frame
      p.style.transition = "transform 500ms var(--ease-brand), opacity 300ms var(--ease-brand)";
    } else if (animate && !prefersReduced()) {
      p.style.transform = `translateX(${x}px) scale(0.9)`;
      void p.offsetWidth;
      p.style.transition = "transform 500ms var(--ease-brand), opacity 300ms var(--ease-brand)";
    }
    p.style.transform = `translateX(${x}px)`;
    p.style.opacity = "1";
  };

  const latest = useRef(place);
  latest.current = place;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => place(true), [active]);
  // re-measure without animating when the layout shifts (resize, web font swap)
  useEffect(() => {
    const snap = () => latest.current(false);
    window.addEventListener("resize", snap);
    document.fonts?.ready.then(snap);
    return () => window.removeEventListener("resize", snap);
  }, []);

  return { list, pill };
}

const NO_IDS: string[] = [];

/** The same floating nav on the landing page, onboarding and the brand kit, with a hamburger menu on phones. */
export function Nav() {
  const { pathname } = useLocation();
  // the landing page lives at "/" (and still answers at /welcome)
  const onLanding = pathname === "/" || pathname === "/welcome";
  const uid = useUid();
  const user = useUserDoc(uid);
  const appHref = user ? "/app" : "/onboard";
  const cta = user ? "Open the app" : "Try the live demo";
  const showCta = onLanding || appHref !== pathname; // never a button to the page you're on

  const [open, setOpen] = useState(false);
  // leaving the page closes the menu
  useEffect(() => setOpen(false), [pathname]);
  const active = useActiveSection(onLanding ? NAV_IDS : NO_IDS);
  const { list, pill } = useNavPill(active);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const linkClass = (id: string) => `lp-press relative block rounded-lg px-3 py-2 button-sm ${active === id ? "text-fg" : "text-muted hover:text-fg"}`;

  return (
    <>
      <div className="intro-drop fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
        <nav aria-label="Main" className="flex w-full max-w-[880px] items-center gap-2 rounded-2xl bg-surface/85 p-2 pl-4 ring-1 ring-line backdrop-blur-md">
          {onLanding ? (
            <button type="button" onClick={() => goTo(null)} aria-label="Sampai, back to top" className="mr-auto rounded-lg">
              <Logo size={28} animated />
            </button>
          ) : (
            <Link to="/" aria-label="Sampai home" className="mr-auto rounded-lg">
              <Logo size={28} animated />
            </Link>
          )}
          <ul ref={list} className="relative hidden items-center gap-1 md:flex">
            <span ref={pill} className="nav-pill" aria-hidden />
            {NAV.map((n) => (
              <li key={n.id}>
                {onLanding ? (
                  <Anchor to={n.id} data-nav={n.id} aria-current={active === n.id ? "true" : undefined} className={linkClass(n.id)}>
                    {n.label}
                  </Anchor>
                ) : (
                  <Link to={`/#${n.id}`} data-nav={n.id} className={linkClass(n.id)}>
                    {n.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {showCta && (
            <Link to={appHref} className="lp-press hidden rounded-xl bg-brand px-3 py-2 button-sm text-surface hover:bg-brand-hover sm:block">
              {cta}
            </Link>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
            className="lp-press relative z-[60] flex h-11 w-11 items-center justify-center rounded-xl text-fg hover:bg-sunken md:hidden"
          >
            <span className="flex w-4 flex-col gap-1.5" aria-hidden>
              <span className="menu-line menu-line-a block h-0.5 w-4 rounded-full bg-current" />
              <span className="menu-line menu-line-b block h-0.5 w-4 rounded-full bg-current" />
            </span>
          </button>
        </nav>
      </div>

      <div id="mobile-menu" className={`menu-panel fixed inset-0 z-40 bg-surface/95 backdrop-blur-xl md:hidden ${open ? "open" : ""}`} aria-hidden={!open}>
        <ul className="flex h-full flex-col justify-center gap-2 px-6">
          {NAV.map((n, i) => (
            <li key={n.id} className="menu-link" style={{ transitionDelay: open ? `${i * 60}ms` : "0ms" }}>
              {onLanding ? (
                <Anchor to={n.id} tabIndex={open ? 0 : -1} onGo={() => setOpen(false)} className={`block rounded-lg py-2 heading-4 ${active === n.id ? "text-brand" : "text-fg"}`}>
                  {n.label}
                </Anchor>
              ) : (
                <Link to={`/#${n.id}`} tabIndex={open ? 0 : -1} className="block rounded-lg py-2 heading-4 text-fg">
                  {n.label}
                </Link>
              )}
            </li>
          ))}
          {showCta && (
            <li className="menu-link mt-6" style={{ transitionDelay: open ? `${NAV.length * 60}ms` : "0ms" }}>
              <Link to={appHref} tabIndex={open ? 0 : -1} className="lp-press inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-3 py-2 button-md text-surface">
                {cta} <ArrowRight size={18} />
              </Link>
            </li>
          )}
        </ul>
      </div>
    </>
  );
}
