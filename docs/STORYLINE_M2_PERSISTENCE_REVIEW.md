# Storyline M2 durable jobs persistence — review only

**Status:** proposed additive schema, validated only on a newly owned disposable PostgreSQL 18 cluster. The SQL is in `docs/drafts/storyline-m2-jobs.sql` and deliberately ends in `ROLLBACK`; the Prisma fragment is in `docs/drafts/storyline-m2-jobs.prisma`. Neither is a live migration. The application schema, application database, queues, paid workers and UI remain unchanged. This review does **not** approve paid operation or deployment.

## Scope and compatibility

The six proposed tables extend the five M1 Studio tables after the committed baseline and M1 migration. They do not rewrite Project, Movie, transcript, translation, Recap, render, source snapshot, script, beat or verification records. The existing M1 restrictive Movie/Studio deletion boundary remains: a Movie with a Studio cannot be deleted through ordinary cascade behavior. No data backfill or default task creation occurs. M1 source verification and duration are separate from AI task results; no M2 result is a receipt, approved script or source-verified claim.

The proposal follows the pure `story-task-recipe-v1` contract. `StoryTask` has one row per logical `(studioId, kind, recipeHash)` identity. Pre-checkpoint redispatch retains its generation and consumed, unexpired confirmation; the task trigger increments a bounded dispatch-attempt counter. `generation` advances in place only from definitive terminal FAILED/CANCELLED with no unresolved submission and a newly consumed, unexpired confirmation for the next generation. Child rows carry their historical generation; a trigger checks the **current** task generation at insertion. An unchanged completed, failed, cancelled or unresolved recipe does not create another logical task. The unique key makes duplicate admissions race-safe, while the later service must compare exact canonical recipe bytes on deduplication; a hash is not sufficient evidence of equality or authority.

## Relational design

| Table | Scoped identity and relationships | Principal SQL protection |
| --- | --- | --- |
| `StoryTask` | `(studioId, projectId, movieId)` → Studio; `(sourceSnapshotId, studioId, sourceContentHash, sourceContextHash)` → immutable source; optional six-column script FK includes exact source and script hash | Unique logical recipe; immutable canonical recipe/binding; bounded hash/text; allowed state transitions, generation and revision guards |
| `StoryTaskDispatch` | One row per task, current generation checked against task | Due index, bounded attempts, generation/lease guard; Redis receipt is advisory only |
| `StoryPaidConfirmation` | Studio FK, optional task binding with Studio and recipe hash; unique `(taskId, generation)` | PREPARED → CONSUMED once, expiry/budget bounds, task/profile/revision match; no insert already consumed |
| `StoryProviderSubmission` | Task FK, exact consumed confirmation/generation FK, unique `(taskId, generation)` and unique confirmation | Checkpoint insert requires leased live owner and unexpired grant; forward-only SUBMITTED → UNKNOWN/RESOLVED or UNKNOWN → RESOLVED; global unresolved-slot index |
| `StoryTaskResult` | Task FK and exact `(submissionId, taskId, generation)` FK | One per submission, immutable normalized payload/hash and bounded usage/cost; a result must precede definitive resolution |
| `StoryTaskEvent` | Task FK, unique `(taskId, sequence)` | Append-only, serialized task lock and contiguous sequence; static bounded reason codes |

All foreign keys restrict updates/deletes. Each table rejects deletion and truncation; results and events also reject update. PostgreSQL `CHECK`s enforce finite timestamps, bounded generation/revisions, SHA-256 shapes, payload byte ceilings, known/partial/unknown usage consistency and nonnegative reported USD micros. The initial schema chooses integer micro-USD to avoid floating-point money. The pure M2 limits are the ceilings; provider price/cost correctness still requires a versioned trusted server policy. M1's exact snapshot/script bindings remain database-backed FKs, not references to replaceable live transcript rows.

