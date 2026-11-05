import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
import { createOfflineNarrationRegistry, noOwnerClaims, measureNarrationWav,
  NarrationIntakeError, buildNarrationTimingPreview } from "../../../lib/storyline/narration-intake";
import { wav } from "./fixture";

async function files(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const p = `${root}/${e.name}`; if (e.isDirectory()) out.push(...await files(p)); else out.push(p);
  }
  return out;
}
test("server-only module has an exhaustive stdlib/local import allowlist; no network, engine, M5/M8 or environment edge", async () => {
  const allowed = ["server-only", "node:crypto", "node:fs", "node:fs/promises", "node:path", "../canonical", "../validation",
    "./contracts", "./wav", "./candidates", "./preview", "./private-file"];
  const sources = await files("lib/storyline/narration-intake"); assert.equal(sources.length, 6);
  for (const p of sources) {
    const s = await readFile(p, "utf8"); assert.match(s, /^import "server-only";/);
    assert.doesNotMatch(s, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|spawn|execFile)\s*\(|https?:\/\/|use server/);
    const ast = ts.createSourceFile(p, s, ts.ScriptTarget.Latest, true);
    function visit(n: ts.Node) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
        assert.ok(ts.isStringLiteral(n.moduleSpecifier)); assert.ok(allowed.includes(n.moduleSpecifier.text));
      }
      assert.ok(!(ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword)); ts.forEachChild(n, visit);
    }
    visit(ast);
  }
});
test("no production source or existing storyline barrel composes the offline intake", async () => {
  // M10-03B is a separately audited offline consumer, never production composition.
  const offlineConsumers = new Set(["lib/storyline/narration-private-store/contracts.ts", "lib/storyline/narration-private-store/files.ts", "lib/storyline/narration-private-store/store.ts"]);
  for (const dir of ["app", "components", "workers", "scripts", "lib"]) for (const p of await files(dir)) {
    if (!/\.[cm]?[jt]sx?$/.test(p) || p.startsWith("lib/storyline/narration-intake/") || offlineConsumers.has(p)) continue;
    assert.doesNotMatch(await readFile(p, "utf8"), /narration-intake|authorizePrivateWavInspection|measureNarrationWav|buildNarrationTimingPreview/);
  }
});
test("registry isolation, disclosure-safe errors, immutable nested metadata and no logging", t => {
  let logs = 0;
  for (const method of ["log", "error", "warn", "info"] as const) t.mock.method(console, method, () => { logs++; });
  const first = createOfflineNarrationRegistry(), second = createOfflineNarrationRegistry();
  const a = first.register(measureNarrationWav(wav()), noOwnerClaims), b = second.register(measureNarrationWav(wav()), noOwnerClaims);
  assert.notEqual(a.metadata.candidateId, b.metadata.candidateId);
  assert.throws(() => second.checkMetadata(a.metadata), NarrationIntakeError);
  const poison = { ...a.metadata, privatePath: "/private/SECRET_MARKER", apiKey: "REDACTION_TEST_NOT_A_CREDENTIAL" };
  try { first.checkMetadata(poison); assert.fail("must reject"); } catch (e) {
    assert.ok(e instanceof NarrationIntakeError); assert.doesNotMatch(String(e) + JSON.stringify(e), /SECRET_MARKER|REDACTION_TEST/);
  }
  function frozen(v: unknown) { if (v && typeof v === "object") { assert.ok(Object.isFrozen(v)); Object.values(v).forEach(frozen); } }
  frozen(a); frozen(buildNarrationTimingPreview(a)); assert.equal(logs, 0);
});
