import { LOCAL, WORKER_URL, GCP_PROJECT } from "./env";

export type Topic = "pings" | "bus-positions" | "incidents";

const topicName: Record<Topic, string> = {
  pings: process.env.PUBSUB_TOPIC_PINGS || "pings",
  "bus-positions": process.env.PUBSUB_TOPIC_BUS || "bus-positions",
  incidents: process.env.PUBSUB_TOPIC_INCIDENTS || "incidents",
};
// Local shim: the same push envelope Pub/Sub would send, posted straight to the worker.
const localPath: Record<Topic, string> = { pings: "/pubsub/pings", "bus-positions": "/pubsub/bus", incidents: "/pubsub/incidents" };

let client: any = null;
async function getClient() {
  if (!client) {
    const { PubSub } = await import("@google-cloud/pubsub");
    client = new PubSub({ projectId: GCP_PROJECT });
  }
  return client;
}

const usePubSub = !LOCAL && process.env.USE_PUBSUB !== "false";

export async function publish(topic: Topic, data: unknown) {
  if (usePubSub) {
    const c = await getClient();
    await c.topic(topicName[topic]).publishMessage({ json: data });
    return;
  }
  const envelope = {
    message: { data: Buffer.from(JSON.stringify(data)).toString("base64"), messageId: `local-${Date.now()}`, publishTime: new Date().toISOString() },
    subscription: `local/${topic}`,
  };
  // fire and forget, like real Pub/Sub
  fetch(WORKER_URL + localPath[topic], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope) }).catch((e) =>
    console.warn(`[pubsub-local] ${topic} -> worker failed: ${e.message}`),
  );
}

export function decodePush<T = any>(body: any): T | null {
  try {
    const data = body?.message?.data;
    if (!data) return null;
    return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const pubsubMode = usePubSub ? "gcp" : "local-shim";
