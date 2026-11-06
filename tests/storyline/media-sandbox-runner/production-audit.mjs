import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import ts from "typescript";

const root = "lib/storyline/media-sandbox-runner";
const marker = /media-sandbox-runner|story-media-sandbox-linux-x64-v1|qualification-fixture\.c|qualifyLinuxSandboxHost|buildMediaSandboxHandoff|M10-04D harmless descriptor canary/;
const pinnedDependencies = new Set([
  "server-only", "node:crypto", "node:child_process", "node:fs", "node:fs/promises", "node:os",
  "node:path", "node:timers/promises",
]);
const allowedLaunches = ["/proc/self/fd/3", "/usr/bin/cc"];
const launches = [];

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = root + "/" + entry.name;
    return entry.isDirectory() ? files(path) : path;
  }));
  return nested.flat();
}

const sources = (await files(root)).sort();
const typescript = sources.filter(path => path.endsWith(".ts"));
for (const path of typescript) {
  const source = await readFile(path, "utf8");
  assert.match(source, /^import "server-only";/);
  assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|\b(?:require|eval|Function|execFile|execSync|fork)\s*\(|use server|https?:\/\//, path);
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function inspect(node) {
    assert.ok(!ts.isImportEqualsDeclaration(node));
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const specifier = node.moduleSpecifier;
      assert.ok(ts.isStringLiteral(specifier), path);
      assert.ok(pinnedDependencies.has(specifier.text) ||
        /^\.\/[a-z-]+$/.test(specifier.text) && typescript.includes(root + specifier.text.slice(1) + ".ts"), specifier.text);
    }
    if (ts.isCallExpression(node)) {
      assert.notEqual(node.expression.kind, ts.SyntaxKind.ImportKeyword);
      if (node.expression.getText(ast) === "spawn") {
        assert.equal(path, root + "/runner.ts");
        assert.ok(ts.isStringLiteral(node.arguments[0]));
        const options = node.arguments[2];
        assert.ok(ts.isObjectLiteralExpression(options));
        assert.ok(options.properties.some(property => property.getText(ast) === "shell: false"));
        assert.ok(options.properties.some(property => property.getText(ast) === "detached: true"));
        launches.push(node.arguments[0].text);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(ast);
}
assert.deepEqual(launches, allowedLaunches);
const fixture = await readFile(root + "/qualification-fixture.c", "utf8");
const digest = createHash("sha256").update(fixture).digest("hex");
assert.ok((await readFile(root + "/runner.ts", "utf8")).includes('const fixtureSourceHash = "' + digest + '"'));
assert.doesNotMatch(fixture, /\b(?:system|popen|exec[a-z]+|socket|connect)\s*\(|\b(?:ffmpeg|ffprobe)\b/i);
const policy = await readFile(root + "/contracts.ts", "utf8");
assert.equal(/alarm\((\d+)\)/.exec(fixture)?.[1], /nativeWatchdogSeconds: (\d+)/.exec(policy)?.[1]);
assert.equal(/limit\(RLIMIT_CPU, (\d+)\)/.exec(fixture)?.[1], /cpuSeconds: (\d+)/.exec(policy)?.[1]);
assert.equal(/limit\(RLIMIT_AS, (\d+) \* MIB\)/.exec(fixture)?.[1], /addressSpaceBytes: (\d+) \*/.exec(policy)?.[1]);

const external = (await Promise.all(["app", "components", "lib", "scripts", "workers"].map(files))).flat()
  .filter(path => /\.[cm]?[jt]sx?$/.test(path) && !path.startsWith(root + "/"));
for (const path of external) assert.doesNotMatch(await readFile(path, "utf8"), marker, path);

const bundles = (await Promise.all([".next/server", ".next/static"].map(files))).flat().filter(path => path.endsWith(".js"));
assert.ok(bundles.length > 0, "Fresh dummy-datasource build required");
for (const path of bundles) assert.doesNotMatch(await readFile(path, "utf8"), marker, path);
const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
assert.deepEqual(Object.keys(actions.node), []);
assert.deepEqual(Object.keys(actions.edge), []);
console.log(JSON.stringify({ status: "PASS", sources: sources.length, fixedLaunches: launches.length,
  externalSources: external.length, bundles: bundles.length, productionReferences: 0, serverActions: 0 }));
