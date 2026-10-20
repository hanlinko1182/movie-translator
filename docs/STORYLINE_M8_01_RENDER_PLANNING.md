# M8-01 — Pure recap render planning

Date: 2026-10-20, Asia/Bangkok. **M8-01 PASS — SYNTHETIC_ONLY, metadata-only. All required final test/build/browser checks passed; no media execution authorization.**

## Scope, baseline and inventory

Implemented strictly versioned SYNTHETIC_ONLY metadata planning from an independently resolved current saved M7 Timeline. There is no media acquisition, file inspection, probe, decoder, encoder, FFmpeg/ffprobe command, video/audio output, storage, render reservation, queue, worker, route, Server Action, production authentication or Studio UI integration. No dependency installation. M8-02 is not implemented.

Verified clean entry on `recovery/m9-studio` at exact baseline `9cbaaa5a7d64aaa267334b37accea38c03ea7a6c`. Read AGENTS/CLAUDE, installed Next.js server/client and data-security guides, M7 acceptance and all three M7 reports, M6/M5/M9 acceptance and the frozen UI baseline. Inspected actual M7/M6 exports, canonical serialization/validation, M1 media fingerprints, planners/resolvers, saved-record contracts, native authentication/read service boundaries, scratch SQL and disposable fixtures. Baseline SHA-256 inventory covers every existing tracked file. Historical results are context only.

All 15 owned files are new; no existing file or M1–M7 hash domain is changed:

```text
lib/storyline/render-planning/contracts.ts
lib/storyline/render-planning/input.ts
lib/storyline/render-planning/resolution.ts
lib/storyline/render-planning/recipe.ts
lib/storyline/render-planning/planner.ts
lib/storyline/render-planning/index.ts
tests/storyline/render-planning/fixture.ts
tests/storyline/render-planning/contracts.test.ts
tests/storyline/render-planning/foundation.test.ts
tests/storyline/render-planning/tampering.test.ts
tests/storyline/render-planning/postgres.fixture.ts
tests/storyline/render-planning/postgres.test.ts
tests/storyline/render-planning/boundaries.test.ts
tests/storyline/render-planning/production-audit.mjs
docs/STORYLINE_M8_01_RENDER_PLANNING.md
```

The sixth runtime file, `recipe.ts`, separates strict recipe shape/self-hash parsing from independent replay. It is deliberately not exported by the public index as an admission API. All six runtime files import `server-only`; no `use server` function or application caller exists.

## Public interfaces and canonical contracts

The index exports the contract types/constants, `RenderPlanningError`, `renderPolicy`, `renderRestrictions`, `syntheticRenderProfile`, `syntheticRenderProfileReference` and:

- `parseRenderPlanningInput(value: unknown)` → deeply frozen RenderPlanningInput.
- `parseSyntheticRenderProfile(value: unknown)` → the fixed immutable SyntheticRenderProfile.
- `parseSyntheticSourceObservation(value: unknown)` → deeply frozen declared source metadata.
- `parseRenderRequestProposal(value: unknown)` → deeply frozen disabled metadata proposal.
- `generateRenderRecipe(input: unknown, resolver: SyntheticRenderPlanningResolver): Promise<RenderRecipe>`.
- `validateRenderRecipe(recipe: unknown, expectedInput: unknown, resolver: SyntheticRenderPlanningResolver): Promise<RenderRecipe>`.

No default resolver, environment switch, provider/media implementation or production authentication shortcut exists. Internal helpers are not exported from the index.

| New domain | Bound content |
| --- | --- |
| `story-recap-render-planning-input-v1` | Exact four-part scope, saved M7 identity, fixed policy and independently registered profile reference. |
| `story-recap-render-policy-v1` | Integer milliseconds, half-open intervals, original speed 1:1, CUT_ONLY, contiguous placement, no overlap/filler, reject unrepresentable timing and EXCLUDE_ALL audio. |
| `story-recap-render-profile-v1` | The complete fixed synthetic output profile and disabled/unverified capability labels. |
| `story-recap-render-source-observation-v1` | Exact source fingerprint, explicitly declared stream metadata and permanent unprobed/no-possession labels. |
| `story-recap-render-dependency-snapshot-v1` | Exact M7/M6 identities, immediate parents, separate head revisions, immutable captures, source/narration/candidate lineage, policy versions and profile/source-observation bindings. |
| `story-recap-render-recipe-v1` | Complete recipe payload including all independent dependency/source/profile/policy/input hashes and exact ordered segment projection. |
| `story-recap-render-request-proposal-v1` | Scope, recipe/dependency references, scoped request key and DISABLED_HANDOFF_ONLY/executable false. |

