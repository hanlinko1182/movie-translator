# Storyline M1 integration and acceptance — M1-F

Audit date: 2026-10-13. Audited HEAD: `29e5c38` plus the existing uncommitted M1-E2A/M1-E2B implementation. This report supersedes earlier green test summaries for **release acceptance**, while preserving their individual results.

**Follow-up — M1-FIX-01:** the reproduced source-integrity defect below is now corrected; the original PostgreSQL security regression passes unchanged and the expanded integrity suite passes. See [STORYLINE_SOURCE_INTEGRITY_FIX.md](STORYLINE_SOURCE_INTEGRITY_FIX.md) for the algorithm, rejection evidence and checks. The remainder of this document records the original M1-F audit, including its then-failing results. At that follow-up, complete M1 deployment remained **BLOCKED** by the durable verification-to-duration bridge and deployment/security prerequisites; it did not authorize issuance or M2.

**Follow-up — M1-FIX-02:** the durable verification-to-duration observation bridge is implemented and its isolated trust/race tests pass. See [STORYLINE_DURABLE_DURATION.md](STORYLINE_DURABLE_DURATION.md). It shares the actual restricted-role, signed ledger/source-currentness reader and existing M1-D formulas. Returned plans are observations only, never script/voice/execution authorization; no runtime issuer is enabled. Existing acceptance regressions remain unchanged. **Complete M1 is not accepted by this fix: a separate full M1-F rerun and deployment/security approval remain required.** The original historical findings below are retained for traceability.

## Decision: FAIL; do not enable or deploy Storyline M1 yet

The existing suites pass, but the new disposable PostgreSQL acceptance regression proves a source-content integrity defect in snapshot persistence and durable verification currentness. A separate duration integration dependency remains blocked. No application implementation was changed during this audit; the additions are this report and two synthetic acceptance test files.

No existing application database was connected to, migrated or mutated. No existing media, logs, receipt, job, queue, UI or environment file was changed. No AI/TTS call, real receipt issuance, rendering, staging, commit or push occurred.

## 1. Integration audit

| Boundary | Finding | Result |
| --- | --- | --- |
| M1-B preparation | Exact selected database project/movie; no newest-movie fallback. Read-only consistent captures bracket private source checksum/probe. Chinese transcript, source timestamps, current aligned ALL_CURRENT translations and approval/provenance/QC context are retained. Missing/stale context is explicit. | PASS for genuine preparation |
| M1-E2A snapshot commit | Project → Movie → Studio locks; authoritative dependency/media reread after locks; transaction rollback, optimistic revisions and content deduplication tested. **Copied dependency metadata does not authenticate the candidate's frozen source content.** | FAIL |
| Script commit | Studio/source ownership, immutable permitted anchors, claim ownership, version allocation, parent adjacency and complete ordered beat projections are validated. This validation inherits the snapshot integrity defect. | Conditional; blocked by source integrity |
| M1-C to M1-E2B verification | Chinese comparison rubric, exact proposal/claim/context/translation hashes, observed basis and qualification, explicit operator outcome, append-only history and signed durable envelope are connected. Durable currentness nevertheless trusts copied preparation metadata beneath the envelope. | FAIL at authoritative source binding |
| M1-D duration | Only the private M1-C foundation capability is accepted; JSON status DTOs and durable-service objects are rejected. Its output explicitly says `PROVIDED_IMMUTABLE_CONTEXT_ONLY`, `persisted: false`. No adapter to authoritative current durable receipt lookup exists. | BLOCKED integration; safe failure |
| Recap Studio shell | Query-based Saved Recap default and Script/AI Review/Voice/Highlights/Export navigation preserve selected older movie, history, keyboard access and honest unavailable states. Navigation makes zero API requests in browser regression. | PASS |
| Legacy Recap/subtitles | Existing production modules are unchanged by this audit. Selected unit/component/browser tests cover evidence validation, diagnostics, explicit retry, manual text, All Current/Approved Only, approval gaps, refinement hash changes, SRT/ASS and source streaming. | PASS for tested synthetic scenarios |

### Proven defect: frozen content is not compared to authoritative content

