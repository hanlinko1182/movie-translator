import "dotenv/config";

import { benchmarkMovieTranscription } from "@/lib/transcription/benchmark";

async function main() {
  const movieId = process.argv
    .slice(2)
    .find((argument) => argument !== "--")
    ?.trim();
  if (!movieId) {
    console.error("Usage: pnpm benchmark:stt -- <movie-id>");
    process.exitCode = 1;
    return;
  }

  const benchmark = await benchmarkMovieTranscription(movieId);
  console.log(JSON.stringify(benchmark, null, 2));
}

main().catch(() => {
  console.error("Transcription benchmark failed.");
  process.exitCode = 1;
});
