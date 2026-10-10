import "server-only";
import { resolve, isAbsolute, relative } from "node:path";

export type Environment = Record<string, string | undefined>;
export type RuntimeRole = "web" | "media" | "transcription" | "translation" | "refinement" | "scene" | "character" | "recap" | "render";
export class ConfigurationError extends Error {
  constructor(readonly field: string) { super(`Invalid or missing configuration: ${field}`); this.name = "ConfigurationError"; }
}
const required = (name: string, env: Environment) => {
  const value = env[name]?.trim();
  if (!value) throw new ConfigurationError(name);
  return value;
};
export function databaseUrl(env: Environment = process.env) {
  const value = required("DATABASE_URL", env);
  try { const url = new URL(value); if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1) || url.hash) throw new Error(); }
  catch { throw new ConfigurationError("DATABASE_URL"); }
  return value;
}
export function redisUrl(env: Environment = process.env) {
  const value = required("REDIS_URL", env);
  try {
    const url = new URL(value); const port = Number(url.port || 6379); const db = url.pathname.slice(1) || "0";
    if (!["redis:", "rediss:"].includes(url.protocol) || !url.hostname || !Number.isInteger(port) || port < 1 || port > 65535 || !/^\d+$/.test(db) || !Number.isSafeInteger(Number(db)) || url.search || url.hash) throw new Error();
    decodeURIComponent(url.username); decodeURIComponent(url.password);
  } catch { throw new ConfigurationError("REDIS_URL"); }
  return value;
}
export function storageConfig(env: Environment = process.env) {
  const production = env.NODE_ENV === "production";
  const driver = env.STORAGE_DRIVER?.trim() || (production ? required("STORAGE_DRIVER", env) : "local");
  if (driver !== "local") throw new ConfigurationError("STORAGE_DRIVER");
  const raw = env.LOCAL_STORAGE_ROOT?.trim() || (production ? required("LOCAL_STORAGE_ROOT", env) : "storage");
  if (production && !isAbsolute(raw)) throw new ConfigurationError("LOCAL_STORAGE_ROOT");
  const root = resolve(raw);
  if (root === resolve("/") || ["public", ".next", "node_modules"].some((dir) => { const path = relative(resolve(dir), root); return path === "" || !path.startsWith("..") && !isAbsolute(path); })) throw new ConfigurationError("LOCAL_STORAGE_ROOT");
  return { driver: "local" as const, root };
}
export function modelConfig(name: string, env: Environment = process.env) {
  const model = required(name, env);
  if (model.length > 160 || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/.test(model)) throw new ConfigurationError(name);
  if (name === "TRANSCRIPTION_MODEL" && !["qwen/qwen3-asr-1.7b", "openai/whisper-large-v3"].includes(model)) throw new ConfigurationError(name);
  return model;
}
export function openRouterConfig(env: Environment = process.env) {
  const apiKey = required("OPENROUTER_API_KEY", env);
  let url: URL;
  try {
    url = new URL(env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1");
    if (url.protocol !== "https:" || url.hostname !== "openrouter.ai" || url.port || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/, "") !== "/api/v1") throw new Error();
  } catch { throw new ConfigurationError("OPENROUTER_BASE_URL"); }
  return { apiKey, baseUrl: `${url.origin}/api/v1` };
}
export function numericConfig(name: string, fallback: number, min: number, max: number, integer = true, env: Environment = process.env) {
  const raw = env[name]?.trim(); const value = raw ? Number(raw) : fallback;
  if (raw && !/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value)) throw new ConfigurationError(name);
  return value;
}
export const roleRequirements: Record<RuntimeRole, { storage?: boolean; binaries?: boolean; model?: string }> = {
  web: { storage: true, binaries: true }, // uploads are probed before accepting them
  media: { storage: true, binaries: true },
  transcription: { storage: true, binaries: true, model: "TRANSCRIPTION_MODEL" }, // audio chunking uses FFmpeg
  translation: { model: "TRANSLATION_MODEL" }, refinement: { model: "TRANSLATION_REFINEMENT_MODEL" },
  scene: { storage: true, binaries: true }, character: { model: "CHARACTER_ANALYSIS_MODEL" }, recap: { model: "RECAP_MODEL" },
  render: {}, // Phase 21.2B defers execution; no media binary or paid provider is used.
};
export function validateRuntime(role: RuntimeRole, env: Environment = process.env) {
  databaseUrl(env); redisUrl(env);
  numericConfig("WORKER_SHUTDOWN_TIMEOUT_MS", 120000, 1000, 21600000, true, env);
  const needs = roleRequirements[role];
  if (needs.storage) storageConfig(env);
  if (needs.model) { modelConfig(needs.model, env); openRouterConfig(env); }
  if (role === "scene") {
    numericConfig("SCENE_CHANGE_THRESHOLD", 0.4, 0.01, 1, false, env);
    numericConfig("SCENE_MIN_DURATION_MS", 15000, 5000, 300000, true, env);
    numericConfig("SCENE_TRANSCRIPT_GAP_MS", 8000, 3000, 300000, true, env);
  }
}
