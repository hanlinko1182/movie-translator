import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { test } from "node:test";
import { parseVoiceRequestProposal, assessNarrationVoiceHandoff } from "@/lib/storyline/voice/handoff";
import { voiceProposal } from "../voice-handoff.fixture";
import { voiceFoundationFixture } from "./fixture";

test("M5-01 preserves disabled M5 v1 and never turns shape-valid future approvals into provider eligibility", () => {
  const f = voiceFoundationFixture(), proposal = voiceProposal(f.draft); proposal.narration.draftId = f.receipt.id;
  assert.equal(parseVoiceRequestProposal(proposal).executable, false);
  assert.equal(assessNarrationVoiceHandoff(proposal, f.draft, f.receipt).eligibleForProviderSubmission, false);
});
test("M5-01 foundation stays server-only/pure, absent from application bootstrap, SDKs, database, workers, media and network", async () => {
  for (const file of await readdir("lib/storyline/voice/foundation")) {
    const source = await readFile(join("lib/storyline/voice/foundation", file), "utf8");
    if (file !== "contracts.ts") assert.match(source, /^import "server-only"/);
    assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|node:(?:fs|http|https|net|tls|child_process)|PrismaClient|lib\/(?:prisma|queue)|from ["'](?:@openrouter|bullmq|ioredis)|ffmpeg|ffprobe|use server/);
  }
  async function inspect(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name); if (entry.isDirectory()) await inspect(path);
      else if (/\.[cm]?[jt]sx?$/.test(path)) assert.doesNotMatch(await readFile(path, "utf8"), /voice\/foundation|createFakeVoiceHarness|createSyntheticVoiceAdapterForTest|planMyanmarVoice/);
    }
  }
  for (const directory of ["app", "components", "workers", "scripts"]) await inspect(directory);
  for (const path of ["lib/storyline/index.ts", "lib/storyline/narration/index.ts"]) assert.doesNotMatch(await readFile(path, "utf8"), /voice\/foundation/);
});

test("M5-01 transitive runtime graph contains no Prisma, database, network, SDK, media or worker code", async () => {
  const seen = new Set<string>();
  async function visit(path: string): Promise<void> {
    if (seen.has(path)) return; seen.add(path);
    assert.doesNotMatch(path, /generated|studio-versions\/(?:validation|service|database)|jobs\/service-boundary|lib\/(?:prisma|queue)|workers/);
    const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const clause = node.importClause;
      if (clause?.isTypeOnly || clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name && clause.namedBindings.elements.every(e => e.isTypeOnly)) continue;
      const specifier = node.moduleSpecifier.text;
      if (["server-only", "node:crypto"].includes(specifier)) continue;
      assert.ok(specifier.startsWith(".") || specifier.startsWith("@/"), `Unexpected runtime package ${specifier}`);
      const target = specifier.startsWith("@/") ? resolve(specifier.slice(2)) : resolve(dirname(path), specifier);
      await visit(`${target}.ts`);
    }
  }
  for (const file of await readdir("lib/storyline/voice/foundation")) await visit(resolve("lib/storyline/voice/foundation", file));
  assert.ok(seen.size >= 8);
});
