# M8-02 — Disposable media execution security design

Date: 2026-10-20, Asia/Bangkok. **M8-02 design review PASS — DESIGN_ONLY. Actual media execution is BLOCKED. M8-03 is ready for separate authorization as fake-process-only.** This verdict accepts the bounded architecture/handoff, not unimplemented controls or runtime security guarantees.

## 1. Scope, baseline and evidence

Verified clean entry on `recovery/m9-studio` at exact HEAD `257668be1b2b419ee878d050b0dd15dee3d67545`. This review creates only this document. No executable module, fixture, SQL, schema, migration, route, Server Action or media file is added. No source bytes, media directories or existing render outputs were inspected. No application/disposable database, infrastructure, network, provider, worker, probe, decoder or encoder was started. Runtime tests are **NOT RERUN**; historical reports are requirements/evidence of earlier work, not fresh results.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), [UI baseline](UI_UX_BASELINE.md), [M8-01](STORYLINE_M8_01_RENDER_PLANNING.md), [M7 acceptance](STORYLINE_M7_FINAL_ACCEPTANCE.md), [M7-01](STORYLINE_M7_01_TIMELINE_FOUNDATION.md), [M7-02](STORYLINE_M7_02_TIMELINE_PERSISTENCE.md), [M7-03](STORYLINE_M7_03_TIMELINE_STUDIO_UI.md), [M6 acceptance](STORYLINE_M6_FINAL_ACCEPTANCE.md), [M5-04 design](STORYLINE_M5_04_DURABLE_LIFECYCLE_DESIGN.md), [M5-05 implementation](STORYLINE_M5_05_DURABLE_FAKE_LIFECYCLE.md) and [M5 acceptance](STORYLINE_M5_FINAL_ACCEPTANCE.md). Source text and actual exports take precedence over old descriptions. The approved six-destination Studio and unavailable production Storyline composition remain unchanged.

### Existing interfaces actually inspected

| Existing source | Actual interface / responsibility; limit on reuse |
| --- | --- |
| [M8 contracts](../lib/storyline/render-planning/contracts.ts), [index](../lib/storyline/render-planning/index.ts) | `RENDER_PLANNING`, `RenderPlanningInput`, `SyntheticSourceObservation`, `SyntheticRenderPlanningResolver`, `RenderRecipe`, `RenderRequestProposal`, `renderPolicy`, `syntheticRenderProfile`, `renderRestrictions`, `RenderPlanningError`. These are metadata contracts, not execution capabilities. |
| [M8 input](../lib/storyline/render-planning/input.ts), [planner](../lib/storyline/render-planning/planner.ts) | Public `parseRenderPlanningInput`, `parseSyntheticRenderProfile`, `parseSyntheticSourceObservation`, `parseRenderRequestProposal`, `syntheticRenderProfileReference`, `generateRenderRecipe`, `validateRenderRecipe`. Validation independently regenerates the complete recipe; parsing a supplied digest is insufficient. |
| [M8 resolution](../lib/storyline/render-planning/resolution.ts), [recipe parsing](../lib/storyline/render-planning/recipe.ts) | `resolveRenderPlanning` independently checks selected saved M7, immediate M7 parent, M6/current observations and registered profile/source metadata. `parseRenderRecipe` is internal shape/self-hash validation, deliberately absent from the public index. Neither owns a transaction-wide execution fence. |
| [M7 contracts](../lib/storyline/timeline/contracts.ts), [index](../lib/storyline/timeline/index.ts), input/resolution/planner in that directory | `TIMELINE`, `SyntheticTimelineResolver`, `parseRecapTimelineInput`, `generateRecapTimelinePlan`, `validateRecapTimelinePlan`: safe integer milliseconds, half-open source intervals, exact selected M6 set, original speed, CUT_ONLY, contiguous output. No actual media I/O. |
| [M7 repository](../lib/storyline/timeline-persistence/index.ts), contracts/auth/database/service in that directory | `TIMELINE_STORE`, `TimelineRecordIdentity`, `TimelineStoreScope`, `createSyntheticTimelineAuthenticationForTest`, `createTimelineGatewayForTest`, `createDisposableTimelineRepositoryForTest`. Returned operations: `prepareTimeline`, `saveVersion`, `readVersion`, `readHead`, `listHistory`, `readOperation`. M702_DISPOSABLE_ONLY; native session/origin/CSRF/scope checks, scoped immutable history/CAS and source fences. Read/save authority is not launch authority. |
| [M7 pure dependency replay](../lib/storyline/timeline-persistence/resolution.ts) | `parseTimelineDependency`, `validateHistoricalTimelineIntegrity`, `replayCurrentTimeline`. Selected M6 and its immediate parent are independently replayed against stored captures/proposal/audit/physical parent. Archival integrity differs from current admission. M8 imports pure contracts/resolution, not the repository/auth/database index. |
| [M6 contracts](../lib/storyline/highlights/contracts.ts), [index](../lib/storyline/highlights/index.ts), input/candidates/resolution/planner in that directory | `HIGHLIGHTS`, `HighlightSourceReference`, `HighlightAudioReference`, `SyntheticHighlightResolver`, `parseHighlightInput`, `parseHighlightPolicy`, `generateHighlightPlan`, `validateHighlightPlan`. Exact source/M3/M4 or R4 narration, character/evidence/basis/contradiction lineage; synthetic fake audio is reference-only. |
| [M6 persistence](../lib/storyline/highlights-persistence/index.ts), contracts/auth/database/service in that directory | `HIGHLIGHT_STORE`, `createSyntheticHighlightAuthenticationForTest`, `createHighlightGatewayForTest`, `createDisposableHighlightRepositoryForTest`; analogous prepare/save/read/history/operation boundary, restricted disposable gateways, current source/policy/head locks and immutable version/audit records. No media ownership. |
| [Canonical hashes](../lib/storyline/canonical.ts) | `canonicalJson`, `contractHash`: SHA-256 of domain + newline + strict canonical JSON. Safe integers, exact Unicode, bounded serialization; rejects negative zero, getters, cycles, holes and non-JSON values. These hashes establish consistency, not truth, authorization or possession. |
| [Owned PostgreSQL helper](../tests/storyline/disposable-postgres.ts), [M7 fixture schema](../tests/storyline/timeline-persistence/schema.sql), [M6 fixture schema](../tests/storyline/highlights-persistence/schema.sql) | `DisposableStorylinePostgres.start`, `securityAdministrator`, `restrictedLogin`, `stop`: newly marked random fixture, private Unix socket, generated credentials and target/catalog checks. Read as text only, never imported/instantiated here. This is not a generic production connection or media sandbox. Existing role unions need not be widened. |
| [M5 memory ownership](../lib/storyline/voice/private-artifacts/contracts.ts), [store](../lib/storyline/voice/private-artifacts/store.ts) | `PRIVATE_FAKE_AUDIO`, `createPrivateFakeAudioStoreForTest`; opaque WeakMap-owned owner/submission capabilities, copied bytes, EPHEMERAL_PROCESS_MEMORY. A process-local capability or fake audio receipt cannot survive as execution authority. |
| [M5 durable contracts](../lib/storyline/voice/durable-fake/contracts.ts), [auth](../lib/storyline/voice/durable-fake/auth.ts), [gateway](../lib/storyline/voice/durable-fake/database.ts), [service](../lib/storyline/voice/durable-fake/service.ts) | `DURABLE_FAKE`, `domain`, `envelope`, `envelopeHash`, `parseEnvelope`, `expectedRequest`, `createSyntheticDurableSessionForTest`, `createDurableGatewayForTest`, `createDurableFakeLifecycleForTest`. Returned reserve/executeFake/validate/finalize/recover/replay/cancel/GC operations preserve original submission and separate owner generations. Reuse principles, not audio schemas or fake session authority. |
| [M5 storage](../lib/storyline/voice/durable-fake/storage.ts), [fixture schema](../tests/storyline/durable-fake/schema.sql) | `ImmutableAudioPort`, `createOwnedAudioFixture`, `attachOwnedAudioFixture`, `createMemoryImmutableAudioPortForTest`, `newObjectVersion`, `audioHash`. Create-only bounded exact versions, protected fixture paths, read/hash checks and permanent deletion tombstones. Actual service has separate restricted action roles, transaction-bound proofs and UNKNOWN reconciliation. Filesystem checks/chmod are not an adversarial media-process sandbox or protection from a compromised same-UID administrator. |
| [Legacy render contracts](../lib/video-render/contracts.ts), [snapshot](../lib/video-render/snapshot.ts) | `BURN_IN_PROFILE`, `SOFT_SUBTITLE_PROFILE`, `RenderRequest`, `assertRenderTransition`, `SourceMediaIdentity`, `buildRenderSnapshot`, `hashRenderRecipe`. Full-movie subtitle pipeline, private storage-key identity, AAC/copy-audio profiles and a different serializer/retry state machine. **Do not import, cast or dispatch these for recap execution.** Its FAILED/CANCELLED → QUEUED rule cannot resolve a new UNKNOWN process. |

