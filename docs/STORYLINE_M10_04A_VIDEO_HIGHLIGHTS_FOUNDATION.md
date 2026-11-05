# M10-04A — Offline video highlights planning foundation

Date: **2026-11-06, Asia/Bangkok**. **Executable offline synthetic planning: PASS.**

Working server-only TypeScript now issues synthetic source descriptors, validates bounded exact-rational selections, derives immutable deterministic highlight plans/timeline previews and compares planned duration with locally measured narration duration. **This is not real video verification, clip extraction, synchronization, rendering or production acceptance.**

## 1. Baseline and actual source audit

Entry branch `main`; exact HEAD `a4334d83a661b2407c73b561a979d2b14003ba01`. Initial index, tracked worktree and nonignored untracked inventory were clean. Upstream `origin/main` was inspected without fetching. Accepted ancestry includes M10-03A `2a55f98512e361ecbb1a64a102b55738c15a155f` and its prior listening addendum.

Read AGENTS.md, CLAUDE.md, installed Next.js testing guidance and [M10-03B's report](STORYLINE_M10_03B_PRIVATE_NARRATION_ARTIFACTS.md). Inspected actual M6 Highlights contracts/exports/tests, M7 Timeline contracts/exports/tests, M8 render-planning/fake-execution restrictions, M10-03A candidate/measurement/preview contracts and M10-03B ownership/storage boundaries.

[M6](STORYLINE_M6_FINAL_ACCEPTANCE.md) and [M7](STORYLINE_M7_FINAL_ACCEPTANCE.md) remain synthetic foundations with integer-millisecond source/presentation intervals. M8 recipes/fake receipts are non-executable/non-media and do not supply rights or actual video measurements. No M6/M7/M8 runtime/persistence/approval authority is imported by this new module. The generic canonical hashing and validation/freezing helpers are reused; a separate rational contract avoids silently changing earlier millisecond/hash domains.

**723 tracked baseline files were hashed: 721 unchanged, two narrowly adapted intake test/audit files.** All existing runtime modules, M10-03A/B public contracts, M6/M7/M8 domains, provider configuration, application routes/UI/workers and M4 timing controls remain byte-for-byte unchanged.

## 2. Implemented modules and exports

Entry: [video-highlights-offline/index.ts](../lib/storyline/video-highlights-offline/index.ts). Every new module is server-only.

| Module | Actual responsibility |
| --- | --- |
| `contracts.ts` | Versioned schemas, immutable preview restrictions, closed label vocabulary, limits, safe errors and bounded strict record capture. |
| `rational.ts` | Canonical rational input validation, exact BigInt comparison/addition/subtraction and bounded reduced outputs. |
| `source.ts` | Explicit synthetic catalog, immutable source-version conflict detection, metadata hashes and process-local descriptor membership. |
| `planner.ts` | Exact interval validation, chronological/overlap policy, contiguous preview placement, deterministic plan hashing, original-descriptor replay and strict expected identity/duration comparison. |
| `compatibility.ts` | Pure duration comparison against an original M10-03A narration candidate; only pure intake submodules imported. |
| `index.ts` | Named functions/constants/types; no default catalog, dispatcher, storage or production composition. |

Public runtime exports: `OFFLINE_VIDEO`, `restrictions`, `intervalPolicy`, `safeLabels`, `OfflineVideoError`, `createSyntheticVideoCatalog`, `buildOfflineHighlightPlan`, `validateOfflineHighlightPlan`, `buildOfflineVideoTimelinePreview`, `assessNarrationCompatibility`. Types include exact seconds, source binding/metadata/descriptor, segment/payload and opaque plan.

New versioned domains: `story-offline-video-source-v1`, `story-offline-video-selection-v1`, `story-offline-video-highlight-plan-v1`, `story-offline-video-timeline-preview-v1`, `story-offline-video-narration-compatibility-v1`. Source and plan hashes use the corresponding domain plus newline and existing canonical JSON SHA-256 convention. No existing domain is modified.

## 3. Synthetic source identity and rights

Catalog registration accepts exactly schema version, opaque source ID, integer version, `origin:SYNTHETIC_METADATA_ONLY`, declared rational duration, `timebase:null` and whitelisted rights claim. Source IDs are `vs-` plus 32 lowercase hex characters; versions range 1–1,000,000. At most 16 source/version descriptors exist per explicitly created catalog.

A descriptor contains frozen metadata plus its metadata hash. Metadata distinguishes:

- Duration: **SYNTHETIC_DECLARED_NOT_MEASURED**, positive and at most 86,400 seconds.
- Timebase: **null / NOT_ESTABLISHED**; no invented frame rate, frame count, frame boundaries or real timestamp precision.
- Rights claim: **NONE** or **OWNER_REPORTED_PERMISSION**; rights review always **PENDING_NOT_VERIFIED**.
- Evidence: **SYNTHETIC_METADATA_ONLY**.
- Pending blockers: rights verification, source possession, video-byte integrity, independent probe, hostile-media sandbox and extraction authorization.
- Processing eligibility: **BLOCKED**.

No filename, path, media-byte hash, account identifier, transcript, URL, rights receipt or caller-submitted approval is accepted. The metadata hash identifies this exact declared descriptor/version; it is **not** a video fingerprint, media possession proof, independent rights evidence or authorization.

Only this explicit catalog can issue process-local descriptor membership. Identical ID/version/metadata returns the original descriptor; changed metadata for the same ID/version conflicts, with no overwrite. A new version gets a different metadata hash. Original descriptor identity is retained for plan validation; a clone or independently issued same-looking descriptor cannot substitute for it.

Only synthetic origins are supported. Owner-reported real-movie or allegedly verified real-source variants are rejected. Even an owner-permission claim in the synthetic fixture leaves all rights/possession/integrity gates pending. No real source is approved for extraction through this catalog. Independently established timebases and real measured duration need a separately reviewed future source-verification protocol; there is no probe here.

## 4. Exact interval policy and planning

Selection schema has exactly `schemaVersion`, complete source binding (ID/version/metadata hash), `overlap:REJECT` and segment array. Each segment has exactly opaque ID, zero-based contiguous order, start, end and nullable descriptive label. Source binding is compared in full; unexpected fields are not discarded.

Intervals use **[start,end)**, with start ≥ 0, end > start and end ≤ the explicitly synthetic declared duration. Requests must already be in source chronology with order 0..N−1. No sorting, repair or silent overlap trimming occurs. Duplicate IDs, conflicting order, source substitution, nested/partial/identical overlaps are rejected. Touching intervals are legal. Output preview positions are exact contiguous prefix sums; gaps in source remain omissions, without invented filler.

Limits: **128 KiB** captured JSON envelope, **1–64 segments**, **600 seconds** maximum aggregate duration, **1,000,000,000** maximum input numerator/denominator. All terms must be safe integers; denominators positive; negative zero, floating-point values, NaN/Infinity, negative timestamps and unsafe terms are denied.

Input fractions must already be reduced, including canonical zero **0/1**. Unreduced input is rejected, not silently normalized. Arithmetic uses BigInt cross-products and gcd reduction, then converts only reduced terms within Number.MAX_SAFE_INTEGER. Valid intermediates may exceed safe-number multiplication range without losing precision. Unrepresentable reduced output/intermediate terms fail **RATIONAL_OVERFLOW**; nothing is rounded. Expected computed duration permits canonical terms up to the safe-number bound, so legitimate results larger than the input-term cap can still be checked exactly.

Labels are nullable or one of six reviewed generic labels (including two Myanmar labels). Free descriptions, transcripts, filenames, URLs and private identifiers are not admitted as labels. This deliberate closed vocabulary prevents arbitrary private text from entering public preview metadata.

The plan contains exact source binding/duration evidence, fixed policy/restrictions, ordered segment IDs/times/durations/output positions, total duration, immutable hash and `vhl-<hash>` plan ID. Plan hashes are deterministic for the same declared source/version/selections. Plans are metadata, not media artifacts.

Private WeakMaps track original descriptor/plan membership. Validation replays the original frozen selection against the original descriptor, checks canonical plan/hash/ID and compares the expected ID/hash/duration without repairing mismatches. Serialized, mutated, rehashed or copied trust-bearing objects cannot be adopted. Catalog/plan issuance maintains only process-local integrity bookkeeping; arithmetic/projection/compatibility perform no external I/O or persistent business-state mutation. There is no durable source-currentness head, cross-process capability restore or production authentication claim.

## 5. Example and narration compatibility

The newly instantiated synthetic example declares 120 seconds, selecting **[10,18), [35,47), [80,92)**. Individual durations are **8, 12, 12** seconds; total **32/1 seconds**. Output preview intervals are **[0,8), [8,20), [20,32)**. Fractional cases preserve values such as **1/3 + 1/2 = 5/6 seconds** without converting to milliseconds or assuming frame alignment.

Video preview status is **PREVIEW_ONLY**, with **MATHEMATICAL_ONLY_NOT_FRAME_VERIFIED** timestamp precision. A real frame/timebase is not inferred from rational timestamps.

Compatibility accepts only an original plan capability and original M10-03A `NarrationCandidate`, or explicit null for missing narration. It calls the unchanged pure `narration-intake/preview` implementation, which verifies candidate identity before returning measured duration. It does **not** import the intake barrel (which contains file access), private store, owner/seal keys or privileged source handles.

Output reports both exact rational durations, video evidence **SYNTHETIC_DECLARED_NOT_MEASURED**, narration evidence **LOCAL_AUDIO_INTEGRITY_VERIFIED**, signed **video minus narration** difference, and **VIDEO_SHORTER / EQUAL / VIDEO_LONGER**. Missing narration yields null duration/difference, UNKNOWN relation and an explicit missing measured-candidate blocker. Copied candidate/preview/manifest metadata, claimed durations, listening feedback and M8 fake receipts fail instead of supplying trusted measurement.

For the 32-second plan, measured synthetic narration of 31/32/33 seconds yields differences +1/0/−1 respectively. A 101-frame / 24,000-Hz narration remains **101/24000**, with difference **767899/24000 seconds**. Equal duration does not establish synchronization: exact script binding, qualified independent listening, verified real video and a separately approved synchronization policy remain required. No stretching, speed change, padding, truncation, automatic dispatch or integer-millisecond conversion is performed. No M7 persistent timeline changes.

## 6. Security findings and negative cases

Permanent output restrictions: PREVIEW_ONLY, processing BLOCKED, sourceRightsVerified/sourceVerified false, possession NOT_ESTABLISHED, videoIntegrity NOT_VERIFIED, hostileMediaSandbox NOT_ESTABLISHED, clipsExtracted/narrationSyncVerified/rendered false, humanApproval NONE, spendingAuthority NONE, liveEligible/productionEligible/publicationEligibility false.

Fresh negative tests cover zero/negative/reverse/out-of-range intervals; noncanonical/fractional/unsafe terms; BigInt overflow; bad order/overlap/duplicate IDs; envelope/segment/source-version/aggregate bounds; cross-source/hash/version substitution; forged rights/real-source/timebase claims; mutated/copy/rehashed descriptor/plan/expected identity; missing/fake narration evidence; unexpected keys/getters/symbols/cycles; private label/path/log disclosure; M8 receipt/private artifact promotion; and production/network/media/private-file isolation.

No private-file read, video access, source download, decoder/encoder/probe, TTS/account/provider credential request, database, queue, worker or media output port exists in the 12-file transitive runtime graph. Runtime package allowlist is only server-only and Node crypto; local imports are restricted to the new modules plus existing pure canonical/validation/intake submodules.

Two existing intake isolation checks now allow **one additional exact path**, `lib/storyline/video-highlights-offline/compatibility.ts`. Existing three private-store exceptions remain exact. No directory-wide or production/bundle exception was added. The new recursive AST audit verifies that this new consumer has no filesystem/private-store/M6/M7 persistence/M8/provider/media edge. All other earlier prohibitions and assertions remain.

## 7. Actual fresh verification

Tests run serially with `node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 <explicit files>`.

| Final check | Actual result |
| --- | --- |
| New `video-highlights-offline/{planner,compatibility,boundaries}.test.ts` | **62/62 PASS**, zero skips/cancellations. |
| Unchanged M6/M7 pure regressions | **186/186 PASS**, all leaf cases: Highlights foundation, Timeline foundation/boundaries. |
| M10-03 compatible pure/boundary regressions | **57/57 PASS**: intake in-memory parser/candidate/preview tests, intake boundaries and private-store boundaries. |
| Distinct final acceptance | **305/305 PASS**, 305 distinct leaf cases; no parent-node inflation or duplicate selected files. |
| `pnpm lint` | PASS on final source/tests. |
| `pnpm exec tsc --noEmit --incremental false` | PASS on final source/tests. |
| `pnpm exec next build --webpack` | PASS: compilation, TypeScript, 12 static pages and route/build-trace completion. |
| Fresh production audits | **11/11 PASS**. |
| New audit | Six new modules, 12 transitive runtime files, 374 external sources, 217 built JavaScript files; zero production references/network/media/private-access edges/server actions. |
| Intake audit | Six original intake modules, 370 external sources and 217 built files; zero production references/forbidden imports/server actions. |
| Source/Git/secrets/Markdown/whitespace | PASS; exact 14-file inventory, source hashes, 721 unchanged baseline files, local link targets and staged/worktree byte equality checked. |

Development evidence is preserved: first focused run **52 passed / one failed runner file-load node**, caused by top-level await in the reusable static audit being incompatible with tsx's CommonJS test loading. Encapsulating CLI audit execution in an async function fixed the loader without skipping assertions. Next run **55/55 PASS**; final expanded run **62/62 PASS**. The first standalone TypeScript run found a literal-inferred max-term parameter that rejected Number.MAX_SAFE_INTEGER at compile time; an explicit number annotation fixed it without changing numeric validation.

Across three focused runs and the two regression runs: **413 runner-node executions, 412 passed and one development file-load failure**. Of the 108 preliminary nodes, 107 are overlapping passing case executions and one is the failed file-load node; neither increases the final 305 distinct case count. No unresolved final failure, test skips or weakened assertions.

M6/M7 command selects `tests/storyline/highlights/foundation.test.ts`, `tests/storyline/timeline/foundation.test.ts`, `tests/storyline/timeline/boundaries.test.ts`. M10 selects `tests/storyline/narration-intake/intake.test.ts`, `tests/storyline/narration-intake/boundaries.test.ts`, `tests/storyline/narration-private-store/boundaries.test.ts`. No PostgreSQL or private-store filesystem/restart suite is selected.

Verification uses clean env -i, telemetry disabled and explicitly unreachable dummy application DATABASE_URL at **127.0.0.1:1/storyline_unreachable**, Node 26.12.0 and Next.js 16.3.6. A temporary preload outside Git blocks dotenv/npmrc reads and Node socket/HTTP/HTTPS/fetch dispatch before I/O; self-checks passed. This is a verification guard, not an OS sandbox guarantee. Compiler subprocess permission was used only for the guarded build. No application environment file, secret or account was inspected.

Audit command: `node tests/storyline/<name>/production-audit.mjs <ignored-receipt>` for `video-highlights-offline`, `narration-private-store`, `narration-intake`, `tts-evaluation`, `render-execution-fake`, `maintenance-fake`, `render-planning`, `highlights-studio`, `timeline`, `timeline-persistence`, `timeline-studio`. These inspect source/build text, not application services. Verification logs/hash snapshots/audit receipts are retained under ignored `coverage/m10-04a-20261106/`; no media or store key is written there.

**NOT_RUN:** real video/source possession/rights inspection, media-byte hashing, movie downloads, probe/decoder/encoder/extraction/rendering, real narration/Sample 01 access, private-store import/recovery/restart/filesystem runtime suites, M10-03A private-file suite, paid/live/provider/account/TTS/listening evaluation, PostgreSQL/Redis/workers/migrations, M8 runtime/fault suites, M4 timing suites, UI/component/Chromium, remaining M5/general server and mock TTS runtime suites, deployment or push. No application UI/runtime composition or private-store implementation changed; relevant pure regressions and fresh full compilation/boundary audits were used. Historical PASS counts are not presented as fresh.

## 8. Exact inventory and source hashes

**12 new files, two modified intake test/audit files; no existing runtime source changes.** New report: `docs/STORYLINE_M10_04A_VIDEO_HIGHLIGHTS_FOUNDATION.md`. Source inventory:

| Owned source path | SHA-256 |
| --- | --- |
| `lib/storyline/video-highlights-offline/compatibility.ts` | `541a20756b120a6eecce60165959c8c1bb22ab0d9f020759b27d357c4f7bcdc3` |
| `lib/storyline/video-highlights-offline/contracts.ts` | `17eb1a3de75b4ccd2174c754337d602cd37f10afa023f83003144a62072d0bcc` |
| `lib/storyline/video-highlights-offline/index.ts` | `27c640663012a6d4d6e01be1de5916194f45e1dd6258ef7551f75f805c9ae87e` |
| `lib/storyline/video-highlights-offline/planner.ts` | `a55043b7929c70b290e362749d83ba6cebd7a3084d7b210a9fda67af9a5885e9` |
| `lib/storyline/video-highlights-offline/rational.ts` | `35dcc56de81aaa1bfbe71014ec491cfa8b70582072ef967d774829a54687d837` |
| `lib/storyline/video-highlights-offline/source.ts` | `023ca3d6254869b11253a8d0d4b63302ad50d58a7a676cd06921314fe7e3449a` |
| `tests/storyline/narration-intake/boundaries.test.ts` | `d31b5804a4740b95709b8bca5a9a0ca7b8f7393c63c230bf2163da488dacf608` |
| `tests/storyline/narration-intake/production-audit.mjs` | `92e3e893d9d15c481646cc77fc060bfb40a0f0cee055a666881058fc006c1a8f` |
| `tests/storyline/video-highlights-offline/boundaries.test.ts` | `581fa19f363f4ab4166393caa6fe87d308c793639b45c565d8ca999600e32f4b` |
| `tests/storyline/video-highlights-offline/compatibility.test.ts` | `c56c5a759cec5febcfc33b5123a42bf16dedac24a6961fcd88e09c5829b383f4` |
| `tests/storyline/video-highlights-offline/fixture.ts` | `4eeaecdd9e7f2aeed896567c005e576995b1edab7a535c2727226f3cc8ba606a` |
| `tests/storyline/video-highlights-offline/planner.test.ts` | `c94dadd36e30ae3a6521ab85e1814e41f63a41902a4bc2ecff8d2e0b8c66239f` |
| `tests/storyline/video-highlights-offline/production-audit.mjs` | `82480f4df4e9fe63013b33594f897c9fe74e1a2136894624a512d5aa5be58f49` |

The two modified paths are the existing `tests/storyline/narration-intake/boundaries.test.ts` and `production-audit.mjs`, solely for the exact pure compatibility-consumer exception described above. All other listed code/test/audit files are new. No media, manifests, credentials, private artifacts, environment files, package changes or logs are committed. Secret scans distinguish deliberately synthetic negative-test literals from actual credentials and are not universal secret-detection guarantees.

## 9. Remaining blockers and M10-04B requirements

This is a synthetic planning and process-local integrity boundary, **not production source authentication, independent rights review or real media currentness**. Catalog/plan hashes cannot authorize reads or execution. Serialized objects cannot restore trusted membership after restart. Rational intervals express mathematical intent without certifying real PTS/DTS, GOP/keyframes, timestamp precision, stream topology, codec capability or accurate cuts.

A separately reviewed M10-04B should establish the source/rights/possession evidence protocol, exact script/narration linkage, immutable plan persistence/replay and policies for independent media timebase/frame validation and exact-to-M7-millisecond conversion. It must explicitly decide whether it remains offline-only. Real files, parsers, extraction, privileged storage, provider requests and rendering require separate authorization; this handoff grants none.

OPENROUTER_ONLY, `google/gemini-3.8-flash-tts`, Kore and existing PCM research selection remain unchanged. Formal real TTS admission is BLOCKED, production narration unapproved, M8 fake-only/Phase 0/Phase 1A authority isolated. A saved WAV, positive owner listening review or valid duration cannot establish approved script coverage or synchronization.

M4 expiry source SHA-256 is unchanged: **8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7**, preserving all sixteen controls and original **700 ms** positive deadline. The historical timing incident remains **UNRESOLVED**, not rerun or dismissed.

**Final verdict: M10-04A OFFLINE SYNTHETIC PLANNING PASS. SOURCE_RIGHTS_VERIFIED: NO; REAL_VIDEO_CLIPS_EXTRACTED: NO; NARRATION_SYNC_VERIFIED: NO; MP4_RENDERED: NO; PRODUCTION_READY: NO.** Stop before real movie access, clip extraction, live TTS or MP4 rendering.
