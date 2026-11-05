# M10-04B — Private video source integrity foundation

Date: **2026-11-06, Asia/Bangkok**. **Offline private read-only byte integrity: PASS.**

A trusted local operator can explicitly compose one private-file authorization, bind it to observed filesystem identity and consume it once for bounded streaming SHA-256 measurement. Output is immutable redacted metadata with process-local integrity membership. **It does not establish valid video, source rights, media duration/timebase, extraction permission or production readiness.**

## 1. Baseline and inspected contracts

Entry branch `main`; exact HEAD `676c49100fc5ebdb3a265a70d8b5051c6ce4d516`. Initial index, worktree and nonignored untracked inventory were clean. Upstream `origin/main` inspected without fetching; accepted M10-03B/M10-03A ancestry checked. No branch switch, pull, reset, rebase or remote mutation.

Read AGENTS.md, CLAUDE.md, installed Next.js testing guidance and the [M10-03A](STORYLINE_M10_03A_NARRATION_AUDIO_INTAKE.md), [M10-03B](STORYLINE_M10_03B_PRIVATE_NARRATION_ARTIFACTS.md) and [M10-04A](STORYLINE_M10_04A_VIDEO_HIGHLIGHTS_FOUNDATION.md) reports. Inspected actual M10-03A private reader, M10-03B ownership/permissions/no-follow patterns, M10-04A source descriptors/public contracts, M6 Highlights/M7 Timeline and M8 fake-only boundaries.

**All 735 baseline tracked files remain byte-for-byte unchanged**, including earlier contracts, hashes, audits, production UI/routes/workers, provider configuration and M4 timing assertions. No existing isolation exception or security contract was changed. This new module imports none of M6/M7/M8/M10-03/M10-04A runtime authority. Generic canonical hashing and validation/freezing helpers are reused.

## 2. Public API and modules

Entry: [video-source-intake/index.ts](../lib/storyline/video-source-intake/index.ts). Five server-only modules:

| Module | Actual responsibility |
| --- | --- |
| `contracts.ts` | Strict bounded configuration/metadata types, evidence vocabulary, fixed restrictions, limits and safe errors. |
| `reader.ts` | Canonical private paths, ownership/permission/type checks, original identity capture, one-use authorization, readonly bounded stream/hash and final fences. |
| `measurement.ts` | Internal trusted-reader completion, immutable metadata/hash and private WeakMap membership; pure metadata comparison. |
| `handoff.ts` | Pure blocked future-probe handoff, requirement types and strict comparison to current evidence. |
| `index.ts` | Explicit public exports; no byte issuer, private handle, raw bytes, metadata constructor or production composition. |

Runtime exports: `VIDEO_SOURCE_INTAKE`, `evidenceClasses`, `restrictions`, `VideoSourceIntakeError`, `authorizePrivateVideoSourceInspection`, `verifyVideoSourceMetadata`, `buildVideoProbeHandoff`, `verifyVideoProbeHandoff`, `futureProbeRequirements`. Types: `SourceInspectionConfiguration`, `SourceByteMetadata`, `MeasuredVideoSource`, `FutureVideoProbeRequirements`.

New schemas/domains: `story-private-video-source-bytes-v1`, `story-private-video-probe-handoff-v1`. Whole-file `sha256` is the ordinary SHA-256 of all actual streamed bytes. Separate `metadataHash` uses the existing domain-newline-canonical-JSON convention with the new metadata domain. Neither hash issues rights, SOURCE_VERIFIED, a probe receipt or execution authority.

## 3. Operator authorization and private path model

Configuration has exactly `authorization:EXPLICIT_LOCAL_READ_ONLY`, `privateRoot`, `repositoryRoot`, `authorizedPath`, `provenance:OWNER_REPORTED_SOURCE`. No default root, environment lookup, HTTP/client path, URL, filename inference, source hash, rights receipt, duration, expected stat identity or approval field is accepted.

The literal is **not production authentication or proof of legal consent**. A trusted local operator must obtain explicit authorization and inject one path. In this milestone every injected path belongs to a newly owned synthetic fixture. No real private movie or Sample 01 path was selected, checked, hashed or read.