Reproduction: `tests/storyline/foundation-postgres-acceptance.test.ts`, using a newly owned private PostgreSQL cluster, twelve synthetic Chinese segments, one scene and fake inspected media.

1. Prepare a genuine candidate and independently confirm its Chinese segment matches the selected database record.
2. Change one synthetic Chinese segment in the candidate, recompute `validateSourceSnapshot` content/context hashes, and retain genuine preparation dependency/media hashes and candidate identity.
3. `persistPreparedStorylineSource` accepts the altered source. Expected rejection fails with `Missing expected rejection`.
4. Independently insert a well-formed altered source/script/beat set using the normal restricted runtime role's legitimate draft INSERT privileges. SQL projection, ownership and immutability guards accept this internally consistent draft.
5. Durable `propose` also accepts that context; its expected rejection fails. Durable `lookup` reports `CURRENT`, where the acceptance test requires rejection/staleness (`'CURRENT' !== 'STALE'`).

No verification command was authorized or issued in this reproduction; the receipt table is explicitly asserted empty. This proves faulty source authenticity/currentness, not unauthenticated signing or a bypass of the Chinese human-review rubric. There is no installed application route or issuer instance exposing this boundary today. It must be corrected before one is installed.

Files involved:

- `lib/storyline/persist-source.ts`: `verifyCandidate` validates self-consistency; post-lock checks compare copied preparation hashes to current dependency hashes without comparing frozen source text/evidence to authoritative capture.
- `lib/storyline/verification-context.ts`: `loadVerificationContext` validates stored projections and recomputable hashes; `inspectVerificationSource` and `assertVerificationSourceCurrent` repeat the copied-hash comparison.
- `lib/storyline/verification-service.ts`: proposal and lookup consume that context/currentness result.
- `lib/storyline/prepare-source.ts` / `read-source.ts`: genuine authoritative preparation already exists and should supply the reconstruction logic.

Smallest recommended correction, requiring a separately authorized implementation: extract a common authoritative snapshot-content reconstruction from the fresh selected source capture plus verified media. After acquiring the established locks, compare the canonical frozen Chinese/translation/scene/character/evidence payload to that reconstruction, excluding only intentional snapshot identity/capture-time fields. Reuse it in persistence and durable issuance/currentness reads. Validate every admitted translation and evidence projection, not only the modified Chinese field in this regression. A process-local brand alone is insufficient because the runtime role may legitimately insert drafts directly. Preserve historical immutable artifacts; reject invalid current content without deleting history. Do not replace this check with client hashes, loosen evidence validation or promote arbitrary JSON to authority.

### Duration acceptance boundary

`duration-engine.ts` consumes `readHumanSourceVerification` from the pure M1-C foundation. It does not consume E2B's signed, role-checked, live-current durable lookup. The new pure acceptance test proves both rejection of fabricated DTOs and the current immutable-context-only limitation. Existing supported-event counts are valid only within that supplied pure foundation; they are not a deployment-ready authoritative database duration calculation.

Before downstream use, introduce an explicitly server-owned, unforgeable authoritative duration view after validated durable lookup, bound to exact source/script/policy, receipt ledger/head and live currentness. Recheck it transactionally at persistence/approval boundaries. Do not accept a caller callback or a serialized `SOURCE_VERIFIED` field as the bridge. Actual TTS duration remains unknown, coefficients remain uncalibrated, and script/voice approval remain separate future gates.

## 2. Security gate results

| Gate | Evidence and limitation |
| --- | --- |
| Authenticated operator required | Private instance-owned proposals/commands, exact scope/action/decision, bounded expiry, one-use consumption; null authority, clones, fabricated grants and replay rejected. No authenticated operator adapter is installed. A local label is not authentication. |
| Signing fails closed | Null/cloned signer and public-only signer cannot issue. Lookup requires a pinned verifier. Ephemeral synthetic Ed25519 keys only; no key is taken from a request, receipt or database row. |
| Runtime cannot forge durable receipt | Disposable hardened runtime cannot INSERT (including column grants), UPDATE, DELETE, TRUNCATE, call issuer gateways, SET ROLE to issuer/owner, create bypass objects or disable guards. Unsigned/forged signed envelopes cannot authorize lookup. |
| Database shape is insufficient | Full canonical bindings, signed envelope, private operator authority, pinned verification, ledger chain and comparison rubric are required in addition to SQL guards. **Source authenticity beneath those bindings remains defective as above.** |
| Revoked/superseded/stale receipts | Existing signed-ledger tests reject old claim heads, changed dependencies and replaced/revoked inference basis. Altered payloads retaining copied dependency metadata are the uncovered failure. |
| Startup is disabled | `STORYLINE_VERIFICATION_ISSUANCE_ENABLED` is false; recursive boundary test finds no bootstrap/use in app, components or workers. No route, environment switch, key, issuer connection or operator adapter is installed. |

