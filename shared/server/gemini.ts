import { GoogleGenAI } from "@google/genai";
import { GCP_PROJECT } from "./env";

/**
 * Gemini with a model fallback chain. Models get retired or overloaded (404 / 503), and a stage demo
 * can't wait on one busy model, so each call tries the chain in order with a short timeout.
 * The last model that worked is tried first next time. GEMINI_MODEL accepts a comma-separated list.
 */
const MODELS = (process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const PER_TRY_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 12000);

let ai: GoogleGenAI | null = null;
let mode: "ai-studio" | "vertex" | "off" = "off";

if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  mode = "ai-studio";
} else if (GCP_PROJECT && process.env.USE_VERTEX !== "false") {
  ai = new GoogleGenAI({ vertexai: true, project: GCP_PROJECT, location: process.env.VERTEX_LOCATION || "global" });
  mode = "vertex";
}

export const geminiMode = mode;
let preferred = MODELS[0];
export const geminiModel = () => preferred;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms`)), ms))]);
}

async function generate(prompt: string, json: boolean, temperature: number): Promise<string | null> {
  if (!ai) return null;
  const order = [preferred, ...MODELS.filter((m) => m !== preferred)];
  for (const model of order) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({ model, contents: prompt, config: { temperature, ...(json ? { responseMimeType: "application/json" } : {}) } }),
        PER_TRY_MS,
      );
      const text = (res.text ?? "").trim();
      if (!text) throw new Error("empty response");
      if (preferred !== model) console.log(`[gemini] using ${model}`);
      preferred = model;
      return text;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const code = msg.match(/"code":\s*(\d+)/)?.[1] ?? (msg.startsWith("timeout") ? "timeout" : "error");
      console.warn(`[gemini] ${model} failed (${code}), trying next`);
    }
  }
  return null;
}

export async function geminiJSON<T>(prompt: string): Promise<T | null> {
  const text = await generate(prompt, true, 0.3);
  if (!text) return null;
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|```$/g, "")) as T;
  } catch {
    console.warn("[gemini] response was not valid JSON");
    return null;
  }
}

export async function geminiText(prompt: string): Promise<string | null> {
  return generate(prompt, false, 0.4);
}
