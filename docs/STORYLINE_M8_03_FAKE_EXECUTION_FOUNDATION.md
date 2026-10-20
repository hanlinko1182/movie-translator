# M8-03 — Disposable fake execution foundation

Date: 2026-10-20, Asia/Bangkok. **M8-03 PASS — DISPOSABLE_FAKE_ONLY.** Verified clean entry: `recovery/m9-studio` at `98ace6f87ab3cf6d9d6d1d312f708010693c2f54`. Logs: `/tmp/movie-translator-m8-03-eecaorjs/`. No existing tracked implementation, migration, UI, dependency, source contract or expiry control is modified. Real media execution and production activation remain blocked.

## Pre-SQL design freeze

Frozen before any M8-03 scratch schema installation: `contracts.ts` is the exhaustive envelope field catalog. Four-part scope plus namespace is mandatory. Domains match M8-02, including **fake-byte-verification**, never real media verification. All envelopes have the complete permanent restrictions and reject additional keys. Source/output bytes are arbitrary bounded blobs. Codec/frame/duration/stream measurements are NOT_MEASURED, never playable media claims. Request shape parsing is not independent replay or authority.

Action matrix: inspect requires canInspectFakeSource; execute requires both canInspectFakeSource and canExecuteFake; observe accepts only original simulator-owned results; validate checks independent expected bytes; finalize requires execute plus finalize; read requires canReadFakeArtifact; recover, quarantine and GC each have separate explicit grants. Every action uses independent native Request/session/origin checks and mutation CSRF, plus same-database principal/session/grant agreement. No M7 canCreate authority inheritance.

Proof freeze: canonical strict JSON wire `{domain,namespace,scope,sessionId,principalId,action,bodyHash,nonce,backendPid,transactionId,expiresAtMs,origin,csrfHash}`. Body hash is raw SHA-256 of exact canonical body. Action MAC is HMAC-SHA256 of `story-recap-execution-access-v1` + newline + canonical wire. Nonce is 24 random bytes hex; key is per action/login. DB checks exact backend/transaction/session/scope/action/body/DB-clock deadline after lock waits; consume once. Separate result/verification MACs use their exact envelope domains, transaction identity and private action keys; public envelope hashes confer no authority.

Lock order freeze: action key SHARE → M7 scope/session/grant SHARE → M6 scope/session/grant/policy/current_dependency/head SHARE → M7 policy/head SHARE → new execution scope/session/grant/source SHARE → fixture quota UPDATE → original work state UPDATE, then read/GC holds. Existing M6 writers never acquire M7/new rows; M7 writers never acquire new rows. No reverse acquisition. New admission/checkpoint/finalization/read fence compares independently replayed current M7/M6 observation on the committing backend. No fake-byte I/O under SQL locks. Recovery can preserve historical evidence despite stale source; it cannot adopt it as currently eligible.

Identity freeze: canonical work excludes request key; permanent scoped key aliases converge on the original work. Fixed submission generation 1; owner generation/revision CAS only grants observation/recovery. One unresolved work per scope, global invocation concurrency 1. Reserve 2 MiB per work conservatively for source/output, at most 16 operations/32 versions and 28 MiB ordinary allocation; at least 4 MiB reserved recovery headroom. Quota exhaustion never evicts evidence. Metadata/tombstones are bounded and retained. UNKNOWN holds the work and resources indefinitely pending original evidence.

Lifecycle freeze: RESERVED → CHECKPOINTED → SUCCESS/FAILURE/UNKNOWN; RESERVED → CANCELLED only with no checkpoint. UNKNOWN → SUCCESS/FAILURE only from original authenticated result journal; no path back to RESERVED/CHECKPOINTED. Cancel after checkpoint is a flag plus simulated quiescence/result observation, never rollback. Original live flow alone holds a nonserializable permit, consumed before asynchronous work; checkpoint ACK loss/flow loss cannot reconstruct it. Current result is immutable; late owner callbacks need current recovery CAS. Finalize only SUCCESS + quiescent + independent exact-version verification + fresh currentness, no cancel flag, one artifact/audit atomically. Availability is independent ABSENT/AVAILABLE/QUARANTINED/DELETE_PENDING/DELETED.

