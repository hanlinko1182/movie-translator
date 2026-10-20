# M5-01 — Myanmar pure voice planning and fake-only foundation

## Scope and baseline

Implementation and verification date: 2026-10-18 (Asia/Bangkok). **M5-01 PASS — pure planning and fake-only simulation.** The final source passed focused, server, component, Chromium, lint, TypeScript, dummy-datasource Webpack and production-boundary checks. This is not real TTS or production readiness.

Entry is clean on `recovery/m9-studio`, HEAD `3012cf0a6ed33692a18ac1a606e022f24fda39de`. Read AGENTS/CLAUDE, M9 final acceptance, M5 voice handoff, actual disabled M5 v1 contracts/assessor, M4 narration and R4 immutable contracts/parsers, M2 fake checkpoint/transport ownership, acknowledged-checkpoint/UNKNOWN/no-resend rules, and installed Next.js data-security guidance. No package is added. Existing M5 v1, M1–M4 and M9 files remain unchanged.

This milestone adds server-only pure planning and an explicitly registered in-memory fake simulator. There is no database connection, schema, migration, live API, Server Action, SDK, real speech synthesis, audio storage, media command, Redis worker, human approval, source verification or spending permit. No foundation export is wired into app/components/workers/scripts or existing barrel exports.

## Architecture and public interfaces

All implementation lives in `lib/storyline/voice/foundation/`:

- `contracts.ts`: new versioned reference/plan/capability/request/fake-result/synthetic-artifact types and permanent fake restrictions.
- `reference.ts`: strict bounded JSON capture and reference parsing, M4 canonical draft and R4 canonical edited-payload hash/parent checks. The R4 capture validates its existing wire schema using pure shared DTO/constants only; it avoids the existing parser’s transitive database-bearing scope import. Structural checks never prove stored existence, live freshness or approval.
- `narration-input.ts`: exact canonical M4 or R4 paragraph projection; R4 section IDs/order/paragraph counts must match its original M4 topology. Both converters define the existing whole-section speech separator as two literal newlines between captured paragraphs.
- `capability.ts`: fixed fake provider/voice/profile data, bounded byte limit, strict manifest replay and an empty frozen production registry.
- `chunk-plan.ts`: exact section reconstruction, deterministic paragraph-preferred/grapheme-safe planning and complete replay validation of any supplied plan.
- `fake-adapter.ts`: private WeakMap adapter registration, bounded process-memory request/recipe maps, literal fixture bytes, deterministic metadata/result hashes and sticky terminal outcomes.

Typical isolated composition:

```ts
const capability = syntheticVoiceCapability({
  maxChunkBytes: 90, voiceId: "fixture-neutral",
});
const input = m4NarrationVoiceInput(capturedDraft, {
  id: capturedDurableRowId, draftHash: capturedDraft.draftHash,
});
const planned = planMyanmarVoice({ ...input, capability });
const fake = createSyntheticVoiceAdapterForTest({
  capability, scenario: "FIXTURE_BYTES", // or UNKNOWN / DEFINITIVE_FAILURE
});
const harness = createFakeVoiceHarness({ adapter: fake.adapter, scope: input.reference.scope });
const result = harness.submit({
  schemaVersion: "story-voice-fake-request-v2", execution: "FAKE_ONLY",
  idempotencyKey: "explicit-test-request", plan: planned, chunkIndex: 0,
});
```

For an edited version, use `editedNarrationVoiceInput(canonicalEditedPayload, contentHash, originalDraft, originalReceipt)`. The full canonical R4 payload is required to verify its content hash; the safe UI saved DTO omits the idempotency key and cannot be substituted. No R4 object is cast to an M4 NarrationDraft. The raw planner accepts captured section/reference data for planning experiments; it does not claim that caller-supplied text belongs to a durable artifact. Canonical converters provide the captured-byte linkage. A future production context loader must independently resolve exact approved text/source/identity under restricted access; a plan or parser cannot replace it.

## Versioned identities and hash domains

