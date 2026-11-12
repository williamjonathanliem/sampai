import { useState, type CSSProperties } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { doc, setDoc } from "firebase/firestore";
import { ChevronRight, Loader2 } from "lucide-react";
import { db } from "../lib/firebase";
import { useUid } from "../lib/hooks";
import config from "../../../data/config.json";
import { routeFromLegs } from "../../../shared/network";
import type { RouteLeg } from "../../../shared/types";
import { Badge, Segmented, SimTag } from "../components/ui";
import ProfileForm from "../components/ProfileForm";
import { LiveNow } from "../components/LiveNow";
import { Nav } from "../components/SiteNav";

export default function Onboard() {
  const uid = useUid();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"pick" | "custom">(params.get("setup") ? "custom" : "pick");
  const [saving, setSaving] = useState<string | null>(null);

  async function pickProfile(p: (typeof config.demoProfiles)[number]) {
    if (!uid) return;
    setSaving(p.id);
    await setDoc(doc(db, "users", uid), {
      displayName: p.displayName,
      lang: p.lang,
      homeLocation: p.homeLocation,
      route: routeFromLegs(p.route.legs as RouteLeg[]),
      classes: p.classes,
      profileId: p.id,
      intake: null,
      simulated: true,
      updatedAt: Date.now(),
    });
    nav("/app");
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-[calc(max(1rem,env(safe-area-inset-top))+5.5rem)] lg:grid lg:max-w-6xl lg:grid-cols-[1fr_minmax(0,480px)] lg:items-start lg:gap-20 lg:px-10 lg:pt-32">
      <Nav />
      <div className="lg:sticky lg:top-28">
        <h1 style={{ "--d": "120ms" } as CSSProperties} className="intro mt-2 text-[28px] font-bold leading-[1.15] tracking-[-0.02em] lg:mt-8 lg:max-w-[16ch] lg:text-[44px] lg:leading-[1.08]">Get to class, or get proof why you didn't.</h1>
        <p style={{ "--d": "220ms" } as CSSProperties} className="intro mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted lg:mt-5 lg:text-[17px]">Pick a demo student or set up your own commute. This is what Sampai can see right now.</p>
        <LiveNow style={{ "--d": "320ms" } as CSSProperties} className="intro mt-10 hidden max-w-[52ch] lg:block" />
      </div>

      <div style={{ "--d": "260ms" } as CSSProperties} className="intro-pop mt-8 lg:mt-0 lg:rounded-3xl lg:border lg:border-line lg:bg-surface lg:p-8">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "pick", label: "Try a demo student" },
            { value: "custom", label: "Set up my profile" },
          ]}
        />

        {mode === "pick" && <p className="mt-4 text-[13px] text-muted">Picking a demo student replaces the profile on this device.</p>}
        {mode === "pick" ? (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface lg:-mx-8 lg:rounded-none lg:border-x-0 lg:bg-transparent">
            {config.demoProfiles.map((p, i) => (
              <li key={p.id} className="intro" style={{ "--d": `${420 + i * 60}ms` } as CSSProperties}>
                <button disabled={!uid || !!saving} onClick={() => pickProfile(p)} className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-sunken/60 disabled:opacity-60 lg:px-8">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-soft text-[17px] font-bold text-brand">{p.displayName[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="whitespace-nowrap font-semibold">{p.displayName}</span>
                      <SimTag />
                      {"late" in p && p.late && <Badge tone="stop">Running late</Badge>}
                      <span className="text-xs text-muted">{p.lang === "ms" ? "Bahasa Melayu" : "English"}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-muted">{p.blurb}</span>
                  </span>
                  {saving === p.id ? <Loader2 size={18} className="animate-spin text-muted" /> : <ChevronRight size={18} className="text-faint" />}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6">
            <ProfileForm uid={uid} onSaved={() => nav("/app")} />
          </div>
        )}
      </div>
    </div>
  );
}