Storage freeze: new ownership-marked temp root, generated 32-hex `.blob` versions, exclusive create, pinned owned directory descriptors, no-follow regular single-link bounded reads. No M5 audio schema. Ledger owns exact targets before writes. Independent verification checks actual bytes against independently derived original fake expectation. Create/delete ACK loss reconciles same version. Immutable exact-version delete intent/hash/length plus tombstone; no overwrite, latest/prefix deletion or ID reuse. GC requires definitive quiescence, resolved outcome, explicit hold release, retention elapsed, no read/finalizer holds and CAS. Lease expiry alone never permits deletion.

Real source/media/process execution, providers, approval, production routes/auth/storage and M8-04 remain unauthorized. Existing M4 700 ms controls and unresolved historical expiry incident remain unchanged.

## Actual scope and file inventory

Read AGENTS/CLAUDE, the installed Next.js data-security guide, M8-02 design, M8-01 planning, M7/M6 final acceptance and M7 persistence, M5 durable design/implementation/final acceptance. Inspected actual canonical/source/narration contracts, M8 planning/replay, M7/M6 native authorization and gateways, fixture schemas/ownership, M5 immutable storage/UNKNOWN protocol. Existing interfaces and hash domains are reused unchanged. M8-02's proposed real-media verification domain is deliberately absent: **fourteen new implemented domains**, including the separate fake-byte-verification domain, are exported by `EXECUTION`.

Exactly nineteen new files; no modified pre-existing path:

```text
lib/storyline/render-execution-fake/contracts.ts
lib/storyline/render-execution-fake/auth.ts
lib/storyline/render-execution-fake/database.ts
lib/storyline/render-execution-fake/storage.ts
lib/storyline/render-execution-fake/source.ts
lib/storyline/render-execution-fake/process.ts
lib/storyline/render-execution-fake/service.ts
lib/storyline/render-execution-fake/index.ts
tests/storyline/render-execution-fake/contracts.test.ts
tests/storyline/render-execution-fake/fixture.ts
tests/storyline/render-execution-fake/lifecycle.test.ts
tests/storyline/render-execution-fake/recovery.test.ts
tests/storyline/render-execution-fake/security.test.ts
tests/storyline/render-execution-fake/storage-process.test.ts
tests/storyline/render-execution-fake/child.fixture.ts
tests/storyline/render-execution-fake/restart.test.ts
tests/storyline/render-execution-fake/schema.sql
tests/storyline/render-execution-fake/production-audit.mjs
docs/STORYLINE_M8_03_FAKE_EXECUTION_FOUNDATION.md
```

All eight runtime modules import `server-only`. There is no `use server`, application composition, production authentication resolver, environment activation switch, worker, provider, engine, source-video loader, renderer, playable output, audio input or UI control. No package installation. Existing Studio layout/navigation and unavailable production behavior remain unchanged.

## Implemented interfaces and contracts

