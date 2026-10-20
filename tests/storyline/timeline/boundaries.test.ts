import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { generateRecapTimelinePlan, validateRecapTimelinePlan } from "../../../lib/storyline/timeline";
import { timelineFixture } from "./fixture";

async function files(dir: string): Promise<string[]> {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat();
}
test("transitive timeline runtime graph has no database/auth/network/provider/media/process I/O", async () => {
  const seen = new Set<string>();
  async function visit(file: string): Promise<void> {
    if (seen.has(file)) return; seen.add(file);
    const source = await readFile(file, "utf8"), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    assert.ok(!/\bfetch\s*\(|\b(?:execFile|spawn|require)\s*\(/.test(source), file);
    function rejectDynamic(node: ts.Node) {
      assert.ok(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), file);
      ts.forEachChild(node, rejectDynamic);
    }
    rejectDynamic(ast);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly || ts.isExportDeclaration(node) && node.isTypeOnly) continue;
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && !node.importClause.name && node.importClause.namedBindings.elements.every(e => e.isTypeOnly)) continue;
      const spec = node.moduleSpecifier; if (!spec || !ts.isStringLiteral(spec)) continue; const target = spec.text;
      if (!target.startsWith(".") && !target.startsWith("@/")) { assert.ok(["server-only", "node:crypto"].includes(target), `${file}: ${target}`); continue; }
      const path = target.startsWith("@/") ? resolve(target.slice(2)) : resolve(dirname(file), target);
      assert.ok(!/(?:\/database|\/auth|\/service|prisma|provider|source-media|\/tests\/)/.test(path), `${file}: ${path}`);
      let found: string | undefined;
      for (const candidate of [path + ".ts", path + ".tsx", join(path, "index.ts")]) { try { await readFile(candidate); found = candidate; break; } catch { /* try next file */ } }
      assert.ok(found, target); await visit(found);
    }
  }
  await visit(resolve("lib/storyline/timeline/index.ts")); assert.ok(seen.size > 10);
});
test("production sources have no timeline planner/resolver composition or activated test adapter", async () => {
  for (const dir of ["app", "components", "workers", "scripts"]) for (const file of await files(dir)) {
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = await readFile(file, "utf8");
    assert.ok(!/storyline\/timeline|generateRecapTimelinePlan|validateRecapTimelinePlan|SyntheticTimelineResolver/.test(source), file);
    // M7-03 explicitly authorizes metadata UI. Only its coordinator may contain
    // protocol domain literals for independent browser DTO hash verification.
    if (file !== "components/storyline/timeline-version-session.ts") assert.ok(!/story-recap-timeline-/.test(source), file);
    if (file.startsWith("app/")) assert.ok(!/timelineAdapterForTest\s*=/.test(source), file);
  }
});
test("pure generation/replay makes zero network calls and leaves fixture originals unchanged", async () => {
  const f = timelineFixture(), before = JSON.stringify(f.observation), originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => { calls++; throw Error("Network forbidden"); }) as typeof fetch;
  try { const p = await generateRecapTimelinePlan(f.input, f.resolver); await validateRecapTimelinePlan(p, f.input, f.resolver); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(calls, 0); assert.equal(JSON.stringify(f.observation), before);
});