### Existing hash domains and compatibility

| Existing family | Exact domains (brace notation expands each listed suffix) |
| --- | --- |
| M8-01, seven | `story-recap-render-{planning-input,policy,profile,source-observation,dependency-snapshot,recipe,request-proposal}-v1` |
| M7 pure, four | `story-recap-timeline-{input,policy,segment,plan}-v1` |
| M7 store, five plus authorization | `story-recap-timeline-{save-proposal,saved-record,stored-dependency,currentness-fence,save-audit}-v1`; `disposable-timeline-m702-authorization-v1` |
| M6 pure, eight | `story-highlight-{input,source,candidate,rubric,policy,plan,synthetic-capture,synthetic-audio-ref}-v1` |
| M6 store, five plus authorization | `story-highlight-{save-proposal,saved-record,stored-dependency,currentness-fence,save-audit}-v1`; `disposable-highlight-m602-authorization-v1` |
| M5 memory, four | `story-private-fake-audio-{expectation,artifact,ownership,collection}-v1` |
| M5 durable, thirteen | `story-durable-{voice-request,synthetic-narration-binding,voice-recipe,voice-submission,audio-reservation,audio-stage,synthetic-audio-verification,synthetic-audio-artifact,synthetic-audio-collection,audio-access-policy,audio-lifecycle,audio-recovery,audio-audit}-v1` (constructed by `domain(kind)`) |
| Actual bytes / legacy | M5 `audioHash` and legacy `sha256` hash actual supplied bytes; legacy `hashRenderRecipe` hashes its own unversioned canonical JSON, not a Storyline domain. Neither is an M8 output receipt. |

M4 stored draft identity and logical payload identity remain distinct; R4 edited narration uses its own domain and exact parent. M7 saved-record version/head revision differs from inner timeline `plan.headRevision`, which observes **M6**. M8 stores both revisions. No domain, old payload or permanent synthetic restriction is reinterpreted by this proposal. Identical recipe metadata does not promise deterministic encoded bytes.

## 2. Proposed architecture and trust ownership

Everything from this section onward is a **future design**, unless explicitly called existing. No proposed interface, role, permit or ledger exists merely because it is named here. M8-01 recipes remain executable false, encoding DISABLED, NOT_RENDERED forever. A future execution request is a new envelope referencing a fully replayed recipe, never a cast or flag update to `RenderRequestProposal`.

```mermaid
flowchart TD
  F[Authorized synthetic fixture owner]
  S[Independent source-byte authority]
  C[Saved M7 and M6 currentness verifier]
  A[Execution admission ledger]
  H[Private source-handle registry]
  P[Isolated media process boundary]
  B[Private staging and immutable storage]
  V[Independent output-byte validator]
  L[Durable artifact ledger]
  R[Recovery quarantine and GC coordinator]
  I[Read-only private artifact inspection]
  F -->|Separate scoped identity and permissions| A
  F -->|Separate fixture ownership authorization| S
  C -->|Independent replay and currentness fences| A
  S -->|Owned exact immutable byte version| H
  H -->|Possession and revocation binding| A
  A -->|Acknowledged one-use launch authority| P
  H -->|Read-only pinned source descriptor| P
  A -->|Exclusive stage reservation| B
  P -->|Only reserved output descriptor| B
  P -->|Original supervised outcome| A
  B -->|Sealed exact output version| V
  H -->|Same immutable source for verification| V
  V -->|Bound independent verification proof| L
  A -->|Original outcome and final admission fence| L
  C -->|Fresh finalization and read fences| L
  L -->|Current access and read hold| I
  B -->|Exact-version private bytes| I
  A -->|Unresolved original operation| R
  L -->|Availability and retention fences| R
  R -->|Exact owned-version reconciliation or fenced delete| B
```

| Boundary / owner | Authority and owned state | Cannot confer |
| --- | --- | --- |
| Fixture identity owner | Independent server session fixture, tenant/project/movie/studio membership, origin/CSRF, expiry/revocation and explicit per-action grants | Production authentication; browser role claims; human approval |
| Source-byte authority + registry | Current possession/access permission, private immutable version, full-file SHA-256, length, handle generation/lifetime, read holds | Semantic SOURCE_VERIFIED, M7 currentness, permission to launch |
| Currentness verifier | Actual saved M7 identity/audit/dependency/parent; independent M6/M1–M4/R4 replay and current heads/policies | Source possession, irrevocable future-currentness or execution consent |
| Pure M8 planner | Deterministic metadata recipe/profile/dependency identity | Resource reservation, process or spending authority |
| Admission ledger | Original request, scoped key/recipe claim, quotas, current authorization checkpoint and cancel/revocation observations | Process success, video validity or public access |
| Trusted process supervisor | Nonserializable one-use permit, original process identity/journal, sandbox ownership, all descendants and resource accounting | Artifact verification; a renewed launch after recovery |
| Private storage owner | Exclusive staging target, sealed captured output and immutable exact storage version | Approval, successful execution, caller access or latest-version substitution |
| Independent validator | Exact output-byte digest/count, separately isolated stream/decode/content observations and their limitations | Launch authority, source rights or publication |
| Artifact ledger | Immutable lineage/result/verification binding; separate availability overlay, current read/finalize authorization and read holds | Rewriting history or granting approval/TTS/spending |
| Recovery/quarantine/GC service | Narrow original-evidence reconciliation, fences, retention, holds, exact-version deletion and tombstones | Rerender, source substitution, prefix deletion or new execution generation |
| Private inspector | Fresh authorized metadata/exact-byte inspection under a read hold | Public URL, browser autoplay/inline media decoder, download endpoint or publication |

A recipe hash, source hash, saved artifact ID, M7 save permission, successful encoder exit or recovery lease is never execution authority. Synthetic execution authority is an explicit separately authorized fixture capability; it carries **no provider/spending authority**. A render subprocess and a paid provider request are different effects and neither permission implies the other.

## 3. Independent source possession protocol