| Module | Actual exports and behavior |
| --- | --- |
| contracts | `EXECUTION`, `limits`, `restrictions`, `measurements`, `fakeProfile`, `profileHash`, `parseEnvelope`, `envelope`, `envelopeHash`, `workHash`, `FakeExecutionError`; strict bounded canonical unknown-value parsing with exact field sets. Domains are `story-recap-execution-{request,source-binding,admission,submission,checkpoint,result,stage,fake-byte-verification,artifact,access,lifecycle,recovery,audit,profile}-v1`. |
| auth | `newSessionFixture`, `createSyntheticExecutionAuthenticationForTest`, `verifyExecutionRequest`, `csrfHash`; private WeakMap authority independently verifies the native Request, current fixture session, exact four-part scope/namespace/action/origin/URL/method/Fetch Metadata and mutation CSRF. A serialized authority or browser role claim fails. |
| database | `createExecutionGatewayForTest`, `assertExecutionDatabase`, `CommitUnknown`; nine action-specific Unix-socket connections, catalog assertions on each actual backend, one-use canonical HMAC proofs and transaction-bound fact proofs. No ambient connection fallback. |
| source | `createFakeSourceAuthorityForTest`; independently captured immutable source envelope, actual exact-version fake-byte read/hash/count, scope, generation, expiry and revocation. No requester registration or path lookup. |
| process | `createFakeProcessOwnerForTest`, `expectedFakeOutput`; in-memory simulator, process-private nonserializable capability burned before awaits, original operation/submission binding, monotonic permit limit, concurrency/start counter and independent original-result journal. `cancelAndObserve` never invents quiescence when the result is unknown. |
| storage | `createOwnedBlobFixture`, `attachOwnedBlobFixture`, `PrivateBlobPort`, `objectVersion`, `captureBytes`, `byteHash`; private marked temp root, exact scope-bound `.owner` registry, exclusive `.blob` creation, pinned directory descriptors/no-follow bounded reads, conditional exact-version deletion and `.deleted` tombstones. No M5 audio schema imported. |
| service | `createFakeExecutionServiceForTest`: `proposal`, `reserve`, `executeFake`, `observeOriginal`, `capture`, `verify`, `finalize`, `inspectPrivate`, `inspect`, `readOperation`, `cancel`, `canonicalRequest`; separately exposed `recovery` object has only `recover`, `quarantine`, `readopt`, `releaseHold`, `gc`. It has no arm/invoke/execute/reserve method. |

An envelope is `{schemaVersion,namespace,scope,restrictions,body}`; its exact body fields are the exhaustive `schema` catalog in contracts.ts. Unknown keys, role/path/URL/command/filter/approval/permit injection, unsupported domains, unsafe/fractional numbers, invalid Unicode, getters, cycles and negative zero reject. A result's successful branch has positive bounded byte count and SHA-256; its definitive failure branch has zero bytes and null byte hash. Both require QUIESCENT; UNKNOWN is a lifecycle observation, never a forged definitive result envelope.

Source binding owns handle, fixture owner ID, immutable version, actual fake SHA/count, generation 1 and expiry. Request owns one key, complete unchanged M8 recipe, source-binding hash and **execution** profile hash. M8's own metadata profile/dependency hashes remain inside the complete replayed recipe. Admission binds original work/request/source/recipe/quota. Submission generation is fixed at 1. Checkpoint/result/stage/verification/artifact identities and all public hashes are consistency identifiers, never authentication.

`workHash` hashes a disjoint canonical projection under the admission domain: namespace/scope, complete recipe, source-binding hash and execution-profile hash, excluding the key. An admission envelope has a different strictly parsed shape. Execution profile hashing likewise uses the fixed profile body; neither projection can be parsed as a capability or substituted for an envelope. Repeated same key/exact request converges; changed content rejects; a different key for identical work aliases the original. One unresolved operation per exact scope prevents a newly owner-registered source version/new work key from evading UNKNOWN.

All permanent labels remain DISPOSABLE_FAKE_ONLY, SYNTHETIC_ONLY, SIMULATED_NOT_MEDIA, MEDIA_VERIFICATION_NOT_PERFORMED, NOT_RENDERED, humanApproval NONE, sourceVerified false, originalMovieAudio EXCLUDED, synthesizedNarration NONE, speech NOT_VERIFIED, voiceSynchronization UNSUPPORTED, spendingAuthority NONE and publicationEligibility false. Actual codec, frames, duration and streams are NOT_MEASURED. There is no actual track-exclusion or frame-cut certification. M8-01's executable false, DISABLED_HANDOFF_ONLY, NOT_PROBED and POSSESSION_NOT_ESTABLISHED labels are never changed.

