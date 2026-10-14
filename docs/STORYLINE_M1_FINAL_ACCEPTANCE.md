# Storyline M1 final acceptance — M1-FR

Date: 2026-10-13. Audited HEAD: `29e5c38` plus the existing staged/unstaged M1-E2A, M1-E2B, FIX-01 and FIX-02 working tree.

## Decision

**Implementation acceptance: PASS for the bounded M1 foundation.** This independent rerun exercised the original failed regression unchanged, all six disposable PostgreSQL suites, the actual signed durable verification-to-duration path, pure contracts, legacy subtitle services and existing browser components. No remaining implementation defect was demonstrated in these boundaries. This decision supersedes the unresolved implementation findings in the historical [M1-F report](STORYLINE_M1_ACCEPTANCE.md); it does not rewrite that report or rely solely on the two fix reports.

**Existing-database deployment and runtime activation: BLOCKED pending the separate approvals and operational gates below.** Passing code tests does not authenticate an operator, provision roles/keys, calibrate policy or authorize migration, receipt issuance or paid work.

M1 foundation code is ready for human closure review and a coherent combined commit after approval. M2 planning can begin as a separately authorized planning task; M2 implementation, paid requests and runtime enablement have not begun.

This audit creates only this repository document. It preserves all pre-existing source, schema, migration, tests, documentation, logs and Git staging. Existing application database state was neither inspected nor changed. All SQL writes used newly owned disposable databases and synthetic records; all signing keys and operator decisions were ephemeral test fixtures. No real verification receipt, application API submission, worker or paid provider was used.

### Audit execution deviation

The initial broad legacy export-test command inadvertently included the real short FFmpeg execution subtest in `tests/video-render/soft-subtitle.test.ts`. That subtest invoked FFmpeg on synthetic six-second scratch fixtures and the full file failed; it is **not** recorded as a passing rendering test. After inspecting the suite, further runs selected only its four pure contract tests. No actual movie, application render job, queue or persisted output was accessed or generated. This was outside the requested no-rendering audit boundary and is recorded explicitly rather than claiming no FFmpeg invocation occurred. The fixture artifacts are outside the repository; no application media was changed.

## A. Source integrity — PASS

Reviewed `contracts.ts`, `source.ts`, `script.ts`, canonical/validation helpers, M1-B readers/preparation/media, persistence services, verification context and the FIX-01 reconstruction helper.

- Selection is the exact project/movie pair. Database ownership and language/source prerequisites are checked; neither persistence nor verification substitutes the newest movie.
- `reconstructStorylineSource` rebuilds Chinese IDs, sequences, exact text and timestamps; scene boundaries; characters/relationships and their permitted evidence; aliases/observations; analysis provenance; advisory recap; and the complete ALL_CURRENT translation context from selected authoritative records and inspected media.
- Admission includes valid aligned APPROVED, UNREVIEWED and NEEDS_REVIEW rows, including MANUAL and QC-warned rows. Missing, stale and invalid rows remain explicit. Excluded rows and their metadata remain frozen in the payload. Approval, manual origin and QC disposition do not establish source truth.
- Exact Unicode, text, revisions, manual/refinement/provider provenance, approval/edit/review timestamps, active/resolved findings and scan state are preserved. Normalization used for existing manual-source binding does not rewrite snapshot text.
- Full canonical payload comparison authenticates frozen content against reconstruction. Only the top-level capture ID/time are excluded from source equivalence. Recomputed payload hashes and copied genuine dependency hashes cannot authenticate changed content.
- Snapshot and script writes recheck source/media after Project → Movie → Studio locks, before publication/allocation. Media checksum/probing stays outside the bounded write transaction; descriptor/path identity is rechecked inside and before completion. Failures roll back writes, counters and pointers.
- Durable proposal, issuance and current lookup use the same reconstruction check. Independently inserted, internally well-formed altered drafts cannot become CURRENT or trusted merely through valid hash shape.
- Original `foundation-postgres-acceptance.test.ts`: **5/5 PASS**, including all three formerly failing assertions. Its assertions were not edited. FIX-01 matrix: **39/39 PASS**, including altered Chinese/translation/QC/evidence, unknown fields, wrong ownership and unchanged genuine context.
- Historical source/script/beat/receipt data remains immutable and independent of replaceable live TranscriptSegment, Scene, Translation and Recap children. Staleness changes eligibility, not historical bytes.

