# M8-04 — Independent fake execution security acceptance

Date: 2026-10-20, Asia/Bangkok. Scope: DISPOSABLE_FAKE_ONLY security review, adversarial tests and narrowly reproduced corrections. **M8-04 PASS — DISPOSABLE_FAKE_ONLY.** All final retained security/regression/UI/build/audit checks passed after the narrowly reproduced fixes. Real media execution and production activation remain blocked.

## Baseline and methodology

Verified clean entry on `recovery/m9-studio` at exactly `52eb396df20206ffe331f0965c38af2babfc21e3`. Initial index, unstaged and untracked inventories were empty. Fresh logs and text-hash receipts are retained in `/home/hanlinko/Desktop/movie-translator/coverage/m8-04-agmhohxu/`; Existing repository reports and unrelated work are unchanged. `baseline.json` hashes 659 original UTF-8 tracked Git blobs from the expected baseline. The tracked favicon is excluded from the text-hash inventory; no movie/audio source or render output was inspected. Git metadata checks cover unrelated tracked paths.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), the installed Next.js data-security guide, [M8-03](STORYLINE_M8_03_FAKE_EXECUTION_FOUNDATION.md), [M8-02](STORYLINE_M8_02_MEDIA_EXECUTION_SECURITY_DESIGN.md), [M8-01](STORYLINE_M8_01_RENDER_PLANNING.md), [M7 acceptance](STORYLINE_M7_FINAL_ACCEPTANCE.md), [M6 acceptance](STORYLINE_M6_FINAL_ACCEPTANCE.md), [M5 acceptance](STORYLINE_M5_FINAL_ACCEPTANCE.md) and [M5 durable implementation](STORYLINE_M5_05_DURABLE_FAKE_LIFECYCLE.md). Historical PASS counts are not fresh evidence.

Audited all eight actual `lib/storyline/render-execution-fake/` modules: contracts, authentication, database, source, process, storage, service and index; all files under its test namespace, including scratch SQL, enumerated child and production audit; and the owned PostgreSQL helper. Inspected M8 planning contracts/parsers/full replay, M7/M6 contracts, authentication, repository/currentness replay and cooperating SQL schemas. M5 durable contracts/storage/lifecycle are comparisons only; their audio schemas are not M8 schemas. Actual exports take precedence over documentation.

Independent review used new tests, separate restricted connections, correctly signed negative SQL calls, independent source/head writers, explicit transaction/ACK cuts and owner-injected corruption of newly created non-media blobs. Failing cases were recorded before corrections. A subsequent execution-environment reset preserved the nine worktree paths but removed the original temporary logs and interrupted a consolidated run. Those interrupted/unretained results are excluded from final acceptance. To retain fresh failure evidence, the new tests were rerun against an isolated exact copy of baseline runtime/SQL, without reverting corrected workspace files. `baseline-reproduction.json` pins those baseline hashes; the alternative-operation probe is retained as text. The first overlay command exited 127 before tests because Node was absent from that shell PATH; the explicit installed-binary rerun supplies the counted evidence. Retained receipts now live in the ignored project directory above. Existing adversarial and restart tests were then rerun against the corrected source. No assertions, old deadlines, domains, M6/M7 roles or production defaults were relaxed. This is an independent review pass within this task, not a claim of an outside security organization, separate auditor identity or formal proof.

## Reproduced vulnerabilities and disposition