Uses unchanged Storyline `contractHash(domain,value)`: SHA-256 of domain + newline + strict canonical JSON. It rejects unknown fields, unsupported versions, malformed IDs/hashes, invalid Unicode, unsafe/fractional numbers, negative zero, getters without executing them, cycles, sparse arrays, non-JSON values and unusual prototypes. M8 additionally checks array prototypes without changing the inherited serializer. Exact Unicode is preserved. No paths/URLs, commands/filter graphs, credentials, session tokens or execution permits are wire fields. Evidence text remains text, not a file/command/URL interpreter.

Bounds: input/profile/source observation 2 MiB; full recipe/request 3 MiB; resolution 32 MiB with all stricter inherited limits; maximum 64 segments; source bytes ≤16 GiB; source/output milliseconds ≤86,400,000; positive coprime rational components ≤1,000,000,000. The fixed source topology is stricter than a generic 16-stream bound: one video and at most one declared audio, no other streams. Over-limit values reject rather than truncate. No byte/duration bound reserves real resources.

## Saved identity, independent resolution and currentness

Input contains only `{schemaVersion,execution:SYNTHETIC_ONLY,scope,timeline,policy,profileReference}`. Timeline is the full saved M7 ID/version/recordHash/recordHashDomain/planHash/planHashDomain. A pure `tl-` plan is not a saved-record selection; missing/UNKNOWN/unsaved resolution rejects. M6 identities cannot substitute for M7 domains. No replacement plan, capture, clip, timing, role, approval or CURRENT claim is accepted from the requester.

The explicitly injected resolver returns one bounded independent observation per generation/replay: selected authorized M7 view and immutable dependency; its immediate M7 parent and dependency; exact current M7 head identity/revision; separately current M6 observation; independently observed scope/policy enablement; registered profile; declared source metadata; and a diagnostic observedAt. The resolver and status are **fixture-owner consistency boundaries, not production authentication**. Pure code cannot certify a malicious resolver's claimed authority or physical media possession.

Selected M7 scope, complete saved-record/proposal/hash/domain/previous/version and immutable dependency hashes are checked. The inherited pure M7 dependency reader independently replays selected M6 and immediate M6 parent against their own stored M1–M4/R4 captures, proposal/audit/record hashes and physical parent identities. The immediate M7 parent is independently loaded, hash/lineage checked and archivally replayed against its own dependency, then compared to the selected record's complete previous identity. This is bounded immediate-parent validation, not an unbounded recursive ancestry walk.

Historical replay is insufficient for planning. Separate current admission requires selected M7 CURRENT_AT_READ and exact current head, enabled M7/M6 scopes and M7 policy, and current M6 source/media/narration/candidate/dependency/policy/rubric/head observations. `replayCurrentTimeline` compares independently reconstructed capture bodies and regenerates the complete M7 plan against current observations. Stale/superseded/disabled/missing/unsupported/unauthorized/ambiguous data fails closed; there is no historical fallback or silent newer-head substitution.

M7 saved version/head revision and pure M7 `plan.headRevision` are different: the latter is **M6's revision**. The dependency snapshot stores both explicitly. Tests cover M7 revision 2 with M6 revision 1 and an actual M6 revision 2 with its parent. The source fingerprint must equal the independently replayed M7/M6/M1 `{sha256,bytes,durationMs}` exactly.

The PostgreSQL composition lives only in `postgres.fixture.ts`. It creates a newly owned private Unix-socket database using unchanged M7/M6 fixtures. Actual native M7 and M6 authorized readVersion/readHead operations precede independent scratch-schema metadata queries. Existing services verify origin/session/scope/expiry/revocation/grants and saved audit integrity; no browser role claims are accepted. Production application datasource is explicitly unreachable. Pure M8 imports only the M7 persistence **contracts and pure resolution** modules, never its index/service/database/authentication, and no SQL is present in the M8 runtime graph. Authorized fixture reads retain inherited private one-use proof bookkeeping; planning changes no M7/M6 version, reservation, audit or head business counters. This is not a claim that authenticated gateway reads perform zero proof-table writes.

