import "server-only";
import { createHash } from "node:crypto";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { freeze, record, integer, id, hash } from "../../../lib/storyline/validation";

export const D = Object.freeze({ corpus: "story-tts-offline-corpus-v1", text: "story-tts-offline-text-v1",
  chunk: "story-tts-offline-chunk-v1", request: "story-tts-offline-request-v1", spending: "story-tts-unissued-spending-proposal-v1",
  response: "story-tts-nonaudio-mock-response-v1", receipt: "story-tts-offline-observation-v1" });
export class OfflineError extends Error { constructor(readonly code: string) { super("Offline TTS evaluation denied"); } }
export function deny(code: string): never { throw new OfflineError(code); }
export const exact = (v: unknown, keys: string[]) => record(JSON.parse(canonicalJson(v, 2 * 1024 * 1024)), keys, "tts.offline");
export const digest = (domain: string, v: unknown) => createHash("sha256").update(domain + "\n" + canonicalJson(v)).digest("hex");
export const byteHash = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
export const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
export const counter = (v: unknown, max = 1000000000) => integer(v, "tts.counter", max);
export const ident = (v: unknown) => id(v, "tts.id");
export const sha = (v: unknown) => hash(v, "tts.hash");
export { freeze };
export const dependentStart = (v: string) => /^[\u102B-\u103E\u1056-\u1059\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D]/u.test(v);
export function account(v: unknown): "mock-account-a" | "mock-account-b" {
  if (v !== "mock-account-a" && v !== "mock-account-b") deny("MOCK_ACCOUNT_REQUIRED"); return v;
}
export function myanmarText(v: unknown): string {
  if (typeof v !== "string") deny("INVALID_TEXT");
  canonicalJson(v, 4096);
  if (!v.trim() || Buffer.byteLength(v, "utf8") > 2048 || !/[\u1000-\u102A]/u.test(v)
    || !/^[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F0-9 .,!?;:()\n-]+$/u.test(v)
    || /^[\u102B-\u103E\u1056-\u1059\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D]/u.test(v)) deny("INVALID_TEXT");
  let base = false;
  for (const ch of v) {
    if (dependentStart(ch)) { if (!base) deny("ORPHAN_MYANMAR_MARK"); }
    else base = /\p{Script=Myanmar}/u.test(ch) && /\p{Letter}/u.test(ch);
  }
  return v; // EXACT_UTF8_NO_NORMALIZATION_V1: no trim, normalize or transliteration.
}
export const policy = Object.freeze({ attempts: 1, retries: 0, fallback: "NONE", parallel: false, live: false });
