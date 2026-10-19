import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat(); }
const marker = /timeline_m702|m702_(?:read|create)_|M702_DISPOSABLE_ONLY|createDisposableTimelineRepositoryForTest|createSyntheticTimelineAuthenticationForTest|createTimelineGatewayForTest|timelineDatabaseFixture|timeline-persistence|story-recap-timeline-(?:save-proposal|saved-record|stored-dependency|currentness-fence|save-audit)-v1/;
const chunks = (await files(".next/static/chunks")).filter(f => f.endsWith(".js"));
const server = (await files(".next/server")).filter(f => f.endsWith(".js"));
for (const f of [...chunks, ...server]) assert.ok(!marker.test(await readFile(f, "utf8")), f);
const sources = (await Promise.all(["app", "components", "workers", "scripts"].map(files))).flat().filter(f => /\.[cm]?[jt]sx?$/.test(f));
for (const f of sources) assert.ok(!marker.test(await readFile(f, "utf8")), f);
const routes = (await files("app/api")).filter(f => /\/route\.[jt]s$/.test(f));
assert.equal(routes.length, 38); assert.ok(!routes.some(f => /timeline/.test(f)));
const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8"));
assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
const owned = [...await files("lib/storyline/timeline-persistence"), ...await files("tests/storyline/timeline-persistence"), "docs/STORYLINE_M7_02_TIMELINE_PERSISTENCE.md"];
const secret = /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{30,}/;
for (const f of owned) if (!f.endsWith("production-audit.mjs")) assert.ok(!secret.test(await readFile(f, "utf8")), f);
const result = { clientChunks: chunks.length, serverJsFiles: server.length, productionSources: sources.length, apiRoutes: routes.length,
  serverActions: 0, timelineRuntimeMarkers: 0, ownedSecretPatternMatches: 0 };
console.log(JSON.stringify(result)); if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2));
