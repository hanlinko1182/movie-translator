# M5-03 — Private fake audio ownership and replay

## Scope and baseline

Date: 2026-10-18 (Asia/Bangkok). **M5-03 PASS — private in-memory fake artifact ownership/replay only.** All required checks passed. Production authentication, persistence, real TTS, approval and publication remain disabled.

Entry branch `recovery/m9-studio`, HEAD `ce21d62d4401b23b606b6274412c425464a725db`, clean working tree/index. Read AGENTS/CLAUDE, M5-01/M5-02 reports and actual exports, M9 final acceptance, existing M2 owner/generation/checkpoint/acknowledgement/UNKNOWN rules, actual R4 synthetic session/scope authorization and installed Next.js data-security guidance. No existing M5-01/M5-02, M1–M4, R4/M9, UI, schema, dependency or environment contract is changed.

This adds an explicitly constructed **server-only, in-memory, FAKE_ONLY** store and test harness controller. All ownership maps, expected identities, counters, virtual time and audio buffers belong to one factory closure. No module-global store, default registration, endpoint, worker, filesystem, database, media command, provider, approval or spending path exists. An owner capability is test authority only; this is not production authentication or durable storage. Dropping the fixture/process loses all state, and restart cannot recover it.

## Trust boundaries and interface

`createPrivateFakeAudioStoreForTest({maxOwners, maxSubmissions, maxArtifacts, maxAudioBytes})` returns `{control, store}`. The root, controller, store and owner/submission capabilities reject JSON serialization. Real runtime identity is membership in factory-local WeakMaps, not an interface, Boolean, owner ID, UUID, copied object, public receipt or hash. Another factory cannot use this factory's capabilities. No private buffer or map is returned.

The **trusted test controller** is deliberately separate from ordinary artifact operations. It can establish owners and independently capture expected inputs before admission. Tests must retain it outside the untrusted callback/import side; a production route must never construct it or accept setup identities from admission JSON. The controller can also advance the virtual clock and inject private corruption for negative tests; those controls expose no raw storage and are absent from application imports. Possessing the controller is explicit fixture-root authority, not evidence that an application user is authenticated.

```ts
const fixture = createPrivateFakeAudioStoreForTest({
  maxOwners: 8, maxSubmissions: 100, maxArtifacts: 100,
  maxAudioBytes: 1024 * 1024,
});
const owner = fixture.control.createOwner({
  ownerId: "test-owner", scope, generation: 1, expiresAtTick: 100,
});
// Trusted fixture setup, using separately captured expected plan and bytes:
const submission = fixture.control.expect(owner, {
  idempotencyKey: "expected-chunk-0", plan: expectedPlan,
  chunkIndex: 0, receipt: expectedReceipt, bytes: expectedBytes,
});
// A separate callback now supplies candidate bytes/receipt:
const accepted = fixture.store.admit(owner, submission, {
  scope, generation: 1, receipt: callbackReceipt, bytes: callbackBytes,
});
const replay = fixture.store.replay(owner, submission, {
  scope, generation: 1, artifactId: accepted.metadata.artifact.artifactId,
});
```

The controller's `expect` operation validates the **original expected** plan and receipt against actual pre-owned bytes using M5-02, then captures immutable plan/receipt/sample identities without retaining those setup bytes. It binds exact scope, owner/generation/expiry, selected M4 or R4 reference/domain/original lineage, complete source/M3/M2 ancestry, voice/profile/capability, chunk/section/text hash, request/submission/recipe, verification receipt/hash and actual audio hash/measurement. It does not derive expectations from the candidate during `admit`. Unknown fields, wrong scope, unsupported narration, forged receipts or malformed expected bytes fail without creating a reservation.

This is a closed synthetic test composition, not a way to authenticate historical fake execution. M5-02 receipts remain unsigned captured-byte integrity statements; the stronger authority here is the separately owned expectation plus runtime owner/submission capabilities. An attacker replacing bytes and all self-consistent public metadata still cannot change that expectation. A compromised trusted fixture controller or arbitrary malicious same-process code is outside this boundary; it is not a production tenant-security certification.

