# Authoritative durable duration observation — M1-FIX-02

## Boundary and status

This backend-only bridge connects M1-D numerical planning to the actual M1-E2B signed receipt reader and M1-FIX-01 authoritative source reconstruction. It adds no application instance, route, UI, receipt issuer, database migration, worker, provider call or plan persistence. Application issuance remains disabled. Only synthetic tests provision roles/keys and issue receipts on owned disposable PostgreSQL.

**FIX-02: PASS for the tested observation boundary. Complete M1 acceptance remains pending a separate full M1-F rerun and deployment/security review.** M2 is not authorized.

## Trusted path

1. Trusted server bootstrap creates `createDurableStorylineVerificationService` with an actual restricted reader database and independently pinned Ed25519 verifier. A public-only verifier suffices; no signing key or issuer is needed by duration planning. Missing dependencies fail closed. The existing database catalog gate rejects an owner/unsafe runtime role.
2. `createAuthoritativeStorylineDurationService(verificationService, explicitPolicy)` accepts only a genuine durable-service instance registered in a module-private WeakMap. The registry stores a closed read operation, not a caller-supplied callback. No copied service, lookup DTO, JSON status map, AI assertion, pure M1-C foundation or manually edited/approved subtitle can substitute for it.
3. `observe(request)` resolves the exact selected project/movie/Studio/script and requires the exact source snapshot ID, optimistic Studio revision and explicit duration policy hash. There is no newest-movie fallback. These supplied IDs/hashes are selection/precondition inputs, never proof of verification.
4. The existing reader's common private observation path loads immutable source/script/ordered beat projections, inspects private media, then starts a final **READ ONLY RepeatableRead** transaction. Both ordinary `lookup` and duration planning use this same path. It checks the restricted role, complete bounded ledger, independently pinned signatures, global sequence/hash chain, per-claim predecessors, policy/envelope/proposal hashes, Chinese anchors, translation-context hashes, authenticated decisions, supersession/revocation and exact observed-basis receipts. There is no parallel receipt validator or DTO promotion adapter.
5. Inside that same final transaction, M1-FIX-01 reconstructs authoritative Chinese/translations/approval/QC/provenance/scenes/characters/evidence and compares the complete immutable payload. Current Studio pointers, exact snapshot/script and revision must match. Missing/stale media or source causes rejection; a stale context never becomes a supported plan.
6. Only internally derived claim states reach the reused M1-D numerical kernel. Inventory is copied and bounded before awaits; existing event, character arc, relationship, anchor, visual identity and interval validators run against the server-loaded immutable source/script. Media descriptor identity is checked again at the end. Invalid history, ownership, signatures, policies or freshness produces a safe error, not a partial result.

The original `lookup` response shape and issuance/revocation behavior are preserved. `planStoryDuration` still requires the genuine isolated M1-C capability and returns `PROVIDED_IMMUTABLE_CONTEXT_ONLY`. The extracted `calculateUntrustedStoryDuration` is explicitly numerical, always uses that same limited label, and cannot manufacture a registered durable view. It accepts calculation data, not deployment authority. The authoritative service accepts neither its output nor caller-supplied claim states.

## Contract and instance ownership

Strict request fields:

```ts
{
  projectId, movieId, studioId, sourceSnapshotId, scriptVersionId,
  expectedRevision, policyHash,
  inventory: { events, characterArcs, visualIntervals }
}
```

Unknown fields, invalid IDs/hashes/revisions, noncanonical values and oversized requests are rejected. Request cap: 1 MiB; existing inventory cap: 512 KiB; numerical plan cap: 1 MiB; complete observation cap: 2 MiB. Existing individual count/interval limits remain. No source/recap/narration text, provider envelopes, signatures, credentials, storage paths or keys appear in the returned explanation.

Return: `{ view, result }`.

