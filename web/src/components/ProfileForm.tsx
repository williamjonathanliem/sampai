import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMapEvents, useMap } from "react-leaflet";
import { doc, setDoc } from "firebase/firestore";
import { CircleCheck, LocateFixed, MapPin, Loader2, RefreshCw, X } from "lucide-react";
import { db } from "../lib/firebase";
import AddressSearch from "./AddressSearch";
import RouteOptionsList, { legsKey, type RouteOption } from "./RouteOptions";
import { api } from "../lib/api";
import { loadRecent, rememberProfile } from "../lib/recent";
import { lines, routeFromLegs, APU } from "../../../shared/network";
import type { UserDoc } from "../../../shared/types";
import { Button, Eyebrow, Field, Input, Segmented, Select } from "./ui";
import { C, TripPath, FitTo, boundsForPieces } from "./MapView";

type LatLon = { lat: number; lon: number };

function Picker({ home, onPick }: { home: LatLon | null; onPick: (p: LatLon) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) }) });
  const map = useMap();
  useEffect(() => {
    if (home) map.setView([home.lat, home.lon], Math.max(map.getZoom(), 14), { animate: true });
  }, [home?.lat, home?.lon]);
  return null;
}

export default function ProfileForm({ uid, initial, onSaved, wide = false }: { uid: string | null; initial?: UserDoc | null; onSaved: () => void; wide?: boolean }) {
  // values used before on this device: prefill an empty profile, offer the rest as one-tap chips
  const [recent] = useState(loadRecent);
  const own = initial && !initial.simulated ? initial : null;
  const [name, setName] = useState(own ? own.displayName ?? "" : recent.name ?? "");
  // profiles saved before "recent" existed: remember them now, so Start over keeps them
  useEffect(() => {
    if (own) rememberProfile({ name: own.displayName ?? undefined, lang: own.lang, intake: own.intake, group: own.group, home: own.homeLocation ?? null });
  }, [own?.intake, own?.homeLocation?.lat]);
  // a demo student's language shouldn't carry over into your own profile
  const [lang, setLang] = useState<"en" | "ms">(own ? own.lang : recent.lang ?? "en");
  const [intake, setIntake] = useState(own?.intake ?? (initial ? initial.intake ?? "" : recent.intakes[0]?.intake ?? ""));
  const [intakes, setIntakes] = useState<string[]>([]);
  const [intakeInfo, setIntakeInfo] = useState<any>(null);
  const [group, setGroup] = useState<string>(own ? own.group ?? "" : !initial ? recent.intakes[0]?.group ?? "" : "");
  const [checking, setChecking] = useState(false);
  const [home, setHome] = useState<LatLon | null>(initial?.homeLocation && !initial.simulated ? { lat: initial.homeLocation.lat, lon: initial.homeLocation.lon } : null);
  const [homeLabel, setHomeLabel] = useState(initial && !initial.simulated ? initial.homeLocation?.label ?? "" : "");
  // route options computed from home (like a maps app); the student picks one
  const [options, setOptions] = useState<RouteOption[] | null>(null);
  const [forClass, setForClass] = useState<{ title: string; date: string; start: string } | null>(null);
  const [optLoading, setOptLoading] = useState(false);
  const [optErr, setOptErr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [board, setBoard] = useState("");
  const [retry, setRetry] = useState(0);
  const savedKey = initial && !initial.simulated && initial.route ? legsKey(initial.route.legs) : null;
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState("");
  // label typed by the student wins; otherwise fill it from the place name
  // only a label typed during this visit is kept when the pin moves; a saved label follows the pin
  const [labelTouched, setLabelTouched] = useState(false);

  function placeHome(p: LatLon, label?: string) {
    setHome(p);
    if (labelTouched) return;
    if (label) return setHomeLabel(label);
    api<{ label: string } | null>(`/geo/reverse?lat=${p.lat}&lon=${p.lon}`)
      .then((r) => r?.label && setHomeLabel(r.label))
      .catch(() => null);
  }
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // intake lookup (APSpace)
  useEffect(() => {
    if (intake.length < 3) return setIntakes([]);
    const t = setTimeout(() => api<string[]>(`/apu/intakes?q=${encodeURIComponent(intake)}`).then(setIntakes).catch(() => null), 250);
    return () => clearTimeout(t);
  }, [intake]);
  useEffect(() => {
    if (!intakes.includes(intake.toUpperCase())) return setIntakeInfo(null);
    setChecking(true);
    api(`/apu/timetable?intake=${encodeURIComponent(intake)}${group ? `&group=${encodeURIComponent(group)}` : ""}`)
      .then((r) => {
        setIntakeInfo(r);
        // one group only: pick it; a group that isn't in this intake: clear it
        if (r.groups?.length === 1) setGroup(r.groups[0].group);
        else if (group && !r.groups?.some((g: any) => g.group === group)) setGroup("");
      })
      .catch(() => setIntakeInfo(null))
      .finally(() => setChecking(false));
  }, [intake, intakes, group]);

  // fetch options whenever home, intake/group or a forced station changes
  useEffect(() => {
    if (!home) return setOptions(null);
    let alive = true;
    setOptLoading(true);
    setOptErr("");
    const t = setTimeout(() => {
      const q = new URLSearchParams({ lat: String(home.lat), lon: String(home.lon) });
      if (intakeInfo && !intakeInfo.needsGroup) q.set("intake", intake.toUpperCase());
      if (group) q.set("group", group);
      if (board) q.set("board", board);
      api<{ forClass: any; options: RouteOption[] }>(`/route/options?${q}`)
        .then((r) => {
          if (!alive) return;
          setOptions(r.options);
          setForClass(r.forClass);
          setSelected((cur) => {
            if (cur && r.options.some((o) => o.id === cur)) return cur;
            const saved = savedKey ? r.options.find((o) => legsKey(o.legs) === savedKey) : null;
            return saved?.id ?? r.options[0]?.id ?? null;
          });
        })
        .catch((e) => alive && setOptErr(`Couldn't work out routes: ${e.message}`))
        .finally(() => alive && setOptLoading(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [home?.lat, home?.lon, intakeInfo?.intake, intakeInfo?.needsGroup, group, board, retry]);

  /** A remembered home; the api snaps it to a corrected pin if the place has one (data/local_rules.json). */
  function useRecentHome(h: { label: string; lat: number; lon: number }) {
    placeHome({ lat: h.lat, lon: h.lon }, h.label);
    api<{ label: string; lat: number; lon: number } | null>(`/geo/reverse?lat=${h.lat}&lon=${h.lon}`)
      .then((r) => r && r.label === h.label && (r.lat !== h.lat || r.lon !== h.lon) && setHome({ lat: r.lat, lon: r.lon }))
      .catch(() => null);
  }

  function clearHome() {
    setHome(null);
    setHomeLabel("");
    setLabelTouched(false);
    setSelected(null);
    setBoard("");
    setLocErr("");
  }

  const chosen = options?.find((o) => o.id === selected) ?? null;

  function useMyLocation() {
    setLocErr("");
    if (!navigator.geolocation) return setLocErr("Location isn't available in this browser. Tap the map instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        if (p.coords.accuracy > 1000) {
          setLocErr(`Your browser only knows your location to about ${Math.round(p.coords.accuracy / 1000)} km (common on laptops). Search for your home instead.`);
          return;
        }
        placeHome({ lat: +p.coords.latitude.toFixed(5), lon: +p.coords.longitude.toFixed(5) });
        if (p.coords.accuracy > 150) setLocErr(`Location is approximate (±${Math.round(p.coords.accuracy)} m). Check the pin, or search for your home.`);
      },
      () => {
        setLocErr("Couldn't get your location. Tap the map to set home instead.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }


  async function save() {
    if (!uid) return;
    setSaving(true);
    if (!chosen || !home) {
      setSaving(false);
      return setSaveErr("Set your home and pick a route first.");
    }
    const legs = chosen.legs;
    const u: UserDoc = {
      displayName: name.trim() || "Student",
      lang,
      intake: intake.trim().length >= 6 ? intake.trim().toUpperCase() : null,
      group: group || null,
      homeLocation: { lat: home.lat, lon: home.lon, label: homeLabel.trim() || "Home" },
      route: { ...routeFromLegs(legs), pathJson: JSON.stringify(chosen.path), title: chosen.title },
      classes: [],
      simulated: false,
      ...(own?.autoShare ? { autoShare: true } : {}),
    };
    try {
      await setDoc(doc(db, "users", uid), { ...u, fcmTokens: initial?.fcmTokens ?? [], updatedAt: Date.now() });
      rememberProfile({ name: u.displayName, lang: u.lang, intake: u.intake, group: u.group, home: u.homeLocation });
      onSaved();
    } catch (e: any) {
      setSaveErr(`Couldn't save: ${e.message}. Check the app is connected and try again.`);
    } finally {
      setSaving(false);
    }
  }

  const intakeKnown = intakes.includes(intake.toUpperCase());
  return (
    <div className={wide ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:gap-14" : "space-y-8"}>
      <section className="space-y-5">
        <Eyebrow>About you</Eyebrow>
        <Field label="Nickname" hint="Optional. No student ID or email needed.">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aina" autoComplete="nickname" />
        </Field>
        <Field
          label="APU intake code"
          hint={
            checking ? (
              "Looking up your timetable…"
            ) : intakeInfo ? (
              intakeInfo.needsGroup ? (
                "Found your intake. Pick your tutorial group below."
              ) : (
                <span className="flex items-start gap-1.5 text-go">
                  <CircleCheck size={14} className="mt-px shrink-0" />
                  <span>{intakeInfo.next ? `Next on campus: ${intakeInfo.next.module}, ${intakeInfo.next.date} at ${intakeInfo.next.start} in ${intakeInfo.next.room}` : "Found your intake. No on-campus class this week."}</span>
                </span>
              )
            ) : intake.length >= 6 && !intakeKnown ? (
              "Not in this week's APSpace timetable. You can still save."
            ) : (
              "Pulls your classes and lecturers from APSpace, e.g. APD2F2609SE"
            )
          }
        >
          <Input value={intake} onChange={(e) => setIntake(e.target.value.toUpperCase().replace(/\s/g, ""))} list="intakes" placeholder="APD2F2609SE" className="uppercase tracking-wide" autoCapitalize="characters" spellCheck={false} />
          {recent.intakes.some((r) => r.intake !== intake.toUpperCase()) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted">Recent:</span>
              {recent.intakes
                .filter((r) => r.intake !== intake.toUpperCase())
                .map((r) => (
                  <button key={r.intake} type="button" onClick={() => (setIntake(r.intake), setGroup(r.group ?? ""))} className="press h-7 rounded-full bg-sunken px-2.5 text-xs font-semibold tracking-wide hover:bg-line">
                    {r.intake}
                    {r.group ? ` ${r.group}` : ""}
                  </button>
                ))}
            </div>
          )}
          <datalist id="intakes">
            {intakes.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
        {intakeInfo?.groups?.length > 1 && (
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold">Tutorial group</span>
            <div role="radiogroup" aria-label="Tutorial group" className="grid gap-2 sm:grid-cols-2">
              {intakeInfo.groups.map((g: { group: string; example: string | null }) => (
                <button
                  key={g.group}
                  role="radio"
                  aria-checked={group === g.group}
                  onClick={() => setGroup(g.group)}
                  className={`press rounded-xl border px-3.5 py-3 text-left transition-colors ${group === g.group ? "border-brand bg-brand-soft/60" : "border-line-strong bg-surface hover:border-fg/30"}`}
                >
                  <span className="block font-semibold">{g.group}</span>
                  {g.example && <span className="mt-0.5 block text-xs leading-snug text-muted">Only {g.group} has: {g.example}</span>}
                </button>
              ))}
            </div>
            <span className="mt-1.5 block text-xs text-muted">APSpace lists every group's classes for your intake. Pick the one on your APSpace timetable.</span>
          </div>
        )}
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Alert language</span>
          <Segmented value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "ms", label: "Bahasa Melayu" }]} />
        </div>
      </section>

      <div className="min-w-0 space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <Eyebrow>Home</Eyebrow>
            <p className="mt-1 text-[13px] text-muted">Search for your home, or tap the map. Used only to work out your walk to the station.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {home && (
              <Button variant="ghost" size="sm" className="whitespace-nowrap" onClick={clearHome} icon={<X size={15} />}>
                Clear home
              </Button>
            )}
            <Button variant="secondary" size="sm" className="whitespace-nowrap" loading={locating} onClick={useMyLocation} icon={<LocateFixed size={15} />}>
              Use my location
            </Button>
          </div>
        </div>
        <AddressSearch onSelect={(p) => placeHome({ lat: p.lat, lon: p.lon }, p.label)} />
        {recent.homes.some((h) => !home || Math.abs(h.lat - home.lat) > 1e-4 || Math.abs(h.lon - home.lon) > 1e-4) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Recent:</span>
            {recent.homes
              .filter((h) => !home || Math.abs(h.lat - home.lat) > 1e-4 || Math.abs(h.lon - home.lon) > 1e-4)
              .map((h) => (
                <button key={`${h.lat},${h.lon}`} type="button" onClick={() => useRecentHome(h)} className="press flex h-7 items-center gap-1 rounded-full bg-sunken px-2.5 text-xs font-semibold hover:bg-line">
                  <MapPin size={12} className="text-brand" />
                  {h.label}
                </button>
              ))}
          </div>
        )}
        <div className="relative h-64 overflow-hidden rounded-2xl border border-line">
          <MapContainer center={home ? [home.lat, home.lon] : [3.075, 101.67]} zoom={home ? 14 : 12} zoomControl={false} className="h-full w-full">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" attribution="Esri, HERE, Garmin, OSM" maxZoom={16} />
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} opacity={0.7} />
            <Picker home={home} onPick={(p) => placeHome(p)} />
            {chosen && <TripPath pieces={chosen.path} />}
            {chosen && <FitTo bounds={boundsForPieces(chosen.path, home ? [home] : [])} />}
            {lines.map((l) => (
              <Polyline key={l.lineId} positions={l.geometry.coordinates.map(([x, y]) => [y, x] as [number, number])} pathOptions={{ color: l.color, weight: 3, opacity: 0.7 }} />
            ))}
            <CircleMarker center={[APU.lat, APU.lon]} radius={7} pathOptions={{ color: C.surface, weight: 3, fillColor: C.fg, fillOpacity: 1 }}>
              <Tooltip direction="right" offset={[8, 0]} permanent>APU</Tooltip>
            </CircleMarker>
            {home && (
              <CircleMarker center={[home.lat, home.lon]} radius={9} pathOptions={{ color: C.surface, weight: 3, fillColor: C.brand, fillOpacity: 1 }}>
                <Tooltip direction="top" offset={[0, -8]} permanent>Home</Tooltip>
              </CircleMarker>
            )}
          </MapContainer>
          {!home && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] mx-auto flex w-max items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold ring-1 ring-line">
              <MapPin size={14} className="text-brand" /> Tap to set home
            </div>
          )}
        </div>
        {locErr && <p className="text-[13px] text-stop">{locErr}</p>}
        {home && (
          <Field label="Home label" hint="Shown only to you.">
            <Input value={homeLabel} onChange={(e) => (setHomeLabel(e.target.value), setLabelTouched(true))} placeholder="e.g. Taman Sri Endah" />
          </Field>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <Eyebrow>How you&apos;ll get to APU</Eyebrow>
            <p className="mt-1 text-[13px] text-muted">
              {!home
                ? "Set your home to see your options."
                : forClass
                  ? `Timed for your next class: ${forClass.title}, ${forClass.date} at ${forClass.start}.`
                  : "Timed for leaving now. Add your intake to time it for your next class."}
            </p>
          </div>
          {optLoading ? (
            <Loader2 size={18} className="mb-0.5 shrink-0 animate-spin text-muted" />
          ) : (
            home && (
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setRetry((n) => n + 1)} icon={<RefreshCw size={15} />}>
                Refresh
              </Button>
            )
          )}
        </div>
        {optErr && (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-stop">
            {optErr}
            <button onClick={() => setRetry((n) => n + 1)} className="font-semibold text-brand">
              Try again
            </button>
          </p>
        )}
        {options && selected && <p className="text-xs text-muted">Tap the chosen route again to unselect it.</p>}
        {home && !options && optLoading && (
          <div className="space-y-2.5" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-sunken" />
            ))}
          </div>
        )}
        {options && <RouteOptionsList options={options} selected={selected} onSelect={(id) => setSelected((cur) => (cur === id ? null : id))} />}
        {options && (
          <details className="text-[13px]">
            <summary className="cursor-pointer select-none font-semibold text-brand">Board at a different station</summary>
            <div className="mt-2">
              <Select value={board} onChange={(e) => setBoard(e.target.value)} aria-label="Board at a different station">
                <option value="">Nearest stations (automatic)</option>
                {lines.map((l) => (
                  <optgroup key={l.lineId} label={l.name}>
                    {l.stations.map((st) => (
                      <option key={st.stopId} value={st.stopId}>
                        {st.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </div>
          </details>
        )}
      </section>
      </div>

      {chosen && (
        <div className={`rounded-2xl bg-sunken px-4 py-3 text-[13px] ${wide ? "lg:col-span-2" : ""}`}>
          <span className="font-semibold">Sampai will watch: </span>
          <span className="text-muted">
            {chosen.title}, about {chosen.totalMin} min door to door.
            {chosen.kind === "train" ? " You get an alert if this line stalls before your class." : chosen.kind === "shuttle" ? " You get weather and traffic heads-ups." : ""}
          </span>
        </div>
      )}
      <Button size="lg" className={`w-full ${wide ? "lg:col-span-2 lg:ml-auto lg:w-72" : ""}`} disabled={!uid || !chosen} loading={saving} onClick={save}>
        Save profile
      </Button>
      {saveErr && <p className={`text-[13px] text-stop ${wide ? "lg:col-span-2 lg:text-right" : ""}`}>{saveErr}</p>}
    </div>
  );
}