The issuance constant describes the application's installation boundary; it is not an independent kill switch inside an intentionally dependency-injected service. A trusted bootstrap supplying valid authority, signer and restricted connections can use that service. Enabling such bootstrap is a future authorized deployment change.

SQL does not prove human identity, source comparison or semantic truth. The review-only roles proposal must be reviewed with actual deployment privileges. Migration owner/superuser, compromised trusted signer/operator provider, arbitrary out-of-protocol database changes and filesystem writers are outside the restricted-runtime guarantee. One pinned key per service currently requires a historical key-rotation/retention plan before deployment.

## 3. Disposable PostgreSQL acceptance

The existing `DisposableStorylinePostgres` harness creates a fresh PostgreSQL **18.6** cluster and uniquely named database for each run, with dedicated random admin/runner/runtime/issuer credentials held in memory. It never reads the application datasource. No TCP listener is enabled; the cluster and socket are private mode 0700, SCRAM authenticated. Before SQL, the harness verifies database/user/owner, socket, data directory, UTF-8 and server major version. Teardown checks its exact ownership marker, process/nonce and directory prefix and removes only its own scratch cluster. Tests have connection, statement, lock and process timeouts.

The service/security/new acceptance suites apply sorted baseline migrations and `20261012120000_add_storyline_m1_foundation` from source. The lower-level SQL suite applies the review draft against the disposable baseline; draft tests enforce equivalence with the promoted migration. Roles SQL is applied only to the disposable cluster.

| Suite | Outcome |
| --- | --- |
| `persistence-postgres.test.ts` | 20/20 PASS: scope/FKs, uniqueness, interval/bounds, immutable records, complete beats, optimistic revisions, concurrent allocations, ledger constraints, rollback and recovery |
| `persistence-service-postgres.test.ts` | 7/7 PASS: current genuine snapshot/script persistence, concurrent dedup/version conflicts, source-writer race, rollback and unchanged synthetic legacy records |
| `verification-security-postgres.test.ts` | 11/11 PASS: restricted roles, trusted decisions/signatures, current signed lookup, revoke/supersede, inference invalidation, races and rollback |
| New `foundation-postgres-acceptance.test.ts` | **FAIL**: 1 passing prerequisite, 3 failing security acceptance subtests; Node totals 5 tests / 1 pass / 4 failures because the failed parent is also counted |

Real transaction tests reproduce the earlier source-currentness race: a Movie source writer commits while snapshot persistence waits for locks; the fresh locked reread rejects it with no new snapshot. A translation writer during verification lock wait similarly yields `VERIFICATION_SOURCE_STALE` without a ledger append. A forced post-insert media failure rolls back receipt and Studio revision. These successful checks do not repair the new altered-content defect.

The SQL concurrency suite intentionally reverses locks to assert bounded PostgreSQL deadlock detection (`40P01`); normal services share Project → Movie → Studio order. Source writers inspected use Movie locks for transcript, translation, human review/QC/refinement and scenes; character analysis/legacy recap take Project → Movie. Project/Movie row updates participate through row locks; Studio Movie FK restrictions prevent incompatible reparent/delete. Arbitrary privileged child-row writes outside this protocol are not covered.

Migration failure tests use disposable transactions and assert no partially applied foundation. Append-only/immutable history has no destructive rollback plan: production recovery requires backup/forward correction and explicit retention approval. Movie deletion/reparent is restricted once Studio history exists; operator UX for this consequence is not implemented here.

## 4. Additional verification

