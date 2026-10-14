# Storyline M2-04 — fake worker and durable recovery

## Scope and implementation

This milestone implements explicitly invoked, server-only fake worker services on the accepted [M2-03 admission/outbox](STORYLINE_M2_ADMISSION_IMPLEMENTATION.md) and [persisted source identity](STORYLINE_M2_SNAPSHOT_IDENTITY_ALIGNMENT.md) contracts. It does not install a process, queue consumer, provider integration, HTTP route, scheduler, migration or production authority. All executable SQL is a **disposable-only extension**, outside live migrations and ending in `ROLLBACK`; the owned test harness replaces that terminator in memory only.

Created:

- `lib/storyline/jobs/fake-worker.ts`: strict reference parser, deterministic fake marker, explicit worker factory and opaque lease operations.
- `lib/storyline/jobs/fake-worker-recovery.ts`: bounded opt-in recovery of at most ten distinct task references.
- `docs/drafts/storyline-m2-fake-worker-gateway.sql`: private worker scope/fence tables, restricted worker role and four narrow functions.
- `tests/storyline/jobs/fake-worker-postgres.test.ts`: exported-service security, concurrency, lifecycle and rollback acceptance tests.
- This document.

Modified only the existing disposable harness's restricted-role allowlist and `transactional-gateway.fixture.ts` for opt-in extension installation, bounded worker connections and synthetic composition. The original M2-03 fixture remains unchanged in behavior when `withFakeWorker` is false. Neither the pure contract barrel nor application/worker bootstrap imports the fake worker factories. Existing staging, unrelated changes and logs are preserved.

## State contract and honest fake execution

The inspected `story_m2_guard_task` SQL permits QUEUED → LEASED and pre-checkpoint LEASED → QUEUED/FAILED/CANCELLED. It does **not** permit LEASED → COMPLETED. Completion requires the separately designed checkpoint/submission/definitive-result path. The pure transition contract is preserved; no guard is disabled or widened.

```mermaid
stateDiagram-v2
    [*] --> QUEUED: explicit synthetic M2-03 admission
    QUEUED --> LEASED: delivered reference + current source + live grant
    LEASED --> LEASED: fenced heartbeat; revision advances
    LEASED --> QUEUED: explicit pre-checkpoint retry or expired lease recovery
    LEASED --> FAILED: stale source, expired grant or exhausted attempts
    LEASED --> FAILED: deterministic fake marker; checkpoint unavailable
    QUEUED --> CANCELLED: explicit pre-checkpoint cancellation
    LEASED --> CANCELLED: explicit pre-checkpoint cancellation
```

`executeDeterministicStoryTaskFake` computes only a domain-separated digest of task ID, generation and immutable recipe hash. It generates no narration, findings or AI candidate. Successful synthetic processing returns `DEFERRED_CHECKPOINT_UNAVAILABLE` while recording **FAILED**, error `STORY_TASK_RETRY_UNSAFE`, and event reason `STORY_TASK_FAKE_CHECKPOINT_UNAVAILABLE`. That existing error means the terminal task cannot be silently retried under its old grant. It is not a claim that a provider failed or that the logical paid task completed. No `StoryTaskResult`, `StoryProviderSubmission`, paid accounting, human approval or M1 candidate publication is created. Fake tasks exist only in disposable tests and are not promoted when M2-05 is implemented.

This controlled terminal state prevents endless fake processing or repeated automatic requeueing. Initial admission deduplication continues returning the same terminal task without generation advancement or additional confirmation consumption. A future explicitly authorized terminal retry needs the independently reviewed fresh-confirmation protocol; M2-04 does not add it.

SUBMITTED, UNKNOWN and terminal states are never fake claim/recovery eligible. The worker SQL also rejects **any** current-generation provider checkpoint, including an inconsistent LEASED row with a checkpoint. No checkpoint function or send permit is introduced. Existing UNKNOWN/global unresolved-slot SQL and tests remain unchanged.

## Explicit service interface

`createStoryTaskFakeWorker({ database, scope, profile, validationKey, inspectMedia })` takes trusted server-bootstrap dependencies only. It has no default datasource, environment key, live authority adapter or automatic startup. Only disposable tests compose it. The profile and 32-byte key are copied into the closure. The key authenticates deterministic server validation; it is not operator authentication, spending approval or a human SOURCE_VERIFIED credential.