| Finding | Reproduction before fix | Narrow correction and executable regression |
| --- | --- | --- |
| Concurrent storage quota checks were not atomic | Starting from 31 versions, nine concurrent registrations left 40 against the 32-version ceiling. Starting from 27 MiB, two concurrent one-MiB creates left 30,408,704 bytes, exceeding the 28-MiB ordinary budget and using recovery headroom. `baseline-negative-accepted.log`: quota failures. | `storage.ts` acquires an exclusive fixed-name mutation fence in the pinned owned root around registration, create and delete. No waiting, eviction or automatic retry: contention returns STORAGE_BUSY before that caller mutates a version. New tests fill 31 versions/27 MiB first, then race attachments at each boundary, retaining exactly 32 versions/28 MiB. |
| Delete reconciliation trusted a tombstone without checking surviving bytes | A matching original tombstone plus a substituted blob was silently deleted. `baseline-negative-accepted.log`: conditional-delete failure. This is deliberate trusted-owner corruption injection, not a claimed same-UID sandbox escape. | A matching tombstone acknowledges absence only. Surviving bytes must still match the original exact hash and length; disagreement denies deletion and retains evidence. Existing lost-delete-ACK reconciliation remains supported. |
| Maintenance grants implicitly allowed private source inspection | Recover-only, quarantine-only and GC-only identities each obtained independent source/recipe/lineage capture (`baseline-negative-accepted.log`). Follow-up tests also found the full saved-operation inspection path returned source-bearing recipe metadata (`baseline-negative-accepted.log` and `baseline-inspection-negative.log`). | Both native proof broker and restricted SQL capture/inspect branches require the separate inspect grant. New tests also bypass the broker with correctly signed, backend/transaction-bound proofs to establish independent SQL denial of both paths. Maintenance service operations that load full source-bearing state now need their own action plus inspect; no role grant is broadened. |
| Failed private reads did not persist quarantine | A read-only inspector rejected corrupt bytes but left availability AVAILABLE. Its GET request could not authenticate a POST quarantine operation; it also lacked the mutation grant. `baseline-negative-accepted.log`: one availability failure. | The fixture service now requires an explicit `quarantineRequest` provider. The owned fixture/child inject a separate editor-b POST identity; native and SQL checks authenticate it afresh. Reader grants stay read/inspect only. Missing/truncated/extra/corrupt bytes deny delivery, preserve immutable facts and quarantine under the coordinator's identity. |
| Unauthorized callers could consume someone else's original live flow | Wrong-tenant execute and cancel were rejected, but each deleted the original in-memory flow first; the legitimate owner then received NO_ORIGINAL_FLOW (`baseline-negative-accepted.log`: two live-flow failures). | Execute authenticates and matches the original session/principal before consuming the flow, still before awaits. Cancel deletes the live flow only after its authorized SQL transition succeeds. Negative tests also challenge same-scope wrong-session execution and server/DB grant disagreement; the legitimate owner subsequently starts once, with replay denied. |
| NULL-containing grant arrays failed open in SQL | With native identity still valid but DB actions reduced to `['inspect',NULL]`, execute was accepted: PostgreSQL NOT/ANY returned NULL and PL/pgSQL skipped the denial (`baseline-negative-accepted.log`). | Every action/inspect/execute prerequisite uses explicit `IS NOT TRUE`; missing and NULL permissions deny. No new grant or schema/role is introduced. |
| SQL accepted incomplete definitive result evidence | A correctly action/fact-MACed result missing quiescence committed UNKNOWN → FAILURE despite no original simulator result or start (`baseline-negative-accepted.log`). This exercises an authorized proof-broker fault, not a browser holding a signing key. | SQL reconstructs and compares the complete expected result body, including numeric generation 1 and explicit QUIESCENT. Missing/null/extra/coerced fields reject. All four fact kinds additionally require the exact five envelope keys. Independent SQL tests bypass the TypeScript parser, preserve UNKNOWN and retain zero starts. |

The mutation fence is not a lease. An abandoned `MUTATION_LOCK` is never reaped by age, expiry, attachment or UNKNOWN recovery. A new test proves reads retain existing bytes while new mutations/delete fail closed. Manual ownership/quiescence recovery for a stranded fence is deliberately not implemented. The fence prevents cooperating port races; it is not protection against a privileged/same-UID administrator changing the root behind the port.

A revoked/unavailable quarantine coordinator cannot borrow the reader's identity or another grant. The read still returns no bytes, but last-known availability metadata can remain until an authorized coordinator acts. A negative test proves no unauthorized quarantine audit is inserted, then explicitly quarantines through a different currently authorized principal. AVAILABLE records the last committed verification/availability observation, not a promise that storage can never subsequently disappear. Every private delivery independently checks complete bytes and a final access/availability fence. Production monitoring/operator escalation and coherent revocation remain blockers.

