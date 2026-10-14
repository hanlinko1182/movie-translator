# Storyline persistence review — Phase 23.2 M1-E1

M1-E2B follow-up: [verification security](STORYLINE_VERIFICATION_SECURITY.md) documents the gated server issuer/lookup, pinned receipt signatures and disposable role tests. Live database deployment and real issuance remain prohibited pending the documented authority/credential/key gates.

**Status: integrated in source, not approved for deployment.** M1-E1.5 tested the draft in disposable PostgreSQL 18.6; M1-E2A has integrated the five models and transactional migration artifact into application source and added server-only snapshot/script services. See [validation](STORYLINE_PERSISTENCE_VALIDATION.md) and [M1-E2A write contract](STORYLINE_PERSISTENCE_M1_E2A.md). No application database was contacted or changed. No API, worker, UI, media, environment or dependency changed. Existing untracked `logs/` is preserved.

## 1. Repository compatibility and reuse

Inspected baseline: `0722883` (`feat(storyline): add evidence-aware auto duration engine`). The application uses Prisma 7, PostgreSQL, `prisma-client` output at `generated/prisma`, and `prisma7.config.ts` for schema, migration and datasource configuration. Keep that configuration. Tables use quoted PascalCase model names, camelCase columns, TEXT identities, INTEGER sequences/timing, VARCHAR(64) hashes and TIMESTAMP(3) dates. Follow these conventions; new Studio IDs use the application's common `cuid()` client default, not a database extension.

Existing migrations include custom scene timing/score checks, ordered character-pair checks, recap evidence-parent checks, immutable render recipe triggers and verified-render-completion guards. Preserve all of them. Existing Movie-first `FOR UPDATE` locking in translation persistence, review, QC and refinement is the starting lock order. The draft uses no new extension or dependency.

Reuse:

- M1-A `contracts.ts`, `canonical.ts`, `source.ts`, `script.ts` and `verification.ts`: exact Unicode serialization, bounded source/script validation, primary Chinese anchors, character/relationship ownership and hashes.
- M1-B `read-source.ts`, `prepare-source.ts`, `media.ts`, `preparation-context.ts` and `evidence-dto.ts`: exact selected project/movie, read-only coherent captures, media SHA/binding/probe and bounded safe projection. Preparation is still a non-persisted candidate.
- M1-C `human-verification-contracts.ts` / `human-verification.ts`: explicit comparison rubric, server authority boundary, single-use decisions, immutable ledger, supersession and basis-dependent currentness. Its WeakMap/WeakSet trust and ephemeral ledger cannot be reconstructed by deserializing JSON.
- M1-D `duration-contracts.ts` / `duration-engine.ts` / `duration.ts`: current verified essential claims, actual interval unions and uncalibrated explicit policy. No duration table is added here.
- Existing translation manual authority, human-only subtitle approval, QC and TM services remain unchanged. Subtitle approval is neither Studio verification nor Studio script approval.

## 2. Review artifacts and assembly

| Artifact | Purpose |
| --- | --- |
| `docs/drafts/storyline-m1-foundation.prisma` | Historical review fragment, now integrated into `prisma/schema.prisma` |
| `docs/drafts/storyline-m1-foundation.sql` | Review-only SQL, still ending in `ROLLBACK`; promoted executable statements match the migration artifact |
| `prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql` | Additive reviewed migration artifact; never applied to the application database by M1-E2A |
| `tests/storyline/persistence-draft.test.ts` | Static draft checks, isolated Prisma validation and existing pure contract round trips |
| `tests/storyline/disposable-postgres.ts`, `persistence-postgres.test.ts` | Private scratch PostgreSQL lifecycle and real DDL, guard, rollback and concurrency tests |

M1-E1 tested an assembled temporary schema. M1-E2A placed the reviewed declarations in the live schema source and created the additive migration artifact, without running it on the application database. The draft test now validates a temporary copy of that live schema through an isolated dummy datasource and checks executable SQL parity. Disposable integration tests alone execute the migration.

