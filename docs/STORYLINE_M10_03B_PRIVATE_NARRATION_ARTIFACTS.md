# M10-03B — Private narration artifact store

Date: **2026-11-06, Asia/Bangkok**. **Offline implementation acceptance: PASS.**

An isolated server-only store now imports synthetic WAVs into an explicitly selected private root, independently validates the stored copy, persists sealed immutable metadata, reopens read-only across a service-process restart and produces exact rational-duration previews. **All artifacts remain non-production-eligible. Formal M10-02B live admission remains BLOCKED.** No real sample or provider was accessed.

## 1. Baseline and compatibility

Entry branch `main`, exact HEAD `2a55f98512e361ecbb1a64a102b55738c15a155f`; index, worktree and nonignored untracked inventory clean. Upstream `origin/main` inspected without fetching. Log/ancestry includes the accepted M10-03A commit, its parent `fc629f4dc1a41b3d5443d897fa8464f1f31304c4` and prior Sample 01 audio-review commit.

Read AGENTS.md, CLAUDE.md, installed Next.js testing guidance and [M10-03A's implementation report](STORYLINE_M10_03A_NARRATION_AUDIO_INTAKE.md). Inspected actual intake exports/parser/registry/preview/private-reader and tests, M5 voice handoff contracts and M7 timeline contracts. M5 remains a disabled/synthetic handoff, M7 uses integer-millisecond synthetic placement, and neither grants genuine narration admission.

All six M10-03A runtime modules and their public contracts remain byte-for-byte unchanged. The new store reuses the accepted parser, local source authorizer, candidate registry and pure preview. No M5–M8 runtime or authority is imported; no existing hash domain is modified.

Of **712 baseline tracked files, 710 remain unchanged**. The two changes are narrowly justified test/audit exceptions: M10-03A's prior blanket prohibition on all library consumers must permit this explicitly authorized offline consumer. Each allowlist names exactly the three consuming files (`contracts.ts`, `files.ts`, `store.ts`), not a directory wildcard. All application/component/worker/script/barrel and bundle prohibitions remain; the new audit independently prohibits any production composition of this entire store.

## 2. Implemented APIs

Entry: [narration-private-store/index.ts](../lib/storyline/narration-private-store/index.ts).

| API | Behavior |
| --- | --- |
| `createPrivateNarrationStore(configuration)` | Creates only a new, exclusive private root; returns local import plus metadata/read/preview methods. Existing directories are never adopted or reformatted. |
| `openPrivateNarrationStore(configuration)` | Defaults to read-only. Exposes only `lookup`, `list`, `preview`; reconstructs local byte trust from disk, never from serialized candidate authority. |
| `openPrivateNarrationStore(configuration, "LOCAL_IMPORT")` | Explicit trusted-operator reopening with import capability; no application authentication or HTTP bootstrap. |
| `importWav(sourceAuthorization, ownerEvidence)` | Snapshots strict source/evidence inputs, invokes unchanged M10-03A authorization/measurement, rereads bounded source bytes and verifies exact identity, then imports under an exclusive writer lock. |
| `lookup(artifactId)` | Returns only immutable redacted metadata after manifest, local seal, commit identity, exact bytes, measurement and final response checks. |
| `list()` | Read-only verified metadata plus opaque IDs/statuses for uncommitted directories. Unexpected/corrupt committed entries fail the whole call; no partial successful response or automatic repair. |
| `preview(artifactId, claimedDuration?)` | Independently revalidates the artifact, creates a fresh process-local M10-03A candidate and invokes the accepted pure preview. |

Configuration has exactly `root`, `repositoryRoot`, `trust:TRUSTED_LOCAL_OPERATOR`. There is no default root, environment setting, browser input, application route, server action, raw-byte return, public URL or download/player API. The trust literal documents privileged local composition; it is **not** authentication or proof of owner consent. Real Sample 01 import requires separate explicit owner authorization/review.

New schema identifiers: `story-private-narration-owner-v1`, `story-private-narration-manifest-v1`, `story-private-narration-artifact-v1`, `story-private-narration-commit-v1`. Two new HMAC domains: `story-private-narration-manifest-mac-v1`, `story-private-narration-commit-mac-v1`. Canonical JSON uses the existing bounded canonical serializer without changing prior domains.

## 3. Storage layout and permission model

The explicit root must be normalized, absolute, outside and nonoverlapping with the configured repository root. Both roots must equal their resolved canonical lexical form: trailing separators and filesystem-root selections are denied, preventing prefix-containment bypass through doubled separators. No traversal/NUL/relative root, symlink component, inherited provider credential, client-selected path or default location is accepted. Supported environment: operator-controlled local POSIX filesystem, current effective UID, mandatory no-follow/nonblocking/directory flags, working file/directory fsync. Unsupported safety flags or sync operations fail closed.

Private layout, with no absolute real path in metadata:

- Root and `objects/`: owner UID, exact mode **0700**.
- `.owner.json`: **0400**, canonical owner schema, opaque random store ID, root device/inode binding and random local sealing key.
- `.import.lock`: exclusive **0600** file, random process-held token and recorded identity.
- `objects/<opaque-na-UUID>/`: **0700**.
- Each committed directory has exactly `audio.wav`, `manifest.json`, `commit.json`: **0400**, regular single-link owner files.

The sealing key is generated solely for this local store. It is **not an OpenRouter/API key** and is never returned, logged, placed in application configuration or committed. Restart reads it only from the privately owned store. Copying the owner file/root to a different inode cannot establish the original root identity.

Source validation is read-only and additionally requires owner-only **0400 or 0600**, a regular single-link file and the accepted WAV limit. The importer never chmods/writes/renames the source. Both initial M10-03A measurement and the bounded source capture must agree exactly. No audio is copied into Git. Root creation is nonrecursive/exclusive; all artifact IDs are server-generated UUIDs, and lookup accepts only the strict opaque ID grammar.

Per-file WAV limit remains **8 MiB** and supported mono PCM16 rates/layout are unchanged. JSON limit is **16 KiB**; at most **16 artifact directories**, including unresolved reservations, can occupy a root. No eviction or truncation admits new work. These are store-level bounds, not OS disk/memory quotas; unexpected external files cause denial rather than reclamation.

## 4. Durable manifest and independent evidence

Each manifest has exact schema/store binding, redacted artifact metadata and an HMAC-SHA256 seal. Metadata contains opaque artifact ID, creation timestamp, original/copy-verified whole-WAV hash and byte count, PCM format/rate/channels/depth/data length, exact frames and reduced rational seconds, origin/owner claim/listening classification, missing evidence, blockers and unchanged M10-03A restrictions.

The commit record separately seals exact store/artifact identity and SHA-256 of the complete canonical manifest. Unknown/missing fields, noncanonical JSON, invalid dates, copied identities and malformed seals are denied. A matching outer hash alone is insufficient. Root/store/artifact/manifest/byte bindings are checked independently.

| Evidence | Persisted meaning |
| --- | --- |
| `OWNER_REPORTED` | Optional selected OpenRouter/Gemini/Kore claim; never authenticated generation identity. |
| `LOCAL_AUDIO_INTEGRITY_VERIFIED` | Independently measured valid local WAV snapshot, including independently reread stored bytes. |
| `PROVIDER_RECEIPT_VERIFIED` | Reserved vocabulary only; no verifier/issuer exists here. Attempts to promote to it fail. |
| `SCRIPT_COVERAGE_NOT_VERIFIED` | Always preserved; no exact original script or transcript reconstruction. |
| `LISTENING_FEEDBACK_OWNER_SUPPLIED` | Optional owner-supplied feedback only; no qualification, event or approval authentication. |

`providerReceipt:UNKNOWN`, `nativeGatewayResponseIdentity:NOT_ESTABLISHED`, `scriptCoverage:NOT_VERIFIED` remain fixed. Downloaded WAV identity is not native OpenRouter raw PCM identity. Restrictions remain `OFFLINE_INTAKE_ONLY`, `liveEligible:false`, `audioVerified:false`, `humanApproval:NONE`, `sourceVerified:false`, `spendingAuthority:NONE`, `publicationEligibility:false`, `productionEligible:false`.

Lookup remeasures actual stored bytes, creates a fresh accepted intake candidate from bounded owner evidence and compares the **entire regenerated metadata** against the manifest. Even fixture manifests deliberately resealed with the fixture's own local key cannot pass forged measurement, receipt, listening-approval, script or production fields. No serialized candidate is deserialized into a trusted capability. A valid synthetic WAV can establish local container integrity only; content cannot authenticate which service produced it or whether it is Myanmar speech.

## 5. Creation, interruption and concurrency

Logical sequence:

1. Capture strict source authorization and owner evidence before asynchronous work.
2. Accepted M10-03A read-only inspection, then independent bounded source reread; compare exact measurements.
3. Exclusively create writer lock, write/sync token and sync root. There is no waiting loop, automatic retry or lease-based lock recovery.
4. Verify existing objects under that lock. Exact same WAV/evidence returns the immutable original; changed evidence conflicts. Any unresolved directory blocks new import.
5. Exclusively mkdir a generated artifact directory and fsync its parent. Exclusively create WAV with `O_CREAT|O_EXCL|O_NOFOLLOW`; write, chmod read-only, fsync and close.
6. Independently reread/measure the stored WAV and compare with original source measurement.
7. Exclusively write/seal/chmod/fsync manifest and fsync artifact directory; independently reread it.
8. Exclusively write the sealed commit marker, fsync it, fsync artifact directory and objects parent.
9. Run full artifact lookup validation before returning metadata.
10. Release only this invocation's unchanged lock identity/token; sync root. Unexpected or replaced locks are never removed.

There is no overwrite or rename-to-existing path. Exclusivity is supplied by kernel mkdir/O_EXCL for individual creation, not a multi-file filesystem transaction. Partial files remain private and are unreadable as registered artifacts. The final marker may itself be partial during interruption; complete canonical/seal/identity validation is mandatory, so partial visibility never yields trusted metadata.

An incomplete root, WAV, manifest or commit is not automatically repaired, finalized, adopted or deleted. Read-only listing reports safely named uncommitted reservations without trusting their files. Malformed/partial committed records fail closed. A stranded lock after interrupted acquisition remains blocking even after restart; expiry is not authority to remove it. No GC, artifact deletion API, ownership takeover or M8 recovery is implemented.

Two independent store instances compete on the exclusive writer lock; the controlled concurrent test proves the loser receives denial and only one artifact publishes. Duplicate handling occurs only after fresh reads and lock acquisition. No new ID is allocated to bypass unresolved evidence.

A complete sealed artifact may remain after lost fsync/final acknowledgement. Explicit read-only reopening revalidates the original commit and exact bytes; an explicit duplicate import returns that same original when complete. It never rewrites a commit or creates a replacement for incomplete/ambiguous files. Successful fsync acknowledgements are required for a successful import response, but the tests do **not** certify physical power-loss or multi-host durability.

## 6. Lookup, previews and reproduced defect

Lookup verifies root ownership/identity, exact directory/file layout and permissions, local manifest/commit seals and binding, actual WAV hash/byte count/rational measurements, provenance/restrictions, then rereads the manifest, commit and complete WAV before the final root fence. Any failure returns a fixed safe error, with no path, receipt body, raw bytes, partial metadata or native error cause.

A new adversarial test reproduced an early M10-03B defect: valid PCM bytes could change during the final manifest check after the initial WAV read, and lookup returned success. The unchanged rejecting test failed with “Missing expected rejection.” The narrow correction retains the captured bytes and compares a final independent WAV reread before response. The test now passes. This closes the exercised window, not every possible malicious filesystem race.

Preview returns `{artifactId,timing}`; timing comes from the unchanged M10-03A pure function, exactly `[0, frames/sampleRate)` rational seconds, track `narration`, `PREVIEW_ONLY`, and all admission restrictions. The stable artifact ID differs from the fresh ephemeral candidate ID used internally for each preview. Equivalent rational claims pass; mismatched durations fail. No integer-millisecond conversion, M7 save, persistent timeline mutation, actual video synchronization or playback is installed.

## 7. Fresh tests and fault evidence

| Group | Executed evidence |
| --- | --- |
| Valid/store identity | Exact synthetic copy/source preservation/hash/frame/duration, owner-only modes, duplicate original/conflict, read-only reopen/list/preview. |
| Corruption/forgery | Truncated/modified/appended/missing WAV; malformed manifest/commit; unsigned mutation; validly resealed forged measurements, approval/receipt/script/listening claims; cross-root/artifact manifest substitution and copied-root rejection. |
| Filesystem | Symlink/ancestor/root alias and traversal denial, unexpected hardlinks, invalid permissions on root/objects/owner/WAV/manifest/commit, missing/unexpected entries, exclusive destination collision, source mutation between measurements, copy corruption and lookup mutation. |
| Interruption | Partial WAV, before manifest, before commit, partial commit, lost commit fsync ACK, stranded acquisition lock, interrupted root initialization. Evidence retained; no automatic deletion/adoption/reformat. |
| Concurrency/durability | Two independently opened writers with a deterministic lock barrier, ordered file/directory fsync observations, capacity exhaustion without eviction and a fixed read-only child-process restart using disk-only metadata. |
| Isolation/disclosure | Strict input snapshotting, no metadata/path/audio/key disclosure or logs, no network sender/import, M5/M8 promotion denial, server-only/import/source and fresh production-bundle audits. |

Tests use only newly generated synthetic PCM16 WAV bytes. Temporary fixtures have fresh owned directories and ownership markers; cleanup checks the marker and removes only that test-owned namespace, including intentionally injected faults. No actual private user sample is read. The fixed child invokes only the enumerated Node read-only reopening fixture, receives synthetic configuration on bounded stdin, inherits no credentials/application environment and returns metadata only. It is a service restart test, not an OS power-loss test.

## 8. Exact verification and overlap accounting

Final acceptance uses disjoint explicit test files and serial `--test-concurrency=1` with `--test-isolation=none`, `--conditions=react-server --import tsx --test --test-reporter=tap`.

| Final command/check | Actual result |
| --- | --- |
| New store `{store,recovery,boundaries}.test.ts` | **56/56 PASS**, zero skips/cancellations. |
| M10-03A `{intake,private-file,boundaries}.test.ts` | **69/69 PASS**, with only the exact offline-consumer test allowlist change. |
| Relevant unchanged M5/M7 pure regressions | **250/250 nodes PASS**: 243 leaf cases and seven parent nodes. |
| Final distinct acceptance | **375/375 test nodes PASS; 368 distinct leaf cases**, seven parents. |
| `pnpm lint` | PASS on final source/tests. |
| `pnpm exec tsc --noEmit --incremental false` | PASS on final source/tests. |
| `pnpm exec next build --webpack` | PASS: compilation, TypeScript, 12 static pages, route/build-trace completion. |
| Production audits | **10/10 PASS**, including new store and updated intake audits. |
| New store audit | Four isolated modules, 370 external source files, 217 built JavaScript files; zero production references/forbidden imports/server actions. |
| Existing gates | Intake: six isolated modules/365 external sources/217 bundles, zero references. TTS fixtures: 374 sources/217 bundles, five unchanged fixtures, 38 existing API routes, zero server actions. Other M6/M7/M8 audits pass. |
| Static final review | Exact 13-file owned inventory, source hashes, 710 unchanged baseline files, local links/Markdown/newlines, secrets, unstaged/staged whitespace and staged byte equality checked. |

The M5/M7 run selects `tests/storyline/voice-handoff.test.ts`, all four `voice-foundation/*.test.ts`, all four `audio-verification/*.test.ts` and `timeline/{foundation,boundaries}.test.ts`: **11 files**, no PostgreSQL files.

Development runs, preserved separately: first **46/47**, second **46/47** (both fixed restart child denied by sandbox `EPERM`; assertions retained); next **49/49** with authorized fixture-child execution; adversarial lookup reproduction **50/51**; pre-release **55/55**; final **56/56** after the staged-review path-canonicalization hardening and added containment case. Across these plus both regression runs: **624 node executions, 621 passes and three development failures**. **249 preliminary overlapping executions** (246 passed, three failed) are excluded from the final distinct 375-node total. No skipped tests and no unresolved final test failures. The initial standalone TypeScript run also exposed a missing required `NODE_ENV` field in the clean child fixture environment; adding `NODE_ENV:test` corrected the fixture typing, with subsequent checks passing. Lint, TypeScript, dummy build and all ten audits were repeated after the final path-validation change; both guarded builds passed, and preliminary receipts remain preserved.

Verification uses clean `env -i`, unreachable dummy application `DATABASE_URL` at `127.0.0.1:1/storyline_unreachable`, telemetry disabled, Node 26.12.0 and Next.js 16.3.6. A temporary verification preload outside Git blocks dotenv/npmrc reads and Node socket/HTTP/HTTPS/fetch dispatch before I/O; self-checks passed. It is a guard, not an OS network-sandbox claim. The fixed read-only child uses a clean explicit test environment and imports only the audited offline graph. Compiler and fixed fixture-child subprocess permission was used without allowing media/provider processes.

Audit command: `node tests/storyline/<name>/production-audit.mjs <ignored-receipt>`, for `narration-private-store`, `narration-intake`, `tts-evaluation`, `render-execution-fake`, `maintenance-fake`, `render-planning`, `highlights-studio`, `timeline`, `timeline-persistence`, `timeline-studio`. These read source/build text only. Logs, baseline hashes and audit receipts are preserved under ignored `coverage/m10-03b-20261106/`, without user audio or local store keys.

**NOT RUN:** actual Sample 01 path/hash/import/smoke, real TTS/account/credential/provider/spending operations, listening/script-quality evaluation, real movie/audio downloads, FFmpeg/FFprobe/compressed decoding/rendering, PostgreSQL/Redis/worker/migration operations, M4 timing suites, M8 runtime recovery/maintenance, unchanged mock TTS runtime suite, UI/component/Chromium and broader server suites, deployment or push. There is no UI/application composition to exercise; scoped pure regressions plus the full build and production audits cover this isolated addition. No historical PASS count is treated as fresh.

## 9. Exact changed inventory and hashes

**11 new files, two modified test/audit files, no existing runtime contract changed.** This new report is `docs/STORYLINE_M10_03B_PRIVATE_NARRATION_ARTIFACTS.md`. Remaining source inventory:

| Owned source path | SHA-256 |
| --- | --- |
| `lib/storyline/narration-private-store/contracts.ts` | `a2dc31a992caca053ff71ea185f9c9fa15731018fc5a1232cc339d171a101498` |
| `lib/storyline/narration-private-store/files.ts` | `77004d23d5a259162dd09f4d8071a6b305beb169cad3cf62bc52129955cdf05f` |
| `lib/storyline/narration-private-store/index.ts` | `89636e9e416d9c7e5f5a0aef4b0f3609b875c4500df72f36d4453367a0774c45` |
| `lib/storyline/narration-private-store/store.ts` | `6fdd291488843f5771a9795ebc2c97a43e4784b9410c8d386fb69d2db83b3ff7` |
| `tests/storyline/narration-intake/boundaries.test.ts` | `2e045cbb85fe38fca3a45e850c9c974ce7a4a303ca7bf54c2a98579ecada5b52` |
| `tests/storyline/narration-intake/production-audit.mjs` | `60d398f6ef47fe5ac4dd888ae9f53c33263290e07291a386c5f6a371b1e6aa9b` |
| `tests/storyline/narration-private-store/boundaries.test.ts` | `fc94ea7ac454dac35bcb8a7563e90cf05b061d2c5fd9aa178ea9ad529c3896a4` |
| `tests/storyline/narration-private-store/fixture.ts` | `6a620c1362b9724907a4e156d1e248d9b126b08ca88a1c6b7f9bb08a8dbb6053` |
| `tests/storyline/narration-private-store/production-audit.mjs` | `66bc76a9b90897e0ee86e6d83542021cbcccb074076c982a7c3ec48c91a58dba` |
| `tests/storyline/narration-private-store/recovery.test.ts` | `7f7e9bf6fe2f978d5d3322a62806c145510325117aa4b7a27fdacc72fa632633` |
| `tests/storyline/narration-private-store/reopen.fixture.ts` | `4fa851576c9f8b975423667ba0a6a67718712bb6981002c0d0da62e9ade0b31c` |
| `tests/storyline/narration-private-store/store.test.ts` | `2e603125b83364e399aaecc9f91033a8f5366c9eaa76731d16e12492b98b04fa` |

The two modified paths are `tests/storyline/narration-intake/boundaries.test.ts` and `tests/storyline/narration-intake/production-audit.mjs`; their exact three-file exceptions are justified in section 1. Everything else in the table is new. Explicit paths only are staged. No WAV, local owner/seal file, manifest fixture, raw waveform, private receipt or ignored log is committed. Secret-pattern scans have no actual credential finding; intentionally named negative-test markers are synthetic, not credentials.

## 10. Residual risks and future handoff

This is **trusted-local-operator persistence**, not a hostile filesystem, production tenancy or multi-host storage service. Mode 0700/0400, UID/link checks, component lstat, inode binding, no-follow opens and O_EXCL do not constitute atomic directory-descriptor containment. Node path operations still have parent-directory and final-response TOCTOU windows; an attacker with the same UID/root, access to the local sealing key, control of mounts/storage or timestamp manipulation is outside the guaranteed boundary. Read-only mode is an API property, not an immutable filesystem snapshot. The local seal detects untrusted copying/tampering but is not independent provider attestation or protection from the trusted operator itself. Files are immutable through this API; their OS owner can chmod them, so every lookup revalidates.

Fsync ordering was exercised on this host; device cache honesty, filesystem crash behavior, power-loss recovery, hostile directory replacement and cross-host serialization remain unverified. Missing files, permission drift, incomplete initialization, stale locks or corrupted committed evidence fail closed. Operational import can remain blocked indefinitely pending separately authorized manual investigation. There is no automatic ambiguous-file/lock cleanup, GC, retention expiry, read-hold protocol or durable account authorization. No guarantee is silently weakened when an environment cannot supply the required primitives.

Proposed separately reviewed **M10-04**: private immutable audio-to-exact narration/script lineage and scoped access design, including source/candidate identity, human review evidence, root ownership/backup/recovery and explicit operator remediation of unresolved state. A saved WAV or local MAC cannot substitute for exact approved-script binding.

Proposed separately reviewed **M10-05**: exact rational audio-duration reconciliation and offline synchronization policy against future timeline contracts, plus independent quality/semantic coverage evidence and acceptance rules. Any actual provider trial, genuine artifact admission, decoder, playback, production route or rendering remains separately authorized; these recommendations do not begin those milestones.

OPENROUTER_ONLY / `google/gemini-3.8-flash-tts` / Kore and the existing research PCM selection remain unchanged. The historical Sample 01 hash/listening evidence is referenced only by earlier reports, never used as a fixture or fresh measurement. Script coverage, authenticated generation receipt, account entitlement, privacy/routing acceptance, bounded charges/spending approval and durable live request/UNKNOWN ownership remain unresolved. No retry, fallback, provider substitution, publication, SOURCE_VERIFIED or human-approval issuance.

The original M4 expiry source remains SHA-256 **8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7**; all sixteen controls and unchanged **700 ms** positive deadline are preserved. The historical incident remains **UNRESOLVED** and not retested. M8 fake-only, Phase 0 and Phase 1A authority remain unmodified and unimported.

**Final verdict: M10-03B OFFLINE PRIVATE STORE PASS; SCRIPT_COVERAGE_NOT_VERIFIED; FORMAL_LIVE_TRIAL_BLOCKED; PRODUCTION_TTS_NOT_READY.** Stop before live TTS, real movie processing or MP4 rendering.
