# M10-03A — Offline narration audio intake foundation

Date: **2026-11-06, Asia/Bangkok**. **Functional offline acceptance: PASS.**

Reusable server-only TypeScript now validates bounded mono PCM16 WAV bytes, emits immutable, disclosure-safe candidate metadata and projects exact measured duration into a pure narration preview. Synthetic executable tests cover the byte parser, private-file races, provenance, conflicts and production isolation. This is neither a Myanmar speech-quality PASS nor production narration admission. **Formal M10-02B live evaluation remains BLOCKED.**

## 1. Baseline and source audit

- Branch: `main`; exact entry HEAD: `fc629f4dc1a41b3d5443d897fa8464f1f31304c4`.
- Initial index, tracked worktree and nonignored untracked inventory: clean. Upstream: `origin/main`; no fetch or remote-state verification.
- Accepted ancestry inspected through `e404d06616e4c92dbedec7de0c62b336711023fe`, `65e8c6ac382e24e037cdc682aa5d56e58fec5f41` and `a45d28dba2d9cc490de16b39291f449fce5e06a5`; the audio-review ancestor was also checked with `git merge-base --is-ancestor`.
- Read AGENTS.md, CLAUDE.md, installed Next.js testing guidance, the [Sample 01 listening addendum](STORYLINE_M10_02B_SAMPLE01_LISTENING_ADDENDUM.md) and [earlier integrity report](STORYLINE_M10_02B_SAMPLE01_EXTERNAL_AUDIO_REVIEW.md).
- Inspected actual M5 `voice/contracts.ts`, its existing synthetic `audio-verification/wav.ts`, M7 `timeline/contracts.ts`/exports, M8 fake-execution contracts/exports and existing test/audit conventions. M5's disabled handoff and synthetic verifier are not genuine narration admission. M7 currently uses integer-millisecond, synthetic-only placement; M8's fake measurements are explicitly NOT_MEASURED.
- **All 700 original tracked files retain their entry SHA-256 values.** No existing M1–M10 contract, hash domain, configuration, route, component or test was changed. No packages installed.

The new module imports only Node crypto, read-only filesystem/path primitives and the existing pure canonical/validation helpers. It imports no M5 voice authority, M7 persistence, M8 execution/recovery/maintenance, provider SDK, queue, database or production bootstrap.

## 2. Implementation and public exports

The isolated entry point is [narration-intake/index.ts](../lib/storyline/narration-intake/index.ts). Every module begins with `import "server-only"`; no production source imports this entry point.

| Module | Responsibility |
| --- | --- |
| `contracts.ts` | Versioned schema names, fixed limits/restrictions, evidence vocabulary, bounded exact-key owner-evidence parsing and reduced rational seconds. |
| `wav.ts` | Defensive bounded byte capture, exact WAV/PCM parsing, whole-container SHA-256 and process-local measured-object registration. |
| `candidates.ts` | Bounded ephemeral candidate registry, immutable safe metadata, same-byte/evidence deduplication and conflict rejection. |
| `private-file.ts` | Explicitly composed one-use local file-inspection closure; read-only/no-follow open, bounded capture and identity fences. |
| `preview.ts` | Pure `buildNarrationTimingPreview` from an original registered candidate and optional exact rational duration claim. |
| `index.ts` | Named public exports and types; internal measurement/candidate registration checks are not exported here. |

Runtime exports: `INTAKE`, `evidenceClasses`, `restrictions`, `noOwnerClaims`, `NarrationIntakeError`, `measureNarrationWav`, `createOfflineNarrationRegistry`, `authorizePrivateWavInspection`, `buildNarrationTimingPreview`. Types: `WavMeasurement`, `OwnerEvidence`, `RationalSeconds`, `NarrationCandidate`, `NarrationMetadata`, `PrivateFileAuthorization`.

New schema identifiers are `story-narration-wav-measurement-v1`, `story-narration-intake-candidate-v1` and `story-narration-timing-preview-v1`. These are new schema discriminators, not changes to prior canonical hash domains. `sha256` is explicitly the ordinary SHA-256 of the complete captured WAV bytes, not a recipe, approval, PCM-only or provider-response hash.

## 3. WAV validation and exact measurement

V1 deliberately accepts one narrow layout: `RIFF` / exact little-endian file-size declaration / `WAVE` / `fmt ` size 16 / `data` / exact EOF. RIFF/WAVE tags are compared as raw bytes, including a negative high-bit ASCII-spoof case.

