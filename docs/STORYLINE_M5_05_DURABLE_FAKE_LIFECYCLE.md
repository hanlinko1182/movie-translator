# M5-05 — Disposable durable fake audio lifecycle

Date: 2026-10-19 (Asia/Bangkok). **M5-05 implementation and acceptance PASS — disposable FAKE_ONLY fixture only.** This report covers the committed scope and checks listed below. It is not a production storage, provider, approval or durability certification.

## Scope and package inventory

Entry baseline was `recovery/m9-studio` at `31e15dceb65cb3f1db3d049d81819bcffa3dab4a`. Work was limited to `lib/storyline/voice/durable-fake/`, its new disposable test namespace under `tests/storyline/durable-fake/`, and this report. The implementation creates no application route, Server Action, worker, production import, or existing M5-03 record migration. Existing M1–M5 contracts and M9 behavior are unchanged.

The M5-05 packages are:

| Package | Implementation |
| --- | --- |
| A. Versioned fake contracts | `contracts.ts`: 13 strict outer v1 envelopes, bounded capture, canonical hashes, FAKE_ONLY restriction equality, exact scope and inner receipt/collection replay. Approved narration references reject. |
| B. Disposable PostgreSQL ledger | Test-only `schema.sql` and `database.fixture.ts`: `voice_m505` scratch schema installed only in a fresh `DisposableStorylinePostgres`; append-only facts, tenant/scope composite keys, state overlays, quotas and audit. |
| C. Restricted server boundary | `auth.ts` and `database.ts`: process-registered synthetic session capability, origin/CSRF/action checks, independently restricted login per action, transaction/backend-bound one-use HMAC proof, live session/source/policy/key checks. No application composition. |
| D. Private immutable bytes | `storage.ts`: marked random temporary root, pinned directory handles, random exact versions, create-only writes, bounded no-follow reads, tombstones and marker-checked cleanup. Includes write-interruption and lost-ack faults. |
| E. Lifecycle service | `service.ts`: reserve, fake checkpoint/result observation, stage, byte validation, finalization, collection, private replay, cancellation, quarantine, recovery and exact-version GC. Every external storage operation sits outside SQL transactions. |
| F. Disposable fixture/restart tests | `fixture.ts`, `child.fixture.ts`, and test files create independent auth/database/storage and kill child processes at explicit barriers; recovery processes receive no fake send capability. |

## Frozen wire contracts and hashes

Every outer envelope has exactly `schemaVersion`, `execution: "FAKE_ONLY"`, `namespace`, `tenantId`, `scope: {projectId,movieId,studioId}`, the unchanged M5-01 `restrictions`, and `body`. Domain-separated canonical SHA-256 uses the existing canonical serializer and `contractHash(domain,envelope)`; the envelope hash is not embedded in its own payload. Unknown fields, getters, non-plain values, unsafe/fractional numbers, unsupported schemas, scope mismatch and limit overflow reject. JSON hashes do not prove caller authority or source currentness.

The 13 new domains are `story-durable-voice-request-v1`, `story-durable-synthetic-narration-binding-v1`, `story-durable-voice-recipe-v1`, `story-durable-voice-submission-v1`, `story-durable-audio-reservation-v1`, `story-durable-audio-stage-v1`, `story-durable-synthetic-audio-verification-v1`, `story-durable-synthetic-audio-artifact-v1`, `story-durable-synthetic-audio-collection-v1`, `story-durable-audio-access-policy-v1`, `story-durable-audio-lifecycle-v1`, `story-durable-audio-recovery-v1`, and `story-durable-audio-audit-v1`.

Their exact body fields, in order, are enforced by the parsers: request `{bindingHash,recipeHash,plan,chunkIndex,idempotencyKey}`; binding `{reference,planHash,eligibility,approval}`; recipe `{bindingHash,planHash,chunkIndex,capabilityHash,profileHash,innerRecipeHash,validator}`; submission `{id,requestHash,recipeHash,generation,innerRequestHash,innerSubmissionId,checkpointId}`; reservation `{id,submissionHash,planHash,chunkIndex,principalId,ownerGeneration,revision}`; stage `{id,reservationId,submissionId,ownerGeneration,objectVersion,audioSha256,bytes}`; verification `{stageHash,submissionId,ownerGeneration,revision,inner}`; artifact `{id,requestHash,recipeHash,submissionHash,reservationHash,stageHash,verificationHash,planHash,chunkIndex,objectVersion,inner}`; collection `{id,planHash,artifacts,inner}`; access `{principalId,sessionId,action,sourceEpoch,policyEpoch,expiresAtMs}`; lifecycle `{id,delivery,artifact,availability,revision,ownerGeneration,cancelled}`; recovery `{id,submissionId,ownerGeneration,revision,reason,action,auditId}`; audit `{id,aggregateId,principalId,action,priorRevision,nextRevision,timeMs,reason}`.

