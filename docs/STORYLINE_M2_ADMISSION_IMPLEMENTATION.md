# Storyline M2-03 admission and outbox safety gate

**Current recommendation: PASS for separately scoped fake-only M2-04 planning/implementation.** The resumed M2-03 now implements uninstalled server services for admission, fake dispatch, explicit reconciliation and safe reads, tested through the reviewed restricted disposable gateways. M2-03D's genuine persisted snapshot path is preserved. Live deployment/paid activation remains BLOCKED by its independent gates. No API, Redis integration, worker, checkpoint or send permit is installed; M2-04 does not start here. Earlier blocker analyses below are historical.

## Resumed M2-03 — exported application services, disposable composition only

### Files and entry points

Created under `lib/storyline/jobs/`:

- `admission.ts`: `createStoryTaskAdmission({ database, profile, inspectMedia, validationKey }).admit({ decisionId, selection, identity })`.
- `dispatch.ts`: `createStoryTaskDispatch({ database, delivery, scope })`, with explicit `dispatchDue(scope, batch)`, server-only `acknowledge(claim, succeeded)` and `recoverMissing(scope, observation)` operations.
- `reconcile.ts`: `createStoryTaskReconciler(dispatch).reconcileOnce({ scope, batchSize, missingReceipts })`.
- `read.ts`: `createStoryTaskReader(database).list({ scope, afterTaskId, limit })`.
- `service-boundary.ts`: bounded scope/batch parsing, static safe error mapping and actual PostgreSQL privilege checks for dedicated reader/outbox connections.

Modified `tests/storyline/jobs/transactional-gateway.fixture.ts` to compose these services explicitly with its existing restricted credentials, private ephemeral HMAC key, fixed synthetic profile and synthetic media inspector. The fake delivery adapter lives only in new `tests/storyline/jobs/services-postgres.test.ts`, backed by a local Map. No authority issuer, decision provisioning, default datasource, key from the environment, scheduler or production composition is added to the services. Import/construction performs no admission, dispatch or network operation. Factories are deliberately absent from the pure `jobs/index.ts` barrel. Test connection pools are bounded/reused to fit the existing disposable cluster's 20-connection ceiling; application pooling is unchanged.

### Admission, authority and commit boundary

The request is bounded and captured as exact canonical JSON before asynchronous work. Unknown fields, caller persistence flags and substituted identity bytes/hashes are rejected. The profile, inspector, connection and 32-byte validation key are trusted server-bootstrap dependencies, not request fields or operator authentication. Missing/invalid keys fail closed. The service cannot issue a synthetic decision or a real spending confirmation.

Admission preflights the exact selected Project/Movie and inspects synthetic media outside locks. `createPersistedStoryTaskSourceAccess` owns the bounded ReadCommitted transaction and checks its effective nonowner privileges. On that same transaction, `story_m2_test_open_fence` acquires Project → Movie → Studio → existing Task → Decision locks. The service then reloads the genuine immutable M1 snapshot, preserves its `candidate-*` ID, recaptures authoritative Chinese/ALL_CURRENT/QC/evidence context, checks media freshness and optional current script, and validates the complete canonical recipe. It compares every challenge scope/source/script/revision binding plus the actual login/backend PID/transaction ID before creating the private HMAC. No supplied signer, `fresh=true`, receipt or source assertion can authorize finalization.

`story_m2_test_finalize(decisionId, proof, 0, 0)` is the only admission write gateway. It atomically creates StoryTask, consumes one StoryPaidConfirmation, and inserts StoryAdmission, StoryTaskDispatch and StoryTaskEvent. A final media check after finalization still occurs inside the transaction, so late failure rolls back all writes. The service returns `{ taskId, generation: 0 }` only after acknowledged commit and never invokes delivery itself. Failure or uncertain acknowledgement returns no committed reference; a caller must not dispatch speculatively. Durable outbox recovery is a separate explicit operation.

Only first-generation admission is supported. Exact duplicates using the original scoped decision/idempotency binding return the existing task without writes, additional confirmation consumption or generation changes. Reusing a key with different canonical bytes, replaying a decision into another binding, or attempting a fresh decision/key for an already admitted recipe is rejected by the reviewed gateway. This bounded behavior does **not** offer terminal retries, cross-key lookup/reuse or generation advancement. Those require a separately reviewed protocol.

