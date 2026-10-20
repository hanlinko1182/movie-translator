import assert from "node:assert/strict";
import { test, mock } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import fs from "node:fs";
import promises from "node:fs/promises";
import subprocess from "node:child_process";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { generateRenderRecipe, validateRenderRecipe } from "../../../lib/storyline/render-planning";
import { renderFixture } from "./fixture";

async function files(dir: string): Promise<string[]> { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat(); }
test("M8 transitive executable graph permits pure Storyline replay and hashing only, no media/DB/auth/storage/provider I/O", async () => {
  const seen = new Set<string>();
  async function visit(file: string): Promise<void> {
    if (seen.has(file)) return; seen.add(file);
    const source = await readFile(file, "utf8"), ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    assert.ok(!/\bfetch\s*\(|\b(?:execFile|spawn|require)\s*\(|process\.env/.test(source), file);
    function dynamic(node: ts.Node) { assert.ok(!(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword), file); ts.forEachChild(node, dynamic); }
    dynamic(ast);
    for (const node of ast.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (ts.isImportDeclaration(node) && node.importClause?.isTypeOnly || ts.isExportDeclaration(node) && node.isTypeOnly) continue;
      if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && !node.importClause.name && node.importClause.namedBindings.elements.every(e => e.isTypeOnly)) continue;
      const spec = node.moduleSpecifier; if (!spec || !ts.isStringLiteral(spec)) continue;
      if (!spec.text.startsWith(".") && !spec.text.startsWith("@/")) { assert.ok(["server-only", "node:crypto"].includes(spec.text), `${file}: ${spec.text}`); continue; }
      const path = spec.text.startsWith("@/") ? resolve(spec.text.slice(2)) : resolve(dirname(file), spec.text);
      assert.ok(!/(?:\/database|\/auth|\/service|\/tests\/|video-render|prisma|provider|source-media|\/storage|\/workers)/.test(path), `${file}: ${path}`);
      let target: string | undefined; for (const p of [path + ".ts", path + ".tsx", join(path, "index.ts")]) { try { await readFile(p); target = p; break; } catch { /* next */ } }
      assert.ok(target); await visit(target);
    }
  }
  await visit(resolve("lib/storyline/render-planning/index.ts")); assert.ok(seen.size > 20);
});
test("M8 no production source imports, bootstrap, route or worker composition", async () => {
  for (const dir of ["app", "components", "scripts", "workers"]) for (const file of await files(dir)) {
    if (/\.[cm]?[jt]sx?$/.test(file)) assert.ok(!/render-planning|story-recap-render-|generateRenderRecipe|validateRenderRecipe|SyntheticRenderPlanningResolver|SYNTHETIC_MP4_H264_640X360_25_V1/.test(await readFile(file, "utf8")), file);
  }
});
test("M8 generation and full replay perform zero filesystem/network/subprocess calls and preserve originals", async () => {
  const f = await renderFixture(), before = JSON.stringify(f.observation); let calls = 0;
  const forbidden = () => { calls++; throw Error("I/O forbidden in pure render planner"); };
  mock.method(fs, "openSync", forbidden); mock.method(fs, "readFileSync", forbidden); mock.method(fs, "writeFileSync", forbidden);
  for (const name of ["open", "readFile", "writeFile", "mkdir", "stat"] as const) mock.method(promises, name, forbidden);
  for (const name of ["spawn", "exec", "execFile", "spawnSync", "execSync", "execFileSync"] as const) mock.method(subprocess, name, forbidden);
  mock.method(http, "request", forbidden); mock.method(https, "request", forbidden); mock.method(net, "connect", forbidden); mock.method(net, "createConnection", forbidden); mock.method(globalThis, "fetch", forbidden);
  try { const p = await generateRenderRecipe(f.input, f.resolver); await validateRenderRecipe(p, f.input, f.resolver); }
  finally { mock.restoreAll(); }
  assert.equal(calls, 0); assert.equal(JSON.stringify(f.observation), before);
});
