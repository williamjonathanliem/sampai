import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Loader2, RefreshCw, X } from "lucide-react";
import { db } from "../lib/firebase";
import { api } from "../lib/api";
import RouteOptionsList, { legsKey, type RouteOption } from "./RouteOptions";
import { routeFromLegs } from "../../../shared/network";
import type { UserDoc } from "../../../shared/types";
import { Button } from "./ui";

/**
 * Change only the route, in place on the home screen: same options as the profile, timed for the
 * next class. The option you tap is previewed on the map behind; saving writes just `route`.
 */
export default function RoutePicker({ uid, user, onPreview, onClose }: { uid: string; user: UserDoc; onPreview: (o: RouteOption | null) => void; onClose: () => void }) {
  const [options, setOptions] = useState<RouteOption[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const current = user.route ? legsKey(user.route.legs) : null;

  useEffect(() => {
    if (!user.homeLocation) return;
    let alive = true;
    setLoading(true);
    setErr("");
    const q = new URLSearchParams({ lat: String(user.homeLocation.lat), lon: String(user.homeLocation.lon) });
    if (user.intake) q.set("intake", user.intake);
    if (user.group) q.set("group", user.group);
    api<{ options: RouteOption[] }>(`/route/options?${q}`)
      .then((r) => {
        if (!alive) return;
        setOptions(r.options);
        const mine = current ? r.options.find((o) => legsKey(o.legs) === current) : null;
        setSelected((cur) => (cur && r.options.some((o) => o.id === cur) ? cur : mine?.id ?? r.options[0]?.id ?? null));
      })
      .catch((e) => alive && setErr(`Couldn't work out routes: ${e.message}`))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user.homeLocation?.lat, user.homeLocation?.lon, user.intake, user.group, retry]);

  const chosen = options?.find((o) => o.id === selected) ?? null;
  useEffect(() => onPreview(chosen), [chosen?.id]);
  useEffect(() => () => onPreview(null), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const unchanged = !!chosen && legsKey(chosen.legs) === current;

  async function save() {
    if (!chosen) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", uid), { route: { ...routeFromLegs(chosen.legs), pathJson: JSON.stringify(chosen.path), title: chosen.title }, updatedAt: Date.now() });
      onClose();
    } catch (e: any) {
      setErr(`Couldn't save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center lg:items-stretch lg:justify-start" role="dialog" aria-modal="true" aria-label="Change your route">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-fg/25 lg:bg-transparent" />
      <div className="enter relative flex max-h-[82vh] w-full max-w-md flex-col rounded-t-3xl bg-bg shadow-[0_-8px_30px_oklch(0.23_0.025_285/0.15)] lg:max-h-none lg:w-[440px] lg:max-w-none lg:rounded-none lg:border-r lg:border-line">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold">Change your route</div>
            <div className="truncate text-xs text-muted">From {user.homeLocation?.label ?? "home"}. Tap one to see it on the map.</div>
          </div>
          {loading ? (
            <Loader2 size={18} className="animate-spin text-muted" />
          ) : (
            <button onClick={() => setRetry((n) => n + 1)} aria-label="Refresh routes" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-fg">
              <RefreshCw size={16} />
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-fg">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {err && (
            <p className="mb-3 text-[13px] text-stop">
              {err}{" "}
              <button onClick={() => setRetry((n) => n + 1)} className="font-semibold text-brand">
                Try again
              </button>
            </p>
          )}
          {!options && loading && (
            <div className="space-y-2.5" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-sunken" />
              ))}
            </div>
          )}
          {options && <RouteOptionsList options={options} selected={selected} onSelect={setSelected} />}
        </div>
        <div className="flex gap-2 border-t border-line px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" disabled={!chosen || unchanged} loading={saving} onClick={save}>
            {unchanged ? "This is your route" : "Use this route"}
          </Button>
        </div>
      </div>
    </div>
  );
}
