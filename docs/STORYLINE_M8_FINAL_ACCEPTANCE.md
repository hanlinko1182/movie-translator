# M8 Final Acceptance — Synthetic planning and fake execution

Date: 2026-10-20, Asia/Bangkok. Scope: integrated acceptance of M8-01/02/03/04, **DISPOSABLE_FAKE_ONLY**. **M8 Final Acceptance PASS — DISPOSABLE_FAKE_ONLY.** All required fresh checks passed. M8-01/02/03/04 are complete within this synthetic/fake scope; actual media execution and production integration remain blocked.

## Baseline, method and exact inventory

Verified `recovery/m9-studio` at exact expected HEAD `22d0ff59f474ff85f269697d07ceccf88f72a83b`, with an empty initial index/worktree/untracked inventory. The preceding M8 commits are M8-01 `257668be1b2b419ee878d050b0dd15dee3d67545`, M8-02 `98ace6f87ab3cf6d9d6d1d312f708010693c2f54`, and M8-03 `52eb396df20206ffe331f0965c38af2babfc21e3`. Their actual Git inventories contain 15, 1, 19 and 9 paths respectively; six M8-04 modifications overlap M8-03, giving **38 existing M8 paths**, listed below. Historical test counts are context only.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), [M8-01](STORYLINE_M8_01_RENDER_PLANNING.md), [M8-02](STORYLINE_M8_02_MEDIA_EXECUTION_SECURITY_DESIGN.md), [M8-03](STORYLINE_M8_03_FAKE_EXECUTION_FOUNDATION.md), [M8-04](STORYLINE_M8_04_FAKE_EXECUTION_SECURITY_ACCEPTANCE.md), [M7 acceptance](STORYLINE_M7_FINAL_ACCEPTANCE.md), [M6 acceptance](STORYLINE_M6_FINAL_ACCEPTANCE.md) and [M5 acceptance](STORYLINE_M5_FINAL_ACCEPTANCE.md). Inspected all fourteen M8 runtime modules, both complete test namespaces, scratch SQL, private fixture/bootstrap, enumerated child, production audits, canonical hashes/validation, M6/M7 persistence/currentness/replay and cooperating schemas. Actual exports and code take precedence over report descriptions.

Fresh receipts are retained under `/home/hanlinko/Desktop/movie-translator/coverage/m8-final-vq8920tv/`, an already ignored directory. `baseline.json` freezes existing tracked text hashes before work; `m8-inventory.json` records the actual four commit inventories; `test-manifest.json` enumerates every executed file. Existing implementation, tests, schemas, dependencies, UI, reports and earlier logs remain unchanged. No real source/media directories or output files are inspected. This is an integrated review within this task, not an external auditor certification or formal proof.

```text
docs/STORYLINE_M8_01_RENDER_PLANNING.md
docs/STORYLINE_M8_02_MEDIA_EXECUTION_SECURITY_DESIGN.md
docs/STORYLINE_M8_03_FAKE_EXECUTION_FOUNDATION.md
docs/STORYLINE_M8_04_FAKE_EXECUTION_SECURITY_ACCEPTANCE.md
lib/storyline/render-planning/contracts.ts
lib/storyline/render-planning/index.ts
lib/storyline/render-planning/input.ts
lib/storyline/render-planning/planner.ts
lib/storyline/render-planning/recipe.ts
lib/storyline/render-planning/resolution.ts
lib/storyline/render-execution-fake/auth.ts
lib/storyline/render-execution-fake/contracts.ts
lib/storyline/render-execution-fake/database.ts
lib/storyline/render-execution-fake/index.ts
lib/storyline/render-execution-fake/process.ts
lib/storyline/render-execution-fake/service.ts
lib/storyline/render-execution-fake/source.ts
lib/storyline/render-execution-fake/storage.ts
tests/storyline/render-planning/boundaries.test.ts
tests/storyline/render-planning/contracts.test.ts
tests/storyline/render-planning/fixture.ts
tests/storyline/render-planning/foundation.test.ts
tests/storyline/render-planning/postgres.fixture.ts
tests/storyline/render-planning/postgres.test.ts
tests/storyline/render-planning/production-audit.mjs
tests/storyline/render-planning/tampering.test.ts
tests/storyline/render-execution-fake/child.fixture.ts
tests/storyline/render-execution-fake/contracts.test.ts
tests/storyline/render-execution-fake/fixture.ts
tests/storyline/render-execution-fake/independent-security.test.ts
tests/storyline/render-execution-fake/independent-storage.test.ts
tests/storyline/render-execution-fake/lifecycle.test.ts
tests/storyline/render-execution-fake/production-audit.mjs
tests/storyline/render-execution-fake/recovery.test.ts
tests/storyline/render-execution-fake/restart.test.ts
tests/storyline/render-execution-fake/schema.sql
tests/storyline/render-execution-fake/security.test.ts
tests/storyline/render-execution-fake/storage-process.test.ts
```

The nine M8-04 paths are its report; `database.ts`, `service.ts`, `storage.ts`; `child.fixture.ts`, `fixture.ts`, `schema.sql`; and the two `independent-*.test.ts` files in the execution namespace. All are audited unchanged here. The **only milestone-owned change** is this new `docs/STORYLINE_M8_FINAL_ACCEPTANCE.md`. No fresh defect requiring a code correction was identified.