Existing source publishers were inspected: transcription, scenes, translation replacement, human subtitle review, QC and refinement take the Movie lock; character analysis and legacy recap publication take Project → Movie. Storyline services extend that order with Studio. Privileged direct child writes outside the protocol and privileged filesystem tampering are not protected by PostgreSQL row locking. Filesystem freshness is an observation, not an atomic database reservation.

## B. Human verification security — PASS for implemented gates

Reviewed operator authority, human-comparison parsing, attestation, durable ledger/context, database privilege checks, issuer service and review-only role SQL.

| Boundary | Independently verified behavior |
| --- | --- |
| Operator authority | Null authority denies; local labels are not authenticated identities. Exact server-resolved scope/action/decision is required. Private instance-owned proposals/commands, five-minute expiry and single-use consumption reject clones, fabricated grants and replay. |
| Chinese comparison | All applicable rubric checks must support SOURCE_VERIFIED. Insufficient/contradicted comparisons remain inconclusive/unsupported. Invalid Chinese anchors, character/relationship ownership, confidence and structural inference cannot be waived. Subtitle approval, MANUAL origin and AI acceptance confer no authority. |
| Receipt trust | A newly versioned durable envelope binds exact source/context/script/claim/narration, allowed/cited Chinese anchors, translation row hashes, qualification, observed basis, policy/rubric, operator decision and ledger predecessor. JSON shape alone is never trust. |
| Signatures | Independently pinned Ed25519 verifier is mandatory; missing/cloned/mismatched capabilities fail closed. Public-only verification cannot issue. Keys are not loaded from request JSON, receipts or database rows. |
| Database roles | Actual disposable runtime cannot write receipt history, call issuer gateways, disable guards or assume issuer/owner privileges. Issuer has SELECT plus the two fixed append/lock gateways, not direct receipt DML. Catalog checks reject owner/superuser/unsafe membership, column-write grants, unsafe search paths and PUBLIC execution. |
| Ledger/currentness | Bounded complete signed ledger, global sequence/hash head, per-claim predecessor, scope and policy bindings are revalidated. Revocation and supersession remain append-only. Replacing/revoking an observed-basis receipt invalidates dependent inference, even if text/outcome is unchanged. |
| Source freshness | Exact live Chinese/translation/approval/QC/alignment/media and current source/script pointers are rechecked; altered or stale sources cannot authorize current eligibility. |
| Bootstrap | No application route, component or worker instantiates the issuer/operator/signer or duration service. `STORYLINE_VERIFICATION_ISSUANCE_ENABLED` remains false. No environment toggle or default key silently enables issuance. |

The disabled constant describes installation status; it is not a substitute for the actual dependency, authorization, signature and database gates inside an explicitly constructed service. Tests instantiate those services only with synthetic authority and restricted disposable connections.

No new bypass was found in FIX-01/FIX-02. The registry used by duration is module-private; returned lookup JSON is not promoted into authority. The low-level M1-A trusted-callback parser and pure M1-C reference foundation remain usable for pure contract calculations only and are not accepted by the durable bridge.

Trust limits remain deliberate: trusted bootstrap/operator-provider/signing code, migration owner and filesystem administrator are outside the restricted-runtime threat model. SQL cannot itself authenticate Chinese comparison or signatures. An issuer credential able to submit invalid unsigned history can cause lookup to fail closed (availability loss), not make that history trusted. Public multi-user authorization is not implemented or claimed.

## C. Authoritative duration — PASS as observation only

- `createAuthoritativeStorylineDurationService` accepts only a genuine durable-service instance registered with a private read closure. Pure M1-C capabilities, callbacks, copied services, serialized receipts/results and supplied SOURCE_VERIFIED fields are rejected.
- Duration and ordinary lookup share the real signed ledger reader. Computation runs inside its final READ ONLY RepeatableRead transaction after complete authoritative source comparison. Binding includes exact project/movie/Studio/source/script, content/context/script hashes, Studio revision, ledger head, verification dependency, policy/rubric/issuer versions and complete duration policy/input hashes.
- All essential claims and required causal predecessors must currently be durably supported. Provisional/inconclusive, unsupported, revoked, superseded or stale claims contribute no supported event duration. An unapproved current translation can be contextual input without granting verification.
- Exact aliases deduplicate. Shared anchors are surfaced for semantic review, not asserted semantically equivalent. Character arcs require temporally distinct supported states; relationship endpoints and evidence ownership remain strict. Evidence coverage uses interval union; visual coverage is the bounded eligible intersection with the selected media identity, not scene count or human visual approval.
- The legacy `provisionalEvents` count includes all noncontributing distinct candidates. The authoritative explanation additionally partitions supported, provisional and excluded contributions with safe reasons.
- Explicit `auto-story-v1` policy has no installed numeric default and remains UNCALIBRATED. No supported events or no eligible visuals produces no supported budget. Estimated Myanmar voice duration stays null; no English-word estimate, filler, invented clips or automatic audio adjustment is used.
- Returned results are observations only: `persisted: false`, `observationOnly: true`, and script approval/voice/execution authorization all false. Instance-owned views cannot be serialized/cloned or reused by another planner. A recheck performs a new authoritative read.
- **26/26 PostgreSQL tests PASS**, including real concurrent source changes and receipt append/revocation. Changes before the final read snapshot are rejected. A commit after that snapshot can leave an accurate historical observation; its next recheck rejects the changed revision/head. No observation is a future execution lease.

