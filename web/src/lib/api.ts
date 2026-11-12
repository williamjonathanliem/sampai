const host = location.hostname === "localhost" ? "localhost" : location.hostname;
export const API_URL = (import.meta.env.VITE_API_URL as string) || `http://${host}:8080`;

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(API_URL + path, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`);
  return res.json();
}
