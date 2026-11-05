// Text/AST inspection only; no application, media or private-store runtime imports.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
async function files(root) {
  const out = [];
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) { const p = `${root}/${e.name}`; if (e.isDirectory()) out.push(...await files(p)); else out.push(p); }
  return out;
}
export async function auditPureRuntime() {
  const seen = new Set();
  async function visit(file) {
    if (seen.has(file)) return; seen.add(file);
    assert.doesNotMatch(file, /narration-private-store|narration-intake\/(?:index|private-file)|render-execution|maintenance-fake|ownership-exclusion|voice\/|video-render|prisma|queue|provider|generated|timeline-persistence|highlights-persistence/);
    const s = await readFile(file, "utf8"), ast = ts.createSourceFile(file, s, ts.ScriptTarget.Latest, true);
    assert.doesNotMatch(s, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|spawn|execFile)\s*\(|use server|https?:\/\//);
    function noDynamic(n) { assert.ok(!(ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword)); ts.forEachChild(n, noDynamic); } noDynamic(ast);
    if (file.includes("video-highlights-offline/")) assert.match(s, /^import "server-only";/);
    for (const n of ast.statements) {
      if (!ts.isImportDeclaration(n) && !ts.isExportDeclaration(n)) continue;
      if (ts.isImportDeclaration(n) && (n.importClause?.isTypeOnly || n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings) && !n.importClause.name && n.importClause.namedBindings.elements.every(e => e.isTypeOnly)) || ts.isExportDeclaration(n) && n.isTypeOnly) continue;
      const spec = n.moduleSpecifier; if (!spec) continue; assert.ok(ts.isStringLiteral(spec)); const target = spec.text;
      if (!target.startsWith(".")) { assert.ok(["server-only", "node:crypto"].includes(target), target); continue; }
      const base = resolve(dirname(file), target); let found;
      for (const candidate of [base + ".ts", join(base, "index.ts")]) { try { await readFile(candidate); found = candidate; break; } catch { /* next candidate */ } }
      assert.ok(found, target); await visit(found);
    }
  }
  await visit(resolve("lib/storyline/video-highlights-offline/index.ts")); return seen.size;
}
export async function auditProductionReferences() {
  const root = "lib/storyline/video-highlights-offline/";
  const sources = (await Promise.all(["app", "components", "lib", "workers", "scripts"].map(files))).flat().filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.startsWith(root));
  const marker = /video-highlights-offline|story-offline-video-|createSyntheticVideoCatalog|buildOfflineHighlightPlan|assessNarrationCompatibility/;
  for (const p of sources) assert.ok(!marker.test(await readFile(p, "utf8")), p);
  return { sources: sources.length, marker };
}
// Importing from Node tests runs no build audit; direct CLI invocation requires the fresh dummy build.
async function main() {
  const runtimeFiles = await auditPureRuntime(), { sources, marker } = await auditProductionReferences();
  const bundles = [...await files(".next/server"), ...await files(".next/static")].filter(p => p.endsWith(".js")); assert.ok(bundles.length, "Fresh dummy build required");
  for (const p of bundles) assert.ok(!marker.test(await readFile(p, "utf8")), p);
  const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8")); assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
  const result = { status: "PASS", runtimeGraphFiles: runtimeFiles, isolatedModules: (await files("lib/storyline/video-highlights-offline")).length,
    externalSources: sources, builtJavaScriptFiles: bundles.length, productionReferences: 0, networkMediaOrPrivateAccessEdges: 0, serverActions: 0 };
  console.log(JSON.stringify(result));
  if (process.argv[2]) { assert.ok(resolve(process.argv[2]).startsWith(resolve("coverage") + "/")); await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n"); }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve("tests/storyline/video-highlights-offline/production-audit.mjs")) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