1. Authenticate independently of submitted metadata. Resolve exact tenant/project/movie/studio, principal, source ownership and `inspectSource`/`executeSynthetic` permissions from the trusted fixture registry. Bind the original M1 fingerprint and exact saved M7/M6/narration/candidate lineage loaded independently. Public hashes and matching client claims cannot register a source or policy.
2. A separately authorized fixture owner registers only newly owned synthetic source material through a private authority. A requester receives an opaque, unguessable handle, not a file path, URL, storage credential or global content-hash locator. Registry entries bind namespace, scope, owner, immutable version, source SHA-256/length, policy epoch, generation, expiry and live holds. No cross-tenant deduplication or existence oracle. Source registration and byte access are **not authorized in M8-02**.
3. Before any parser, bound byte length and snapshot work. Independently stream/hash the entire owned immutable version and compare SHA-256 and exact byte count to the separately resolved M1/M7 fingerprint. Do not trust filenames, ETags, storage metadata or the encoder's reported hash. Do not merely hash the selected excerpts. No network download, alternate source, local search or URL fallback on failure.
4. Use owner-created private roots, descriptor-relative resolution, no-follow semantics at every path component, regular-file checks, single owned link policy and exclusive generated target names. Reject symlinks, traversal, devices, sockets, pipes, foreign roots and caller-selected handles/versions. Do not accept playlists or sidecar references that cause further file/network reads. Opaque handle redemption rechecks scope, generation and ownership, not only syntactic randomness.
5. Pin a genuinely immutable source snapshot/version for hashing, probing, decoding and independent verification. A pinned descriptor plus before/after inode/size/time checks **does not prevent modification through a writable alias**. Chmod and hard-link checks alone do not defeat a same-UID writer. Require an independently enforced immutable object or reviewed sealed snapshot mechanism that prevents all untrusted writers; otherwise actual execution is BLOCKED. The process has read-only descriptor access only, not the original namespace. No replace-in-place, path reopen or mutable latest key.
6. Limits apply before hash allocation, during probe/decode and after measurement: maximum source bytes, measured duration, tracks, frames, decoded pixels, metadata/output/log size and cumulative resource use. M8-01's 16 GiB/24-hour ceilings are **metadata ceilings**, not an approved execution budget. Real fixture limits must be much smaller, explicitly frozen and tested later; exceeding/unknown limits rejects, never truncates or rewrites M7. Section 12 sets fake-only limits.
7. Handles are server registry capabilities bound to the operation, with a reference/hold while work may exist. Expiry denies new redemption; it does not erase unresolved ownership or permit deleting bytes under a live process. Revocation before admission/permit redemption denies launch. Revocation after launch requests supervised group termination and quarantines output; it prevents finalization/private replay. Already consumed source bytes cannot be recalled.

Four facts remain separate: **declared synthetic metadata** (M8-01 NOT_PROBED/POSSESSION_NOT_ESTABLISHED), **verified byte possession**, **actual probed/decoded stream properties**, and **current execution eligibility**. New observations use new schemas; none changes the M8-01 labels or issues a human/source verification receipt. Hash agreement alone proves neither media validity nor rights to use it.

## 4. Mandatory parser and process isolation

No isolation mechanism, installed binary, codec support or host capability was tested in this review. The following are requirements for a later real-execution milestone, **not runnable command guidance or certification of this host**. If any required control is unavailable/unverifiable, fail admission with UNSUPPORTED_ISOLATION before starting even a probe. There is no weaker same-user subprocess fallback.

| Control | Required future behavior / fail-closed condition |
| --- | --- |
| Invocation | Trusted supervisor invokes a pinned executable directly with a fixed reviewed argument array, never a shell/string command. Deny caller arguments, executable names, filter graphs, fonts, plugins, scripts, stdin commands and environment substitutions. Internal cut construction derives only from independently validated bounded integer recipe coordinates. |
| OS containment | Separately reviewed least-privilege user, mount/filesystem, process and network isolation; no elevated capabilities, privilege gain, host mounts, devices, runtime sockets or writable executable paths. Reviewed syscall confinement and resource enforcement. Namespaces, process groups or cgroups individually are insufficient; all required layers must be demonstrated together on the target environment. |
| Network/protocols | No network namespace connectivity, DNS, inherited sockets or remote input/output protocols. Restrict parser/protocol/demuxer/codec surface to the reviewed standalone synthetic container. No HLS/DASH/concat playlist imports, external references, file URL interpretation, recursive inputs or downloads. Protocol flags alone are insufficient network isolation. |
| Environment/FDs | Explicit minimal environment, fixed locale/timezone, private home/temp/cwd, pinned binary/library/plugin search paths; no inherited provider/cloud/database/session/SSH credentials, proxies, user config or ambient dynamic-loader variables. Close all descriptors except explicitly needed source/output and bounded diagnostics pipes. No ledger/proof/storage keys in child environment or argv. |
| Filesystem | Private marked per-operation workspace with restrictive ownership/permissions; read-only source descriptor and exclusive output descriptor. No application/source directories mounted. Disk quota also covers scratch, parser spill, logs, partial outputs and failed/quarantined artifacts. Path isolation is enforced by the OS, not trusting parser behavior. |
| Resource budgets | Authoritative admission quotas plus OS CPU, memory, process/thread count and disk/I/O ceilings; monotonic wall timeout, maximum input/output frames, dimensions, pixels per frame and total decoded pixels including keyframe pre-roll/validation. Bounded queue/concurrency, bounded stderr/stdout draining and descriptor counts. Reject before resource acquisition if audit/recovery capacity cannot be reserved. |
| Ownership and termination | Supervisor owns the entire containment/process group from creation. Cancel/timeout kills and reaps all descendants, closes writers and proves containment quiescent before capture/quota release. PID alone is unsafe after reuse; pin original supervisor boot identity, containment identity and reviewed kernel process handle. Cannot prove all descendants stopped → UNKNOWN and retained holds. |
| Parser hostility | Treat both input and output as hostile. Bounded probing is itself dangerous parsing and requires the same isolation. Reject malformed/truncated/encrypted/DRM media, unknown metadata/side effects, ambiguous topology, unexpected tracks, discontinuities and unsupported streams. Do not attempt repair/decryption/fallback. |
| Version/capability | Pin encoder, decoder, probe, linked libraries, binary/build digests, enabled codecs and argument-policy version. Explicit source decoder and output encoder capability acceptance, no auto-selection or PATH discovery. Version change requires a new execution profile and review; never rehash old M7/M8 payloads. |

Containment reduces parser-exploit consequences; it does not prove absence of sandbox escape. A compromised host kernel, privileged administrator, trusted supervisor, source authority or validator remains outside the disposable protocol's guarantee and needs independent operational controls. A validator that parses output runs in a separate constrained boundary, with only necessary read-only bytes; a broker redeems its scoped proof, so decoder code receives no general ledger credentials.

Probing is not a free pre-admission operation. The independent source authority may hash an already authorized immutable byte version without interpreting it. Any future probe/decoder process requires a prior durable **inspection-phase** reservation under the original scoped work claim, resource quota, acknowledged checkpoint and its own one-use phase permit. Keep original source-inspection and encoder phase IDs/results separate. Encoder admission additionally requires definitive accepted inspection evidence; UNKNOWN inspection blocks advancement and cannot be bypassed by a new request. The section 7 state machine applies to each effectful process phase; a probe permit cannot launch an encoder. Independent output inspection may be repeated only as an explicitly authorized bounded validation of existing immutable bytes, with its own supervised identity/quota and no encode authority. An unresolved validation process must be contained/reconciled before another parser can consume its resources. M8-03 simulates these phases without invoking any parser.

## 5. Codec, exact frames and stream validation

The existing profile is MP4 / H264_AVC / YUV420P / 640×360 / 25/1 FPS / 1/1000-second timebase, one video stream and **zero audio, subtitle, data or attachment streams**. All times are integer milliseconds, boundaries exactly 40 ms; half-open cuts preserve speed 1:1, CUT_ONLY and contiguous output with no filler. No scaling, cropping, rotation, VFR or silent timing adjustment. Source declares exactly one video and zero or one excluded audio stream. M8-01 declares engine NOT_ESTABLISHED and encoding DISABLED.