## Frozen contracts and authority

The unchanged `EXECUTION` catalog contains exactly fourteen domains:

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

Strict envelopes have exactly `{schemaVersion,namespace,scope,restrictions,body}`, with exhaustive per-kind fields, four-part tenant/project/movie/studio scope, bounded canonical parsing and deeply frozen results. Unknown fields, unsupported versions, unsafe numbers, getters/cycles, executable claims, paths/URLs, command/filter/role/approval/permit injection reject. The canonical serializer and every pre-existing M1–M8 domain are unchanged. Public SHA-256 hashes establish consistency, never independent truth or authority.

Request/key, canonical work and operation are separate. Work excludes the key under a disjoint admission-domain projection; strict envelope shapes prevent substituting that projection as an admission capability. The profile-body projection likewise differs from its strict envelope. Same scope/key/exact request discovers the original; changed request conflicts; different-key same-work aliases the original. Submission generation stays 1. Owner generation/revision are CAS coordinates for observation/recovery, not a launch generation.

All output/source/artifact envelopes permanently retain DISPOSABLE_FAKE_ONLY, SYNTHETIC_ONLY, SIMULATED_NOT_MEDIA, MEDIA_VERIFICATION_NOT_PERFORMED, NOT_RENDERED, humanApproval NONE, sourceVerified false, originalMovieAudio EXCLUDED, synthesizedNarration NONE, speech NOT_VERIFIED, voiceSynchronization UNSUPPORTED, spendingAuthority NONE and publicationEligibility false. Codec/frames/duration/streams remain NOT_MEASURED. The real-media verification discriminator is absent. No matching outer hash or successful fake result can promote these facts.

M8-01's public index exports pure input/profile/source/proposal parsers and generate/validateRenderRecipe; internal recipe parsing is shape/self-hash validation only. Its disabled proposal and RenderRecipe remain unchanged and non-executable. The execution service independently regenerates the complete recipe from registered M7/M6/source observations. A new forged-dependency receipt test obtains a valid envelope/hash and transaction fact proof but SQL still rejects it; the original verification remains immutable.

## Authentication and PostgreSQL findings

Native Request method and exact URL, pinned Origin, same-origin Fetch Metadata, unique opaque session cookie, mutation CSRF, expiry/revocation, namespace/scope and action grants are checked before effects and again at committing boundaries. Added tests reject GET/PUT mutations and alternate query/path despite valid cookies. The private WeakMap authentication registry is injected server fixture authority; browser JSON/role claims or a serialized capability cannot register identity.

M8 has no HTTP session/bootstrap endpoint or browser transport. Its native cookie fixture therefore does not certify an actual production HttpOnly cookie issuer. Existing M6/M7 browser fixtures test their own HttpOnly policy; no M8 credential is placed in a browser. Production authentication and cookie issuance remain absent.

SQL independently verifies live session/principal/grant/origin/CSRF agreement and a purpose-specific login/key. The one-use nonce and MAC bind exact canonical body hash, access domain, namespace/four-part scope, actor, action, backend PID, transaction ID and current DB deadline. Additional fact MACs bind their exact checkpoint/result/verification/artifact domain, fact hash and current operation/owner/revision on that backend. Correct outer hashes are insufficient. Proof expiry is checked after lock waits; the deferred transition completion fence checks expiry/session/currentness at COMMIT.

All nine restricted action gateways retain their separate grants: inspect, execute, observe, validate, finalize, read, recover, quarantine, GC. M7 canCreate is not inherited: the added exact same-scope M7 editor with no fake execute grant is denied; the existing independently granted M7 reader case still exercises the converse. Execute/validate/finalize/read require inspect; finalize additionally requires execute. Source-lineage capture and full source-bearing operation inspection always require inspect, including when called through a maintenance action. The ledger remains scoped and requires the separate mutation grant; inspect alone grants no execution, recovery, quarantine or GC.