Ceilings remain request 2 MiB; binding/recipe 64 KiB; submission 32 KiB; reservation 64 KiB; stage 16 KiB; verification 128 KiB (inner receipt 64 KiB); artifact 256 KiB; collection 4 MiB (inner manifest 2 MiB); access 32 KiB; lifecycle 8 KiB; recovery 64 KiB; audit 16 KiB. The full M5-01 plan and M5-02 WAV/collection bounds remain authoritative. Existing M5-01 through M5-03 hash domains retain their meanings. Synthetic narration remains `SYNTHETIC_ONLY`, approval `NONE`, source verification false, real TTS/publication false, spending `NONE`.

The only design refinement from M5-04 is action-specific public SQL wrappers over one private dispatcher, sharing proof, lock, CAS and audit logic. Each login can execute only its own wrapper; the dispatcher and tables are private. This avoids duplicated security logic without giving a role cross-action authority. Results are newly validated durable-fixture records; no M5-03 memory state is relabeled or imported.

## SQL ownership and authorization

`schema.sql` is loaded only by `createDurableDatabaseFixture` after `DisposableStorylinePostgres.start()` creates an owned random local cluster/database. It is not an application migration and reads no `DATABASE_URL`. The fixture owns one non-login `voice_m505_owner`, one non-login group and random login for each of create/observe/validate/finalize/replay/recovery/GC, and independent 32-byte proof keys. Logins are non-superuser, cannot create roles/databases, cannot bypass RLS, own no schema/table, cannot create temporary tables, and have no table or column SELECT/DML. Public function execution is revoked; wrappers pin `pg_catalog,voice_m505,pg_temp`.

Composite foreign/primary keys include namespace, tenant and exact Project/Movie/Studio scope. Immutable request, submission, result, stage, verification, artifact, collection membership, recovery and audit rows reject update/delete/truncate. Availability, reservation lifecycle, holds and GC intent are distinct mutable rows. Gateway transitions check exact source/policy epoch and resolved synthetic server fixture, session, action, CSRF/origin, nonce, backend PID, transaction ID, payload hash, MAC, expiry, owner generation and revision. Proof consumption, transition and audit share the SQL transaction; audit or mandatory metadata quota failure rolls everything back. Calls use bounded database timeouts and recheck expiration after lock waits.

The service's `expected` gateway reads the preinstalled exact synthetic plan and scope from the isolated fixture context. This is a test source resolver, not evidence of a production M4/R4 lookup or production membership/authentication. The only original result authority is the server-owned fake execution in the explicit test service; public IDs, bytes, hashes and caller role labels cannot establish it.

## Storage, lifecycle and recovery

The fixture creates a random `movie-translator-m505-audio-*` directory under the OS temp root and a mode-restricted marker with random nonce/namespace/PID. Handles pin root and `objects` directories; object names must be exactly 32 lowercase hex characters. Operations reject caller paths, traversal, symlinks, non-regular files, link count changes, sparse/oversized reads and changed file metadata. Writes use exclusive create, file sync and directory sync; reads return copied bytes capped at 4 MiB. Delete checks exact hash and length, creates a permanent tombstone and deletes only that version. Lost delete acknowledgement remains idempotently reconcilable. Cleanup requires current owner PID and a matching marker.

The ledger binds scoped idempotency key, recipe, request, original submission generation, reservation, owner generation/revision, result observation, stage attempt/version, M5-02 receipt, artifact and complete collection. SQL commits reservation/checkpoint before fake execution; only the original live process holds the one-use fixture permit, consumed before awaits. A lost checkpoint ACK produces no fake result. UNKNOWN stays unresolved unless the original owned result journal was committed; recovery reads/reconciles that journal and never calls the fake adapter. Recovery can take ownership by incrementing owner generation while preserving immutable submission generation.

Stage bytes are written after a committed attempt, independently read and passed to unchanged M5-02 WAV/receipt validation, then a receipt is committed. Finalization reacquires session, source, policy, owner and revision fences and commits immutable artifact metadata with availability in the same SQL transaction. It needs no post-commit blob promotion. Ambiguous/incomplete/corrupt bytes are quarantined. A committed artifact row is immutable; corruption changes only availability plus recovery/audit evidence.

