# Storyline M2-07 — final fake-only acceptance and M3 handoff

## Decision and scope

**M2 fake-only implementation: PASS**, subject to the verification record below. The exported M2-03/04/05/06 services are composed only in tests with a newly owned disposable PostgreSQL cluster, synthetic media/authority and an in-process fake wire. This is an infrastructure acceptance, not approval of Storyline AI content or a live paid workflow.

| Gate | Decision | Evidence and boundary |
| --- | --- | --- |
| A. Fake-only M2 infrastructure | **PASS** | Exported services complete the integrated sequence in both M1/M2 role-script orders; existing negative suites and current regressions pass. |
| B. M3 fake-only development | **PASS to begin a separately authorized task** | M2 can carry a bounded synthetic `ANALYZE_EVIDENCE` candidate. M3 still needs its own content contracts, grounding validator and acceptance tests. |
| C. Production deployment | **BLOCKED** | M2 SQL remains review-only under `docs/drafts/`, live Prisma schema/migrations have no M2 models, existing application database state was not inspected or changed, production operator authority and restricted role provisioning are absent. |
| D. Real provider and paid spending | **BLOCKED** | No approved fixed provider/profile and cost policy, authenticated spending authority, real single-send transport proof, UNKNOWN investigation procedure or paid worker bootstrap. Synthetic decisions and fake wire are not live credentials or billing guarantees. |

No existing application database, real movie, live Redis/BullMQ worker, OpenRouter endpoint or M1 receipt issuer was used. No API GET or page render triggers work. The production Storyline task routes currently return `503 STORYLINE_TASKS_UNAVAILABLE` for reads and mutations because they have no production authority/data-source composition.

## Architecture and contract findings

- `recipe.ts`, `contracts.ts` and `persisted-source.ts` bind an immutable canonical recipe and hash to exact Project, selected Movie, Studio, persisted M1 snapshot ID, authoritative Chinese/context hashes, media identity, Studio revision, fixed profile, bounded segment window and optional immutable script. The disposable source is built through the real M1 preparation/persistence services, retaining Chinese evidence as primary and exact `ALL_CURRENT` translation/approval/provenance/QC context as advisory.
- `admission.ts` and the restricted transactional gateway recheck source, translation/QC alignment, media and script after locking Project → Movie → Studio. The gateway consumes a scoped, unexpired synthetic decision and commits task, confirmation, admission ledger, dispatch outbox and event atomically. Same binding is idempotent; a conflicting key/recipe or cross-scope admission fails. Only generation zero is implemented; terminal retry remains unavailable without a separately designed fresh-approval protocol.
- `dispatch.ts` and `reconcile.ts` publish only `{taskId,generation}` after commit. PostgreSQL owns receipt, attempt limits and CAS. Reconciliation is explicit, bounded and repeatable; no GET, import or timer performs it. The documented gap remains: there is no automatic enumeration of an acknowledged receipt that vanished after all observation tokens were lost. This does not permit a paid send or weaken source checks.
- `fake-worker.ts` uses a restricted worker identity, exact reference, opaque lease, database-clock ownership, heartbeat and generation/revision fencing. Claim and recovery revalidate current source and original consumed grant. Pre-checkpoint crashes may recover only within bounded attempts and the same generation. The original grant cannot be renewed by recovery.
- `fake-checkpoint.ts` and the restricted checkpoint gateway revalidate dependencies and commit the immutable `StoryProviderSubmission` before minting a process-local, one-use permit. Unacknowledged/uncertain commit does not send. `fake-transport.ts` has no network transport. A complete fake result is recorded once; ambiguous outcomes become `UNKNOWN`, retain the global unresolved slot and cannot auto resend. Cancellation after checkpoint does not imply remote refund. Missing usage/cost remains `UNKNOWN`, not zero.
- `read.ts` uses a separate restricted, read-only reader. `api-boundary.ts` limits pagination and projects status fields; private recipes, source text, normalized candidates, media paths, leases, confirmations and provider envelopes are absent. Only tests install a synthetic in-process principal; production route modules construct the API without any authority. M1 human source verification, subtitle approval, current script promotion and supported-duration counting are untouched by fake completion.

## Integrated disposable proof

`tests/storyline/jobs/final-acceptance-postgres.test.ts` drives the actual exported services, not direct SQL substitutes, in both reviewed role installation orders:

1. Apply committed baseline migrations plus review-only M2 drafts **only to a newly owned cluster**; persist synthetic M1 source and script through M1 services. Assert the task retains their real IDs and exact canonical recipe bytes/hash.
2. Issue one test-owned decision; admit a task; observe QUEUED and a committed outbox before any fake publication. Explicitly reconcile, observe one deterministic reference-only delivery, and claim the restricted worker lease.
3. Checkpoint that lease; observe SUBMITTED from an independent restricted status read before invoking the fake wire. Consume one opaque permit, record one definitive fake result, observe COMPLETED and the append-only `QUEUED → LEASED → SUBMITTED → COMPLETED` event sequence.
4. Admit a distinct synthetic recipe; deliver and claim it; simulate a lost fake response. Observe UNKNOWN, one wire invocation, no worker re-claim, no checkpoint recovery resend and no new dispatch from reconciliation.
5. Use an in-test session principal and the scoped API reader to observe both durable statuses. Compare paid-table/outbox/event/receipt counts before and after GET; no writes occur. The safe API body omits recipes, source IDs, normalized payloads, candidate claims and lease owners. No human verification receipt is created.

The test-only administrator queries event and ledger counts for audit; the restricted public reader intentionally has no event-table SELECT or event DTO. This is not a claim that an event-listing production API exists.

## Failure and security matrix

| Invariant | Current proof | Limitation |
| --- | --- | --- |
| Concurrent duplicate admission, conflicting idempotency, wrong scope and wrong database role | `services-postgres`, `transactional-gateway`, `disposable-admission-gateway`, role-order and scoped API tests | Synthetic authority only; no production identity. |
| Stale Chinese, `ALL_CURRENT` text/approval/QC, media and script | Admission, fake-worker and checkpoint PostgreSQL tests; M1 authoritative-source regressions | Synthetic media inspector; live filesystem/deployment needs separate validation. |
| Lease race, stale owner, crash/restart, expiry, cancellation, bounded recovery | Fake-worker and checkpoint service tests | No production BullMQ worker installed. |
| Commit acknowledgement, duplicate permit/send, definitive/ambiguous result, unresolved slot | Checkpoint/transport tests plus integrated acceptance | Real provider billing and idempotency remain unverified. |
| GET no mutation, safe projection, production fail closed | Scoped API PostgreSQL tests plus integrated count comparison | Production status reads intentionally unavailable until real authority/deployment. |
| No M1 receipt or approved-content publication | Disposable result/receipt assertions and source-level bootstrap audit | M3 must keep AI candidates separate from trusted human review. |
| Terminal retry without fresh approval | Generation-zero admission rejects unsupported reuse; no HTTP retry endpoint | A reviewed retry/UNKNOWN investigation design remains future work. |

The dedicated Storyline M2 queue is **not** installed or started. Existing legacy queue contract tests are regressions only; no real Redis/BullMQ process was started for this acceptance. Review-only SQL is never applied to the application database.

## Verification record

The disposable PostgreSQL runs used an unreachable dummy application `DATABASE_URL`; each harness created and owned its own isolated cluster and synthetic records. Node totals count parent tests as reported by its runner; separate reruns are not added twice.

| Check | Current result |
| --- | --- |
| M2-07 exported-service acceptance, both role orders | **2/2 PASS**, zero skips/failures |
| Server-side M1/M2 Storyline, Recap recovery/diagnostics, subtitle snapshot and queue-contract regressions | **709/709 PASS**, zero skips/failures |
| Recap recovery UI and Studio navigation component regressions, run with normal React condition | **2/2 PASS**, zero skips/failures |
| Scoped combined total, without repeat runs | **711/711 PASS** |
| Additional soft-subtitle suite | **8/8 PASS**; see scope deviation below; not counted in the M2 total |
| `pnpm lint` | PASS |
| `pnpm exec tsc --noEmit` | PASS after correcting a test-only union-state assertion |
| `git diff --check`, `git diff --cached --check`, untracked code/document whitespace | PASS |
| Webpack build, unreachable dummy datasource | PASS outside sandbox; Storyline routes compile but remain disabled |

Reproduction commands from repository root (the first requires permission for disposable local PostgreSQL sockets):

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' \
  node --conditions=react-server --import tsx --test --test-concurrency=1 --test \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test tests/recap/recovery-ui.test.tsx tests/storyline/ui/navigation.test.tsx
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

