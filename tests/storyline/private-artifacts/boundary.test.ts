import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import ts from "typescript";
import { createPrivateFakeAudioStoreForTest } from "@/lib/storyline/voice/private-artifacts/store";

test("M5-03 runtime graph has no database, filesystem, network, adapter execution, worker or provider path", async () => {
  const seen = new Set<string>();
  async function visit(path: string): Promise<void> {
    if (seen.has(path)) return; seen.add(path);
    assert.doesNotMatch(path, /generated|studio-versions\/(?:validation|service|database)|jobs\/service-boundary|lib\/(?:prisma|queue)|workers|fake-adapter/);
    const text = await readFile(path, "utf8"), source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    assert.doesNotMatch(text, /\bfetch\s*\(|process\.env|node:(?:fs|http|https|net|tls|child_process)|PrismaClient|use server/);
    if (path.endsWith("private-artifacts/store.ts")) {
      assert.match(text, /^import "server-only"/);
      const factory = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createPrivateFakeAudioStoreForTest");
      assert.ok(factory && ts.isFunctionDeclaration(factory));
      const moduleText = source.statements.filter(node => node !== factory).map(node => node.getText(source)).join("\n");
      assert.doesNotMatch(moduleText, /new (?:WeakMap|Map)|globalThis|process\./, "ownership registries must be factory-local");
    }
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const c = node.importClause;
      if (c?.isTypeOnly || c?.namedBindings && ts.isNamedImports(c.namedBindings) && !c.name && c.namedBindings.elements.every(e => e.isTypeOnly)) continue;
      const s = node.moduleSpecifier.text;
      if (["server-only", "node:crypto"].includes(s)) continue;
      assert.ok(s.startsWith(".") || s.startsWith("@/"));
      await visit(`${s.startsWith("@/") ? resolve(s.slice(2)) : resolve(dirname(path), s)}.ts`);
    }
  }
  for (const name of await readdir("lib/storyline/voice/private-artifacts")) await visit(resolve("lib/storyline/voice/private-artifacts", name));
  assert.ok(seen.size >= 10);
});
test("M5-03 factory/store/fault controls never enter production bootstrap or existing barrels", async () => {
  async function visit(directory: string) {
    for (const e of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, e.name);
      if (e.isDirectory()) await visit(path);
      else if (/\.[cm]?[jt]sx?$/.test(path)) assert.doesNotMatch(await readFile(path, "utf8"), /private-artifacts|createPrivateFakeAudioStoreForTest|corruptStoredBytesForTest|corruptExpectedAnchorForTest/);
    }
  }
  for (const directory of ["app", "components", "workers", "scripts"]) await visit(directory);
  for (const path of ["lib/storyline/index.ts", "lib/storyline/narration/index.ts"]) assert.doesNotMatch(await readFile(path, "utf8"), /private-artifacts/);
});
test("M5-03 invalid factory limits cannot create an unbounded or production store", () => {
  const valid = { maxOwners: 1, maxSubmissions: 1, maxArtifacts: 1, maxAudioBytes: 48 };
  for (const patch of [{ maxOwners: 0 }, { maxSubmissions: 721 }, { maxArtifacts: 721 }, { maxAudioBytes: 16777217 }, { maxOwners: -1 }, { maxArtifacts: 1.5 }, { production: true }]) assert.throws(() => createPrivateFakeAudioStoreForTest({ ...valid, ...patch }));
});
