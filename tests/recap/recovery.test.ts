import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { readFile } from "node:fs/promises";
import { retryRecap, createRecapQueue, RECAP_JOB_NAME } from "@/lib/queue/recap-queue";
import { parseRecapRetry, recapFailureToken } from "@/lib/recap/recovery";
import { recapRequest, recapSubmissionGate } from "@/lib/recap/client";
import { RecapError } from "@/lib/recap/types";
import { POST } from "@/app/api/movies/[id]/recap/generate/retry/route";
import { movieId, hash, jobId, failureToken } from "./recovery.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("No network/provider requests allowed")); });
after(() => mock.restoreAll());
const body = { jobId, failureToken, acknowledged: true };
function fixture(state = "failed") {
  let currentState = state;
  let token = failureToken;
  let retries = 0;
  let closes = 0;
  const job = { name: RECAP_JOB_NAME, data: { movieId, sourceHash: hash }, getState: async () => currentState };
  const queue = { waitUntilReady: async () => {}, getJob: async () => job, close: async () => { closes++; } } as unknown as ReturnType<typeof createRecapQueue>;
  const deps = {
    source: async (id: string) => { assert.equal(id, movieId); return { movieId, sourceHash: hash } as Awaited<ReturnType<typeof import("@/lib/recap/source").loadRecapSource>>; },
    provider: () => ({} as ReturnType<typeof import("@/lib/recap").getRecapProvider>),
    queue: () => queue,
    retry: async (_queue: typeof queue, id: string, expected: string) => {
      assert.equal(id, jobId);
      if (currentState !== "failed") return 0;
      if (token !== expected) return -4;
      retries++; currentState = "waiting"; return 1;
    },
  };
  return { deps, get retries() { return retries; }, get closes() { return closes; }, failAgain() { currentState = "failed"; token = "1791697201000:2:1"; } };
}
test("strict retry confirmation, movie scope, failed-attempt token and unknown fields", () => {
  assert.deepEqual(parseRecapRetry(body, movieId), body);
  for (const invalid of [null, [], {}, { ...body, extra: true }, { ...body, failureToken: "private/path" }, { ...body, jobId: `recap-other-${hash}` }]) {
    assert.throws(() => parseRecapRetry(invalid, movieId), (error: RecapError) => error.code === "RECAP_RETRY_INVALID");
  }
  assert.throws(() => parseRecapRetry({ ...body, acknowledged: false }, movieId), (error: RecapError) => error.code === "RECAP_RETRY_CONFIRMATION_REQUIRED");
  assert.equal(recapFailureToken({ finishedOn: 1791697200000, attemptsStarted: 1, attemptsMade: 1 }), failureToken);
  assert.equal(recapFailureToken({ attemptsStarted: 1, attemptsMade: 1 }), null);
});
test("failed-to-waiting recovery and concurrent duplicate reuse, without source/recap mutation", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 10 }, () => retryRecap(movieId, body, f.deps)));
  assert.equal(f.retries, 1); assert.equal(f.closes, 10);
  assert.ok(results.every((result) => result.jobId === jobId && result.state === "waiting"));
});
test("queued, active, delayed and completed jobs are reused without restarting", async () => {
  for (const state of ["waiting", "active", "delayed", "completed"]) {
    const f = fixture(state);
    assert.equal((await retryRecap(movieId, body, f.deps)).state, state);
    assert.equal(f.retries, 0);
  }
});
test("delayed confirmation cannot retry a subsequent failure", async () => {
  const f = fixture(); await retryRecap(movieId, body, f.deps); f.failAgain();
  await assert.rejects(retryRecap(movieId, body, f.deps), (error: RecapError) => error.code === "RECAP_RETRY_STALE");
  assert.equal(f.retries, 1);
});
test("missing jobs, unavailable metadata and source changes fail before recovery", async () => {
  const f = fixture();
  for (const code of ["TRANSCRIPT_NOT_FOUND", "SCENES_REQUIRED", "RECAP_SOURCE_INVALID"] as const) {
    await assert.rejects(retryRecap(movieId, body, { ...f.deps, source: async () => { throw new RecapError(code); } }), (error: RecapError) => error.code === code);
  }
  await assert.rejects(retryRecap(movieId, body, { ...f.deps, source: async (id) => ({ ...await f.deps.source(id), sourceHash: "b".repeat(64) }) }), (error: RecapError) => error.code === "RECAP_SOURCE_CHANGED");
  await assert.rejects(retryRecap(movieId, body, { ...f.deps, retry: async () => -1 }), (error: RecapError) => error.code === "RECAP_RETRY_UNSUPPORTED");
  await assert.rejects(retryRecap(movieId, body, { ...f.deps, provider: () => { throw new RecapError("RECAP_NOT_CONFIGURED"); } }), (error: RecapError) => error.code === "RECAP_NOT_CONFIGURED");
  assert.equal(f.retries, 0);
});
test("client confirmation and same-turn double clicks submit once; errors release guard", async () => {
  const gate = recapSubmissionGate(); let calls = 0; let release!: () => void;
  const task = async () => { calls++; await new Promise<void>((resolve) => { release = resolve; }); };
  await gate.run(false, task); assert.equal(calls, 0);
  const first = gate.run(true, task); await gate.run(true, task); assert.equal(calls, 1); release(); await first;
  await assert.rejects(gate.run(true, async () => { throw new Error("synthetic"); }));
  await gate.run(true, async () => { calls++; }); assert.equal(calls, 2);
});
test("Refresh Status is GET only; explicit retry POST preserves older movie and confirmation", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ data: { jobId, state: "waiting" } }); };
  const base = `/api/movies/${movieId}/recap/generate`;
  await recapRequest(`${base}?jobId=${jobId}`, {}, fetcher);
  assert.equal(calls[0].init?.method, "GET"); assert.equal(calls[0].init?.body, undefined);
  await recapRequest(`${base}/retry`, { retry: parseRecapRetry(body, movieId) }, fetcher);
  assert.equal(calls[1].init?.method, "POST"); assert.deepEqual(JSON.parse(String(calls[1].init?.body)), body);
  assert.ok(calls.every((call) => call.url.includes(movieId) && !/openrouter|newest/.test(call.url)));
});
test("client exposes controlled errors without provider messages, private paths or tokens", async () => {
  for (const code of ["RECAP_RETRY_STALE", "RECAP_RETRY_UNSUPPORTED", "RECAP_SOURCE_CHANGED", "RECAP_NOT_CONFIGURED", "RECAP_PROVIDER_ERROR", "UNKNOWN"]) {
    await assert.rejects(recapRequest("/synthetic", {}, async () => Response.json({ error: { code, message: "/private/path sk-SECRET" } }, { status: 409 })), (error: Error) => !/private|SECRET/.test(error.message));
  }
});
test("retry route rejects malformed requests without database/queue/provider work", async () => {
  for (const json of ["not json", "{}", JSON.stringify({ ...body, acknowledged: false })]) {
    const response = await POST(new Request("http://fixture.invalid/retry", { method: "POST", body: json }), { params: Promise.resolve({ id: movieId }) });
    assert.equal(response.status, 400);
  }
});
test("GET/status/page keep read-only paths and selected-movie scoping", async () => {
  const route = await readFile("app/api/movies/[id]/recap/generate/route.ts", "utf8");
  const get = route.slice(route.indexOf("export async function GET"));
  assert.match(get, /getRecapJob/); assert.doesNotMatch(get, /enqueueRecap|retryRecap/);
  const page = await readFile("app/projects/[id]/recap/page.tsx", "utf8");
  assert.match(page, /where: query.movieId \? \{ id: query.movieId \}/);
  assert.match(page, /query.movieId && !project.movies.length/);
  assert.doesNotMatch(page, /enqueueRecap|retryRecap/);
});