| Evidence layer | Necessary independent check |
| --- | --- |
| Declared source metadata | Replay exact unchanged M8 observation/profile/fingerprint against selected saved M7/M6. Remains unprobed and without possession. |
| Actual probe | Separate isolated parser reads the verified pinned source. Full stream inventory/container, encryption, dimensions, pixel format, codec/profile, rational FPS/timebase, origin, rotation, counts/duration/metadata must be supported and reconcile with declarations. Header duration/average FPS alone is insufficient. |
| Decoder capability | Pinned reviewed decoder accepts actual bytes under limits, validates every relevant frame/timestamp and required pre-roll. Reject decode errors, missing frames, unsupported configuration or noncontiguous source timing. A codec label does not establish decodability. |
| Encoder capability | Independently reviewed pinned encoder can produce the exact approved execution profile under limits. A successful capability declaration does not verify a particular output. |
| Validated output | Independently reopen the sealed exact output version, hash every byte and measure topology/container/video codec/pixel format/dimensions/rational rates/timebase/frame count/PTS/DTS and duration. Successful process exit is only a result fact. |

Use checked rational arithmetic, not floating tolerance: `frame = ms * 25 / 1000`, `tick = ms * 1000 / 1000`, exact divisibility required. Total measured frames must equal the sum of segment frame counts; presentation frame n has PTS `40*n` ticks in the required 1/1000 timebase and the final frame ends exactly at totalOutputMs. Reconcile packet, decoded presentation and container durations/counts; reject missing/extra/duplicate frames, negative origins, gaps, nonmonotone timestamps, ambiguous edit lists or hidden delay. Validate DTS/decode order separately; do not equate PTS and DTS for arbitrary H.264. A proposed restricted no-B-frame/all-intra execution profile would simplify this but still needs later encoder/capability review; it is not part of the existing M8 profile and is not approved executable configuration here.

**Decode/re-encode is required for the proposed first real executor; stream copy is unsupported.** Keyframe seeking may begin earlier than a cut to reconstruct references, but pre-roll frames never enter output. Arbitrary matching H.264 streams are not accurately cut by byte copying. Independently check the source-frame-to-output-frame mapping and exact M7 presentation order, including nonchronological cuts. No frame rounding, timestamp repair, filler or change to immutable M7 bytes on failure; return a strict UNSUPPORTED_MEDIA/UNREPRESENTABLE_TIMING outcome and retain the original identity.

**Unresolved fidelity gate:** correct topology, duration and frame count do not prove that the video depicts the selected source frames. A later real milestone must define/test independent decoded-frame association/content fidelity for the chosen encoder: exact pixel comparison only if the codec configuration actually guarantees it; otherwise an explicitly reviewed lossy fidelity policy with stated detection limits. A perceptual threshold is not cryptographic proof. No second encode/rerender is a validation shortcut. This design cannot certify frame content or accurate cuts without real adversarial execution tests; M8-03 fake bytes cannot close this gate.

## 6. Proposed contracts, identities and admission ledger

Suggested new domains are reserved **design names only**, not exports: `story-recap-execution-{request,source-binding,admission,submission,checkpoint,result,stage,verification,artifact,access,lifecycle,recovery,audit}-v1`. Fake verification uses a separate `story-recap-execution-fake-byte-verification-v1` discriminator, never the future real-media verification domain. Execution profiles additionally use `story-recap-execution-profile-v1`. No existing M1–M8 or M5 audio hash changes. Hash actual source/output bytes with raw SHA-256; label them byteSha256, not recipeHash or verification authority.

Proposed envelopes use strict bounded canonical JSON: version, environment `DISPOSABLE_FAKE_ONLY` for M8-03, owned fixture namespace, exact four-part scope, immutable payload and permanent restrictions. IDs/hashes/domains/integers are validated without coercion; unknown fields, URLs/paths, embedded credentials, filter graphs, role claims, real-execution variants and oversized/deep structures reject. Tokens/nonces/MACs are private protocol material, not content hash inputs or returned DTO fields. Proposed ports below are conceptual signatures, **not implemented TypeScript**:

| Proposed interface | Required inputs / independently owned output |
| --- | --- |
| `SourceAuthority.resolveOwned` | Current service context + exact source reference → opaque immutable version binding, byte hash/count, epochs/hold; no caller path or network resolver. |
| `CurrentnessAuthority.captureAndFence` | Current actor/scope + full saved M7 reference → independent replay/capture, exact M7/M6 heads/parents/source/narration/policy bindings. Final ledger transaction reacquires writer fences. |
| `ExecutionLedger.reserve / checkpoint / observeOriginal / recoverOriginal` | Strict request/key + independent expected recipe/source/profile; reservation/CAS, immutable original outcome and read-back. Recovery never returns a launch permit. |
| `ProcessOwner.executeOnce / cancelAndObserve` | Original acknowledged admission, source hold, owned stage and nonserializable one-use capability → original supervised journal/quiescence evidence. M8-03 implementation is an in-memory fake, with no child media process. |
| `PrivateOutputPort.reserveExact / captureCreateOnly / readExact / deleteExact` | Authority-generated namespace/version and operation-bound reservation; bounded exact bytes, sealed immutable version and conditional deletion result. No overwrite, latest read, list-prefix delete or caller path. |
| `OutputAuthority.verifyExact` | Independently resolved original outcome/recipe/source + exact immutable output version → byte/integrity evidence, separately typed fake or real measurements and private action proof. |
| `ArtifactLedger.finalize / inspectPrivate / quarantine / beginGc / finishGc` | Current independent context, expected owner generation/revision, original operation/version and exact proofs → immutable artifact or explicit unavailable/conflict/UNKNOWN. |

Freeze exact field parsers/proof serialization and privilege catalog before future fixture implementation. Common immutable bindings: original operation ID; canonical request hash/key; full saved M7 identity including record/plan domains and version; exact M6 identities/dependency and immediate parents; source/narration/candidate lineage; complete M8 recipe/dependency/profile hashes; distinct execution-profile hash; immutable source-byte version/hash/count; original submission generation; namespace and restrictions. Do not accept replacement captures from the request. Re-run public `validateRenderRecipe` using independently owned expectations; a rehashed recipe cannot self-register a source or profile.

Logical ledger aggregates (no SQL supplied): scoped key slot, canonical recipe claim, source binding/hold, request, quota reservation, submission/checkpoint, immutable original-result journal, stage attempt, verification receipt, immutable artifact, availability, owner lease, private read hold, recovery/quarantine hold, exact-version GC intent/tombstone and append-only audit. Composite keys/FKs include namespace and tenant/project/movie/studio. One original submission per canonical work identity; one immutable final artifact per operation. Same key + identical canonical request discovers the original; same key + different content conflicts. A different key aliases the existing canonical work, never creates a second execution. Conservatively allow only one unresolved original operation per exact scope in M8-03, so new source/head/profile/key/generation cannot bypass unresolved work. Distinct scopes still share global quota limits.

Submission generation is fixed at 1 for the first protocol. Worker owner generation can advance only for observation/recovery CAS; a generation is not a retry. Reserve quotas atomically with the request, including source/staging/quarantine/log/audit/recovery/tombstone headroom. Retain unresolved quotas; do not GC UNKNOWN to admit another request. All metadata transitions and their audit are atomic in short transactions; any failed audit rolls back metadata, not an external process/storage effect.

