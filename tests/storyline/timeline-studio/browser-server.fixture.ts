// Owned localhost harness; never imported by app/routes/components.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { timelineDatabaseFixture } from "../timeline-persistence/fixture";
import { createSyntheticTimelineAuthenticationForTest } from "@/lib/storyline/timeline-persistence/auth";
import { createTimelineGatewayForTest } from "@/lib/storyline/timeline-persistence/database";
import { TimelineStoreError } from "@/lib/storyline/timeline-persistence/contracts";
import type { DisposableTimelineRepository } from "@/lib/storyline/timeline-persistence/service";

import { safePreview } from "../highlights-studio/presentation.fixture";
import { highlightsFixture } from "../highlights/fixture";
import { inferredOptions } from "./presentation.fixture";
import { timelineAdapter } from "./adapter.fixture";

async function main() {
  const directory = process.argv[2]; assert.ok(directory?.startsWith("/tmp/storyline-m703-browser-"));
  globalThis.fetch = async () => assert.fail("No network/provider fetch");
  const f = await timelineDatabaseFixture(false, capture => Object.assign(capture, highlightsFixture(inferredOptions).capture)), original = JSON.stringify(f.m6.initial.capture);
  const score = await f.m6.api.preparePlan(f.m6.request(), { scope: f.scope, policy: { ...f.m6.fixture.input.policy, presentation: "SCORE_ORDER" }, audio: null });
  const choice = await f.m6.save({ schemaVersion: "story-highlight-save-proposal-v1", ...score, idempotencyKey: crypto.randomUUID() });
  assert.notEqual(choice.status, "UNKNOWN"); if (choice.status === "UNKNOWN") throw Error("ambiguous fixture");
  const chosen = choice.view;
  f.input.selected = { ...f.input.selected, id: chosen.record.id, version: chosen.record.version, recordHash: chosen.recordHash, planHash: chosen.record.plan.planHash };
  const originalRows = (await f.admin.query("SELECT tenant,project,movie,studio,id,value FROM highlight_m602.narration_snapshot ORDER BY tenant,project,movie,studio,id")).rows;
  let browserOrigin = "", fault = "none", readFault = false;
  const requests: { operation: string; code?: string }[] = [];
  const session = (name: string) => f.sessions.find(s => s.principalId === name)!;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const json = (v: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(v)); };
    try {
      const path = req.url?.split("?")[0];
      if (req.method === "GET" && ["/qa.js", "/style.css"].includes(path!)) { res.setHeader("Content-Type", path === "/qa.js" ? "text/javascript" : "text/css"); res.end(await readFile(join(directory, path!.slice(1)))); return; }
      if (req.method === "GET" && path?.startsWith("/projects/")) {
        if (!req.headers.cookie) res.setHeader("Set-Cookie", `timeline_m702_session=${session("editor-a").token}; HttpOnly; SameSite=Strict; Path=/`);
        res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="icon" href="data:,"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>'); return;
      }
      if (req.method !== "POST" || !["/isolated-fixture", "/test-control"].includes(path!)) { res.statusCode = 404; res.end(); return; }
      assert.equal(req.headers.origin, browserOrigin); assert.equal(req.headers["sec-fetch-site"], "same-origin");
      let bytes = ""; for await (const chunk of req) { bytes += chunk; if (Buffer.byteLength(bytes) > 3 * 1024 * 1024) throw new Error("Bounds"); }
      const body = JSON.parse(bytes);
      if (path === "/test-control") {
        if (body.action === "session") { assert.ok(["editor-a", "editor-b", "reader"].includes(body.name)); const s = session(body.name); res.setHeader("Set-Cookie", `timeline_m702_session=${s.token}; HttpOnly; SameSite=Strict; Path=/`); json({ identityKey: crypto.randomUUID(), csrf: s.csrf }); return; }
        if (body.action === "fault") { assert.ok(["none", "ack", "readback", "origin", "csrf", "stale", "not-found"].includes(body.value)); fault = body.value; readFault = fault === "readback"; await f.admin.query("UPDATE highlight_m602.current_dependency SET observed_reference=$1 WHERE tenant='tenant-one'", [JSON.stringify(fault === "stale" ? { ...f.m6.initial.capture.current, currentness: { ...f.m6.initial.capture.current.currentness, sourceRevision: 99 } } : f.m6.initial.capture.current)]); json({ ok: true }); return; }
        if (body.action === "competitor") { const p = await api.prepareTimeline(native("GET", "editor-b"), f.input); await api.saveVersion(native("POST", "editor-b"), native("GET", "editor-b"), { schemaVersion: "story-recap-timeline-save-proposal-v1", ...p, idempotencyKey: crypto.randomUUID() }); json({ ok: true }); return; }
        if (body.action === "m6-choice") {
          const saved = await f.m6.save(); assert.notEqual(saved.status, "UNKNOWN"); if (saved.status === "UNKNOWN") throw Error("ambiguous");
          const v = saved.view; f.input.selected = { ...f.input.selected, id: v.record.id, version: v.record.version, recordHash: v.recordHash, planHash: v.record.plan.planHash };
          json({ target: (await timelineAdapter(f)).target }); return;
        }
        if (body.action === "audit") { assert.equal(JSON.stringify(f.m6.initial.capture), original); assert.deepEqual((await f.admin.query("SELECT tenant,project,movie,studio,id,value FROM highlight_m602.narration_snapshot ORDER BY tenant,project,movie,studio,id")).rows, originalRows); json({ originalImmutable: true, counts: await f.counts(), requests }); return; }
        throw new Error("Unknown control");
      }
      assert.deepEqual(Object.keys(body).sort(), ["input", "operation"]);
      assert.ok(["prepareTimeline", "saveVersion", "readVersion", "readHead", "listHistory", "readOperation", "prepareHighlight"].includes(body.operation));
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      if (fault === "origin") headers.delete("origin"); if (fault === "csrf") headers.delete("x-timeline-m702-csrf");
      const request = (method: string) => new Request(`${browserOrigin}${req.url}`, { method, headers });
      const entry: { operation: string; code?: string } = { operation: body.operation }; requests.push(entry);
      try {
        if (body.operation === "prepareHighlight") {
          // Companion regression uses the actual native browser session first,
          // then the same server-verified principal's independent M6 request.
          const actor = gateway.authenticate(request("GET"), f.scope, "read");
          json({ value: await f.m6.api.preparePlan(f.m6.request(actor.principalId), body.input) }); return;
        }
        if (fault === "not-found" && body.operation === "saveVersion") throw new Error("transport interrupted before reaching save");
        if (body.operation === "readVersion" && readFault) { readFault = false; throw new Error("synthetic read failure"); }
        const service = fault === "ack" ? f.service({ gateway, afterCommitForTest: async () => { throw new Error("lost ack"); } }) : api;
        const result = body.operation === "saveVersion" ? await service.saveVersion(request("POST"), request("GET"), body.input) : await service[body.operation as Exclude<keyof DisposableTimelineRepository, "saveVersion">](request("GET"), body.input);
        json({ value: result });
      } catch (e) { entry.code = e instanceof TimelineStoreError ? e.code : "TRANSPORT_UNKNOWN"; json({ error: { code: entry.code } }); }
    } catch { res.statusCode = 400; json({ error: { code: "HARNESS_REJECTED" } }); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); const address = server.address(); assert.ok(address && typeof address !== "string"); browserOrigin = `http://127.0.0.1:${address.port}`;
  await f.admin.query("UPDATE timeline_m702.session SET origin=$1", [browserOrigin]);
  const authentication = createSyntheticTimelineAuthenticationForTest({ mode: "M702_DISPOSABLE_ONLY", origin: browserOrigin, sessions: f.sessions });
  const gateway = createTimelineGatewayForTest({ mode: "M702_DISPOSABLE_ONLY", connections: f.connections, keys: f.keys, authentication });
  const api = f.service({ gateway });
  function native(method: string, name: string) { const s = session(name); return new Request(`${browserOrigin}/isolated-fixture`, { method, headers: { origin: browserOrigin, "sec-fetch-site": "same-origin", cookie: `timeline_m702_session=${s.token}`, "x-timeline-m702-csrf": s.csrf } }); }
  const adapter = await timelineAdapter(f);
  process.stdout.write(JSON.stringify({ origin: browserOrigin, target: adapter.target, csrf: session("editor-a").csrf, artifact: safePreview(f.m6.initial.capture), highlightTarget: { scope: f.scope, source: f.m6.initial.capture.current, policy: f.m6.fixture.input.policy, audio: null } }) + "\n");
  let closed = false; async function close() { if (closed) return; closed = true; await new Promise<void>(r => server.close(() => r())); await f.stop(); }
  process.on("message", () => { void close().then(() => process.exit(0)); }); process.on("SIGTERM", () => { void close().then(() => process.exit(0)); });
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