- `view` is an opaque object held in a private WeakMap owned by that duration-service instance. JSON serialization and structured cloning fail. Object spreads, forged brands, another planner's view and copied results fail before database access. There is no public view registration or constructor.
- `result` is a deeply frozen serializable **observation only**. `persisted: false`, `observationOnly: true`, `contextStatus: AUTHORITATIVE_DURABLE_OBSERVATION`, `authorizesScriptApproval: false`, `authorizesVoice: false`, `authorizesExecution: false` are explicit.
- Binding includes exact project/movie/Studio/snapshot/script IDs, source content/context and script hashes, Studio revision, human/binding/receipt/issuer/rubric policy versions, duration engine/policy version and complete policy hash, current ledger head, verification dependency hash and numerical input hash. The observation hash additionally binds the server observation timestamp. These hashes do not authenticate copied JSON.
- `recheck(view, sameRequest)` requires that exact instance-owned reference and request identity, then performs an entirely new real durable lookup and calculation. Changed binding/head/source/script/policy/revision cannot silently reuse the old observation. Rechecks never consult a cached trust/status map. A new policy is a new service instance; an old view cannot cross into it.

Controlled bridge errors: `DURATION_AUTHORITY_INVALID`, `DURATION_INPUT_INVALID`, `DURATION_POLICY_MISMATCH`, `DURATION_REVISION_STALE`, `DURATION_OBSERVATION_STALE`. Existing safe `VERIFICATION_*` errors are retained for unavailable/unsafe readers, source staleness and invalid signed history. No rejected private values are included in errors or logs.

## Computation and explanations

There are no new coefficient defaults. Bootstrap must supply a complete validated `auto-story-v1` policy, which remains `UNCALIBRATED`. Existing formulas, integer arithmetic, exact alias deduplication, causal predecessor rules, semantic duplicate review groups, temporally distinct character arc states and strict relationship endpoints are unchanged.

All essential event claims and causal predecessors need current durable `SOURCE_VERIFIED` support. Observed-basis revocation or supersession makes inferred receipts stale even if their text and original outcome remain unchanged. Chinese transcript stays primary evidence. Subtitle approval, MANUAL provenance and AI acceptance contribute no verification authority.

The original kernel's `counts.provisionalEvents` retains its historical meaning: **all noncontributing distinct candidates**. The authoritative result additionally separates:

- `contributionCounts.supported`: fully durably supported events.
- `provisionalContributions`: pending/inconclusive claims or unverified causal predecessors, with safe reason codes; no duration contribution.
- `excludedContributions`: events with stale/unsupported/revoked/superseded essential claims, with safe reason codes; no duration contribution.

`contributionCounts` partitions all distinct candidates; predecessor failures remain visible on each event. Exact aliases count once; shared anchors remain a semantic-review warning rather than proof of equivalence. Coverage is the union of actual supported source intervals; eligible visual coverage intersects bounded candidate ranges from the verified source. A candidate visual range is **not** an approved highlight or suitability judgment (`suitabilityApproved: false`). No clips, playback, frames or suitability evidence are fabricated. No support or no eligible visuals gives no budget. No filler, English-word TTS estimates or voice permission is introduced.

## Transaction lifetime and concurrent changes

The authoritative calculation is current relative to the **final PostgreSQL read snapshot and checked filesystem descriptor**, not the earlier inspection transaction. Changes committed before the final read snapshot are seen; source changes fail currentness and receipt appends fail the expected revision. Full media hashing/probing stays outside the bounded database transaction; descriptor identity checks bracket the observation.

RepeatableRead intentionally does not lock out later source writers or receipt issuance. An append/revocation may commit after the read snapshot is established but before the result reaches its caller. That result remains an accurate historical observation, with no approval/execution authority. It must not be represented as a reservation or cache-valid authorization. `recheck` opens a fresh read snapshot and rejects changed dependencies. Arbitrary privileged filesystem/database tampering cannot be made transactional by this bridge.