Actual catalog tests cover non-login/non-elevated schema owner, non-elevated restricted logins, no owner/elevated/server-file/program membership, no direct private table/column/sequence access, no schema/TEMP creation or arbitrary helper/other-wrapper execution, fixed function owner/search paths, immutable guards and deferred completion. Added tests set the caller search path to public/pg_temp: logins still cannot create shadow helpers or ALTER any of the nine gateway search paths. SECURITY DEFINER functions retain fixed qualified paths. User-configurable caller search_path alone is not an authority bypass.

Six immutable core tables retain twelve row/truncate guards, source bindings retain two immutable guards, and state completion remains deferred. Composite scoped foreign keys, unique original work/key/fact/artifact identities and append-only audit remain intact. Forced audit insertion failure rolls back artifact and AVAILABLE together; original result/verification survive. No M6/M7 SQL or login is changed.

## Independent currentness and lock findings

Fresh admission/checkpoint/launch/finalization/private-read transactions reload exact saved M7 record/domain/version/hash/head and current M6 record/head/source/narration/candidate/evidence/policy lineage. Pure replay includes M3 claims/observed basis and M4/R4 ancestry, immediate parent/audit/dependency integrity and the complete unchanged M8 profile/recipe. Historical CURRENT_AT_READ or a caller CURRENT field is not authority. Fake source binding SHA/count equals the actual independently seeded opaque-byte fingerprint, not a requester replacement.

The cooperating lineage order is action key → M7 scope/session/grant → M6 scope/session/grant/policy/current dependency/head → M7 policy/head → execution scope/session/grant. Critical service replay transactions next acquire the source SHARE lock through capture before fixture quota/work mutation. A standalone ownership inspect/mutation instead locks fixture quota before loading its immutable work/source and locking work state. These are the actual paths, not a claim that every raw gateway acquires source/quota in one identical order. Existing M6 writers never acquire M7/execution rows; existing M7 writers never acquire execution rows. Actual independent writer blocking tests challenge both admission and finalization through COMMIT on the saving backend. The added lock-wait test commits an M7 head change while admission waits: admission denies and no work/start is created. Post-commit drift preserves immutable history but later adoption/read/finalization requires new current eligibility. Timeouts/deadlocks remain fail-closed metadata outcomes; no automatic fake launch follows them. A broader exhaustive scheduler/deadlock proof is not claimed.

No source/blob I/O occurs while SQL locks are held. Native byte validation, SQL currentness fencing and private immutable storage are separate trust boundaries; these are not distributed atomic transactions or instantaneous global revocation guarantees.

## One-use invocation, UNKNOWN and crashes

The original observed reservation commit alone creates an in-memory live-flow entry. It is consumed before awaits; checkpoint and launch-fence commits plus observed acknowledgement precede the private simulator permit. A WeakMap permit is nonserializable, removed before the first asynchronous invocation boundary, bound to original operation/submission/owner and monotonic deadline. The deterministic in-memory ProcessOwner has no subprocess/engine/network fallback.

Recovery exposes original observation, quarantine, hold release, readoption and GC, with no arm/invoke/reserve capability. Neither copied ACK, new service, owner takeover, same/different-key alias, NOT_FOUND, timeout nor UNKNOWN recreates live authority. At most one fake start is observed per original work. New concurrent recovery tests retain submission generation 1 and UNKNOWN while the original counter remains unchanged. A privileged fixture owner can construct a simulator or journal; that trusted setup seam is not an untrusted request path or production authentication guarantee.