Future disposable gateways need a separate non-login owner and minimal authenticate/admit/observe/validate/finalize/read/recover/GC action roles. No direct table/column DML/SELECT, owner membership, DDL/TEMP/server-file/program privileges or PUBLIC helper execution. Fixed qualified search paths and catalog allowlists; no inherited production authentication or broad M5/R4 role grants. A hash CHECK cannot authenticate a result or validate media. Purpose-separated one-use proofs bind action, environment/namespace/scope, principal/session or service identity, operation, exact version/hash, owner generation/revision, backend/transaction, nonce and DB-evaluated expiry. Consume proof with fact/audit atomically. A fresh validation/read proof can be issued after current authorization; a recovered execution permit cannot.

Admission/finalization currentness locks must be on the **same backend/transaction that commits the execution/artifact fact**, not a prior M7 read connection. Cooperate with existing M7/M6 source/session/grant/policy/head writers; document a compatible global lock order before implementing wrappers. Preserve existing M7 order (key/scope/session/grant → M6 scope/session/grant/policy/dependency/head → M7 policy/head), then new operation/quota/artifact/hold locks in stable ID order. New scopes/slots must not acquire these in reverse. No external byte/process I/O while holding SQL locks; byte verification is preliminary until the final version/source/policy fence. Deadlock/timeout recovery looks up the original metadata operation and may retry only a proved safe metadata transition, never a launch.

Session expiry/revocation and exact scope/action permissions are checked at every admission/finalization/read. Browser mutation checks, if ever separately exposed, require server-verified session, method, exact origin, Fetch Metadata and CSRF, never submitted roles. M8-03 has **no application endpoint**. DB current wall time is checked after lock waits and at commit, not transaction-start time. Process deadlines use monotonic time with reviewed mapping; remote revocation coherence is a production blocker. Revocation and OS start are not one atomic transaction: define the permit-redemption fence as the admission linearization point. A revocation serialized afterwards may race already admitted start; cancel/kill/quarantine handles it. Do not claim instantaneous revocation of already consumed bytes/CPU. A stronger requirement needs a separately proven supervisor/revocation protocol before real execution.

## 7. Execution lifecycle and UNKNOWN

Separate three state axes; no state is silently overloaded as “completed.”

```mermaid
stateDiagram-v2
  [*] --> RESERVED
  RESERVED --> CANCELLED_UNSTARTED: Proven before checkpoint
  RESERVED --> CHECKPOINTED: Durable admission and quota commit
  CHECKPOINTED --> RUNNING: Original ACK plus one-use permit
  CHECKPOINTED --> UNKNOWN: Missing ACK or ambiguous start
  RUNNING --> EXITED_ZERO: Original supervised result
  RUNNING --> FAILED: Original failure and quiescence
  RUNNING --> UNKNOWN: Lost process ownership or result
  UNKNOWN --> EXITED_ZERO: Original evidence only
  UNKNOWN --> FAILED: Original evidence and quiescence only
```

CHECKPOINTED means the ledger committed, **not** that the original process observed the acknowledgement or started. Only that original acknowledged control flow can redeem its process-owned capability, burn it before the first asynchronous boundary and pass a last currentness/deadline/ownership check to the trusted supervisor. There is no serialized token/ACK marker that recovery can deserialize into launch authority. At most one attempted start is the goal; exactly-once execution across DB commit and OS process creation is not claimed. Crash between burning authority and recording start can strand an execution as UNKNOWN even if it never ran. The protocol accepts that loss of liveness.

```mermaid
stateDiagram-v2
  [*] --> RESERVED_OUTPUT
  RESERVED_OUTPUT --> STAGING: Exclusive registered target
  STAGING --> CAPTURED: Original result and no remaining writers
  CAPTURED --> VERIFIED: Independent exact-byte verification
  VERIFIED --> COMMITTED: Current final admission and CAS
  RESERVED_OUTPUT --> QUARANTINED: Cancellation or integrity uncertainty
  STAGING --> QUARANTINED: Partial or unknown output
  CAPTURED --> QUARANTINED: Invalid bytes or stale lineage
  VERIFIED --> QUARANTINED: Revoked or conflicting finalization
```

Committed metadata remains immutable. A separate availability axis is AVAILABLE → QUARANTINED/RETIRED → DELETE_PENDING → DELETED. An uncommitted quarantined attempt may be re-inspected under fresh validation authority only when the **same original definitive outcome**, exact version and current authorization are proven; it is never overwritten or relabeled by a stale worker. The first fake protocol has no automatic rehabilitation of committed quarantined artifacts.

| Transition / event | Legal effect and CAS guard | Illegal effect |
| --- | --- | --- |
| Reserve same key/recipe | Unique scoped key/work claim, exact payload comparison, current grants and quotas; discover original operation | New submission because acknowledgement was absent |
| Checkpoint and start | Commit reservation/checkpoint/quota; original caller observes ACK; consume once with original submission and owner/revision/deadline | Starting on tentative commit, replaying stored ACK, rotating owner/key to recreate authority |
| Observe original result | Authenticated supervisor journal bound to original operation/submission/sandbox identity and immutable outcome; matching duplicate idempotent | Caller callback/blob/process PID alone resolving UNKNOWN; conflicting result overwrites |
| Cancel | Before checkpoint with proved no launch: CANCELLED_UNSTARTED. Thereafter durable cancel flag, terminate original group, observe actual result/quiescence | Treating cancel/lease expiry as proof of no process, no output or no resource use |
| Claim recovery | New owner generation + revision CAS; inspect original journal/containment/owned exact versions | New submission generation or start permission |
| Finalize | Original EXITED_ZERO, quiescence, no cancel, verified exact output and current source/M7/M6/permissions; one artifact under CAS | Exit zero alone, stale worker, new hash to repair corrupt bytes or late success after cancel |
| UNKNOWN | Hold original work slot/quota/source/output/evidence; original authenticated evidence may resolve only that attempt | Automatic rerender, new key/generation/profile/source to evade ownership, treating NOT_FOUND as rollback |

Keep immutable original-result observations even if permissions/leases later expire. Result observation is historical truth, not eligibility. A restricted service may preserve evidence after user revocation but cannot finalize or privately serve it as that user. A late obsolete worker's evidence may be preserved only through the current observer/recovery authority with original binding; its obsolete CAS/proof cannot mutate state. No render process permission, fake result or timeout authorizes a paid provider call, voice synthesis or spending retry.

## 8. Private output capture, verification and reads

Required order: **Reservation → Exclusive Private Staging → Media Execution → Exact Output File Capture → Independent Byte Verification → Immutable Artifact Finalization → Authorized Private Read.** Reserve target/version/nonce in the ledger before creating any writable output. Only the supervisor supplies that exact stage descriptor. Source/renderer-controlled names and path enumeration never select an artifact.

After a trusted original result and proven descendant quiescence, revoke all writers, close write descriptors and capture the complete bounded output into an owner-enforced immutable exact version. If capture requires a create-only copy, it occurs **before** verification/commit and receives its own version; compare full bytes and verify that final version independently. No required post-commit rename/copy/ACL promotion/publication. Stage bytes stay private throughout. Storage and PostgreSQL do not form a distributed transaction; storage ambiguity creates a held reconciliation case, not assumed rollback.