The composite Movie index is necessary for an actual FK enforcing selected project/movie ownership. Its leading `id` is already a primary key, so it cannot introduce duplicate-data failures and requires no backfill. It is nevertheless a new index over an existing table, with disk/build/locking cost. Use a short lock timeout and a maintenance window for a small trusted-local database; a separately reviewed concurrent-index deployment would be necessary if that becomes inappropriate.

The older architecture's abbreviated Cascade/UUID/JSON examples are illustrative. This review proposes restrictive retention, TEXT canonical artifacts and repository-style identities instead. These decisions require approval before incorporation into the live schema.

## 3. Models and FK / unique / index matrix

Full field declarations are in the fragment. Only five tables and four new enums are proposed; no task, queue, AI review, approval, audio, clip, timeline or render tables.

| Model | FK / ownership contract | Unique identity | Query indexes |
| --- | --- | --- | --- |
| `StorylineStudio` | `(movieId, projectId) → Movie(id, projectId)`; current pointers use `(artifactId, Studio.id) → artifact(id, studioId)` | PK `id`; one Studio per `movieId`; `(movieId, projectId)` is Prisma's explicit one-to-one composite key; `(id, projectId, movieId)` supports snapshot scope FK | `(projectId, updatedAt)` |
| `StorySourceSnapshot` | `(studioId, projectId, movieId) → Studio` | PK exact prepared `payload.id`; `(studioId, sourceContextHash)` dedup; `(id, studioId)` and `(id, studioId, sourceContentHash, sourceContextHash)` support pointer/script FKs | `(studioId, createdAt)` |
| `StoryScriptVersion` | Studio FK; source FK includes Studio **and both hashes**; parent FK includes Studio **and previous version number** | PK exact payload `id`; `(studioId, version)`; `(studioId, scriptHash)`; composite Studio/parent/full-binding keys for children | `(sourceSnapshotId, studioId)`, `(studioId, createdAt)` |
| `StoryBeat` | `(scriptVersionId, studioId) → script`; immutable complete projection of script payload | Composite PK `(scriptVersionId, beatId)`; `(scriptVersionId, order)` | `(studioId, scriptVersionId)` |
| `StorySourceVerification` | Studio FK; full script/snapshot/context hash FK; previous receipt FK includes Studio and claim ID | PK `verification-<entryHash>`; `(studioId, entryHash)`, `(studioId, sequence)`; unique non-null predecessor; partial unique root `(studioId, claimId)` | `(studioId, claimId, sequence)`, `(scriptVersionId, studioId)` |

All proposed FKs use `RESTRICT` for delete/update. Receipt/beat indexes include the referencing Studio fields; existing unique Studio/movie and source/script binding indexes cover the other common relation lookups. The composite binding keys deliberately carry some index overhead to make cross-Studio or wrong-context associations impossible at the FK layer.

Claim head identity is `(studioId, claimId)`, **across script versions**, matching M1-C's latest-by-claim semantics. A new decision about the same claim supersedes its previous head even when the script changed. Changed claim/narration hashes still invalidate prior verification. Reusing a claim ID for a different statement requires a new comparison; it never inherits support. New unrelated claims should receive new IDs. Beat IDs can recur across versions, hence no global unique beat key.

Script hash uniqueness is exact artifact identity: `story-script-v1` includes ID, version, parent and context. It is **not semantic text deduplication**. A new version with unchanged narration may have a new hash. Do not silently introduce a different hash formula to deduplicate it.

## 4. Exact immutable payloads and historical evidence

`canonicalPayload` is authoritative UTF-8 TEXT, produced by existing `canonicalJson` and stored without trim, Unicode normalization or JSONB round trip. PostgreSQL must use UTF8 server/client encoding. JSON operators in CHECKs inspect safe identity/numeric fields; they do not rewrite the TEXT or extract Chinese/Myanmar text. `StoryBeat.canonicalPayload` is the exact canonical serialization of its corresponding script beat. The deferred projection guard checks exact text equality and complete cardinality at commit.