### Delivery and explicit recovery

Only `storyline_outbox` connections can call `story_m2_test_claim_due`, `story_m2_test_delivery` and `story_m2_test_missing_receipt`. Each short transaction checks effective catalog privileges; owner, broad runtime, admission, checkpoint, issuer and combined reader/outbox connections fail. No direct paid/source table reads or writes are used. Numeric Prisma parameters are explicitly cast to PostgreSQL `integer` to match the reviewed function signatures.

`dispatchDue` commits one batch of at most ten claims before calling the fake adapter. Delivery ID is `story-text-{taskId}-g{generation}`; payload is exactly `{ taskId, generation }`. Publication or an incorrect returned receipt records delivery failure through the gateway, leaving durable intent. A successful publication followed by a failed/uncertain acknowledgement returns `ACK_UNCONFIRMED`, never a false success or a contradictory immediate failure acknowledgement. A stale owner/revision/generation cannot acknowledge; duplicate successful acknowledgement is an idempotent no-write result. Delivery is a reference only, never permission for a provider request.

`reconcileOnce` is opt-in with no timer/startup/read hook. It accepts at most ten exact missing-receipt observations and makes one claim batch of at most ten. Observations contain task ID/generation/stateRevision, not authority; the adapter must observe receipt absence, and PostgreSQL independently checks the connection's private scope, CAS, unexpired original consumed confirmation and absence of any checkpoint. Acknowledged receipt observations come from earlier dispatch results; the reviewed reader gateway does not expose dispatch revisions/receipts, so automatic enumeration of lost acknowledged receipts after losing those observations is **not** implemented. Pending unacknowledged intent and expired dispatch leases are still found durably by `claim_due` after process restart.

Expired pre-checkpoint worker leases may return LEASED → QUEUED in the same generation, with bounded counters and recovery events. The original grant is never refreshed. The reviewed ceiling remains three publication attempts and three pre-submission recoveries; a 500 ms claim lease and 25 ms failure delay are disposable test parameters. Exhaustion leaves intent safely undispatched; there is no invented terminalization/reconfirmation operation. An expired eligible row can reject the entire claim batch; the service fails closed rather than skipping it or weakening the gateway. SUBMITTED/UNKNOWN, cancellation and any checkpoint are excluded. No checkpoint is created by these tests. M2-04 must still revalidate dependencies before any execution/checkpoint; dispatch does not reserve future source freshness.

### Safe read contract

The dedicated `storyline_m2_reader` can execute only `story_m2_test_status`; it has no table SELECT/DML, admission, outbox, checkpoint or M1 issuance capability. Every list call uses `SET TRANSACTION READ ONLY`, exact Project/Movie/Studio scope, keyset pagination and a limit of 1–50. Returned fields are taskId, kind, state, generation, createdAt/stateChangedAt, allowlisted errorCode, actual candidateAvailable, and known/partial/unknown usage scalars. Missing usage stays null. No source text, recipe, path, key, lease/owner token, confirmation, decision or provider envelope is returned. The gateway has no profile/currentness projection, so the service returns its narrower honest DTO rather than inventing those fields. Reads never dispatch or reconcile.

### Acceptance and remaining gates

The new exported-service suite exercises both role-script orders and the actual M1 producer, including source changes after preflight, cooperating-writer blocking, concurrent duplicates, exact-byte conflicts, missing key/permissions, rollback, commit-before-fake-delivery, restart recovery, missing receipts, stale CAS/owners, acknowledgement uncertainty, grant expiry, attempt ceilings, current scripts, read-only pagination and unsafe-role rejection. Static regression checks verify that app/worker bootstrap and the pure barrel install none of these factories. The unchanged M2-03B/C/D suites retain UNKNOWN/global-slot, ACL and source integrity coverage.