| Immutable artifact binding | Required content |
| --- | --- |
| Provenance | Full saved M7 identity/version/record+plan domains/hashes, M6/source/narration/candidate lineage, immediate parents, relevant currentness/policy observations; no substitution of a current newer head |
| Planning | Exact M8 recipe/dependency/profile/policy hashes and distinct execution-profile/argument-policy identity |
| Possession | Independent actual source-byte SHA-256, byte count, immutable private version and original source handle binding; not the declared observation hash |
| Execution | Original operation/request/submission generation, acknowledged checkpoint identity, trusted process/supervisor identity, pinned renderer/probe/decoder build/version/digests and immutable original result |
| Output | Real full-file SHA-256, exact byte count and exact private storage version; never recipeHash as output digest or an ETag as byte verification |
| Measurements | Actual video/audio/subtitle/data/attachment topology, codec/container/pixel format/dimensions, rational frame rate/timebase, measured decoded frame count, exact duration and timestamp reconciliation; independent verification policy/status and fidelity limitations |
| Safety | Synthetic ancestry permanent; human approval NONE, SOURCE_VERIFIED not issued, TTS/publication false, spending NONE, original audio EXCLUDED, synthesized narration NONE; no M5 bytes or sync |
| Availability | Immutable initial verification fact; separate revisioned quarantine/retention/read-hold/delete state with reason/evidence references and permanent tombstones |

Metadata for real measurements is **not fabricated in M8-03**: fake byte integrity uses SIMULATED_NOT_MEDIA, media verification NOT_PERFORMED, actual frames/duration/codec/stream topology null/NOT_MEASURED. Intended simulated frame/track observations are separately labeled assertions from an independent fixture, never measured video. Fake source bytes likewise do not become a real movie merely because their SHA equals a synthetic M1 fixture fingerprint. Real and fake verification parsers reject each other's discriminators.

Private inspection reauthenticates exact scope/action, source/head policy and availability, acquires a bounded exact-version read hold, reads/verifies bytes, then rechecks authorization/availability at its response fence. Revocation before that fence denies; previously delivered copies cannot be recalled. Missing/corrupt data returns unavailable/quarantine, never cached success/latest key/alternate artifact. First fake inspector buffers the small bounded blob fully before returning it to an authorized test caller; no streaming partial response. No public storage, signed URL, application endpoint, inline browser playback, MP4 preview, or auto-decoding of hostile outputs. Future real inspection must separately review parser exposure and bounded streaming/read-hold policy.

## 9. Audio and other-stream exclusion

Original movie audio is always EXCLUDED. Output must have exactly one video stream and audio = subtitle = data = attachment = 0, including hidden/alternate tracks, attached cover art, chapters/external references or unreviewed metadata payloads. No synthesized narration or M5 fake WAV input is opened. Fake WAV duration/silence never controls placement, padding, speed or sync. Real Myanmar voice and publication remain separately gated.

Mandatory **future real-execution test**, not run here: independently owned source fixture contains video plus distinguishable audio and adversarial extra-track variants; after capture, a separately isolated independent validator inventories the actual exact output container and decodes/counts permitted video. Assert one video, no audio/other tracks, exact frame/timestamp/byte provenance and no trailing hidden track/metadata payload; intentionally supplied outputs containing audio/data/subtitles/attachments must be quarantined even when command construction and a claimed profile say “no audio.” Unsupported source extra tracks reject before execution. Never trust command flags or the renderer's JSON as this test's oracle. M8-03 only simulates independent topology disagreement and cannot certify actual audio exclusion.

## 10. Recovery, quarantine, GC and fault injection

Recovery operates on original IDs/exact versions with fresh restricted service authority. Process, storage and commit uncertainty are separate facts. Never reconstruct a launch permit. Ownership expiry does not prove process death or deletion safety. Recovery is bounded explicit orchestration, not a new queue/worker daemon.

| Failure cut / injected case | Required durable disposition and independently checked assertion |
| --- | --- |
| Admission insert/quota/audit rollback | Atomic metadata rollback; no start or unregistered writable target. Same key lookup decides committed ownership; no ambiguous-start fallback. |
| Reservation/checkpoint commit ACK lost | Read original key/hash/operation. No acknowledged original path → zero new starts; retained checkpoint becomes UNKNOWN if outcome cannot be established. Persisted ACK marker cannot mint authority. |
| Crash before checkpoint / between permit burn and start | Proved pre-checkpoint cancellation may release resolved resources. Any ambiguous post-checkpoint cut retains UNKNOWN, even if the fake start counter happens to be zero. |
| Crash immediately after start or before original journal | Supervisor evidence/process ownership must be inspected. Unproven quiescence retains source/output/quota holds; no PID-reuse assumption. Fake restart tests must show zero second invocation. |
| Failed probe / malformed, encrypted or unsupported streams | Deny source eligibility, record bounded safe reason and retain owned diagnostic evidence per policy; no repair/download/profile fallback. Real probe is itself execution requiring later authorization. |
| Encoder crash, timeout, resource-limit or cancellation | Terminate/reap entire original containment; definitive failure only with authentic outcome/quiescence. Retain partial exact stage in quarantine; no automatic rerender. |
| Partial/truncated/oversized/corrupt output or audio leak | Independent validator rejects, quarantine exact version/result; never patch headers, trim tracks, overwrite bytes or update claimed hashes to pass. |
| Lost storage create/capture ACK | Reconcile the pre-reserved exact version with registry and byte evidence. Absence is not proof process never ran; no create under a fresh version to conceal uncertainty. Conflicting bytes quarantine. |
| Lost verification/finalization commit ACK | Read same receipt/artifact under current authority, independently verify exact version. Return same immutable identity or unresolved/quarantine; no rerender/second artifact. |
| Output missing/corrupt after commit | Deny read and quarantine availability; retain immutable artifact/history. No replacement render or adoption of another version. Backup/restore is a separate unresolved policy. |
| Stale source/M6/M7 head or revoked principal/policy | Admission/launch fence denies; after start cancel/quarantine and retain original historical result. Finalization/read deny current eligibility. No silent rebase or M7 rewrite. |
| Duplicate/conflicting result / concurrent finalizers | Matching original fact idempotent; conflict quarantines. One artifact insert and audit under revision/owner CAS. Audit failure rolls back metadata. |
| Old owner resumes after recovery takeover | Obsolete mutation/proof denied; current observer can retain original authentic result, but cannot start a replacement. No stale worker capture/finalize. |
| Reader/finalizer versus GC | Shared availability/read-hold fence prevents delete while readers/writers/references remain. DELETE_PENDING excludes new holds/finalization. Paused old reader cannot serve after losing its final authorization fence. |
| Delete ACK lost / GC crash before or after deletion | Immutable exact-version intent/tombstone retained; reconcile same version only. No ID reuse, prefix scan deletion or resurrection of a deleted artifact. |
| Temporary orphan / foreign object | Bounded owned namespace inventory can register a quarantined orphan hold after ownership proof. Unregistered/foreign object cannot be adopted/deleted by age/tag/path alone. Preserve unresolved execution evidence. |
| Database/storage rollback, inconsistent restore or supervisor loss | Stop admission/read/GC pending independent reconciliation; no restored checkpoint recreates launch authority. Fake service restart is not power-loss or multi-host durability certification. |

Inject barriers immediately before/after every commit, ACK, fake launch boundary, journal, storage write/capture, verification, finalization, read-hold and deletion fence; test independent concurrent owners/connections and service-child restarts while later authorized owned fixtures persist. Include rollback/audit failure, expired proof after a lock wait, quota exhaustion and old-owner late callbacks. Original start count must never increase during UNKNOWN recovery. Matching duplicate metadata requests may converge; conflicting requests fail without modifying original M4/M6/M7 records.

GC requires current restricted authority, exact namespace/operation/storage version/hash/length, definitive process quiescence and resolved outcome, retention expiry, no pending finalizer/reference/read/source/quarantine/legal hold, and a fresh revision/owner CAS. The intent and audit commit an irreversible DELETE_PENDING fence before storage deletion; finalizers/new readers reject it. Delete outside SQL only the exact version with the expected digest/length and intent nonce. Finish with an immutable acknowledged tombstone; ambiguous delete keeps its intent and reconciles the same version. A missing object is not a rolled-back intent.

