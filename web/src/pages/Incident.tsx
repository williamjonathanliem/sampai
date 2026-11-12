import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import MapView from "../components/MapView";
import { useIncident } from "../lib/hooks";
import { fmtMyt } from "../../../shared/time";
import type { LatLngBoundsExpression } from "leaflet";
import { Badge, SimTag, Wordmark } from "../components/ui";

/** Public verification page a lecturer reaches from the QR code on a delay letter. */
export default function IncidentPage() {
  const { id } = useParams();
  const inc = useIncident(id);
  const fit = useMemo<LatLngBoundsExpression | null>(() => {
    const c = inc?.geometry?.coordinates;
    if (!c?.length) return null;
    const lats = c.map((p) => p[1]);
    const lons = c.map((p) => p[0]);
    return [
      [Math.min(...lats) - 0.004, Math.min(...lons) - 0.004],
      [Math.max(...lats) + 0.004, Math.max(...lons) + 0.004],
    ];
  }, [inc?.geometry]);

  if (inc === undefined)
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-5 pt-16" aria-busy="true">
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-sunken" />
        <div className="h-64 animate-pulse rounded-2xl bg-sunken" />
      </div>
    );
  if (inc === null)
    return (
      <div className="mx-auto max-w-2xl px-5 pt-16">
        <Wordmark />
        <h1 className="mt-8 text-xl font-bold">No incident with reference {id}</h1>
        <p className="mt-2 text-muted">Check the reference printed on the letter. If it was copied by hand, a single wrong character is enough.</p>
      </div>
    );

  const dur = Math.round(((inc.clearedAt ?? Date.now()) - inc.startedAt) / 60000);
  const rows: [string, string][] = [
    ["Where", inc.type === "train_stall" ? `${inc.lineName}, between ${inc.fromName} and ${inc.toName}` : inc.routeId ? `Rapid KL bus route ${inc.routeId}` : "Klang Valley"],
    ["Started", fmtMyt(inc.startedAt, true)],
    ["Ended", inc.clearedAt ? fmtMyt(inc.clearedAt, true) : "Still ongoing"],
    ["Duration", `${dur} min`],
    ["Detected by", inc.source === "riders" ? `${inc.riderCount} anonymous Sampai riders on the same stretch` : inc.source === "gtfs-r" ? "Rapid KL live bus GPS" : inc.source === "met" ? "MET Malaysia warning" : "Manual report"],
    ["Confidence", inc.confidence[0].toUpperCase() + inc.confidence.slice(1)],
    ["Weather at start", inc.weatherAtStart ? `Feels ${inc.weatherAtStart.apparentTemp ?? "–"}°C, rain ${inc.weatherAtStart.rainProb ?? "–"}%${inc.weatherAtStart.metWarning ? ", MET warning active" : ""}` : "Not recorded"],
    ["Official status", inc.officialNote ?? "Not yet published by the operator. See myrapid.com.my."],
  ];

  return (
    <div className="mx-auto max-w-2xl px-5 pb-16 pt-[max(env(safe-area-inset-top),18px)]">
      <div className="flex items-center justify-between">
        <Wordmark />
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
          <ShieldCheck size={16} /> Incident record
        </span>
      </div>

      {inc.simulated && (
        <div className="mt-6 flex items-center gap-2 rounded-xl bg-warn-soft px-4 py-3 text-[14px] font-medium text-warn">
          <SimTag /> Created in the simulator for a demo. Not a real disruption.
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Badge tone={inc.status === "active" ? "stop" : "go"}>{inc.status === "active" ? "Ongoing" : "Resolved"}</Badge>
        <span className="tnum text-[13px] text-muted">Ref {inc.id}</span>
      </div>
      <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-[-0.02em] text-balance">{inc.title}</h1>
      {inc.summary && <p className="mt-2 max-w-[65ch] text-[15px] text-muted">{inc.summary}</p>}

      <div className="mt-6 h-64 overflow-hidden rounded-2xl border border-line">
        <MapView incidents={[{ ...inc, status: "active" }]} fit={fit} showStations={inc.lineId ? [inc.lineId] : []} center={inc.center ? [inc.center.lat, inc.center.lon] : undefined} zoom={14} showApuLabel={false} />
      </div>

      <dl className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map(([k, v]) => (
          <div key={k} className="grid gap-1 px-5 py-3.5 sm:grid-cols-[170px_1fr] sm:gap-4">
            <dt className="text-[13px] font-medium text-muted">{k}</dt>
            <dd className="tnum text-[15px]">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 max-w-[65ch] text-[13px] leading-relaxed text-muted">
        Sampai detects a disruption when several riders' phones stop moving between two stations at the same time. Locations are shared anonymously and only while a rider is on board. Sources: Prasarana GTFS via data.gov.my, MET Malaysia, Open-Meteo (CC BY 4.0).
      </p>
    </div>
  );
}
