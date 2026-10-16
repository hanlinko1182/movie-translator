// Synthetic principals and newly owned disposable PostgreSQL only.
import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { createScopedStoryTaskApi, type StoryTaskOperatorAuthority } from "../../../lib/storyline/jobs/api-boundary";
import { scope } from "../fixtures";
import { transactionalFixture } from "./transactional-gateway.fixture";
import { GET as productionList, POST as productionCreate } from "../../../app/api/projects/[id]/movies/[movieId]/storyline/studios/[studioId]/tasks/route";
import { GET as productionOne } from "../../../app/api/projects/[id]/movies/[movieId]/storyline/studios/[studioId]/tasks/[taskId]/route";
import { POST as productionCancel } from "../../../app/api/projects/[id]/movies/[movieId]/storyline/studios/[studioId]/tasks/[taskId]/cancel/route";

before(() => mock.method(globalThis, "fetch", () => assert.fail("No provider, worker or network request")));
after(() => mock.restoreAll());
const path = (studioId: string) => `/api/projects/${scope.projectId}/movies/${scope.movieId}/storyline/studios/${studioId}/tasks`;
const context = (studioId: string, taskId?: string, changes: Partial<{ id: string; movieId: string; studioId: string }> = {}) =>
  ({ params: Promise.resolve({ id: scope.projectId, movieId: scope.movieId, studioId, taskId, ...changes }) });
const request = (url: string, method = "GET", headers?: HeadersInit) => new Request(`http://localhost${url}`, { method, headers });
const body = async (response: Response) => response.json() as Promise<Record<string, unknown>>;
function safeHeaders(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Vary"), "Cookie, Authorization");
}

test("actual production routes deny all reads and mutations without operator/bootstrap authority", async () => {
  const where = context("synthetic-studio", "synthetic-task");
  for (const invoke of [
    () => productionList(request(path("synthetic-studio"), "GET", { Authorization: "Bearer forged", "X-Operator-Id": "admin" }), where),
    () => productionOne(request(`${path("synthetic-studio")}/synthetic-task`), where),
    () => productionCreate(request(path("synthetic-studio"), "POST"), where),
    () => productionCancel(request(`${path("synthetic-studio")}/synthetic-task/cancel`, "POST"), where),
  ]) {
    const response = await invoke(); assert.equal(response.status, 503); safeHeaders(response);
    assert.deepEqual(await body(response), { error: { code: "STORYLINE_TASKS_UNAVAILABLE", message: "Storyline tasks are not enabled" } });
  }
  const unavailable = createScopedStoryTaskApi();
  assert.equal((await unavailable.list(request(path("synthetic-studio")), where)).status, 503);
});