| Cut / challenge | Required observed disposition |
| --- | --- |
| Crash before checkpoint / lost reservation ACK | No reconstructed live flow; original scoped operation lookup only; no automatic reserve/start. |
| Checkpoint ACK lost / permit consumed before start | UNKNOWN can retain zero starts. Recovery never interprets that zero as proof permitting launch. |
| After fake start / before original journal | UNKNOWN retains one original start and uncertain quiescence. Existing original evidence alone can resolve it. |
| Lost original observation / conflicting result / stale owner | Immutable original result or conflict/quarantine; obsolete revision/generation cannot overwrite/finalize. |
| Lost storage-create ACK | Reinspect same original exact version; no overwrite/new version. |
| Lost verification ACK | New test reads the original committed verification, recovers/finalizes the original work, counter stays one. |
| Lost finalization ACK / concurrent finalizers / audit rollback | One immutable artifact or rollback/CAS conflict; no replacement execution. |
| Concurrent recovery / cancellation / planted output with UNKNOWN | No launch, new submission or adoption without original definitive successful quiescent evidence. |

The existing specifically enumerated service-only child is reused unchanged in purpose: SIGKILL after checkpoint commit reports zero starts; after fake start reports one; after finalization commit reports one. Restarted services/simulators report zero replacement starts. First two retain UNKNOWN/holds; last discovers the same SUCCESS/AVAILABLE artifact and independently reads its bytes. No new general child runner is introduced. Service restart is not power-loss, real OS process exactly-once, descendant cleanup or multi-host durability certification.

## Artifact integrity, availability, retention and GC

Fixture owner alone registers an opaque exact source version; actual bounded arbitrary non-media bytes are hashed independently. Requesters choose no path or replacement source. Private roots/markers, namespace/scope ownership, pinned directory descriptors, no-follow regular single-link reads, exclusive versions and bounded complete capture prevent ordinary path/symlink/foreign-version adoption. Same-UID administrator/kernel compromise is outside the model.

SUCCESS requires the original independently owned result journal. Capture targets the original stage; verification independently reads complete bytes and binds original result/source/recipe/dependency/profile/version/hash/count. Finalization rereads bytes, replays current scope/source/M7/M6 eligibility and atomically commits artifact/audit/availability under owner/revision CAS. Concurrent/stale/forged/unverified facts cannot replace the original. No post-commit public promotion, URL, player or application endpoint exists.

Private inspection requires independent read/inspect authority, exact immutable artifact/version, current source/access and availability, a bounded durable read hold, complete checked bytes and a final response fence. Concurrent quarantine/revocation denies without returning partial bytes. Missing/corrupt/truncated/extra bytes quarantine through the separately authenticated coordinator when available. An expired/revoked reader can leave a stranded hold; the added test proves recovery/source-hold release still cannot bypass it for GC.

GC requires resolved original outcome and simulated quiescence, QUARANTINED, explicit source/quarantine hold release, retention elapsed, no readers, owner/revision CAS, immutable exact-version delete intent and audit. UNKNOWN evidence is never reclaimed for quota. DELETE_PENDING excludes new reads/finalizers. Conditional storage removal checks exact owner/version/hash/length and persistent intent/tombstone; lost ACK reconciles the same version. Missing bytes without a matching tombstone are not an acknowledgement. A surviving changed blob cannot be deleted using an earlier tombstone. No ID reuse, prefix/wildcard/latest/delete-path interface or age-only cleanup exists.

Resource limits remain request 2 MiB, independent capture 32 MiB, 64 recipe segments, 1 MiB source/output blobs, 32 registered versions, 16 operations maximum, 28 MiB ordinary payload reservation with at least 4 MiB excluded headroom, one unresolved work per scope and one active fake invocation per fixture ledger/owner. Conservative two-MiB work reservations can bind before the 16-operation cap. Quota/audit rollback does not evict existing evidence; UNKNOWN/quarantine claims and metadata/tombstones remain retained. These are logical/bounded fixture payload limits, not PostgreSQL WAL, filesystem allocation, OS memory/disk/process or real-media ceilings.

## Fresh verification