The SQL inspects the canonical recipe's identity projections as JSON **without rewriting the TEXT bytes**. It cannot independently recompute SHA-256, validate all nested recipe semantics, establish current source/media identity or authenticate a human. The trusted M2 admission service must call the M2-01 validators, recapture current authoritative M1 context, compare exact bytes/hashes and use a transaction with the M1 Project → Movie → Studio lock order. A task row is a durable historical binding, never currentness proof by itself.

## State, checkpoint and UNKNOWN

`QUEUED → LEASED → SUBMITTED → COMPLETED/FAILED` is the normal route. Pre-checkpoint cancellation reaches `CANCELLED` and prevents insertion of a checkpoint. Post-checkpoint cancellation records a sticky request; it does not claim remote cancellation or zero cost. If that request wins before terminal task resolution, the definitive original result ends in `CANCELLED` with result and accounting retained. `SUBMITTED → UNKNOWN` records ambiguous provider outcome; `UNKNOWN` cannot be reset to QUEUED or automatically retried. `UNKNOWN → RESOLVED` requires an original, immutable `StoryTaskResult`; only then may `UNKNOWN` become COMPLETED, FAILED or CANCELLED under an earlier cancel request. An audited future reconciliation service must decide whether its evidence is definitive. The draft does not implement that service.

The partial unique index over the constant `true` for `SUBMITTED` or `UNKNOWN` is a **database-wide unresolved paid-submission slot**. Concurrent inserts for different tasks contend on that index. A timeout, stale lease, Redis restart or task cancellation cannot free it. Only transition of the original submission to RESOLVED after a stored definitive result releases it. Operational consequence: a single ambiguous provider call can halt all new M2 paid submissions indefinitely. The product must explicitly approve that conservative tradeoff before any live migration; this review installs no permissive fallback. Legacy paid workers are not governed by this proposed slot.

A committed checkpoint says the request **may** have been sent. PostgreSQL cannot prove whether bytes reached a provider. A future worker may obtain a one-use process-local send permit only after acknowledged checkpoint commit, with HTTP redirects/retries disabled or proven single-send. A crash between commit and first byte must be treated as UNKNOWN, never assumed free. No SQL trigger alone can ensure network ordering. This schema does not send requests.

## Confirmation and database roles

Structural confirmation validity is not spending authorization. `authorityRef` is a binding, not a credential. A future authenticated operator and explicit paid acknowledgement must be checked before a trusted server issuer creates/consumes a grant. The current trusted-local deployment has no such authenticated spending principal, so issuance and paid worker start must stay disabled. Caller/provider JSON, local audit labels and M1 source-verification operator labels are not substitutes.

Proposed split:

1. **Migration owner:** owns schema/triggers; never used as the ordinary runtime credential.
2. **Normal runtime reader:** receives scoped read capability only; cannot insert grants, checkpoints, results or M1 receipts.
3. **Admission writer:** a restricted trusted gateway validates authenticated authority, exact recipe/quote/currentness and atomically consumes a grant with task/outbox creation. Direct generic table writes are not granted.
4. **Checkpoint worker:** a separate restricted gateway validates lease owner/generation, source currentness and single-use grant, commits the checkpoint, then hands only that process a one-use send permit. Direct generic submission UPDATE is not granted.

The review SQL revokes PUBLIC access to all new tables and intentionally **does not provision writable runtime roles or SECURITY DEFINER gateways**. Actual role grants require a separate audit of schema, function, default, PUBLIC and owner privileges. The disposable test proves a restricted nonowner login cannot directly insert M2 grants/submissions or M1 receipts. It does not prove a future gateway safe or authenticate an operator. Table owners and database superusers remain trusted; SQL shapes cannot stop them from inserting semantically false provider results.

## Transaction and failure design for M2-03 onward

