// Dedicated child process, freshly owned PostgreSQL, localhost only. No Next API.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSyntheticStudioAuthenticationForTest } from "@/lib/storyline/studio-versions/synthetic-auth";
import { StudioVersionError } from "@/lib/storyline/studio-versions/errors";
import { studioVersionFixture } from "../studio-versions/fixture";
import { previewForTest } from "./adapter.fixture";

async function main() {
const directory = process.argv[2]; assert.ok(directory?.startsWith("/tmp/storyline-m9-save-browser-"));
globalThis.fetch = async () => assert.fail("No provider/network fetch in synthetic server");
const x = await studioVersionFixture(), artifact = await previewForTest(x), counts = await x.counts();
const originalBytes = JSON.stringify((await x.f.admin.query('SELECT "canonicalPayload" FROM public."StoryNarrationDraft" WHERE id=$1', [x.original.id])).rows[0]);
const requests: { operation: string; code?: string }[] = [];
let api = x.api, fault = "none", browserOrigin = "", csrf = x.sessions[0].csrfToken;
const session = (name: string) => x.sessions.find(s => s.principalId === name)!;
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const json = (value: unknown) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); };
  try {
    const path = req.url?.split("?")[0];
    if (req.method === "GET" && path === "/qa.js") { res.setHeader("Content-Type", "text/javascript"); res.end(await readFile(join(directory, "qa.js"))); return; }
    if (req.method === "GET" && path === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(await readFile(join(directory, "style.css"))); return; }
    if (req.method === "GET" && path?.startsWith("/projects/")) {
      if (!req.headers.cookie) res.setHeader("Set-Cookie", `story_r4_test_session=${session("editor-a").token}; HttpOnly; SameSite=Strict; Path=/`);
      res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="icon" href="data:,"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>'); return;
    }
    if (req.method !== "POST" || !["/test-rpc", "/test-control"].includes(path!)) { res.statusCode = 404; res.end(); return; }
    assert.equal(req.headers.origin, browserOrigin); assert.equal(req.headers["sec-fetch-site"], "same-origin");
    let bytes = ""; for await (const chunk of req) { bytes += chunk; if (Buffer.byteLength(bytes) > 524288) throw new Error("Too large"); }
    const body = JSON.parse(bytes);
    if (path === "/test-control") {
      if (body.action === "session") {
        assert.ok(["editor-a", "editor-b", "reader"].includes(body.name));
        const s = session(body.name); csrf = s.csrfToken;
        res.setHeader("Set-Cookie", `story_r4_test_session=${s.token}; HttpOnly; SameSite=Strict; Path=/`);
        json({ csrf, identityKey: `${body.name}-${crypto.randomUUID()}` }); return;
      }
      if (body.action === "fault") { assert.ok(["none", "rollback", "origin", "stale", "lost-response"].includes(body.value)); fault = body.value; x.f.media.setChanged(fault === "stale"); json({ ok: true }); return; }
      if (body.action === "competing-save") {
        const current = await x.api.readOriginal(x.request("editor-b"), { scope: x.scope, original: x.original });
        await x.api.saveVersion(x.request("editor-b", true), x.input(`competitor-${crypto.randomUUID()}`, current.latestRevision, current.latestVersion));
        json({ ok: true }); return;
      }
      if (body.action === "audit") {
        assert.equal(JSON.stringify((await x.f.admin.query('SELECT "canonicalPayload" FROM public."StoryNarrationDraft" WHERE id=$1', [x.original.id])).rows[0]), originalBytes);
        const after = await x.counts(); assert.deepEqual({ ...after, versions: counts.versions }, counts); assert.equal(x.wire.calls(), 1);
        json({ originalImmutable: true, noApprovalOrProviderSideEffects: true, versions: after.versions, requests }); return;
      }
      throw new Error("Unknown control");
    }
    assert.deepEqual(Object.keys(body).sort(), ["input", "operation"]);
    assert.ok(["readOriginal", "saveVersion", "readVersion", "listVersions"].includes(body.operation));
    // POST transport supplies the browser's real Origin/cookie/Fetch Metadata.
    // Read operation method translation is explicit; never synthesize identity,
    // scope, origin, CSRF or role from JSON. R4 checks all headers independently.
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(name, value);
    if (fault === "origin") headers.delete("origin");
    const native = new Request(`${browserOrigin}/test-rpc`, { method: body.operation === "saveVersion" ? "POST" : "GET", headers });
    const callApi = fault === "rollback" ? x.service({ authentication, afterInsertForTest: async () => { throw new Error("synthetic post-insert rollback"); } }) : api;
    const record: { operation: string; code?: string } = { operation: body.operation }; requests.push(record);
    try {
      const result = await callApi[body.operation as keyof typeof api](native, body.input);
      if (fault === "lost-response" && body.operation === "saveVersion") { fault = "none"; throw new Error("lost acknowledgement"); }
      json({ value: result });
    } catch (error) { const code = error instanceof StudioVersionError ? error.code : "R4_TRANSACTION_FAILED"; record.code = code; json({ error: { code } }); }
  } catch { res.statusCode = 400; json({ error: { code: "HARNESS_REJECTED" } }); }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address(); assert.ok(address && typeof address !== "string"); browserOrigin = `http://127.0.0.1:${address.port}`;
const authentication = createSyntheticStudioAuthenticationForTest({ mode: "DISPOSABLE_SYNTHETIC_ONLY", allowedOrigin: browserOrigin, sessions: x.sessions });
api = x.service({ authentication });
process.stdout.write(JSON.stringify({ origin: browserOrigin, artifact, target: { scope: x.scope, original: x.original }, csrf }) + "\n");
let closed = false;
async function close() { if (closed) return; closed = true; await new Promise<void>(resolve => server.close(() => resolve())); await x.close(); }
process.on("message", () => { void close().then(() => process.exit(0)); });
process.on("SIGTERM", () => { void close().then(() => process.exit(0)); });

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
