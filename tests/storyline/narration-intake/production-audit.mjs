// Static source/build reads only. Never imports intake, application or media runtime.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
async function files(root) {
  const out = [];
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const p = `${root}/${e.name}`;
    if (e.isDirectory()) out.push(...await files(p)); else out.push(p);
  }
  return out;
}
const root = "lib/storyline/narration-intake/";
const owned = (await files(root.slice(0, -1))).filter(p => p.endsWith(".ts"));
assert.equal(owned.length, 6);
const permitted = new Set(["server-only", "node:crypto", "node:fs", "node:fs/promises", "node:path",
  "../canonical", "../validation", "./contracts", "./wav", "./candidates", "./private-file", "./preview"]);
for (const file of owned) {
  const source = await readFile(file, "utf8"), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|spawn|execFile)\s*\(|use server|https?:\/\//);
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) {
        assert.ok(ts.isStringLiteral(node.moduleSpecifier));
        assert.ok(permitted.has(node.moduleSpecifier.text), `${file}: unexpected import`);
      }
    }
    assert.ok(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword));
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const marker = /narration-intake|story-narration-(?:wav-measurement|intake-candidate|timing-preview)-v1|authorizePrivateWavInspection|measureNarrationWav|createOfflineNarrationRegistry|buildNarrationTimingPreview/;
const sources = (await Promise.all(["app", "components", "lib", "workers", "scripts"].map(files))).flat()
  .filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.startsWith(root));
const bundles = [...await files(".next/server"), ...await files(".next/static")].filter(p => p.endsWith(".js"));
assert.ok(bundles.length, "Fresh dummy build required");
for (const file of [...sources, ...bundles]) assert.ok(!marker.test(await readFile(file, "utf8")), file);
const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
const result = { status: "PASS", isolatedModules: owned.length, externalSources: sources.length,
  builtJavaScriptFiles: bundles.length, productionReferences: 0, forbiddenImports: 0, serverActions: 0 };
console.log(JSON.stringify(result));
if (process.argv[2]) {
  assert.ok(resolve(process.argv[2]).startsWith(resolve("coverage") + "/"));
  await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n");
}