Any future script approval, plan persistence, voice or rendering writer must revalidate source/media, signed ledger, exact revisions/heads and approved policy in its own fenced transaction. M1 does not implement those writers.

## D. Persistence/schema — PASS on disposable PostgreSQL

The five models and four enums in `prisma/schema.prisma` match the review fragment after removing comments/whitespace. The static parity test confirms executable promoted SQL matches the reviewed SQL, except the review's final ROLLBACK becomes COMMIT in the migration.

| Artifact | Integrity contract |
| --- | --- |
| StorylineStudio | One per movie; composite Movie/project ownership; same-Studio current pointers; immutable identity/genesis; guarded revision and next-version allocation. |
| StorySourceSnapshot | Full same-Studio/project/movie FK; unique Studio/context hash; immutable bounded canonical TEXT; media SHA/size/duration and source/context bindings. |
| StoryScriptVersion | Same-Studio exact source/hash FK; unique Studio/version and script hash; adjacent same-Studio parent; immutable canonical payload. |
| StoryBeat | Composite script/Studio FK, per-script beat ID/order uniqueness, valid bounded intervals; deferred complete ordered projection matching script payload. |
| StorySourceVerification | Exact script/source/hash and same-Studio/claim predecessor FKs; unique ledger sequence/hash/root/successor; bounded immutable append-only history and revocation ordering. |

Real SQL guards reject history UPDATE/DELETE/TRUNCATE, malformed/null/nonfinite/out-of-range projections, cross-movie/Studio references, partial scripts, ledger forks and incompatible deletion/reparenting. Concurrent snapshot deduplication, script allocation and optimistic revisions have a single winner without consuming losing versions or partially publishing history. Forced DDL/transaction failures roll back. Intentional opposite lock order produces bounded PostgreSQL deadlock detection; normal service lock order is Project → Movie → Studio.

Migration `20261012120000_add_storyline_m1_foundation` is additive: five tables/four enums, composite Movie index and associated FK/unique/check/trigger guards; no backfill, legacy record rewrite, AI task, voice, clip or render model. The existing Movie primary key prevents duplicate failure for its composite index, but index creation and FK validation still require a reviewed locking/disk window.

Once Studio history exists, Movie deletion/reparenting is RESTRICTed. There is no purge procedure or friendly retention-error integration yet; ordinary Movie flows without a Studio retain their prior behavior. This is an explicit activation/retention gate, not permission to delete immutable history. Forward correction and tested backups are the recovery strategy after real data exists; no destructive down migration is provided.

`docs/drafts/storyline-verification-roles.sql` remains review-only. It was applied only by the synthetic disposable tests. Source presence, successful generation and disposable SQL do not establish the existing application's migration/role state. This workflow did not connect to that database.

### Isolation proof

Each PostgreSQL suite creates its own new 18.6 cluster/database under an owned scratch directory with random dedicated credentials, UTF8, SCRAM and a private mode-0700 Unix socket; no TCP listener. The harness verifies database, role, owner, socket/data directory and server version before SQL. Teardown requires the current process's exact nonce/ownership marker and only removes its own cluster. Process, connection, statement, lock and test timeouts bound failures. The harness does not consume the application DATABASE_URL.

Five service/security suites applied all sorted baseline migrations plus the promoted migration. The lower-level SQL suite separately applied the baseline and review draft transformed in memory only after isolation checks. PostgreSQL versions other than 18.6 and real deployment sizes/permissions are not certified by this run.

## E. Legacy/UI acceptance — PASS for tested synthetic scenarios