## Actual disposable schema and authority

`execution_m803` is installed only by the new fixture administrator in the same newly owned PostgreSQL database as unchanged `highlight_m602`/`timeline_m702`. Fifteen tables: fixture, scope, session, access_grant, proof_key, used_proof, source, work, key_slot, state, fact, audit_event, read_hold, gc_intent and tombstone. Composite namespace/tenant/project/movie/studio foreign keys bind owned work, aliases, state, facts, audits, holds, delete intent and tombstones. Session/principal agreement is independently checked in SQL. No production migrations or existing M6/M7 SQL edits.

The non-login non-elevated owner receives only the required M6/M7 reads, cooperating row-lock privileges and named pure helper execution. Action logins inherit exactly one restricted wrapper, have no direct private table/column/sequence privileges, owner membership, schema/temporary creation, server-file/program privileges or arbitrary helper execution. Catalog checks verify actual login/database/socket, owners, purpose-specific function grants, fixed search paths, no PUBLIC helper execution, immutable guards and deferred completion. There are ten SECURITY DEFINER functions: private dispatcher plus nine wrappers; only the appropriate wrapper is executable by each login.

Six core immutable tables have row and truncate guards (twelve triggers); source binding/payload fields have an immutable row guard and truncate guard, while the source permission's enabled flag can be revoked. One deferred state-completion trigger requires matching audit, live session/deadline, original result for terminal success/failure and artifact for AVAILABLE. Critical currentness is rechecked at COMMIT. Privileged scratch administrators remain outside the runtime attacker model; fixture fault controls use that authority deliberately, never application connections.

| Action | Separate server/DB grant and restrictions |
| --- | --- |
| inspect | Explicit canInspectFakeSource; no M7 save-right inference. |
| execute | canExecuteFake plus inspect; original live reserve/checkpoint path only. |
| observe | Original simulator-owned journal only; matching duplicates preserve immutable result, conflict rolls back and separately quarantines. |
| validate | Explicit independent validator plus inspect; compares actual bytes/owned original expectation, never claimed measured media. |
| finalize | Explicit finalizer, execute and inspect; original success/quiescence, verified exact version, fresh source/M7/M6 and CAS. |
| read | canReadFakeArtifact plus inspect; current source/access/availability, bounded full read hold and response fence. |
| recover | Separate recovery grant, current service identity and owner/revision CAS; observation/hold management only. No fake invocation. |
| quarantine / gc | Separate scoped grants. Quarantine preserves original facts. GC requires resolved quiescence, explicit hold release, elapsed retention and no readers. |

Native M7 canCreate is neither necessary nor sufficient: a test independently grants fake execution to an M7 read-only principal and succeeds; ungranted M7 editors are denied. Independent M7/M6 canRead/session/grant agreement is still required at critical commit fences. Expiry/revocation denies new mutation/read, while a currently authorized recovery principal can preserve historical original evidence.

## Currentness, proof and transaction boundaries

Each admission/checkpoint/launch fence/finalization independently calls unchanged `validateRenderRecipe` on expectations reconstructed from actual saved M7/M6 rows and their immediate parent/dependency/audit captures. Selected full record/plan domains/hashes/version, both heads, source/narration/candidate/evidence, policies and profile are checked. Fixture source binding SHA/count equals the independently replayed M1/M7 fingerprint. The source is arbitrary opaque text, so this equality proves no movie possession or media validity.

SQL capture locks M7 scope/session/grant → M6 scope/session/grant/policy/current dependency/head → M7 policy/head, then new scoped authorization/source rows, fixture quota and work state. Source/head/policy writers cooperate on those actual rows. `pg_blocking_pids` tests prove separate real writers wait behind the **committing** admission/finalization backend, then can immediately make the committed artifact stale. Earlier CURRENT_AT_READ is not a lease or final fence. No locks are held during source/output byte I/O. Source policy rows remain locked through commit; capture size is checked before it is returned to the client.