| Operation | Behavior |
| --- | --- |
| `claim({ taskId, generation })` | Resolves actual scoped task, obtains current revision from PostgreSQL, inspects synthetic media outside locks, revalidates source/recipe under fence, then commits one database lease. Non-QUEUED state is a no-write `NOT_ELIGIBLE`; scope/generation/CAS/expiry failures reject. |
| `heartbeat(lease)` | Requires a handle minted by the same factory and current live database owner/revision/generation/grant. Revalidates source, advances revision and returns a new handle, invalidating the old one. |
| `execute(lease)` | Revalidates current source/script/media/profile and live owner/grant again. Computes a bounded fake digest only for valid context, then records the controlled checkpoint-unavailable failure atomically. Source drift records FAILED/SOURCE_STALE without a fake marker. |
| `retryBeforeCheckpoint(lease)` | Explicit proven-pre-checkpoint release; queues in the same generation only under the original unexpired grant and attempt ceilings. Exhaustion fails safely. |
| `recoverReference({ taskId, generation })` | Reads current revision itself. Only an expired LEASED row may recover under database-clock guards; live leases cannot be stolen. Rechecks authoritative context before returning to QUEUED. Expired grant, stale source or exhausted counters produce FAILED, never renewed authority. |
| `cancelBeforeCheckpoint({ taskId, generation, stateRevision })` | Explicit server-only CAS cancellation within the fixed disposable scope. QUEUED/LEASED only, no checkpoint. It does not need valid source text or an unexpired grant to reduce authority. No production authenticated cancellation interface is claimed. |
| `runOnce({ taskId, generation })` | One claim and at most one fake execution; no loop, timer, retry scheduler or background provider operation. |

The queue-facing reference accepts **only** taskId/generation. Extra fields such as owner, revision, `fresh`, authorityRef or sourceVerified are rejected. State, revision, immutable recipe and dependencies are loaded through the restricted database operation, never supplied by the queue. Lease handles are frozen process-local WeakMap identities; serialization, cloning, forgery, another factory and stale handle use cannot confer authority. Owner tokens and private recipes are never returned in service summaries or safe reader DTOs.

`createStoryTaskFakeRecovery(worker).recoverOnce(references)` accepts at most ten distinct references, with no unbounded scan or automatic invocation. Each item is a separate bounded transaction, not an all-or-nothing batch; a later rejected item does not undo earlier committed recoveries. A restart may obtain scoped task IDs/generations from the existing M2-03 reader, explicitly recover expired LEASED references, then explicitly call existing `reconcileOnce` to publish the committed QUEUED outbox intent. Neither reading nor worker recovery calls dispatch implicitly.

## Database boundary and transactional source gate

The new `storyline_fake_worker` is a distinct NOLOGIN group with ephemeral restricted test logins. Its private access map binds each login to one Project/Movie/Studio. It receives enumerated M1 source/snapshot/script SELECT needed for actual authoritative reconstruction and EXECUTE on only:

- `story_m2_test_worker_peek(text, integer)` — private bounded task/recipe projection; read-only, not a client DTO.
- `story_m2_test_worker_open(text, integer, integer, text, text)` — opens an operation-bound transaction fence and holds source/task/authority locks.
- `story_m2_test_worker_finish(text, integer, integer, text, text, text, text)` — verifies private HMAC and applies one permitted transition/event.

The shared worker lock helper is owner-only. All four functions are owned by the existing NOLOGIN migration owner, use fixed `pg_catalog, public, pg_temp` search paths and fully qualified application/crypto objects, and revoke PUBLIC/unintended-role execution in the installation transaction. Existing invoker triggers require trusted public schema lookup; restricted schema CREATE is denied. No direct paid-table SELECT/DML, admission, grant issuance, outbox, reader, checkpoint or M1 verification function is granted. Source SELECT is an existing trusted-server pattern, **not** multi-user row-level authorization or public deployment security.

The service reuses `createPersistedStoryTaskSourceAccess` for bounded ReadCommitted transactions and actual effective privilege checks. Additional catalog checks deny mixed admission/outbox/issuer/reader privileges and direct private/paid reads. No schema-owner connection performs worker runtime operations. An owner is used only for isolated provisioning, synthetic fault setup and explicit negative tests.

Lock order is **Project → Movie → Studio → Task → Decision → consumed Confirmation → Dispatch**. Generation/stateRevision CAS, cancellation, absence of checkpoint, original consumed grant, delivery receipt and live/expired owner checks come from actual rows. Claims require the exact deterministic acknowledged queue receipt; queue JSON alone cannot claim a lease. `worker_open` holds locks through source comparison and final commit. The challenge binds actual login/backend PID/transaction ID, task/generation/revision, operation/owner, exact scope and recipe hash. Server validation compares those bindings, reloads the genuine immutable M1 snapshot and optional script, and checks exact canonical bytes/hash, complete Chinese/ALL_CURRENT/QC/evidence context and independently inspected media. No snapshot ID is rewritten.

The HMAC binds the challenge plus the server-derived CURRENT/SOURCE_STALE verdict. No service accepts a caller validity flag, signer, proof or arbitrary transition. CLAIM requires current source. Only a controlled source-staleness failure can drive the failure disposition during later operations; unrelated validation/infrastructure errors roll back. Expiry/cancellation/revision/owner are checked again by SQL finalization. Final media freshness checks occur after state/event writes but before commit, so late failure restores the original row, counters and events. Failed or uncertain commit acknowledgements never yield a usable new handle; old handles are fenced by actual database revision/state on reuse.