- Recap diagnostics and recovery regressions retain strict source/evidence validation and safe structured errors. Generation/retry remains explicit and paid-token-confirmed; refresh/poll/navigation do not submit. Stale confirmations reset; duplicate clicks produce one intercepted POST.
- Saved Recap remains default. Its five tabs, completed Myanmar content, evidence expansion, scene links and existing source-seek wiring remain intact. All five Studio tabs remain honest read-only shells, with selected older movie, query/hash/history and keyboard activation preserved.
- Browser fixtures use actual built CSS and existing components, but synthetic intercepted APIs, not the application server/database. Both flows pass 1440/1024/390 with no horizontal overflow or page errors. Studio navigation issues zero API requests; explicit refresh issues GET only. Recovery's three POSTs are intercepted fixture responses, not enqueued jobs or provider calls.
- Native source-preview identity, duration/metadata lifecycle, timestamp selection and seeking regressions pass using existing tests. No live movie/audio/browser codec certification is claimed by this fixture audit.
- An additional scratch acceptance harness exercised actual existing subtitle services against a newly owned synthetic PostgreSQL database: manual save/TM provenance, Chinese/timestamp preservation, human approval then invalidation on edit, stale-write rejection, pre-provider manual refinement rejection, manual QC retention, production replacement preserving manual rows/TM and SRT/ASS Approved Only timing gaps. **7/7 PASS** including its parent test. It supplied the disposable Prisma instance before importing services and blocked fetch; it never used the application datasource.
- Video export contract/UI tests retain distinct burn-in/soft mode/profile identity, immutable snapshots, explicit POST, read-only GET, safe errors/download links, bounded polling, supported retry/cancel states, older-movie selection and SRT/ASS availability. No live download, queue execution or full rendering acceptance is asserted here.

The shell still reports no persisted Studio artifacts and unavailable generation/review/voice/highlights/output. Backend foundation code exists, but no authorized browser persistence workflow is installed; these unavailable states are intentionally preserved. Some historical documents contain pre-fix or future-tense descriptions; this report records the freshly tested implementation state without changing those artifacts.

## Exact verification results

Node totals below include parent tests where reported. Repeat runs are not added twice.

| Check | Fresh final result |
| --- | --- |
| Original foundation PostgreSQL acceptance | 5/5 PASS |
| Authoritative source PostgreSQL | 39/39 PASS |
| Durable duration PostgreSQL | 26/26 PASS |
| Verification security PostgreSQL | 11/11 PASS |
| Persistence service PostgreSQL | 7/7 PASS |
| Persistence SQL/concurrency PostgreSQL | 20/20 PASS |
| Six required PostgreSQL suites combined | **108/108 PASS**, no skips |
| Ten Storyline contract/preparation/media/human/duration/DTO/boundary/operator/draft/acceptance suites | **251/251 PASS** |
| Recap diagnostics/recovery, source playback/stream, render snapshot/queue contracts | **59/59 PASS**; combined with preceding row **310/310** |
| Storage configuration and source-media validation | 9/9 PASS |
| Additional disposable legacy subtitle service harness | 7/7 PASS |
| Studio/Recap/source-preview/export components | 30/30 PASS |
| Soft subtitle pure contract selection | 4/4 PASS; actual encoding subtest excluded from this rerun by explicit name selection |
| Studio navigation and Recap recovery browsers | 2/2 PASS, both at 1440/1024/390, no skips |
| Scoped checks total | **470 passing tests**, counting parent tests as Node does; not a claim that every repository execution suite was run/passed |
| Prisma validate / generate | PASS, unreachable dummy datasource; ignored generated client only |
| pnpm lint | PASS |
| pnpm exec tsc --noEmit | PASS after the build completed |
| git diff --check / cached diff check | PASS; new document checked separately before completion |
| pnpm exec next build --webpack | PASS outside sandbox, dummy datasource, existing routes compiled |

Initial environment/execution failures are not hidden: disposable PG startup could not run in the sandbox and passed outside it; storage environment-loading subprocess failed with EPERM and passed outside it; sandbox Webpack failed with `Could not parse output from TypeScript's --showConfig` and passed outside it without configuration changes. An initial tsc overlapped build regeneration of `.next/types` and reported missing generated files; its sequential post-build rerun passed. The inadvertent full soft-subtitle suite failure/deviation is recorded above and is not included as passing coverage. No security assertion was weakened or removed.

Reproduction commands (repository root; use an environment capable of owned PostgreSQL sockets and browser subprocesses):