Validation: **576/576 PASS**, no skips (59 new service checks, 517 existing required checks, including Node parent tests). `pnpm lint`, `pnpm exec tsc --noEmit` (also after build), `git diff --check`, cached/new-file whitespace checks and `pnpm exec next build --webpack` passed. The sandboxed build failed at TypeScript `--showConfig`; the identical command passed outside the sandbox without weakening configuration. All PostgreSQL tests used newly owned isolated PostgreSQL 18 clusters, synthetic data and an unreachable dummy application datasource. No application database, real media, Redis, provider, M1 receipt issuance or live migration was used.

Commands run for the resumed milestone:

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx tests/storyline/jobs/services-postgres.test.ts
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx --test-concurrency=1 --test tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

Individual untracked deliverables were also checked with `git diff --no-index --check /dev/null <file>`. Final cached diff SHA-256 remains `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`. A minimal disposable service probe and safe error-code inspection diagnosed test connection exhaustion; temporary diagnostic instrumentation was removed. No raw provider/source/private media data or credentials were logged.

The services are implemented, not deployed. SQL remains review-only, synthetic authority remains test-only, and runtime paid admission is disabled. Real authenticated operator/spending authority, fixed approved profiles/quotes, production role/key provisioning, UNKNOWN operational policy, existing-database migration approval and paid activation remain blockers. **PASS to proceed only with separately authorized fake-only M2-04; BLOCKED for live deployment or paid execution.** Staging, unrelated files and logs are preserved; no commit/push.

## M2-03D — genuine persisted snapshot identity

The `candidate-` prefix check was an unsupported inference about persistence. M1 stores that identifier unchanged, so the pure validator now treats all source IDs as opaque and makes no persistence claim. New `lib/storyline/jobs/persisted-source.ts` loads actual immutable/current database records, validates full canonical content/scope/script/media through M1 reconstruction, and issues private transaction-owned handles for trusted recipe construction/validation. JSON, `persisted: true`, a supplied hash or copied/expired handle cannot establish eligibility.

The existing test harness now uses the actual M1 prepared/persisted row and exact returned ID with no success-path replacement snapshot. It constructs the complete recipe through this source access and repeats validation under the existing restricted HMAC fence before atomic admission. The existing 40-test source/outbox/read proof runs on this genuine producer path. The new identity suite tests the server trust boundary and a self-consistent forged persisted row; the negative row never becomes eligible and original immutable history remains unchanged. See the alignment document for the complete lifecycle and compatibility contract.

M2-03D validation: **517/517 PASS**, no skips (24 new identity, 40 transactional proof, 57 existing M2 foundation, 359 M1 Storyline, 37 legacy Recap/queue checks; Node includes parents). Lint, TypeScript, tracked/cached/new-file whitespace checks and Webpack build passed. The sandboxed build failed during TypeScript `--showConfig` probing; the identical command passed outside the sandbox with an unreachable dummy application datasource. Full commands, exact files and trust/deployment limits are recorded in the alignment document. No existing database, Redis/provider transport or real media rendering was used; cached staging SHA-256 remained `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`.

## M2-03C — transaction, outbox and safe-read proof

Artifacts: [review-only SQL extension](drafts/storyline-m2-transactional-gateway.sql), `tests/storyline/jobs/transactional-gateway.fixture.ts` and `transactional-gateway.test.ts`. The extension follows the existing M1/M2/ledger/M2-03B drafts and ends with `ROLLBACK`; only the owned disposable harness replaces that terminator in memory. The existing live schema and migrations remain unchanged.

### Source/media/script protocol