Replay takes a current permission/source check and expiring read hold, reads the exact immutable object version, replays M5-02 over bytes, rechecks availability/session and releases the hold. Complete collection coverage is sorted by canonical global chunk index; child references and each byte receipt are checked. Containers are not concatenated. GC needs an exact version, irreversible `DELETE_PENDING` intent, cancelled and resolved delivery, no collection reference, no active read hold and no unreleased quarantine hold. Delete occurs outside SQL, then the exact tombstone is acknowledged. Ambiguous outcomes keep the hold and prevent version reuse. Orphans are bounded (10/run), recorded and held; discovery never deletes or treats them as successful results.

## Verification and results

All PostgreSQL work used new owned disposable clusters and restricted logins. Application `DATABASE_URL` was explicitly set to `postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`; no connection to it succeeded or was attempted by M5-05. Storage tests used only marked temporary fixture roots, cleaned by their owner. No application DB, cloud store, external network, provider, TTS, movie media, Redis worker, approval issuer, SOURCE_VERIFIED receipt, or spending authority was used.

| Check | Result |
| --- | --- |
| M5-05 focused contracts/storage/lifecycle/security/child-restart | **58 passed, 0 failed**; 12 lifecycle child crash/restart barriers and two separate GC child restart cases. |
| M5-01–M5-03 focused regressions | **171 passed, 0 failed**. |
| R4/M9 editor and restricted PostgreSQL regression | **119 passed, 0 failed**. |
| Applicable full serial M1–M4/M9 server regression | **842 passed, 0 failed** in 397.0 seconds. This broad suite includes the 119 R4/M9 focused tests and the 8 M5 handoff tests; those are not added again to the distinct count. |
| Component suite | **43 passed, 0 failed**. |
| Chromium/Studio and legacy browser suites | **4 passed, 0 failed**; responsive checks covered 1440/1024/390 px. |
| `pnpm lint` | **PASS**, exit 0. |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0 after adding the test's explicit `string[]` type. |
| Dummy-datasource Webpack build | **PASS**, `next build --webpack`, exit 0. |
| Production source/client/action audit | **PASS**: no references in `app`, `components`, `workers`, or `scripts`; 71 client chunks scanned, zero M5-05 markers; zero node/edge Server Actions. |
| Diff, staged-diff, secret and working-tree checks | Final Git review follows below. |

The M5-05 initial focused run found one SQL ambiguity in persisted collection replay (57/58); the join was qualified, the isolated collection regression passed, and the complete M5-05 suite then passed 58/58. No assertion was weakened. The M5-01–M5-03 focused run separately passed 171/171; 8 handoff tests overlap the broad server run, so the unique total below subtracts them once. The R4/M9 focused run separately passed 119/119 but is wholly represented by the broad server count. The distinct completed count at this point is **1,110 = 842 + (171−8) + 58 + 43 + 4**.

The previously documented M4 expiry-control defect signature was investigated in the full serial server run. All six actual-wire positive controls (three each for M1 first and M1 last) and all six forced-expiry negative controls passed. The prior historical single positive-control miss did not recur. Assertions were not relaxed, and timing-sensitive tests were not run alongside builds or browser suites.

Commands used (the app datasource remained unreachable; all database tests instantiate their own disposable fixture):

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable node --conditions=react-server --import tsx --test --test-concurrency=1 tests/storyline/durable-fake/*.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable node --conditions=react-server --import tsx --test --test-concurrency=1 tests/storyline/private-artifacts/*.test.ts tests/storyline/audio-verification/*.test.ts tests/storyline/voice-foundation/*.test.ts tests/storyline/voice-handoff.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable node --conditions=react-server --import tsx --test --test-concurrency=1 tests/storyline/editor-saving/acceptance.test.ts tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable node --conditions=react-server --import tsx --test --test-concurrency=1 tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec tests/storyline/editor-saving/component.test.tsx tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs tests/storyline/ui/script-preview-browser.test.mjs tests/storyline/editor-saving/browser.test.mjs
pnpm lint
pnpm exec tsc --noEmit
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable pnpm exec next build --webpack
git diff --check
git diff --cached --check
```

## Limitations and next stage

This fixture proves transactional behavior and process restart against this PostgreSQL/filesystem test setup. Local fsync and process restart do not prove power-loss resilience, multi-host failover, backup/restore, malicious same-UID isolation, production key management or a supported production storage service. PostgreSQL superusers and the trusted test fixture root are outside the restricted-login threat model. The synthetic source resolver and session registry are test-only. The service does not expose a public download or application API.

M5-06, if separately authorized, should first review this acceptance and choose whether to extend fixture coverage or specify production issuer/storage requirements. Any durable provider execution, real narration approval, source-verification authority, spending permit, production authentication, deployment or media delivery needs a separate threat review and authorization. Do not widen these FAKE_ONLY schemas.
