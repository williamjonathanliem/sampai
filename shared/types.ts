export type Mode = "rail" | "bus" | "walk" | "shuttle" | "grab";

export interface Ping {
  sessionId: string;
  uid?: string | null;
  mode: "rail" | "bus";
  lineId?: string | null;
  routeId?: string | null;
  lat: number;
  lon: number;
  accuracy?: number | null;
  speed?: number | null; // m/s
  motion?: number | null; // variance of |accel| over 5s, m^2/s^4
  ts: number; // epoch ms
  simulated: boolean;
  report?: "stopped" | "moving" | null; // rider tapped "Train's not moving" / "Moving again"
}

export interface Station {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
}

export interface Line {
  lineId: string;
  shortName: string;
  name: string;
  category: string;
  color: string;
  stations: Station[];
  geometry: { type: "LineString"; coordinates: number[][] };
}

export interface Segment {
  segmentId: string;
  lineId: string;
  fromStop: string;
  toStop: string;
  fromName: string;
  toName: string;
  lengthM: number;
  geometry: { type: "LineString"; coordinates: number[][] };
}

export interface RouteLeg {
  mode: Mode;
  lineId?: string;
  routeId?: string;
  fromStop?: string;
  toStop?: string;
  from?: string;
  to?: string;
  label?: string;
  minutes?: number;
  walkId?: string;
}

export interface UserRoute {
  legs: RouteLeg[];
  segments: string[];
  busRoutes?: string[];
  lines?: string[];
  /** street-accurate path of the chosen route, JSON of [{mode, color?, coords:[lon,lat][]}] (Firestore has no nested arrays) */
  pathJson?: string;
  title?: string;
}

export interface ClassSlot {
  day: number; // 1=Mon..7=Sun; 0 = every day (demo)
  start: string; // "09:00"
  end?: string;
  title?: string;
  lecturer?: string;
  room?: string;
  date?: string; // ISO date when it comes from the APU timetable
  inMin?: number; // demo only: class always starts this many minutes from now
}

export interface UserDoc {
  displayName?: string;
  lang: "en" | "ms";
  fcmTokens?: string[];
  intake?: string | null;
  group?: string | null; // APSpace tutorial group, e.g. "G1"
  homeLocation?: { lat: number; lon: number; label: string };
  route?: UserRoute;
  classes?: ClassSlot[];
  profileId?: string;
  /** opted in once: sharing starts by itself when the app is open near the student's line at commute time */
  autoShare?: boolean;
  simulated: boolean;
  updatedAt?: number;
}

export type IncidentType = "train_stall" | "bus_stall" | "bus_route" | "weather";
export type Confidence = "low" | "medium" | "high";

export interface Incident {
  id: string;
  type: IncidentType;
  status: "active" | "cleared";
  lineId?: string | null;
  lineName?: string | null;
  routeId?: string | null;
  segmentId?: string | null;
  fromStop?: string | null;
  toStop?: string | null;
  fromName?: string | null;
  toName?: string | null;
  geometry?: { type: "LineString"; coordinates: number[][] } | null;
  center?: { lat: number; lon: number } | null;
  startedAt: number;
  updatedAt: number;
  clearedAt?: number | null;
  riderCount: number;
  confidence: Confidence;
  source: "riders" | "gtfs-r" | "met" | "manual";
  title?: string;
  summary?: string;
  officialNote?: string | null;
  weatherAtStart?: { apparentTemp?: number | null; rainProb?: number | null; metWarning?: boolean } | null;
  simulated: boolean;
}

export interface AlertOption {
  id: string;
  type: "bus" | "grab" | "walk" | "rail" | "wait" | "shuttle";
  label: string;
  detail?: string;
  etaMinutes: number; // minutes from now to arrival at campus
  arrivalTime: string; // "08:52"
  onTime: boolean;
  fareEstimate?: number | null;
  grabUrl?: string;
  walkId?: string;
  covered?: boolean;
}

export interface AlertDoc {
  id: string;
  uid: string;
  incidentId: string;
  status: "active" | "cleared";
  title: string;
  body: string;
  why?: string;
  bestOptionId?: string;
  options: AlertOption[];
  classTitle?: string | null;
  classStart?: string | null;
  lecturer?: string | null;
  sentAt: number;
  generatedBy: "gemini" | "template";
  simulated: boolean;
}

export interface Conditions {
  heat: { apparentTemp: number | null; advisory: boolean; updatedAt: number; simulated?: boolean };
  rain: { probNextHour: number | null; advisory: boolean; updatedAt: number; simulated?: boolean };
  metWarnings: { title: string; text: string; validFrom?: string; validTo?: string; affectsKL: boolean; simulated?: boolean }[];
  /** air quality (haze): US AQI + PM2.5 from Open-Meteo */
  air?: { aqi: number | null; pm25: number | null; advisory: boolean; simulated?: boolean };
  uv?: number | null;
  updatedAt: number;
}