## Versioned identities and immutable replay

| Domain / schema | Binding |
| --- | --- |
| `story-private-fake-audio-expectation-v1` | Canonical expectation hash: FAKE_ONLY, owner ID/generation/unchanged expiry, full scope, exact plan hash/chunk index, full verified M5-02 receipt and permanent restrictions. |
| `story-private-fake-audio-artifact-v1` | Immutable artifact payload: opaque random UUID-based ID, EPHEMERAL_PROCESS_MEMORY label, owner/generation/expiry/scope, expectation hash, plan hash, full verified receipt/provenance and permanent restrictions. |
| `story-private-fake-audio-ownership-v1` | Canonical ownership hash over the entire artifact payload. It is a consistency hash, not a read capability. |
| `story-private-fake-audio-collection-v1` | Read-only private collection projection: owner/generation/scope, existing verified M5-02 complete collection manifest/hash, canonical artifact IDs and their ownership/expectation hashes. This schema is not a new authority issuer or track format. |

Hashes use the existing domain-separated canonical SHA-256 scheme; prior domains/schemas retain their semantics. Artifact IDs are opaque `fake-private-<UUID>` values, contain no storage locator and grant no rights. An ID collision explicitly rejects before registration instead of overwriting any artifact. Full receipt provenance keeps audio SHA-256 distinct from narration, text, plan and ownership hashes. Existing fake restrictions remain permanent: humanApproval NONE, sourceVerified false, eligibleForRealTts false, eligibleForPublication false, spendingAuthority NONE, syntheticAncestry true.

Admission requires both live owner and exact per-submission capabilities plus matching scope/generation. It copies candidate bytes first, independently validates WAV/sample/hash structure and replays the receipt against the **captured original expected plan**. The complete verified receipt must equal the captured expectation, including byte and sample identity. Only after all validation and capacity checks does a synchronous operation assign one artifact ID, retain copied bytes and immutable metadata and transition PENDING to SUCCESS. Validation/capacity failures leave no artifact or partial byte registration; an already established expectation stays PENDING. Out-of-memory/process failure is not a transactional durability guarantee.

Authorized replay rechecks scope, owner, generation, expiry and exact submission capability, then verifies artifact-ID membership in that submission. It recomputes the captured expectation hash, validates actual private backing WAV bytes and replays the receipt, and reconstructs/checks the full ownership projection/hash. Changed backing bytes or a corrupted expected anchor fail closed. Duplicate admission also replays the stored record; it cannot repair/overwrite corrupted backing storage with a new supplied buffer.

Each ingress and authorized replay returns an independent byte copy. Metadata and full nested receipt/measurement/reference projections are deeply frozen. Mutating original setup buffers, admission buffers or any returned copy cannot mutate private bytes. No operation returns a backing buffer, public path, file URL, storage credential, provider URL or download capability. Earlier returned bytes cannot be recalled after revocation; revocation blocks subsequent store access, not copies already authorized to a test caller.

## Owner, generation, expiry and late results

Owners have a factory-unique bounded ID, fixed scope, positive generation and fixed `expiresAtTick`. A strictly monotone **virtual test clock** starts at tick 0; only the trusted controller advances it. At `tick >= expiresAtTick`, all owner operations fail. This is deterministic fake expiry modeling, not a real-time lease, operational wall-clock guarantee or paid execution permit. Generation rotation never extends expiry.