Read holds must remain effective for the full read; renewal is bounded and cannot cross a delete fence. **Wall-clock expiry alone does not prove a reader or process has stopped using a descriptor.** Require completion/closure or supervised cancellation/quiescence before reclaiming its hold; uncertain readers retain the hold and deny further responses. No forced garbage collection of unresolved artifacts because owner/read leases expired, disk is full or another request wants quota. Tombstones/key/work claims and audit are not purged in the first fake protocol. No prefix/directory deletion, caller-controlled deletion path, cross-tenant hash dedup reclamation or “delete everything older than lease” operation. Whole-fixture teardown is a separate proven fixture-owner action, not an artifact GC shortcut; failure evidence/logs remain preserved.

## 11. Threat model and limits of this review

Assets: source confidentiality and exact bytes; scoped saved M7/M6/M4/R4 provenance; execution/key/quota ownership; private outputs, immutable identities, original results and audit; credentials, host/process availability and safe retention. Attackers include an untrusted browser/test caller, another tenant, forged callbacks, compromised media parser/renderer, stale worker, corrupted storage and racing reader/GC. Trusted fixture identity/source/currentness authorities, proof broker, ledger enforcement, supervisor and host kernel are assumptions; compromise of those or privileged administrators is not defeated by hashing. Separate privileges and independent observations reduce single-process trust, not eliminate it.

| Threat / mandatory negative case | Required prevention and observable denial |
| --- | --- |
| Cross-tenant source/artifact access, privilege escalation | Independently resolved scope/actions, composite namespace/scope FKs, separate source/read/launch/GC grants; guessed handle, role JSON or M7 save right cannot launch/read. Catalog rejects elevated/inherited privileges. |
| Forged saved M7 identity or rehashed recipe | Reload exact record/parent/audit/dependency and current M6/source, regenerate complete M8 recipe; reject changed selected order/evidence/candidate/domains even with matching self-hashes. |
| Replaced source bytes / TOCTOU | Independently full-file hash immutable pinned version; writable alias, changed inode/version, hard link, mutable path swap or fingerprint mismatch denies. Strong immutability must be demonstrated later. |
| Symlink, traversal or arbitrary path/URL | Opaque scoped registry, descriptor-relative private ownership, no-follow/exclusive target policy; devices/pipes/foreign roots/URLs reject with no fallback access. |
| Malicious metadata, unsupported/ambiguous tracks | Minimal reviewed isolated parsers and bounded strict actual topology/timing checks; encrypted/truncated/VFR/extra-track/external-reference cases reject. Claimed profile is no oracle. |
| Resource exhaustion | Quotas reserved before start, OS limits, decoded pixel/frame/pre-roll caps, bounded queues/logs/staging; over-limit and UNKNOWN occupancy deny admission rather than evict evidence. |
| Sandbox escape assumptions / child leaks | Unsupported host fails before parser/start; isolation escape testing and descendant kill/reap required later. Process-group exit alone cannot release holds when descendants survive. |
| Arbitrary argv/filter graph, credential/env leakage | Fixed direct invocation, no caller strings, allowlisted env/FDs and no host/credential mounts. Inspect negative fixture effects without real media in M8-03. |
| Audio/other-track leakage or forged measurements | Independent exact-output verification; reject valid-looking output with audio/hidden tracks or metadata claiming unmeasured frames. Fake measurements never become real receipts. |
| Duplicate execution / lost ACK / UNKNOWN-driven rerender | Permanent original work/key claim, original ACK plus consumed one-use permit, same-operation recovery only; fresh key/submission/owner/profile cannot bypass unresolved scope. |
| Stale owner generation or late result | Submission identity immutable, CAS owner/revision and action proof bound to original execution; conflicting result quarantines, late cancellation success cannot finalize. |
| Unverified output adoption | Byte hash plus exit zero insufficient; require owned original result/quiescence, sealed exact version and independent verification/fidelity policy. Found blob alone cannot resolve UNKNOWN. |
| Unsafe GC / concurrent private reader | Exact-version delete intent, read/reference/quarantine holds, retention and quiescence; expired lease/prefix/tag/age cannot delete. Lost ACK preserves tombstone. |

Static design can assess interface compatibility and proposed controls. It **cannot certify** actual source possession, filesystem race resistance, sandbox effectiveness, parser safety, accurate cuts/frame fidelity, measured streams/audio exclusion, process/descendant cleanup, real resource limits, multi-host durability, revocation latency or crash/GC behavior. Those need separately authorized implementations and adversarial runtime tests. No runtime security acceptance or production readiness is claimed.

## 12. Separately authorized M8-03 plan — FAKE_ONLY

**Ready for separate authorization as fake-process-only. Do not begin automatically.** No FFmpeg, ffprobe, parser/decoder/encoder, playable MP4/WAV, source movie, network or paid provider. Later real local media execution needs another explicit milestone/authorization and closure of section 13 gates. A fake port named ProcessOwner must never hide a real spawn/engine adapter or environment switch.

Proposed initial fixture ceilings, to freeze before coding: 2 MiB execution request envelope plus unchanged M8's stricter nested limits; at most 32 MiB independent capture; maximum 64 recipe segments; fake source/output blobs each ≤1 MiB, total fixture bytes ≤32 MiB, at most 16 operations/32 registered versions, one unresolved operation per scope and global simulated concurrency 1. Reserve 4 MiB of that total and explicit metadata slots for audit/quarantine/recovery/tombstones; admission stops before consuming that reserve. No truncation/eviction/oldest-record deletion. Fake elapsed deadlines use injected clocks/barriers, keeping DB deadline checks distinct; they do not certify real load/timing. No real media size/duration budget is approved by these fake numbers.

| Stage | Implementation-ready scope and acceptance obligation |
| --- | --- |
| A. Strict execution contracts / independent authorization | New server-only domain parsers and permanent FAKE_ONLY restrictions; separate fixture identity/session/actions, expected M7/M6/source/profile registry and strict real/fake verification discriminators. Independent fake source bytes may define the fixture's M1 fingerprint at setup, never from requester input. Reject production modes and casts of disabled M8 proposals. No route/Server Action/default adapter. |
| B. Disposable ownership ledger | Only after separate authorization, newly owned PostgreSQL through existing ownership helper, separate scratch namespace/least-privilege action wrappers/catalog checks. Immutable request/key/work/submission/result/artifact/audit rows, revision/owner CAS, quotas, availability/holds/tombstones. Same database cooperating M6/M7 fences, no app datasource/migration or broadened existing roles. Freeze exact schema/proof wire/catalog before installation. |
| C. Fake process/output ports | Deterministic in-memory fake invocation with counter and independent owned journal, explicit outcomes/ACK cuts and barrier faults. No child media subprocess or network. Any child process used solely for service crash/restart testing must be separately enumerated in that authorization and have no media libraries/engine. Recovery lacks invoke capability. |
| D. Independently owned temporary storage | Only new marked private temp roots, authority-generated opaque `.blob` versions and bounded arbitrary non-media bytes; separate expected source/output fixtures, exact create/read/delete and ownership/symlink tests. M5 audio adapter not reused as a video schema. Exercise service restart with temp fixture retained; no filesystem media discovery or app storage. |
| E. Admission/currentness/no-rerun recovery | Independently reload/replay real saved synthetic M7/M6 fixtures and fence epochs/heads; same-key duplicate, cross-scope denial, stale source/parent/policy/session, lost checkpoint ACK, ambiguous start, new-key/generation bypass and immutable-original tests. Original fake start count stays ≤1 and unchanged on recovery. |
| F. Fake verification / quarantine | Compare actual opaque fake blob SHA/count/owned version to independently registered expectation and original fake journal. Separately simulate intended stream/frame observations for rejection tests, labeled SIMULATED_NOT_MEDIA. Actual media measurements remain null/NOT_MEASURED and verification NOT_PERFORMED. No simulated artifact can satisfy a future real verification schema. |
| G. Crash/restart/concurrency/GC | Execute every applicable section 10 cut, independent connections/owners, stale callback/finalizer/read/GC races, orphan holds, delete ACK loss, quota/retention/proof-expiry cases, no rerun and preserved audit. Preserve existing M4 assertions/logs; do not call timing failures flaky. No claim of real process/kernel/power-loss guarantees. |
| H. Security/catalog/production boundaries | Catalog deny tests, import graph and production route/action/client/server bundle audits proving no test auth, keys, connections, adapters or fixture transport activated. Fake byte/profile markers do not authorize production. Run separately authorized focused/regression/component/browser/type/lint/build checks with dummy app datasource and exact accounting then. Zero approval, SOURCE_VERIFIED, spending, paid/provider/TTS/network/media-engine calls. |