1. The test-only bootstrap seeds actual disposable Chinese transcript/segments, ALL_CURRENT translations with approval/manual provenance/QC, scenes, character evidence, a historical recap, Studio snapshots and an immutable script. It creates separate restricted login connections and a fresh private 32-byte validation key. No application configuration or real media is used.
2. Media inspection uses the existing `InspectedStorylineMedia` contract outside the short transaction. The injected synthetic inspector can independently fail checksum or descriptor/path freshness checks. This tests the protocol and M1 contract; it is not a new certification of actual FFprobe/filesystem behavior.
3. A restricted admission connection begins a bounded **ReadCommitted** transaction. `story_m2_test_open_fence` derives the original synthetic authority from `session_user`, checks explicit scope, locks **Project → Movie → Studio → existing Task → Decision**, checks current pointers/revision and decision expiry, then stores a private challenge bound to backend PID, transaction ID, login, decision, recipe, scope, source/context/script hashes and Studio revision. Unsafe isolation is rejected.
4. On that same connection/transaction, the trusted test harness reloads the complete immutable snapshot row and validates its canonical bytes, source/context/dependency/media fields. It recaptures authoritative M1 source with `captureStorylineSourceInTransaction`, runs `assertAuthoritativeStorylineSource` against independently inspected media, validates optional current immutable script and the full M2 recipe/profile using existing validators, and checks the returned challenge's exact bindings. No caller-provided validation flag, signer callback or certificate enters this path.
5. Only after all checks pass does the module-private test signer authenticate that exact challenge with HMAC-SHA256. `story_m2_test_finalize` verifies the MAC using a private database key and the current backend/transaction/login, enforces first-generation CAS and a 20-second fence age, then invokes the original owner-only admission function. Confirmation consumption, task, dispatch, event and scoped admission are still one transaction. The direct M2-03B admission EXECUTE grant is revoked when this extension is installed. The fence is consumed, and media freshness is checked again before transaction completion; late failures roll back everything.

The installed PostgreSQL `pgcrypto` extension is used only inside a private disposable schema for HMAC verification. Its schema/functions and the key/fence tables are inaccessible to restricted principals. No Node package or application dependency is added. Missing key, forged MAC, copied proof from another transaction, wrong scope and stale dependencies fail closed. The HMAC authenticates a trusted server's deterministic source check; it is **not** operator authentication, a human SOURCE_VERIFIED receipt, subtitle/script approval or permission to call a provider. Real authority remains absent and disabled.

Movie locks stay held from opening the fence through finalization and commit/rollback, so a cooperating source publisher cannot commit between comparison and admission. A real competing transaction is observed waiting via `pg_blocking_pids` and proceeds after admission resolves. Privileged writers ignoring the source-lock protocol and filesystem administrators remain outside this guarantee. File identity checks are observations before completion, not an atomic lock on external media for a future job.

### Restricted outbox and reader

| Operation | Boundaries and behavior |
| --- | --- |
| `story_m2_test_claim_due(scope, batch)` | Separate `storyline_outbox` login, private synthetic scope mapping, batch 1–10, deterministic task-ID order. Locks Project → Movie → Studio → Task → Decision → consumed Confirmation → Dispatch. Checks generation/stateRevision, cancellation, absence of any current checkpoint, original grant expiry, due time and database-clock ownership. Generates its own dispatch token and a fixed 500 ms test lease. At most 3 publication attempts. |
| Expired pre-checkpoint worker lease | Only QUEUED/LEASED tasks can enter dispatch. An expired LEASED task transitions to QUEUED in the same generation with stateRevision CAS, clears worker ownership and appends a recovery event. Existing SQL increments/caps `preSubmitAttempts` at 3 atomically. A previously acknowledged queue receipt does not prevent this recovery. No new confirmation or task generation is created. |
| `story_m2_test_delivery(task, generation, revision, owner, succeeded)` | Exact generation/revision/owner and live lease required. Success records only the deterministic `story-text-{taskId}-g{generation}` receipt; identical acknowledgement is a no-write false result. Failure preserves the row and original confirmation, clears delivery ownership and leaves a due retry after a fixed 25 ms test delay. Stale owners/revisions/generations and expired grants cannot acknowledge. |
| `story_m2_test_missing_receipt(...)` | Explicit, test/manual observation of a missing fake receipt rearms only the same QUEUED generation under the same grant/CAS guards. Duplicate missing-receipt reports are no-write false results. It cannot recover UNKNOWN/SUBMITTED, authorize a send, extend a grant or bypass attempt bounds. |
| `story_m2_test_status(scope, afterId, batch)` | Dedicated `storyline_m2_reader` login, exact private scope, keyset ordering by task ID and batch 1–50. STABLE function succeeds in `BEGIN READ ONLY`. Returns only task ID/kind/state/generation, timestamps, allowlisted static error code, actual candidate-availability flag and known/partial/unknown usage scalars. No full table SELECT, source text, recipe, decision/confirmation, lease, key, path or provider payload is exposed. |