Snapshot payload is **exactly `StorySourceSnapshot.payload`**, including the mandatory M1-B `preparation` section for durable captures. It preserves:

- Chinese transcript text, historical transcript/segment/scene IDs, sequences and source timing;
- actual source SHA-256, bytes/duration/probe metadata and private source-binding hash;
- character and relationship endpoints, allowed anchors, uncertainty/confidence, exact observations and aliases;
- all captured translation rows, including excluded/missing admission conditions, exact Myanmar text, translation/segment revisions, origin/provider/model/manual/refinement binding, human review state and audit timestamps;
- active/resolved/manual QC findings, resolutions and scan state; legacy recap only as validated advisory context.

Admissions are rederived with the same versioned M1-A validator on read; no second independently editable copy is introduced. Store `sourceContentHash`, `sourceContextHash`, `dependencyHash`, `sourceBindingHash`, SHA, byte count and duration as immutable validated projections. Existing hash domains remain unchanged. Approval/QC/provenance/alignment changes affect context identity even when media and narration are unchanged. Capture time alone does not affect source/context deduplication.

On deduplication, return the already stored snapshot and its original capture timestamp/ID. Do not replace canonical bytes or blindly attach a newly prepared candidate ID to an existing different artifact. Any hash collision or incompatible identity must fail closed after comparing canonical dependency content. Script construction uses the returned persisted snapshot ID and exact hashes before validating/hashing a new script.

Deduplicate under the Studio lock before attempting an INSERT. The draft's BEFORE INSERT hooks increment Studio revision/allocation; `INSERT ... ON CONFLICT DO NOTHING` would invoke them even if no artifact were inserted. Treat a uniqueness conflict as a transaction rollback and scoped reload/revalidation, not as an ignored insert in a partially committed transaction.

Historical child IDs and allowed anchors are plain values **inside the immutable payload**, not FKs to TranscriptSegment, TranslatedSegment, Scene, CharacterEvidence, RelationshipEvidence or Recap children. Reanalysis/retranslation can replace live rows without deleting Studio evidence. Currentness is rechecked separately; historical readability is not permission to generate/approve using stale context.

No storage key, filesystem path, secret, provider response envelope or session credential is added. Private manifests stay server-side. Future clients receive a bounded DTO derived from stored validated content, separately labeled historical/current; the existing prepared DTO must not be relabeled persisted without a new contract.

## 5. SQL guards and validation boundary

The draft adds:

- nonnegative INTEGER revision/sequence/order/timing constraints; positive media duration/size, bounded safe-integer byte count, and valid beat intervals within captured duration;
- fixed style/duration/ALL_CURRENT/language and version identities, finite audit timestamps and bounded decision age;
- byte ceilings: source 16 MiB, script 512 KiB, receipt 32 KiB; 1–60 beats and 0–2047 receipt sequence ceiling matching current M1-C limits;
- lowercase 64-hex hashes and null-safe payload/column identity checks using `IS NOT DISTINCT FROM` / `IS TRUE`;
- immutable UPDATE/DELETE guards on snapshots/scripts/beats/receipts, plus statement-level TRUNCATE guards (including Studio);
- exact complete beat projection deferred checks, parent version adjacency and serialized script/receipt append guards;
- immutable Studio identity/genesis and monotonically incremented revision on every Studio update, plus pointer consistency.

PostgreSQL INTEGER/BIGINT types reject NaN, Infinity and fractional values; timestamps need explicit `isfinite`. The DB does not implement the JavaScript canonical serializer or cryptographically recompute source/claim/script/entry hashes. **Hash format and matching columns do not prove content or human verification.** Services must validate contracts, rederive hashes and compare canonical bytes before any insertion and again during authoritative lookup. Do not use direct generic Prisma `create` of a client/provider receipt as issuance.