The first broad attempt included the two client UI files under `--conditions=react-server`: 709 passed and those two files failed at startup without an assertion. Running the server suite and UI files with their appropriate conditions produced the clean results above. Sandbox-only execution of disposable PostgreSQL could not use its private sockets. The sandboxed Webpack build failed at TypeScript `--showConfig`; the same command passed outside the sandbox without changing configuration.

The repository has no separate translation-service test file in this scope. The current Storyline suites exercise authoritative `ALL_CURRENT` text, approval, manual provenance, alignment and QC drift; the subtitle snapshot suite exercises SRT/ASS selection and approval gaps. This is regression evidence for those contracts, not a fresh live translation or subtitle-download test. Actual Redis delivery and a real paid provider remain untested and disabled by instruction.

**Scope deviation disclosed:** An additional soft-subtitle command intended to exclude its FFmpeg case with `--test-name-pattern` did not filter that case in this runner. It executed an existing short, wholly synthetic FFmpeg test under `/tmp` and passed 8/8. It did not read application movies, submit a render job, start a worker or touch the application database, but media processing was outside the intended M2-only verification scope. No further media tests were run; those 8 are excluded from the M2 acceptance total.

## Deployment inventory and remaining approvals

| Item | Current state |
| --- | --- |
| M1 source/verification code and committed M1 migration | Present in source; disposable validation passed in earlier M1 acceptance. Existing application database deployment is **not established here**. |
| M2 contracts/services and tests | Present; explicitly composed only in disposable tests. |
| M2 SQL and Prisma proposals | Review-only drafts; absent from live Prisma schema/migrations. |
| M2 SQL applied to disposable PostgreSQL | Yes, by owned fixture only. |
| M2 SQL applied to existing application database | No; never attempted. |
| Production restricted role credentials/operator authentication | Not configured or proven. |
| Fixed production model/profile/quote policy | Not approved. |
| Storyline Redis/BullMQ worker and real provider transport | Not installed or activated. |
| Human SOURCE_VERIFIED receipt issuance | Disabled; unrelated to M2 fake results. |
| Production task APIs | Built but disabled by construction; all methods return safe 503. |

Before any production deployment, separately authorize a target inventory and backup/restore plan, migration review and lock/ACL checks, actual server-session authentication and scoped permissions, profile/quote/budget policy, provider single-wire-send proof, secrets management, worker startup/shutdown, telemetry and an auditable UNKNOWN/billing investigation procedure. Do not convert an expired lease, timeout or missing log into permission to resend or release the global unresolved slot. A first paid request requires a separate explicit user task and confirmation.

## M3 implementation-ready handoff (not implemented)

**Recommended next milestone:** M3-01, pure evidence-analysis candidate contracts and deterministic grounding validators, followed by a fake-only service integration against M2. Start with fixed `ANALYZE_EVIDENCE` over one bounded source window and a synthetic result; do not activate a real model or paid worker.

The candidate should be versioned, byte/array bounded and carry the exact M2 task/generation, immutable M1 snapshot and source/context hashes, recipe hash, window, parent hashes and synthetic provenance. Proposed event/claim records need stable local IDs, ordered Chinese segment and scene anchors, character/relationship endpoint IDs, observed behavior, any **separately labeled** inferred motivation with explicit observed basis and cautious Myanmar wording, and exact optional Myanmar translation-row references plus row hashes/review/QC state. One scene may support multiple events. A model confidence value, if proposed later, is advisory self-assessment, never proof of semantic truth or expanded evidence ownership.

Deterministic M3 validation must reject out-of-window or cross-movie anchors, wrong-character/relationship evidence, missing Chinese basis, stale translation/media/script context, fabricated row hashes, duplicate IDs, unsupported causal chains and oversized or malformed output. Current Myanmar context can aid expression but cannot independently establish events, source verification or psychological fact. Preserve raw rejected/provider content privately if a later authorized design requires it; never return it from M2 status. A valid candidate remains separate from `StoryScriptVersion`, human `SOURCE_VERIFIED` receipts, script approval and duration support. Human comparison against original Chinese and explicit disposition are separate later workflows.

M3-01 acceptance should cover mixed approved/unapproved/MANUAL and QC-warning translations, one scene with multiple grounded events, exact character ownership, observed versus inferred claims, Unicode Myanmar text, malformed/oversize candidates, source drift before checkpoint and result publication, UNKNOWN no-resend, and no M1 receipt or approved-content write. Use only synthetic fixtures and fake wire until a separately approved real provider/security milestone.
