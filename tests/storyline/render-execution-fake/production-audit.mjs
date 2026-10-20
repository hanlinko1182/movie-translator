import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
async function files(dir) {return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]))).flat();}
const forbidden=/render-execution-fake|execution_m803|m803-owned-fixture|execution_m803_session|createFakeExecutionServiceForTest|createFakeProcessOwnerForTest|M803_DISPOSABLE_ONLY|M803 opaque fake output/;
const chunks=(await files(".next/static/chunks")).filter(p=>p.endsWith(".js")),server=(await files(".next/server")).filter(p=>p.endsWith(".js"));
const sources=(await Promise.all(["app","components","scripts","workers"].map(files))).flat().filter(p=>/\.[cm]?[jt]sx?$/.test(p));
for(const p of [...chunks,...server,...sources])assert.ok(!forbidden.test(await readFile(p,"utf8")),p);
const routes=(await files("app/api")).filter(p=>/\/route\.[jt]s$/.test(p));assert.equal(routes.length,38);
const manifest=JSON.parse(await readFile(".next/server/server-reference-manifest.json","utf8"));assert.deepEqual(Object.keys(manifest.node),[]);assert.deepEqual(Object.keys(manifest.edge),[]);
const runtime=await files("lib/storyline/render-execution-fake");
for(const p of runtime){const s=await readFile(p,"utf8");assert.match(s,/import "server-only"/);assert.ok(!/node:child_process|\bfetch\s*\(|"use server"|process\.env|ffmpeg|ffprobe|lib\/video-render|voice\/durable-fake/.test(s),p);}
const secret=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{30,}/;
for(const p of [...runtime,...await files("tests/storyline/render-execution-fake"),"docs/STORYLINE_M8_03_FAKE_EXECUTION_FOUNDATION.md"])if(!p.endsWith("production-audit.mjs"))assert.ok(!secret.test(await readFile(p,"utf8")),p);
const result={clientChunks:chunks.length,serverJsFiles:server.length,productionSources:sources.length,apiRoutes:routes.length,serverActions:0,fakeExecutionProductionMatches:0,mediaOrNetworkRuntimeImports:0,secretMatches:0};
console.log(JSON.stringify(result));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(result,null,2));