## Frozen domains and API boundaries

M8-01 has exactly seven domains:

```text
story-recap-render-planning-input-v1
story-recap-render-policy-v1
story-recap-render-profile-v1
story-recap-render-source-observation-v1
story-recap-render-dependency-snapshot-v1
story-recap-render-recipe-v1
story-recap-render-request-proposal-v1
```

Its public server-only index exports contracts/constants, input/profile/source/proposal parsers, `syntheticRenderProfileReference`, `generateRenderRecipe` and `validateRenderRecipe`. The internal `parseRenderRecipe` validates shape/self-hashes; it is deliberately absent from the public barrel as an admission API. Public validation independently regenerates the entire recipe once from the expected input and independent resolver. Neither a valid outer digest nor caller-supplied CURRENT flag is authority.

M8-03 has exactly fourteen separate domains:

```text
story-recap-execution-request-v1
story-recap-execution-source-binding-v1
story-recap-execution-admission-v1
story-recap-execution-submission-v1
story-recap-execution-checkpoint-v1
story-recap-execution-result-v1
story-recap-execution-stage-v1
story-recap-execution-fake-byte-verification-v1
story-recap-execution-artifact-v1
story-recap-execution-access-v1
story-recap-execution-lifecycle-v1
story-recap-execution-recovery-v1
story-recap-execution-audit-v1
story-recap-execution-profile-v1
```

Its server-only index exports strict contracts and explicitly injected `createSyntheticExecutionAuthenticationForTest`, `createExecutionGatewayForTest`, `createFakeExecutionServiceForTest`, `createFakeSourceAuthorityForTest`, `createFakeProcessOwnerForTest`, `createOwnedBlobFixture` and `attachOwnedBlobFixture`. Service operations are proposal/reserve/executeFake/capture/verify/finalize/inspectPrivate/inspect/observeOriginal/readOperation/cancel plus the separate recovery object (recover/quarantine/gc/readopt/releaseHold). There is no default adapter, ambient datasource, transport, production authentication or real-engine fallback.

Strict execution envelopes have exactly `{schemaVersion,namespace,scope,restrictions,body}` and exhaustive per-kind bodies. Four-part tenant/project/movie/studio scope, namespace, domain, bounded IDs/hashes, safe integers, Unicode and canonical serialization are enforced without coercion. Getters, cycles, sparse/non-JSON values, unknown fields, browser roles, source paths/URLs, commands/filter graphs and forged approval/permit claims reject. The unchanged canonical hash is SHA-256 of domain + newline + strict canonical JSON; actual byte SHA-256 is a different observation. Hashes establish consistency, not authorization, possession, semantic truth or media validity.

Every execution artifact retains DISPOSABLE_FAKE_ONLY, SYNTHETIC_ONLY, SIMULATED_NOT_MEDIA, MEDIA_VERIFICATION_NOT_PERFORMED, NOT_RENDERED, humanApproval NONE, sourceVerified false, originalMovieAudio EXCLUDED, synthesizedNarration NONE, speech NOT_VERIFIED, voiceSynchronization UNSUPPORTED, spendingAuthority NONE and publicationEligibility false. Actual codec/frames/duration/streams remain NOT_MEASURED. The prospective real verification domain is absent. No existing M1–M8 contract, hash domain or expiry assertion is changed.

## Planning acceptance

The input binds the full saved M7 ID/version/record and plan hashes with exact domains, four-part scope, fixed policy and independently registered profile. Resolution reloads the exact M7 record/head and immediate parent, independently validates stored M6 proposal/audit/dependency/physical parent, reruns M6/M1–M4/R4 source/narration/candidate/evidence replay, and separately checks current M6 head/source/dependency/policy observations. Historical integrity and present eligibility remain distinct. Immediate-parent replay is bounded; it is not a claim to walk an unbounded ancestry chain.

The fixed profile declares MP4/H264_AVC/YUV420P, 640×360, 25/1 FPS and 1/1000-second ticks. Exact checked BigInt rational conversion requires 40-ms frame boundaries, then emits safe JSON integers. CUT_ONLY, speed 1:1, disjoint half-open source intervals, exact prefix-sum output, separate source/presentation orders and no filler are enforced. Valid M7 one-ms cuts reject as FRAME_BOUNDARY_UNREPRESENTABLE; M7 bytes are never adjusted. Recipe identity is deterministic and deeply immutable; observation timestamps and request keys do not enter recipe identity.

Tests challenge rehashed Chinese evidence, character/claim/qualification provenance, candidate/segment/source/output/frame/tick/order/total/dependency/parent identities, all scope coordinates, unsafe serialization and drift. Full regeneration rejects them even where shape/self-hash parsing passes. Fake M5 ancestry remains reference-only and contributes no audio or synchronization timing. RenderRequestProposal stays DISABLED_HANDOFF_ONLY/executable false. Declared metadata remains NOT_PROBED/POSSESSION_NOT_ESTABLISHED; no codec support, actual track exclusion or source possession is established.

## M8-02 conformance assessment

