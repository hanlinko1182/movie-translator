# Storyline M2-05 — restricted checkpoint and fake transport

## Scope and trust boundary

This is an explicitly invoked **disposable-only, fake-only** extension of M2-03 admission/outbox and M2-04 lease services. It installs nothing in application or worker bootstrap. No live Prisma schema/migration, application database, Redis, HTTP provider, SDK, AI result, M1 verification receipt, API, UI or media processing is involved. Paid/live activation remains **BLOCKED**.

Files:

- `docs/drafts/storyline-m2-checkpoint-gateway.sql`: review-only restricted checkpoint gateway; ends in `ROLLBACK`.
- `lib/storyline/jobs/fake-checkpoint.ts`: server-only checkpoint, one-use permit, result and recovery services.
- `lib/storyline/jobs/fake-transport.ts`: registered in-process deterministic wire scenarios; no network adapter.
- `lib/storyline/jobs/fake-worker.ts`: additive, one-time handoff from a genuine M2-04 lease.
- `tests/storyline/jobs/transactional-gateway.fixture.ts`: opt-in installation and bounded restricted connections in newly owned PostgreSQL only. Existing fixture behavior is preserved when checkpoint support is off.
- `tests/storyline/jobs/checkpoint-transport-postgres.test.ts`: exported-service acceptance tests in both M1/M2 role-script orders.

The dedicated authenticated PostgreSQL login inherits `storyline_checkpoint_worker`; it is not the schema owner and cannot issue spending decisions or human source-verification receipts. Database login authentication is **not human operator authentication**. The existing synthetic M2-03 admission authority is test-only. Private validation-key possession authenticates server validation, not an operator's right to spend real money.

The service takes explicit trusted bootstrap dependencies, with no environment defaults: restricted Prisma client, exact scope, genuine fake-worker factory, exact fixed synthetic profile, private 32-byte validation key and independent synthetic media inspector. The profile must equal `synthetic-text/v1`, provider `synthetic`, model `synthetic/model`, with the reviewed fixture's exact prompt/schema/policy/limits/cost descriptor. A structurally valid real model or altered profile is rejected. These synthetic limits and quote identity are not production price approval.

`withCheckpointLease` consumes an opaque lease minted by the same M2-04 factory before invoking the server's handoff callback. It is trusted composition, never a callback, owner token or receipt supplied by request JSON. The SQL independently rechecks actual ownership and revision. Hostile trusted bootstrap code or a schema administrator is outside this proof; a JSON shape, local audit label or feature flag is never authority.

## Restricted database gateway

The NOLOGIN migration owner owns the gateway and two private disposable tables:

- `StoryTestCheckpointAccess`: one exact Project/Movie/Studio binding per ephemeral login.
- `StoryTestCheckpointFence`: transaction/backend/login-bound challenge, removed on successful finalization; rejected transactions roll it back.

Only the checkpoint role receives EXECUTE on `story_m2_test_checkpoint_peek`, `story_m2_test_checkpoint_open` and `story_m2_test_checkpoint_finish`. The lock helper is owner-only. Functions use fixed `pg_catalog, public, pg_temp` search paths and fully qualified application/crypto objects. PUBLIC execution and unintended-role execution are revoked. Runtime, admission, issuer, outbox, reader, M1 issuer and fake-worker roles cannot call the gateway. An unregistered checkpoint login has EXECUTE but cannot resolve any scope.

The checkpoint role has enumerated read-only M1 source access for authoritative reconstruction, but no direct paid/private-table SELECT or DML, no schema CREATE and no M1 issuance or admission/outbox/worker gateway permissions. Actual transaction catalog checks reject schema owners, superusers, privileged memberships, mixed gateway roles and paid/private-table privileges. This is a trusted-server disposable proof, not a public deployment or row-level tenant authorization claim.

Lock order follows accepted M2-03/M2-04 implementation: **Project → Movie → Studio → Task → SpendingDecision → consumed Confirmation → Dispatch → Submission**. The older architecture's illustrative order is not copied over the accepted implementation. Each operation is a bounded ReadCommitted transaction; source locks remain held through commit. The fence includes connection identity, exact scope/task/generation/stateRevision/owner/operation/request hash and immutable recipe hash. The private HMAC additionally binds the server-derived CURRENT/SOURCE_STALE verdict and SHA-256 of operation data. A raw caller cannot finalize by supplying `CURRENT` alone.

Checkpoint requires the actual LEASED row, exact generation/revision/live owner, no cancellation, original consumed unexpired admitted confirmation, no existing checkpoint, exact synthetic profile and current immutable source/recipe. The service reloads the actual M1 snapshot and optional script, reconstructs Chinese/ALL_CURRENT translation/review/QC/evidence context and compares independently inspected media. Final time and media checks occur after validation and before transaction commit.