These observations span reads; there is no claim of a transaction-wide render admission lease, protection against a later source writer, or execution authorization. A future execution owner must independently authenticate, authorize, revalidate/fence current dependencies and source access at its own admission.

## Declared profile, media boundary and exact arithmetic

The only profile is `SYNTHETIC_MP4_H264_640X360_25_V1`: declared MP4 / H264_AVC / YUV420P / 640×360, 25/1 FPS, 1/1000-second timebase, one output video stream and zero audio/subtitle/data/attachment streams. No scaling, cropping, rotation, VFR, filler or non-CUT_ONLY transition. Capability is SYNTHETIC_UNVERIFIED, engineAvailability NOT_ESTABLISHED, encodingPolicy DISABLED, executable false. Its complete canonical hash is pinned in the registered reference; a supplied replacement profile cannot self-register.

Source observation permanently says SYNTHETIC_METADATA_ONLY, NOT_PROBED and POSSESSION_NOT_ESTABLISHED. It declares the exact fingerprint/container, video stream index 0, codec/pixel format/dimensions, rational FPS/timebase, zero-origin contiguous CFR timing, duration ticks/frame count, no rotation/VFR/encryption, and topology. One optional source audio stream is declared only by count and excluded; no audio codec support, decoding or audio timing is claimed. Unknown/extra streams, changed dimensions/codec/container, invalid timebase/rational, nonzero origin, discontinuity, mismatched frame/tick counts or possession/probing claims reject.

**A fingerprint and synthetic stream declaration prove neither an accessible source file nor suitable real codecs/streams/encoding software.** No file, WAV, source movie, storage object, FFmpeg or ffprobe is opened or invoked. The legacy full-movie subtitle renderer is a different feature: its BURN_IN AAC and SOFT_SUBTITLE audio-copy profiles, storage-key snapshot and more permissive serializer are not imported, cast to or dispatched by M8.

For FPS N/D, `frameIndex = (timeMs × N) / (1000 × D)`. For a timebase of Tn/Td seconds per tick, `tickIndex = (timeMs × Td) / (1000 × Tn)`. Components must be positive, bounded and coprime. Multiplication/division uses checked BigInt intermediates; remainder must be zero and results fit safe integers before conversion. No BigInt is serialized. At 25 FPS each source/output boundary and duration must lie on the exact 40 ms grid. A valid M7 1 ms cut is rejected as FRAME_BOUNDARY_UNREPRESENTABLE and the original M7 bytes remain unchanged. No rounding, padding, stretching, clipping or unit substitution occurs.

Each unchanged M7 segment retains exact source/output half-open milliseconds, original duration, M7 segment and M6 candidate IDs/hash, source chronology/presentation indices, exact start/end frames and ticks, positive frame/tick counts, CUT_ONLY and character/evidence provenance. All output prefixes and totals must reconcile exactly; source cuts cannot exceed declared duration. Source chronology is review metadata, output follows M7 recap presentation. Intentional source omissions remain bound in the full replayed M7 plan hash and add no output/filler; they are not invented segments in M8.

## Immutable recipe, replay and disabled proposal

Result is `{id:rr-<recipeHash>,recipe,recipeHash}`. The payload contains the input/hash, exact timeline plan hash, immutable dependency snapshot/hash, source observation/hash, profile/hash, policy hash, complete segments, source/presentation order, total output milliseconds/frames/ticks, EXCLUDE_ALL audio, zero output audio tracks, optional historical fake-audio reference and permanent restrictions. Everything is deeply frozen. Snapshot references use `rrdep-<dependencyHash>` in disabled request metadata.

New observation timestamps, request keys, worker generations, session tokens, grants/permits and spending data are excluded from content identity. A validated resolver `observedAt` is diagnostic only. Immutable timestamps already bound inside original M1–M7 identities/captures are preserved; changing them is not disguised as a transient observation update. Different request keys change a request hash, not the underlying recipe. Repeating identical independently validated observations yields identical canonical recipe bytes. Changed source, dependencies, saved M7 identity/version, order or profile changes identity or rejects. Metadata determinism does not guarantee future encoded-byte determinism.

