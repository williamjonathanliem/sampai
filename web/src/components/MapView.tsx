import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import type { LatLngExpression, LatLngBoundsExpression } from "leaflet";
import { lines, segmentById, APU } from "../../../shared/network";
import type { Incident } from "../../../shared/types";
import type { LiveBus } from "../lib/hooks";
import walks from "../../../data/walks/bj-covered.geojson?raw";

// Leaflet writes SVG attributes, so these mirror the OKLCH tokens in index.css as hex.
export const C = { brand: "#5b3fc2", stop: "#c4363b", go: "#2e8a5c", rain: "#2f6cb3", warn: "#d9a521", fg: "#26223a", surface: "#fdfcff", muted: "#7a7690" };

const walkFeatures = JSON.parse(walks).features as { properties: any; geometry: { coordinates: number[][] } }[];
const ll = (c: number[][]): LatLngExpression[] => c.map(([x, y]) => [y, x]);

export interface Rider {
  id: string;
  lat: number;
  lon: number;
  stalled?: boolean;
  real?: boolean;
}

interface Props {
  center?: [number, number];
  zoom?: number;
  routeSegments?: string[];
  incidents?: Incident[];
  buses?: LiveBus[];
  riders?: Rider[];
  me?: { lat: number; lon: number } | null;
  walk?: "bj-covered" | "bj-direct" | null;
  showStations?: string[];
  fit?: LatLngBoundsExpression | null;
  className?: string;
  interactive?: boolean;
  showApuLabel?: boolean;
  /** a non-rail trip (home → pick-up → campus), drawn dashed */
  tripPath?: { lat: number; lon: number }[] | null;
  home?: { lat: number; lon: number } | null;
}

/** Keeps the map sized to its container and the bounds in view, also after layout changes. */
function Fit({ bounds }: { bounds?: LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    const apply = () => {
      map.invalidateSize();
      if (bounds) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    };
    const t = setTimeout(apply, 60);
    const ro = new ResizeObserver(() => apply());
    ro.observe(map.getContainer());
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [JSON.stringify(bounds)]);
  return null;
}

