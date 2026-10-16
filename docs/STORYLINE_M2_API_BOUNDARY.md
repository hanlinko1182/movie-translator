# Storyline M2-06 — scoped status API and disabled mutation gate

## Deployment state

The production Storyline API is **disabled by construction**. No production operator authority, restricted M2 datasource, deployed M2 schema or paid worker bootstrap is installed. The route modules call `createScopedStoryTaskApi()` with no dependencies. All current production reads and writes return `503 STORYLINE_TASKS_UNAVAILABLE`, with `Cache-Control: private, no-store`, `Vary: Cookie, Authorization` and `X-Content-Type-Options: nosniff`. No environment flag, URL value, request header, browser payload or worker state can turn this gate on.

No existing application database is queried to decide availability. The M2-06 SQL is a review-only disposable extension ending in `ROLLBACK`; only the owned PostgreSQL test fixture replaces that ending with `COMMIT` in its fresh cluster. Nothing is added to live Prisma schema or migrations.

## Routes and safe read contract

The explicit resource scope is **Project ID → selected Movie ID → Storyline Studio ID**:

| Method | Route | Current production behavior | Synthetic test composition |
| --- | --- | --- | --- |
| GET | `/api/projects/{id}/movies/{movieId}/storyline/studios/{studioId}/tasks` | 503 | Read-only keyset list, default limit 20, maximum 50; optional `afterTaskId`. |
| GET | `/api/projects/{id}/movies/{movieId}/storyline/studios/{studioId}/tasks/{taskId}` | 503 | Exact scoped task lookup or 404. |
| POST | Collection path | 503 | 503, even if a synthetic read authority is injected. |
| POST | `.../tasks/{taskId}/cancel` | 503 | 503, including when synthetic read permission exists. |

The HTTP response projects only actual task ID, kind, state, generation, created/state-change timestamps, allowlisted error code, and bounded usage classification/token/cost scalars. No profile/currentness or candidate availability is invented. In particular, an M2-05 synthetic result cannot be presented as a real AI candidate. No recipe, source snapshot, translation text, media key/path, owner token, confirmation, spending decision, provider envelope or private result appears in the response. Empty lists remain empty. No newest-movie fallback exists.

The existing `storyline_m2_reader` service performs bounded `SET TRANSACTION READ ONLY` calls through `story_m2_test_status`; M2-06 adds `story_m2_test_status_one` for exact task lookup. That new function repeats the established explicit Project/Movie/Studio login binding and safe status projection, with fixed search path, migration-owner ownership, revoked PUBLIC execution and only named reader-role EXECUTE. The reader login still has no paid-table SELECT/DML, admission, checkpoint, outbox or M1 receipt issuance permission. No cursor scan or unrelated-task lookup substitutes for an exact scoped read.

Authenticated test reads use one trusted server adapter. It resolves an opaque in-process test session, independently checks exact persisted Project→Movie→Studio relations, and checks the principal's read scope. It never derives identity from `Authorization`, `X-Operator-Id`, user JSON or route IDs. Missing authentication is 401, denied scope and absent task are 404, malformed IDs/pagination are 400, and missing/degraded authority or reader infrastructure is 503. All responses have the same private no-store headers. Provider/driver errors and private data are not returned.

## Operator authority contract

`StoryTaskOperatorAuthority` defines independent server-owned decisions:

1. Authenticate a request from a future verified session to a principal.
2. Permit reading the exact persisted Project/Movie/Studio scope.
3. Permit task creation in that scope.
4. Permit **spending separately** for exact canonical recipe bytes/hash, snapshot/script binding, Studio revision, fixed profile/cost policy hashes, quoted maximum, generation and idempotency key.
5. Permit cancellation of an exact scoped task.

The current handlers call only authentication and read permission in isolated synthetic tests. HTTP POST and cancel handlers call none of these mutation permissions because no production authenticated spending authority or deployment gate exists. The contract's mere shape, an audit label, environment setting or a valid database row is not proof of permission. M1 human source-verification authority is not reused for spending. A future production adapter needs a separately reviewed server session, resource authorization and exact one-use spending decision before route composition can change.

The fake authority and registered synthetic principals live **only** in `tests/storyline/jobs/scoped-api-postgres.test.ts`. They are attached to Request object identity through a WeakMap, and the test adapter checks the persisted synthetic scope. The production route files never import that fixture or an M2 database client. There is no task admission, decision issuance, confirmation consumption, queue publication, checkpoint, provider send, worker activation or receipt issuance in any GET or HTTP mutation method.

## Acceptance and remaining gates

The focused test composes real M1 persisted source and M2-03 restricted reader records in newly owned disposable PostgreSQL, exercising M1-before-M2 and M2-before-M1 role-script orders. It verifies production route fail-closed behavior, forged header rejection, cross-principal and wrong project/movie/Studio denial, strict page/ID validation, allowlisted DTO fields, no GET database writes, no dispatch/transport, reader SQL ACLs and disabled create/cancel POSTs. Both synthetic and production paths are tested through Web `Request`/`Response` handlers. No real provider, Redis worker or existing application database is used.

The older M1 integration test that prohibited every Storyline route now permits only these three exact M2-06 task route files and still rejects imports of private source preparation, evidence projection, and synthetic worker fixtures. It continues to enforce server-only preparation and no Recap navigation side effects.

## Verification record

- Focused M2-06 disposable PostgreSQL API/security tests: **15/15 passed**, including both M1/M2 role installation orders.
- Full Storyline M1/M2, legacy Recap and render queue regression command: **699/699 passed**. The first run exposed only the older no-Storyline-route assertion; after narrowing that assertion to the three disabled handlers, the complete rerun passed.
- `pnpm lint`: passed. `pnpm exec tsc --noEmit`: passed. Tracked, staged and new-file whitespace checks: passed.
- `pnpm exec next build --webpack` with an unreachable dummy `DATABASE_URL`: passed and listed the three scoped routes. The sandboxed attempt failed while parsing TypeScript `--showConfig`; the permitted build outside the sandbox passed. No application database connection or live M2 installation was required.

**M2-06 result: PASS for the disabled, synthetic-tested API boundary. M2-07 acceptance review may proceed. Live operator authentication, spending, schema deployment, provider transport, M1 receipt issuance and paid worker activation remain BLOCKED.** M2-07 must separately verify production role provisioning, actual server-session authority, quote/profile policy, deployment order, provider single-send behavior and UNKNOWN investigation before any paid activation. The private reader extension and test-only authority are not themselves deployment approval.
