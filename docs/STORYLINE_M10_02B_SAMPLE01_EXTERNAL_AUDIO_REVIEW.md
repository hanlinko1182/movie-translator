# M10-02B Sample 01 — External audio integrity review

Review date: **2026-11-06, Asia/Bangkok**. Scope: **OFFLINE / READ_ONLY / EXISTING_OWNER_SUPPLIED_WAV**.

**AUDIO_CONTAINER_INTEGRITY_PASS.** The supplied file matches the expected SHA-256 and all expected format, size, frame-count and duration properties. All PCM frames were readable; no malformed or unexpected chunks, incomplete frames or exact full-scale sample hits were found.

**Script coverage: NOT_VERIFIED. Listening: LISTENING_REVIEW_PENDING. Overall audio-quality acceptance: NOT_ESTABLISHED.** No pronunciation, intelligibility, pacing or human-listening finding is made. Account verification, formal live-trial acceptance and production TTS readiness remain blocked.

## 1. Baseline and exact source scope

Verified `main` at required HEAD **`65e8c6ac382e24e037cdc682aa5d56e58fec5f41`**, with accepted Gate 1, Gate 0 and OpenRouter-only amendment ancestry. Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), the [Gemini-primary amendment](STORYLINE_M10_02B_GEMINI_PRIMARY_AMENDMENT.md), [Gate 1](STORYLINE_M10_02B_GATE1_ACCOUNT_VERIFICATION.md), [Gate 0](STORYLINE_M10_02B_GATE0_ADMISSION_REVIEW.md) and [M10-02A](STORYLINE_M10_02A_MYANMAR_TTS_PROVIDER_READINESS.md).

Initial tracked index/worktree were clean, with **698 tracked files**. The complete initial Git status was **not clean**: its sole entry was `?? tests/1111.wav`, the operator-specified input, not an unexpected source change. No other staged, modified or nonignored untracked path was present. This explicit input exception is recorded rather than reported as a clean full tree.

The operator supplied the absolute workstation path resolving to `tests/1111.wav` under the project root. Only this exact regular, nonsymlink file was opened. No alternate copy was substituted. Expected size and SHA-256 were checked before RIFF/PCM analysis; device/inode/size/mtime/ctime checks around the bounded descriptor read indicated stable source identity. No file content was modified, re-encoded, replaced, copied, played, uploaded or published.

**Outside-repository storage requirement: UNMET.** The operator placed the WAV inside the working directory. The subsequent operator instruction explicitly authorized proceeding with offline WAV integrity analysis only. The file was left unchanged and untracked; no relocation was performed under this read-only scope. It must be relocated by the owner, or under separate explicit relocation authorization, to satisfy the outside-repository storage requirement. Only this public-safe report may be staged; the WAV must never be included in Git. A report commit does not resolve the storage limitation.

## 2. Provenance and identity classes

| Claim | Evidence class / finding |
| --- | --- |
| Gateway: OpenRouter Website | OWNER_REPORTED; no independently authenticated generation receipt. |
| Model: `google/gemini-3.8-flash-tts` | OWNER_REPORTED; not inferred from the waveform or WAV header. |
| Voice: `Kore` | OWNER_REPORTED; no voice identification or receipt verification performed. |
| Language: Myanmar | OWNER_REPORTED; no listening or transcription performed. |
| Supplied filename | Operator-specified `1111.wav`; filenames do not prove origin. |
| File hash, container and numeric measurements | Independently measured locally for this exact supplied file. |
| Originally submitted text | Operator explicitly confirmed UNAVAILABLE / NOT VERIFIED. The earlier demonstration script is not a verified request payload. |

Matching an expected local file is not ACCOUNT_VERIFICATION_PASS. No provider model/voice receipt, original request identity, account setting or native response byte record was examined.

## 3. Expected versus actual properties