Reference-only fake delivery occurs in a local Map after admission's transaction promise resolves. Duplicate deterministic IDs replace the same Map entry. A fake delivery failure and a missing acknowledged receipt are both recovered explicitly in tests; there is no background reconciler, production Redis connection or bootstrap integration. Attempt exhaustion leaves the intent safely undispatched for a future separately reviewed terminal policy; it does not refresh authority. Dispatch/reconciliation proves delivery eligibility only, not current source eligibility for a future provider request. M2-04/05 must still revalidate before execution/checkpoint.

`story_m2_test_dispatchable` is a private SQL predicate shared by claim and acknowledgement guards; both SUBMITTED and UNKNOWN evaluate false. The new proof creates **zero provider-submission records**. The unchanged M2 regression suite separately exercises persisted UNKNOWN/global-slot constraints with its pre-existing synthetic histories. No checkpoint gateway or send permit is implemented here.

### Privileges and trust limits

All new sensitive functions are owned by NOLOGIN `storyline_migration_owner`, use a fixed `pg_catalog, public, pg_temp` search path, qualify their own application/crypto objects and revoke PUBLIC plus unintended named-role EXECUTE in the installation transaction. Existing invoker triggers still require the trusted `public` schema in the path; restricted CREATE is denied and the fresh cluster has no default ACLs. Both M1-before-M2 and M2-before-M1 orders are exercised. Real deployment ACL/default-grant inventories and trigger hardening remain separate gates.

Admission gets enumerated source/snapshot/script SELECT for M1 reconstruction, plus open/finalize EXECUTE, but no source DML, paid-table DML, provider checkpoint or M1 receipt issuance. Issuance remains a separate synthetic login. Outbox gets only claim/delivery/missing-receipt functions. The new reader gets only status EXECUTE and schema USAGE, with neither source reads/writes nor paid-table SELECT/DML. Existing `storyline_runtime` retains its existing M1 fixture permissions and receives no new paid gateway. Schema-owner/admin access is used only for isolated fixture setup, key provisioning and deliberate synthetic failure/lifecycle setup, never as admission or outbox runtime.

### Historical M2-03C integration blocker — resolved by M2-03D

`persistPreparedStorylineSource` persists the prepared `candidate-*` payload ID unchanged. `lib/storyline/jobs/recipe.ts:checkedSource` rejects every `candidate-*` ID, including an actually persisted, current authoritative snapshot. The new fixture calls the real M1 persister and preserves its output as immutable history, then proves that the unchanged M2 recipe validator rejects it at `sourceSnapshot`. This incompatibility cannot be fixed inside a SQL privilege gateway.

To finish the security proof without changing either application contract, fixture setup makes a real synthetic translation revision change and inserts a **separate, explicitly named disposable snapshot** using existing M1 SQL guards after authoritative reconstruction under the normal locks. Its complete source comes from real disposable child records, and the admission protocol rechecks it independently. This fixture is not a workaround offered to application services, an ID rewrite, or evidence that the normal M1-to-M2 producer path works.

**Historical M2-03C recommendation, superseded by M2-03D:** resuming full fake-only M2-03 was BLOCKED pending identity/persistence alignment and a genuine producer regression. The alignment above preserves immutable history and replaces the prefix heuristic with database-backed eligibility. No M2-04 work starts here.

### M2-03C verification results

| Check | Result |
| --- | --- |
| New transactional source/outbox/read proof | **40/40 PASS**, both role-script orders; final focused rerun also passed after ownership/permission checks were tightened |
| Existing M2 contract/SQL/gateway/role-order suites | **57/57 PASS**, including unchanged 14-check M2-03B proof |
| Existing M1 Storyline suites | **359/359 PASS**, including authoritative source, signed verification, duration, persistence, contracts and preparation |
| Legacy Recap recovery/diagnostics and render-queue contracts | **37/37 PASS** |
| Full required regression run | **493/493 PASS**, no skips; parent tests included as reported by Node |
| pnpm lint | PASS |
| pnpm exec tsc --noEmit | PASS after build |
| git diff --check / cached check | PASS; new untracked deliverables checked separately |
| Webpack production build | PASS outside sandbox with unreachable dummy application datasource |

