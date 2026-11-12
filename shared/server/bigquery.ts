import { GCP_PROJECT, LOCAL } from "./env";

const DATASET = process.env.BQ_DATASET || "commute";
const enabled = !LOCAL && !!GCP_PROJECT && process.env.USE_BIGQUERY !== "false";
let bq: any = null;

async function client() {
  if (!bq) {
    const { BigQuery } = await import("@google-cloud/bigquery");
    bq = new BigQuery({ projectId: GCP_PROJECT });
  }
  return bq;
}

/** Best-effort streaming insert. Never throws. */
export async function bqInsert(table: "incidents" | "alerts" | "pings_sample", rows: Record<string, unknown>[]) {
  if (!enabled || !rows.length) return;
  try {
    const c = await client();
    await c.dataset(DATASET).table(table).insert(rows, { ignoreUnknownValues: true, skipInvalidRows: true });
  } catch (e: any) {
    console.warn(`[bigquery] insert ${table} failed: ${e.message}`);
  }
}

export const bigqueryMode = enabled ? `gcp:${DATASET}` : "off";