`validateRenderRecipe` strictly captures/parses the entire candidate, checks nested fields and all self-hashes, parses independently supplied expected input, reacquires once, replays complete ancestry/currentness, regenerates all recipe content/hashes and compares complete canonical results. It returns the independently generated frozen result, not the supplied candidate. Shape/self-hash parsing alone grants no eligibility. Tests demonstrate self-consistent rehashed changes to evidence, characters, source, candidate, M7 parent/identity/dependency, order, coordinates, frames/ticks/totals and M7 saved payloads still fail independent replay.

Every recipe remains SYNTHETIC_ONLY, NOT_RENDERED, humanApproval NONE, sourceVerified false, real TTS/publication false, spending NONE, originalMovieAudio EXCLUDED, synthesizedNarration NONE, voiceSynchronization UNSUPPORTED, syntheticAncestry true and executable false. Existing M5 fake audio is copied only as matching immutable historical REFERENCE_ONLY / speech NOT_VERIFIED ancestry. Its WAV bytes are never opened; silence does not prove Myanmar speech and never supplies segment timing. A rehashed speech/approval/audio/execution promotion fails.

The strict RenderRequestProposal binds scope, `rr-` recipe identity/hash/domain, `rrdep-` dependency identity/hash/domain and a scoped idempotency key, with execution DISABLED_HANDOFF_ONLY and executable false. It is metadata only; parsing proves no record existence, authority, durable deduplication/reservation, processing admission, spending grant, worker dispatch, output artifact or storage ownership. UNKNOWN/exception resolution performs one acquisition, exposes only safe RenderPlanningError codes and never retries, substitutes a source/profile, allocates a new operation or dispatches execution.

Safe error codes are INVALID_INPUT, RESOLUTION_UNAVAILABLE, FORBIDDEN, UNSAVED_TIMELINE, STALE_DEPENDENCIES, INTEGRITY_FAILED, UNSUPPORTED_SOURCE_METADATA, UNSUPPORTED_CODEC_CONTAINER, UNSUPPORTED_TIMEBASE, FRAME_BOUNDARY_UNREPRESENTABLE, SOURCE_OUT_OF_BOUNDS and RESOURCE_LIMIT. No raw SQL, credential, locator or future decoder error text is returned.

## Fresh verification

Logs and audit receipts: `/tmp/movie-translator-m8-01-aow2rbsw/`. All older logs are preserved. Every test/compiler/build command explicitly overrides the application datasource with `postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`. Tests install unchanged scratch SQL only in new owned disposable PostgreSQL; no application migration/database is accessed. Timing-sensitive server suites run serially without competing compiler/build/browser workloads. Inherited fixtures may seed their existing synthetic verification facts and fake artifact bytes; M8 emits no SOURCE_VERIFIED receipt, human approval, media output or spending authority.

| Fresh final check | Actual completed result | Receipt |
| --- | --- | --- |
| M8-01 focused contracts/planning/replay/disposable resolution | **150/150 PASS**, 60.43 s | `focused-m8.log` |
| M7-01/02/03 focused regressions | **260/260 PASS**, 266.42 s | `focused-m7.log` |
| Consolidated applicable M1–M8 and legacy pure server regressions | **1,774/1,774 PASS**, 1,126.86 s; all 16 unchanged expiry controls passed | `server-regressions.log` |
| All eight current UI component files | **51/51 PASS**, 2.22 s | `components.log` |
| All six current Chromium suites | **6/6 PASS**, 89.70 s; 1440/1024/390 px in every suite | `chromium.log` |
| Lint / standalone TypeScript | **PASS**, exit 0, no diagnostics | `lint.log`, `tsc.log` |
| Dummy-datasource Webpack build | **PASS**, exit 0; compile 8.2 s, TypeScript 3.3 s, 12/12 static pages and trace collection completed | `webpack.log` |
| M6/M7-01/02/03/M8-01 source/client/server/route/action audits | **5/5 PASS**, exit 0; 71 client chunks, 144 server JS files, 108 production sources; 38 unchanged API routes, zero Server Actions; zero prohibited markers or owned secret-pattern matches, existing bridges type-only | `m6-production.json`, `m701-production.json`, `m702-production.json`, `m703-production.json`, `m801-production.json` |
| Exact-file, credential patterns and working whitespace | **PASS**: all 625 original tracked files and 14 tested new implementation/test files unchanged, exactly 15 owned new paths, zero secret/whitespace matches, expiry source SHA unchanged | `baseline-audit.json`, `implementation-audit.json`, `source-audit.json`, `staged-audit.json` |