All commands ran from the repository root. Server tests use `node --conditions=react-server --import tsx`; client component tests use normal React conditions. No test sends a paid request.

| Check | Result |
| --- | --- |
| Storyline contracts / preparation / media / human verification / duration / evidence DTO / integration boundary / operator authority / persistence draft / new pure acceptance | 96 / 46 / 5 / 36 / 38 / 12 / 2 / 4 / 8 / 4 passing tests respectively |
| Recap diagnostics / recovery | 24 / 10 passing |
| Render subtitle snapshots / queue contract / export UI | 8 / 3 / 12 passing; no encoding or queue execution |
| Source stream / playback / preview | 6 / 8 / 3 passing; synthetic temporary media and responses |
| Storage configuration | 8 passing |
| Studio navigation / Recap recovery UI | 13 / 2 passing |
| Studio navigation browser | PASS at 1440 / 1024 / 390; all five legacy and five Studio tabs, older movie/history/keyboard, no overflow, zero navigation API/paid requests |
| Recap recovery browser | PASS at 1440 / 1024 / 390; confirmation, stale-token reset, double-click protection, safe errors and queued/active/failed/completed flow; POSTs are intercepted synthetic responses only |
| Prisma validate / generate | PASS with an unreachable dummy datasource, no database connection or migration; generated ignored client only |
| Lint / TypeScript / diff checks | PASS (final audit run) |
| Webpack production build | PASS outside sandbox with unreachable dummy datasource. Sandbox attempt failed reading TypeScript `--showConfig`; no configuration was weakened. |

Browser checks bundle existing components with actual built CSS and intercepted synthetic APIs on an isolated localhost fixture. They do not certify a live application's database deployment, authentication or real media/receipt workflows. PostgreSQL process/socket and browser subprocess checks required execution outside the restricted sandbox. No application production server or paid workers were started.

Reproduction commands for the new checks:

```sh
node --conditions=react-server --import tsx tests/storyline/foundation-acceptance.test.ts
node --conditions=react-server --import tsx tests/storyline/foundation-postgres-acceptance.test.ts
```

The second command is intentionally an unresolved failing acceptance regression; do not mark this milestone green or skip those tests to release.

## 5. Deployment state and required checks

| State | Audited status |
| --- | --- |
| Code implemented | Pure M1 contracts/preparation/verification/duration plus uncommitted persistence/security services; source integrity defect and duration bridge remain |
| Schema present in source | Five additive Storyline models/four enums in current uncommitted `prisma/schema.prisma`, one additive migration; role proposal remains under docs/drafts |
| Migration applied to disposable PostgreSQL | Yes, synthetic owned databases only; baseline and guards verified, new acceptance FAIL |
| Migration applied to existing application database | **Not inspected or applied by this workflow.** Source presence and Prisma generation do not establish deployment state |
| Runtime feature enabled | No installed Storyline persistence/receipt route, worker, operator adapter or signing bootstrap; issuance is not enabled |

Before any deployment, require all of the following, in order:

1. Correct authoritative payload reconstruction and pass the three new rejection regressions plus genuine unchanged-source, translation/QC/anchor tampering, source-race and legacy suites.
2. Define and test the durable verification-to-duration trust bridge; no consumer may infer live authority from the current pure duration result or lookup JSON.
3. Review the complete source/migration/role diff and commit boundary; authorize deployment separately. Verify backups/restore, additive compatibility, constraints, Movie retention restrictions, index/FK locking window and PostgreSQL version on the intended target. This audit certifies only 18.6.
4. In a separately authorized read-only deployment audit, inspect migration history and actual catalog schema/guards rather than inferring them from source. Do not rerun an applied SQL file manually or use destructive reset/backfill.
5. Provision restricted runtime/issuer/migration-owner identities with independently reviewed actual grants and safe gateway ownership/search path; owner-based application credentials must fail the service gate. Protect existing non-Storyline privilege requirements when reviewing the role proposal.
6. Provide an authenticated operator adapter, explicit Chinese-source comparison responsibility, private signer/verifier provisioning and key retention/rotation/recovery. A local label or environment boolean is insufficient.
7. Resolve ledger-limit/retention policy (current bounded ledger: 2048 entries), source currentness/approval dependencies and safe historical artifact access. Snapshot/script/receipt canonical payload bounds remain 16 MiB / 512 KiB / 32 KiB.
8. After explicit authorization, apply only the approved deployment artifacts, verify catalog gates, then run an explicitly scoped synthetic/operator acceptance check. Runtime enablement and later paid M2 actions need their own approval and explicit submission gates.