**Future persistence, script approval, TTS or execution must independently revalidate all bound identities, current source/media, exact ledger head, current Studio revision and approved policy inside their own relevant transaction and existing Project → Movie → Studio fencing protocol.** Neither a returned observation, its hash nor a successful earlier recheck is sufficient. This milestone supplies no downstream writer or authorization API.

## Validation evidence

The new `tests/storyline/durable-duration-postgres.test.ts` uses the existing owned private PostgreSQL 18.6 harness, all baseline/additive migrations, synthetic twelve-segment/one-scene data, mixed ALL_CURRENT translations, an older selected movie, authenticated fixture sessions and ephemeral in-memory Ed25519 keys. Reader and issuer are actual separately restricted PostgreSQL logins. Every supported result traverses the real signed durable lookup; trust checks are not mocked. Media identity is a synthetic inspector; no real movie is accessed.

New suite: **26/26 PASS**, including signed support, empty/inconclusive history, M1-C/JSON/callback/DTO forgery, missing keys/unsafe role, wrong scope/snapshot/script, policy/revision mismatch, incorrect pinned key, aliases/coverage, missing visuals, invalid arcs, Chinese/translation/approval/QC staleness, revocation/supersession/inference invalidation, source/receipt races and invalid stored character/relationship ownership. Legacy source/subtitle/QC/Recap records are unchanged after fixture tests.

All six isolated PostgreSQL suites: **108/108 PASS**, including unchanged M1-F, FIX-01 and existing persistence/security/concurrency cases. Additional Storyline contracts/duration/verification, Recap diagnostics/recovery, source streaming, subtitle snapshot and navigation regressions pass. See final check results below.

| Check | Result |
| --- | --- |
| Disposable PostgreSQL suites | 108/108 PASS; new bridge 26, existing suites 82 |
| Server regression suites | 14/14 files PASS: Storyline M1 foundations, Recap diagnostics/recovery, subtitle snapshots and source streaming |
| Recap/Studio component regressions | 2/2 files PASS |
| Studio browser regression | PASS at 1440/1024/390; keyboard/history/older movie/all five legacy tabs; zero requests during navigation, refresh GET only |
| Legacy Recap recovery browser regression | PASS at 1440/1024/390; confirmation, stale failure, double-click and polling transitions; all POST responses synthetic, zero paid calls |
| Prisma validate / generate | PASS with unreachable dummy datasource; no database connection or schema modification |
| Lint / TypeScript / diff check | PASS |
| Webpack production build | PASS outside sandbox with unreachable dummy datasource |

The first sandbox build failed at the existing TypeScript `--showConfig` subprocess boundary; the authorized outside-sandbox rerun compiled and completed. Browser QA was rerun after that successful build supplied its stylesheet assets. No checks weakened configuration or installed dependencies. Existing staged-index SHA-256 is unchanged; logs and unrelated files were preserved.

Run without any application datasource:

```sh
node --conditions=react-server --import tsx --test tests/storyline/durable-duration-postgres.test.ts tests/storyline/persistence-postgres.test.ts tests/storyline/persistence-service-postgres.test.ts tests/storyline/verification-security-postgres.test.ts tests/storyline/foundation-postgres-acceptance.test.ts tests/storyline/authoritative-source-postgres.test.ts
```

The harness refuses nonowned targets, provisions dedicated synthetic credentials privately, and tears down only its own cluster. Sandbox socket restrictions require an authorized outside-sandbox test run. No application migrations or real receipt issuance occur.

## Remaining gates

No runtime bootstrap is installed or enabled. Application schema deployment, restricted-role provisioning, authenticated human operator integration, pinned-key retention/rotation, ledger-limit operations, policy calibration/approval and persisted planning inventory/visual provenance remain separately reviewed deployment decisions. Durable source verification is a human attestation, not automatic semantic truth. Final script/Myanmar review, human script approval and downstream voice/render authorization remain unimplemented. Run a separate complete M1-F acceptance audit before marking M1 accepted or authorizing M2.
