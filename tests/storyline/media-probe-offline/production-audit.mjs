// Static inspection of the implementation and fresh build.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const moduleRoot = "lib/storyline/media-probe-offline";
const marker = /media-probe-offline|story-offline-probe-|validateSyntheticProbeResult|assessSandboxReadiness|buildOfflineProbeHandoff|validateProbeSegmentBoundaries|validateSandboxProfile/;

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = `${root}/${entry.name}`;
    return entry.isDirectory() ? files(path) : path;
  }));
  return nested.flat();
}

export async function auditProbeGraph() {
  const owned = await files(moduleRoot);
  const allowed = new Set([...owned, "lib/storyline/canonical.ts", "lib/storyline/validation.ts",
    "lib/storyline/video-highlights-offline/rational.ts", "lib/storyline/video-highlights-offline/contracts.ts"].map(path => resolve(path)));
  const seen = new Set();
  async function visit(file) {
    if (seen.has(file)) return;
    assert.ok(allowed.has(file), file);
    seen.add(file);
    const source = await readFile(file, "utf8");
    if (file.startsWith(resolve(moduleRoot) + "/")) assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|spawn|execFile|execSync|fork)\s*\(|use server|https?:\/\//);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function check(node) {
      assert.ok(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), file);
      assert.ok(!ts.isImportEqualsDeclaration(node), file);
      ts.forEachChild(node, check);
    }
    check(ast);

    for (const statement of ast.statements) {
      if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
      if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly ||
        ts.isExportDeclaration(statement) && statement.isTypeOnly) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier) continue;
      assert.ok(ts.isStringLiteral(specifier));
      if (specifier.text.startsWith(".")) {
        await visit(resolve(dirname(file), specifier.text + ".ts"));
      } else {
        assert.ok(["server-only", "node:crypto"].includes(specifier.text), specifier.text);
      }
    }
  }
  await visit(resolve(moduleRoot, "index.ts"));
  for (const path of owned) assert.ok(seen.has(resolve(path)), path);
  return { runtimeFiles: seen.size, isolatedModules: owned.length };
}

export async function auditProductionReferences() {
  const sources = (await Promise.all(["app", "components", "lib", "workers", "scripts"].map(files))).flat()
    .filter(path => /\.[cm]?[jt]sx?$/.test(path) && !path.startsWith(moduleRoot + "/"));
  for (const path of sources) assert.doesNotMatch(await readFile(path, "utf8"), marker, path);
  return sources.length;
}

async function main() {
  const graph = await auditProbeGraph();
  const externalSources = await auditProductionReferences();
  const bundles = (await Promise.all([".next/server", ".next/static"].map(files))).flat().filter(path => path.endsWith(".js"));
  assert.ok(bundles.length > 0, "Fresh dummy-datasource build required");
  for (const path of bundles) assert.doesNotMatch(await readFile(path, "utf8"), marker, path);
  const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
  assert.deepEqual(Object.keys(actions.node), []);
  assert.deepEqual(Object.keys(actions.edge), []);
  const result = { status: "PASS", ...graph, externalSources, builtJavaScriptFiles: bundles.length,
    productionReferences: 0, forbiddenEdges: 0, serverActions: 0 };
  console.log(JSON.stringify(result));
  if (process.argv[2]) {
    assert.ok(resolve(process.argv[2]).startsWith(resolve("coverage") + "/"));
    await writeFile(process.argv[2], JSON.stringify(result, null, 2) + "\n");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve("tests/storyline/media-probe-offline/production-audit.mjs")) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