| Owned submission state | Allowed behavior |
| --- | --- |
| PENDING | Exact validated success may be admitted while owner/generation/expiry remain current. An authorized settle can mark UNKNOWN, DEFINITIVE_FAILURE or CANCELLED. |
| SUCCESS | Exact duplicate callback/admission returns the same immutable artifact after full integrity replay. It cannot change to failure, cancellation or UNKNOWN. |
| UNKNOWN | Unresolved terminal record. Valid/audio-shaped bytes cannot turn it into success; cancellation/failure cannot release or reclassify it. Same proposal/new key returns the same unresolved capability, never a retry permit. |
| DEFINITIVE_FAILURE | Terminal retained result, no artifact and no automatic retry/reset. |
| CANCELLED | Only a pending result can be cancelled. Terminal retained result; late success is rejected. |

`settle` accepts only UNKNOWN/DEFINITIVE_FAILURE/CANCELLED, checks both capabilities and context and returns immutable state/restrictions. Repeating the same terminal outcome is idempotent; changing a terminal outcome rejects. SUCCESS comes only from actual verified admission. `inspect` is separately authorized and does not expose bytes or backing state.

`rotateGeneration(owner)` issues a new owner capability for the next generation; previous owner capabilities and all old submission capabilities immediately fail. Original recipe/key reservations and stored artifacts remain retained. Re-registering the same old recipe/key under the new generation rejects, so rotation cannot be a recovery/refresh shortcut for UNKNOWN, failure, cancellation or old success. A separately captured **different** explicit proposal may be reserved under the new generation. There is no real execution or resend service.

`disposeOwner` revokes that owner before expiry; no new admission, replay, inspect, expectation or rotation is allowed afterward. The ID cannot be recreated, and existing data/reservations still count toward capacity until the fixture is discarded. Expired owners are already unusable and cannot be refreshed/disposed through an expired capability. There is no automatic eviction or renewal. A new owner ID in the same scope cannot steal an existing recipe reservation.

A delayed result may enter only while its original submission remains PENDING and its original owner/generation are live and unexpired. Old-generation, foreign, disposed, expired, cancelled, failed and UNKNOWN callbacks reject without mutating existing artifacts. No adapter reference, provider callback, timer, worker, refreshed send permit, spending grant or M2 transport is imported. The existing M5-01 and M2 UNKNOWN/checkpoint rules remain unchanged.

## Idempotency, concurrency and bounds

Scoped keys are canonical `(scope, idempotencyKey)` slots. Recipe reservations additionally bind exact plan and fake request/submission identity, independent of a refreshed key. Same owner/generation/proposal and exact expected bytes resolve to one submission capability and stable artifact; changed bytes/receipt/plan/profile under an occupied key conflict. Another owner or generation cannot take over an occupied recipe. A new alias key may refer to the existing capability but consumes bounded reservation capacity and cannot alter state.

All operations are synchronous, have no awaits or external callbacks and finish input validation before normal mutation. Concurrent JavaScript promises cannot interleave an admission critical section; duplicate calls return one artifact ID/hash with fresh byte copies. This says nothing about multiple processes, restart, durable crash recovery or exactly-once provider billing.

Hard ceilings: **32 owners, 720 reservation keys/submissions, 720 artifacts, 16 MiB retained audio**, with explicit factory limits that may lower each. Per-artifact bytes still obey M5-02's **4 MiB** WAV bound. Serialized retained unique plan/receipt metadata has a separate **16 MiB** ceiling; counts also bound owner/key bookkeeping and JavaScript object overhead, which is not claimed as exact heap-byte accounting. Identical plans are interned within the factory; source bytes are never deduplicated into shared caller buffers. Capacity checks neither evict unresolved records nor reclaim revoked/expired ownership. Exact duplicate calls remain readable at full capacity when still authorized. All memory is ephemeral and is lost when the fixture/process is discarded.

## Complete private collection replay

`store.replayCollection(owner, {scope, generation, plan, entries: [{submission, artifactId}, ...]})` requires a separately supplied, replay-validated selected plan. It authenticates every per-chunk capability against the same owner/generation and exact plan, fully replays every private artifact, then invokes unchanged M5-02 complete coverage over actual copied bytes and receipts. Missing, duplicate, foreign, failed, UNKNOWN and pending chunks reject. Scope/source/voice/profile/plan cannot be inferred from whichever artifact arrives first.