SQL projects only a subset of bounded nested shapes. TypeScript remains mandatory for exact allowed fields, all nested lengths, Unicode validity, source bounds, unique claims, Chinese anchor existence/ownership, relationship endpoints, confidence ceilings, observed inference basis, cautious qualification, translation row hashes and semantic comparison outcomes. The DB guards are defense in depth, not a weaker alternate acceptance path. Trigger errors use static messages without content or paths; application SQL logging must not dump bind parameters.

## 6. Durable receipt issuance and append-only semantics

### Trust prerequisite

M1-C entries explicitly say `persisted: false` and rely on instance-owned capability identity. **Do not import them or change that flag.** A future durable issuer needs a new strict `story-persisted-human-verification-v1` hashable content contract and a trusted database adapter. The draft anticipates that format; it does not implement an issuer or accept receipts.

Proposed hashable content follows M1-C's entry fields, omits self-referential `id`/`entryHash` and the ephemeral top-level `persisted` field, changes `schemaVersion` to the durable version, and adds `issuerPolicyVersion: story-server-issuer-v1`. It retains the exact proposal/binding, explicit comparison/rationale, operator audit, reviewed/issued times, predecessor/global ledger hash and observed-basis receipt hashes. The proposal still describes a comparison proposal, not persisted authority. Compute `entryHash = contractHash("story-persisted-human-verification-entry-v1", content)`; row ID is `verification-${entryHash}`. Do not hash using the old ephemeral entry domain.

The binding retains project/movie, exact snapshot/content/context, claim + referencing narration hash, cited and permitted Chinese anchor hashes, exact translation row references/hashes, basis claim hashes and qualification hash. Proposal additionally binds Chinese evidence, translation context, script, rubric/policy and ledger head. All are checked against server-loaded immutable source/script. Source verification requires explicit original Chinese comparison; subtitle APPROVED, MANUAL origin or AI acceptance never creates a grant.

Future flow: server-owned proposal → trusted operator resolution → explicit rubric decision → single-use bounded authorization → fenced currentness recheck → server-derived durable entry → insert → authoritative scoped lookup. No provider/client/general importer can supply the entry, audit timestamp, authority or success outcome directly. Failed/stale transactions must require a fresh authorization; never replay an already consumed capability automatically.

Current deployment is trusted-local. An audit label is not authentication. Schema shape, `issuerPolicyVersion`, database IDs and valid hashes are not authentication either. Before durable issuance, approve a server-only authority adapter and credential/privilege boundary. Proposed roles: migration owner, normal app reader/content writer, and narrowly held verification issuer; normal runtime must have **no INSERT/UPDATE/DELETE/TRUNCATE on verification history**. The issuer alone may append after trusted authorization, cannot update/delete history, and needs the Movie lock / Studio revision privileges required by invoker triggers. No SECURITY DEFINER or client-set session/GUC flag is used as a shortcut. Owner/superuser can bypass guards: do not claim protection against a compromised database owner or public multi-user authorization.

No role/environment change is applied here. `REVOKE ... FROM PUBLIC` in the draft is a baseline, **not sufficient protection for an application using the owner role**. Absence of a reviewed authority/role adapter must keep issuance unavailable.

### Ledger and revocation