M8-03 completion would prove only the tested disposable ownership/recovery protocol and independent **fake byte integrity**. It would not prove video validity, audio exclusion or media execution safety. No Studio render button, production transport/authentication or M8-04 scope is implicitly authorized.

## 13. Unresolved decisions and production blockers

| Decision / risk | Disposition and closing evidence required |
| --- | --- |
| Metadata versus execution authority | Resolved design: new execution-specific domain/authorization; existing M8 recipes remain disabled and synthetic restrictions immutable. Implementation still absent. |
| DB/process/storage atomicity | Resolved safety rule: acknowledged original checkpoint + one attempted start, same-operation reconciliation, no ambiguous rerender, sealed output before immutable commit. No exactly-once or distributed-transaction promise. |
| Real source immutability and access rights | BLOCKED: choose/test authority-enforced snapshot/handle mechanism, immutable byte versioning, bounded possession, race/revocation protocol and real source ownership. M8-03 fake ownership is insufficient. |
| Actual sandbox / binaries / codecs | BLOCKED: select and adversarially prove supported isolation, version-pinned parser/decoder/encoder, descendant termination and resource limits on the intended host. No mechanism/binary availability established here. |
| Accurate cuts / timestamp policy / content fidelity | BLOCKED: capability review of the narrow execution profile, decoded-frame mapping, PTS/DTS/container reconciliation and explicitly bounded lossy fidelity verification. Fake counters cannot certify these. |
| Exact M8-03 wire/DDL/catalog and compatible lock order | Pre-implementation review gate within separately authorized stage A/B: freeze bounded fields, domain discriminators, transaction proof bytes, action privileges and all cooperating writer lock orders before scratch installation. No schema exists from this document. |
| Storage durability / backup / restore / read strategy | Production BLOCKED: exact immutable-version/create-only/delete guarantees, encryption/key custody, lost-ACK and restore reconciliation, multi-host read holds and bounded streaming policy. Same-UID temp fixture checks are not a storage SLA. |
| Authentication / tenant source isolation / cross-system revocation | Production BLOCKED: genuine issuers, tenant resource gateways/RLS, key rotation/custody, coherent revocation and approved timing semantics. Existing disposable sessions and trusted source SELECT inheritance are not production auth/complete tenant RLS. |
| Retention / quarantine / operator powers | BLOCKED for real data: explicit retention/legal holds, protected audit/tombstones, recovery/GC authority and escalation when UNKNOWN exhausts quotas. Never reclaim unresolved artifacts automatically. |
| Voice / publication / human approval / spending | Absent and independently gated; synthetic or merely saved edits have no exact-version human approval. No current artifact gains TTS/publication/provider permission from this design. Real Myanmar voice needs its own approval/capability/spending acceptance. |
| Historical M4 expiry incident | **UNRESOLVED.** M1-last actual-wire-before-expiry positive repeat 2 expected one fake-wire entry and observed zero under a 700 ms confirmation. Later unchanged passes do not identify the cause. Preserve control source/assertions/deadlines and logs; no runtime rerun or repair claim in M8-02. |

For any later recurrence of the M4 incident retain DB current/transaction wall times, lock waits, session/confirmation/lease epochs, original checkpoint ACK observation, monotonic permit deadline, ownership generation and actual fake-wire boundary. Distinguish a legitimate denial from a broken positive control; do not widen deadlines or erase assertions. The existing expiry-control source SHA-256 is `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`; static preservation is checked, not timing correctness.

## 14. Static verification and Git disposition

Static verification receipts are retained under `/tmp/movie-translator-m8-02-cfe705jx/`. Checks below concern text/source/index only; no project runtime module is imported for audit. Lint's package script is `eslint`, with no prelint hook and a static Next/TypeScript ESLint configuration; it does not invoke infrastructure or media. Only reviewed text sources are hashed, never media/assets.

| Check | Result |
| --- | --- |
| Exact branch/HEAD/clean entry | PASS: expected branch and full baseline above; initial working tree/index empty. `baseline.json` records SHA-256 for 39 reviewed implementation/fixture text files. |
| Actual exports/references and hash domains | PASS: 72 named export declarations in 31 source files, six M7 repository methods and eight M5 durable methods checked textually; public M8 barrel and pure replay references confirmed. 48 existing domains match source literals/static builder expansion; 15 proposed domains are distinct. No project runtime import/test execution. `static-audit.json`, `staged-audit.json`. |
| Local link targets and diagram structure | PASS: 39 local link targets; three balanced Mermaid blocks, 11 architecture nodes/20 edges and 19 state transitions checked structurally and reviewed manually. No renderer/package/network call or rendered-syntax certification. |
| Lint | PASS: `DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable pnpm lint`, exit 0, no diagnostics (`lint.log`). No datasource access. |
| Working/staged whitespace, secret patterns, exact-file inventory | PASS: `git diff --check` and `git diff --cached --check`, zero owned-document secret-pattern/trailing-whitespace matches; exactly this new document staged, staged bytes equal reviewed content. The same checks are repeated after this results update and before commit. All 39 reviewed text hashes and the original expiry-control SHA remain unchanged; no tracked implementation changes. |
| Runtime tests / TypeScript / build / browser / production-bundle rerun | **NOT RERUN. Zero runtime tests executed.** No historical PASS count is presented as new evidence. Existing source boundaries reviewed; emitted bundles are not rebuilt/certified here. |
| Database / SQL / media / network / provider / worker operations | None executed; no source-byte access, probe, rendering, output MP4, approval/permit or spending issuance. |

Commands completed for the static review: `git branch --show-current`, `git rev-parse HEAD`, `git status --short --untracked-files=all`, text-only `grep`/`sed`/`cat`, `python3 /tmp/movie-translator-m8-02-cfe705jx/audit-static.py`, the same Python command with `--staged`, `pnpm lint` with the dummy datasource above, `git diff --check`, `git diff --cached --check`, `git diff --cached --name-only`, `git diff --cached --stat`. The Python audit is a temporary standard-library text/index checker, not an application runtime test or imported project module. No existing runtime acceptance/audit script is executed, because some compose fixtures or depend on built output. Static checks do not replace the later runtime acceptance matrix.

Stage only `docs/STORYLINE_M8_02_MEDIA_EXECUTION_SECURITY_DESIGN.md` by explicit path after design/static PASS, inspect exact staged bytes/whitespace/secrets, then make the requested one local commit `docs(storyline): design safe recap media execution`. Full resulting commit hash and final tree status are reported outside this document to avoid self-reference. No push. All prior files/logs retained. Stop after M8-02; no M8-03 or media execution begins.
