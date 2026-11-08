# M10-04C Isolated media probe foundation

**2026-11-06, Asia/Bangkok. Offline implementation PASS. Host qualification SANDBOX_NOT_QUALIFIED.**

The server-only module validates synthetic probe metadata, binds the expected SHA-256 and byte count, checks exact rational timestamps, assesses Linux interface hints and produces a blocked handoff for a separately authorized pilot.

## Baseline and scope

The checkout entered clean on `main` at `052e76289aef2aa849f0f1cfc2e6efad8505ffbd`. The ancestry checks reached M10-04A `676c49100fc5ebdb3a265a70d8b5051c6ce4d516` and M10-03B `a4334d83a661b2407c73b561a979d2b14003ba01`. The upstream ref was inspected locally.

Reviewed AGENTS.md, CLAUDE.md, installed Next.js testing guidance, the M10-04B report, its source binding and handoff, M10-04A rational/highlight contracts, M10-03A/B narration/storage contracts and M6/M7/M8 synthetic security and timeline contracts. [M10-04B report](STORYLINE_M10_04B_PRIVATE_VIDEO_SOURCE_INTEGRITY.md)

The baseline contained 746 tracked files. The hash review matched 745 byte for byte. The sole existing-file edit permits one exact import declaration from the new offline timestamp module to the accepted M10-04A rational helper. The existing audit still checks the remainder of that file, all other external sources and all production bundles. The new transitive audit allows only that helper, its pure contracts and the canonical/validation helpers outside the six new modules.

## Public contracts

Entry point [media-probe-offline/index.ts](../lib/storyline/media-probe-offline/index.ts).

| Export | Behavior |
| --- | --- |
| `MEDIA_PROBE`, `restrictions`, `pendingEvidence`, `OfflineMediaProbeError` | Versioned names, fixed limits, restrictive states and redacted contract errors |
| `assessSandboxReadiness`, `linuxHintNames` | Strict Linux visibility hints and the fixed SANDBOX_NOT_QUALIFIED assessment |
| `validateSandboxProfile`, `fixedProbeExecutable`, `sandboxRequirements` | Shape validation for a proposed executable pin and complete isolation policy |
| `parseProbeSeconds`, `parseProbeTimebase` | Reduced exact rational declarations and positive bounded timebases |
| `validateSyntheticProbeResult` | Immutable source-bound metadata, deterministic result hash, timing uncertainty and pending gates |
| `validateProbeSegmentBoundaries` | Half-open interval validation using an original synthetic result and explicit presentation boundaries |
| `buildOfflineProbeHandoff` | Blocked reference with source, rights, sandbox, timebase and codec requirements |

Type exports are `ProbeSourceBinding`, `ProbeRational`, `LinuxHintState` and `SyntheticProbeResult`. The five schema identifiers are `story-offline-probe-profile-v1`, `story-offline-probe-linux-hints-v1`, `story-offline-probe-sandbox-v1`, `story-offline-probe-result-v1` and `story-offline-probe-handoff-v1`. The result domain hashes canonical normalized metadata with the existing domain-separated SHA-256 helper.

The accepted probe shape has exactly schema version, synthetic trust/completeness, source, container, duration, timestamp provenance, negative timestamp policy and streams. The shape accepts `PROBE_RESULT_SYNTHETIC`, `SYNTHETIC_METADATA_COMPLETE` and `SYNTHETIC_DECLARATIONS` only. Completeness refers to the metadata contract. Absent frame timestamps remain explicit.

## Sandbox profile and observed host

The proposed layout pins the single public deployment path `/opt/movie-translator/media-probe/bin/ffprobe`, a bounded dotted version and a lowercase SHA-256. This path is a design choice for a future deployment. The test pin is synthetic. Its validation establishes the proposed shape and returns SANDBOX_NOT_QUALIFIED.

The policy requires direct invocation with a reviewed fixed argument vector, an empty environment, credential exclusion, an isolated network namespace with socket denial, a single authorized read-only input descriptor, and local descriptor protocols only. A separate PID namespace and non-root identity with dropped capabilities and no new privileges separate the runner from application processes. Minimal read-only mounts exclude the repository and private narration store. The kernel syscall allowlist and resource controls require independent qualification.

Proposed per-run limits are 2 CPU seconds, 5,000 ms supervised wall time, 128 MiB memory and 4 processes. The runner must bound complete stdout to 65,536 bytes and stderr to 8,192 bytes, terminate the isolated process group on failure or overflow, drain pipes within limits, reap descendants and return redacted codes. Proposed numeric limits require measurement under the actual runner policy.

The unprivileged host check read bounded data from fixed `/proc` files and `/sys/fs/cgroup/cgroup.controllers` and inspected the four namespace links. It returned only enumerated observations.

| Observed on this host | Result |
| --- | --- |
| Platform and effective identity | Linux and non-root |
| User, mount, network and PID namespace links | Visible |
| User namespace limit and unprivileged clone policy | Positive limit and visible enabled policy |
| Seccomp interface | Visible through the current process status |
| Cgroup v2 CPU, memory and PID controller names | Visible |
| Future runner enforcement and independent qualification | Unverified |