| Value | Schema/domain and binding |
| --- | --- |
| Reference envelope | `story-voice-narration-reference-v2`; exact Project/Movie/Studio, original durable ID/hash/domain/payload ID/parent draft, full M1 source and full M3/M2 analysis dependencies. |
| Original M4 identity | `kind: M4_ORIGINAL`, durable ID, hash domain `story-narration-draft-v1`; distinct logical payload ID remains in original lineage. Canonical payload hash must match the captured receipt hash. |
| R4 edit identity | `kind: R4_EDITED`, saved ID/content hash/domain `story-edited-narration-v1`, edit version and previous edited ID/hash/domain. Original binding/source/candidate/task/result/submission/profile lineage must match the captured M4 parent. |
| Future approval reference | `kind: FUTURE_APPROVED_REFERENCE`, reserved `story-approved-narration-v1` artifact domain, explicit M4/edited parent and reserved `story-narration-approval-v1` receipt reference/policy/verification dependency. Mandatory `verification: NOT_VERIFIED_BY_PLANNING`; this is an unresolved future reference, not an approved record/issuer or authority. |
| Chunk text | `story-voice-chunk-text-v1` over the exact string through existing canonical UTF-8 JSON; different from the audio byte hash. |
| Section speech text | `story-voice-section-text-v2` over the exact concatenated section speech string. Paragraph/separator topology is separately bound by the complete plan. Existing disabled v1 hash semantics remain unchanged. |
| Chunk plan | `story-voice-chunk-plan-v1`; complete reference, input paragraphs/separators, capability, segmentation policy, sections/chunks/indices/byte lengths/text hashes and null estimate. Returned `planHash` is recomputed, not trusted. |
| Fake capability/profile | `story-voice-synthetic-capability-v1` shape and `story-voice-fake-profile-v1` hash. Entire capability is included in plan/recipe identity; no live verified registry entry exists. |
| Fake request | `story-voice-fake-request-v2`; request hash binds FAKE_ONLY, exact plan hash and selected global chunk index; idempotency key is a separate scoped memory slot. |
| Fake recipe | `story-voice-fake-recipe-v1`; full reference, plan hash, selected chunk and exact synthetic capability. Refreshed request keys cannot make the same recipe execute again on its registered adapter. |
| Synthetic artifact metadata | `story-voice-synthetic-audio-artifact-v2`; full reference/lineage/source/analysis, voice/profile, recipe/plan/request IDs/hashes, fake submission, exact chunk text/index/hash/byte offsets, actual audio byte SHA-256/length and permanent restrictions. |
| Actual audio bytes | Plain SHA-256 over the exact literal fixture bytes. Native and returned hashes match because no conversion occurs. It is not a narration/content/plan hash. |

Reference parsing permits MODEL_CANDIDATE for future planning references without interpreting it as approval. Wrong domains, unknown fields, malformed hashes, scope/source disagreements, impossible initial/previous edit lineage and mismatched canonical parent bindings reject. Hashes only establish consistency of captured data; none proves authentication, database existence, semantic truth, currentness or eligibility.

## Exact Myanmar reconstruction policy

Inputs are ordered sections `{sectionId, order, paragraphs, separators}`. Each separator belongs to the boundary after its corresponding paragraph; there must be exactly `paragraphs.length - 1` separators. The canonical artifact converters choose `\n\n`; direct planning accepts exact bounded space/tab/CR/LF separators, including empty separators, without trimming. Original paragraph text, embedded newlines, combining sequences, names, spaces and punctuation remain byte-exact. No normalization, rewrite, interpolation, translation, omission, padding or truncation occurs.

The planner segments the **entire reconstructed section**, rather than each paragraph independently. This preserves CRLF and combining/conjunct/emoji graphemes even when an empty separator leaves a paragraph edge inside a cluster. It chooses the furthest safe paragraph/separator boundary fitting the byte cap, otherwise the furthest whole grapheme boundary fitting it. It prefers complete paragraphs and can emit separator-only chunks when necessary to retain exact bytes at very small limits. A single grapheme exceeding the cap rejects the complete plan; it is never sliced. This is a Unicode boundary guarantee, not a claim of Myanmar linguistic/pronunciation quality.

Indices include stable global chunk index plus section ID/order, section-local chunk index/count and contiguous UTF-16 offsets into exact section speech text. Every chunk records its actual UTF-8 byte count. Concatenating its ordered chunks exactly reconstructs each section; there is no implicit cross-section separator or invented whole-track assembly policy.