- Only format tag 1, mono, signed 16-bit little-endian PCM. Two bytes per frame; byte rate must equal twice sample rate.
- Explicit allowed rates: **8000, 16000, 22050, 24000, 44100, 48000 Hz**. Zero or other rates denied; no implicit resampling.
- File limit **8 MiB**, inclusive; minimum 46 bytes, nonempty data and complete two-byte frames. RIFF/data sizes must exactly match captured bytes.
- Unknown/additional chunks, JUNK/LIST, extended fmt, duplicate chunks, reordered chunks, raw PCM, RF64, float/extensible codecs, stereo, trailing bytes, truncation and partial frames are rejected. Ancillary metadata is not silently skipped or disclosed.
- Only genuine Uint8Array/Buffer storage with expected prototypes is accepted. Shared memory, proxies, other views and spoofed objects are rejected. Intrinsic getters/copy avoid caller iterators and own accessors; captured bytes are copied before validation/hash.
- `sampleFrames = dataByteCount / 2`; duration is the reduced exact fraction `sampleFrames / sampleRateHz`, in **seconds**. No millisecond rounding or estimated speech duration.

Every complete PCM16 bit pattern is structurally legal. The parser checks framing and measured timing; it does not infer speech, language, intelligibility, quality, lack of clipping or exact script coverage. No compressed decoder, sample playback or waveform export is implemented. Captured bytes are released after measurement; registries retain metadata only.

## 4. Private-file boundary and limitations

`authorizePrivateWavInspection` accepts an exact server-composed configuration: `authorization:EXPLICIT_LOCAL_READ_ONLY`, one absolute normalized authorized path, a private root and repository root. No default path, environment lookup, CLI request path, browser input, route or server action is installed. **The literal is not authentication:** a trusted local operator must first obtain explicit owner authorization and construct this closure privately. It must never be exposed as a client-configurable service.

The path must be within the configured private root, outside the repository; private and repository roots cannot overlap. Relative/traversal/NUL paths, filesystem root as private root and extra fields are denied. Existing path components are checked with lstat for symlinks. The file must be regular with one link. Mandatory `O_RDONLY | O_NOFOLLOW | O_NONBLOCK` opens without creating/writing; unsupported safety flags fail closed.

Path and descriptor identity are compared before capture and after capture: device, inode, size, nanosecond mtime/ctime, mode and link count. Capture is bounded to initial size plus one byte; short reads, growth, mutation, replacement, symlinks or identity drift fail. The descriptor is closed on success/failure; a close error denies success. Native filesystem exceptions are replaced by fixed safe error codes without path/cause details. The closure is consumed before asynchronous work and cannot be reused. Authorization/configuration and audio bytes are not returned or logged.

**Residual TOCTOU limits:** component-by-component checks are not an atomic kernel `openat2` containment proof. A malicious privileged filesystem, parent-directory replacement, hardlink race, timestamp manipulation, unusual network filesystem or mutation after the final check is outside this local fixture guarantee. There is no exclusive writer lock or durable source ownership. The hash binds the captured snapshot, not perpetual path identity. Use an operator-controlled private directory; hostile/shared filesystem production intake remains blocked pending an independently reviewed directory-descriptor/immutable-storage protocol, permission/revocation policy and OS controls. No real Sample 01 path was authorized or inspected in this milestone.

## 5. Evidence, metadata and admission boundaries

The strict evidence vocabulary preserves independent facts:

| Class / field | Meaning and issuance |
| --- | --- |
| `OWNER_REPORTED` | Optional selected OpenRouter/Gemini/Kore provenance claim, never a verified generation receipt. |
| `LOCAL_AUDIO_INTEGRITY_VERIFIED` | Issued only after local bounded WAV measurement; no speech or production acceptance. |
| `PROVIDER_RECEIPT_VERIFIED` | Reserved vocabulary only. No issuer or authenticated verifier exists in this milestone; owner input cannot assert it. |
| `SCRIPT_COVERAGE_NOT_VERIFIED` | Always retained; exact original script is unavailable to this foundation. No transcript reconstruction. |
| `LISTENING_FEEDBACK_OWNER_SUPPLIED` | Optional owner-supplied listening evidence; no authenticated qualifications, events or exact-script review implied. |

