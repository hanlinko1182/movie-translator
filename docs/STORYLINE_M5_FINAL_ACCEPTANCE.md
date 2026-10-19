# M5 Voice Foundation — Final Acceptance and M6-01 Highlights Handoff

Date: 2026-10-19<br>
Accepted baseline: `recovery/m9-studio` at `b4a4f3f6b33461bcc882fbed822879146fba6b63` (`feat(storyline): implement disposable fake voice artifact lifecycle`)<br>
Scope: integrated verification of M5-01 through M5-05, with M6-01 implementation guidance. No M6 code or provider was activated.

## Verdict

**M5 voice foundation acceptance: PASS, fake-only and non-production.** M5-01 through M5-05 contracts and lifecycle tests pass alongside the current M1–M4, R4/M9, UI, browser, lint, TypeScript, and production build checks. The acceptance environment used only newly owned disposable PostgreSQL clusters for database tests, private fake artifact storage for lifecycle fixtures, an unreachable dummy `DATABASE_URL` for application/build commands, and local Chromium. The test suite asserts against network/provider calls; browser audits observed zero production API calls from local editing and saving, and zero paid/provider calls.

This PASS does not activate real speech generation, production voice routes, human approval, media rendering, or publication. It establishes a safe synthetic foundation only. M6-01 is ready to begin as a separate, synthetic-only implementation phase with the gates in the handoff below.

## Verification evidence

All commands ran from the repository root. The broad and focused server commands used `DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`; the M5-05 test helper created new private PostgreSQL clusters and private fixture storage itself. No application database was contacted.

| Verification | Result |
| --- | --- |
| M5-05 durable fake lifecycle: `node --conditions=react-server --import tsx --test --test-concurrency=1 tests/storyline/durable-fake/*.test.ts` | **58/58 pass**, 0 fail, 0 skipped. Includes child-process restart/death cuts for lifecycle and GC recovery. |
| M5-01..03 focused: `tests/storyline/private-artifacts/*.test.ts tests/storyline/audio-verification/*.test.ts tests/storyline/voice-foundation/*.test.ts tests/storyline/voice-handoff.test.ts` | **171/171 pass**, 0 fail. |
| R4/M9 focused: `tests/storyline/editor-saving/acceptance.test.ts tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts` | **119/119 pass**, 0 fail. |
| M1–M4, R4/M9 and applicable server regressions: `tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts` | **842/842 pass**, 0 fail, 0 skipped; 451.14 seconds. Includes all current expiry controls. |
| UI component tests: editor-saving, script-preview, navigation, recap, source-video preview and video-render export | **43/43 pass**, 0 fail. |
| Chromium: Recap recovery, Studio navigation, script preview, M9-05 saving flow | **4/4 pass**, 0 fail. Responsive checks ran at 1440, 1024 and 390 px. |
| `pnpm lint` | **PASS**, exit 0. |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0. |
| `git diff --check`; `git diff --cached --check` | **PASS** before documentation change; repeated after staging below. |
| `DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable pnpm exec next build --webpack` | **PASS**, Next.js 16.3.6; compiled, type-checked and generated all 12 static pages. |
| Production bundle/route audit after build | **PASS**: 71 client chunks scanned, zero M5 fake-lifecycle markers; zero voice/audio API routes; zero test-adapter route imports; zero Node or Edge Server Action entries. |

The focused R4/M9 run is fully included in the broad 842-test run. The 171 M5-01..03 total includes 8 `voice-handoff.test.ts` cases that are also in the broad run. Therefore the distinct total across the runs above is **1,110 passing test executions**: 842 + (171 − 8) + 58 + 43 + 4. Focused reruns are reported separately and are not double-counted.

The first sandboxed attempts at the broad database suite and two component fixtures failed before their assertions ran: the environment denied binding the helper’s owned Unix socket and spawning local fixture compiler subprocesses (`Operation not permitted` / `EPERM`). The same unchanged commands then ran with local process/socket execution enabled under the explicit disposable-only boundary and passed. The first sandboxed Webpack attempt likewise failed before compilation while Next could not read the TypeScript `--showConfig` child-process output; its unchanged dummy-datasource rerun passed. These environment retries did not modify or weaken test assertions.

### Expiry-control history

All **16/16** expiry checks passed in the current serial server run. Across M1-first and M1-last interleavings, the suites passed three forced pre-send confirmation-expiry cases per order (zero sends and sticky `UNKNOWN`), three actual-wire-before-expiry cases per order (the original definitive result remained observable after expiry), plus expired confirmation/lease and one-use permit-deadline denial checks.