- A Studio has one ordered ledger. Genesis is `contractHash("story-verification-ledger-empty-v1", { projectId, movieId })`, computed by trusted server code on Studio creation and immutable thereafter.
- Serialize append under the Studio lock. Sequence is previous global sequence + 1 (initial 0); previous global hash and previous head for that claim must exactly match. Unique sequence/root/successor keys prevent forks. A predecessor FK cannot point to another Studio or claim.
- A new RECEIPT supersedes the previous claim head. Old outcomes are never updated to SUPERSEDED.
- A REVOCATION targets the latest RECEIPT, preserves its script/context/claim binding, appends outcome REVOKED and audit reason; cannot revoke a revocation or arbitrary old superseded entry. Re-verification after revocation is a new RECEIPT after fresh comparison.
- Current status is derived from the latest claim head, exact script/source/context/policy and current observed-basis receipt hashes. Revoked/superseded/stale/inconclusive/unsupported entries cannot authorize duration counting or approval. Reverification of a basis changes its entry hash and stales dependent inferences, even with unchanged basis text.
- The 2048-entry limit is conservative compatibility with the current bounded foundation, **not an approved indefinite retention cap**. Reaching it blocks issuance; never delete history/reset the ledger. Durable paging/limit revision requires explicit policy design before long-lived use.

## 7. Concurrency, transaction fencing and currentness

### Lock order

1. Exact selected `Movie` row `FOR UPDATE` (project relation rechecked).
2. Its `StorylineStudio` row `FOR UPDATE`.
3. Immutable source/script reads and prior verification heads; writes in deterministic key/order.
4. Complete artifact/beat inserts, pointer changes and commit.

Use Movie-first order even for pointer-only operations, matching existing translation writes. BEFORE INSERT helpers enforce Movie → Studio for snapshot/script/receipt writes. A service must acquire those locks **before any direct Studio UPDATE**, since PostgreSQL takes the target row lock before a row-update trigger could reverse that order. Never lock Studio then Movie. Bulk operations, if later authorized, sort Movie IDs first; no multi-movie operation is needed in M1-E2.

### Snapshot commit

Hash/probe/read media outside write transactions using M1-B bounded capture. In a short explicit transaction, lock Movie then Studio, compare expected revision and re-read exact dependency values/IDs to the prepared dependency hash. Recheck source file descriptor identity/metadata and stored binding; changed media/dependencies fail closed. Do not hash a whole movie while holding database locks. File changes are not transactional: the controlled private storage write contract and repeated file identity/hash checks remain necessary, with full source checksum verification before future rendering. A DB row lock alone cannot freeze a file.

Existing translation/manual/QC/refinement writes cooperate on Movie locks. Audit **all** transcript/scene/character/legacy-recap publication paths in M1-E2; do not assume all writers currently use this lock. Until every relevant publication is fenced, require Serializable validation reads with bounded serialization failure handling, or block persistence rather than claiming race-free freshness. A read-only preparation recheck is not a commit reservation. No legacy worker behavior is changed in this review.

### Script allocation and optimistic revisions

After both locks, compare caller's expected Studio revision. Allocate `nextScriptVersion`, parent = immediately previous version (null for version 1), and a server-generated payload ID. Validate/canonicalize/hash using that exact allocated identity. BEFORE INSERT verifies the expected next number and increments allocation and Studio revision transactionally. Insert **all** beats in the same transaction; the deferred guard prevents a partial version from committing. If a transaction fails, allocation and all rows roll back. Never use an unlocked `max(version) + 1` or consume an external sequence for version numbers.

Pointer updates require `WHERE id = ? AND revision = ?` after locking (zero matched → stale conflict). The DB owns revision increments; snapshot insert, script allocation, verification append and pointer changes may increment it multiple times in one transaction. Return the actual final revision; never promise exactly +1 per user operation. Runtime must not directly modify `nextScriptVersion`, identity, genesis or revision outside guarded services. INTEGER overflow fails safely; never wrap/reset.

Studio current source/script pointers are selected artifacts, **not proof of current source or approval**. A script pointer must refer to the pointed source in the same Studio. Capturing a new source clears the old current-script pointer or atomically selects a script bound to the new source; historical scripts remain readable. A new version always points to the immediately preceding version; branching is deliberately out of M1 scope.

### Approval dependencies

Recompute currentness using media SHA/binding, exact transcript/scenes/character evidence and ALL_CURRENT context. Translation text (including refinement without revision change), approval, edit/provenance, QC scan/findings/resolution or alignment changes invalidate affected source/context/receipt eligibility. Do not rewrite historical artifacts or automatically mark subtitles approved. Relevant script edits/narration and observed-basis receipt changes invalidate verification; policy changes invalidate policy-bound receipts/plans.