| Design area | Actual status and tested scope | Remaining boundary |
| --- | --- | --- |
| Independent identity/source/currentness | Implemented for injected server-owned fixture identities, opaque owned non-media source versions and full saved M7/M6 replay. | Real source rights, authority-enforced immutable movie bytes, production identity/tenant gateways and distributed revocation are absent. |
| Admission/ownership/quota/audit | Implemented in a separate restricted schema in the same newly owned disposable M6/M7 database; original request/work/key/submission, CAS, checkpoint and atomic audit. | No application schema/migration, production key custody, service deployment or cross-system transaction. |
| One-use process ownership | Implemented as an in-memory simulator with independent original result journal, nonserializable permit and explicit crash/ACK barriers. | Real parser/process phase IDs, sandbox, descendant supervision, actual process resources and OS exactly-once are design-only. No media process is started. |
| Private immutable output | Implemented create-only opaque `.blob` versions, actual fake SHA/count verification, exact reads, mutation fence and tombstones under trusted fixture ownership. | Strong immutability against a same-UID administrator, backups/restore, cloud/multi-host durability, safe stranded-fence operations and bounded streaming need review. |
| Verification/finalization | Implemented original-result/stage/source/recipe/profile binding, independent complete byte read-back, currentness and availability fences. | Codec/frames/duration/topology/content fidelity are NOT_MEASURED; the real independent media validator is unimplemented. |
| Recovery/retention/GC | Implemented explicit original-evidence recovery, quarantine/read/source holds, retention, exact intent/delete/tombstone and lost-ACK reconciliation. | Automatic escalation, stranded-reader/fence resolution and operational health are absent. No lease/age cleanup is added. |
| Real-media containment/accurate cuts/audio exclusion | Design requirements only. | Unsupported host isolation must block even a future probe. Fixed direct invocation, pinned capabilities, decode/re-encode/frame association/PTS-DTS validation and independent actual track inventory require separate authorization and execution evidence. |

The implemented fake lifecycle is intentionally smaller than the future real architecture. It has no RUNNING OS process record, playable video, renderer software attestation, actual decoded-frame measurement or probe/encoder phase orchestration. Documenting those controls does not implement them. In particular, fake byte integrity cannot satisfy the design's actual-media verifier or prove no audio tracks.

## Authorization, PostgreSQL and currentness

Native Request method/exact URL, pinned Origin, same-origin Fetch Metadata, unique opaque session cookie, mutation CSRF, namespace/scope, action grants, expiry and revocation are checked independently of browser claims. M8 has no session/bootstrap HTTP endpoint or production cookie issuer; native fixture cookies do not certify production HttpOnly issuance. Private WeakMap authority cannot be reconstructed from serialized identity. M7 canCreate neither implies nor substitutes for fake execute permission.

All nine purpose-specific restricted actions remain inspect, execute, observe, validate, finalize, read, recover, quarantine and GC. Execute/validate/finalize/read require inspect; finalize also requires execute. Capture and full source-bearing operation inspection require inspect even under maintenance actions. Database sessions/principals/grants independently agree with native identity. Explicit `(permission = ANY(grants)) IS NOT TRUE` denies missing/NULL authority. No M6/M7 role is broadened.

Actual restricted-connection tests check non-login/non-elevated owners, non-elevated logins, no owner/elevated/server-file/program membership, direct table/column/sequence denial, no schema/TEMP creation or arbitrary helper/other-action execution, fixed qualified function search paths, immutable triggers and deferred completion. Caller search_path changes cannot create/alter/shadow protected helpers. Composite scope/namespace foreign keys and unique immutable operation/fact/artifact identities prevent cross-scope adoption.

One-use action proofs bind exact canonical body hash, domain, namespace/scope, actor/session/action, origin/CSRF, nonce, backend PID, transaction ID and DB-clock deadline; fact MACs additionally bind kind, operation, fact hash, owner generation and revision. Proof expiry is evaluated after lock waits. Deferred completion requires audit, current live sessions and critical currentness at COMMIT. Complete immutable result/verification/artifact bodies are independently reconstructed in SQL. Trusted fixture keys, administrator and original-journal/proof authorities remain explicit assumptions.

The actual cooperating order is action proof-key → M7 scope/session/grant → M6 scope/session/grant/policy/current_dependency/head → M7 policy/head → execution scope/session/grant. Critical replay transactions take execution source SHARE through capture before fixture quota/work/state mutation. Standalone ownership inspection/mutation takes fixture quota before immutable work/source/state. These paths are not falsely described as one uniform source/quota order. Existing M6 writers acquire no M7/execution rows; M7 writers acquire no execution rows. Tests challenge admission/finalization with real independent writer connections and `pg_blocking_pids`, drift during a wait, proof/session deadlines and commit fences. Timeout/deadlock fails closed; no automatic launch follows it. An exhaustive scheduler/deadlock proof is not claimed.

Source/output I/O occurs outside SQL locks. New admission/finalization independently reacquires full lineage on the committing backend, rather than trusting earlier CURRENT_AT_READ. A writer serialized after valid commit can immediately stale an operation; immutable history remains, and later adoption/finalization/private delivery requires fresh eligibility. There is no distributed DB/storage/process transaction or instantaneous revocation guarantee.