A prior acceptance run had one failure in the M1-last positive control: an actual wire expected before expiry observed zero sends. The failure did not recur in this run, and the assertions remain intact. Its root cause has not been established; a passing rerun alone is not evidence that the timing risk was repaired. Retain this history in future lifecycle reviews and investigate if it recurs.

## Functional and trust-boundary findings

- The integrated synthetic editor flow passed edit → explicit save → immutable read-back → version history. Browser results showed exact text round trips and no horizontal overflow at all three target widths.
- The original M4 narration draft remained unchanged. Saved R4 narration edits remain separate immutable, provisional artifacts. The UI distinguishes **Saved Version** from **Human Approved**; saving did not approve a script.
- Duplicate requests, concurrent revision conflicts, rollback/error recovery, unauthorized sessions, stale source, and identity isolation were exercised. The browser acceptance audit reported zero errors/rejections, zero production API calls, and zero provider calls during editing.
- M5-05 artifacts are synthetic-only. Audio byte integrity and sample-derived duration can be checked, but every fake artifact remains `speech: NOT_VERIFIED`; it is not a voice performance, finished soundtrack, or publishable audio artifact.
- The M5 lifecycle and identity injection facilities are test-only. The production `app`, `components`, `workers`, and `scripts` source contained no durable-fake/M5 lifecycle adapter markers. The 71 emitted browser chunks contained none of the inspected factory, credential, role, or schema markers. There are no voice/audio API routes and no Server Actions in the build manifest.
- Existing Storyline task routes are unrelated M1–M4 routes. No M5 read/write endpoint or default production save adapter is present. The M9-05 browser save adapter is explicitly injected into the isolated harness and observed no production route traffic.
- No `SOURCE_VERIFIED` receipt, approval, TTS eligibility, publication eligibility, FFmpeg invocation, paid provider request, production worker, or real application database operation occurred.

## Known risks and production blockers

1. **No production voice capability exists.** Do not wire a provider or expose voice endpoints from the fake lifecycle. A later milestone needs a separately reviewed authentication, authorization, spending, retention, and provider boundary.
2. **Human approval is absent.** A saved or synthetic narration version is not approved. Voice eligibility must require an explicit authorized human decision over the exact current narration and source lineage; saving alone cannot satisfy that gate.
3. **Speech is unverified.** Fake WAV bytes prove byte/container integrity and deterministic duration arithmetic only. They prove no pronunciation, language quality, timing fit, or audible Myanmar speech.
4. **Expiry timing history remains unexplained.** Current controls pass, but one earlier M1-last positive control missed its expected wire. Keep the regression and preserve event timing evidence if the symptom returns.
5. **No actual movie clipping/rendering was performed.** M6 planning must not turn metadata or fake silence into finished video or claim original-audio replacement.

## M6-01 implementation-ready handoff: Highlights plan foundation

### Eligibility and immutable inputs

There is **no currently eligible narration artifact for production voice or finished-highlight rendering**. M6-01 may accept synthetic fixtures, including a saved R4 version and a fake M5 artifact, strictly as test dependencies. The fake M5 artifact must remain labeled `FAKE_ONLY`, `SYNTHETIC_BYTE_INTEGRITY_ONLY`, and `speech: NOT_VERIFIED`; never treat its silence as narration, use its duration to stretch footage, or expose it as completed audio.

For any future voice-consuming workflow, eligibility must require all of the following, independently revalidated server-side: authenticated editor identity; exact project/movie/studio scope; current M1 source snapshot and media fingerprint; valid M3 candidate and source bindings; exact immutable M4 draft or R4 edit ID/hash/domain and parent chain; explicit authorized human approval for that exact current version; a current approval policy and revocation check; an authorized provider-neutral request; and a separately authorized idempotent spending grant. A saved edit or synthetic test identity is never approval. No browser role claim may confer authority. M6-01 itself must issue no approval or `SOURCE_VERIFIED` receipt.

### Source-grounded clip candidates

Resolve candidates only from the exact selected M1 `StorySourceSnapshot`, its transcript rows and scene intervals, plus the validated M3 candidate/script claims, events, evidence anchors, and the exact M4/R4 narration-to-claim mapping. Preserve all source/candidate IDs, hashes, and scopes. Reuse source-anchor validation and `fingerprintSourceMedia` identity patterns; do not accept client-authored timestamps or infer evidence from narration alone.

