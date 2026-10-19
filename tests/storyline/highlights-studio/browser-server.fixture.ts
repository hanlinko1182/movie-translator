// Owned localhost harness; never imported by app/routes/components.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { highlightDatabaseFixture } from "../highlights-persistence/fixture";
import { createSyntheticHighlightAuthenticationForTest } from "@/lib/storyline/highlights-persistence/auth";
import { createHighlightGatewayForTest } from "@/lib/storyline/highlights-persistence/database";
import { HighlightStoreError } from "@/lib/storyline/highlights-persistence/contracts";
import type { DisposableHighlightRepository } from "@/lib/storyline/highlights-persistence/service";
import { highlightsFixture } from "../highlights/fixture";
import { generateHighlightPlan } from "@/lib/storyline/highlights/planner";
import { fakeVoiceRestrictions } from "@/lib/storyline/voice/foundation/contracts";
import { safePreview } from "./presentation.fixture";
import { highlightAdapter } from "./adapter.fixture";

async function main() {
  const directory = process.argv[2]; assert.ok(directory?.startsWith("/tmp/storyline-m603-browser-"));
  globalThis.fetch = async () => assert.fail("No network/provider fetch");
  const f = await highlightDatabaseFixture(), original = JSON.stringify(f.initial.capture);
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
        if (!req.headers.cookie) res.setHeader("Set-Cookie", `highlight_m602_session=${session("editor-a").token}; HttpOnly; SameSite=Strict; Path=/`);
        res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="icon" href="data:,"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>'); return;
      }
      if (req.method !== "POST" || !["/test-rpc", "/test-control"].includes(path!)) { res.statusCode = 404; res.end(); return; }
      assert.equal(req.headers.origin, browserOrigin); assert.equal(req.headers["sec-fetch-site"], "same-origin");
      let bytes = ""; for await (const chunk of req) { bytes += chunk; if (Buffer.byteLength(bytes) > 3 * 1024 * 1024) throw new Error("Bounds"); }
      const body = JSON.parse(bytes);
      if (path === "/test-control") {
        if (body.action === "session") { assert.ok(["editor-a", "editor-b", "reader"].includes(body.name)); const s = session(body.name); res.setHeader("Set-Cookie", `highlight_m602_session=${s.token}; HttpOnly; SameSite=Strict; Path=/`); json({ identityKey: crypto.randomUUID(), csrf: s.csrf }); return; }
        if (body.action === "fault") { assert.ok(["none", "ack", "readback", "origin", "csrf", "stale", "not-found"].includes(body.value)); fault = body.value; readFault = fault === "readback"; await f.admin.query("UPDATE highlight_m602.current_dependency SET observed_reference=$1 WHERE tenant='tenant-one'", [JSON.stringify(fault === "stale" ? { ...f.initial.capture.current, currentness: { ...f.initial.capture.current.currentness, sourceRevision: 99 } } : f.initial.capture.current)]); json({ ok: true }); return; }
        if (body.action === "competitor") { const p = await api.preparePlan(native("GET", "editor-b"), { scope: f.scope, policy: f.fixture.input.policy, audio: null }); await api.saveVersion(native("POST", "editor-b"), native("GET", "editor-b"), { schemaVersion: "story-highlight-save-proposal-v1", ...p, idempotencyKey: crypto.randomUUID() }); json({ ok: true }); return; }
        if (body.action === "audit") { assert.equal(JSON.stringify(f.initial.capture), original); json({ originalImmutable: true, counts: await f.counts(), requests }); return; }
        throw new Error("Unknown control");
      }
      assert.deepEqual(Object.keys(body).sort(), ["input", "operation"]);
      assert.ok(["preparePlan", "saveVersion", "readVersion", "readHead", "listHistory", "readOperation"].includes(body.operation));
      const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
      if (fault === "origin") headers.delete("origin"); if (fault === "csrf") headers.delete("x-highlight-m602-csrf");
      const request = (method: string) => new Request(`${browserOrigin}/test-rpc`, { method, headers });
      const entry: { operation: string; code?: string } = { operation: body.operation }; requests.push(entry);
      try {
        if (fault === "not-found" && body.operation === "saveVersion") throw new Error("transport interrupted before reaching save");
        if (body.operation === "readVersion" && readFault) { readFault = false; throw new Error("synthetic read failure"); }
        const service = fault === "ack" ? f.service({ gateway, afterCommitForTest: async () => { throw new Error("lost ack"); } }) : api;
        const result = body.operation === "saveVersion" ? await service.saveVersion(request("POST"), request("GET"), body.input) : await service[body.operation as Exclude<keyof DisposableHighlightRepository, "saveVersion">](request("GET"), body.input);
        json({ value: result });
      } catch (e) { entry.code = e instanceof HighlightStoreError ? e.code : "TRANSPORT_UNKNOWN"; json({ error: { code: entry.code } }); }
    } catch { res.statusCode = 400; json({ error: { code: "HARNESS_REJECTED" } }); }
  });
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r)); const address = server.address(); assert.ok(address && typeof address !== "string"); browserOrigin = `http://127.0.0.1:${address.port}`;
  await f.admin.query("UPDATE highlight_m602.session SET origin=$1", [browserOrigin]);
  const authentication = createSyntheticHighlightAuthenticationForTest({ mode: "M602_DISPOSABLE_ONLY", origin: browserOrigin, sessions: f.sessions });
  const gateway = createHighlightGatewayForTest({ mode: "M602_DISPOSABLE_ONLY", connections: f.connections, keys: f.keys, authentication });
  const api = f.service({ gateway });
  function native(method: string, name: string) { const s = session(name); return new Request(`${browserOrigin}/test-rpc`, { method, headers: { origin: browserOrigin, "sec-fetch-site": "same-origin", cookie: `highlight_m602_session=${s.token}`, "x-highlight-m602-csrf": s.csrf } }); }
  // Supplemental presentation-only DTO covers competing interpretation and fake audio.
  const supplement = highlightsFixture({ candidate: c => { const first = c.findings.find(v => v.id === "inference-0")!; first.uncertainty = "COMPETING"; c.findings.push({ ...structuredClone(first), id: "inference-opposite", statement: "ယုံကြည်မှု ရှိနိုင်သည်။" }); c.contradictions.push({ firstFindingId: first.id, secondFindingId: "inference-opposite", explanation: "Competing synthetic interpretation" }); } });
  supplement.input.policy.presentation = "SCORE_ORDER";
  supplement.input.audio = { schemaVersion: "story-highlight-synthetic-audio-ref-v1", artifactId: "fake-reference", artifactHash: "a".repeat(64), planHash: "b".repeat(64), reference: supplement.input.source.narration, execution: "FAKE_ONLY", evidence: "SYNTHETIC_BYTE_INTEGRITY_ONLY", speech: "NOT_VERIFIED", verification: "REFERENCE_ONLY", restrictions: fakeVoiceRestrictions };
  const sample = generateHighlightPlan(supplement.input, supplement.resolver);
  // Only source/plan DTOs and a public CSRF token; no credentials/bootstrap/authority.
  process.stdout.write(JSON.stringify({ origin: browserOrigin, target: highlightAdapter(f).target, csrf: session("editor-a").csrf, artifact: safePreview(f.initial.capture), sample }) + "\n");
  let closed = false; async function close() { if (closed) return; closed = true; await new Promise<void>(r => server.close(() => r())); await f.stop(); }
  process.on("message", () => { void close().then(() => process.exit(0)); }); process.on("SIGTERM", () => { void close().then(() => process.exit(0)); });
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
