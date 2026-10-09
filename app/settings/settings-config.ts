import "server-only";
import { modelConfig, openRouterConfig, storageConfig } from "@/lib/env";

// Explicit allowlist: provider objects, errors, raw environment and storage paths
// must never cross the UI boundary. These checks make no provider requests.
export function readSettingsConfiguration() {
  function model(name: string) {
    try { return modelConfig(name); }
    catch { return process.env[name]?.trim() ? "Invalid configuration" : "Not configured"; }
  }
  let providerConfigured = false;
  try { openRouterConfig(); providerConfigured = true; } catch { /* Never return diagnostics. */ }
  let storage = "Not configured";
  try { storage = storageConfig().driver === "local" ? "Local filesystem" : "Not configured"; }
  catch { /* Never return the root or error. */ }
  return {
    models: {
      transcription: model("TRANSCRIPTION_MODEL"),
      translation: model("TRANSLATION_MODEL"),
      refinement: model("TRANSLATION_REFINEMENT_MODEL"),
      character: model("CHARACTER_ANALYSIS_MODEL"),
      recap: model("RECAP_MODEL"),
    },
    providerConfigured, storage,
    environment: process.env.NODE_ENV === "production" ? "Production" : process.env.NODE_ENV === "development" ? "Development" : "Test",
    node: process.versions.node,
  };
}