export default function MapView({ center = [3.0605, 101.685], zoom = 13, routeSegments = [], incidents = [], buses = [], riders = [], me, walk, showStations = ["PH"], fit, className = "", interactive = true, showApuLabel = true, tripPath, home }: Props) {
  const routeSet = useMemo(() => new Set(routeSegments), [routeSegments.join(",")]);
  const routeLines = routeSegments.map((id) => segmentById.get(id)).filter(Boolean);
  const routeStops = new Set(routeLines.flatMap((s) => [s!.fromStop, s!.toStop]));

  return (
    <MapContainer center={center} zoom={zoom} zoomControl={false} attributionControl className={`h-full w-full ${className}`} dragging={interactive} scrollWheelZoom={interactive} doubleClickZoom={interactive} touchZoom={interactive}>
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" attribution="Esri, HERE, Garmin, OSM · Rail: Prasarana via data.gov.my" maxZoom={16} />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}" maxZoom={16} opacity={0.7} />
      <Fit bounds={fit} />

      {lines.map((l) => (
        <Polyline key={l.lineId} positions={ll(l.geometry.coordinates)} pathOptions={{ color: l.color, weight: 3, opacity: routeSet.size ? 0.4 : 0.85 }} />
      ))}

      {/* the student's route, with a light casing so it reads over any line */}
      {routeLines.map((s) => (
        <Polyline key={`${s!.segmentId}-case`} positions={ll(s!.geometry.coordinates)} pathOptions={{ color: C.surface, weight: 10, opacity: 1 }} />
      ))}
      {routeLines.map((s) => (
        <Polyline key={s!.segmentId} positions={ll(s!.geometry.coordinates)} pathOptions={{ color: C.brand, weight: 6, opacity: 1 }} />
      ))}

      {walk &&
        walkFeatures
          .filter((f) => f.properties.walkId === walk)
          .map((f) => (
            <Polyline key={f.properties.walkId} positions={ll(f.geometry.coordinates)} pathOptions={{ color: f.properties.covered ? C.rain : C.warn, weight: 5, dashArray: "1 9", lineCap: "round" }}>
              <Tooltip sticky>{f.properties.covered ? "Covered path (mock)" : "Exposed path (mock)"}</Tooltip>
            </Polyline>
          ))}

      {lines
        .filter((l) => showStations.includes(l.lineId))
        .flatMap((l) => l.stations)
        .map((st) => (
          <CircleMarker key={st.stopId} center={[st.lat, st.lon]} radius={routeStops.has(st.stopId) ? 5 : 3.5} pathOptions={{ color: routeStops.has(st.stopId) ? C.brand : C.muted, weight: 2, fillColor: C.surface, fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -4]}>{st.name}</Tooltip>
          </CircleMarker>
        ))}

      {tripPath && tripPath.length > 1 && (
        <Polyline positions={tripPath.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color: C.brand, weight: 5, dashArray: "2 10", lineCap: "round" }} />
      )}
      {home && (
        <CircleMarker center={[home.lat, home.lon]} radius={7} pathOptions={{ color: C.surface, weight: 3, fillColor: C.brand, fillOpacity: 1 }}>
          <Tooltip direction="top" offset={[0, -6]}>Home</Tooltip>
        </CircleMarker>
      )}
      <CircleMarker center={[APU.lat, APU.lon]} radius={8} pathOptions={{ color: C.surface, weight: 3, fillColor: C.fg, fillOpacity: 1 }}>
        <Tooltip direction="right" offset={[8, 0]} permanent={showApuLabel}>
          APU
        </Tooltip>
      </CircleMarker>

      {incidents
        .filter((i) => i.status === "active")
        .map((i) =>
          i.geometry ? (
            <Polyline key={i.id} positions={ll(i.geometry.coordinates)} pathOptions={{ color: C.stop, weight: 9, opacity: 1, className: "pulse-stop" }}>
              <Tooltip sticky>{i.title}</Tooltip>
            </Polyline>
          ) : i.center && i.type !== "weather" ? (
            <CircleMarker key={i.id} center={[i.center.lat, i.center.lon]} radius={16} pathOptions={{ color: C.stop, weight: 3, fillOpacity: 0.15, className: "pulse-stop" }}>
              <Tooltip>{i.title}</Tooltip>
            </CircleMarker>
          ) : null,
        )}

      {buses.map((b) => (
        <CircleMarker key={b.id} center={[b.lat, b.lon]} radius={b.stuck ? 6 : 4} pathOptions={{ color: C.surface, weight: 1.5, fillColor: b.stuck ? C.stop : C.muted, fillOpacity: 1 }}>
          <Tooltip>
            Bus {b.routeId}
            {b.stuck ? " · not moving" : ""}
            {b.simulated ? " · simulated" : ""}
          </Tooltip>
        </CircleMarker>
      ))}

      {riders.map((r) => (
        <CircleMarker key={r.id} center={[r.lat, r.lon]} radius={r.real ? 7 : 5} pathOptions={{ color: C.surface, weight: 2, fillColor: r.stalled ? C.stop : r.real ? C.rain : C.go, fillOpacity: 1 }} />
      ))}

      {me && (
        <CircleMarker center={[me.lat, me.lon]} radius={8} pathOptions={{ color: C.surface, weight: 3, fillColor: C.rain, fillOpacity: 1 }}>
          <Tooltip>You</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}

export function boundsForSegments(ids: string[]): LatLngBoundsExpression | null {
  const pts = ids.flatMap((id) => segmentById.get(id)?.geometry.coordinates ?? []);
  if (!pts.length) return null;
  const lats = pts.map((p) => p[1]).concat(APU.lat);
  const lons = pts.map((p) => p[0]).concat(APU.lon);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}