for (const m1First of [true, false]) test(`M2-06 scoped HTTP boundary on disposable PostgreSQL: M1 ${m1First ? "before" : "after"} M2`,
  { timeout: 120000 }, async t => {
    const f = await transactionalFixture(m1First, false, false, true);
    const studioId = f.saved.studioId;
    let wireCalls = 0;
    const services = f.services({
      async publish() { wireCalls++; throw new Error("Dispatch must not run from API"); },
      async has() { wireCalls++; throw new Error("Receipt check must not run from API"); },
    });
    type Principal = Readonly<{ subject: string }>;
    const sessions = new WeakMap<Request, Principal>();
    const operator = Object.freeze({ subject: "synthetic-reader" }), wrongOperator = Object.freeze({ subject: "other-reader" });
    const checks = { authenticated: 0, read: 0, create: 0, spend: 0, cancel: 0 };
    const authority: StoryTaskOperatorAuthority<Principal> = {
      async authenticate(value) { checks.authenticated++; return sessions.get(value) ?? null; },
      async canRead(principal, selection) {
        checks.read++;
        if (principal !== operator || selection.projectId !== scope.projectId || selection.movieId !== scope.movieId || selection.studioId !== studioId)
          return false;
        // Test-only operator decision checks the real persisted relation. The
        // production routes never install this synthetic adapter or M1 reader.
        return f.runtime.$transaction(async tx => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          const studio = await tx.storylineStudio.findUnique({ where: { id: selection.studioId }, select: { projectId: true, movieId: true } });
          const movie = await tx.movie.findUnique({ where: { id: selection.movieId }, select: { projectId: true } });
          return studio?.projectId === selection.projectId && studio.movieId === selection.movieId && movie?.projectId === selection.projectId;
        });
      },
      async canCreate() { checks.create++; return false; },
      async canSpend() { checks.spend++; return false; },
      async canCancel() { checks.cancel++; return false; },
    };
    const api = createScopedStoryTaskApi({ authority, reader: services.read });
    const live = (url: string, principal: Principal = operator) => {
      const value = request(url, "GET", { Authorization: "Bearer untrusted", "X-Operator-Id": "forged" });
      sessions.set(value, principal); return value;
    };
    const counts = async () => (await f.admin.query(`SELECT
      (SELECT count(*) FROM public."StoryTask") tasks,(SELECT count(*) FROM public."StoryTaskEvent") events,
      (SELECT count(*) FROM public."StorySpendingDecision") decisions,(SELECT count(*) FROM public."StoryPaidConfirmation") confirmations,
      (SELECT count(*) FROM public."StoryProviderSubmission") submissions,(SELECT count(*) FROM public."StoryTaskResult") results,
      (SELECT count(*) FROM public."StorySourceVerification") receipts`)).rows[0];
    try {
      const ref = await services.admission.admit({ decisionId: await f.issue(), selection: f.sourceReference(), identity: f.currentRecipe() });
      const initial = await counts(); assert.equal(initial.tasks, "1");
      await t.test("forged headers, claimed user ID and missing session never authorize", async () => {
        const forged = request(path(studioId), "GET", { Authorization: "Bearer forged", "X-Operator-Id": "synthetic-reader" });
        const denied = await api.list(forged, context(studioId)); assert.equal(denied.status, 401); safeHeaders(denied);
        assert.equal((await body(denied) as { error: { code: string } }).error.code, "STORYLINE_AUTH_REQUIRED");
        assert.equal((await api.one(request(`${path(studioId)}/${ref.taskId}`), context(studioId, ref.taskId))).status, 401);
        assert.deepEqual(await counts(), initial);
      });
      await t.test("scoped list and exact task status expose only bounded allowlisted persisted fields", async () => {
        const response = await api.list(live(`${path(studioId)}?limit=1`), context(studioId)); assert.equal(response.status, 200); safeHeaders(response);
        const payload = await body(response) as { data: { items: Record<string, unknown>[]; nextAfterTaskId: string } };
        assert.equal(payload.data.items.length, 1); assert.equal(payload.data.nextAfterTaskId, ref.taskId);
        const item = payload.data.items[0];
        assert.deepEqual(Object.keys(item).sort(), ["taskId", "kind", "state", "generation", "createdAt", "stateChangedAt", "errorCode", "usage"].sort());
        assert.equal(item.taskId, ref.taskId); assert.equal(item.state, "QUEUED");
        assert.deepEqual(item.usage, { classification: "UNKNOWN", inputTokens: null, outputTokens: null, costUsdMicros: null });
        const single = await api.one(live(`${path(studioId)}/${ref.taskId}`), context(studioId, ref.taskId));
        assert.equal(single.status, 200); safeHeaders(single); assert.deepEqual((await body(single) as { data: unknown }).data, item);
        const empty = await api.list(live(`${path(studioId)}?limit=1&afterTaskId=${ref.taskId}`), context(studioId));
        assert.deepEqual((await body(empty) as { data: { items: unknown[] } }).data.items, []);
        const missing = await api.one(live(`${path(studioId)}/missing-task`), context(studioId, "missing-task"));
        assert.equal(missing.status, 404); safeHeaders(missing);
        const text = JSON.stringify(payload);
        for (const privateField of ["sourceSnapshotId", "canonicalRecipe", "recipeHash", "storageKey", "leaseOwner", "owner", "authorityRef", "confirmationId", "normalizedPayload", "providerResponse", "candidateAvailable"])
          assert.equal(text.includes(privateField), false, `Leaked ${privateField}`);
        assert.deepEqual(await counts(), initial); assert.equal(wireCalls, 0);
      });
      await t.test("wrong principal and project/movie/Studio tuples never fall back to another movie", async () => {
        for (const changed of [{ id: "other-project" }, { movieId: "other-movie" }, { studioId: "other-studio" }]) {
          const params = context(studioId, undefined, changed), url = path(studioId);
          const res = await api.list(live(url), params); assert.equal(res.status, 404); safeHeaders(res);
          const one = await api.one(live(`${url}/${ref.taskId}`), context(studioId, ref.taskId, changed)); assert.equal(one.status, 404);
        }
        assert.equal((await api.list(live(path(studioId), wrongOperator), context(studioId))).status, 404);
        assert.deepEqual(await counts(), initial); assert.equal(wireCalls, 0);
      });
      await t.test("invalid identifiers, pages, duplicates and unknown query fields are rejected before reader access", async () => {
        const invalid = ["?limit=0", "?limit=51", "?limit=01", "?limit=-1", "?limit=1&limit=2", "?afterTaskId=", "?afterTaskId=bad!", "?afterTaskId=x&afterTaskId=y", "?unknown=1"];
        for (const query of invalid) { const res = await api.list(live(path(studioId) + query), context(studioId)); assert.equal(res.status, 400, query); safeHeaders(res); }
        assert.equal((await api.list(live(path(studioId)), context(studioId, undefined, { movieId: "bad!" }))).status, 400);
        assert.equal((await api.one(live(`${path(studioId)}/bad!`), context(studioId, "bad!"))).status, 400);
        assert.equal((await api.one(live(`${path(studioId)}/${ref.taskId}?debug=1`), context(studioId, ref.taskId))).status, 400);
        assert.deepEqual(await counts(), initial); assert.equal(wireCalls, 0);
      });
      await t.test("reader database identity cannot mutate paid records or enter admission/checkpoint gateways", async () => {
        await assert.rejects(f.reader.query(`INSERT INTO public."StoryTask" DEFAULT VALUES`), { code: "42501" });
        await assert.rejects(f.reader.query(`SELECT * FROM public."StoryTask"`), { code: "42501" });
        await assert.rejects(f.reader.query(`SELECT public.story_m2_test_issue_decision(1000)`), { code: "42501" });
        await assert.rejects(f.reader.query(`SELECT public.story_m2_test_open_fence('forged','forged','forged','forged')`), { code: "42501" });
        const count = await f.reader.query(`SELECT count(*) FROM public.story_m2_test_status_one($1,$2,$3,$4)`,
          [scope.projectId, scope.movieId, studioId, ref.taskId]);
        assert.equal(count.rows[0].count, "1");
        await assert.rejects(f.reader.query(`SELECT * FROM public.story_m2_test_status_one($1,$2,$3,$4)`,
          [scope.projectId, "other-movie", studioId, ref.taskId]), { code: "23514" });
        assert.deepEqual(await counts(), initial);
      });
      await t.test("even synthetic read authority cannot create, spend, cancel, dispatch or access providers through HTTP", async () => {
        const post = live(path(studioId));
        const create = await api.disabledMutation(new Request(post.url, { method: "POST", headers: post.headers, body: JSON.stringify({ decisionId: "forged" }) }), context(studioId));
        const cancel = await api.disabledMutation(new Request(`${post.url}/${ref.taskId}/cancel`, { method: "POST", headers: post.headers }), context(studioId, ref.taskId));
        for (const response of [create, cancel]) { assert.equal(response.status, 503); safeHeaders(response); }
        assert.equal(checks.create, 0); assert.equal(checks.spend, 0); assert.equal(checks.cancel, 0);
        assert.deepEqual(await counts(), initial); assert.equal(wireCalls, 0);
      });
    } finally { await f.close(); }
  });