All three paths must be absolute and in canonical lexical form: normalization and resolution must leave them unchanged. Traversal, relative paths, NULs, trailing-separator containment bypasses and filesystem-root selections fail. Private/repository roots must not overlap in either direction, and the file must be strictly within the private root.

Each existing path component is lstat-checked against symlinks. The configured repository root must be an existing directory. Private root and nested source directories must be current effective-UID-owned, exactly **0700**. Source must be a single-link regular file owned by that UID, exactly **0400 or 0600**, with no special access bits. Directory and file ownership/metadata mismatches fail closed. UID/inode/device values stay private.

Authorization snapshots strict configuration before asynchronous work and captures actual path identity from the filesystem; the caller cannot inject that identity. It returns only a frozen `inspect()` closure, which contains no serializable path. Inspection consumes the closure before its first await, including when inspection fails. Concurrent/repeated calls cannot obtain another read from the original authorization. New inspection requires a new explicit operator authorization; there is no automatic retry, fallback or persistent lease.

## 4. Source byte-identity protocol

Pilot bounds are fixed: **64 MiB maximum nonempty source**, **64 KiB reusable read buffer**, **4,097 read-call ceiling**, **8 KiB JSON contract/metadata bound**. This is not multi-gigabyte movie support. Excessive size, empty input, excessive partial-read operations or unsupported safety primitives fail without weakening the policy.

Protocol:

1. Validate authorization paths, no-link path walk, directory UID/mode and initial regular-file metadata.
2. Capture original device, inode, size, nanosecond mtime/ctime, mode, link count, UID and GID privately.
3. On `inspect`, recheck original directory identities/permissions and authorized file identity before opening.
4. Open exactly once with **O_RDONLY | O_NOFOLLOW | O_NONBLOCK**. Required flags and effective UID support must exist.
5. Validate descriptor identity/type/size/ownership/permissions against the captured original.
6. Read positional bounded chunks, updating incremental SHA-256. Partial positive reads accumulate; invalid read counts fail. Read through EOF with a bounded one-byte growth check, never allocate a full source buffer.
7. Require exact complete byte count and compare descriptor identity after reading.
8. Recheck directory and pathname identity, close the descriptor on all outcomes, then perform final directory/path checks after successful close.
9. Only after every check and successful close, issue immutable metadata and process-local membership.

Missing/replaced/unlinked/truncated/growing/modified sources, permission drift, invalid stat types/ranges, nonregular descriptors, read errors and close errors yield fixed redacted errors and no measurement. Any native exception is replaced without retaining its path, cause or raw diagnostic. No source write, chmod, copy, rename, delete, manifest, cache or artifact persistence operation is implemented. Kernel access-time updates from reads may still occur; read-only does not promise unchanged atime.

The digest binds the complete captured stream under the observed identity fences. It is not an immutable storage promise or proof that the file remains present, permitted or unchanged later. Future use must independently recheck exact bytes/current authorization.

## 5. Immutable metadata and evidence distinctions

Each successful observation has a new opaque `vsrc-<UUID>` candidate ID and version **1**, whole-file SHA-256/count, evidence tuple, provenance, rights/permitted-use/possession states, unknown media/duration/timebase/sandbox states, blockers and PREVIEW_ONLY restrictions.

Repeated separately authorized observations may share byte hashes but get distinct candidate identities; no version is overwritten or automatically adopted. The metadata hash binds that particular observation. Public identity observations report only policy/matched/owner-match/owner-only/single-link/complete-read/bounded-streaming facts, without private stat values. There are no private paths, original names, raw bytes, transcripts, account IDs, receipt bodies or credentials in public metadata.

| Classification | What this implementation establishes |
| --- | --- |
| `OWNER_REPORTED_SOURCE` | Provenance classification from explicit local composition; no independently authenticated owner/rights statement. |
| `LOCAL_FILE_BYTES_VERIFIED` | Complete bounded local byte stream, exact count/hash and matching observed identity fences. |
| `SOURCE_RIGHTS_PENDING` | Rights and permitted-use review remain pending; filesystem ownership is not copyright or usage permission. |
| `SOURCE_MEDIA_FORMAT_NOT_VERIFIED` | No container, codec, stream or valid-video claim, regardless of filename extension. |
| `SOURCE_DURATION_NOT_MEASURED` | Duration null; byte count never estimates running time. |
| `MEDIA_SANDBOX_NOT_VERIFIED` | No qualified parser/decoder environment exists here. |
| `EXTRACTION_NOT_AUTHORIZED` | No extraction permit from bytes, owner reports, hashes or metadata. |

