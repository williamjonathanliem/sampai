import type { ButtonHTMLAttributes, ReactNode, AnchorHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { Link, NavLink } from "react-router-dom";
import { Loader2 } from "lucide-react";
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

/** Top bar for the operator surfaces (simulator, admin). */
export function OpsBar({ right }: { right?: ReactNode }) {
  const link = (to: string, label: string) => (
    <NavLink to={to} end className={({ isActive }) => `press rounded-lg px-3 py-1.5 text-[13px] font-semibold ${isActive ? "bg-sunken text-fg" : "text-muted hover:text-fg"}`}>
      {label}
    </NavLink>
  );
  return (
    <header className="sticky top-0 z-[900] flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
      <Wordmark className="mr-3" />
      <nav className="flex gap-1">
        {link("/sim", "Simulator")}
        {link("/admin", "Dashboard")}
        {link("/", "Student app")}
      </nav>
      <div className="ml-auto flex items-center gap-2">{right}</div>
    </header>
  );
}