Owner input has exactly `origin`, `providerClaim`, `originalScript`, `listeningFeedback`. Only `OWNER_DOWNLOADED_WAV` or `SYNTHETIC_TEST_WAV` origins are accepted. Synthetic origin cannot claim provider generation. Free-text receipts, identities, secrets, script text, file paths, human approval, alternative models and extra authority fields are rejected before registration. The module cannot establish authenticity merely from an owner claim.

Serializable candidate metadata includes an opaque random `ni-` UUID, schema, complete measurement, whitelisted owner provenance, evidence labels, missing evidence and admission blockers. It contains no private path, audio bytes, waveform, transcript, account ID, receipt body or public URL. Native gateway response identity remains `NOT_ESTABLISHED`, provider receipt `UNKNOWN`, script coverage `NOT_VERIFIED`.

Fixed restrictions: `OFFLINE_INTAKE_ONLY`, `liveEligible:false`, `audioVerified:false`, `humanApproval:NONE`, `sourceVerified:false`, `spendingAuthority:NONE`, `publicationEligibility:false`, `productionEligible:false`. Here `audioVerified:false` preserves the broader speech/admission boundary despite locally verified WAV structure. No SOURCE_VERIFIED or human-approval receipt is issued.

The registry holds at most **16 candidates per instance**; same exact audio/evidence returns the original candidate. Changed evidence for an already registered byte hash conflicts instead of rewriting metadata. `checkMetadata` performs bounded comparison against that instance's original candidate ID and full metadata; it cannot import a candidate or restore authority. Cross-registry IDs are rejected. There is no eviction, persistence or tenant authorization claim.

Original measured objects and candidates are registered in private WeakSet/WeakMap identity tables and deeply frozen. Serialized copies, rehashed/forged envelopes and M5/M8 artifacts cannot create a timing candidate. These are process-local integrity capabilities, not durable proofs, approvals or production security principals. Valid synthetic PCM WAV bytes may still establish **local container integrity only**; no byte parser can authenticate a generator from content alone.

## 6. Pure timing preview

`buildNarrationTimingPreview(candidate, claimedDuration?)` returns immutable rational-seconds `[0, measuredDuration)`, `track:narration`, `synchronization:PREVIEW_ONLY`, candidate ID, WAV hash and the same restrictive admission flags. It performs no I/O, registration, timeline mutation or provider action. A claim must have exactly integer numerator and positive integer denominator, reduce to the measured fraction and contain no extra fields. Equivalent fractions pass; conflicting, fractional, negative, zero-denominator or extra-field claims fail.

The synthetic 101-frame / 24000-Hz case yields exactly `101/24000` seconds; `202/48000` is equivalent. M7 consumes integer milliseconds today; no conversion, rounding policy, M7 save, movie alignment, narration synchronization or rendering adapter is introduced.

## 7. Executable negative evidence

| Area | Fresh evidence |
| --- | --- |
| WAV identity and size | Independent Node SHA-256 comparison, full-frame/rational counts, all six rates, exact 8-MiB ceiling and ceiling+1 rejection. |
| Malformed input | Every shorter prefix of a synthetic WAV; forged tags/lengths, additional chunks, alignment/rate/depth/encoding/channel errors, empty/raw/oversized/shared/proxy/spoofed input. |
| Private files | Missing path, directory, relative/traversal/NUL/root escape/repository overlap, leaf/ancestor symlink, hardlink and sparse oversized input. |
| Races / descriptor errors | Deterministically injected replacement, in-place mutation, growth, truncation, symlink replacement just before open, redacted read error/descriptor close and fail-closed close error. |
| Evidence forgery | Extra receipt/approval/spending/path claims, missing/oversized/accessor/symbol fields, absent original script, native-PCM identity claim and fake M5/M8 promotion denied. |
| Candidate / preview | Immutable nested metadata, duplicate return, changed metadata/evidence conflict, registry limits and isolation, copied measurement/candidate rejection, exact and mismatched duration claims. |
| Disclosure / network | Console spies report zero logs; paths/private markers absent from metadata/errors; end-to-end synthetic flow records zero fetch calls; AST import allowlist excludes every network/SDK/process edge. |
| Production | Fresh source/build audits deny intake composition, synthetic authority/transport, provider/engine imports and public server actions. |

Fixtures are newly generated synthetic signed PCM bytes, never TTS output. Filesystem tests use newly owned temporary directories, an ownership marker and bounded generated files; cleanup verifies the marker before removing only that owned directory. No existing audio or movie file is read.

