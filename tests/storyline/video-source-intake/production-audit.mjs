// Source/AST/build reads only; never imports the private reader or application runtime.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
async function files(root) {
  const out = [];
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) { const p = `${root}/${e.name}`; if (e.isDirectory()) out.push(...await files(p)); else out.push(p); }
  return out;
}
export async function auditRuntimeGraph(pureHandoff = false) {
  const seen = new Set();
  async function visit(file) {
    if (seen.has(file)) return; seen.add(file);
    assert.doesNotMatch(file, /narration-|video-highlights-offline|render-execution|maintenance-fake|ownership-exclusion|video-render|voice\/|prisma|queue|provider|generated|timeline|highlights-persistence/);
    if (pureHandoff) assert.ok(!file.endsWith("/reader.ts"));
    const s = await readFile(file, "utf8"), ast = ts.createSourceFile(file, s, ts.ScriptTarget.Latest, true);
    assert.doesNotMatch(s, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|spawn|execFile)\s*\(|use server|https?:\/\//);
    if (file.includes("video-source-intake/")) {
      assert.match(s, /^import "server-only";/);
      assert.doesNotMatch(s, /\.(?:write|writeFile|appendFile|mkdir|rm|rmdir|unlink|rename|copyFile|createWriteStream)\s*\(/);
    }
    function noDynamic(n) { assert.ok(!(ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword)); ts.forEachChild(n, noDynamic); } noDynamic(ast);
    for (const n of ast.statements) {
      if (!ts.isImportDeclaration(n) && !ts.isExportDeclaration(n)) continue;
      if (ts.isImportDeclaration(n) && (n.importClause?.isTypeOnly || n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings) && !n.importClause.name && n.importClause.namedBindings.elements.every(e => e.isTypeOnly)) || ts.isExportDeclaration(n) && n.isTypeOnly) continue;
      const spec = n.moduleSpecifier; if (!spec) continue; assert.ok(ts.isStringLiteral(spec)); const target = spec.text;
      if (!target.startsWith(".")) {
        const allowed = ["server-only", "node:crypto", ...(!pureHandoff && file.endsWith("/reader.ts") ? ["node:fs", "node:fs/promises", "node:path"] : [])];
        assert.ok(allowed.includes(target), target); continue;
      }
      const base = resolve(dirname(file), target); let found;
      for (const candidate of [base + ".ts", join(base, "index.ts")]) { try { await readFile(candidate); found = candidate; break; } catch { /* next candidate */ } }
      assert.ok(found, target); await visit(found);
    }
  }
  await visit(resolve(`lib/storyline/video-source-intake/${pureHandoff ? "handoff" : "index"}.ts`));
  const reader = await readFile("lib/storyline/video-source-intake/reader.ts", "utf8");
  assert.equal([...reader.matchAll(/fs\.open\(/g)].length, 1);
  assert.match(reader, /fs\.open\(c\.authorizedPath, C\.O_RDONLY \| C\.O_NOFOLLOW \| C\.O_NONBLOCK\)/);
  assert.equal([...reader.matchAll(/Buffer\.alloc\(/g)].length, 1); assert.match(reader, /Buffer\.alloc\(V\.chunkBytes\)/);
  return seen.size;
}
export async function auditProductionReferences() {
  const root = "lib/storyline/video-source-intake/", marker = /video-source-intake|story-private-video-(?:source-bytes|probe-handoff)-v1|authorizePrivateVideoSourceInspection|buildVideoProbeHandoff|issueCompletedInspection/;
  const sources = (await Promise.all(["app", "components", "lib", "workers", "scripts"].map(files))).flat().filter(p => /\.[cm]?[jt]sx?$/.test(p) && !p.startsWith(root));
  for (const p of sources) assert.ok(!marker.test(await readFile(p, "utf8")), p);
  return { sources: sources.length, marker };
}
async function main() {
  const runtimeGraphFiles = await auditRuntimeGraph(), pureHandoffGraphFiles = await auditRuntimeGraph(true), { sources, marker } = await auditProductionReferences();
  const bundles = [...await files(".next/server"), ...await files(".next/static")].filter(p => p.endsWith(".js")); assert.ok(bundles.length, "Fresh dummy build required");
  for (const p of bundles) assert.ok(!marker.test(await readFile(p, "utf8")), p);
  const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8")); assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
  const result = { status: "PASS", runtimeGraphFiles, pureHandoffGraphFiles, isolatedModules: (await files("lib/storyline/video-source-intake")).length,
    externalSources: sources, builtJavaScriptFiles: bundles.length, productionReferences: 0, forbiddenEdges: 0, serverActions: 0 };
  console.log(JSON.stringify(result));
  if (process.argv[2]) { assert.ok(resolve(process.argv[2]).startsWith(resolve("coverage") + "/")); await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n"); }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve("tests/storyline/video-source-intake/production-audit.mjs")) main().catch(error => { console.error(error); process.exitCode = 1; });