All final Node suites report zero failures, cancellations, skips and TODOs. **Final acceptance: 2,241 successful test executions = 150 focused M8 + 260 focused M7 + 1,774 consolidated + 51 components + 6 browser. Both focused runs overlap the consolidated run in full (410 repeats), leaving 1,831 distinct Node-reported cases.** Audit scripts, viewport iterations and individual assertions are additional checks, not added to Node counts. No historical result is substituted. `acceptance-results.json` collects counts and receipts.

Development is separate: 71/71 and 143/144 = 215 executions, 214 passes and one resolved new fixture-test failure. Including those runs gives 2,456 completed individually reported executions, 2,455 passes and that one resolved failure. Their current test definitions all overlap the final M8 suite; no extra distinct cases are claimed. The initial sandbox's two file-level wrappers are excluded from individual-case evidence and all totals.

Fresh browser artifacts: `/tmp/recap-recovery-browser-Q19S24/`, `/tmp/storyline-m9-save-browser-zotahF/`, `/tmp/storyline-m603-browser-BwVD4P/`, `/tmp/storyline-m703-browser-dGlxDW/`, `/tmp/recap-studio-navigation-PT9AI3/`, `/tmp/storyline-m9-recovery-browser-34nigy/`. `browser-audit-summary.json` retains the roots and full M7 audit. M7 and M6 audits show no browser errors/external rejections or production API/provider/media-processing calls; M9 has exact text round trips and zero editing-provider/production API calls. M7 version/reservation/audit/head counters all equal seven; original is immutable. Keyboard/tab/history/recovery/isolation and independent Script/Highlights buffers pass. Inspected fresh Timeline strips at all three widths and the 390 px viewport: exact wrapped labels and proportional metadata bars remain readable without overflow, NOT_RENDERED remains explicit. All six destinations and legacy behavior remain intact. No M8 UI is introduced and this is not comprehensive assistive-technology certification. Required fresh commands from the project root:

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/storyline/render-planning/*.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/timeline/*.test.ts tests/storyline/timeline-persistence/*.test.ts tests/storyline/timeline-studio/acceptance.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/durable-fake/*.test.ts \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/highlights-studio/acceptance.test.ts tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts \
  tests/storyline/timeline/*.test.ts tests/storyline/timeline-persistence/*.test.ts tests/storyline/timeline-studio/acceptance.test.ts \
  tests/storyline/render-planning/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec \
  tests/storyline/timeline-studio/component.test.tsx tests/storyline/highlights-studio/component.test.tsx \
  tests/storyline/editor-saving/component.test.tsx tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
pnpm exec next build --webpack
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs tests/storyline/ui/script-preview-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs tests/storyline/highlights-studio/browser.test.mjs tests/storyline/timeline-studio/browser.test.mjs
node tests/storyline/highlights-studio/production-audit.mjs /tmp/movie-translator-m8-01-aow2rbsw/m6-production.json
node tests/storyline/timeline/production-audit.mjs /tmp/movie-translator-m8-01-aow2rbsw/m701-production.json
node tests/storyline/timeline-persistence/production-audit.mjs /tmp/movie-translator-m8-01-aow2rbsw/m702-production.json
node tests/storyline/timeline-studio/production-audit.mjs /tmp/movie-translator-m8-01-aow2rbsw/m703-production.json
node tests/storyline/render-planning/production-audit.mjs /tmp/movie-translator-m8-01-aow2rbsw/m801-production.json
git diff --check
git diff --cached --check
```

Development evidence is retained separately: the first sandbox TSX attempt reported only two file-level wrappers, so it is not counted as individual acceptance cases; the same command with the fixture runtime enabled reported 71/71 individual pure tests. A subsequent broader development run was 143/144: one new test named a nonexistent inherited `revoked` principal and received UNKNOWN rather than FORBIDDEN. The correction explicitly revokes existing editor-b through the unchanged authentication test seam and retains the FORBIDDEN assertion; no old auth behavior or security assertion changed. The first development TypeScript check found readonly-array type incompatibilities, fixed by immutable provenance/order types. Final acceptance counts remain separate from these development results.

The historical M4 M1-last positive repeat-2 fake-wire failure (expected one, observed zero under the unchanged 700 ms confirmation) remains unexplained. All 16 controls, deadlines and SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7` are preserved. Any recurrence requires retained scheduling/checkpoint/confirmation/lease/permit state and timing investigation; no extension, weakened assertion or speculative retry. Fresh result: **16/16 PASS once in the complete final consolidated run**, including the historical M1-last repeat-2 positive; no recurrence, timing/assertion modification or targeted expiry rerun. A fresh pass is not a root-cause repair or production timing certification.

## Production blockers and separate M8-02 handoff

M8-02 is ready only for a separately requested **design and independent media-execution safety review**, not automatic permission to probe/render. Before any parser/subprocess/source-byte access, require:

1. Real authenticated tenant/project/movie/studio/source membership and independently authorized possession/access to exact private source bytes; fresh M7/M6/source/narration/candidate/policy currentness and execution admission fencing. Synthetic manifests, M7 save grants and hashes cannot establish these rights.
2. Reviewed sandboxed probing of malformed/untrusted media; exact byte SHA/size/duration reconciliation, real stream topology/codec/container/pixel format/color/rotation/VFR/PTS/timebase/keyframe capability, installed decoder/encoder/software versions and fixed fully hashed execution profile. No stream-copy or byte-determinism assumption follows from codec-name equality.
3. Fixed subprocess argument construction, no shell or caller paths/filter graphs, no remote protocols/downloads/provider credentials, safe opaque server handles, no traversal/symlink escape, minimal environment and reliable process-group cancellation. FFmpeg/ffprobe are not authorized by M8-01 and no encoder is selected/installed.
4. Explicit CPU/memory/disk/pixels/frames/concurrency/wall-time/storage-retention bounds, private exclusive staging, immutable opaque output ownership/versioning, no public URL, and owner-checked cleanup/GC. Review hostile-file isolation before opening any source.
5. Durable original key/recipe/snapshot binding and single-owner generation fencing; an acknowledged admission/checkpoint before execution; exact crash cuts, staging recovery and immutable finalization. UNKNOWN/lost ACK/NOT_FOUND does not permit rerender/new key or silent overwrite; inspect the original owned operation and artifacts.
6. Independent actual output byte/container/stream/frame/PTS/duration verification and zero audio/subtitle/data/attachment tracks. Reconcile exact intended frames/ticks and source/output boundaries. New versioned artifact/probe domains must bind real output SHA-256/bytes, opaque storage version, recipe/dependencies/profile/software/M7/M6/source lineage. A recipe hash, engine success, fake WAV or declared metadata is not a verified output artifact.
7. Separate canReadSource/canRender/private-storage/resource admission and, only if ever separately needed, explicit canSpend/quote/cost consent/budget/one-use spending authority. No provider, paid call, real TTS or fake-audio synchronization is authorized. Audio remains excluded unless a later independently approved voice design establishes exact real-speech lineage and timing.
8. Final currentness/adoption/quarantine policy for late results and independent human approval over exact non-synthetic source/narration/timeline/output before publication. A saved edit, SOURCE_VERIFIED alone or successful synthetic planning cannot approve publication. Synthetic ancestry remains nonpublishable.

Production remains disabled. Real authentication, source acquisition, execution/storage/recovery, operational deadlines/locks, approval, spending and publication need separate reviewed services and authorization. This foundation supplies metadata consistency only and grants none of them.

## Git disposition

M8-01 final acceptance is **PASS within the synthetic metadata-only boundary**. Exact-path staging and review passed: exactly 15 new additions, all staged bytes equal reviewed working content, all 625 existing tracked files and 14 tested implementation/test files unchanged, no unrelated staged/unstaged/untracked files, zero working/staged whitespace or credential-pattern matches. Receipts: `source-audit.json` and `staged-audit.json`. These checks repeat after this disposition is recorded and immediately before the requested local commit `feat(storyline): add pure recap render planning`. The final response reports the resulting full hash and tree status; the document does not attempt to embed its own commit hash. No push, destructive Git, unrelated change or M8-02 work. M8-02 is ready for separate design/safety-review authorization only; actual media execution remains blocked.