Segmentation uses built-in `Intl.Segmenter("my", {granularity: "grapheme"})`. Unicode and ICU versions are explicit hashed policy fields (verified here with Unicode 17.0 / ICU 78.3). For fixed input and runtime policy, planning is deterministic. A different Unicode/ICU policy changes the plan identity and supplied old-policy plans fail current replay validation; cross-runtime equality is not assumed. A future durable planner needs a reviewed pinned segmentation deployment policy. No dependency is installed.

Limits: 60 sections; 12 paragraphs per section; 1,200 paragraph-text code points per section and 36,000 across the script; 64 characters per whitespace separator; 1–16,384 UTF-8 bytes per chunk; 720 total chunks; 1 MiB captured/serialized planning bounds. An explicit fake manifest chooses the cap inside that ceiling; it is not a real provider support claim. Invalid/sparse/non-JSON inputs, accessors, malformed surrogates, unsupported C0/C1 controls (tab/CR/LF excepted), bidi controls and U+FFFE/U+FFFF reject. Valid joiners remain subject to whole-section grapheme segmentation. Canonical capture removes inherited array methods before any parser map executes. Parsed references, manifests, plans and result metadata are deep-frozen; converter sections are isolated projections. No input buffer is retained or modified.

`validateVoicePlan` recomputes the entire plan and compares all metadata, boundaries, indices, text, byte counts, hashes and policy. Merely recomputing a forged outer hash cannot validate reordered/missing/duplicate chunks or fabricated offsets/duration. `reconstructVoiceSections` accepts only such a validated plan. `estimatedDurationMs` is always null.

## Fake-only adapter and metadata boundary

The capability is fixed to `synthetic-voice`, `fixture-neutral` or `fixture-alternate`, `fixed-bytes-v1`, Myanmar locale, no cloning/original movie audio and `UNVERIFIED_SYNTHETIC_FIXTURE` support. Its declared format is mono PCM16 WAV at 24 kHz. Other provider names, claimed verified support, enabled execution, API keys, arbitrary options/URLs, cloning or modified profile hashes reject. The production registry remains an empty frozen array.

The adapter object must originate from the module-private WeakMap factory. A Boolean, role label, structural type, spread clone or serialized object cannot invoke it. Serialization rejects explicitly. No provider callback can be injected: the only scenarios are fixed fixture bytes, UNKNOWN and a definitive synthetic failure. The factory object is a fake test capability only, and neither returns nor implements M2 or future production spending/send permits. Existing disabled `FutureVoiceAdapter` and M5 v1 assessor are unchanged.

Success returns a **copy** of one 48-byte literal silent WAV fixture, not spoken Myanmar. It does not generate a waveform or call a media tool. The metadata records actual byte hash and count; declared format and header claims are explicitly labeled `formatVerification: UNVERIFIED_FIXTURE`. `measurement` is exactly `{status: UNVERIFIED_FIXTURE, durationMs: null}`. No header-derived duration, script estimate, wall-clock duration, file path, provider URL or fabricated probe result appears. Independently measured metadata requires a later reviewed validator/schema; M5-01 has no function that accepts a claimed measured duration as truth. Native and returned bytes are identical. Any future conversion, measurement provenance/rounding, storage, download or publication needs separate implementation and authorization.

All fake results, including hypothetical future-approval references, retain `humanApproval: NONE`, `sourceVerified: false`, `eligibleForRealTts: false`, `eligibleForPublication: false`, `spendingAuthority: NONE`, `syntheticAncestry: true`. Hashing or copying them cannot promote a synthetic descendant. Frozen metadata/receipts and fresh byte copies prevent caller mutation from poisoning duplicate results.

## Idempotency and UNKNOWN semantics

A harness captures exact scope and requires a genuine registered adapter. Each bounded scoped key records its canonical proposal hash and original result. Identical duplicate requests return the same IDs, hashes, metadata and fixture bytes without another invocation; changed text/source/candidate/voice/plan/chunk in an occupied slot produces a conflict. Wrong scope and mismatched adapter capabilities reject before invocation. Concurrent JavaScript callers cannot interleave an await between reservation and deterministic terminal result because the operation is synchronous.

