import test from "node:test";
import assert from "node:assert/strict";
import { corpus } from "./corpus.fixture";
import { selection } from "./capabilities.fixture";
import { D, digest } from "./contracts.fixture";
import { fixedRequest, createOfflineHarnessForTest, createMockPortForTest } from "./harness.fixture";
import { proposalForTest, createMockSpendingAssessorForTest } from "./spending.fixture";
function fixture(config=0,voice=0) { const c=corpus(),requests=c.payload.passages.map((_,i)=>fixedRequest(c,i,selection(config,voice))),p=proposalForTest(requests),a=createMockSpendingAssessorForTest(p);
  return {c,requests,p,a,ticket:a.assess(p,1000000),h:createOfflineHarnessForTest(c),port:createMockPortForTest()}; }
for(const [config,voice,label] of [[0,0,"OpenRouter Eleven v3 stock candidate"],[1,0,"OpenRouter full Gemini stock candidate"]] as const) test(`${label}: six fixed originals yield only redacted non-audio observations`,async()=>{
  const f=fixture(config,voice);
  for(const r of f.requests){const result=await f.h.submit(r,f.ticket,f.port.port);assert.equal(result.status,"MOCK_OBSERVED");assert.equal(result.audioVerified,false);assert.equal(result.liveEligible,false);
    assert.equal(result.actualDurationMs,null);assert.ok(result.fixtureByteCount && result.fixtureHash);for(const privateValue of [r.text,r.accountRef,r.requestId])assert.equal(JSON.stringify(result).includes(privateValue),false);}
  assert.equal(f.port.calls(),6);assert.equal(f.a.snapshot().reservedMicros,1230);assert.equal(f.port.credentialLabel,"OFFLINE_PLACEHOLDER_NOT_A_KEY");
  assert.equal(f.h.liveReadiness().verdict,"NO_GO");
});
for(const scenario of ["LOST_ACK","TIMEOUT","HTTP_429"] as const)test(`${scenario}: sticky original UNKNOWN, no automatic or explicit second invocation`,async()=>{
  const f=fixture(),p=createMockPortForTest(scenario),r=f.requests[0];const first=await f.h.submit(r,f.ticket,p.port);
  assert.equal(first.status,"UNKNOWN");assert.deepEqual(await f.h.submit(r,f.ticket,createMockPortForTest().port),first);
  await assert.rejects(f.h.submit(f.requests[1],f.ticket,p.port));await assert.rejects(f.h.submit({...r,requestId:"new-key"},f.ticket,p.port));
  assert.equal(p.calls(),1);assert.equal(f.a.snapshot().unresolved,true);assert.equal(f.a.snapshot().reservedMicros,205);
});
test("one original cannot use a different configuration after a definitive mock result",async()=>{
  const f=fixture();await f.h.submit(f.requests[0],f.ticket,f.port.port);
  await assert.rejects(f.h.submit(fixedRequest(f.c,0,selection(1)),f.ticket,f.port.port));assert.equal(f.port.calls(),1);
});
test("permit-like copies, new harness objects and new assessment handles cannot rerun a retained original",async()=>{
  const f=fixture(),p=createMockPortForTest("LOST_ACK");await f.h.submit(f.requests[0],f.ticket,p.port);
  const h=createOfflineHarnessForTest(f.c),fresh=f.a.assess(f.p,1000000),next=createMockPortForTest();
  await assert.rejects(h.submit(f.requests[0],fresh,next.port));await assert.rejects(h.submit(f.requests[1],fresh,next.port));assert.equal(next.calls(),0);assert.equal(p.calls(),1);
});
test("pending duplicate and global concurrent dispatch cannot create a second call",async()=>{
  const f=fixture(),held=createMockPortForTest("HELD_SUCCESS"),other=fixture(1);let pending:Promise<unknown>|undefined;
  try{pending=f.h.submit(f.requests[0],f.ticket,held.port);assert.equal(held.calls(),1);
    assert.equal((await f.h.submit(f.requests[0],f.ticket,held.port)).status,"RESERVED");
    await assert.rejects(other.h.submit(other.requests[0],other.ticket,other.port.port));assert.equal(other.port.calls(),0);
  }finally{held.releaseForTest();await pending;}
  assert.equal(held.calls(),1);assert.equal(f.h.inspect(digest(D.request,f.requests[0]))?.status,"MOCK_OBSERVED");
});
test("revocation or expiry before observation fence retains UNKNOWN and no response bytes",async()=>{
  for(const revoke of [true,false]){const f=fixture(),held=createMockPortForTest("HELD_SUCCESS");const pending=f.h.submit(f.requests[0],f.ticket,held.port,1000000,revoke?1000000:1060000);
    if(revoke)f.a.revokeForTest();held.releaseForTest();const result=await pending;assert.equal(result.status,"UNKNOWN");assert.equal(result.fixtureHash,null);assert.equal(f.a.snapshot().unresolved,true);assert.equal(held.calls(),1);}
});
test("definitive mock rejection retains original charge/identity without replacement or fallback",async()=>{
  const f=fixture(),p=createMockPortForTest("REJECTED");assert.equal((await f.h.submit(f.requests[0],f.ticket,p.port)).status,"MOCK_REJECTED");
  await f.h.submit(f.requests[0],f.ticket,p.port);assert.equal(p.calls(),1);assert.equal(f.a.snapshot().reservedMicros,205);
  assert.equal(f.h.inspect("a".repeat(64)),null);for(const k of ["retry","fallback","sendLive","approve","reconcileAndResend"])assert.equal(k in f.h,false);
});