Possession state is explicitly **BOUNDED_LOCAL_READ_OBSERVED_OWNERSHIP_PENDING**, not independent source ownership approval. Timebase is null/NOT_ESTABLISHED. Fixed restrictions keep sourceVerified/sourceRightsVerified/mediaDecoded/mediaTimebaseVerified/clipsExtracted/narrationSyncVerified/rendered/productionEligible/publicationEligibility **false**, execution **PREVIEW_ONLY**, humanApproval/spendingAuthority **NONE**.

Metadata is deeply frozen and registered in a private WeakMap. `verifyVideoSourceMetadata(original,value)` compares bounded canonical data against the original issued measurement; an exact copied record may be compared as data but cannot mint or restore a capability. Copied/rehashed wrappers and mutated/cross-source records cannot obtain original membership. The internal completion helper is not exported by the public entry point or composed in production.

This is process-local integrity bookkeeping, not protection against malicious code in the trusted server process, durable authentication, a signed external receipt or restart-restorable authority. Possession of a hash is not an inspection capability. Metadata remains a historical snapshot after file mutation or process restart.

## 6. Future M10-04A/probe compatibility boundary

M10-04A's catalog and plan inputs remain **SYNTHETIC_METADATA_ONLY** and unchanged. Neither direction is cast or relabeled: a synthetic descriptor cannot become this module's measured capability, and byte-verified metadata cannot become an M10-04A synthetic/verified real planning descriptor. Tests exercise both rejection paths, including M8 fake receipts and saved narration artifacts.

`buildVideoProbeHandoff(original)` is pure and includes exact candidate/version/byte SHA/count/metadata-hash binding plus a fixed **BLOCKED** status. Duration, streams and timebase are null; frame timestamp policy NOT_ESTABLISHED, codec/format NOT_VERIFIED, rights PENDING, sandbox NOT_VERIFIED and source-backed highlights NOT_AUTHORIZED. `verifyVideoProbeHandoff` only compares supplied data to that current evidence; forged measured duration/timebase/topology, rights, sandbox or permits fail.

`FutureVideoProbeRequirements` is a requirements type, **not a supported verified-result schema, probe implementation, executable port or permit issuer**. It requires exact byte identity to be rechecked at use; independently measured rational duration/topology/timebase; explicit frame timestamp policy; codec/format verification; independent source ownership/usage authorization; qualified parser/decoder isolation. The pure handoff's five-file transitive graph has **no filesystem access**. Nothing invokes a media tool or builds source-backed highlights.

## 7. Executable verification

Tests use newly generated arbitrary NON-MEDIA bytes in newly created ownership-marked temporary directories. Cleanup verifies the marker before removing only that fixture namespace. A synthetic .mp4 filename is deliberately tested with harmless non-media bytes; matching hash/extension never yields valid-video evidence. The 64-MiB limit test uses a newly generated sparse zero extension with an independently computed expected digest; it does not copy any existing file.

Fresh tests cover exact SHA/count/readonly flags/chunk bounds; positive partial reads; one-use/concurrent consumption; original identity binding; source/config mutation; truncation/growth/replacement/unlink/permission/root drift; mutation during close; read/close/early-EOF/invalid-result/read-limit faults; empty/oversized/exact-ceiling files; mocked UID/descriptor identity/nonregular/invalid-metadata cases; path/overlap/symlink/hardlink/permission rejection; copied/mutated/rehashed/cross-source metadata; false rights/media/duration/timebase/sandbox/permit claims; synthetic/M8 promotion; private path/diagnostic/log redaction; public export and production isolation.