## Seven M8-04 security-fix regressions

| Previously reproduced defect | Corrected boundary retained | Fresh executable controls |
| --- | --- | --- |
| Concurrent storage quota races | Exclusive fixed mutation fence serializes register/create/delete; contention denies STORAGE_BUSY without eviction/retry. | `independent-storage.test.ts`: concurrent attachments stop at 32 versions; concurrent creates stop at 28 MiB, preserving four MiB headroom. |
| Tombstone accepted substituted surviving bytes | Surviving blob must still match original exact hash/count before conditional deletion. | Prior tombstone plus deliberately changed owned bytes rejects DELETE_MISMATCH and retains them. |
| Maintenance source-inspection leakage | Both broker and SQL require inspect separately for capture/full operation inspect. | Recover-only/quarantine-only/GC-only tests deny both operations, including correct raw SQL MAC proofs bypassing the broker. |
| Failed read quarantine coordination | Required explicit coordinator request uses its own current POST identity/grant; reader stays read/inspect only. | Corrupt/missing/truncated/extra output denies bytes and quarantines under editor-b; revoked coordinator cannot borrow reader/another identity. |
| Unauthorized live-flow consumption | Execute authenticates/matches original actor before consumption; cancel consumes only after authorized SQL success. | Wrong scope, DB denial and wrong-session execute cannot burn the rightful owner's flow; original starts once and replay fails. |
| NULL-containing SQL grant arrays | All required permissions use explicit IS NOT TRUE denial. | Native-valid actor with DB `['inspect',NULL]` cannot reserve; zero work/starts. |
| Incomplete definitive-result evidence | SQL reconstructs exact result body including numeric generation 1 and QUIESCENT; exact outer envelope keys. | Correct action/fact MAC with omitted quiescence cannot resolve UNKNOWN, despite bypassing TypeScript; original journal absent, starts zero. |

**All seven fix families PASS freshly**, including all 26 unchanged cases added by M8-04 (22 independent security, four independent storage), in both focused and consolidated runs. `m804-fix-regressions.json` retains their exact passing names. No corrected denial is weakened or reimplemented.

## Original invocation, crash and UNKNOWN acceptance

Same scope/key/exact proposal returns the original work; changed proposal conflicts. Different keys for the same canonical work alias the original operation. A new source/head/profile/key cannot evade an unresolved scope. Submission generation remains 1; owner generation/revision advance only for fenced observation/recovery. The live-flow entry exists only after the original observed reservation commit. Checkpoint and launch-fence commits/ACK precede the process-private WeakMap permit; the permit is consumed before asynchronous invocation. An unauthorized caller cannot consume that owner's flow.

Recovery exposes no arm/invoke/reserve capability. A persisted checkpoint/copied ACK, NOT_FOUND, lost ACK, timeout, fresh key or owner takeover cannot reconstruct launch authority. Missing original result or uncertain quiescence stays UNKNOWN even when matching bytes are planted. Cancellation retains history and denies adoption; conflicting outcomes cannot overwrite immutable facts. The acceptance invariant is **original fake starts do not increase during recovery**, with at most one start for original canonical work within the tested fixture authority.

| Crash/ambiguity cut | Expected retained result |
| --- | --- |
| Before checkpoint / lost reservation ACK | Original lookup only; no reconstructed live flow or start. RESERVED can be explicitly cancelled. |
| Checkpoint committed / ACK lost | UNKNOWN, zero starts, original holds retained. |
| Permit burned before start | UNKNOWN may retain zero starts; zero is never permission to retry. |
| Fake start / lost original journal or observation | UNKNOWN with one start unless the same original definitive journal proves its outcome; no replacement. |
| Lost create/verification ACK | Reinspect original exact version/immutable receipt, never overwrite or relaunch. |
| Lost finalization ACK | Discover the same committed artifact, no replacement execution or spurious quarantine of a known valid commit. |
| Concurrent recovery / stale owner / concurrent finalizers | Owner/revision CAS and immutable facts; original submission fixed, one artifact or explicit conflict. |

The existing enumerated Node service-only child is killed at checkpoint-after-commit, fake-started and finalize-after-commit. Expected original counters are respectively 0/1/1; replacement simulators must remain zero. First two recover UNKNOWN, last reads the same SUCCESS/AVAILABLE artifact. Additional in-process fault cuts cover before checkpoint, before start, lost result/verification/storage acknowledgements and stale/currentness conflicts. No new child runner is introduced. These tests establish service-crash behavior, not power-loss durability, OS process exactly-once, real descendant cleanup or multi-host execution guarantees.

## Artifact integrity, quarantine and GC

The owned fixture registers arbitrary bounded NON-MEDIA source bytes before building immutable M1/M3/M4/M6/M7 lineage. Source authority binds the actual complete byte SHA/count, opaque handle, immutable version, namespace/scope, owner, generation, expiry and revocation. Requesters choose no filesystem path or replacement source. No source download, movie loader, parser or network fallback exists.