## 8. Actual commands, results and overlap accounting

All verification uses an explicitly unreachable application `DATABASE_URL` targeting `127.0.0.1:1/storyline_unreachable`, clean `env -i` and telemetry disabled. Node version 26.12.0; Next.js 16.3.6 Webpack. No application environment file was opened. A temporary verification-only preload outside Git denies dotenv/npmrc reads before I/O and Node socket/HTTP/HTTPS/fetch dispatch. Guard self-checks passed. This guard is not a general OS network sandbox; import audits and the restricted task environment provide additional boundaries. It is not shipped as application code.

| Final scoped check | Actual result |
| --- | --- |
| New focused intake, private-file and boundary tests | **69/69 PASS**, no skips/cancellations. |
| Unchanged M5 handoff/foundation and M7 pure foundation/boundary regressions | **188/188 test nodes PASS**: 183 leaf cases, five parent nodes. |
| Unchanged M5 synthetic audio verification, collection, receipt and boundary regressions | **62/62 test nodes PASS**: 60 leaf cases, two parent nodes. |
| Final acceptance total, disjoint files | **319/319 test nodes PASS**, **312 distinct leaf cases**, seven parents; zero failures/skips/cancellations. |
| Lint | `pnpm lint`: PASS, including final added tests. |
| TypeScript | `pnpm exec tsc --noEmit --incremental false`: PASS on final source/tests. |
| Dummy Webpack | `pnpm exec next build --webpack`: PASS; compilation, TypeScript, 12 static pages and route/build-trace completion. |
| Fresh production audits | **9/9 PASS**; intake, TTS fixtures, M8 fake execution, maintenance fake, render planning, M6 Highlights Studio, M7 timeline/planning/persistence/Studio. |
| Intake audit | Six isolated modules, 364 external source files and 217 built JavaScript files inspected; zero production references/forbidden imports; zero server actions. Existing API route count remains 38. |
| Scope / source / secrets / docs / whitespace | PASS; 700 unchanged baseline hashes; only the 12 owned paths below; local targets, Markdown structure/newlines, secret patterns, both Git whitespace checks and explicit staged inventory/content equality checked. |

Test command shape: `node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 <explicit files>`. The focused files are the three new `*.test.ts` paths below. The seven first-regression files are `tests/storyline/voice-handoff.test.ts`, all four `tests/storyline/voice-foundation/*.test.ts` and `tests/storyline/timeline/{foundation,boundaries}.test.ts`. The four second-regression files are `tests/storyline/audio-verification/{wav,boundary,collection,receipt}.test.ts`. These suites run serially; no PostgreSQL test is selected.

Preliminary focused runs passed 62 and 65 nodes before the final 69-node run. They add **127 overlapping passing executions**, not distinct acceptance cases. Across all five Node runs: **446 passing node executions / 439 leaf executions**, representing **319 distinct final nodes / 312 distinct final leaf cases**. No failed test run. The first standalone TypeScript run failed on two new-code narrowing casts; both were corrected without changing existing contracts, and subsequent standalone/build/final TypeScript checks passed. Preliminary logs are preserved, not overwritten. No security assertion was weakened.

Audit commands: `node tests/storyline/<name>/production-audit.mjs <ignored-receipt>` for `narration-intake`, `tts-evaluation`, `render-execution-fake`, `maintenance-fake`, `render-planning`, `highlights-studio`, `timeline`, `timeline-persistence`, `timeline-studio`. These scripts read source/build text only, not application services. Local verification logs, the original tracked-file hash snapshot and audit receipts remain ignored under `coverage/m10-03a-20261106/`; no audio/secret is stored there. Build child-process permission was used only for the authorized guarded compiler build.

Static checks also cover explicit-path staging, staged/worktree byte equality, exact inventory, credential/private-key patterns, no audio/binary files and final source hashes. The initial secret-pattern scan flagged one intentionally synthetic `REDACTION_TEST_NOT_A_CREDENTIAL` literal in the negative logging test; manual review confirmed it is not a credential, and the final scan exempts only that exact test literal. No actual secret finding. Pattern scans cannot establish universal secret absence. No historical PASS counts are presented as fresh runtime results.

