import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
async function files(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) { const p = `${root}/${e.name}`; if (e.isDirectory()) out.push(...await files(p)); else out.push(p); }
  return out;
}
test("private store is isolated server-only stdlib plus accepted intake; no provider, M5/M8, network or engine edge", async () => {
  const allowed = ["server-only", "node:crypto", "node:fs", "node:fs/promises", "node:path", "../canonical", "../validation", "../narration-intake", "./contracts", "./files", "./store"];
  const owned = await files("lib/storyline/narration-private-store"); assert.equal(owned.length, 4);
  for (const p of owned) {
    const s = await readFile(p, "utf8"); assert.match(s, /^import "server-only";/);
    assert.doesNotMatch(s, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|spawn|execFile|rm|rmdir)\s*\(|https?:\/\/|use server/);
    const ast = ts.createSourceFile(p, s, ts.ScriptTarget.Latest, true);
    function visit(n: ts.Node) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) { assert.ok(ts.isStringLiteral(n.moduleSpecifier)); assert.ok(allowed.includes(n.moduleSpecifier.text)); }
      assert.ok(!(ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword)); ts.forEachChild(n, visit);
    }
    visit(ast);
  }
});
test("no production library/barrel/app/worker/script composes the private store", async () => {
  for (const root of ["app", "components", "lib", "workers", "scripts"]) for (const p of await files(root)) {
    if (!/\.[cm]?[jt]sx?$/.test(p) || p.startsWith("lib/storyline/narration-private-store/")) continue;
    assert.doesNotMatch(await readFile(p, "utf8"), /narration-private-store|createPrivateNarrationStore|openPrivateNarrationStore/);
  }
});
