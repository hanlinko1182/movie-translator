import "server-only";
import { deny, freeze } from "./contracts.fixture";
// Dated public claims are metadata, never account entitlement or measured quality.
export const capabilities = freeze([
  { provider: "OPENROUTER", model: "google/gemini-3.8-flash-tts", voices: ["Kore"], nativeFormat: "pcm", language: "my", locale: "my-MM", languageEvidence: "DOCUMENTED", voiceEvidence: "DOCUMENTED_STOCK_CANDIDATE", routing: "SPEECH_PINNING_UNAVAILABLE" },
  { provider: "AZURE", model: "AZURE_PREBUILT_NEURAL_VOICE", voices: ["my-MM-NilarNeural", "my-MM-ThihaNeural"], nativeFormat: "riff-24khz-16bit-mono-pcm", language: "my", locale: "my-MM", languageEvidence: "DOCUMENTED", voiceEvidence: "DOCUMENTED_STOCK_CANDIDATE", routing: "RESOURCE_REGION_REQUIRED" },
  { provider: "ELEVENLABS", model: "eleven_v3", voices: ["MOCK_STOCK_PENDING"], nativeFormat: "mp3_44100_128", language: "my", locale: "my-MM", languageEvidence: "DOCUMENTED", voiceEvidence: "UNKNOWN_MOCK_PLACEHOLDER_ONLY", routing: "ACCOUNT_REGION_REQUIRED" },
] as const);
export type Selection = { provider: string; model: string; voice: string; nativeFormat: string; language: string; locale: string };
export function capability(s: Selection) {
  const c = capabilities.find(c => c.provider === s.provider && c.model === s.model);
  if (!c || c.language !== s.language || c.locale !== s.locale || c.nativeFormat !== s.nativeFormat || !(c.voices as readonly string[]).includes(s.voice)) deny("UNSUPPORTED_CONFIGURATION");
  return c;
}
export function selection(index = 0, voiceIndex = 0): Selection {
  const c = capabilities[index]; if (!c || !c.voices[voiceIndex]) deny("UNSUPPORTED_CONFIGURATION");
  return { provider: c.provider, model: c.model, voice: c.voices[voiceIndex], nativeFormat: c.nativeFormat, language: c.language, locale: c.locale };
}