| Property | Expected comparison evidence | Independently observed | Result |
| --- | --- | --- | --- |
| Container | RIFF/WAVE | Little-endian RIFF/WAVE | MATCH |
| Encoding | Signed 16-bit PCM | PCM format tag 1; signed 16-bit little-endian | MATCH |
| Channels | Mono | 1 | MATCH |
| Sample rate | 24,000 Hz | 24,000 Hz | MATCH |
| Sample frames | 707,520 | 707,520 decoded mono PCM frames | MATCH |
| Duration | 29.48 s | `707520 / 24000 = 737/25` s = **29.48 s** | MATCH |
| File bytes | 1,415,084 | 1,415,084 | MATCH |
| SHA-256 | `419539385af0a7327a2a1ae852ae36d5eb7907ff751793cb29d573a6a7a78a36` | `419539385af0a7327a2a1ae852ae36d5eb7907ff751793cb29d573a6a7a78a36` | MATCH |

These are measurements of the supplied owner-downloaded WAV, not of an independently captured OpenRouter API response.

### RIFF structure and readable frame coverage

| Structure | Offset / size | Finding |
| --- | --- | --- |
| RIFF header | Starts at byte 0; declared payload 1,415,076 bytes | Declared RIFF size + 8 equals exact file size. |
| `fmt ` chunk | Header at byte 12; payload 16 bytes | Exactly one standard PCM format chunk, before data; no extension. |
| `data` chunk | Header at byte 36; payload 1,415,040 bytes | Exactly one complete data chunk. |
| PCM consistency | Block align 2 bytes; byte rate 48,000 | Matches mono × 16 bits and 24,000 frames/s. |
| Frame coverage | `1415040 / 2 = 707520` | Declared data-derived count equals actual unpacked count. Zero partial-frame bytes. |
| End-of-file coverage | All chunks parsed through exact EOF | No unexplained trailing bytes, missing padding, truncated payload or incomplete chunk header. |
| Unexpected chunks / corruption | None detected | Only `fmt ` and `data`; no ancillary metadata payload was inspected or published. |

The frame count is derived from the declared PCM data size and checked against unpacked sample values; ordinary PCM WAV has no separate mandatory frame-count field. No compressed-audio decoder was needed.

## 4. Signal measurements and their limits

Measurements include the entire file, including quiet periods. Full-scale normalization uses 32,768, with `dBFS = 20 × log10(amplitude / 32768)`.

| Metric | Actual result |
| --- | --- |
| Minimum / maximum signed sample | −26,428 / +28,329 |
| Peak absolute amplitude | 28,329; normalized 0.86453247 |
| Peak level | **−1.264374 dBFS** |
| Whole-file RMS amplitude | 4,831.502133 sample units; normalized 0.14744574 |
| Whole-file RMS level | **−16.627355 dBFS** |
| DC mean | −10.382142 sample units |
| Positive full-scale samples (`+32767`) | **0** |
| Negative full-scale samples (`−32768`) | **0** |
| Longest same-sign full-scale run | **0 frames** |

There are no exact digital-rail sample hits. This does not rule out upstream limiting, clipping below the rails, distortion or other audible defects. Peak/RMS are not a loudness-standard measurement, pronunciation assessment, naturalness score or listening acceptance.

### Silence indicators

The threshold is an explicitly chosen measurement policy, not a speech-detection or quality criterion: absolute sample amplitude ≤32, approximately **−60.206 dBFS**. Windowed indicators use 240-frame / 10-ms RMS windows at the same threshold, anchored at the start of the file.

| Indicator | Frames | Time |
| --- | --- | --- |
| Leading exact-zero run | 107 | 0.004458 s |
| Trailing exact-zero run | 0 | 0 s |
| Leading consecutive absolute amplitude ≤32 | 276 | 0.011500 s |
| Trailing consecutive absolute amplitude ≤32 | 4,348 | 0.181167 s |
| Leading quiet RMS windows | 240 | 0.010000 s |
| Trailing quiet RMS windows | 6,480 | 0.270000 s |
| Total quiet RMS windows, including internal windows | 123,840 | 5.160000 s |
| Longest contiguous quiet RMS interval | 18,960 | 0.790000 s, starting at frame 140,880 / 5.870000 s |

Thresholded quiet time may include pauses, breaths, low-level speech or noise. It does not establish sentence boundaries, omissions, truncated words or whether pacing sounds appropriate. A zero-length trailing exact-zero run is compatible with a low-amplitude ending; no audible conclusion follows from it.

## 5. Native-response identity limitation

The artifact is a WAV container with a 44-byte header/chunk framing before its PCM payload. The active mock selection remains full Gemini / Kore / gateway PCM. This owner-downloaded WAV must not be represented as the original raw PCM API response or as evidence that the gateway returned WAV natively.

