import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

test("M5-02 runtime import graph is pure server-only validation with no provider/DB/media/storage/worker path", async () => {
  const seen = new Set<string>();
  async function visit(path: string): Promise<void> {
    if (seen.has(path)) return; seen.add(path);
    assert.doesNotMatch(path, /generated|studio-versions\/(?:validation|service|database)|jobs\/service-boundary|lib\/(?:prisma|queue)|workers/);
    const text = await readFile(path, "utf8"), source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    assert.doesNotMatch(text, /\bfetch\s*\(|process\.env|node:(?:fs|http|https|net|tls|child_process)|PrismaClient|use server/);
    if (path.includes("audio-verification") && !path.endsWith("contracts.ts")) assert.match(text, /^import "server-only"/);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const c = node.importClause;
      if (c?.isTypeOnly || c?.namedBindings && ts.isNamedImports(c.namedBindings) && !c.name && c.namedBindings.elements.every(e => e.isTypeOnly)) continue;
      const specifier = node.moduleSpecifier.text;
      if (["server-only", "node:crypto"].includes(specifier)) continue;
      assert.ok(specifier.startsWith(".") || specifier.startsWith("@/"), `Unexpected runtime package ${specifier}`);
      const target = specifier.startsWith("@/") ? resolve(specifier.slice(2)) : resolve(dirname(path), specifier);
      await visit(`${target}.ts`);
    }
  }
  for (const name of await readdir("lib/storyline/voice/audio-verification")) await visit(resolve("lib/storyline/voice/audio-verification", name));
  assert.ok(seen.size >= 10);
});
test("M5-02 verification exports never enter application bootstrap, production routes, actions or existing barrels", async () => {
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (/\.[cm]?[jt]sx?$/.test(path)) assert.doesNotMatch(await readFile(path, "utf8"), /audio-verification|verifyFakeVoiceOutput|verifySyntheticAudioCollection|verifySyntheticPcmWav/);
    }
  }
  for (const directory of ["app", "components", "workers", "scripts"]) await visit(directory);
  for (const path of ["lib/storyline/index.ts", "lib/storyline/narration/index.ts"]) assert.doesNotMatch(await readFile(path, "utf8"), /audio-verification/);
});
