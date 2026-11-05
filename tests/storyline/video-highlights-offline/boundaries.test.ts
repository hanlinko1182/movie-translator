import assert from "node:assert/strict";
import { test } from "node:test";
import { auditPureRuntime, auditProductionReferences } from "./production-audit.mjs";
import { assessNarrationCompatibility, buildOfflineHighlightPlan, buildOfflineVideoTimelinePreview, OfflineVideoError } from "../../../lib/storyline/video-highlights-offline";
import { fixture, narration } from "./fixture";

test("transitive runtime graph excludes filesystem, private store, M6/M7 persistence, M8 authority, SDKs, network and media execution", async () => {
  assert.ok(await auditPureRuntime() >= 10);
});
test("production sources/barrels/routes/workers contain no offline planner composition", async () => {
  const result = await auditProductionReferences(); assert.ok(result.sources > 300);
});
test("planning and compatibility do not dispatch network, log private input, or expose approval authority", t => {
  let network = 0, logs = 0;
  t.mock.method(globalThis, "fetch", () => { network++; throw Error("OFFLINE_NETWORK_DENIED"); });
  for (const method of ["log", "warn", "error", "info"] as const) t.mock.method(console, method, () => { logs++; });
  const f = fixture(), p = buildOfflineHighlightPlan(f.source, f.request), v = buildOfflineVideoTimelinePreview(p), a = assessNarrationCompatibility(p, narration(101));
  const poison = { ...f.request, privatePath: "/private/PRIVATE_PATH_MARKER", receipt: "PRIVATE_RECEIPT_MARKER", credential: "SYNTHETIC_SECRET_MARKER" };
  assert.throws(() => buildOfflineHighlightPlan(f.source, poison), (e: unknown) => {
    assert.ok(e instanceof OfflineVideoError); assert.doesNotMatch(String(e) + JSON.stringify(e), /PRIVATE_PATH_MARKER|PRIVATE_RECEIPT_MARKER|SYNTHETIC_SECRET_MARKER/); return true;
  });
  const serialized = JSON.stringify({ source: f.source, p, v, a });
  assert.doesNotMatch(serialized, /PRIVATE_PATH_MARKER|PRIVATE_RECEIPT_MARKER|SYNTHETIC_SECRET_MARKER|"data":|"sealKey"|"filePath"/);
  assert.equal(network, 0); assert.equal(logs, 0); assert.equal(a.restrictions.rendered, false); assert.equal(a.restrictions.spendingAuthority, "NONE");
});