Filesystem identity remains an observation, not an atomic future media lock. M2-05 must revalidate before checkpoint and publication. Privileged administrators, hostile trusted bootstrap code or writers ignoring the cooperating lock convention are not authenticated/contained by this disposable proof.

## Recovery bounds and cancellation

- Test lease: 500 ms, capped at the original grant expiry. Heartbeat never extends the grant. These are disposable test timings, not production operational settings.
- Original M2-03 publication ceiling: three attempts. Original SQL pre-submission recovery ceiling: three. The lower applicable ceiling wins; with one publication per claim, the third crashed delivery fails with two prior recoveries rather than demanding a fourth publication.
- Retry/recovery keeps generation zero, clears old worker ownership, updates due outbox intent and appends ordered events in one transaction. Existing SQL increments/caps `preSubmitAttempts` atomically.
- Owner/revision/generation and lease expiry fence late heartbeats/execution/release. Concurrent workers cannot own the same active task lease. Duplicate active or terminal delivery does not execute again.
- Cancellation is sticky and terminal before checkpoint; an old handle cannot execute or clear it. Post-checkpoint cancellation is outside this milestone and cannot be emulated through this gateway.
- Expired grants are not refreshed/replaced. FAILED/CANCELLED jobs cannot restart through worker recovery. Source drift is rejected before claim or terminalized before execution/requeue, with immutable source/history preserved.
- Fake delivery outage after admission remains a durable M2-03 outbox failure. Explicit M2-03 reconciliation recovers delivery; it does not perform fake execution. Existing outbox recovery may race expired worker recovery, but both use the same scope/task locks and revision fencing; a new claim always performs its own authoritative source check.

## Acceptance and M2-05 boundary

New acceptance tests execute exported worker/recovery services with actual M1 producer → persisted snapshot → M2-03 admission → fake reference delivery. Both M1/M2 role-script orders are exercised. Assertions include real competing worker connections; heartbeat renewal; opaque handles and stale owners; missing validation key; mixed-role rejection; exact SQLSTATE 42501 for forbidden DML/functions; cooperating source-writer blocking; crash/restart recovery; bounded retry exhaustion; source/translation/QC/approval/media/script changes; queued/leased cancellation; original grant expiry; fake delivery outage; late media and event failure rollback; and zero provider submissions/results/M1 receipts/COMPLETED jobs. UNKNOWN/SUBMITTED exclusion is tested by the shared service branch and new SQL guard, with persisted UNKNOWN/global-slot regressions retained from existing M2 suites; no new checkpoint is inserted to fake those states.

| Verification | Result |
| --- | --- |
| New worker/privilege/recovery suite, both role orders | **53/53 PASS**, including parent tests |
| Existing M2-03B/C/D, M2-03 services, M1 and legacy regressions | **576/576 PASS** |
| Final combined run after private-table privilege hardening | **629/629 PASS**, no failures/skips |
| `pnpm lint` | PASS |
| `pnpm exec tsc --noEmit` | PASS, also checked after build |
| `git diff --check`, cached and individual untracked deliverables | PASS |
| `pnpm exec next build --webpack` | PASS outside sandbox, unreachable dummy datasource |

The sandboxed build failed with `Could not parse output from TypeScript's --showConfig.` The same command passed outside the sandbox; no configuration or checking was weakened. The first sandboxed PostgreSQL run could not bind its private Unix socket (`Operation not permitted`), so isolated database tests ran outside the sandbox using the same owned-cluster harness. PostgreSQL 18 tests used dedicated ephemeral credentials and newly owned clusters only; neither the application DATABASE_URL nor real media was accessed. The initial new SQL alias/local-record collision was corrected and all suites rerun. Temporary probes reported only static SQL diagnostics; no diagnostic logging remains in application service code.

Commands executed:

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx tests/storyline/jobs/fake-worker-postgres.test.ts
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx --test-concurrency=1 --test tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

New/untracked deliverables were additionally checked with `git diff --no-index --check /dev/null <file>`. Cached Git diff SHA-256 remains `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`. Final import scans found no fake worker/recovery factory or worker gateway installation in application routes/pages, worker bootstrap or the pure contract barrel. No live schema/migration, dependencies, environment, API, UI, legacy worker or rendering behavior changed.

**Recommendation: PASS for a separately authorized M2-05 fake checkpoint/transport safety implementation; BLOCKED for real provider integration, deployment and paid activation.** The precise next dependency is a restricted checkpoint gateway, acknowledged durable checkpoint → one-use in-process send permit, bounded single-send fake-wire transport, definitive result/accounting persistence and UNKNOWN/crash handling. M2-04 implements none of them and must not be used to mark logical provider tasks complete.

Real operator/spending authentication, fixed approved profiles/quotes/cost policies, production roles/keys, one-slot UNKNOWN operational acceptance, application database migration approval and runtime paid activation remain separate gates. No new review milestone is required to continue the authorized implementation sequence. No commit or push occurred.
