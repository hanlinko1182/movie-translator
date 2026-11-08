// Static source and fresh build inspection only; no application/store runtime import.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
async function files(root) {
  const out = [];
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const p = `${root}/${e.name}`; if (e.isDirectory()) out.push(...await files(p)); else out.push(p);
  }
  return out;
}
const root = "lib/storyline/narration-private-store/", owned = (await files(root.slice(0, -1))).filter(p => p.endsWith(".ts"));
assert.equal(owned.length, 4);
const allowed = new Set(["server-only", "node:crypto", "node:fs", "node:fs/promises", "node:path", "../canonical", "../validation", "../narration-intake", "./contracts", "./files", "./store"]);
for (const file of owned) {
  const s = await readFile(file, "utf8"), ast = ts.createSourceFile(file, s, ts.ScriptTarget.Latest, true);
  assert.match(s, /^import "server-only";/);
  assert.doesNotMatch(s, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|spawn|execFile|rm|rmdir)\s*\(|https?:\/\/|use server/);
  function visit(n) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      assert.ok(ts.isStringLiteral(n.moduleSpecifier)); assert.ok(allowed.has(n.moduleSpecifier.text), file);
    }
    assert.ok(!(ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword)); ts.forEachChild(n, visit);
  }
  visit(ast);
}
const sources = (await Promise.all(["app", "components", "lib", "workers", "scripts"].map(files))).flat().filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.startsWith(root));
const bundles = [...await files(".next/server"), ...await files(".next/static")].filter(p => p.endsWith(".js"));
assert.ok(bundles.length, "Fresh dummy build required");
const marker = /narration-private-store|story-private-narration-|createPrivateNarrationStore|openPrivateNarrationStore/;
for (const p of [...sources, ...bundles]) assert.ok(!marker.test(await readFile(p, "utf8")), p);
const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
const result = { status: "PASS", isolatedModules: owned.length, externalSources: sources.length, builtJavaScriptFiles: bundles.length, productionReferences: 0, forbiddenImports: 0, serverActions: 0 };
console.log(JSON.stringify(result));
if (process.argv[2]) { assert.ok(resolve(process.argv[2]).startsWith(resolve("coverage") + "/")); await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n"); }
