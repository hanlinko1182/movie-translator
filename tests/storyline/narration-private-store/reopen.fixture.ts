// Fixed service-only child fixture: no sender, media engine, command runner or write operation.
import { openPrivateNarrationStore, PrivateNarrationStoreError } from "../../../lib/storyline/narration-private-store";
async function main() {
  let text = "";
  for await (const part of process.stdin) { text += String(part); if (Buffer.byteLength(text) > 8192) throw Error("FIXTURE_INPUT_LIMIT"); }
  const input = JSON.parse(text), reader = await openPrivateNarrationStore(input.config);
  process.stdout.write(JSON.stringify(await reader.lookup(input.artifactId)));
}
main().catch(error => { process.stderr.write("READ_ONLY_FIXTURE_FAILED:" + (error instanceof PrivateNarrationStoreError ? error.code : "UNEXPECTED_ERROR")); process.exitCode = 1; });