| Final retained check | Actual completed result / receipt |
| --- | --- |
| M8-03 plus independent M8-04 security/lifecycle/storage/recovery | **108/108 PASS**, 216.06 s; includes **26 new independent cases** and the three enumerated service-only SIGKILL scenarios (`m803-final.log`, exit 0). |
| Unchanged M8-01 planning/replay | **150/150 PASS**, 42.50 s (`m801-final.log`, exit 0). |
| Consolidated applicable M1–M8/M5/M6/M7 server/security/persistence and legacy pure regressions | **1,882/1,882 PASS**, 931.81 s (`server-final.log`, exit 0). All **16/16 original expiry controls** passed without recurrence; original 700 ms assertions/source unchanged. |
| All eight current component files | **51/51 PASS**, 1.26 s (`components.log`, exit 0). |
| All six current Studio/legacy Chromium suites | **6/6 PASS**, 91.07 s; each executed 1440/1024/390 px checks (`chromium.log`, exit 0). |
| Lint / standalone TypeScript | **PASS**, both exit 0, no diagnostics (`lint-final.log`, `tsc-final.log`). |
| Dummy-datasource Webpack build | **PASS**, exit 0; Next.js 16.3.6, compiled 9.8 s, TypeScript 4.0 s, all 12/12 static pages and trace collection (`webpack.log`). |
| M6, M7-01/02/03, M8-01/03 production audits | **6/6 PASS**, each exit 0: 71 client chunks, 144 server JS files and 108 production sources in full scans; 38 unchanged API routes, zero Server Actions, zero inspected execution/auth/storage/fixture/transport/media/network or secret matches (`*-production.json`). Existing type bridges remain erased. |
| Exact paths/source/secret/whitespace and staged content | **PASS**: exactly nine review-owned Git paths; 653 original text files unchanged, six narrowly modified originals, twenty frozen M8 implementation/test files unchanged throughout final runs, all fourteen domains and original expiry SHA unchanged. Zero secret-pattern/trailing-whitespace matches. Working/index checks are repeated before the local commit (`source-audit.json`, `staged-audit.json`). |

**Final acceptance: 2,197 passing Node-reported executions = 108 + 150 + 1,882 + 51 + 6. The two focused runs repeat 258 cases wholly contained in the consolidated run, leaving 1,939 distinct final cases.** Counts include named parent/subtests as Node reports them; individual assertions, viewport iterations, fixture children and static audit scripts are not added. `test-manifest.json` verifies all 89 current Storyline server files plus four applicable legacy files, each once; its thirteen focused files are fully included. `acceptance-results.json` retains counts, durations, exit receipts, expiry results and production audit results. Every final suite reports zero failed, cancelled, skipped and TODO cases.

Fresh retained baseline reproductions are deliberately separate: **0/11** and **0/3** expectation tests passed against the unfixed exact baseline, producing **14 documented failures** across the seven defect classes (`baseline-negative-accepted.log`, `baseline-inspection-negative.log`). Corrected versions pass in the final 108-case suite. These baseline probes add no passing acceptance cases. Including them gives 2,211 retained post-reset case executions: 2,197 passes and 14 expected baseline failures. The PATH exit-127 attempt executed zero tests. Earlier pre-reset runs and the interrupted/unretained run are excluded from these totals; none is substituted for current completed evidence.

Fresh browser receipts show all six destinations and legacy Recap intact, exact synthetic save/read/history, keyboard interactions, no overflow at the target widths, immutable originals and local identity isolation. The editor audit reports zero production API/provider calls and no approval/provider side effects; the local-editor audit reports zero network/API calls. M8 has no browser transport or render control. All six suites independently report their three width checks. Browser roots are recorded in `chromium.log` and `browser-audit-summary.json`; screenshots are UI fixture artifacts, not render outputs.