A second recipe map, owned by the adapter rather than a harness, preserves the same terminal result under new keys or fresh harnesses sharing that registered adapter. UNKNOWN returns no bytes or metadata and cannot be retried automatically or reset through a new key/harness. Definitive failure is also retained; there is no retry/resolution/permit-refresh API. Counters count deterministic local fixture invocations, never provider calls. Request slots are bounded to 256 per adapter; occupied keys remain readable at capacity.

These are **in-memory simulation semantics**, not a durable checkpoint, payment, recovery, cancellation or exactly-once provider-billing guarantee. Creating a wholly independent adapter/process creates independent test memory; it does not recover a prior real submission or authorize anything. A future execution system must retain M2 acknowledged commit, owner/generation, expiry, one-use runtime permit and UNKNOWN/no-resend discipline with separately authorized durable infrastructure. No crash recovery or safe paid retry is inferred from this simulator.

## Verification and actual results

Logs: `/tmp/movie-translator-m5-01-WTvBCZ/`. Commands use the installed runtime and packages; no installation is performed. Existing PostgreSQL regressions use only new owned disposable clusters with the dummy application datasource. New M5-01 tests use no database at all. Timing-sensitive regressions run serially without competing builds/browser/PostgreSQL test processes. Some checks overlap in coverage; their counts below must not be added as distinct tests.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/voice-handoff.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec \
  tests/storyline/voice-foundation/*.test.ts \
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
git diff --check
git diff --cached --check
python3 /tmp/movie-translator-m5-01-WTvBCZ/audit-production.py
```

| Check | Completed result |
| --- | --- |
| Final new M5-01 + unchanged disabled M5 v1 | **72/72 PASS**: 64 new cases and 8 existing v1 cases, zero failures/skips; 2.846 s (`focused-final-r4-origin.log`). |
| Combined M5-01 + unchanged M9-05/R4 matrix | **169/169 PASS**, zero failures/skips; 71.895 s (`focused-regressions.log`). Includes 119 unchanged R4/M9-05 cases and the earlier 50-case M5 matrix. Final new-code changes were rerun in the 72-case matrix above; no R4/M9 code changed. |
| Full applicable M1–M4/disabled M5/legacy server regressions | **842/842 PASS**, zero failures/skips; 400.413 s (`server-regressions.log`). All 16 targeted M4 expiry controls passed, including the historically timing-sensitive M1-last pre-expiry send control. No expiry assertion or timeout changed. The 8 v1 cases also appear here. |
| Six relevant component suites | **43/43 PASS**, zero failures/skips; 1.539 s (`components.log`). |
| Four Chromium suites | **4/4 PASS**, zero failures/skips; 37.362 s (`chromium.log`). Recap recovery, six Studio destinations, recovered R0–R3 and M9-05 disposable save flow checked at **1440/1024/390 px**. No production API/provider calls or rejected external requests. |
| Lint | **PASS**, exit 0 (`lint-complete.log`); no warnings/errors. |
| TypeScript | **PASS**, exit 0 after the final build (`typescript-complete.log`). |
| Dummy-datasource Webpack build | **PASS**, exit 0 (`webpack-build-final.log`), Next.js 16.3.6; all 12 static pages generated. The explicit unreachable `127.0.0.1:1` dummy datasource overrides application configuration. No provider or Storyline adapter was activated. |
| Diff / owned-file / credential review | **PASS**: unstaged/staged whitespace checks, all 12 new owned paths, no existing file modifications, no unexpected files or credential-pattern matches (`prestage-audit.json`, `staged-audit.json`). Staged content reviewed before the local commit. |
| Production source and bundle audit | **PASS** after the final build (`production-audit-final.log`): all 71 client JavaScript chunks scanned against 23 synthetic/private/database markers and credential patterns; zero matches. Three Storyline routes retain disabled dependency construction; zero registered Server Actions or production test adapters. |

Coverage includes exact Myanmar reconstruction and separators; paragraph preference; cross-paragraph conjunct and CRLF boundaries; byte/code-point/chunk limits; segmentation fingerprint; immutable deterministic domain hashes; forged plans even with recomputed hashes; invalid Unicode/controls/getters/array inheritance; original/edit/future identity separation and parent topology; manifest isolation; genuine adapter registration; deterministic actual bytes/metadata/provenance; changed-key payload conflicts; UNKNOWN/failure no-resend; output mutation resistance; cache capacity; no fake-to-production approval/publishing path; and static absence of network, database, provider, media or worker imports/bootstrap. Fake tests install fail-fast fetch/http/https/net/tls tripwires and require zero attempted network calls. Old disabled v1 tests remain intact.

Earlier diagnostics remain: the first sandbox-restricted command reported only two file-level wrappers, not substantive test cases, and is not counted as acceptance evidence. Actual execution with working test subprocesses reproduced **35/35** initial planner/reference cases, followed by the complete **50/50** focused matrix and later **71/71** including additional coverage/v1. Dependency review caught and removed an avoidable transitive Prisma import through the existing R4 parser, without changing R4 itself; a complete runtime-import graph regression guards this boundary. Final review added an explicit current-R4 synthetic-candidate guard and compatibility case: structurally valid MODEL_CANDIDATE planning references cannot be retrofitted into existing synthetic-only edited records. The final **72/72** includes this correction. An initial TypeScript optional Unicode/ICU-version annotation was corrected by narrowing required runtime policy values before constructing the plan. No old tests or deadlines were changed. The earlier expiry failure did not recur in this run; scheduling sensitivity remains a production blocker, and this pass does not establish a durable operational deadline guarantee.

Chromium artifacts are preserved at `/tmp/recap-recovery-browser-Ntnr0d`, `/tmp/storyline-m9-save-browser-Sb95Gu`, `/tmp/recap-studio-navigation-TbUH62` and `/tmp/storyline-m9-recovery-browser-6c5gQn`. Production auditing used the milestone-owned `/tmp/movie-translator-m5-01-WTvBCZ/audit-production.py`; it checks application bootstrap, routes, Server Action manifest and the fresh build rather than relying only on test-source searches.

## Exact file inventory and M5-02 handoff

Created only:

- `lib/storyline/voice/foundation/contracts.ts`
- `lib/storyline/voice/foundation/reference.ts`
- `lib/storyline/voice/foundation/narration-input.ts`
- `lib/storyline/voice/foundation/capability.ts`
- `lib/storyline/voice/foundation/chunk-plan.ts`
- `lib/storyline/voice/foundation/fake-adapter.ts`
- `tests/storyline/voice-foundation/fixture.ts`
- `tests/storyline/voice-foundation/reference.test.ts`
- `tests/storyline/voice-foundation/planner.test.ts`
- `tests/storyline/voice-foundation/fake-adapter.test.ts`
- `tests/storyline/voice-foundation/boundary.test.ts`
- `docs/STORYLINE_M5_01_VOICE_FOUNDATION.md`

No existing source/UI/test/contract/schema/dependency/environment file is modified. No production client code imports the foundation. Staged work was absent at entry, and earlier reports/logs are preserved.

**M5-02 readiness: ready for separately authorized fake-only implementation.** The next scope is stronger fake audio byte/format/measurement validation and explicit versioned metadata/validation receipts. It should test independent sample/container integrity, integer duration units/rounding and byte-hash provenance, invalid/truncated/oversized audio, complete unique chunk coverage and strict private artifact boundary design. It must not trust header claims, add a real provider, synthesize speech, install live schemas or grant publication/approval by inference. Durable task/outbox/storage or media execution requires separate explicit scope and review; it is not implemented or authorized by M5-01.

Real voice remains blocked by genuine immutable non-synthetic approved narration, independently reconciled claim/evidence/source review, real authentication/tenant authorization, verified Myanmar provider/model/voice/style/format support, cost consent/budget reservation, durable checkpoint/permit/result/storage ownership and operational timing/expiry validation. The unresolved historical M4 expiry timing risk remains documented; this milestone neither weakens its controls nor treats successful synthetic tests as production timing certification. Synthetic ancestry remains ineligible regardless of origin labels or approval-shaped JSON. Stop after M5-01; no push or M5-02 implementation.
