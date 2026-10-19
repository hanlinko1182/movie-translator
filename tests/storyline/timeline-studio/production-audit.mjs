import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat(); }
const forbidden = /timeline_m702|m702_(read|create)_|M702_DISPOSABLE_ONLY|createDisposableTimelineRepositoryForTest|createSyntheticTimelineAuthenticationForTest|createTimelineGatewayForTest|timelineDatabaseFixture|\/isolated-fixture|\/test-rpc|\/test-control|__TIMELINE_BOOT__|movie-translator-storyline-m1e15-|DisposableStorylinePostgres|generateRecapTimelinePlan|validateRecapTimelinePlan|SyntheticTimelineResolver|story-recap-timeline-(?:stored-dependency|currentness-fence|save-audit)-v1/;
const chunks = (await files(".next/static/chunks")).filter(f => f.endsWith(".js"));
const server = (await files(".next/server")).filter(f => f.endsWith(".js"));
for (const f of [...chunks, ...server]) assert.ok(!forbidden.test(await readFile(f, "utf8")), f);
const sources = (await Promise.all(["app", "components", "workers", "scripts"].map(files))).flat().filter(f => /\.[cm]?[jt]sx?$/.test(f));
for (const f of sources) {
  const s = await readFile(f, "utf8"); assert.ok(!forbidden.test(s), f);
  assert.ok(!/from\s*["'][^"']*(?:tests\/|timeline-persistence|storyline\/timeline)/.test(s), f);
  if (f.startsWith("app/")) assert.ok(!/timelineAdapterForTest\s*=/.test(s), f);
}
const bridge = await readFile("lib/storyline/studio-timeline-types.ts", "utf8");
assert.equal(bridge.replace(/\/\*[\s\S]*?\*\//g, "").replace(/export type \{[^}]+\} from "[^"]+";/g, "").trim(), "", "Bridge must contain types only");
const routes = (await files("app/api")).filter(f => /\/route\.[jt]s$/.test(f)); assert.equal(routes.length, 38); assert.ok(!routes.some(f => /timeline/.test(f)));
const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8")); assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
const owned = ["lib/storyline/studio-timeline-types.ts", "components/storyline/timeline-version-session.ts", "components/storyline/timeline-workspace.tsx", "components/storyline/recap-studio-shell.tsx", "docs/STORYLINE_M7_03_TIMELINE_STUDIO_UI.md", ...(await files("tests/storyline/timeline-studio"))];
const secret = /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{30,}/;
for (const f of owned) if (!f.endsWith("production-audit.mjs")) assert.ok(!secret.test(await readFile(f, "utf8")), f);
const result = { clientChunks: chunks.length, serverJsFiles: server.length, productionSources: sources.length, apiRoutes: routes.length, serverActions: 0, serverAuthorityOrTestTransportMatches: 0, secretPatternMatches: 0, typeOnlyBridge: true };
console.log(JSON.stringify(result)); if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2));