The action proof binds canonical body bytes, scope/namespace, actor/session/action, nonce, backend PID/transaction, pinned origin/CSRF and current DB deadline. Fact proofs additionally bind exact checkpoint/result/verification/artifact domain/hash, operation, owner generation/revision and committing backend/transaction. SQL independently reconstructs verification/artifact lineage, exact hashes/version/count/measurements. Nonce reuse, altered body/action/scope/backend/transaction and expired proof after an actual source lock wait reject. Current DB wall time after waits and at COMMIT is distinct from transaction-start time and the local monotonic fake permit deadline.

There is no atomic DB/OS start promise. Original acknowledged launch-fence admission is the linearization point; later source/permission changes can make work stale and prevent adoption/read. Actual fake start is synchronous after consuming the capability. This is no certification of real supervisor revocation latency, distributed authorization or sandbox guarantees.

## Lifecycle, ambiguity and quotas

RESERVED → CHECKPOINTED → SUCCESS/FAILURE/UNKNOWN; only original owned journal evidence may resolve UNKNOWN. RESERVED can be explicitly cancelled without invoking. Later cancellation retains its flag and any actual original outcome; even a late successful result cannot finalize. A result is never overwritten. An obsolete revision/generation proof is rejected. `recover` advances owner generation only; submission generation remains 1. Neither a stored checkpoint/ACK marker, new service, request alias, fresh key, missing lookup nor timeout creates a live invocation flow.

The live-flow map exists only after an original observed successful reservation commit and is consumed before awaits. Checkpoint and launch-fence commits precede issuing the nonserializable process capability; its WeakMap record is removed before any asynchronous simulator boundary. BEFORE_START loss may leave UNKNOWN with zero starts; AFTER_START loss may leave UNKNOWN with one. Recovery has no invoke capability. Original successful results survive in the independent journal/SQL fact; recovery can explicitly revalidate/readopt an uncommitted quarantined attempt only with that original definitive result and fresh source/verification/currentness. A committed quarantined artifact has no automatic rehabilitation path.

`readOperation` uses the original scoped key and exact request hash. FOUND returns that original operation; NOT_FOUND establishes no rollback and triggers no automatic reserve/start. Lost create ACK re-inspects the exact original version. Lost finalization ACK discovers the same committed artifact; it does not quarantine a valid commit merely because its ACK was lost. Concurrent finalizers produce one immutable artifact or a CAS conflict, without quarantining the winner.

Limits: 2 MiB request, 32 MiB independent capture, 64 segments, 1 MiB source/output blob, 32 MiB physical fixture ceiling with 4 MiB excluded from ordinary allocation, maximum 16 operations/32 registered versions, one unresolved scope slot and simulator concurrency one. Ledger reserves 2 MiB per operation conservatively, so its 28 MiB ordinary budget can bind before the 16-operation cap. Version/tombstone identities are not reused. Key aliases are capped at 128; ordinary action proofs at 14,000, recovery/quarantine/GC at 20,000, retaining metadata headroom. No silent truncation, evidence eviction, prefix deletion or quota release to bypass UNKNOWN. First protocol retains all operation/work claims and conservatively retains charged quota even after byte GC; capacity exhaustion stops admission, rather than silently recycling identity.

## Private fake artifacts, quarantine and deletion

Source registration happens during independent fixture setup before immutable M1–M4/M6/M7 records are saved. The complete source/narration chain is rebuilt with that fixture's actual opaque byte fingerprint, rather than mutating stored drafts later. An ordinary requester can select no path or replacement source. The source authority checks actual complete bytes, immutable version, scope/handle generation, expiry and revocation. Root ownership marker/nonce and pinned no-follow descriptors prevent normal traversal/symlink/foreign-version substitution. Same-UID administrator/kernel compromise is outside this fixture guarantee; chmod/stat checks are not a real media sandbox.

