# M5-02 — Fake audio byte verification and immutable chunk coverage

## Scope and baseline

Date: 2026-10-18 (Asia/Bangkok). **M5-02 PASS — fake-only audio byte integrity and complete chunk coverage.** All required checks passed. This is not real TTS, human approval, durable artifact storage or production readiness.

Entry branch `recovery/m9-studio`, HEAD `a88e292e32a801772270a8adda1b2fcdc8471140`; working tree and index were clean. Read AGENTS/CLAUDE, the M5-01 report, M9 final acceptance, M5 voice handoff, actual M5-01 exports, disabled M5 v1, M4/R4 identities and M2 checkpoint/UNKNOWN rules. Installed Next.js data-security guidance was read before implementation. Existing source/contracts/tests/reports remain unchanged; no packages are installed.

This milestone adds pure server-only validation under `lib/storyline/voice/audio-verification/`. It performs no I/O, provider request, speech synthesis, media subprocess, concatenation, audio persistence, database access, approval, spending or publication. No new module enters an application route, Server Action, worker, component or existing barrel. The original fake adapter remains isolated and its metadata remains `UNVERIFIED_FIXTURE` with null duration.

## Contracts and exact domains

| Contract / hash | Meaning |
| --- | --- |
| `story-synthetic-pcm-measurement-v1` | Actual RIFF/PCM byte measurement; validator `STRICT_RIFF_PCM16_MONO_V1`, exact SHA-256, file/data sizes and offset, sample count/format and integer duration. |
| `story-synthetic-audio-verification-v1` | Receipt payload and canonical hash domain. Envelope `{receipt, receiptHash}`. |
| `story-synthetic-audio-collection-v1` | Complete collection manifest and canonical hash domain. Envelope `{manifest, manifestHash}`. |
| `PCM_DURATION_US_NEAREST_TIES_UP_V1` | Integer microsecond duration policy. Exact sample count/rate remain authoritative. |
| Audio SHA-256 | Plain SHA-256 of the complete captured WAV file, including RIFF/chunk headers, permitted padding and PCM data; distinct from every JSON/text/plan hash. |

Canonical hashes use the existing `SHA256(domain + "\n" + canonicalJson(payload))`. No prior schema/hash domain is changed or reused with altered semantics. M5-01 `story-voice-chunk-plan-v1`, `story-voice-fake-request-v2`, `story-voice-fake-recipe-v1`, `story-voice-synthetic-audio-artifact-v2`, M4 `story-narration-draft-v1`, R4 `story-edited-narration-v1` and disabled M5 v1 retain their exact behavior.

Receipt payloads bind the replay-validated full M5-01 plan hash; complete narration reference with original/edited identity, domains and parent lineage; exact scope/source/candidate/M2 analysis provenance; synthetic voice/profile/capability; full section/chunk index, count, offsets, exact text and text hash; fake request/submission/recipe IDs and hashes; original unverified artifact ID/metadata hash; and independently derived audio measurement. Current receipts support M4 or R4 references. Unresolved `FUTURE_APPROVED_REFERENCE` plans reject, rather than treating an approval-shaped reference as a reviewed immutable artifact.

Every receipt/manifest is `execution: FAKE_ONLY`, `evidence: SYNTHETIC_BYTE_INTEGRITY_ONLY`, `speech: NOT_VERIFIED` and retains the unchanged permanent restrictions: no human approval, no SOURCE_VERIFIED, no real TTS eligibility, no publication eligibility, no spending authority, synthetic ancestry true. Audio validation cannot repair provisional or synthetic narration ancestry.

## Strict supported WAV profile

`verifySyntheticPcmWav(bytes)` captures only actual non-shared `Uint8Array` or Node Buffer storage. Intrinsic element-type/byte-length/buffer getters and typed-array copying avoid caller getters/iterators and shared-memory races. A forged prototype cannot convert a different internal element type into accepted bytes. It bounds size before copying and parses a private snapshot; no caller buffer is retained. Proxies, other typed arrays, DataViews, shared storage, detached/empty storage and arbitrary JSON reject.

Accepted layout is deliberately narrower than general WAV:

1. Exact `RIFF` and `WAVE` tags, little-endian 32-bit container size equal to the actual file length minus eight.
2. One `fmt ` chunk, first at offset 12, exactly 16 bytes; integer PCM codec 1, mono, 16-bit little-endian, exactly 24,000 or 48,000 Hz. Block alignment must be 2 and byte rate must be sample rate × 2.
3. Optionally one `JUNK` chunk between format and data, payload 0–1,024 bytes. Odd payloads require one present **zero** pad byte. Its payload/padding remain covered by the complete-file audio hash. Nonzero padding is outside this strict profile and rejects.
4. Exactly one final `data` chunk, nonempty and even-length, containing complete two-byte samples. Its padded endpoint must equal the actual file end.

No other chunks, formats, extension bytes, compressed/float/extensible codecs, nested layouts, duplicate critical chunks, reordered format/data, duplicate JUNK, data after data, unknown metadata, trailing bytes or partial chunk headers are accepted. Unsupported valid WAV variants reject explicitly rather than being guessed. All lengths are checked against the bounded actual file before offsets are read; declared sizes never allocate storage. Maximum file size is **4 MiB inclusive**, including headers/padding. Smallest accepted canonical file is 46 bytes (one sample). Collection audio budget is **16 MiB inclusive**, counting each chunk artifact even when byte buffers/hashes are identical. Receipt JSON is bounded to 64 KiB and collection JSON to 2 MiB; M5-01 retains its 1 MiB plan and 720-chunk ceiling.

All 16-bit patterns are valid integer PCM sample values. Structural validation can establish exact sample count/format without claiming speech semantics or detecting an originally intended signal. A changed valid sample changes the actual file hash and fails an old receipt or captured metadata binding. Replacing both bytes and all self-consistent captured claims is a different integrity statement, not authenticated proof of the old submission.

## Measured duration policy

For nonempty validated mono PCM16:

```text
sampleCount = dataBytes / 2
durationUs = floor((sampleCount * 1,000,000 + sampleRateHz / 2) / sampleRateHz)
```

The implementation uses BigInt intermediate arithmetic and returns only bounded safe integer JSON numbers. This is nearest integer microseconds with exact ties rounded upward. At 24 kHz, one/two/three samples yield 42/83/125 µs. At 48 kHz, three samples yield exactly 62.5 µs before rounding and **63 µs** afterward. Sample count and rate preserve the exact rational duration; rounded microseconds never become input to later duration measurement. Collection duration is rounded once from the sum of exact sample counts, not the sum of rounded per-chunk durations.

No caller duration, WAV duration claim, text estimate, elapsed request time, metadata header claim or fake adapter measurement is trusted. Every byte measurement derives format from a fully accepted structure and sample count from the actual validated PCM region. No timestamp, decoder/probe result or provider pronunciation assertion is fabricated. The legacy two-sample silent fake fixture measures **83 µs**, and remains silent synthetic test data. Its original null/unverified metadata is not mutated.

## Receipt integration and trust boundary

Public exports:

```ts
const verified = verifyFakeVoiceOutput({ plan, chunkIndex, output });
const replay = parseSyntheticAudioReceipt(verified, {
  plan, chunkIndex, bytes: output.bytes,
});
const collection = verifySyntheticAudioCollection({
  plan, items: [{ receipt: verified, bytes: output.bytes }, /* all other chunks */],
});
const collectionReplay = parseSyntheticAudioCollection(collection, {
  plan, items,
});
```

`verifyFakeVoiceOutput` checks the explicit `{result, bytes}` shape and requires `FIXTURE_BYTES` before accepting audio. It independently parses bytes, replays the complete M5-01 plan, recomputes request/recipe identities and reconstructs the unchanged unverified source metadata from the exact plan and measured file hash/size. The entire captured fake result must match, including its metadata hash, null measurement, IDs, source/profile linkage and permanent restrictions. Merely claiming a duration or updating a metadata hash cannot rescue malformed WAV bytes.

The independent WAV parser supports 24/48 kHz, while the unchanged M5-01 fake capability declares **24 kHz only**. Integration/receipts require actual measured rate to match that capability; a 48 kHz file cannot masquerade as its 24 kHz output. There is no new 48 kHz provider/adapter/capability registry entry. Such integration would require a separately versioned plan/capability change.

`parseSyntheticAudioReceipt` is a strict **context-and-bytes replay parser**, not a hash-only JSON parser. It requires the expected plan, expected chunk index and actual bytes, then recreates every payload field and compares the complete canonical envelope. Altered metadata, unknown fields, wrong domains/provenance, wrong IDs, changed chunk text/order, unsafe numeric claims and even rehashed forged metadata reject. Parsed references, receipts, measurements and manifests are deeply frozen. Raw audio bytes are neither returned by verification nor stored in metadata; mutating an input later cannot alter a receipt, and replay with changed bytes rejects.