The assessor's status remained **SANDBOX_NOT_QUALIFIED**. Interface visibility alone leaves namespace creation permission, cgroup delegation, actual seccomp rules, mount isolation, capability drop, process termination and output limits unresolved. A successful JavaScript test, timeout, fixed arguments or environment setting carries no OS enforcement evidence.

## Streams and exact timing

- The pilot accepts MP4 with H264_AVC and optional AAC, or Matroska with H264_AVC or VP9 and optional AAC or OPUS. Topology requires exactly one video stream and permits one audio stream. Stream indexes are unique integers from 0 through 255.
- Dimensions range from 1 through 8,192 per axis with a 33,554,432-pixel cap. Audio declarations require 8,000–192,000 Hz and one through eight channels. These are synthetic policy bounds.
- Time is expressed in reduced rational seconds with safe integer terms up to 1,000,000,000. Stream timebases are positive and at most one second per tick. Frame rate declarations are positive and capped at 240 frames per second when present. A constant-rate declaration requires a rate. Starts are nonnegative and durations positive. The container duration is capped at 86,400 seconds and must equal the maximum stream end measured from zero.
- The shared rational helper performs exact addition and comparison. Tick conversion and duration consistency use BigInt cross-products. Unrepresentable tick positions and arithmetic overflow fail. Millisecond conversion and floating-point division play no role.
- The v1 timestamp policy rejects negative PTS, DTS and stream start values. Frame declarations arrive in decode order with strictly increasing DTS and DTS at or before PTS. PTS can reorder. A separate presentation-order check requires contiguous, positive frame intervals covering the exact declared video window, with at most 256 frames. CFR declarations must agree with each supplied frame duration. Variable or unknown rate keeps a separate uncertainty marker.
- A null frame list retains explicit timestamp uncertainty. Partial frames, gaps, overlaps and inconsistent timing fail. Segment validation requires explicit presentation boundaries from the accepted synthetic list and uses the half-open interval within the selected video stream. It allows the terminal boundary and returns `SYNTHETIC_INTERVAL_ONLY`. Real frame and keyframe boundaries stay unresolved for every result.

Fixtures cover video-only, video with audio, variable frame rate, decode/presentation reorder, absent duration or frame timestamps, conflicting timestamps, wrong source hash, unsupported codecs and oversized metadata. They are TypeScript objects with authored values.

## Source reference and handoff

The probe validates SHA-256 and byte count against the separately supplied expected fixture reference. The reference has the same byte identity concepts as M10-04B, with a 64 MiB count bound. Its origin in this suite is synthetic. Canonical metadata is bounded to 65,536 bytes. Result membership is process-local and checked before validating a segment. A serialized copy has no membership.

The handoff accepts either a reported `LOCAL_FILE_BYTES_VERIFIED` reference with its metadata hash or a `PROBE_RESULT_SYNTHETIC` reference without one. The reference carries data for independent verification at use. The handoff stays `BLOCKED`, with `SOURCE_RIGHTS_PENDING`, `MEDIA_FORMAT_NOT_VERIFIED`, `MEDIA_TIMEBASE_NOT_VERIFIED`, `SANDBOX_NOT_QUALIFIED` and `EXTRACTION_NOT_AUTHORIZED`. It specifies the current synthetic schema and size limit. A real probe requires its own independently reviewed result contract.

All returned restrictions set `probeExecutionAuthorized`, `realMediaVerified`, `sourceRightsVerified`, `clipsExtracted`, `narrationSyncVerified`, `rendered` and `productionEligible` to false. Owner claims, a metadata hash, forged sandbox success and M8 fake receipts have no promotion path.

## Verification

| Check | Result |
| --- | --- |
| New probe, sandbox and isolation tests | 93/93 PASS |
| M10-04A pure suites, M10-04B boundary suite and M10-03A/B boundary suites | 70/70 PASS |
| M6 Highlights foundation and M7 Timeline foundation/boundary suites | 186/186 PASS |
| Final distinct leaf cases | 349/349 PASS, zero skips, cancellations or failures |
| `pnpm lint` | PASS |
| `pnpm exec tsc --noEmit --incremental false` | PASS |
| `pnpm exec next build --webpack` | PASS, 12 static pages and build traces completed |
| Fresh production isolation audits | 13/13 PASS |
| New audit coverage | Six isolated modules, ten transitive runtime files, 385 external sources, 217 built JavaScript files |
| New audit findings | Zero production references, forbidden edges or server actions |
| Final source inventory, hashes, secrets and whitespace | PASS |

The first setup attempt could not reuse the prior temporary verification preload because it was absent. A fresh temporary preload passed its configuration-read and network-denial self-checks. All final tests, lint, TypeScript, build and audits passed on their first execution. The three test runs select disjoint files with 349 test executions and zero rerun overlap.

Verification used Node 26.12.0, Next.js 16.3.6, an empty inherited environment except explicit tool settings, telemetry disabled and an unreachable application datasource at `127.0.0.1:1/storyline_unreachable`. The verification preload blocks dotenv/npmrc reads and Node socket, HTTP, HTTPS and fetch dispatch before I/O. Compiler subprocess permission was used for the guarded Webpack build.