Each clip interval uses integer milliseconds and must satisfy `0 <= startMs < endMs <= media.durationMs`, with both boundaries grounded in the allowed transcript/scene evidence interval or its explicitly documented union. Reject missing, stale, contradictory, cross-movie, or out-of-range anchors. Preserve claim `OBSERVED` versus `INFERRED` classification, inference-basis IDs, cautious Myanmar qualification, confidence, and contradictory evidence references. Inferred claims must never score as observed facts.

### Deterministic scoring and sequencing

Define and persist a versioned, deterministic rubric. Candidate factors should be inspectable: evidence quality and currentness; claim confidence and observed/inferred class; character or relationship change; event order and story coverage; and source visual availability. Publish factor values and reason codes with each score. No opaque model score may alter order or select clips unless a later separately authorized design binds and validates that model output.

Keep canonical source chronology (`sceneSequence`, source `startMs`, `endMs`) distinct from recap presentation order. If a plan chooses a nonchronological story order, retain original source intervals and explicitly mark the presentation order; do not imply that source time was chronological in the recap. Define total duration, per-clip duration, intentional gaps, transition behavior, duplicate-source policy, and coverage targets. Reject overlapping source intervals by default; any future overlap requires an explicit, versioned transition policy. Gaps must be intentional metadata, never fabricated filler. Validate unique clip identity and exact clip-to-claim/evidence mapping.

M6-01 is a pure planning phase. It must not invoke FFmpeg, download media, create playable clips, retain original movie audio, publish a recap, or write user-visible final media. A future renderer must separately authorize its source audio policy; original movie audio is excluded from any future Myanmar voice track unless an explicit reviewed product policy says otherwise.

### Proposed immutable plan identity

Introduce a proposed schema/hash domain such as `story-highlight-plan-v1` (new namespace; do not imply it already exists). Canonicalize and hash the complete plan, binding: exact project/movie/studio scope; current M1 snapshot ID, content/context hashes and media SHA-256; selected M3 candidate/script/claim/event/evidence identities and hashes; exact M4 draft or R4 edit ID/hash domain/hash/parent and currentness revision; versioned scoring rubric and policy; ordered clip intervals and reasons; any M5 chunk/audio manifest identity used only for synthetic tests; and total-duration/coverage/transition policy. Recompute trusted dependencies on read and reject any mismatch or stale revision. Keep immutable plan versions; retries with the same idempotency key and bytes return the same result, while changed bytes or a concurrent currentness/revision change produce an explicit conflict.

### Recommended M6-01 work order and acceptance

1. Add pure strict TypeScript contracts, canonical serialization, hash domain, and parser/validator. Reject unknown fields, duplicate IDs, invalid integers, unbounded text, malformed hashes, and unsupported policy versions.
2. Add dependency-injected source/candidate/currentness resolver with read-only restricted access. Test only against newly owned disposable PostgreSQL or in-memory verified fixtures; no production route activation.
3. Add deterministic candidate selector and explainable rubric. Make invalid/stale evidence fail closed and produce explicit exclusion reasons.
4. Add immutable plan persistence/read/history behind a test-only adapter and restricted grants, with revision fencing, idempotency, rollback, and cross-scope isolation tests. Keep no active production write route.
5. Add synthetic UI presentation only after contracts pass: score rationale, observed/inferred labels, evidence inspection, source time versus recap order, duration, explicit gaps/transition policy, stale/unavailable states, and immutable plan history.

Acceptance tests should cover hash tampering; parent/source/candidate changes; media SHA changes; stale currentness and cross-scope access; source interval bounds including off-by-one values; scene/transcript union membership; duplicate and overlapping clips; intentional gaps and ordering; observed/inferred scoring and missing/contradictory evidence; deterministic repeatability; exact history/read-back; duplicate idempotency and concurrent conflict; rollback; fake silent WAV rejection as voice; and zero network/provider/FFmpeg/audio-retention/approval/publication effects. Browser tests should confirm accessible evidence inspection, clear source-versus-recap ordering, no overflow, and no production API calls. Use fake-only voice dependencies.

## M5 completion assessment

M5-01 through M5-05 are complete as a **synthetic-only voice foundation**: narration/chunk planning references, fake audio byte verification, private fake artifact ownership, durable lifecycle/replay, and disposable PostgreSQL security/lifecycle tests are integrated and current-run green. M5 is not a production voice feature. Provider integration, actual speech verification, human-approved narration eligibility, spending, TTS, media rendering, and publication remain out of scope and blocked pending separate authorization and design.