This audit performs none of steps 3–8 against an existing database and does not authorize M2.

## 6. Git ownership and safe staging plan

The existing index was preserved. Its diff SHA-256 before and after the audit is `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`. The nine pre-staged paths are not a self-contained E2A commit: the staged service test imports an untracked extracted fixture and E2B issuance module, and depends on unstaged harness changes. The staged E2A documentation links to the untracked E2B security document. Shared `human-verification.ts`, the disposable harness, draft tests and persistence tests cross the phase boundary.

Whole-file staging cannot currently produce honest independent E2A and E2B commits. Reconstructing a historical split would require deliberately separating dependency-aware hunks and validating each prospective tree; no such index manipulation was performed. Prefer one reviewed combined foundation/security commit **after the acceptance defects are fixed**, followed by a separate audit/tests commit. Do not commit the current partially staged tree or present the red acceptance tests as a successful release.

All paths below were inspected for phase ownership. Proposed commands only, from the repository root; they have **not** been executed. Re-review their diffs after any correction. Do not use `git add .` or include `logs/`.

Combined E2A/E2B staging candidate after fixes and approval:

```sh
git add -- \
  docs/STORYLINE_PERSISTENCE_M1_E2A.md \
  docs/STORYLINE_PERSISTENCE_REVIEW.md \
  docs/STORYLINE_VERIFICATION_SECURITY.md \
  docs/drafts/storyline-verification-roles.sql \
  prisma/schema.prisma \
  prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql \
  lib/storyline/human-verification.ts \
  lib/storyline/read-source.ts \
  lib/storyline/persist-source.ts \
  lib/storyline/persist-script.ts \
  lib/storyline/persistence-errors.ts \
  lib/storyline/persistence-locks.ts \
  lib/storyline/durable-verification.ts \
  lib/storyline/operator-authority.ts \
  lib/storyline/verification-attestation.ts \
  lib/storyline/verification-context.ts \
  lib/storyline/verification-database.ts \
  lib/storyline/verification-errors.ts \
  lib/storyline/verification-issuance.ts \
  lib/storyline/verification-service.ts \
  tests/storyline/disposable-postgres.ts \
  tests/storyline/persistence-draft.test.ts \
  tests/storyline/persistence-postgres.test.ts \
  tests/storyline/persistence-service-postgres.test.ts \
  tests/storyline/persistence.fixture.ts \
  tests/storyline/operator-authority.test.ts \
  tests/storyline/verification-security-postgres.test.ts
git diff --cached --check
git diff --cached --stat
```

M1-F audit additions, independently reviewable but dependent on the combined foundation for execution:

```sh
git add -- \
  docs/STORYLINE_M1_ACCEPTANCE.md \
  tests/storyline/foundation-acceptance.test.ts \
  tests/storyline/foundation-postgres-acceptance.test.ts
git diff --cached --check
git diff --cached --stat
```

The second command set adds to an existing index; it does not isolate these files or clear earlier staged changes. Review the entire index before deciding any boundary. Existing logs remain excluded and preserved.

## 7. M2 prerequisites and stop boundary

- Resolve the proven immutable-source authenticity/currentness failure and make the new acceptance regression green without weakening ownership, evidence or signatures.
- Complete the authoritative durable duration bridge and currentness dependency tests.
- Approve the complete persistence/security schema and deployment/retention/authentication/key plans; separately verify the actual target before applying anything.
- Preserve read-only navigation, historical artifacts, explicit future paid confirmations and existing subtitle/Recap semantics.
- Obtain separate scope authorization for M2 APIs/jobs/paid generation. No M2 implementation starts from this audit.

**M1-F recommendation: FAIL.** Existing green suites establish useful guarantees, but do not meet complete foundation integration/security acceptance. Live deployment and issuance remain blocked.