Valid input may arrive in any order; both M5-02 manifest entries and private artifact references are returned in canonical chunk order. The immutable projection contains no audio bytes. No chunks are concatenated, WAV containers are not appended, and no final track, duration estimate, audio production, persistence or publication is performed. The result remains FAKE_ONLY and speech NOT_VERIFIED.

## Verification and actual results

Logs: `/tmp/movie-translator-m5-03-6dn5nH/`. All packages/runtimes were already installed. Timed server/PostgreSQL suites run serially without competing builds/browser/tests, and unchanged PostgreSQL tests use newly owned disposable clusters only. The application datasource is explicitly unreachable. New voice/ownership tests use no database or external network. No expiry assertion, deadline or production gate is weakened.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/voice-handoff.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec \
  tests/storyline/editor-saving/component.test.tsx tests/storyline/ui/script-preview.test.tsx \
  tests/storyline/ui/navigation.test.tsx tests/recap/recovery-ui.test.tsx \
  tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  pnpm exec next build --webpack
pnpm exec tsc --noEmit
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs tests/storyline/editor-saving/browser.test.mjs
python3 /tmp/movie-translator-m5-03-6dn5nH/audit-production.py
python3 /tmp/movie-translator-m5-03-6dn5nH/audit-owned.py
python3 /tmp/movie-translator-m5-03-6dn5nH/audit-owned.py --staged
git diff --check
git diff --cached --check
```

| Check | Actual completed result |
| --- | --- |
| New M5-03 + unchanged M5-02/M5-01/v1 | **171/171 PASS**: 37 new ownership cases, 62 M5-02, 64 M5-01 and 8 disabled v1; zero failures/skips; final 20.931 s (`focused-complete.log`). |
| R4/M9 security/acceptance/disposable PostgreSQL | **119/119 PASS**, zero failures/skips; 63.549 s (`r4-m9.log`). |
| Applicable server regressions | **842/842 PASS**, zero failures/skips; 330.304 s (`server-regressions.log`). All 16 unchanged expiry controls passed, including the historically failing M1-last pre-expiry send control. No recurrence observed and no timer/assertion changed. |
| Six component suites | **43/43 PASS**, zero failures/skips; 1.245 s (`components.log`). |
| Four Chromium suites | **4/4 PASS**, zero failures/skips; 37.855 s (`chromium.log`). Legacy Recap, six Studio destinations, recovered evidence/local editing and disposable save/read/history at **1440/1024/390 px**. No browser errors, rejected external requests, production API or provider calls. |
| Lint / TypeScript / dummy Webpack | **PASS / PASS / PASS**, each exit 0 (`lint-final.log`, post-build `typescript-complete.log`, `webpack-build.log`). Next.js 16.3.6 completed compilation, types, 12 static pages and traces using the unreachable dummy datasource. |
| Production source/client bundle/action audit | **PASS** (`production-audit.log`): 71 fresh client JS chunks scanned against 39 private/fake/database markers and credential patterns, zero matches; four source roots audited, three Storyline routes retain disabled dependency construction, zero registered Server Actions or production test adapters. |
| Exact files, working/staged whitespace and credential review | **PASS**, eight new owned paths, zero existing modifications/unexpected paths/credential matches/whitespace errors; staged bytes match reviewed files (`prestage-audit.json`, `staged-audit.json`). |

Final non-overlapping case accounting: **37 new M5-03 + 62 M5-02 + 64 M5-01 + 8 disabled v1 + 834 additional server + 119 R4/M9 + 43 component + 4 Chromium = 1,171 distinct reported cases**. Final command totals are 171 + 842 + 119 + 43 + 4 = **1,179 case executions**; the **8 v1 cases** run in both focused and server commands. Earlier standalone/combined runs are additional repeated executions, not additional distinct cases.

Initial standalone store **15/15**, full new ownership **37/37** and an initial combined **171/171** passed. Final review added an explicit pre-registration UUID collision check; the complete 171-case matrix passed again afterward. Initial/final lint and TypeScript before/after build passed. No old source/tests/contracts were changed and no historical test count is treated as current evidence. Negative tests cover scoped owner/submission authority, structural/cross-store capabilities, forged self-consistent bytes/receipt, provenance/domain/profile mismatch, immutable snapshots, corruption injection, concurrent duplicates, capacity rollback, terminal UNKNOWN/failure/cancel, disposal, expiry, obsolete generations, complete unique collection replay and no production bootstrap/runtime dependency path. Network tripwires fail on fetch/http/https/net/tls attempts during store integration tests. Historical expiry scheduling risk remains documented; this run neither reproduced the incident nor established its root cause or operational production safety.

Browser artifacts are retained with the paths reported in `chromium.log`. All verification logs, milestone audit scripts and prior logs remain preserved. Zero M5 external network/provider/paid calls were made; existing regressions used isolated localhost fixtures and newly owned disposable PostgreSQL. No audio artifact file was persisted.

## File inventory and remaining blockers

New files only:

- `lib/storyline/voice/private-artifacts/contracts.ts`
- `lib/storyline/voice/private-artifacts/store.ts`
- `tests/storyline/private-artifacts/fixture.ts`
- `tests/storyline/private-artifacts/store.test.ts`
- `tests/storyline/private-artifacts/lifecycle.test.ts`
- `tests/storyline/private-artifacts/collection.test.ts`
- `tests/storyline/private-artifacts/boundary.test.ts`
- `docs/STORYLINE_M5_03_ARTIFACT_OWNERSHIP.md`

All prior files, staged-work boundaries and logs are preserved. No new audio files, database schema, migration, download route, Server Action, Redis worker, FFmpeg/provider SDK, paid call, human approval, SOURCE_VERIFIED receipt, cloning or original movie audio is introduced. After all checks PASS, stage only these explicit paths and create the requested local commit; report resulting hash and clean/dirty status. Do not push.

Production remains blocked by real authenticated/scoped ownership and key custody; immutable non-synthetic human-approved narration and reconciled evidence; current source/approval verification; reviewed provider/Myanmar capability evidence; explicit spending/budget/checkpoint/send-permit ownership; durable private byte/metadata/receipt lifecycle; operational concurrency/clock/load controls; and separate deployment approval. The historical expiry-control timing incident remains unresolved as an operational risk even when unchanged synthetic tests pass. This in-memory implementation cannot certify or replace any of those gates.

## M5-04 handoff — separately reviewed durable lifecycle design

**M5-04 readiness: READY for separately authorized durable lifecycle design review**, with implementation and production activation still blocked. Define a versioned protocol separating authenticated owner identity, narration approval/source currentness, request/submission generation and byte/receipt identity. Specify private immutable storage targets, byte-hash verification on reads, least-privilege access and independent receipt provenance. Do not let object IDs, paths, client JSON or unsigned public hashes authenticate access.

Design admission prepare/finalize ownership with acknowledged durable transitions, transaction/CAS fences, exact scoped idempotency, immutable conflict rules, staged-object verification and orphan/quarantine handling across any future metadata and blob systems. Define crash/acknowledgement loss and late-result reconciliation before allowing cleanup. UNKNOWN must preserve unresolved identity/budget and cannot be recovered through a fresh owner, generation, key or paid resend. Cancellation and deletion must distinguish pending/unknown/definitive results and preserve audit/tombstone ownership; expiry/revocation cannot imply safe retry or authorize stale publication. Establish explicit real-clock/load/lease behavior and retain all historical expiry assertions.

Require separately authorized disposable infrastructure/fake-only acceptance before any schema/storage deployment, durable outbox, download endpoint, provider, media assembly or paid voice work. Test restart/commit-loss/partial-write/late-result concurrency and corruption with no real provider or spending. No M5-04/M6 work is implemented here. Stop after M5-03.