Commands:

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx --test-concurrency=1 --test tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx tests/storyline/jobs/transactional-gateway.test.ts
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

The first sandboxed build failed with `Could not parse output from TypeScript's --showConfig.` The identical command passed outside the sandbox; configuration was not weakened. The final focused rerun supplements the full run rather than adding overlapping checks to the 493 total. An import/reference scan found no test bootstrap, key table or `story_m2_test_*` usage in `app`, `lib` or `workers`. Existing regression suites use their own synthetic fixtures; the new M2-03C proof creates no provider checkpoint or human verification receipt.

Created: SQL extension and two focused test files. Modified: this document, the gateway review and the disposable harness's restricted-login role allowlist (outbox/reader only). No application source/schema/migration, dependencies, environment, UI or worker changed. No existing database, real media, Redis or paid provider was accessed. Cached diff SHA-256 remained `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`; staged and unrelated files/logs were preserved. No commit or push occurred.

## M2-03 continuation after M2-03B

### What is implemented and reusable

The review-only `storyline-m2-admission-ledger.sql` now supplies immutable spending decisions and durable scoped idempotency. `storyline-m2-disposable-admission-gateway.sql` supplies two restricted synthetic operations: `story_m2_test_issue_decision(integer)` and `story_m2_test_admit(text,integer,integer)`. The latter creates the task, consumed confirmation, dispatch, event and admission atomically. Its exact-byte/hash, first-generation, scope, expiry, duplicate and rollback behavior is exercised using restricted disposable logins. Neither operation is called by the application. The historical blocker list below predates these additions.

M2-03B's PASS established this bounded disposable privilege/atomicity proof. It did not establish full M2-03 readiness; its own final boundary section explicitly defers source-file inspection, script currentness, runtime reads and outbox reconciliation. The required service implementation must therefore remain blocked despite that earlier conditional recommendation.

### Exact missing operations

| Requirement | Reviewed gateway capability | Missing safe operation |
| --- | --- | --- |
| Current Chinese, ALL_CURRENT translation, approval/QC and media at admission | Locks Project → Movie → Studio and compares Studio revision/current snapshot ID; decision/task fields reference immutable historical rows | A restricted transaction protocol that holds those locks while the trusted server recaptures current authoritative M1 data, compares the full immutable snapshot, rechecks the previously inspected media descriptor, and admits before releasing locks. No such lock/read/finalize operation is granted. |
| Exact optional current script | Historical same-Studio script/hash FK and decision binding | Current script pointer and dependency validation within the same fenced transaction, using the validated immutable script contract. |
| Durable outbox claim/acknowledgement/recovery | Inserts one due `StoryTaskDispatch` row at initial admission | Bounded scoped claim and acknowledgement operations with task generation/stateRevision, dispatch-owner lease, original consumed/unexpired grant, due time and pre-checkpoint retry guards. There is no granted dispatch function or restricted table access. |
| Safe status reads | Pure `parseStoryTaskPublicStatus` allowlist exists | A bounded scoped read gateway/view for runtime. Runtime has no M2 SELECT grant; a parser cannot authorize or perform the read. |

The source gate is not equivalent to Studio revision equality: existing translation/QC/transcript publishers can change Movie child data without changing Studio revision or its snapshot pointer. `assertAuthoritativeStorylineSource` requires a fresh `captureStorylineSourceInTransaction` result and independently inspected media; the admission SQL performs neither. M1 `persist-source.ts` and `persist-script.ts` demonstrate the existing safe pattern: inspect media outside the bounded transaction, acquire Project → Movie → Studio locks, recapture and compare authoritative content, call `media.assertUnchanged()`, then write and recheck before commit.

The M2-03B fixture deliberately persists a snapshot produced from an in-memory preparation fixture without persisting its live transcript/translation/scene children. Its successful admission proves historical FK/scope and synthetic authority binding, not current source validation. The fixture also uses a reduced synthetic recipe projection; it does not exercise complete production recipe validation, optional current scripts, media replacement or QC races. These are acceptance gaps, not defects in the stated bounded proof.

