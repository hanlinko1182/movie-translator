import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat(); }
const forbidden = /render-planning|story-recap-render-|generateRenderRecipe|validateRenderRecipe|SyntheticRenderPlanningResolver|SYNTHETIC_MP4_H264_640X360_25_V1/;
const chunks = (await files(".next/static/chunks")).filter(f => f.endsWith(".js")), server = (await files(".next/server")).filter(f => f.endsWith(".js"));
const sources = (await Promise.all(["app", "components", "scripts", "workers"].map(files))).flat().filter(f => /\.[cm]?[jt]sx?$/.test(f));
for (const f of [...chunks, ...server, ...sources]) assert.ok(!forbidden.test(await readFile(f, "utf8")), f);
const routes = (await files("app/api")).filter(f => /\/route\.[jt]s$/.test(f)); assert.equal(routes.length, 38);
const actions = JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8")); assert.deepEqual(Object.keys(actions.node), []); assert.deepEqual(Object.keys(actions.edge), []);
const secret = /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{30,}/;
for (const f of [...await files("lib/storyline/render-planning"), ...await files("tests/storyline/render-planning"), "docs/STORYLINE_M8_01_RENDER_PLANNING.md"]) if (!f.endsWith("production-audit.mjs")) assert.ok(!secret.test(await readFile(f, "utf8")), f);
const result = { clientChunks: chunks.length, serverJsFiles: server.length, productionSources: sources.length, apiRoutes: routes.length, serverActions: 0, renderPlanningRuntimeOrTestMatches: 0, ownedSecretPatternMatches: 0 };
console.log(JSON.stringify(result)); if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2));