Future `approvalDependencyHash` must bind exact script + source/context + latest claim/basis receipt heads + review/disposition + policy identities. No approval table/flag is added in this migration; even a fully SOURCE_VERIFIED script remains unapproved until later narrative review and explicit script approval. Voice eligibility stays false. M1-D plans remain pure immutable results and are not persisted by these five tables; calibrated coefficients and plan persistence are later decisions.

## 8. Movie deletion, retention and compatibility impact

Existing Movie children often Cascade and evidence may depend on replaceable transcript rows. Studio history is deliberately independent of those children and uses `RESTRICT` at the Movie boundary. After a Studio exists, Movie deletion is blocked; changing its project identity is blocked. Project deletion already has required Movie dependencies and cannot bypass this protection. Movies/projects with **no** Studio retain existing behavior. No existing row is attached/backfilled in this migration.

There is no erase/purge feature in M1-E1/E2. The application must eventually translate the restriction into a controlled retention error instead of a generic server failure. Retaining DB history does not retain an external source file automatically; source disappearance must be reported, not silently recreated or accepted as current. Operator retention policy must cover private media, backups and personal source content. An explicitly approved future erasure procedure must handle dependency order, audit/export and privilege/trigger changes; ordinary clients cannot disable guards.

## 9. Disposable PostgreSQL dry-run and recovery plan

**M1-E1.5 execution:** the disposable PostgreSQL 18.6 run completed for the migration, representative constraints, immutability, ledger ordering, concurrency and rollback. Exact results and the untested gates are in [STORYLINE_PERSISTENCE_VALIDATION.md](STORYLINE_PERSISTENCE_VALIDATION.md). Pure Prisma validation alone would not prove SQL syntax, deferred trigger timing or lock behavior. Before approving a live migration:

1. **Done locally:** provision an independently disposable PostgreSQL 18.6 instance with UTF8 encoding, an isolated owner/runner role and scratch directory. Verify connection target identity from controlled configuration without printing credentials. Do not use development/production `DATABASE_URL` or media. No paid workers.
2. **Done for the committed baseline:** apply existing committed migrations to the empty disposable database; add synthetic project/movie and pure prepared Storyline fixtures only. No real source copy or application record was used. Other legacy fixture coverage remains future regression work.
3. **Done on disposable target:** inject a DDL failure and verify the whole transaction rolls back; then transform only the final `ROLLBACK` to `COMMIT` in memory after target identity verification, to run multi-connection tests. The review-only file still ends in `ROLLBACK` and is outside live migrations.
4. Verify Prisma-vs-SQL parity (column types/defaults, constraint/index names and relations). SQL-only checks, partial index and triggers must remain in hand-reviewed migration SQL; Prisma cannot express them. Confirm ordinary generated diffs do not remove them. Validate all PL/pgSQL paths, not merely function creation.
5. Insert synthetic prepared M1-B source and script/beat artifacts. Test exact Chinese/Myanmar round trips, whitespace/escape preservation (including JSON escaped U+0000 behavior), UTF8 limits, invalid/missing binding fields, cross-project/movie/Studio/hash parents, invalid/fractional/negative/out-of-range bounds, absent/extra/reordered beats and attempted history UPDATE/DELETE/TRUNCATE. All invalid paths must roll back without partial rows/counters.
6. Two connections: competing Studio creation, duplicate snapshot insert, same expected Studio revision, concurrent script version allocation, competing same-claim root/successor and different-claim global ledger appends, stale head and revocation races. Check bounded lock timeouts/deadlock/serialization handling; failed attempts do not consume versions or mutate the other transaction's history. Test relevant source publication racing capture. **Representative races passed; the full list remains a deployment gate.** A synthetic source writer changed the Movie storage binding while a snapshot insert waited: the insert then succeeded. SQL serialization does not establish source currentness; M1-E2 must re-read dependencies and media binding under the Movie lock and fail closed.
7. Test authority role grants: normal runtime/provider-shaped inserts rejected; only trusted issuer path appends; no owner credentials in runtime; no update/delete/truncate privileges; permitted label is not authentication. Check malformed/forged content is rejected by service even when SQL shape passes. Test rollback after receipt append before pointer completion. **Not yet satisfied:** the isolated owner can insert a forged receipt hash with internally matching projected fields. This is the intended SQL trust limit, and durable issuance must stay disabled until a server issuer and restricted runtime roles are implemented and tested.
8. Replace synthetic live Scene/Transcript/Recap children; historical artifacts remain readable and current eligibility becomes stale. Try Movie delete/reparent with/without Studio; retain existing output/translation semantics. Verify existing render immutability/completion and recap constraints still work.
9. Record timings, table/index size and lock observations, review results and explicit approval. Only then copy a finalized migration into `prisma/migrations`, update live declarations and generate the client in the separately authorized milestone. Applying to an existing database requires its own explicit approval and backup/recovery plan.

