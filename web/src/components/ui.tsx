import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type AnchorHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { LogoMark } from "./Logo";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "go";
type Size = "md" | "sm" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-surface hover:bg-brand-hover",
  danger: "bg-stop text-surface hover:bg-stop-hover",
  go: "bg-go text-surface hover:brightness-95",
  secondary: "bg-surface text-fg border border-line-strong hover:border-fg/40",
  ghost: "text-muted hover:text-fg hover:bg-sunken",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-11 px-4 text-sm gap-2 rounded-xl",
  lg: "h-14 px-5 text-[15px] gap-2 rounded-2xl",
};

export function btn(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `press inline-flex select-none items-center justify-center font-semibold disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({ variant = "primary", size = "md", loading, icon, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={btn(variant, size, className)}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", icon, children, className = "", ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <a {...rest} className={btn(variant, size, className)}>
      {icon}
      {children}
    </a>
  );
}

type Tone = "neutral" | "go" | "stop" | "warn" | "rain" | "brand";
const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-muted",
  go: "bg-go-soft text-go",
  stop: "bg-stop-soft text-stop",
  warn: "bg-warn-soft text-warn",
  rain: "bg-rain-soft text-rain",
  brand: "bg-brand-soft text-brand",
};

export function Badge({ tone = "neutral", icon, children, className = "" }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return <span className={`inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold ${tones[tone]} ${className}`}>{icon}{children}</span>;
}

export function SimTag({ className = "" }: { className?: string }) {
  return <span className={`inline-flex h-5 items-center rounded px-1.5 text-[10px] font-bold uppercase tracking-wider bg-warn-fill text-fg ${className}`}>Simulated</span>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`text-xs font-semibold uppercase tracking-[0.08em] text-faint ${className}`}>{children}</h2>;
}

export function Segmented<T extends string>({ value, onChange, options, className = "" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div role="radiogroup" className={`flex rounded-xl bg-sunken p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[13px] font-semibold ${value === o.value ? "bg-surface text-fg shadow-[0_1px_2px_oklch(0.23_0.025_285/0.12)]" : "text-muted hover:text-fg"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const control = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[15px] text-fg placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-150 focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)]";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${control} ${p.className ?? ""}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${control} appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%236b6880' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[right_12px_center] bg-no-repeat pr-9 ${p.className ?? ""}`} />;

export function Wordmark({ className = "", animated = false }: { className?: string; animated?: boolean }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-2 text-[20px] font-bold tracking-[-0.03em] text-fg ${className}`}>
      <LogoMark size={24} animated={animated} />
      <span>
        Sampai<span className="text-brand">.</span>
      </span>
    </Link>
  );
}

/** Top bar for the operator surfaces (simulator, admin). Phones get a hamburger; `right` moves into its menu. */
export function OpsBar({ right, badge }: { right?: ReactNode; badge?: ReactNode }) {
  const link = (to: string, label: string) => (
    <NavLink to={to} end className={({ isActive }) => `press rounded-lg px-3 py-1.5 text-[13px] font-semibold ${isActive ? "bg-sunken text-fg" : "text-muted hover:text-fg"}`}>
      {label}
    </NavLink>
  );
  return (
    <header className="sticky top-0 z-[900] flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
      <Wordmark className="mr-3" />
      <nav className="hidden gap-1 md:flex">
        {link("/sim", "Simulator")}
        {link("/admin", "Dashboard")}
        {link("/app", "Student app")}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {badge}
        {right && <div className="hidden items-center gap-2 md:flex">{right}</div>}
        <MobileMenu
          className="-mr-2 md:hidden"
          items={[
            { label: "Simulator", to: "/sim", end: true },
            { label: "Dashboard", to: "/admin", end: true },
            { label: "Student app", to: "/app", end: true },
          ]}
          extra={right}
        />
      </div>
    </header>
  );
}

export type MenuItem = { label: string; to?: string; end?: boolean; onClick?: () => void; icon?: ReactNode; hint?: string };

/**
 * Phone navigation: a hamburger that opens a full-height panel. The panel is portalled to <body>
 * so it sits above sticky headers and Leaflet's map controls.
 */
export function MobileMenu({ items, extra, className = "" }: { items: MenuItem[]; extra?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();

  // close on navigation
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      toggle.current?.focus();
    };
  }, [open]);

  const row = "flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[22px] font-semibold tracking-[-0.01em]";

  return (
    <>
      <button
        ref={toggle}
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="app-menu"
        onClick={() => setOpen(true)}
        className={`press flex h-11 w-11 items-center justify-center rounded-xl text-fg hover:bg-sunken ${className}`}
      >
        <span className="flex w-4 flex-col gap-1.5" aria-hidden>
          <span className="block h-0.5 w-4 rounded-full bg-current" />
          <span className="block h-0.5 w-4 rounded-full bg-current" />
        </span>
      </button>

      {createPortal(
        <div
          id="app-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          aria-hidden={!open}
          className={`menu-panel fixed inset-0 z-[1100] flex flex-col bg-surface/95 backdrop-blur-xl ${open ? "open" : ""}`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)]">
            <Wordmark />
            <button ref={close} type="button" aria-label="Close menu" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} className="press flex h-11 w-11 items-center justify-center rounded-xl text-fg hover:bg-sunken">
              <X size={20} />
            </button>
          </div>
          <nav className="flex flex-1 flex-col justify-center gap-1 overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),24px)]">
            {items.map((it, i) => {
              const style = { transitionDelay: open ? `${i * 60}ms` : "0ms" };
              const inner = (
                <>
                  {it.icon && <span className="text-muted">{it.icon}</span>}
                  <span className="min-w-0 flex-1">
                    {it.label}
                    {it.hint && <span className="mt-0.5 block text-[13px] font-medium tracking-normal text-muted">{it.hint}</span>}
                  </span>
                </>
              );
              if (it.to)
                return (
                  <NavLink key={it.label} to={it.to} end={it.end} tabIndex={open ? 0 : -1} style={style} className={({ isActive }) => `menu-link ${row} ${isActive ? "text-brand" : "text-fg hover:bg-sunken"}`}>
                    {inner}
                  </NavLink>
                );
              if (it.onClick)
                return (
                  <button
                    key={it.label}
                    type="button"
                    tabIndex={open ? 0 : -1}
                    style={style}
                    onClick={() => {
                      it.onClick?.();
                      setOpen(false);
                    }}
                    className={`menu-link ${row} text-fg hover:bg-sunken`}
                  >
                    {inner}
                  </button>
                );
              return (
                <div key={it.label} style={style} className={`menu-link ${row} text-muted`}>
                  {inner}
                </div>
              );
            })}
            {extra && (
              <div className="menu-link mt-6 flex flex-wrap items-center gap-3 border-t border-line px-2 pt-6" style={{ transitionDelay: open ? `${items.length * 60}ms` : "0ms" }}>
                {extra}
              </div>
            )}
          </nav>
        </div>,
        document.body,
      )}
    </>
  );
}