A separate preflight read followed by `story_m2_test_admit` would release the read boundary before admission, allowing a source writer to commit in between. Supplying a hash or `fresh: true` argument would transfer trust to caller structure. Granting direct paid-table DML, sharing a schema-owner connection, or adding runtime role membership to bypass the missing gateway would violate the reviewed role boundary. None is used here.

### Required disposable prerequisite

Review a narrow extension that lets one restricted server transaction acquire the exact selection locks, access only the source records needed by the M1 reconstruction contract, validate immutable snapshot/script and private server-owned authority, and finalize admission while the same locks remain held. Specify how the nonserializable server validation result is bound to that transaction; a generic JSON validation certificate is insufficient. Media hashing/probing must remain outside the short transaction, with the M1 descriptor/path recheck inside it. Test a real source writer waiting on the Movie lock and changes committed before lock acquisition.

Separately review restricted outbox claim/acknowledgement and safe-read signatures, ACLs and CAS predicates. Prove grant expiry, same-generation retry bounds, stale-owner rejection, duplicate acknowledgement and commit-success/fake-delivery-failure recovery through those operations. Preserve the existing UNKNOWN/global-slot rules and require no provider checkpoint capability for M2-03. Only after these disposable proofs pass can `admission.ts`, `dispatch.ts`, `reconcile.ts` and `read.ts` be implemented without bypassing authority.

**M2-04 recommendation: BLOCKED.** The current continuation changes documentation only. No new M2-03 acceptance tests are claimed, because the requested services cannot safely be implemented against the reviewed gateway. Existing foundation regressions are reported below separately from unimplemented M2-03 acceptance.

### Continuation verification