The existing immutable submission identity, unique task/generation and confirmation constraints, and partial unique **global unresolved slot** are reused unchanged. Task SUBMITTED transition, checkpoint and ordered event are atomic. Constraint, event, source or acknowledgement failures never mint a usable permit. Source files are observations, not atomically locked filesystem objects; subsequent send and result operations revalidate them.

## Commit acknowledgement and one-send contract

The immutable fake request is bounded canonical UTF-8 JSON:

```json
{
  "schemaVersion": "story-fake-request-v1",
  "synthetic": true,
  "taskId": "synthetic-task",
  "generation": 0,
  "recipeHash": "<exact immutable recipe SHA-256>"
}
```

Its hash is SHA-256 of `story-fake-request-v1\n` plus exact canonical bytes. The persisted checkpoint binds this hash, original confirmation, task/generation, owner and checkpoint time before fake I/O. The exact request is reproducible from immutable recipe identity; no prompt/source text or storage path is sent or stored as a fake response. Submission ID is assigned by PostgreSQL and becomes part of the wire observation binding.

Only resolution of the **whole Prisma transaction**, including commit acknowledgement, can mint a process-local permit. Opening a transaction, receiving an INSERT result or seeing an existing submission never does. `DROP_AFTER_COMMIT` is a synthetic fault that discards a known acknowledgement before minting; it cannot manufacture acknowledgement. It models lost acknowledgement, not a claim to have physically severed a database connection at COMMIT. Actual transaction rejection/timeout also exits before permit creation. Unknown commit outcome is conservatively left for durable inspection/recovery with zero speculative send.

Permits are frozen WeakMap identities bound to exact submission/task/generation/owner/request hash and a monotonic 1,000 ms issuance window starting before checkpoint work. Serialization, copying, foreign factories, restart hydration and reuse fail. `send` burns the permit synchronously **before any await**, then commits a separate PRE_SEND fence/currentness/lease/grant/cancellation check. Deadline is checked before and after that validation. Only then can it invoke one registered fake wire. A 1,000 ms transport timeout and AbortSignal bound the observation. There is no replay loop, SDK, redirect, HTTP request or caller-provided transport callback.

The disposable post-checkpoint observation lease is 2 seconds. It does not renew the consumed grant or authorize a new request. These deliberately short synthetic timings must not be reused as production operational settings. No external send and database lock can be made one atomic operation; a change immediately after PRE_SEND is handled by result currentness checks, not by claiming a permanent source lock.

## State and result handling

```mermaid
stateDiagram-v2
    LEASED --> SUBMITTED: acknowledged atomic checkpoint
    SUBMITTED --> COMPLETED: original synthetic success + current source
    SUBMITTED --> FAILED: original definitive failure or stale result
    SUBMITTED --> CANCELLED: pending cancellation + original definitive result
    SUBMITTED --> UNKNOWN: ambiguity or expired observation lease
    UNKNOWN --> UNKNOWN: pending cancellation; no resend or automatic resolution
```

| Service | Contract |
| --- | --- |
| `checkpoint(genuineLease)` | Consume factory-owned lease; commit checkpoint; return an opaque permit only after acknowledged commit. |
| `send(permit, registeredFakeWire)` | At most one fake invocation. Return opaque original-result observation or safely persist UNKNOWN. |
| `recordResult(originalReceipt)` | Recheck source and owner; atomically persist immutable bounded synthetic result, resolve submission, update task and append event. Exact repeated result is idempotent. No send occurs here. |
| `recoverAfterCheckpoint({taskId,generation})` | Explicitly inspect current revision; expired SUBMITTED observation lease becomes UNKNOWN. Other states are no-write NOT_ELIGIBLE. No new permit or queue publication. |
| `cancelAfterCheckpoint({taskId,generation,stateRevision})` | CAS a sticky pending cancellation. Preserve SUBMITTED/UNKNOWN and its global slot until definitive original-result handling. Repeated pending cancellation is idempotent. |
| `runOnce(genuineLease,wire)` | One checkpoint/send/result composition; no retries or automatic startup. |

The fake wire supports SUCCESS, FAILURE, LOST_RESPONSE, TIMEOUT, MALFORMED, OVERSIZE and controlled HELD_SUCCESS for races. Accepted result bytes have a strict seven-field schema with `synthetic:true`, exact submission/task/generation/request hash, and SUCCESS/FAILURE. Malformed, incomplete/oversized or ambiguous observation becomes UNKNOWN; the service never repairs or truncates it.

Definitive observations produce only `StoryTaskResult` with validator `synthetic-v1` and an explicit synthetic payload. Existing `VALIDATED_CANDIDATE` outcome is a task-ledger classification, **not M1 approval or an AI-generated Studio script**. Missing token/cost usage stays UNKNOWN with null values; zero-cost test execution does not fabricate provider-reported usage or billing finality. Results/checkpoint identities and events retain their existing immutable SQL guards.

