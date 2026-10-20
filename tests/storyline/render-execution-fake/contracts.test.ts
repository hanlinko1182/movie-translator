import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { EXECUTION, envelope, envelopeHash, fakeProfile, measurements, parseEnvelope, profileHash, workHash } from "../../../lib/storyline/render-execution-fake/contracts";
import { renderFixture } from "../render-planning/fixture";
import { generateRenderRecipe } from "../../../lib/storyline/render-planning/planner";
import { newSessionFixture,createSyntheticExecutionAuthenticationForTest,verifyExecutionRequest } from "../../../lib/storyline/render-execution-fake/auth";

const context = { namespace: "fixture-one", scope: { tenantId: "tenant-one", projectId: "p", movieId: "m", studioId: "s" } };
const h = "a".repeat(64), version = "a".repeat(32);
test("fourteen distinct frozen design domains; real verification absent", () => {
  assert.equal(new Set(Object.values(EXECUTION)).size, 14);
  assert.equal(EXECUTION.verification, "story-recap-execution-fake-byte-verification-v1");
  assert.ok(!Object.values(EXECUTION).includes("story-recap-execution-verification-v1" as never));
});
test("complete exact fake envelope round trip", () => {
  const v = envelope("source", context, { handle: "handle-one", ownerId: "owner", version, byteSha256: h, byteCount: 10, generation: 1, expiresAtMs: 999999 });
  assert.equal(canonicalJson(parseEnvelope("source", v)), canonicalJson(v)); assert.ok(Object.isFrozen(v.body));
  assert.equal(envelopeHash("source", v).length, 64);
});
for (const key of ["role", "path", "url", "command", "filterGraph", "approval", "permit"]) test(`rejects ${key} injection`, () => {
  const v = envelope("profile", context, { profile: fakeProfile });
  assert.throws(() => parseEnvelope("profile", { ...v, [key]: "forged" }));
  assert.throws(() => parseEnvelope("profile", { ...v, body: { ...v.body, [key]: "forged" } }));
});
for (const key of ["codec", "frames", "duration", "streams"]) test(`rejects actual ${key} claims`, () => {
  const v = envelope("verification", context, { operationId: "op", resultHash: h, sourceHash: h, recipeHash: h, dependencyHash: h, profileHash: h, version, byteSha256: h, byteCount: 1, measurements });
  assert.throws(() => parseEnvelope("verification", { ...v, body: { ...v.body, measurements: { ...measurements, [key]: "MEASURED" } } }));
});
for (const value of [0, -1, 1048577, 0.5, Number.MAX_SAFE_INTEGER+1]) test(`rejects byte bound ${value}`, () => {
  assert.throws(() => envelope("stage", context, { operationId: "op", version, byteSha256: h, byteCount: value }));
});
test("strict serialization denies getters, cycles, -0 and nonserializable capabilities", () => {
  let calls = 0; const getter = { get body() { calls++; return {}; } }; assert.throws(() => parseEnvelope("profile", getter)); assert.equal(calls, 0);
  const cycle: Record<string, unknown> = {}; cycle.self=cycle; assert.throws(() => parseEnvelope("profile", cycle));
  assert.throws(() => envelope("audit", context, { operationId: "op", action: "test", revision: -0, principalId: "actor", timeMs: 1 }));
});
test("new execution work aliases keys without mutating disabled recipe", async () => {
  const f = await renderFixture(), recipe = await generateRenderRecipe(f.input, f.resolver), before = canonicalJson(recipe);
  const c = { ...context, scope: f.input.scope }, a = envelope("request", c, { key: "one", recipe, sourceHash: h, profileHash });
  const b = envelope("request", c, { ...a.body, key: "two" }); assert.equal(workHash(a), workHash(b));
  assert.notEqual(envelopeHash("request", a), envelopeHash("request", b)); assert.equal(canonicalJson(recipe), before);
  assert.equal(recipe.recipe.restrictions.executable, false);
  assert.throws(() => parseEnvelope("request", { ...a, body: { ...a.body, executable: true } }));
});
test("serialized test identity or browser role claim cannot authenticate",()=>{
 const s=newSessionFixture(context),a=createSyntheticExecutionAuthenticationForTest([s]);
 const request=new Request(`${s.origin}/isolated-fixture`,{headers:{origin:s.origin,"sec-fetch-site":"same-origin",cookie:`execution_m803_session=${s.token}`}});
 assert.equal(verifyExecutionRequest(a.authentication,request,context,"read").id,s.id);
 assert.throws(()=>verifyExecutionRequest(JSON.parse(JSON.stringify(a.authentication)),request,context,"read"));
 assert.throws(()=>verifyExecutionRequest({mode:"M803_DISPOSABLE_ONLY"},new Request(`${s.origin}/isolated-fixture`,{headers:{role:"owner"}}),context,"read"));
});