```sh
export DATABASE_URL=postgresql://review:review@127.0.0.1:1/disposable_not_connected
node --conditions=react-server --import tsx --test \
  tests/storyline/foundation-postgres-acceptance.test.ts \
  tests/storyline/authoritative-source-postgres.test.ts \
  tests/storyline/durable-duration-postgres.test.ts \
  tests/storyline/verification-security-postgres.test.ts \
  tests/storyline/persistence-service-postgres.test.ts \
  tests/storyline/persistence-postgres.test.ts
node --conditions=react-server --import tsx --test \
  tests/storyline/contracts.test.ts tests/storyline/preparation.test.ts \
  tests/storyline/media.test.ts tests/storyline/human-verification.test.ts \
  tests/storyline/duration.test.ts tests/storyline/evidence-dto.test.ts \
  tests/storyline/integration-boundary.test.ts tests/storyline/operator-authority.test.ts \
  tests/storyline/persistence-draft.test.ts tests/storyline/foundation-acceptance.test.ts \
  tests/recap/response-diagnostics.test.ts tests/recap/recovery.test.ts \
  tests/source-video/playback.test.ts tests/source-video/stream.test.ts \
  tests/video-render/snapshot.test.ts tests/video-render/queue-contract.test.ts
node --conditions=react-server --import tsx --test \
  tests/storage/config.test.ts tests/video-render/source-media.test.ts
node --conditions=react-server --import tsx \
  --test-name-pattern='strict soft|soft v2|cue representability|supported stream' \
  tests/video-render/soft-subtitle.test.ts
node --import tsx --test tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx \
  tests/video-render/export-ui.test.tsx
pnpm exec prisma validate
pnpm exec prisma generate
pnpm lint
pnpm exec next build --webpack
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
```

To obtain individual Node assertion totals rather than child-file totals, the 16 server suites were additionally imported by a temporary runner outside the repository. Four component suites were likewise imported directly. The additional subtitle service harness is `/tmp/movie-translator-m1fr-legacy.mjs`, also outside the repository; it is ephemeral audit evidence, not a newly committed regression suite.

Browser command used the already installed external Playwright runtime, after Webpack built the real CSS:

```sh
PLAYWRIGHT_MODULE=/home/f330bh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  node --test tests/storyline/ui/navigation-browser.test.mjs tests/recap/recovery-browser.test.mjs
```

Screenshots were inspected at desktop, tablet and mobile widths. Scratch artifact directories: `/tmp/recap-studio-navigation-babcJl` and `/tmp/recap-recovery-browser-JREgVX`. These contain synthetic fixtures only.

## F. Deployment/security gates and M2 prerequisites

| Dimension | Status / required next evidence |
| --- | --- |
| Foundation implementation correctness | **PASS** for the tested M1 scope; no demonstrated remaining code defect. |
| Disposable database acceptance | **PASS**, PostgreSQL 18.6 only, synthetic authority/media/records. |
| Existing application migration readiness | **BLOCKED for execution**. Additive artifact validated; target migration history/schema/drift, backup/restore, PostgreSQL version, index/FK lock budget and retention consequences still require separately authorized inspection and approval. Existing application migration state is UNKNOWN to this workflow. |
| Operator authentication readiness | **BLOCKED**. No real authenticated session/authorization adapter is installed. Local audit labels cannot substitute. |
| Runtime/issuer role deployment | **BLOCKED**. Review-only SQL has disposable proof, not live provisioning. Review full legacy grants, ownership, PUBLIC/schema/function ACLs and actual session/current-user privileges; isolate migration owner, runtime and issuer credentials. |
| Signing custody/rotation | **BLOCKED**. No production key provisioned. Define custody, independent public-key pinning, recovery and historical verification across rotation; current service supports one pinned key identity per instance. |
| Duration policy calibration | **BLOCKED for production claims**. Coefficients remain explicitly uncalibrated, with no application default. Approve calibration corpus/criteria and versioned policy before presenting a production budget. Actual measured TTS duration remains a later dependency. |
| Retention/ledger bounds | **OPEN deployment decision**. Approve Movie retention and controlled deletion-error behavior; retain immutable history/backup/media integrity. Resolve the 2048-entry ceiling before long-lived issuance; never reset/delete history to bypass it. |
| Runtime activation | **BLOCKED / disabled**. No Studio writer/receipt/duration bootstrap, auth flow or UI workflow installed. Activation needs its own task and evidence; schema generation does not enable it. |
| M2 | Planning may begin separately after human M1 review. Implementation requires explicit authorization, approved authenticated/key/role boundaries, future transactional approval/currentness design, bounded durable task/recovery contracts and explicit paid submission/confirmation gates. No M2 task or paid operation is authorized by this report. |