Current successful synthetic result may mark only the synthetic task COMPLETED. Proven source drift retains the original observation privately, resolves its submission and marks task FAILED/RESULT_STALE. Definitive fake failure marks FAILED/PROVIDER_FAILED. Pending cancellation plus definitive observation marks CANCELLED while retaining the original result. Expiry after an actual send does not erase its original definitive observation; it cannot authorize another send. Other infrastructure/media-inspection failures roll back, leaving unresolved work for explicit recovery rather than publishing without currentness proof.

Repeated result delivery uses the original opaque observation and exact immutable bytes. A result-write rollback can be retried without any new transport; an uncertain result commit can be checked idempotently. Once UNKNOWN, this gateway refuses even a late in-process result. Investigation/resolution requires a separately controlled future path; no such path or timeout-based slot release is introduced here.

Cancellation or source drift before fake send produces no wire call. After a committed checkpoint, conservative UNKNOWN retains the slot even if this process knows it made zero calls; the database alone cannot prove no permit escaped. Crash/discarded acknowledgement/expired permit cannot rehydrate authority. M2-03 outbox and M2-04 recovery continue excluding SUBMITTED/UNKNOWN, so duplicate delivery, restart and missing queue receipts cannot resend.

## Acceptance and verification

The new exported-service suite uses actual M1 preparation/persistence → M2-03 synthetic admission/fake delivery → M2-04 restricted lease → M2-05 restricted checkpoint. Each scenario owns a new PostgreSQL 18 cluster/database with unique credentials, private Unix socket and checked ownership marker; cleanup can remove only that owned cluster. No application datasource, real media or real receipt is consulted. Both M1/M2 role-script orders are tested. The unreachable dummy application datasource is supplied to verification commands.

Coverage includes independently visible committed checkpoint before send; concurrent use of one permit; concurrent global-slot contention; duplicate queue/result delivery; forged/copied/stale handles; grant expiry before and after submission; Chinese, translation, QC, media and script drift; crash/lost acknowledgement; malformed/oversized/lost/timeout replies; pending cancellation before/during send; checkpoint and result/event rollback; denied DML/issuer/helper privileges; forged HMAC with a valid fence; immutable history; and no M1 receipt/current-content publication or production bootstrap imports.

| Verification | Final result |
| --- | --- |
| New checkpoint/transport suite, both role-script orders | **55/55 PASS**, including parent tests |
| Existing M1/M2/legacy regression set | **629/629 PASS**, preserved in the combined run |
| Combined run | **684/684 PASS**, zero failures, cancellations or skips; 203.8 seconds |
| `pnpm lint` | PASS |
| `pnpm exec tsc --noEmit` | PASS; repeated after build |
| `git diff --check`, cached check, new-file whitespace checks | PASS |
| Webpack production build with unreachable dummy datasource | PASS outside sandbox |

The sandboxed PostgreSQL test runner exited before producing useful assertion diagnostics; the approved outside-sandbox run used only the same owned disposable harness/private sockets. The sandboxed build produced `Could not parse output from TypeScript's --showConfig.` The unchanged build command passed outside the sandbox. No configuration, type checking or warnings were suppressed. Initial new-test assertion mistakes were corrected (the actual usage column is `reportedUsdMicros`; an unregistered checkpoint-group login is scope-denied rather than EXECUTE-denied; an expired pre-checkpoint lease is explicitly recovered before reconciling another task). The final focused and combined suites were rerun successfully.

Commands executed for final verification:

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx --test --test-concurrency=1 tests/storyline/jobs/checkpoint-transport-postgres.test.ts
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx --test-concurrency=1 tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

Each new file was also checked with `git diff --no-index --check /dev/null <file>`. Existing staged diff remains empty (SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). Existing `logs/` is preserved. No commit or push occurred.

## M2-06 recommendation and retained deployment gates

**Recommendation: M2-05 PASS; M2-06 fake/disabled-gate implementation readiness PASS; real authenticated spending, provider transport and paid/live activation BLOCKED.** M2-06 is the separately authorized **scoped API/explicit paid gate** milestone from the implementation plan. The fake-only service boundary can support disabled/fail-closed API contract tests; it must not be installed as live provider transport or production spending authority. A real write endpoint still requires reviewed operator authentication, project/movie/task-create permission, exact recipe spending authority, one-use confirmation, actual fixed provider/price limits, restricted deployment roles/keys and separately approved migrations/runtime activation. Human receipt issuance remains independently disabled. No M2-06 implementation was started.

Retained limits: no real HTTP/SDK single-send proof, real provider success/failure classification, provider usage reconciliation, production timings, authenticated UNKNOWN investigation, real Redis wiring or live deployment was implemented. The in-process fake adapter deliberately satisfies this milestone's no-network constraint; it does not prove an SDK will refrain from retries. One unresolved synthetic request intentionally blocks other checkpoints indefinitely. These are explicit future activation gates, not reasons to bypass the existing invariants.