No original provider response capture, raw-response SHA-256, generation receipt, wrapping/conversion history or byte-for-byte native response comparison is available. The measured WAV hash binds only this file. Its PCM payload, even if readable, cannot independently establish which service/model/voice generated it, what exact text was submitted, what it cost or whether any conversion occurred.

## 6. Exact script and independent listening review

The operator explicitly confirmed that the original submitted text is unavailable/unverified, no independent listener reviews have been provided, and no reconstruction from the audio is permitted. Accordingly:

- Original TTS input: **UNAVAILABLE**.
- Script coverage and sentence completeness: **NOT_VERIFIED**.
- Myanmar pronunciation / proper names / semantic accuracy: **NOT_VERIFIED**.
- Independent listener records: **NOT PROVIDED**.
- Listening evaluation: **LISTENING_REVIEW_PENDING**.

No transcript, inferred script, listening score or human-review result was created. The earlier demonstration corpus is not substituted as the exact request text and is not copied into this report.

### Required human-review rubric — not performed

Two independent qualified Myanmar listeners must record observations separately before seeing each other's findings or reconciling them. Use the exact supplied-file hash and, if later recovered, the exact owner-confirmed original input. Record reviewer qualification privately, review time, time offsets and concrete observations; do not publish personal identifiers or private transcript/audio. The following is an uncompleted rubric, not evidence of completed review.

| Area | Independent observations required from each listener | Current status |
| --- | --- | --- |
| Complete sentence coverage | Compare every sentence and ending with the exact original input; note omissions/additions. Impossible to verify without that text. | NOT_VERIFIED |
| Myanmar pronunciation | Identify specific mispronunciations against the exact text and intended reading. | PENDING |
| Proper names | Check each intended spelling/pronunciation consistently; never assume the demonstration names were submitted. | PENDING |
| Numbers and dates | Check all intended numbers, dates, quantities and spoken forms. | PENDING |
| Negation / meaning | Verify negatives, uncertainty and qualifiers without strengthening or reversing meaning. | PENDING |
| Pacing / pauses | Record unnatural speed, stress, pauses or cut endings with offsets. | PENDING |
| Emotional narration | Record inappropriate emphasis/emotion against the intended content. | PENDING |
| Intelligibility | Identify unclear or unintelligible portions and their offsets. | PENDING |
| Silence / clipping / distortion | Listen for unwanted silence, clicks, saturation, artifacts or missing sound; numeric indicators alone do not decide this. | PENDING |
| Final reconciliation | Preserve both original independent records and unresolved disagreements; no automatic acceptance or regeneration. | PENDING |

Without exact input, listeners could supply limited listening observations under separate review, but they cannot establish complete script coverage. No listener availability or acceptance is presumed. No additional TTS request, ASR, decoder or regeneration is authorized to fill these gaps.

## 7. Provider, account and trial evidence remains separate

| Item | Status |
| --- | --- |
| OpenRouter generation ID | UNKNOWN; no authenticated lookup. |
| Exact model / voice receipt | OWNER_REPORTED only. |
| Actual cost / billing receipt | UNKNOWN. |
| Account entitlement and restricted inspection | NOT_VERIFIED / prior ACCOUNT_ACCESS_BLOCKED unresolved. |
| Privacy / routing acceptance | PENDING. |
| Durable live request ownership | NOT_IMPLEMENTED. |
| Formal live-trial authorization | NOT_ISSUED. |
| Human approval / SOURCE_VERIFIED | NOT_ISSUED. |
| Production TTS readiness | BLOCKED. |

An existing owner-supplied artifact does not retroactively approve a formal trial. Required account/voice evidence, current privacy/routing acceptance, independently bounded output-token charges and fees, provider-enforced limits, durable original-request ownership and explicit owner spending authorization remain unresolved. No key was requested; no account setting, secret, provider endpoint or budget was accessed or changed.

## 8. Executed checks, preservation and NOT RUN

Audio inspection used a reviewed inline **Python 3 standard-library parser** (`os`, `stat`, `struct`, `hashlib`, `array`, `math`, `fractions`, `json`). It opens one regular file read-only with no-follow/nonblocking/close-on-exec flags, bounds capture to the exact expected size plus a one-byte growth check, verifies SHA-256 before parsing, validates RIFF/chunk bounds and standard PCM fields, unpacks every signed little-endian sample, and computes the measurements above. File-stat stability is an observation around the read, not an exclusive lock or guarantee against all concurrent modification.