Output version is ledger-reserved before capture. SUCCESS plus original quiescent journal is required before exclusive private `.blob` creation. Independent verification reads complete actual bytes and compares them with the separate deterministic original-work expectation, result, stage, source binding and recipe/dependency/execution profile. Byte SHA-256 is separate from recipe/observation hashes. Codec/frame/audio assertions remain NOT_MEASURED, even if someone supplies matching byte hashes or a successful fake exit. Fake-real verification discriminator mismatch rejects.

Finalization rereads bytes outside locks, then replays/fences current M7/M6/source/authorization on its saving transaction and atomically inserts immutable artifact/audit plus AVAILABLE state. No public storage, post-commit publication/copy/promotion, player, URL or download endpoint exists. Original M4/M6/M7 payloads remain byte-identical.

Private inspection acquires a bounded hold, fully checks bytes before response, then rechecks current authorization/availability. Revocation/quarantine/missing/corrupt data denies without partial output. An expired session may strand a conservative read hold; expiry never proves descriptor closure or authorizes GC. This first fixture protocol requires explicit recovery/operator review for such stranded holds, rather than guessing that readers stopped.

Corrupt/partial/conflicting/missing/stale evidence is unavailable/quarantined. Original result/verification/artifact facts remain immutable. GC requires definitive outcome/quiescence, explicit recovery/source/quarantine hold release, retention elapsed, QUARANTINED availability, no live read hold and revision/owner CAS. Exact-version intent commits before deletion and excludes finalizers/new readers. Storage verifies exact hash/count/version and creates a matching persistent tombstone; an unknown delete ACK reconciles only that intent. Missing bytes without the exact tombstone do not prove deletion. No owner-lease expiry, new request, full disk or timeout releases UNKNOWN evidence. No list/prefix/wildcard/latest-version deletion or caller-controlled path.

## Fault and restart evidence

Executable negative coverage includes strict field/domain/measurement/size/serialization controls; native auth/scope/origin/CSRF/expiry/revocation; actual privilege/column/helper/owner/TEMP denial; MAC scope/action/backend/transaction/nonce/deadline binding; original artifact preservation; source/current M7/M6/policy changes; actual independent writer blocking; admission quota/rollback; lost reservation/checkpoint/create/finalize/delete ACK; before-permit/start/result-journal faults; UNKNOWN with valid-looking planted bytes; stale owner; conflicting original result; concurrent finalizers; corruption/truncation/oversize/missing output; unauthorized/read-hold/GC race; retention/tombstone/no-ID-reuse; fake simulator concurrency and zero fetch calls. Static runtime imports additionally prohibit media/subprocess/provider/network adapters.

Exactly one **new service-only child entry point** is enumerated: `tests/storyline/render-execution-fake/child.fixture.ts`, invoked only by restart.test.ts using Node `fork` with explicit react-server/tsx flags, minimal environment and private IPC fixture credentials. It imports only this fake service stack; it bootstraps no database/worker or media process. Three tests SIGKILL it at checkpoint-after-commit (reported fake starts 0), fake-started (1), and finalization-after-commit (1). The parent retains owned PostgreSQL/private blob fixtures, recreates the service/simulator, and proves zero replacement starts. The first two retain UNKNOWN; the third privately inspects the same committed artifact. Process-local start observations and replacement counters are test oracles, not a durable real-process accounting service. This proves the tested service-crash protocol, not power-loss, backup/restore, real-process cleanup or multi-host durability.

## Verification results

The following commands have completed; historical PASS counts are not substituted. Every application/compiler/build/server/browser command uses the unreachable `postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable` application datasource. Database tests create new owned private Unix-socket PostgreSQL clusters. Timing-sensitive server suites run serially without competing browser/compiler/build work.