Definitive original SUCCESS/QUIESCENT precedes capture into the reserved exact `.blob` stage. Independent verification reads all bytes and binds original result/source/recipe/dependency/profile, exact storage version and actual SHA/count. Finalization rereads bytes outside locks, then independently replays/fences current authorization/lineage on the saving backend and atomically inserts artifact/audit/AVAILABLE. Concurrent finalizers cannot commit two artifact facts; forced audit failure rolls back artifact/availability while retaining prior immutable result/verification. A successful simulator call or matching outer hash alone is insufficient.

Private inspection requires read/inspect grants, current source/head/access and availability, exact immutable version, a durable bounded-count read hold, complete independently checked bytes and final authorization/availability fence. No partial bytes return on revocation, quarantine or corruption. AVAILABLE is a last committed observation, not continuous proof of storage integrity. Missing/truncated/extra/corrupt bytes deny delivery and use the separate authorized quarantine coordinator. If it is unavailable/revoked, delivery still fails; no reader privilege escalation or fallback identity occurs. Last-known availability may remain until an authorized coordinator acts.

GC requires definitive original outcome/quiescence, quarantine, explicit source/quarantine hold release, elapsed retention, no read hold and valid owner/revision CAS. UNKNOWN evidence cannot be GC'd to free quota. DELETE_PENDING commits its exact-version intent/audit before conditional deletion and excludes new readers/finalizers. Storage validates owner/version/hash/count, persists an immutable tombstone and reconciles only that original intent after lost delete ACK. Missing bytes without a matching tombstone do not prove deletion; surviving corrupt bytes cannot be substituted; IDs/versions are never reused. There is no prefix/wildcard/latest/path delete or age-only cleanup.

Fixture limits remain 2 MiB execution request, 32 MiB independent capture, 64 segments, one-MiB fake source/output, 32 MiB payload ceiling with four MiB excluded from ordinary allocation, 16 operations/32 versions, one unresolved operation per scope and one active fake invocation per owned fixture/simulator. The conservative two-MiB ledger reservation can exhaust its 28-MiB ordinary budget before 16 operations. Work/key/tombstone/quota history is not automatically reclaimed even after GC. These are bounded fixture accounting controls, not OS disk/RAM/process/WAL limits or a process-wide scheduler spanning independent fixture realms.

## Fresh verification and accounting

The newly executed serial suite completed successfully. `commands.json`, individual TAP logs, exit receipts, `progress.json`, `acceptance-results.json` and source/staged audits identify actual runs. No historical PASS count is substituted.

The first sandboxed focus attempt reported eight file-level wrappers (three passing/five failing), not individual-case acceptance evidence. A direct three-case lifecycle diagnostic then reproduced PostgreSQL Unix socket bind denial (`Operation not permitted`) at fixture startup. These logs are retained as `sandbox-fake.log` and `sandbox-diagnostic.log`. The unchanged suite is rerun with the required local socket/process permission; no assertion or production boundary is relaxed. Failed setup wrappers are excluded from the final distinct-case/pass totals and are disclosed separately.

All commands explicitly pin the application `DATABASE_URL` to `postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`. Database suites create new ownership-marked PostgreSQL clusters with private Unix sockets and generated credentials; they do not use the application datasource. Private fixtures use only newly marked roots and arbitrary non-media blobs. Timing-sensitive server suites run serially without competing browser/compiler/build workloads. Existing M5 regressions exercise their unchanged fake-audio protocol; no M5 bytes are processed by M8 or used for synchronization. Unchanged M1–M4 regressions may seed ephemeral synthetic verification/confirmation facts; these are disposable setup, not real approval or a new M8 SOURCE_VERIFIED issuer.

| Fresh check | Actual completed result | Receipt |
| --- | --- | --- |
| M8-03/04 focused security/lifecycle/recovery/storage | **108/108 PASS**, 205.20 s; all 26 M8-04 cases and three enumerated SIGKILL scenarios pass | `fake.log` |
| M8-01 focused planning/replay/boundaries/disposable resolution | **150/150 PASS**, 40.17 s | `planning.log` |
| Consolidated applicable M1–M8 server plus four legacy pure files | **1882/1882 Node-reported tests PASS**, 917.20 s; 1,845 leaf cases plus 37 parent test groups; **16/16 unchanged M4 expiry controls pass** | `server.log` |
| All eight existing Studio/legacy component files | **51/51 PASS**, 1.61 s | `components.log` |
| All six existing Chromium suites | **6/6 PASS**, 92.90 s; each checks 1440/1024/390 px | `chromium.log`, `browser-audit-summary.json` |
| Lint / standalone TypeScript | **PASS**, both exit 0, no diagnostics | `lint.log`, `tsc.log` |
| Dummy-datasource Webpack build | **PASS**, exit 0; Next.js 16.3.6, compile 9.5 s, TypeScript 2.9 s, all 12 static pages and trace collection | `webpack.log` |
| M6/M7-01/02/03/M8-01/03 production audits | **6/6 PASS**, exit 0; 71 client chunks, 144 server JS files, 108 production sources in full scans, 38 unchanged API routes, zero Server Actions and prohibited runtime/fixture/secret matches; bridges type-only | `m6-production.json`, `m701-production.json`, `m702-production.json`, `m703-production.json`, `m801-production.json`, `m803-production.json` |
| Contract/source/owned-file/link/secret/whitespace/index audit | **PASS**: all 653 frozen tracked text hashes and 38 M8 paths unchanged; all nine M8-04 paths preserved; 7 + 14 exact domains and original expiry SHA unchanged; only this document added, no owned secret/whitespace matches, local link targets exist. Exact staged bytes/inventory are checked immediately before commit. | `source-audit.json`, `staged-audit.json` |