DDL is transaction-wrapped with short timeouts. A draft failure or its final ROLLBACK leaves no new objects. A future deployment transaction failure rolls back additive DDL/index changes; do not mark a failed migration applied without inspecting PostgreSQL and migration history. After successful deployment with real Studio data, prefer a forward correction and disable only new persistence entry points if needed; do not drop history to roll application code back. Restoring from backup requires a separate reviewed operation, with any newer media/DB consistency assessed. No destructive down migration is supplied.

## 10. Approval checklist and M1-E2 prerequisites

- [ ] Approve all five models, same-Studio/full-binding FKs and the additive Movie composite index.
- [ ] Approve restrictive Movie retention/reparent behavior and controlled deletion error handling.
- [ ] Approve exact canonical TEXT authority, mandatory M1-B preparation and deferred beat projection; complete PostgreSQL escape/Unicode round-trip tests.
- [ ] Approve linear per-Studio version allocation and global bounded receipt ledger; resolve whether the 2048-entry limit needs a versioned expansion before durable issuance.
- [ ] Specify and test the new durable receipt content/version, authoritative reload/issuance adapter and trusted-local operator/role boundary. Do not make M1-C receipt JSON trusted by import.
- [ ] Audit cooperating source publication locks and define the Serializable/fail-closed fallback, lock timeouts and bounded retry policy.
- [ ] Pass the remaining disposable PostgreSQL parity, role-privilege and full concurrency/rollback matrix; M1-E1.5 passed representative real-database tests but not the entire deployment gate.
- [x] Authorize promotion into the live Prisma schema/migration directory for M1-E2A source integration only.
- [ ] Explicitly authorize the target and timing of any migration application to an existing database; M1-E2A prohibits that action.

M1-E2A completed source integration, disposable migration validation and server-only snapshot/script writes. M1-E2B now implements the gated issuer/lookup, role proposal and disposable security/currentness tests. Enabling issuance still requires an installed authenticated operator source, restricted live credentials, trusted signing-key management and separate deployment authorization. No APIs, paid generation, UI integration, voice or queues are implied by the schema integration.

## 11. Verification boundary

The draft tests check structure, validate the live proposal with an isolated dummy Prisma config, and prove canonical source/script round trips plus approval/QC/text/alignment staleness with synthetic fixtures. The M1-E1.5 disposable suite executes the committed baseline and review SQL on PostgreSQL 18.6; the M1-E2A suite applies the promoted migration artifact and tests real Prisma services, locks and rollback on another disposable cluster. Existing Storyline contract, preparation, verification and duration tests remain semantic regressions. Run lint, TypeScript and `git diff --check` separately. Treat the privilege/retention and M1-E2B issuance cases as open gates.