- Admission: explicit confirmed POST only; lock Project → Movie → Studio, revalidate selected movie and immutable/current source, check authority/quote, insert or deduplicate task and dispatch in one DB transaction. Publish a reference-only BullMQ message **after** commit. Database commit with Redis failure leaves a due dispatch row.
- Claim: task/generation/stateRevision CAS, bounded lease and owner token. Recheck source/context/script/revision before checkpoint. Redis redelivery never creates another checkpoint.
- Checkpoint: recheck the exact **already consumed, unexpired** grant and insert unique submission in a short transaction before any future network I/O. A duplicate `(taskId,generation)` or confirmation fails. The global slot blocks additional unresolved paid calls.
- Result: insert bounded normalized candidate/finding payload and reported/unknown usage once; resolve the original submission only with definitive evidence. Revalidate source before any current publication. Candidate promotion into an M1 script is a separate explicit service transaction.
- Recovery: missing dispatch receipts may be republished; a stale pre-checkpoint lease may be retried within the bounded policy **without changing generation or refreshing the consumed grant**. Expiry/exhaustion is terminal until an explicit fresh confirmation binds the next generation. An existing checkpoint always forbids a new send. An `UNKNOWN` outcome requires operator investigation against trustworthy original-call evidence; no timeout or force retry.

The task stateRevision trigger requires +1, but a **future SQL update must also use `WHERE stateRevision = expected` and check one affected row**. The trigger alone does not know a caller's expected token. Similarly, the draft's lease fields do not authenticate worker identity; restricted gateways plus transactional owner-token comparison are required. The dispatch row stores current generation only; historical submission/result/event rows retain past generations. A new generation must rebind a fresh grant and source before dispatch.

## Disposable validation and limits of evidence

The new integration test uses the existing harness: a unique `m1e15_db_<nonce>` owned by the current test process, random in-memory dedicated credentials, UTF-8 PostgreSQL 18 cluster, private mode-0700 Unix socket, no TCP, verified server data directory/owner/database identity, 10-second statement and 2-second lock timeouts, marker-checked teardown. It **never reads or uses application DATABASE_URL**. The test applies committed baseline migrations, then the staged M1 migration, then replaces only the draft's final ROLLBACK with COMMIT **in memory** on the verified disposable target. Synthetic Project/Movie/Studio/source/script/beat records contain no actual media or provider response.

Covered cases include model/SQL table parity; isolated Prisma validation with unreachable dummy datasource; same-Studio/source/script binding, duplicate recipe, Movie deletion restriction, revision/dispatch fencing, pre- and post-checkpoint cancellation, grant single-use, unique checkpoint, UNKNOWN retention, global-slot release only after definitive result, two-connection admission and slot races, bounded opposite-order deadlock with rollback, event sequence/immutability, result immutability, transaction rollback and restricted-role denial. No provider call, Redis publication or existing-database migration was run.

The draft still needs a full final role-gateway design, a trusted operator authentication adapter, cost policy approval, an audited UNKNOWN resolution procedure, exhaustive generation/lease/cancellation race tests and a deployment migration review. In particular, an owner can construct an internally consistent but semantically false normalized result or choose to mark an outcome definitive; SQL cannot replace provider evidence validation. A committed checkpoint followed by an ambiguous network result will intentionally block the global slot.

## Migration safety and approval gate

The draft is additive: six tables, six enums, indexes, functions and triggers. It references M1 but changes no existing rows or M1 guards. All DDL is in one transaction with short timeouts. On a failed draft transaction, PostgreSQL rolls it back; the on-disk review file always rolls back. After a successful future deployment, **do not drop M2 history as a rollback shortcut**; disable admission/worker, preserve existing records and perform a reviewed forward correction. Check actual target migration history, PostgreSQL version, backup/restore, role provisioning, index/FK lock budget, storage/retention and operational monitoring separately before any application-database migration.

**M2-03 recommendation:** schema design and disposable PostgreSQL review may proceed to human review. Runtime admission remains **BLOCKED** until the global-slot policy, authenticated spending authority, role/gateway model, fixed profile/price policy and an exact reviewed migration integration are approved. M2-03 can only be built with fake authority/provider and an explicitly disabled production entry point. No paid operation is authorized by this report.