All final Node suites report zero failed, cancelled, skipped or TODO cases. **2,197 successful Node-reported executions = 108 focused fake + 150 focused planning + 1,882 consolidated + 51 components + 6 Chromium.** Both focused commands are wholly included in the consolidated run: **258 overlapping executions**, leaving **1,939 distinct Node-reported test nodes**.

For stricter leaf-case accounting, the consolidated total includes **37 parent test groups** with their own Node result lines. Excluding those groups yields **2,160 successful leaf-case executions representing 1,902 distinct leaf cases** (1,845 server + 51 components + 6 Chromium). The groups are disclosed, not extra independent adversarial cases. The 13 focused files are contained in the 93-file consolidated manifest; all 89 Storyline server test files are included exactly once there. Viewport iterations, individual assertions, child-process observations, six production-audit scripts, static checks and historical runs add no test cases.

The three direct sandbox setup failures overlap the final lifecycle definitions and add no distinct cases; the eight sandbox file-level wrappers expose no individual-case totals and are not mixed into either final accounting measure. Their failure cause was independently diagnosed and resolved by the local socket permission, not by source/assertion changes. No required final acceptance check failed or needed assertion changes.

Fresh browser artifact roots: `/tmp/recap-recovery-browser-enHOku/`, `/tmp/storyline-m9-save-browser-lfqJRs/`, `/tmp/storyline-m603-browser-rPObRL/`, `/tmp/storyline-m703-browser-rYvZ42/`, `/tmp/recap-studio-navigation-blf48V/`, `/tmp/storyline-m9-recovery-browser-G4poSM/`. The retained JSON summary links the executed checks and result files. M6/M7 each retain seven saved versions with empty browser-error/external-rejection arrays and zero production API/provider/media-processing calls; M9 records exact text round trips and no editing-provider/production API calls. Local editing/review reports zero local network calls. Responsive/keyboard/confirmation/history/isolation checks preserve the six destinations and existing Recap behavior. These are automated regression results, not comprehensive assistive-technology certification or a claim of playable media.

### Exact fresh commands

