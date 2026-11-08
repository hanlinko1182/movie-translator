// Read source/build text only. Never imports application or provider runtime.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
async function files(root) { const out=[]; for(const e of await readdir(root,{withFileTypes:true}).catch(()=>[])) { const p=`${root}/${e.name}`; if(e.isDirectory())out.push(...await files(p));else out.push(p); }return out; }
const marker=/tts-evaluation|story-tts-offline-|story-tts-unissued-spending-proposal|story-tts-nonaudio-mock|createOfflineHarnessForTest|OFFLINE_PLACEHOLDER_NOT_A_KEY/;
const sources=(await Promise.all(["app","components","lib","workers","scripts"].map(files))).flat().filter(p=>/\.[cm]?[jt]sx?$/.test(p));
const bundles=[...await files(".next/server"),...await files(".next/static")].filter(p=>p.endsWith(".js"));
assert.ok(bundles.length>0,"Fresh dummy build is required for bundle acceptance");
for(const p of [...sources,...bundles])assert.ok(!marker.test(await readFile(p,"utf8")),p);
const fixtures=(await files("tests/storyline/tts-evaluation")).filter(p=>p.endsWith(".fixture.ts"));
assert.equal(fixtures.length,5);
for(const p of fixtures){const s=await readFile(p,"utf8");assert.match(s,/import "server-only"/);
  assert.ok(!/\bfetch\s*\(|process\.env|node:(?:http|https|net|tls|dns|child_process|fs)|@openrouter|from ["'][^"']*(?:render-execution|maintenance-fake|ownership-exclusion|voice\/|video-render|prisma|queue)|https?:\/\//.test(s),p);
  const imports=[...s.matchAll(/from ["']([^"']+)["']/g)].map(m=>m[1]);
  assert.ok(imports.every(x=>x==="node:crypto"||x.startsWith("./")||["../../../lib/storyline/canonical","../../../lib/storyline/validation"].includes(x)),p);
}
const routes=(await files("app/api")).filter(p=>/\/route\.[jt]s$/.test(p));assert.equal(routes.length,38);
const actions=JSON.parse(await readFile(".next/server/server-reference-manifest.json","utf8"));assert.deepEqual(Object.keys(actions.node),[]);assert.deepEqual(Object.keys(actions.edge),[]);
const result={status:"PASS",productionSources:sources.length,builtJavaScriptFiles:bundles.length,testOnlyFixtures:fixtures.length,productionMarkerMatches:0,networkOrSdkFixtureImports:0,apiRoutes:routes.length,serverActions:0};
console.log(JSON.stringify(result));if(process.argv[2]){assert.ok(resolve(process.argv[2]).startsWith(resolve("coverage")+"/"));await writeFile(process.argv[2],JSON.stringify(result,null,2)+"\n");}
