import "dotenv/config";

import { formatTimestamp } from "@/lib/format-timestamp";
import { benchmarkMovieTranslation } from "@/lib/translation/benchmark";
import { TranslationError } from "@/lib/translation/types";

async function main() {
  const movieId = process.argv.slice(2).find((argument) => argument !== "--")?.trim();
  if (!movieId) {
    console.error("Usage: pnpm benchmark:translation -- <movie-id>");
    process.exitCode = 1;
    return;
  }

  const benchmark = await benchmarkMovieTranslation(movieId);
  console.log(`Movie: ${benchmark.movieId}`);
  console.log(`Transcript: ${benchmark.transcriptId}`);
  console.log(`Source: ${benchmark.source.sourceLanguage} → ${benchmark.source.targetLanguage}`);
  console.log(`Source segments: ${benchmark.source.segments.length}`);

  for (const source of benchmark.source.segments) {
    console.log("=".repeat(50));
    console.log(`SEGMENT ${source.sequence}`);
    console.log(`${formatTimestamp(source.startMs)} → ${formatTimestamp(source.endMs)} (${source.startMs}–${source.endMs} ms)`);
    console.log(`SOURCE:\n${source.text}`);
    for (const model of benchmark.results) {
      const translated = model.result?.segments.find((segment) => segment.sequence === source.sequence);
      console.log(`${model.label.toUpperCase()}:\n${translated?.text ?? `[${model.errorCode ?? "NO_TRANSLATION"}]`}`);
    }
  }

  console.log("=".repeat(50));
  console.log("MODEL SUMMARY");
  for (const model of benchmark.results) {
    console.log(`${model.label}:`);
    console.log(`  provider: ${model.provider}`);
    console.log(`  model: ${model.model}`);
    console.log(`  status: ${model.status}${model.errorCode ? ` (${model.errorCode})` : ""}`);
    console.log(`  runtimeMs: ${model.runtimeMs}`);
    console.log(`  segments: ${model.sourceSegmentCount} source, ${model.translatedSegmentCount} translated`);
    console.log(`  languages: ${model.sourceLanguage} → ${model.targetLanguage}`);
    console.log(`  inputTokens: ${model.result?.usage?.inputTokens ?? "unavailable"}`);
    console.log(`  outputTokens: ${model.result?.usage?.outputTokens ?? "unavailable"}`);
    console.log(`  totalTokens: ${model.result?.usage?.totalTokens ?? "unavailable"}`);
    console.log(`  costUsd: ${model.result?.usage?.costUsd ?? "unavailable"}`);
    console.log(`  warnings: ${model.warnings?.length ? model.warnings.join("; ") : "none"}`);
  }
  if (benchmark.results.some((model) => model.status === "error")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof TranslationError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error("Translation benchmark failed.");
  }
  process.exitCode = 1;
});