**NOT RUN:** optional Sample 01 smoke/path/hash inspection (no new explicit path authorization), actual audio playback or speech/listener evaluation, provider/account/credential access, synthesis, billing/spending approval, compressed decoding, FFmpeg/FFprobe, movie access, M8 execution/recovery/maintenance runtime suites, PostgreSQL/Redis/workers, M4 expiry tests, UI/component/Chromium suites, broader application server regressions, deployment or push. No existing runtime behavior/UI is modified or composed; the scoped pure regressions and fresh full compilation/production audits address this isolated addition. The unchanged M10 mock TTS suite was not rerun; its production audit was rerun.

## 9. Exact owned inventory and source hashes

All twelve files are **new**; no existing files modified. The report itself is `docs/STORYLINE_M10_03A_NARRATION_AUDIO_INTAKE.md`. The eleven code/test/audit source hashes are:

| New source path | SHA-256 |
| --- | --- |
| `lib/storyline/narration-intake/candidates.ts` | `8d512a5cc6ec04d25ed1e78f74de75e87b4583921d3e0591c38c3f443f99446b` |
| `lib/storyline/narration-intake/contracts.ts` | `7869a99e27edbfc0e3234e31399f06feafbf1dd51c0cd336fa212b06074fb8e2` |
| `lib/storyline/narration-intake/index.ts` | `47a62ede161289659517977efc2495691af9ac90c1fc29167d5444edfb0d2500` |
| `lib/storyline/narration-intake/preview.ts` | `d15e1f0dea8ef277ec1c84bc71c7af9deade868c5f6473c413fc4979633ec572` |
| `lib/storyline/narration-intake/private-file.ts` | `9550a85d697b8b34150014340634513b066ead202a9f93e38816390a92feba6e` |
| `lib/storyline/narration-intake/wav.ts` | `7c3740bba392fa4cf715309d309a3dd8dc3ea0385177cce933631e9a12a2fffd` |
| `tests/storyline/narration-intake/boundaries.test.ts` | `6c1d4d1798beca262caf6564e5865cc55f775f84c73bff17e61e2f69a65e8e10` |
| `tests/storyline/narration-intake/fixture.ts` | `f567bd23a3f2046f05c6e21c963d7abcfb112c4f570d4e6d32c3ee5a5491299e` |
| `tests/storyline/narration-intake/intake.test.ts` | `167ddb0943a9e061b0c7f3775c70dce131c750ab59dde79ad909a39c35b51a01` |
| `tests/storyline/narration-intake/private-file.test.ts` | `96555d2e50a812192082c99790e5c0323fab5d920652322c824df3b0a59cb077` |
| `tests/storyline/narration-intake/production-audit.mjs` | `ced028280f601feb84b7ae0c66102e9f880ddd969b51c1d501e3d2a4b5a6ad67` |

## 10. Preservation and remaining blockers

OPENROUTER_ONLY, full `google/gemini-3.8-flash-tts`, Kore and the existing gateway PCM research selection remain unchanged. An owner-downloaded WAV is not evidence of the native gateway raw PCM format/identity. There is no direct Google/ElevenLabs/Azure client, automatic retry/fallback, live sender, public file endpoint or render control.

Sample 01's earlier SHA-256 and 29.48-second finding remain historical references in the earlier report; this milestone does not recheck its relocated private copy. The owner-supplied positive listening forms do not establish exact text completeness, qualified independent listening acceptance, provider generation identity or cost. No synthetic fixture is labeled genuine Myanmar speech.

M4 expiry source SHA-256 remains **8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7**: all sixteen controls and the original **700 ms** positive deadline preserved. The historical timing incident remains **UNRESOLVED**, not retested or dismissed. M8 fake-only, Phase 0 and Phase 1A authority boundaries remain unchanged and unimported.

Future integration requires separate review/authorization for private durable audio ownership, scoped access and retention, exact approved-script binding, provider/native-response receipts, account/privacy/routing acceptance, independently bounded charges and spending authority, durable original-request/UNKNOWN controls, qualified listening and semantic review, and an explicit exact-duration-to-timeline synchronization policy. This in-memory registry is not any of those systems. No M8 fake artifact, measured duration, hash or valid WAV grants source verification, approval, spending, TTS retry, publication or MP4 eligibility.

**Final verdict: M10-03A OFFLINE FOUNDATION PASS; SCRIPT_COVERAGE_NOT_VERIFIED; FORMAL_LIVE_TRIAL_BLOCKED; PRODUCTION_TTS_NOT_READY.** Stop before live API integration, production use or media rendering.
