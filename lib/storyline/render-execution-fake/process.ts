import "server-only";
import { envelope, reject, type Context, type Envelope } from "./contracts";
import { byteHash } from "./storage";

/** Arbitrary UTF-8 diagnostic bytes. No media header, parser, subprocess, or adapter fallback. */
export const expectedFakeOutput = (workHash: string) => Uint8Array.from(Buffer.from(`M803 opaque fake output\n${workHash}\nNOT MEDIA\n`, "utf8"));
export type FakePermit = Readonly<{ toJSON(): never }>;
export function createFakeProcessOwnerForTest() {
  const permits = new WeakMap<FakePermit,{ context: Context; id: string; submission: string; workHash: string; owner: number; deadline:number }>();
  const started = new Set<string>(), journal = new Map<string,Envelope>(),cancelled=new Set<string>(); let starts=0,busy=false;
  return Object.freeze({
    /** Trusted server composition calls only on the original acknowledged path. */
    arm(context: Context,id:string,submission:string,workHash:string,owner:number): FakePermit {
      const cap = Object.freeze({ toJSON(): never { return reject("NON_SERIALIZABLE"); } });
      permits.set(cap,{context,id,submission,workHash,owner,deadline:performance.now()+1000}); return cap;
    },
    async invoke(cap: FakePermit, owner: number, fault: "NONE"|"BEFORE_START"|"AFTER_START"|"UNKNOWN"|"FAILURE"="NONE", barrier:()=>Promise<void>=async()=>{}) {
      const p=permits.get(cap); permits.delete(cap); // Burn before first asynchronous boundary.
      if (!p || p.owner!==owner || started.has(p.id)||busy||cancelled.has(p.id)||performance.now()>=p.deadline) reject("NO_INVOCATION_PERMIT");
      if (fault === "BEFORE_START") reject("FLOW_CRASH");
      started.add(p.id); starts++;busy=true; await barrier();
      if (fault === "AFTER_START" || fault === "UNKNOWN") reject("RESULT_UNKNOWN");
      const bytes=expectedFakeOutput(p.workHash);
      const result=envelope("result",p.context,{operationId:p.id,submissionId:p.submission,generation:1,outcome:fault==="FAILURE"?"FAILURE":"SUCCESS",quiescence:"QUIESCENT",byteSha256:fault==="FAILURE"?null:byteHash(bytes),byteCount:fault==="FAILURE"?0:bytes.length});
      journal.set(p.id,result);busy=false; return { result, bytes:fault==="FAILURE"?null:bytes };
    },
    originalResult(id:string) { return journal.get(id) ?? null; },
    cancelAndObserve(id:string) {cancelled.add(id);return Object.freeze({quiescence:journal.has(id)?"QUIESCENT":"UNKNOWN"});},
    starts:()=>starts,
  });
}
export type FakeProcessOwner = ReturnType<typeof createFakeProcessOwnerForTest>;
