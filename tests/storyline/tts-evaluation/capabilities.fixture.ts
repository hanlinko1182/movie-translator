import "server-only";
import { deny, freeze } from "./contracts.fixture";
// OpenRouter is the sole gateway. Upstream documentation is never account or audio evidence.
// This server-only test catalog is not a production activation configuration.
export const capabilities = freeze([
  { provider: "OPENROUTER", model: "elevenlabs/eleven-v3", voices: ["george"], nativeFormat: "mp3", language: "my", locale: "my-MM",
    languageEvidence: "DOCUMENTED_UPSTREAM", gatewayMyanmarEvidence: "UNKNOWN", voiceEvidence: "DOCUMENTED_STOCK_CANDIDATE",
    accountEvidence: "UNKNOWN", audioEvidence: "NOT_EVALUATED", routing: "SPEECH_PINNING_UNAVAILABLE", billableUnits: ["BILLABLE_CHARACTER"] },
  { provider: "OPENROUTER", model: "google/gemini-3.8-flash-tts", voices: ["Kore"], nativeFormat: "pcm", language: "my", locale: "my-MM",
    languageEvidence: "DOCUMENTED_UPSTREAM", gatewayMyanmarEvidence: "UNKNOWN", voiceEvidence: "DOCUMENTED_STOCK_CANDIDATE",
    accountEvidence: "UNKNOWN", audioEvidence: "NOT_EVALUATED", routing: "SPEECH_PINNING_UNAVAILABLE", billableUnits: ["INPUT_TEXT_TOKEN", "OUTPUT_AUDIO_TOKEN"] },
] as const);
export type Selection = { provider: string; model: string; voice: string; nativeFormat: string; language: string; locale: string };
export function capability(s: Selection) {
  const c = capabilities.find(c => c.provider === s.provider && c.model === s.model);
  if (s.provider !== "OPENROUTER" || !c || c.language !== s.language || c.locale !== s.locale || c.nativeFormat !== s.nativeFormat || !(c.voices as readonly string[]).includes(s.voice)) deny("UNSUPPORTED_CONFIGURATION");
  return c;
}
export function selection(index = 0, voiceIndex = 0): Selection {
  const c = capabilities[index]; if (!c || !c.voices[voiceIndex]) deny("UNSUPPORTED_CONFIGURATION");
  return { provider: c.provider, model: c.model, voice: c.voices[voiceIndex], nativeFormat: c.nativeFormat, language: c.language, locale: c.locale };
}