Exact final verification commands from the project root (the dummy datasource is exported for each command):

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
CHROME_PATH=/opt/brave.com/brave/brave node --test --test-reporter=tap --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs tests/storyline/ui/script-preview-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs tests/storyline/highlights-studio/browser.test.mjs tests/storyline/timeline-studio/browser.test.mjs
node tests/storyline/highlights-studio/production-audit.mjs
node tests/storyline/timeline/production-audit.mjs
node tests/storyline/timeline-persistence/production-audit.mjs
node tests/storyline/timeline-studio/production-audit.mjs
node tests/storyline/render-planning/production-audit.mjs
node tests/storyline/render-execution-fake/production-audit.mjs
python3 /home/hanlinko/Desktop/movie-translator/coverage/m8-04-agmhohxu/audit-owned.py
git diff --check
git diff --cached --check
```

Every runtime/compiler/browser command explicitly sets `DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`. PostgreSQL tests own new Unix-socket clusters using the existing ownership helper; private tests create new marked roots and arbitrary `.blob` bytes. Server/timing-sensitive suites run serially with no competing compiler/browser test workload. No application datasource/migration, real movie/audio, media parser, encoder/decoder, FFmpeg/ffprobe, provider/TTS/spending, production worker, approval or SOURCE_VERIFIED issuer is invoked. Existing M5 regressions exercise their unchanged fake-audio protocol; no M5 bytes enter M8.

## Exact review-owned inventory

Modified:

```text
lib/storyline/render-execution-fake/database.ts
lib/storyline/render-execution-fake/service.ts
lib/storyline/render-execution-fake/storage.ts
tests/storyline/render-execution-fake/child.fixture.ts
tests/storyline/render-execution-fake/fixture.ts
tests/storyline/render-execution-fake/schema.sql
```

Created:

```text
tests/storyline/render-execution-fake/independent-security.test.ts
tests/storyline/render-execution-fake/independent-storage.test.ts
docs/STORYLINE_M8_04_FAKE_EXECUTION_SECURITY_ACCEPTANCE.md
```

The fixture/child changes only supply the separately authorized quarantine request. No new child executable, schema family, migration, application source, package, production script or UI is added. `review-freeze.json` pins all twenty M8-03 implementation/test files after corrections; exact source/index/secret/whitespace checks must pass before an explicit-path commit. Prior reports remain historical and unmodified; their broad storage/quarantine claims are qualified by the reproduced findings here.

## Unresolved timing risk and real-execution blockers

The historical M4 expiry incident remains **UNRESOLVED**: M1-last actual-wire-before-expiry positive repeat 2 expected one fake-wire entry but observed zero under the unchanged 700 ms confirmation. Later passes do not identify or repair the cause. Preserve all sixteen controls, assertions/deadlines and source SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. Any recurrence requires retained DB current/transaction wall times, lock waits, session/confirmation/lease epochs, original checkpoint ACK, owner generation, monotonic permit deadline and actual fake-wire entry evidence. Do not dismiss a positive-control miss as flaky or widen its deadline.

This acceptance can establish only the tested disposable fake protocol. Real source possession/rights/immutable handles, coherent distributed revocation, production identity/key custody/tenant isolation, supported OS sandbox, pinned parsers/encoders/decoders, hostile-media isolation, actual frame/timestamp/content fidelity and independent audio/track exclusion remain absent. Storage/backup/restore, distributed read holds, real resource ceilings, safe stranded-lock/reader operations and operational quarantine escalation need separate review. Synthetic verification proves no playable MP4, real stream count, H.264 codec, Myanmar speech, accurate cut or media safety.

No render control, public delivery, approval, SOURCE_VERIFIED, TTS, publication or paid authority is introduced. M8-01 proposals stay disabled and production callers omit every execution adapter. **Ready for a separately authorized M8 final acceptance of the fake foundation.** Further fake-only operations hardening may address stranded holds/fences and quarantine escalation; it needs its own scope. The seven reproduced defects are corrected for this bounded fixture model, not certified as real-media safety. No permission for real media execution or deployment follows from M8-04.


## Git disposition

Only the nine explicit review-owned paths above are staged after all final checks pass. The index must match the reviewed bytes, exact inventory, whitespace and secret scans. No ignored receipt, baseline overlay, unrelated file or prior report is staged. The requested local commit is `test(storyline): accept fake render execution security`; its full hash and final working-tree status are reported outside this document to avoid self-reference. No push. Stop after M8-04.