These are unsigned pure integrity receipts. They establish consistency and successful validation of the **captured** bytes under the stated policy. They do not authenticate historical adapter execution, prove a durable submission exists, authenticate a caller, prove Myanmar speech, establish current source truth or approve narration. A caller can reproduce public hashes over a new self-consistent capture; it cannot use them as production authority. There is no HMAC/key, new authentication shortcut, public endpoint, authority issuer or receipt persistence. Existing M5-01 private adapter registration remains unchanged and is never inferred from serialized result JSON.

UNKNOWN and definitive failure reject even if a caller appends valid audio bytes. The verifier has no adapter reference, submission callback, retry API or permit factory and cannot send or recover anything. Existing fake idempotency remains sticky across duplicate keys, fresh keys and harnesses sharing the same registered adapter. It remains process-memory simulation, not durable crash recovery or exactly-once spending. No M2 acknowledged-checkpoint, one-use permit or UNKNOWN rule is modified.

## Complete chunk coverage

The collection validator requires exactly the plan's chunk count of `{receipt, bytes}` items. Every receipt and its actual bytes are independently replayed against that exact plan/index. Duplicate indices, holes, foreign plans/scopes/narration/source/candidate/profile linkage, missing/failed/UNKNOWN chunks and mismatched audio/receipt hashes reject. It reads only captured data properties and invokes no caller array methods/getters.

Input arrival order may vary; output entries always follow canonical global plan order, retaining each full chunk, receipt hash, audio hash, byte count, sample count and measured duration. The manifest binds full narration/voice provenance and exact total file/data/sample counts. At the current fixed 24 kHz integration rate it derives total duration from sample count once. Byte-budget overflow rejects the proposed collection; no partial manifest is returned. The collection parser likewise requires all items/actual bytes, recreates the manifest, and rejects rehashed changed totals, entries, order or eligibility. No WAV containers are concatenated and no final audio track, storage locator or download capability is produced.

## Verification commands and actual results