Before deployment, review the complete combined diff; authorize the target and maintenance window; verify backups and actual migration/catalog state read-only; approve migration and roles independently; provision authenticated authority and key management; then verify fail-closed gates with restricted credentials and separately authorized synthetic operator acceptance. Do not manually replay applied migration SQL or reset existing data. Migration deployment, feature activation and paid M2 work are separate decisions.

Remaining limitations are operational and intentional scope boundaries, not hidden implementation acceptance: synthetic semantic comparisons cannot prove human translation accuracy; no real media/TTS/download/provider test was authorized; privileged administrators remain trusted; observations can become historical immediately after their read snapshot; downstream approval/voice/render authorization is deliberately absent. Future consumers must not treat low-level contract helpers, hashes or serialized observations as authority.

## G. Git boundary and staging plan

The initial index contained nine paths with 1003 insertions / 4 deletions, including the earlier E2A subset. It is not independently safe: current persistence imports require FIX-01, tests require the untracked fixture, and security/duration behavior and documents depend on E2B/FIX-02 and their tests. Partially staging the old E2A versions would omit verified protections.

Recommend **one combined M1 persistence/security/integrity/durable-duration acceptance boundary**, containing the 40 observed M1 paths plus this report. An optional later documentation-only commit is safe only after that entire implementation boundary exists. Do not create separate E2A/E2B commits from the current index without deliberately rebuilding and independently retesting those historical intermediate states.

The following exact command is guidance only; it was **not executed**. It includes the reviewed migration as a source artifact and role SQL as a review-only draft; staging does not authorize deploying either. Recheck status/diffs before using it if the tree changes. Exclude `logs/` and unrelated future files; never use blanket `git add .` here.

```sh
git add -- \
  docs/STORYLINE_DURABLE_DURATION.md \
  docs/STORYLINE_M1_ACCEPTANCE.md \
  docs/STORYLINE_M1_FINAL_ACCEPTANCE.md \
  docs/STORYLINE_PERSISTENCE_M1_E2A.md \
  docs/STORYLINE_PERSISTENCE_REVIEW.md \
  docs/STORYLINE_SOURCE_INTEGRITY_FIX.md \
  docs/STORYLINE_VERIFICATION_SECURITY.md \
  docs/drafts/storyline-verification-roles.sql \
  lib/storyline/authoritative-duration-contracts.ts \
  lib/storyline/authoritative-duration-errors.ts \
  lib/storyline/authoritative-duration.ts \
  lib/storyline/authoritative-source.ts \
  lib/storyline/durable-verification.ts \
  lib/storyline/duration-engine.ts \
  lib/storyline/human-verification.ts \
  lib/storyline/operator-authority.ts \
  lib/storyline/persist-script.ts \
  lib/storyline/persist-source.ts \
  lib/storyline/persistence-errors.ts \
  lib/storyline/persistence-locks.ts \
  lib/storyline/prepare-source.ts \
  lib/storyline/read-source.ts \
  lib/storyline/verification-attestation.ts \
  lib/storyline/verification-context.ts \
  lib/storyline/verification-database.ts \
  lib/storyline/verification-errors.ts \
  lib/storyline/verification-issuance.ts \
  lib/storyline/verification-service.ts \
  prisma/schema.prisma \
  prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql \
  tests/storyline/authoritative-source-postgres.test.ts \
  tests/storyline/disposable-postgres.ts \
  tests/storyline/durable-duration-postgres.test.ts \
  tests/storyline/foundation-acceptance.test.ts \
  tests/storyline/foundation-postgres-acceptance.test.ts \
  tests/storyline/operator-authority.test.ts \
  tests/storyline/persistence-draft.test.ts \
  tests/storyline/persistence-postgres.test.ts \
  tests/storyline/persistence-service-postgres.test.ts \
  tests/storyline/persistence.fixture.ts \
  tests/storyline/verification-security-postgres.test.ts
git diff --cached --check
git diff --cached --stat
git status --short
```

The cached binary diff SHA-256 remains `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`. Before/after hashes confirm all 41 pre-existing modified/untracked files captured by the audit safety inventory, including eight log files, are unchanged; staged content is separately covered by the index digest. Only this new acceptance document is added by M1-FR. No staging, commit, push, existing-database migration or activation was performed.