Node test runner arguments were `--conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1`. The selected groups were the three new test files, M10-04A planner/compatibility/boundaries, M10-04B boundaries, both narration boundary files, M6 Highlights foundation and M7 Timeline foundation/boundaries. The separate host check ran `node --conditions=react-server --import tsx tests/storyline/media-probe-offline/host-readiness.ts` under the same guard.

Fresh audits ran for media-probe-offline, video-source-intake, video-highlights-offline, narration-private-store, narration-intake, tts-evaluation, render-execution-fake, maintenance-fake, render-planning, highlights-studio, timeline, timeline-persistence and timeline-studio. Ignored verification receipts are under `coverage/m10-04c-20261106/`.

**NOT_RUN** real video or Sample 01 access, FFmpeg/FFprobe or any media subprocess, decoder/probe/encoder/extraction/rendering, live provider/account/TTS, PostgreSQL/Redis/workers/migrations, M10-04B filesystem inspection suites, M10-03 file/store runtime suites, M8 runtime execution/recovery, original M4 timing tests, UI/browser and broader server suites, deployment and push.

## Exact inventory

Thirteen new files and one modified test audit. This report is `docs/STORYLINE_M10_04C_MEDIA_PROBE_FOUNDATION.md`. The remaining owned files are below. Only the last row is an existing file.

| File | SHA-256 |
| --- | --- |
| `lib/storyline/media-probe-offline/contracts.ts` | `e1dbd86fd8c8b28bfb3f637c43395849a012e0c5afc36618ecdea3945db71297` |
| `lib/storyline/media-probe-offline/handoff.ts` | `23565c4a624050d1117b414a846c59cad20f232d048f8d13a74a10be8cfd8efe` |
| `lib/storyline/media-probe-offline/index.ts` | `fab3ad49373a78a991b3831dd1f24deb0e2b29785b1b072d7edaa90055aa2d89` |
| `lib/storyline/media-probe-offline/probe-result.ts` | `05f4af8e57521097deb9e3c02aefabdb4c8d476a9687bafd66ab0a1c8fcb0dff` |
| `lib/storyline/media-probe-offline/sandbox.ts` | `db9dbd2125af103d2b755487b99bd56c7f05f54d4fc243450e56dac8dbc660c8` |
| `lib/storyline/media-probe-offline/timestamps.ts` | `7e9af05ff0d4230b79938b5bf6d1702c9fdcab46ab21018b7fd3d80345c624fc` |
| `tests/storyline/media-probe-offline/boundaries.test.ts` | `e7aa207efab049c323d06d065535d07f3a4d38d85e28131f03f1c1347ae47c53` |
| `tests/storyline/media-probe-offline/fixtures.ts` | `c4e3dd5994e0245c5a4e5b00368f8b1f37bd62bde8ebd313817409399ae5fd56` |
| `tests/storyline/media-probe-offline/host-readiness.ts` | `03dad5c31339317cad31ebb8b45eba875bdb501a9d864be41a9624404d271d3d` |
| `tests/storyline/media-probe-offline/probe.test.ts` | `65ad13ac435d86348342422a5c074af72e3a0729a8cbea6aa79a1eeffb34e835` |
| `tests/storyline/media-probe-offline/production-audit.mjs` | `e506643ed8ef8ffa3dd5874a1d28bd3c83170b5615c72ded21b0dc43d9c138a6` |
| `tests/storyline/media-probe-offline/sandbox.test.ts` | `b1c6c5830fe32f0edb16244276f21c1e7540256b92c72dfe9d8f9566c2b5ebd8` |
| `tests/storyline/video-highlights-offline/production-audit.mjs` | `2ef31e6d726e32a80988b2401b68d7b1c673d300f0a9b670e9edc48fd58dc65b` |

## Gates for a separately approved pilot

A real-media pilot needs explicit scope and independently reviewed rights/usage evidence, a current authorized source whose exact SHA-256 and count are reverified around use, and a qualified runner bound to the pinned executable and its trusted runtime dependencies. Qualification must demonstrate namespace isolation, non-root/capability enforcement, mount and syscall restrictions, network/protocol denial, CPU/memory/PID/wall-time controls, bounded pipe capture and descendant cleanup on the target host.

Independent media verification must establish container, codec and stream topology, exact duration and timebase, PTS/DTS and frame timestamp behavior including VFR and missing evidence. Accurate cuts, narration synchronization, extraction, publication and rendering each require separate evidence and authority.

OpenRouter policy remains OPENROUTER_ONLY with `google/gemini-3.8-flash-tts` and Kore. Formal M10-02B live admission is BLOCKED. The M4 expiry source matches SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. All sixteen controls and the original 700 ms positive deadline are preserved. The historical timing incident remains unresolved.

**Offline foundation PASS. SANDBOX_NOT_QUALIFIED. Source rights, real media verification, extraction, MP4 rendering and production admission remain blocked.**