| Final scoped check | Actual result |
| --- | --- |
| New source reader/security/boundary tests | **55/55 PASS**, all leaf cases, no skips/cancellations. |
| M10-04A + compatible M10-03A/B pure/boundary regressions | **119/119 PASS**: 62 M10-04A cases plus 57 M10-03 cases. |
| Relevant unchanged M6/M7 pure regressions | **186/186 PASS**, all leaf cases. |
| Final distinct acceptance | **360/360 PASS**, 360 distinct leaf cases; no parent inflation or selected-file overlap. |
| Lint | `pnpm lint`: PASS on final code/tests. |
| TypeScript | `pnpm exec tsc --noEmit --incremental false`: PASS on final code/tests. |
| Dummy Webpack | `pnpm exec next build --webpack`: PASS; compile, TypeScript, 12 static pages and build/route traces completed. |
| Fresh source/production audits | **12/12 PASS**. |
| New audit | Five isolated modules, seven full runtime-graph files, five pure-handoff graph files, 380 external sources and 217 built JavaScript files; zero production references/forbidden edges/server actions. |
| Static review | Exact 11-new-file inventory, source hashes, 735 unchanged baseline files, local links/Markdown/newlines, secrets, whitespace and staged byte equality checked. |

Node command shape: `node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 <explicit files>`. New group: `tests/storyline/video-source-intake/{reader,security,boundaries}.test.ts`. M10 group: all three M10-04A test files, `narration-intake/{intake,boundaries}.test.ts`, `narration-private-store/boundaries.test.ts`. M6/M7 group: `highlights/foundation.test.ts`, `timeline/{foundation,boundaries}.test.ts`. All suites run serially without PostgreSQL or service startup.

Preliminary focused runs: **50/50** and **54/54**, then final **55/55**. Across these and both regression runs: **464 passing node/case executions**, representing **360 distinct final cases**; the 104 earlier passing executions overlap and are not counted again. No failed Node test run. The first standalone TypeScript check failed because generic deep-freeze inference widened the evidence tuple. Constructing against the strict metadata type and then deep-freezing it preserved the exact evidence contract; subsequent standalone/build/final checks passed. No assertion or prior contract was weakened. Earlier logs remain preserved separately.

Verification uses clean env -i, telemetry disabled and unreachable dummy application DATABASE_URL at **127.0.0.1:1/storyline_unreachable**, Node 26.12.0 and Next.js 16.3.6. A temporary preload outside Git denies dotenv/npmrc reads and Node socket/HTTP/HTTPS/fetch dispatch before I/O; guard self-checks passed. This is not a general OS network-sandbox guarantee. Compiler subprocess permission was used only for the authorized build; no service/media child process was used.

Audit command: `node tests/storyline/<name>/production-audit.mjs <ignored-receipt>` for `video-source-intake`, `video-highlights-offline`, `narration-private-store`, `narration-intake`, `tts-evaluation`, `render-execution-fake`, `maintenance-fake`, `render-planning`, `highlights-studio`, `timeline`, `timeline-persistence`, `timeline-studio`. These inspect source/build text without importing application services. Logs and hash/audit receipts remain under ignored `coverage/m10-04b-20261106/`, without private user data or source bytes.

**NOT_RUN:** any real movie or existing external media/source inspection, Sample 01 path/hash/audio access, actual media/container/probe/decoder/encoder/extraction/rendering, live TTS/provider/account/credential/spending/listening operations, PostgreSQL/Redis/worker/migration operations, M8 execution/recovery/maintenance runtime suites, M10-03 private-store filesystem/restart and private-file suites, M4 timing tests, broader server/M5/mock-TTS runtime suites, UI/component/Chromium, deployment or push. No production application or prior storage/reader implementation changed; relevant unchanged pure/boundary regressions and the fresh full build/audits cover this isolated addition.

## 8. Exact new-file inventory and hashes

**Eleven new files, zero existing files modified.** New report: `docs/STORYLINE_M10_04B_PRIVATE_VIDEO_SOURCE_INTEGRITY.md`. The other ten source/test/audit files and SHA-256 values are:

| New source path | SHA-256 |
| --- | --- |
| `lib/storyline/video-source-intake/contracts.ts` | `ebbbb62c3c6313fafb22704cad9dfa6aac624497fb8cbdf1dd1741907ab39ecb` |
| `lib/storyline/video-source-intake/handoff.ts` | `a1747b22b6ee33ecb6fe91419696d78e016b7f6bf7e8b55eb5babde0a4158e4b` |
| `lib/storyline/video-source-intake/index.ts` | `2193910624e49bf88383c58586eb4165086ae47fb8a5902d3dae70b267f84390` |
| `lib/storyline/video-source-intake/measurement.ts` | `5d5c3b960ab1723f6b7b4681e40883a60911cafdc7c6a8822d9db5646ee8ab11` |
| `lib/storyline/video-source-intake/reader.ts` | `bd5fb759d1a9b867c0abfc24618874bcf2a53ae45b1b3e56712ea3eb750a548e` |
| `tests/storyline/video-source-intake/boundaries.test.ts` | `b223868a3c924618e38998cd300c85406e24122506c98e54cada269c244b3cdf` |
| `tests/storyline/video-source-intake/fixture.ts` | `acdad118253da2c1780124f14e745be97bb0b41300f6af9b0eb989cb14c8c359` |
| `tests/storyline/video-source-intake/production-audit.mjs` | `363d8128a80cd9dbe2ae6e33a7a9b4f07e9b439d64a2265d2212b208b9e6a884` |
| `tests/storyline/video-source-intake/reader.test.ts` | `a1e6b4d8fbdeba5462645f44e2694e0aa370b46e04ffac2704e367e6fdc7358c` |
| `tests/storyline/video-source-intake/security.test.ts` | `be1e3a0920fe79107903658e99a5f6aeb1888fd61f59fbed84f05319e3145bb5` |

Explicit owned paths only are staged. No fixture blob, media file, private path, source bytes, raw waveform, secret, environment file, generated artifact or ignored log is committed. Pattern scans are limited checks; no actual credential finding. Public source contains only generic synthetic negative markers and generated-fixture logic.

## 9. Filesystem limits and remaining gates

This is restricted to a **trusted local operator and controlled local POSIX filesystem**. Component lstat, UID/mode/link checks, original directory/file identity, no-follow opens, streaming hash and before/after fences do not constitute atomic openat2/directory-descriptor containment, immutable snapshots or exclusive writer exclusion. There are residual ancestor/path/final-response TOCTOU windows. Hostile same-UID/root actors, altered mounts/kernels/filesystems, malicious stat/timestamp behavior or modified trusted server code are outside the guarantees.

A concurrent writer may require immutable source storage or kernel-enforced exclusion before future probing. Post-measurement modification/revocation cannot retroactively alter the historical hash and must block future use under new currentness checks. No durable source registry, tenant/project authorization, retention/read holds, cleanup, GC, source ownership receipt or restart adoption is implemented.

Byte/memory/read-call limits are not OS wall-time or hostile-filesystem I/O guarantees. A stalled filesystem may still hang an underlying operation; there is no parser/process sandbox or certified hostile-media resource envelope. Missing required flags, UID facilities, unsupported metadata or permission policy fail closed; production/source probing remains blocked rather than dropping controls.

Separately authorized **M10-04C** must first review parser isolation and source-byte ownership/currentness, then establish exact authorized scope/usage and a qualified offline probe protocol. It must independently determine container/codec support, stream topology, rational measured duration/timebase and PTS/DTS/frame timestamp policy, pin tool versions, bound resource use, exclude network protocols and credentials, and recheck the exact original byte binding before/after use. Header claims alone or matching hashes cannot certify decoded media, accurate cuts or rights. Actual parser/decoder/media subprocess execution needs explicit separate authorization; this document grants none and implements no verified-result adapter.

OPENROUTER_ONLY / `google/gemini-3.8-flash-tts` / Kore remain unchanged. Real TTS admission is BLOCKED and production narration unapproved. M10-04A stays synthetic-only; M8 fake-only/Phase 0/Phase 1A authority is unmodified and unimported. There is no fake-to-real promotion, public media endpoint, export or paid call.

M4 expiry source SHA-256 remains **8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7**, preserving all sixteen controls and original **700 ms** positive deadline. The historical timing incident remains **UNRESOLVED**, not rerun, dismissed or weakened.

**Final verdict: M10-04B PRIVATE READ_ONLY SOURCE BYTE INTEGRITY PASS. SOURCE_RIGHTS_VERIFIED: NO; REAL_VIDEO_DECODED: NO; MEDIA_TIMEBASE_VERIFIED: NO; CLIPS_EXTRACTED: NO; NARRATION_SYNC_VERIFIED: NO; MP4_RENDERED: NO; PRODUCTION_READY: NO.** Stop after this offline implementation.