Fresh logs: `/tmp/movie-translator-m5-02-lum8PE/`. Timed PostgreSQL/server suites run serially without competing test/build/browser loads. Only newly owned disposable PostgreSQL is used by unchanged regressions, with the application datasource explicitly unreachable. M5-02 and M5-01 tests use no database or external network. No existing expiry control, deadline or assertion is relaxed.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/audio-verification/*.test.ts tests/storyline/voice-foundation/*.test.ts \
  tests/storyline/voice-handoff.test.ts
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
python3 /tmp/movie-translator-m5-02-lum8PE/audit-production.py
git diff --check
git diff --cached --check
```

| Check | Actual completed result |
| --- | --- |
| New M5-02 + retained M5-01/v1 | **134/134 PASS**: 62 new audio cases, 64 unchanged M5-01 cases and 8 unchanged disabled v1 cases; zero failures/skips; 12.498 s (`focused-complete.log`). |
| R4/M9 acceptance/security/disposable PostgreSQL | **119/119 PASS**, zero failures/skips; 78.330 s (`r4-m9.log`). No existing R4/M9 code changed. |
| Applicable M1–M4/disabled M5/legacy server | **842/842 PASS**, zero failures/skips; 358.729 s (`server-regressions.log`). All 16 unchanged M4 expiry controls passed, including the historically failing pre-expiry send control; no recurrence in this run. The 8 disabled v1 tests also occur here, so counts overlap and must not be added as distinct tests. |
| Six relevant component suites | **43/43 PASS**, zero failures/skips; 2.090 s (`components.log`). |
| Four Chromium suites | **4/4 PASS**, zero failures/skips; 45.649 s (`chromium.log`). Legacy Recap, six Studio destinations, recovered evidence/local editing and disposable save/read/history at **1440/1024/390 px**. No browser errors, rejected external requests, production API or provider calls. |
| Lint / TypeScript / dummy Webpack | **PASS / PASS / PASS**, each exit 0 (`lint-final.log`, post-build `typescript-complete.log`, `webpack-build.log`). Next.js 16.3.6 completed compilation, type checks, 12 static pages and traces using the unreachable dummy datasource. |
| Production import/bundle/action audit | **PASS** (`production-audit.log`): all 71 freshly built client JS chunks scanned against 31 private/fake/database markers and credential patterns, zero matches. Four source roots audited; three Storyline routes retain disabled dependency construction; zero registered Server Actions or production test adapters. |
| Working/staged diff, exact file and secret review | **PASS**: whitespace, staged/working byte equality and credential-pattern checks; exactly ten new owned paths, zero existing modifications or unexpected files (`prestage-audit.json`, `staged-audit.json`). |

Initial diagnostics are preserved: initial WAV **27/27** and full new audio **61/61** passed; a combined M5-02/M5-01/v1 run passed **133/133**. Initial TypeScript identified BigInt literal syntax incompatible with the existing compiler target and a nullable-format narrowing issue; these were corrected using BigInt constructors and an explicit rejecting return, without changing tsconfig. A later lint check caught the reserved test variable name `module`; it was renamed `transport`. Review added an intrinsic element-type guard against disguised wider typed arrays and a negative case for misaligned samples with otherwise valid container bounds/padding. Final **134/134**, lint and post-build TypeScript passed after these corrections. No old test, assertion or deadline changed. Historical expiry scheduling risk is retained; a passing unchanged suite does not establish its historical root cause or certify production timing.

Chromium artifacts remain at `/tmp/recap-recovery-browser-fta9oH`, `/tmp/storyline-m9-save-browser-cILcnQ`, `/tmp/recap-studio-navigation-MOn3id` and `/tmp/storyline-m9-recovery-browser-eRSkAI`. The milestone-owned production audit script is retained with the logs. New runtime graph/source checks and the fresh bundle audit independently verify that no audio-verification path is exposed. Zero M5 external network/provider/paid calls were made; existing regressions used isolated localhost fixtures and owned disposable PostgreSQL only.

Coverage includes 24/48 kHz fixtures, exact hashes/sample counts and rounding ties; JUNK ordering/padding; oversized/truncated/unknown/duplicate/ambiguous chunks; wrong codec/channel/rate/bits/alignment/byte rate; malformed byte storage; actual sample corruption; forged duration/metadata even with recomputed hashes; M4/R4 separation and lineage; source/candidate/voice/profile/scope mixing; reordered valid inputs and canonical output; missing/duplicate/UNKNOWN/failed chunks; total-byte limits; immutable output; unchanged unverified adapter metadata; UNKNOWN no-resend; permanent fake restrictions; and a transitive runtime-import guard excluding database/provider/network/media/storage/worker code. Integration tests install fail-fast fetch/http/https/net/tls tripwires and assert zero network attempts.

## File inventory and M5-03 handoff

New files only:

- `lib/storyline/voice/audio-verification/contracts.ts`
- `lib/storyline/voice/audio-verification/wav.ts`
- `lib/storyline/voice/audio-verification/receipt.ts`
- `lib/storyline/voice/audio-verification/collection.ts`
- `tests/storyline/audio-verification/fixture.ts`
- `tests/storyline/audio-verification/wav.test.ts`
- `tests/storyline/audio-verification/receipt.test.ts`
- `tests/storyline/audio-verification/collection.test.ts`
- `tests/storyline/audio-verification/boundary.test.ts`
- `docs/STORYLINE_M5_02_AUDIO_VERIFICATION.md`

No existing M5-01/v1, M1–M4, M9, UI, schema, environment, lockfile or dependency file is modified. Existing logs and files are preserved. After all checks pass, stage only these explicit paths and create the requested local commit; report its resulting hash and final tree status. No push.

**M5-03 readiness: READY for separately authorized fake-only work.** The proposed scope is a stronger artifact ownership/replay interface: bind separately captured expected plan/receipt/byte identities to an in-memory private artifact boundary, exercise mutation/tampering/late-result ownership and define any future storage receipt protocol before persistence. It should retain exact sample provenance, UNKNOWN no-resend and immutable coverage, and decide a reviewed durable validator/runtime policy. This report does not authorize durable storage, schemas, download endpoints, media processing, track assembly or providers. Any such phase needs explicit scope, operational ownership and security review.

Real voice/publication remains blocked by independently approved non-synthetic narration and reconciled claims/evidence; genuine authenticated scoped authorization; live source/approval currentness; verified provider/model/voice/Myanmar support; explicit cost consent and budget/permit/checkpoint ownership; durable private byte/receipt integrity and operational deadlines; and separate deployment approval. A measured silent fixture does not waive any gate. The historical M4 expiry-control scheduling risk remains a production blocker even when its unchanged regression passes. Stop after M5-02.