The serial runner uses the following actual argument lists; file order is recorded without shell-glob ambiguity. `commands.json` and `test-manifest.json` retain the same lists. The export below applies to every command. The browser-only environment and disabled build telemetry are explicit.

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
export NEXT_TELEMETRY_DISABLED=1
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/storyline/render-execution-fake/contracts.test.ts \
  tests/storyline/render-execution-fake/independent-security.test.ts \
  tests/storyline/render-execution-fake/independent-storage.test.ts \
  tests/storyline/render-execution-fake/lifecycle.test.ts tests/storyline/render-execution-fake/recovery.test.ts \
  tests/storyline/render-execution-fake/restart.test.ts tests/storyline/render-execution-fake/security.test.ts \
  tests/storyline/render-execution-fake/storage-process.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/storyline/render-planning/boundaries.test.ts tests/storyline/render-planning/contracts.test.ts \
  tests/storyline/render-planning/foundation.test.ts tests/storyline/render-planning/postgres.test.ts \
  tests/storyline/render-planning/tampering.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/storyline/audio-verification/boundary.test.ts tests/storyline/audio-verification/collection.test.ts \
  tests/storyline/audio-verification/receipt.test.ts tests/storyline/audio-verification/wav.test.ts \
  tests/storyline/authoritative-source-postgres.test.ts \
  tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts tests/storyline/contracts.test.ts \
  tests/storyline/durable-duration-postgres.test.ts tests/storyline/durable-fake/contracts-storage.test.ts \
  tests/storyline/durable-fake/lifecycle.test.ts tests/storyline/durable-fake/restart.test.ts \
  tests/storyline/durable-fake/security.test.ts tests/storyline/duration.test.ts \
  tests/storyline/editor-saving/acceptance.test.ts tests/storyline/evidence-analysis-postgres.test.ts \
  tests/storyline/evidence-analysis.test.ts tests/storyline/evidence-candidate-persistence-postgres.test.ts \
  tests/storyline/evidence-dto.test.ts tests/storyline/evidence-final-acceptance-postgres.test.ts \
  tests/storyline/evidence-workflow-postgres.test.ts tests/storyline/foundation-acceptance.test.ts \
  tests/storyline/foundation-postgres-acceptance.test.ts tests/storyline/highlights-persistence/contracts.test.ts \
  tests/storyline/highlights-persistence/persistence.test.ts \
  tests/storyline/highlights-persistence/security.test.ts tests/storyline/highlights-studio/acceptance.test.ts \
  tests/storyline/highlights/foundation.test.ts tests/storyline/human-verification.test.ts \
  tests/storyline/integration-boundary.test.ts tests/storyline/jobs/admission-gateway-draft.test.ts \
  tests/storyline/jobs/checkpoint-transport-postgres.test.ts tests/storyline/jobs/contracts.test.ts \
  tests/storyline/jobs/disposable-admission-gateway.test.ts tests/storyline/jobs/fake-worker-postgres.test.ts \
  tests/storyline/jobs/final-acceptance-postgres.test.ts tests/storyline/jobs/persistence-draft.test.ts \
  tests/storyline/jobs/persistence-postgres.test.ts tests/storyline/jobs/role-order-postgres.test.ts \
  tests/storyline/jobs/scoped-api-postgres.test.ts tests/storyline/jobs/services-postgres.test.ts \
  tests/storyline/jobs/snapshot-identity.test.ts tests/storyline/jobs/transactional-gateway.test.ts \
  tests/storyline/media.test.ts tests/storyline/narration-final-acceptance-postgres.test.ts \
  tests/storyline/narration-integration-postgres.test.ts tests/storyline/narration-persistence-postgres.test.ts \
  tests/storyline/narration-workflow-postgres.test.ts tests/storyline/narration.test.ts \
  tests/storyline/operator-authority.test.ts tests/storyline/persistence-draft.test.ts \
  tests/storyline/persistence-postgres.test.ts tests/storyline/persistence-service-postgres.test.ts \
  tests/storyline/preparation.test.ts tests/storyline/private-artifacts/boundary.test.ts \
  tests/storyline/private-artifacts/collection.test.ts tests/storyline/private-artifacts/lifecycle.test.ts \
  tests/storyline/private-artifacts/store.test.ts tests/storyline/render-execution-fake/contracts.test.ts \
  tests/storyline/render-execution-fake/independent-security.test.ts \
  tests/storyline/render-execution-fake/independent-storage.test.ts \
  tests/storyline/render-execution-fake/lifecycle.test.ts tests/storyline/render-execution-fake/recovery.test.ts \
  tests/storyline/render-execution-fake/restart.test.ts tests/storyline/render-execution-fake/security.test.ts \
  tests/storyline/render-execution-fake/storage-process.test.ts tests/storyline/render-planning/boundaries.test.ts \
  tests/storyline/render-planning/contracts.test.ts tests/storyline/render-planning/foundation.test.ts \
  tests/storyline/render-planning/postgres.test.ts tests/storyline/render-planning/tampering.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts \
  tests/storyline/timeline-persistence/boundaries.test.ts tests/storyline/timeline-persistence/catalog.test.ts \
  tests/storyline/timeline-persistence/contracts.test.ts tests/storyline/timeline-persistence/fencing.test.ts \
  tests/storyline/timeline-persistence/persistence.test.ts tests/storyline/timeline-persistence/security.test.ts \
  tests/storyline/timeline-persistence/tampering.test.ts tests/storyline/timeline-studio/acceptance.test.ts \
  tests/storyline/timeline/boundaries.test.ts tests/storyline/timeline/foundation.test.ts \
  tests/storyline/timeline/postgres.test.ts tests/storyline/verification-security-postgres.test.ts \
  tests/storyline/voice-foundation/boundary.test.ts tests/storyline/voice-foundation/fake-adapter.test.ts \
  tests/storyline/voice-foundation/planner.test.ts tests/storyline/voice-foundation/reference.test.ts \
  tests/storyline/voice-handoff.test.ts tests/video-render/queue-contract.test.ts \
  tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=tap tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx \
  tests/storyline/editor-saving/component.test.tsx tests/storyline/highlights-studio/component.test.tsx \
  tests/storyline/timeline-studio/component.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/storyline/ui/script-preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
pnpm exec next build --webpack
export PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs
export CHROME_PATH=/opt/brave.com/brave/brave
node --test --test-reporter=tap --test-concurrency=1 tests/recap/recovery-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs tests/storyline/highlights-studio/browser.test.mjs \
  tests/storyline/timeline-studio/browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs
node tests/storyline/highlights-studio/production-audit.mjs \
  /home/hanlinko/Desktop/movie-translator/coverage/m8-final-vq8920tv/m6-production.json
node tests/storyline/timeline/production-audit.mjs \
  /home/hanlinko/Desktop/movie-translator/coverage/m8-final-vq8920tv/m701-production.json
node tests/storyline/timeline-persistence/production-audit.mjs \
  /home/hanlinko/Desktop/movie-translator/coverage/m8-final-vq8920tv/m702-production.json
node tests/storyline/timeline-studio/production-audit.mjs \
  /home/hanlinko/Desktop/movie-translator/coverage/m8-final-vq8920tv/m703-production.json
node tests/storyline/render-planning/production-audit.mjs \
  /home/hanlinko/Desktop/movie-translator/coverage/m8-final-vq8920tv/m801-production.json
node tests/storyline/render-execution-fake/production-audit.mjs \
  /home/hanlinko/Desktop/movie-translator/coverage/m8-final-vq8920tv/m803-production.json
