import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat(); }
const forbidden = /createDisposableHighlightRepositoryForTest|createSyntheticHighlightAuthenticationForTest|createHighlightGatewayForTest|highlight_m602|m602_(read|create)_|M602_DISPOSABLE_ONLY|movie-translator-storyline-m1e15-|DisposableStorylinePostgres|highlightDatabaseFixture|\/test-rpc|\/test-control|__HIGHLIGHT_BOOT__|createDurableFake|createPrivateFake|createSyntheticVoice/;
const chunks = (await files(".next/static/chunks")).filter(f => f.endsWith(".js"));
for (const f of chunks) assert.ok(!forbidden.test(await readFile(f, "utf8")), f);
const sources = (await Promise.all(["app", "components", "workers", "scripts"].map(files))).flat().filter(f => /\.[cm]?[jt]sx?$/.test(f));
for (const f of sources) {
  const s = await readFile(f, "utf8"); assert.ok(!forbidden.test(s), f);
  assert.ok(!/from\s*["'][^"']*(?:tests\/|highlights-persistence|highlights\/(?:planner|resolution|input|candidates))/.test(s), f);
  if (f.startsWith("app/")) assert.ok(!/highlightsAdapterForTest=|versionAdapterForTest=|previewForTest=/.test(s), f);
}
const bridge = await readFile("lib/storyline/studio-highlight-types.ts", "utf8");
assert.equal(bridge.replace(/\/\*[\s\S]*?\*\//g, "").replace(/export type \{[^}]+\} from "[^"]+";/g, "").trim(), "", "Bridge must contain types only");
const routes = (await files("app/api")).filter(f => /\/route\.[jt]s$/.test(f)); assert.equal(routes.length, 38); assert.ok(!routes.some(f => /voice|audio|highlight/.test(f)));
const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8")); assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
const owned = ["lib/storyline/studio-highlight-types.ts", "components/storyline/highlight-version-session.ts", "components/storyline/highlights-workspace.tsx", ...(await files("tests/storyline/highlights-studio"))];
const secret = /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{30,}/;
for (const f of owned) { if (f.endsWith("production-audit.mjs")) continue; assert.ok(!secret.test(await readFile(f, "utf8")), f); }
const result = { clientChunks: chunks.length, apiRoutes: routes.length, serverActions: 0, serverAuthorityOrTestTransportMatches: 0, secretPatternMatches: 0, typeOnlyBridge: true };
console.log(JSON.stringify(result)); if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2));
