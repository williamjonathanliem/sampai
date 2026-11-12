import { useEffect, useId, useRef, useState } from "react";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { api } from "../lib/api";

export interface Place {
  label: string;
  sub: string;
  lat: number;
  lon: number;
}

/** Type-ahead address search (combobox). Results come from the api's /geo/search proxy. */
export default function AddressSearch({ onSelect, placeholder = "Search your home, condo or taman" }: { onSelect: (p: Place) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const reqN = useRef(0);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      setErr("");
      return;
    }
    const n = ++reqN.current;
    setLoading(true);
    const t = setTimeout(() => {
      api<Place[]>(`/geo/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          if (n !== reqN.current) return;
          setResults(r);
          setErr(r.length ? "" : "No matches in the Klang Valley. Try a taman, condo or street name.");
          setActive(r.length ? 0 : -1);
        })
        .catch(() => n === reqN.current && setErr("Search isn't reachable right now. Tap the map instead."))
        .finally(() => n === reqN.current && setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const off = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);

  function choose(p: Place) {
    onSelect(p);
    setQ(p.label);
    setOpen(false);
  }

  const show = open && q.trim().length >= 3;

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          value={q}
          onChange={(e) => (setQ(e.target.value), setOpen(true))}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!show || !results.length) return;
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => (a + 1) % results.length));
            else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => (a - 1 + results.length) % results.length));
            else if (e.key === "Enter" && active >= 0) (e.preventDefault(), choose(results[active]));
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          autoComplete="street-address"
          className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-10 text-[15px] text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-faint focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)]"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {loading ? (
            <Loader2 size={16} className="animate-spin text-faint" />
          ) : q ? (
            <button aria-label="Clear search" onClick={() => (setQ(""), setResults([]))} className="grid h-6 w-6 place-items-center rounded-md text-faint hover:text-fg">
              <X size={15} />
            </button>
          ) : null}
        </span>
      </div>

      {show && (results.length > 0 || err) && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-[1000] mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-[0_12px_32px_oklch(0.23_0.025_285/0.14)]">
          {results.map((p, i) => (
            <li
              key={`${p.label}-${p.lat}-${p.lon}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => (e.preventDefault(), choose(p))}
              className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 ${i === active ? "bg-sunken" : ""}`}
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{p.label}</span>
                {p.sub && <span className="block truncate text-xs text-muted">{p.sub}</span>}
              </span>
            </li>
          ))}
          {err && !results.length && <li className="px-3.5 py-3 text-[13px] text-muted">{err}</li>}
          {results.length > 0 && <li className="border-t border-line px-3.5 pb-1 pt-2 text-[10px] text-faint">Search © OpenStreetMap contributors</li>}
        </ul>
      )}
    </div>
  );
}