Executed with an unreachable dummy application datasource and newly owned disposable PostgreSQL clusters only:

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx --test-concurrency=1 --test tests/storyline/jobs/*.test.ts tests/storyline/authoritative-source-postgres.test.ts tests/storyline/durable-duration-postgres.test.ts tests/storyline/verification-security-postgres.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts
```

Result: **170/170 PASS**, no skips: 57 M2 contract/draft/gateway/role-order checks, 76 M1 source/durable-duration/verification-security checks, 34 legacy Recap checks and 3 render-queue contract checks (Node includes parent tests). The gateway subset remains 14/14. These test counts certify their existing boundaries, not an M2-03 service or outbox recovery implementation. No Redis integration tests, paid provider transport, real media inspection or live receipt issuance ran.

`pnpm lint`, `pnpm exec tsc --noEmit`, `git diff --check` and cached diff checks passed. `pnpm exec next build --webpack` passed with the unreachable dummy datasource after rerunning outside the sandbox; the sandboxed attempt failed with `Could not parse output from TypeScript's --showConfig.` No build configuration was weakened. The staged diff hash was unchanged before and after verification; existing uncommitted source, schema, draft SQL, tests and logs were preserved. This continuation modifies only this document and the gateway review's readiness wording.

## Historical pre-M2-03A/B review

The following records the original review and its then-missing capabilities; the current matrix above is authoritative for this continuation.

## Reviewed foundation

- The six review-only M2 tables and guards are in `docs/drafts/storyline-m2-jobs.sql`. The draft ends in `ROLLBACK`; disposable tests replace that ending with `COMMIT` inside a newly owned PostgreSQL cluster. The live Prisma schema and migration history do not include M2.
- `StoryTask` has unique `(studioId, kind, recipeHash)` and stores canonical recipe bytes. `StoryTaskDispatch` can represent a due PostgreSQL outbox row. A task, confirmation consumption, dispatch, and event could be committed atomically once a restricted writer is available.
- M1 authoritative source preparation and persistence services can recheck the selected project/movie, current translation and QC context, source media identity, immutable source snapshot, and Studio revision. M2 pure contracts provide canonical recipe hashing, transition validation, and safe public status shapes.
- Existing render and Recap queues offer dispatch and polling patterns, but they are not a Storyline admission authority. Their workers and queues remain unchanged.

## Blocking contract gaps

1. **No restricted admission write capability.** The draft SQL revokes `PUBLIC` access to all six M2 tables and intentionally creates no admission `SECURITY DEFINER` gateway or `EXECUTE` grant. The proposed `storyline_admission_writer` role has no direct table rights. Existing role-order tests prove denied inserts in both M1/M2 role-script orders. A service using the schema owner to insert confirmations/tasks/outbox rows would bypass the reviewed security boundary, so it is not an acceptable substitute even in fake-only implementation code.
2. **No durable scoped idempotency key.** The schema deduplicates a logical `(studioId, kind, recipeHash)` task, but it has no unique key bound to authenticated subject, project, movie, and caller idempotency key. The pure `assertSameIdempotentRecipe` function cannot enforce a cross-process or concurrent conflict. M2-03's required conflicting-key and duplicate-confirmation proofs therefore cannot be made durable with the reviewed schema.
3. **No durable spending-decision identity.** `StoryPaidConfirmation.authorityRef` is an opaque structural reference. The reviewed design does not yet define a server-owned, authenticated subject/action decision ledger, acknowledgement binding, or role-limited way to create and consume it. A valid row shape or caller-supplied reference cannot become spending authority. The existing M1 operator authority permits source verification/revocation, not paid M2 admission.

These gaps are recorded in `docs/STORYLINE_M2_SECURITY_GATE_REVIEW.md` and `docs/STORYLINE_M2_CONTRACT_ALIGNMENT.md`. The M2-03 request explicitly requires a **BLOCKED** report when reviewed SQL is insufficient, rather than use an unrestricted application role. Consequently, no server admission, outbox publisher, reconciler, status helper, or fake-delivery implementation is being added under this milestone. Synthetic tests cannot honestly demonstrate a successful restricted admission until the boundary exists.

## Required prerequisite before resuming M2-03

Review an additive, disposable-only SQL/Prisma revision that provides:

1. An immutable, uniquely scoped idempotency binding for authenticated subject, project, movie, and key, with exact canonical recipe-byte comparison on duplicate use.
2. A server-owned synthetic decision/confirmation ledger that binds identity, scoped task-creation and per-recipe spend permission, explicit acknowledgement, quote/profile, snapshot/script, Studio revision, expiry, and generation. Normal runtime must deny by default; a test authority must be injectable only in isolated tests.
3. Narrow admission and read gateways for separate restricted credentials, including exact identity/currentness checks, transactionally consumed confirmation and task/dispatch/event insertion, and bounded scoped reads. Gateway ownership, fixed search path, grants/default ACLs, and lock order require review. Neither a generic JSON-to-row function nor an owner-role application connection is acceptable.
4. Disposable PostgreSQL privilege tests in both M1 role-script orders, negative forged/stale/cross-scope tests, concurrent duplicate/conflicting-key races, and rollback tests. Only after these pass should reference-only fake delivery and opt-in reconciliation be implemented. Redis delivery must occur after the database commit.

M2-04 remains blocked until M2-03 completes. This document does not request or authorize a live migration, paid call, provider checkpoint, API, UI, or worker startup.

## Verification of the existing foundation

- M2 pure contracts and isolated draft Prisma validation passed; M2 disposable PostgreSQL persistence checks passed (17 checks).
- The restricted-role boundary passed in both M1/M2 script orders (2 checks). These tests confirm denial of direct M2 writes; they do not provide a working admission gateway.
- Existing M1 authoritative-source (39 checks), durable-duration (26 checks), and verification-security (11 checks) suites passed on synthetic disposable data. Existing Recap recovery (10 checks) and render-queue contract (3 checks) suites passed.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `git diff --check`, and the Webpack production build passed. The build required execution outside the filesystem sandbox because that sandbox denied Next.js's child-process invocation of TypeScript with `EPERM`; an unreachable dummy database URL was used. No application database or paid service was contacted.
- M2-03 admission/outbox/reconciliation tests were not created or run because the required restricted write and idempotency capabilities are absent. Passing draft constraint tests must not be interpreted as M2-03 acceptance.