| Check | Fresh result / receipt |
| --- | --- |
| Pre-SQL strict contracts | Initial command executed before implementing gateways/installing new SQL and reported one PASS file-level wrapper (`contracts-before-sql.log`), with no individual-case count; excluded from totals. Final focused runs report all **21 strict contract cases** before their first M8-03 SQL fixture; all pass inside the 82-case suite. |
| M8-03 focused acceptance including service SIGKILL | **82/82 PASS**, zero failed/cancelled/skipped/TODO; 132.43 s (`focused-accepted.log`). |
| Unchanged M8-01 planning | **150/150 PASS**, zero failed/cancelled/skipped/TODO; 35.38 s (`m801-focused.log`). |
| Consolidated applicable M1–M8 server/M5/M6/M7/security/legacy pure regressions | **1,856/1,856 PASS**, zero failed/cancelled/skipped/TODO, 817.55 s (`server-regressions.log`); includes all **16/16 unchanged expiry controls** with no recurrence. |
| Existing UI components / all Studio and legacy Chromium suites | **51/51 components PASS**, 0.98 s (`components.log`); **6/6 Chromium PASS**, 90.79 s (`chromium.log`), every suite covers 1440/1024/390. Zero failures/cancellations/skips/TODO. |
| Lint / TypeScript | PASS, exit 0 (`lint-final.log`, `tsc-final.log`). |
| Dummy-datasource Webpack / applicable production audits | **PASS**, exit 0: compile 7.8 s, TypeScript 3.4 s, 12/12 static pages and trace collection (`webpack.log`). **6/6 production audits PASS**: M6, M7-01/02/03, M8-01/03; 71 client chunks, 144 server JS files, 108 production sources in full scans, 38 unchanged API routes, zero Server Actions and zero prohibited runtime/auth/fixture/credential matches (`*-production.json`). |
| Exact source preservation / file scope / secret / whitespace / staged checks | PASS: 623 baseline text hashes and all 18 frozen implementation/test hashes unchanged; exactly nineteen new owned files, original expiry SHA unchanged. Owned secret/runtime-boundary/whitespace scans pass (`source-preservation.json`, `static-boundaries.json`). Final exact-path index checks are repeated after this results update and before commit, with receipts in `staged-audit.json`. |

**Accounting: 2,145 successful acceptance executions = 82 focused M8-03 + 150 focused M8-01 + 1,856 consolidated + 51 components + 6 Chromium. Both focused suites overlap the consolidated run in full (232 repeats), leaving 1,913 distinct Node-reported cases.** Audit commands, viewport iterations, individual assertions and child-process events are not extra cases. `acceptance-results.json` records the final counts/receipts.

Development logs are retained: **229 individually reported executions, 174 passes and 55 resolved failures**, separate from acceptance. Two initial sandbox file-level wrappers (one PASS, one FAIL) expose no individual-case evidence and are excluded from those totals. The failures concern only the new schema's private-owner grants, SQL variable/JSON-expression naming and a quota CASE syntax error; none involved the M4 expiry control. A 64-case development run passed; a later schema refinement caused bootstrap failures; the corrected stable implementation passed 77 cases, then the final 82 after adding crash/security controls. No existing assertion, deadline, source contract or M6/M7 schema was weakened. Code/test hashes were frozen before final acceptance; documentation results updates are audited/restaged separately. Development details remain in `development-results.json` and their original logs.

Fresh browser artifacts: `/tmp/recap-recovery-browser-codyAR/`, `/tmp/storyline-m9-save-browser-FcdzHh/`, `/tmp/storyline-m603-browser-QdfHwC/`, `/tmp/storyline-m703-browser-rrzkBi/`, `/tmp/recap-studio-navigation-y0JRPf/`, `/tmp/storyline-m9-recovery-browser-dkLDLD/`. `browser-summary.json` retains viewport/operation receipts. Existing six-destination navigation, responsive checks, immutable originals, save/read/history/conflict/recovery and local edit isolation pass. No M8 UI control or media player was added; these are existing UI regression checks, not real-media or comprehensive assistive-technology certification.

