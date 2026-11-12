import { DEMO_MODE } from "../../shared/server/env";

// Detection thresholds. DEMO_MODE shortens the time windows for the stage demo.
export const cfg = {
  demo: DEMO_MODE,
  maxDistToLineM: 300,
  stationRadiusM: 150,
  windowMs: 3 * 60_000,
  stallSpeedMps: 1,
  stallMotionMax: 0.15, // variance of |accel| (m^2/s^4). Moving trains sit well above this.
  stallMinRiders: DEMO_MODE ? 2 : 3,
  stallMinMs: DEMO_MODE ? 30_000 : 120_000,
  // a rider who reports "not moving" counts sooner: GPS speed is noisy when a train stands still
  reportStallMs: 10_000,
  reportValidMs: 3 * 60_000,
  // GPS jitter on a standing train often reads 1-2 m/s; with calm motion that still means stopped
  jitterSpeedMps: 2.5,
  clearSpeedMps: 3,
  clearMinRiders: 2,
  silenceClearMs: DEMO_MODE ? 90_000 : 5 * 60_000,
  sessionStaleMs: 60_000,
  // bus
  busStuckMoveM: 30,
  busStuckMs: DEMO_MODE ? 45_000 : 180_000,
  busStopRadiusM: 50,
  busClusterM: 500,
  busRouteMinStuck: 2,
  // alerts
  // real rule: class within 2 h. Demo mode widens it so testers with real APSpace classes still get alerts.
  alertClassWindowMs: DEMO_MODE ? 24 * 3600_000 : 2 * 3600_000,
};
