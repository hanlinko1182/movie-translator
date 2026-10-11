import "server-only";
import { getRecapProvider } from "./index";
import { loadRecapSource, recapSceneWindows, type RecapSource } from "./source";
import { recapInput } from "./context";
import { validateRecapOutput } from "./validate-output";
import { invalidRecapResponse } from "./diagnostics";
import { RECAP_LIMITS } from "./response-schema";
import type { RecapProvider } from "./provider";
import { RecapError, type RecapBatchResult, type RecapOutput, type RecapResult, type Usage } from "./types";

export function synthesisGroups(summaries: RecapOutput[]) {
  const groups: RecapOutput[][] = []; let group: RecapOutput[] = []; let size = 0;
  for (const summary of summaries) {
    const length = JSON.stringify(summary).length;
    if (length > RECAP_LIMITS.output) invalidRecapResponse({ stage: "SYNTHESIS", rule: "OUTPUT_TOO_LONG", fieldPath: "summaries", expectedLimit: RECAP_LIMITS.output, actualLength: length });
    if (group.length && (group.length >= 4 || size + length > 20000)) { groups.push(group); group = []; size = 0; }
    group.push(summary); size += length;
  }
  if (group.length) groups.push(group);
  return groups;
}
export async function generateRecapFromSource(source: RecapSource, provider: RecapProvider): Promise<RecapResult> {
  const receipts: RecapBatchResult[] = [];
  async function call(input: ReturnType<typeof recapInput>) {
    const result = await provider.generate(input);
    const output = validateRecapOutput(result.output, input, "GENERATION");
    for (const field of ["provider", "model"] as const) {
      if (typeof result[field] !== "string" || !result[field].trim()) invalidRecapResponse({ stage: "GENERATION", rule: "INVALID_RESULT_METADATA", fieldPath: `result.${field}` });
      if (receipts.length && result[field] !== receipts[0][field]) invalidRecapResponse({ stage: "GENERATION", rule: "PROVIDER_MODEL_MISMATCH", fieldPath: `result.${field}` });
    }
    if (!Number.isSafeInteger(result.runtimeMs) || result.runtimeMs < 0) invalidRecapResponse({ stage: "GENERATION", rule: "INVALID_RESULT_METADATA", fieldPath: "result.runtimeMs" });
    if (result.usage) for (const [key, value] of Object.entries(result.usage)) {
      const known = ["inputTokens", "outputTokens", "totalTokens", "costUsd"].includes(key);
      if (!known || !Number.isFinite(value) || value! < 0 || key !== "costUsd" && !Number.isSafeInteger(value)) invalidRecapResponse({ stage: "GENERATION", rule: "INVALID_USAGE", fieldPath: known ? `result.usage.${key}` : "result.usage" });
    }
    receipts.push({ ...result, output });
    return output;
  }
  let summaries: RecapOutput[] = [];
  for (const scenes of recapSceneWindows(source)) summaries.push(await call(recapInput(source, scenes)));
  const hierarchical = summaries.length > 1;
  // Bounded reduction tree: at least two outputs fit each non-singleton group.
  // No raw transcript is resent during synthesis; references stay closed to child summaries.
  while (summaries.length > 1) {
    const next: RecapOutput[] = [];
    for (const group of synthesisGroups(summaries)) next.push(group.length === 1 ? group[0] : await call(recapInput(source, [], group)));
    if (next.length >= summaries.length) invalidRecapResponse({ stage: "SYNTHESIS", rule: "SYNTHESIS_NOT_REDUCING", fieldPath: "summaries", actualCount: next.length });
    summaries = next;
  }
  if (!summaries.length) throw new RecapError("TRANSCRIPT_EMPTY");
  const usage: Usage = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens", "costUsd"] as const) if (receipts.every((result) => result.usage?.[key] !== undefined)) usage[key] = receipts.reduce((total, result) => total + result.usage![key]!, 0);
  return { output: summaries[0], provider: receipts[0].provider, model: receipts[0].model, runtimeMs: receipts.reduce((total, result) => total + result.runtimeMs, 0), modelCalls: receipts.length, strategy: hierarchical ? "HIERARCHICAL" : "SINGLE_STAGE", ...(Object.keys(usage).length ? { usage } : {}) };
}
export async function generateMovieRecap(movieId: string, expectedHash: string, dependencies: { provider?: RecapProvider } = {}) {
  const source = await loadRecapSource(movieId);
  if (source.sourceHash !== expectedHash) throw new RecapError("RECAP_SOURCE_CHANGED");
  return { source, result: await generateRecapFromSource(source, dependencies.provider ?? getRecapProvider().provider) };
}