python3 coverage/m8-final-vq8920tv/collect.py
python3 coverage/m8-final-vq8920tv/audit.py
# After staging the single explicit document path:
python3 coverage/m8-final-vq8920tv/audit.py --staged
git diff --check
git diff --cached --check
```


## Production and UI boundaries

All six production import/route/action/client/server/worker/script audits passed against the fresh build. The 71 client chunks, 144 server JS files and 108 production sources contain no inspected M8 factory, authentication/bootstrap/key, restricted gateway, source/process/storage/recovery/GC authority or fixture transport markers. There remain 38 unchanged API routes and zero Server Actions. Both M6/M7 bridges erase to types only. These are concrete source/graph/bundle/pattern checks, not a claim of general production penetration testing. Existing M8-01 proposals stay disabled, app callers omit the test adapters, and no environment switch can activate one.

All six Studio destinations remain Saved Recap, Script, AI Review, Voice, Highlights and Export. Export's production unavailable video state must remain honest; injected synthetic Timeline metadata is not a finished video. Existing component and all six Chromium suites cover keyboard/navigation, memory-only editing, source/movie/session isolation, saved read-back/history and responsive layouts at 1440/1024/390. Viewport loops and child-process assertions are not extra counted cases. No M8 render control, player, public URL, download endpoint or UI capability is added.

## Historical M4 incident and operational limitations

The historical M1-last actual-wire-before-expiry positive repeat 2 expected one fake wire entry but observed zero. Its root cause remains **UNRESOLVED**; a passing run does not repair or explain it. All sixteen original controls passed freshly in the single consolidated run, without a targeted timing rerun or recurrence. Their assertions and the unchanged 700-ms positive confirmation deadline remain protected. Expiry-control SHA-256 remains `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. A recurrence requires retained original checkpoint ACK, DB transaction/current wall times, lock waits, confirmation/lease epochs, owner generation, monotonic permit deadline and actual-wire entry evidence. Do not widen deadlines, weaken assertions, issue speculative resends or dismiss timing failures as harmless flakiness.

| Limitation | Safety consequence and remaining work |
| --- | --- |
| Abandoned MUTATION_LOCK | New mutations/GC fail STORAGE_BUSY; existing exact reads may continue. No age/lease reaping or automated unlock exists. |
| Stranded read hold after expiry/revocation | GC remains blocked even after source/quarantine hold release. Expiry does not prove descriptor closure. |
| Quarantine coordinator unavailable | No bytes delivered, no borrowed authority; metadata may retain its last-known availability until explicitly authorized action. No automated escalation exists. |
| UNKNOWN quota and immutable history retained | Admission may exhaust permanently rather than erase evidence/reuse identities. Capacity health/reconciliation requires review. |
| Trusted fixture administrators/source/key/journal/storage owners | Same-UID or privileged tampering is outside the ownership guarantee; hashes cannot defend against a compromised trusted authority. |
| Limited fixture durability and split systems | Reattachment/service restart is tested; backup/restore, power loss, multi-host coherence, distributed revocation/atomicity and operational recovery are not certified. |
| Simulated resources/isolation/content | No OS resource enforcement, hostile-media sandbox, real source possession, decoder/encoder capability, video fidelity, exact cut or actual track exclusion is proven. |

## Separate future handoff

M8 acceptance closes only the authorized synthetic planning and disposable fake ownership/security foundation. Neither path below is automatically approved. No operational hardening, media probing/execution or production integration begins here.

**Path A — fake-only operational hardening (recommended first if the fixture service must remain usable after faults).** Separately authorize a design/review before code. Define explicit operator/recovery authority separation, original-evidence and ownership reconciliation, audit-complete stranded mutation-fence recovery, proof of reader descriptor closure/quiescence before stranded-hold resolution, quarantine coordinator availability/escalation, and bounded health/quota reporting without secrets. Require adversarial tests for live-owner/reader races, stale generations, lost recovery ACKs, corrupt/foreign exact versions and exhausted UNKNOWN quota. Never create launch authority, expire holds by clock alone, automatically reap locks, force-delete unresolved evidence or relax immutable tombstones. No real media under Path A.

**Path B — real media feasibility and security design only.** A separate authorization must first investigate source rights/possession and enforceably immutable handles; intended-host sandbox feasibility; pinned parser/decoder/encoder capabilities; fixed direct invocation with credential/environment/FD isolation; descendant cancellation/quiescence; bounded CPU/RAM/disk/pixels/frames/logs; hostile/encrypted/truncated/ambiguous media; exact source-frame selection, PTS/DTS/timebase/container reconciliation and reviewed lossy content fidelity; independent actual audio/subtitle/data/attachment exclusion; durable stage/storage/process ownership and final exact-byte/media verification. Decide supported/unsupported environments and fail closed before a probe if mandatory isolation cannot be demonstrated. The initial feasibility authorization must explicitly state whether any host inspection or synthetic media operation is permitted; this report grants neither. Subsequent real execution would require another reviewed scope and tests, not a flag change on the fake envelope. Real Myanmar voice, human approval, source verification, spending and publication remain independently gated.

## Git disposition

After all fresh required checks pass, stage only `docs/STORYLINE_M8_FINAL_ACCEPTANCE.md`, verify exact staged bytes/inventory, source preservation, links, secrets and whitespace, and create the authorized local commit `docs(storyline): complete M8 fake render final acceptance`. Its full hash and final working-tree status are reported outside this document. Preserve ignored receipts and prior logs. No push. Stop after M8 Final Acceptance.