Reproduction commands from the project root (the export applies only the unreachable application datasource; fixtures supply their own newly owned connections):

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 tests/storyline/render-execution-fake/*.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 tests/storyline/render-planning/*.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/durable-fake/*.test.ts \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/highlights-studio/acceptance.test.ts tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts \
  tests/storyline/timeline/*.test.ts tests/storyline/timeline-persistence/*.test.ts tests/storyline/timeline-studio/acceptance.test.ts \
  tests/storyline/render-planning/*.test.ts tests/storyline/render-execution-fake/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=tap \
  tests/storyline/timeline-studio/component.test.tsx tests/storyline/highlights-studio/component.test.tsx \
  tests/storyline/editor-saving/component.test.tsx tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
NEXT_TELEMETRY_DISABLED=1 pnpm exec next build --webpack
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs tests/storyline/ui/script-preview-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs tests/storyline/highlights-studio/browser.test.mjs tests/storyline/timeline-studio/browser.test.mjs
node tests/storyline/highlights-studio/production-audit.mjs
node tests/storyline/timeline/production-audit.mjs
node tests/storyline/timeline-persistence/production-audit.mjs
node tests/storyline/timeline-studio/production-audit.mjs
node tests/storyline/render-planning/production-audit.mjs
node tests/storyline/render-execution-fake/production-audit.mjs
git diff --check
git diff --cached --check
```

## Operational limitations and M8-04 handoff

The original M4 expiry incident remains **UNRESOLVED**: M1-last actual-wire-before-expiry positive repeat 2 expected one fake-wire entry and observed zero with the unchanged 700 ms confirmation. Later passes do not establish a root cause or repair. Preserve all sixteen controls and source SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. Any recurrence needs original DB wall/transaction times, lock waits, checkpoint ACK, confirmation/lease epochs and monotonic permit/wire boundary evidence; never dismiss it as flakiness or widen deadlines.

This is a single owned disposable fixture protocol. Trusted fixture owners/admins/key holders can violate its assumptions; no production authentication, full tenant source RLS, key custody, distributed revocation, real sandbox, parser/encoder pinning, real source possession, actual frame fidelity/track validation, cloud durability, backups, publication, human approval, spending or real Myanmar voice is implemented. Stranded read/UNKNOWN holds and permanent quota/key/tombstone retention intentionally sacrifice liveness. Recovery has bounded explicit methods, no scheduled worker. Existing M5 regression fixtures may exercise their unchanged synthetic WAV protocol; no M5 bytes become M8 input or timing, and this module creates only non-media blobs.

Resource reservations model blob payloads and bounded ledger records; they are not OS quotas or a bound on PostgreSQL cluster/WAL physical size. Quarantine mutation itself requires the separately granted live quarantine capability; a caller that loses that authority still receives no invalid/partial bytes, retains conservative holds and requires an authorized coordinator to mark availability. No fallback identity or privilege escalation is introduced to bypass revocation. Historical stale operations are inspected through readOperation/recovery; fresh reserve/admission always requires present eligibility.

M8-04 must receive a separate scope and security review. Recommended next work is an independent review of the implemented fake contracts/gateways/proofs/storage/recovery and any additional fake-only ownership/retention cases. It does **not** inherit authorization for FFmpeg, ffprobe, probing, decoders, encoders, real movie bytes, production endpoints/authentication/storage, TTS, approval, providers or publication. All real-execution blockers from M8-02 remain open. No M8-04 implementation begins here.

After every required acceptance check passes, stage only the nineteen explicit paths above, verify staged bytes/whitespace/secrets and baseline preservation, then make the requested local commit `feat(storyline): add disposable fake render execution lifecycle`. Full commit hash and final tree status are reported outside this document; no push.