The command was `env -i PATH="$PATH" python3 -` with the reviewed parser supplied on standard input and the operator's exact path fixed in the invocation. No parser module, audio copy or private evidence file was written. Numeric/hash results remained in tool memory until this public-safe summary. No network import, subprocess, shell command derived from media, third-party package, FFmpeg or FFprobe was used.

Only this report is owned by the milestone. The existing untracked WAV is preserved and excluded from staging. Fresh static checks:

| Check | Result |
| --- | --- |
| Branch / exact HEAD / accepted ancestry | PASS; required `main` baseline and three prior accepted ancestor commits verified. |
| Initial path / Git scope | PASS with disclosed input exception: tracked tree clean; sole existing untracked input `tests/1111.wav`. No symlink or alternate input used. Full initial tree was not clean. |
| Expected identity and audio structure | PASS; one bounded full-file integrity/PCM analysis, matching SHA-256, 707,520 frames and exact 29.48-s duration. This is an audio inspection, not a server/component regression suite. |
| Existing tracked sources | PASS; all **698 baseline tracked files** matched their entry SHA-256 values, including prior reports, mock contracts and M4 controls. |
| Local documentation links | PASS; **six references / six distinct existing Markdown targets**. No external URL or audio link/embed in the report. |
| Public-safe content / secrets | PASS; zero matches for reviewed credential/private-key, private identifier or email patterns; no transcript, raw audio or confidential account evidence included. Pattern checks are not a universal secret detector. |
| Whitespace / Markdown | PASS; final newline, trailing whitespace, table structure, `git diff --check` and `git diff --cached --check`. Custom checks cover the initially untracked report. |
| Input preservation | PASS; a second bounded read-only hash pass matched the same 1,415,084-byte source and expected SHA-256, with stable stat identity around that read. No second PCM analysis or listening occurred. |
| Exact staging | Explicit-path report-only staging and staged-byte equality are checked before the optional local commit. The existing WAV is untracked and excluded. |

Executed command classes were read-only Git branch/HEAD/status/log/ancestry and inventory checks; `cat` of the supplied instructions and required Markdown files; inline `python3 -` baseline/path/source-hash and report/secret/link/inventory checks; the isolated `env -i PATH="$PATH" python3 -` PCM analysis; and both Git whitespace checks. Final source preservation uses a separate bounded read-only hash pass, not another decode or listening session. No private evidence files or executable runtime modules are created. The optional Git mutation is limited to explicit-path report staging and a local report-only commit.

The M10-02A mock contracts remain unchanged, including `liveEligible:false` and `audioVerified:false`: the external container finding does not promote a mock receipt or alter those flags. OPENROUTER_ONLY, full Gemini/Kore/PCM selection, no retry/fallback and no production sender are preserved. M8 fake-only isolation and original M4 expiry controls remain unchanged. The M4 expiry source SHA-256 remains `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`, preserving the sixteen controls and original 700-ms positive deadline. The historical timing incident remains **UNRESOLVED**; no deadline was weakened or retested.

**NOT RUN:** human or model listening, transcription/ASR, script reconstruction, pronunciation/coverage scoring, external audio decoders, FFmpeg/FFprobe, new synthesis, provider/account requests, paid work, M5–M8/runtime/browser/database suites, lint, TypeScript, build, migrations, workers, deployment or push. No application source changed. No historical test PASS counts are claimed as fresh evidence.

## 9. Final decision

**AUDIO_CONTAINER_INTEGRITY_PASS** applies only to the identity, RIFF/PCM structure and measurable signal facts of this exact supplied WAV at inspection. No container corruption or incomplete PCM evidence was detected.

**Script/listening acceptance remains incomplete, and the outside-repository storage requirement remains unmet.** This finding is not ACCOUNT_VERIFICATION_PASS, FORMAL_M10_02B_LIVE_PASS or PRODUCTION_TTS_READY. Provider provenance remains OWNER_REPORTED, costs unknown, and formal live evaluation BLOCKED. Stop after Sample 01; no new paid request, media integration or production activation is authorized.
