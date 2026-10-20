# M7 Final Acceptance — Timeline foundation, Studio integration and M8 handoff

Date: 2026-10-20, Asia/Bangkok. **M7 Final Acceptance: PASS — SYNTHETIC_ONLY. M8-01 pure planning handoff ready for separate authorization; no M8 implementation or media execution.**

## Scope and audited baseline

This is fresh integrated acceptance of M7-01 deterministic planning, M7-02 immutable disposable persistence and M7-03 explicitly injected Timeline Studio. The expected branch `recovery/m9-studio`, exact HEAD `6eca3be29b8b381007c929f9a79240243b0717f6` and completely clean entry tree were verified. The committed chain is M7-01 `0c0bf91b94cebf813f5a605bc799e41a1997f446`, M7-02 `b4c0adad91ec02584afa3bbec1939e1ae5bee82a`, M7-03 `6eca3be29b8b381007c929f9a79240243b0717f6`, following M6 acceptance `3c758984c441624a74d207fa8e203c6f31b01bd2`. The union of those three implementation commits is exactly the 41 existing paths below; the entry audit records their SHA-256 values. Historical PASS reports are context, not this milestone's test evidence.

Read AGENTS/CLAUDE, the frozen UI baseline, all three M7 implementation reports and M5/M6/M9 final acceptance. Inspected actual pure contracts/input/resolver/planner, repository contracts/auth/gateway/resolution/service, scratch SQL, direct and browser fixtures, UI coordinator/workspace/type bridge, Export integration, six-destination navigation, Script/Highlights buffers and source/client/server/route/action audits. Also inspected the legacy subtitle-render contracts/snapshot to prevent an unsafe M8 handoff through that unrelated pipeline. No render engine, provider, real-media probe/download, worker, production authentication bootstrap or application database was activated.

## Architecture and exact existing inventory

The implemented path is independent saved M6 resolution and M1–M4/R4 replay → validated current M6 head/source/policy → deterministic frozen M7 plan → separately authenticated preparation → saving-backend replay and currentness locks → scoped key/reservation/head CAS/version/audit/deferred commit fence → independent authorized read-back/history → injected metadata review, preview and confirmed historical loading.

M7-01 has five pure runtime modules, M7-02 six server-only repository modules, and M7-03 three new browser/type modules plus the existing shared shell. The remaining paths are 23 test/fixture/SQL/audit files and three implementation reports. Exact reviewed inventory (41 paths; modified overlap between milestones counted once):

```text
components/storyline/recap-studio-shell.tsx
components/storyline/timeline-version-session.ts
components/storyline/timeline-workspace.tsx
docs/STORYLINE_M7_01_TIMELINE_FOUNDATION.md
docs/STORYLINE_M7_02_TIMELINE_PERSISTENCE.md
docs/STORYLINE_M7_03_TIMELINE_STUDIO_UI.md
lib/storyline/studio-timeline-types.ts
lib/storyline/timeline-persistence/auth.ts
lib/storyline/timeline-persistence/contracts.ts
lib/storyline/timeline-persistence/database.ts
lib/storyline/timeline-persistence/index.ts
lib/storyline/timeline-persistence/resolution.ts
lib/storyline/timeline-persistence/service.ts
lib/storyline/timeline/contracts.ts
lib/storyline/timeline/index.ts
lib/storyline/timeline/input.ts
lib/storyline/timeline/planner.ts
lib/storyline/timeline/resolution.ts
tests/storyline/timeline-persistence/boundaries.test.ts
tests/storyline/timeline-persistence/catalog.test.ts
tests/storyline/timeline-persistence/contracts.test.ts
tests/storyline/timeline-persistence/fencing.test.ts
tests/storyline/timeline-persistence/fixture.ts
tests/storyline/timeline-persistence/persistence.test.ts
tests/storyline/timeline-persistence/production-audit.mjs
tests/storyline/timeline-persistence/schema.sql
tests/storyline/timeline-persistence/security.test.ts
tests/storyline/timeline-persistence/tampering.test.ts
tests/storyline/timeline-studio/acceptance.test.ts
tests/storyline/timeline-studio/adapter.fixture.ts
tests/storyline/timeline-studio/browser-server.fixture.ts
tests/storyline/timeline-studio/browser.fixture.tsx
tests/storyline/timeline-studio/browser.test.mjs
tests/storyline/timeline-studio/component.test.tsx
tests/storyline/timeline-studio/presentation.fixture.ts
tests/storyline/timeline-studio/production-audit.mjs
tests/storyline/timeline/boundaries.test.ts
tests/storyline/timeline/fixture.ts
tests/storyline/timeline/foundation.test.ts
tests/storyline/timeline/postgres.test.ts
tests/storyline/timeline/production-audit.mjs
```

Only `docs/STORYLINE_M7_FINAL_ACCEPTANCE.md` is owned by this acceptance milestone. Existing runtime/tests/schema/dependencies/UI/prior reports and logs are preserved. The exact-source audit confirmed all 41 hashes and all existing tracked files unchanged; no acceptance-owned code correction was required. Exact-path staged content, whitespace and secret-pattern review passed; final staging is checked again immediately before commit.

## Implemented interfaces and functional acceptance

The server-only pure index exports `parseRecapTimelineInput`, `generateRecapTimelinePlan` and `validateRecapTimelinePlan`, plus contracts. The resolver is explicitly injected and supplies independently captured saved M6 record/head/parent/dependency/current observations. It is a test-owner seam, not authentication. The planner does no filesystem, network, provider, database or subprocess I/O. It validates selected M6 identity/domains, parent linkage, source/dependency/policy and complete M6 evidence/narration replay, then freezes deterministic output. No random ID or new clock value enters a pure plan.

M7-02 exports `createSyntheticTimelineAuthenticationForTest`, `createTimelineGatewayForTest`, `createDisposableTimelineRepositoryForTest`, strict DTO parsers and a separately named archival validator. Actual operations are `prepareTimeline(request,input)`, `saveVersion(writeRequest,readRequest,proposal)`, `readVersion(request,{scope,id})`, `readHead(request,{scope})`, `listHistory(request,{scope,afterVersion,limit})` and `readOperation(request,{scope,idempotencyKey,proposalHash})`. All runtime wire arguments are strictly parsed unknown values; the factories require M702_DISPOSABLE_ONLY and explicit owned connections/keys/authentication. Nothing composes them in production.

| Acceptance area | Audited behavior and executable coverage |
| --- | --- |
| Exact selected set and identity | One segment for every SELECTED M6 candidate, maximum 64; missing/excluded/duplicate/unknown candidates fail replay. `tlseg-<hash>` binds scope, full saved M6 reference, full source/candidate, index/times and restrictions. Outer `tl-<hash>` binds the complete plan. |
| Time and order | Safe integer milliseconds, half-open intervals, authoritative positive source duration, original speed 1:1, disjoint source intervals, contiguous prefix-sum output and CUT_ONLY. Source Chronology and Recap Presentation Order remain distinct; output follows saved M6 presentation. Intentional omissions add no filler or output time. |
| Character/evidence ancestry | Exact Chinese scene/transcript/observation/quote references, M3 finding/claim, character/relationship, observed/inferred distinction, confidence/uncertainty/qualification, observed basis and contradictory references remain bound to M6/M4/R4. Missing UI references remain unavailable. Hash consistency proves no semantic truth or human approval. |
| Revalidation and tampering | Generation/replay reacquires observations; coordinated plan/segment/record/proposal/audit hashes cannot authorize changed evidence, placement, parents, source, selected identity, domains or approval. M7-02 independently replays both selected M6 and its immediate M6 parent against their own captures; reads independently load and replay the immediate M7 parent as well. This is bounded immediate-parent validation, not an unbounded ancestor walk. |
| Save and read-back | Exact plan/head/complete parent and one stable scoped key/proposal hash are captured. Original M4 rows and M6 counters remain unchanged. Separate authorized readVersion and corresponding history entry must match before Saved and Verified. Pure inner NOT_PERSISTED plan bytes remain unchanged inside a separate DISPOSABLE_POSTGRES_ONLY saved envelope. |
| Conflict/rollback/unknown | Same key plus exact bytes safely reuses the immutable record; changed bytes/key binding conflicts. Independent writers permit one CAS winner. Transaction/audit failures roll back together. Conflict refresh retains the original proposal and requires explicit head acceptance and fresh preparation; a successful refresh after transient read failure restores the acceptance control. Lost ACK/read-back/transport failures retain original key/hash and use readOperation only. NOT_FOUND never proves rollback or permits a fresh write; FOUND still requires independent read/history verification. |
| History and currentness | Scoped contiguous pages of at most five versions, exact record/plan/source/M6/parent hashes, editor/time and independent preview. Historical loading confirms unsaved replacement, changes only local review and disables direct re-save. CURRENT_AT_READ, SUPERSEDED and STALE_DEPENDENCIES are separate observations; historical integrity never supplies present admission. |
| Audio/rendering restrictions | Every plan/segment/record stays SYNTHETIC_ONLY, NOT_RENDERED, original movie audio EXCLUDED, voice synchronization UNSUPPORTED, human approval NONE, sourceVerified false, real TTS/publication false and spending NONE. Optional fake audio stays REFERENCE_ONLY / speech NOT_VERIFIED and adds no placement or duration. No playable media, audio track, render output or receipt is created. |

## Persistence and security trust boundaries

1. **Native server identity, not browser claims.** Opaque WeakMap-owned test authentication independently verifies native Request, exact GET-read/POST-create method and `${origin}/isolated-fixture` URL without alternate path/query, pinned Origin, same-origin Fetch Metadata, exactly one recognized session cookie, create CSRF, current session expiry/revocation and exact tenant/project/movie/studio read/create grants. Separate save read/create requests must identify the same session/principal/tenant. SQL independently checks M7 and M6 principal/session/grant agreement. IdentityKey, mode, hash equality and browser roles are never authority.
2. **Owned restricted PostgreSQL only.** Configuration permits only marked fresh Unix-socket/database/action-login patterns with explicit credentials; no TCP/connection-string/ambient environment fallback. Same-backend catalog checks verify non-elevated logins, non-login owners, fixed search paths, no PUBLIC helper execution, no direct private table/column/DDL/TEMP/server-file/program privileges, exact action wrapper, eight M7 immutable row/truncate triggers, deferred completion and fourteen unchanged M6 immutable triggers. M7's private owner has narrowly scoped M6 reads and UPDATE privileges needed for shared row locks; action logins cannot assume that owner or obtain those powers. A compromised administrator/private server/key owner remains outside the synthetic guarantee.
3. **Actual saving-transaction fences.** One-use HMAC action proofs bind body hash, scope, actor/session, nonce, action/login, backend PID, transaction ID and DB-clock deadline. A separate validation MAC binds record/dependency/reservation challenge to that saving backend/transaction. Lock order is M7 key/scope/session/grant → M6 scope/session/grant/policy/current_dependency/head → M7 policy/head. Real independent M6/source/policy/session/grant writers block through commit; M7 head CAS and complete parent comparison prevent silent overwrites. Deferred completion rechecks session expiry/currentness at COMMIT. This is a demonstrated same-database fence, not distributed atomicity or a future execution lease.
4. **Immutable history and current admission remain separate.** Composite scoped FKs, unique keys/versions and UPDATE/DELETE/TRUNCATE guards protect dependency/reservation/version/audit lineage. Archived source/head/policy coordinates are reconstructed only from immutable stored projections and fully replayed for historical integrity/reuse. New preparation/save independently reacquires locked current data; it cannot use archival coordinates as a fallback. A source writer serialized after commit may immediately make a valid committed version stale.
5. **Ambiguity retains operation ownership.** UNKNOWN/lost ACK and failed read-back are not rollback. Lookup/reuse still require current authorization; neither creates a new version. Read operations retain inherited private one-use proof bookkeeping, so “read-only” means no M6/M7 version/reservation/audit/head mutation, not zero proof-table writes. Disposal ignores late UI adoption and downstream reads, but cannot cancel an already dispatched transaction in its original scope.
6. **Client boundary and disabled production composition.** The bridge emits types only. The browser coordinator contains canonical JSON/WebCrypto consistency checks and injected function calls; it imports no DB/auth/gateway/private resolver or network client. Production app callers omit all test adapters and keep Timeline unavailable under Export. Test transport/session/fault/admin controls exist only under tests on an owned localhost server. Actual incoming cookie/Origin/Fetch Metadata/CSRF and URL are forwarded to M7-02; read RPC maps to native GET, save to separate POST/GET checks. Test boot contains public metadata and a public anti-CSRF token, never the HttpOnly session token, keys, connections or private registry. The local HTTP browser cookie omits Secure only for that fixture; the direct fixture policy remains HttpOnly/Secure/SameSiteStrict. All four fresh built source/client/server/route/action audits and the browser bundle graph passed. Allowed public metadata domains do not imply library/repository/auth activation.

## Studio and accessibility acceptance

Six destinations remain Saved Recap, Script, AI Review, Voice, Highlights and Export. Timeline is an explicitly injected synthetic metadata workspace nested under Export; production retains “No recap video output.” Existing legacy Recap/source/subtitle-export behavior remains intact. Timeline does not replace Script or Highlights and adds no seventh destination or global style/navigation change.

The strip follows canonical output order with widths `segment.durationMs / totalOutputMs * 100`, exact integer start/end/duration labels and a separate keyboard-inspection/text alternative. Selected text/aria-pressed/color feedback, native disclosures, source/provenance review, Chinese/Myanmar language labels, confidence/uncertainty/contradictions and distinct order lists remain readable. Preview controls cannot play fake media. History/currentness/saved identity and approval/rendering states stay separate.

The full Timeline target plus session identityKey owns its controller: scope, exact saved M6 ID/version/hashes/domains, source/media/dependency/narration/candidate and policy. Ordinary retained-shell tab changes preserve preparation, selection/disclosures and pending ownership. Full identity change disposes Timeline and fences late responses. Script/Highlights buffers remain independent. Unsaved work registers beforeunload feedback; confirmed replacement supports cancellation/focus restoration. This memory-only state is lost on page remount/identity changes; it is not autosave, crash recovery or universal internal-route blocking.

Fresh Chromium checks passed at 1440/1024/390 px, including keyboard selection/save/tab controls, pagination, confirmed historical loading, reset/isolation and independent Script/Highlights buffer preservation. Inspected all three fresh `visual-*.png` strips and `viewport-*.png`, plus the full 390 px capture at original resolution: proportional strips and controls wrap without horizontal overflow, exact duration/order labels remain visible, OBSERVED/INFERRED and Chinese evidence are retained, and the synthetic/not-rendered/unapproved labels remain explicit. The prepared-plan screenshots honestly show “History not loaded”; separate executed browser assertions verify saved/history pagination, preview and confirmation rather than claiming those screenshots depict a saved state. Keyboard/layout coverage does not establish comprehensive assistive-technology certification.

Fresh M7 browser evidence is `/tmp/storyline-m703-browser-EeTYMg/` (`results.json`, nine PNGs and diagnostics). The audit recorded 58 operations: prepareTimeline 19, saveVersion 11, readVersion 10, listHistory 9, prepareHighlight 3, readHead 3, readOperation 3. Seven versions/reservations/audits/head revisions match; the original remains immutable. Expected rejection/recovery codes include REVISION_CONFLICT 1, TRANSPORT_UNKNOWN 2, FORBIDDEN 1, STALE_SOURCE 1, ORIGIN_REJECTED 1 and CSRF_REJECTED 1. Browser errors, rejected external requests, production API calls, provider calls and media processing are all zero. Conflicts need explicit refreshed-head acceptance; UNKNOWN recovery did not dispatch another save.

## Fresh verification and count accounting

Fresh logs: `/tmp/movie-translator-m7-final-yvUmVF/`; all older logs are preserved. Every test/compiler/build command explicitly uses the unreachable application datasource `postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`. Database fixtures own new private Unix-socket PostgreSQL clusters; no application datasource/schema/migration is used. Timing-sensitive server tests run serially without competing compiler/build/browser workloads. Read-only audit/documentation does not start a second test workload.

| Fresh verification | Actual result | Receipt |
| --- | --- | --- |
| Focused M7-01/02/03 | **260/260 PASS**, zero failed/cancelled/skipped/todo; 164.87 s | `focused-m7.log` |
| Consolidated applicable M1–M7 server and legacy pure Recap/export contracts | **1,624/1,624 PASS**, zero failed/cancelled/skipped/todo; 701.38 s; includes all 16 unchanged expiry controls | `server-regressions.log` |
| Eight relevant component files | **51/51 PASS**, zero failed/cancelled/skipped/todo; 1.76 s | `components.log` |
| All six Chromium suites | **6/6 PASS**, zero failed/cancelled/skipped/todo; 94.69 s; each covers 1440/1024/390 | `chromium.log` |
| Lint and standalone TypeScript | PASS, both exit 0; no diagnostics | `lint.log`, `tsc.log` |
| Dummy-datasource Webpack build | PASS, exit 0; compiled successfully, TypeScript, all 12 static pages and trace collection completed | `webpack.log` |
| M6 Studio and M7-01/02/03 production audits | **4/4 PASS**, exit 0; 71 client JS chunks, 144 server JS files and 108 production sources in M7 scans; 38 API routes, zero Server Actions; zero forbidden runtime/authority/transport markers or owned secret matches; type bridges erased | `m6-production.json`, `m701-production.json`, `m702-production.json`, `m703-production.json` |
| Exact-source/whitespace/secrets | PASS: all 41 existing M7 paths match entry SHA-256, existing tracked tree unchanged; expiry hash unchanged; zero whitespace/secret-pattern matches in the new document | `baseline-audit.json`, `source-audit.json`, `staged-audit.json` |

**Count accounting: 1,941 successful test executions = 260 focused + 1,624 consolidated + 51 components + 6 browser. The 260 focused cases are repeated inside the consolidated run, so there are 1,681 distinct test cases, not 1,941 distinct cases.** Production-audit scripts, viewport checks and individual browser assertions are additional checks, not added to Node test counts. No failed development run or omitted retry is hidden in these totals; all fresh test runs completed successfully on the first run.

The other fresh browser artifact roots are `/tmp/recap-recovery-browser-Okrqig/`, `/tmp/storyline-m9-save-browser-MPst0P/`, `/tmp/storyline-m603-browser-zR4RUE/`, `/tmp/recap-studio-navigation-iJMQRI/` and `/tmp/storyline-m9-recovery-browser-G1I7GP/`. Recap recovery, all six destinations, local Myanmar editing with zero local network calls, real disposable version saving and Highlights remain passing. `acceptance-results.json` collects fresh counts, audit receipts and M7 browser evidence in the milestone log directory.

Exact verification commands from the project root (dummy datasource exported for every command):

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/timeline/*.test.ts tests/storyline/timeline-persistence/*.test.ts \
  tests/storyline/timeline-studio/acceptance.test.ts
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/durable-fake/*.test.ts \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/highlights-studio/acceptance.test.ts tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts \
  tests/storyline/timeline/*.test.ts tests/storyline/timeline-persistence/*.test.ts \
  tests/storyline/timeline-studio/acceptance.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec \
  tests/storyline/timeline-studio/component.test.tsx tests/storyline/highlights-studio/component.test.tsx \
  tests/storyline/editor-saving/component.test.tsx tests/storyline/ui/script-preview.test.tsx \
  tests/storyline/ui/navigation.test.tsx tests/recap/recovery-ui.test.tsx \
  tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
pnpm exec next build --webpack
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs tests/storyline/editor-saving/browser.test.mjs \
  tests/storyline/highlights-studio/browser.test.mjs tests/storyline/timeline-studio/browser.test.mjs
node tests/storyline/highlights-studio/production-audit.mjs /tmp/movie-translator-m7-final-yvUmVF/m6-production.json
node tests/storyline/timeline/production-audit.mjs /tmp/movie-translator-m7-final-yvUmVF/m701-production.json
node tests/storyline/timeline-persistence/production-audit.mjs /tmp/movie-translator-m7-final-yvUmVF/m702-production.json
node tests/storyline/timeline-studio/production-audit.mjs /tmp/movie-translator-m7-final-yvUmVF/m703-production.json
git diff --check
git diff --cached --check
```

## Original M4 timing history

The prior positive-control failure was `M4 expiry M1 last: actual wire before expiry 2 retains original definitive result after expiry`, expected one fake-wire entry, observed zero. Root cause remains unresolved. All sixteen original tests and the 700 ms confirmation deadline are preserved; source SHA-256 remains `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. All 16 controls passed in the completed 1,624-test consolidated run; no recurrence was observed and no timing/assertion/code change was made. The 16 cases comprise six forced pre-send confirmation-expiry negatives, six actual-wire-before-expiry positives and four confirmation/lease/one-use-permit deadline controls across M1-first/M1-last. A recurrence requires retaining scheduling, checkpoint acknowledgement, confirmation/lease and permit-deadline state/timestamps and investigating their ordering, not assertion weakening, deadline extension, speculative resend or dismissal as harmless flakiness. Even a fresh pass is not a repair or production timing certification.

## Proposed M8-01 — pure render-contract and validation foundation

**Everything in this section is a proposed handoff, not an implemented export, execution permit or authorization to start M8 now.** Recommend a separately requested M8-01 containing pure TypeScript parsers, independent synthetic resolution, immutable render-recipe planning and strict replay only. No media engine, probing, file access, FFmpeg, provider, worker, output file, route, storage implementation or database schema belongs in M8-01.

### Eligibility and independent source resolution

Planning input must select an exact saved M7 `TimelineRecordIdentity`: scoped ID/version/recordHash with `story-recap-timeline-saved-record-v1`, and planHash with `story-recap-timeline-plan-v1`. Reject a bare unsaved `tl-` plan, M6 reference in M7 slots, missing version, wrong hash/domain, cross-tenant scope, SUPERSEDED/STALE_DEPENDENCIES or unknown resolution. Do not substitute a newer head silently.

M7 pure `plan.headRevision` is the resolved M6 revision; M7 saved-record version/expectedRevision and the M7 readHead revision are separate coordinates. Never use the M6 plan field as the M7 repository revision.

An internal `SyntheticRenderPlanningResolver` should independently provide the selected saved Timeline view, current M7 head/revision/identity, immediate parent and immutable dependency capture, selected M6 view/head/parent and current source/policy/media observations. These are internal fixture/server observations, never authoritative fields accepted from the request. Reuse M7 full integrity replay against independently resolved captures and independently check current M7/M6 heads, policies, source/media/narration/candidate/dependency. M7-02's named archival validator can establish historical integrity only; it cannot establish current processing eligibility. Browser hash checks, adapter mode/identityKey and a supplied CURRENT label never authenticate. No M7 session/HMAC/save fence may be cast into a render or spending permit.

Compare source fingerprint `{sha256,bytes,durationMs}` byte-for-byte with the M7/M6/M1 reference, retaining exact scope/source revisions and original M4 or R4 narration hash domain, candidate/result/evidence ancestry and dependency hashes. Require positive bounded integer size/duration. **A fingerprint is not evidence of an accessible authorized file, decoded duration, usable codec or stream topology.** M8-01's independently supplied stream observations must say SYNTHETIC_METADATA_ONLY / NOT_PROBED / possession NOT_ESTABLISHED. They model parser/planner cases, not successful media inspection or real rendering eligibility. Missing, unavailable, unknown or inconsistent source metadata fails closed; there is no guessed codec/duration, filename inference or download fallback.

Currentness in pure resolution is a point-in-time observation. A future execution admission must independently reauthorize source possession and lock/revalidate current M7/M6/source dependencies under its own reviewed transaction/lease protocol. M7's completed save locks do not protect a later render. Drift after execution admission must leave any result historical/quarantined until a separate currentness/adoption decision; it cannot authorize publication automatically.

### Proposed versioned contracts and stable hashes

Use the existing Storyline strict canonical JSON and `contractHash(domain,value)` (SHA-256 of domain + newline + canonical JSON). Preserve exact Unicode and safe-integer-only serialization; reject getters, cycles, sparse arrays, unsupported prototypes, unknown fields, lone surrogates, negative zero, fractions and unsafe numbers. Do not reuse the legacy subtitle renderer's more permissive serializer or unversioned recipe hash.

| Proposed domain/type | Exact purpose and required contents |
| --- | --- |
| `story-recap-render-planning-input-v1` / RenderPlanningInput | `{schemaVersion,execution:SYNTHETIC_ONLY,scope,timeline:TimelineRecordIdentity,policy,profileReference}`. Identity-only request: no caller-authored plan/capture, paths/URLs, commands, audio, roles, approval, executable flag or source-currentness claims. |
| `story-recap-render-policy-v1` / RenderPlanningPolicy | Fixed integer-ms/half-open/original-speed/CUT_ONLY/contiguous/no-filler policy; output order exactly M7 presentation; audio EXCLUDE_ALL; unsupported timing/source rejection with no rounding/stretching. Exact closed policy equality. |
| `story-recap-render-profile-v1` / SyntheticRenderProfile | Immutable allowlisted metadata profile identity/hash, container/video codec/pixel format/dimensions/rational frame rate/timebase/stream counts and SYNTHETIC_UNVERIFIED capability provenance. No actual encoder availability claim. |
| `story-recap-render-source-observation-v1` / SyntheticSourceObservation | Exact source fingerprint, bounded declared container and video/other stream metadata, rational timing/frame count, fixture evidence and NOT_PROBED/possession NOT_ESTABLISHED labels. Private execution locator/credentials are absent. |
| `story-recap-render-dependency-snapshot-v1` / RenderDependencySnapshot | Exact scoped immutable M7/M6/parent/source/narration/candidate dependencies and separately observed head/policy/media/profile coordinates needed for full replay. Deep-frozen independent metadata capture; not a grant or processing lease. |
| `story-recap-render-recipe-v1` / RenderRecipe | Input hash, complete selected M7 reference and plan hash, dependency snapshot hash, source observation/profile/policy hashes, exact ordered segment projection and source/output time/frame mapping, total output ms/frame count, audio exclusions and permanent restrictions. Derived `rr-<recipeHash>` identity. |
| `story-recap-render-request-proposal-v1` / RenderRequestProposal | Metadata-only `{schemaVersion,execution:DISABLED_HANDOFF_ONLY,scope,recipeReference,dependencyReference,idempotencyKey}`. Parser returns `executable:false` regardless of claimed approvals/capabilities; no submitter, reservation, permit or engine exists. |

Stable recipe identity includes exact logical source/head/dependency/profile/segment content. Re-observing identical content yields identical bytes/hash; changed scope, selected version, evidence, source, policy/profile or ordering changes identity or rejects admission. Exclude new observation timestamps, request idempotency key, random submission/generation IDs, credentials, expiring grants/quotes and spending confirmations from the recipe. Preserve timestamps already inseparable from immutable selected record hashes; do not rewrite M7 identities. A separately versioned future admission receipt may carry volatile authorization coordinates without replacing content identity.

The snapshot and recipe must bind actual M7 segment IDs and full provenance or immutable references whose complete bodies are independently replayed: candidate/finding/claim, Chinese evidence anchors/scene/transcript, characters/relationships, observed/inferred/uncertainty, original source/media and narration domains. Hashing caller-supplied references alone is insufficient. Keep source chronology as review metadata, output order as M7 presentation, and intentional source omissions as zero-output metadata. Do not rescore, reorder, clip/merge/split candidates, add filler/transitions or reinterpret psychological claims.

Initial proposed bounds: input 2 MiB, recipe/request 3 MiB, independently captured resolution 32 MiB, all existing stricter M1–M7 bounds, at most 64 selected segments and 16 declared source streams. For the proposed v1 synthetic profile additionally cap source size at 16 GiB and source/output duration at 86,400,000 ms, and bound positive rational components at 1,000,000,000. These are proposed rejection limits, not disk reservations, real-media support or changes to M7. Reject over-limit canonical composition; never truncate metadata or round numbers to make it fit.

Proposed safe RenderPlanningError codes: INVALID_INPUT, RESOLUTION_UNAVAILABLE, FORBIDDEN, UNSAVED_TIMELINE, STALE_DEPENDENCIES, INTEGRITY_FAILED, UNSUPPORTED_SOURCE_METADATA, UNSUPPORTED_CODEC_CONTAINER, UNSUPPORTED_TIMEBASE, FRAME_BOUNDARY_UNREPRESENTABLE, SOURCE_OUT_OF_BOUNDS, RESOURCE_LIMIT and EXECUTION_DISABLED. Preserve distinct unsupported versus stale versus unavailable failures, reject unknown statuses, and never expose raw database errors, private locators or future decoder stderr. Authorization must precede existence disclosure in any later server adapter. No error retry may switch source/profile or fabricate a successful partial recipe.

### Timebase, codec/container and audio policy

Start with one intentionally narrow synthetic profile, for example `SYNTHETIC_MP4_H264_640X360_25_V1`: MP4/H264_AVC/YUV420P, 640×360, 25/1 frames per second, 1/1000-second ticks, exactly one output video stream, zero audio/subtitle/data/attachment streams, no rotation, exact source-dimension match, no scaling/cropping and no variable frame rate. Require a compatible independently declared synthetic source/profile pair, zero-origin monotone presentation timestamps, matching positive duration/frame count and explicit stream topology. Unknown container/codec/format, encrypted or unsupported source, extra video streams, VFR, discontinuous/negative timing, unhandled rotation/color conversion and missing capability evidence reject planning. These are fixture policy choices, not a recommendation or verification that any installed decoder/encoder supports them.

The profile must also pin engineAvailability NOT_ESTABLISHED and encodingPolicy DISABLED. M8-01 selects no actual encoder or encoder settings. A future execution profile must version/hash the reviewed engine/software/capability and every encoding/container option; metadata recipe determinism is not a promise of bit-identical encoded video.

For each unchanged M7 segment, require `sourceStartMs < sourceEndMs <= sourceDurationMs`, `durationMs = end - start`, original speed 1:1 and contiguous output prefix sums. With rational fps `N/D`, require `(timeMs × N) / (1000 × D)` to be integral for every source/output boundary, and require exact integral source/output ticks under the declared rational timebase. Require positive coprime rational components and unique bounded stream indices; reject zero/negative or noncanonical rational forms. Use checked integer/BigInt intermediates, serialize only safe bounded integers and reject non-divisible/overflow cases. The example 25 fps policy maps exactly 40 ms per frame; a valid M7 endpoint at 1 ms remains valid M7 metadata but is unsupported by this proposed M8 profile. Never silently round, pad, resample, stretch or alter the M7 plan to accommodate an engine.

Each recipe segment should bind timelineSegmentId, M6 candidate ID, presentation/source chronology indices, exact source/output `[startMs,endMs)`, start/end frame indices and frame count, duration, CUT_ONLY and provenance references. Require frame-count sums and output end to match both M7 totalOutputMs and the profile's exact rational duration. Source chronology must not replace recap presentation order. Codec name equality alone does not prove that arbitrary cuts can be stream-copied or concatenated safely; a later engine must review decode/re-encode/keyframe/PTS behavior independently.

Audio policy is **EXCLUDE_ALL**: original movie audio EXCLUDED, synthesized speech NONE, expected audio track count zero, voice synchronization UNSUPPORTED. Preserve any M6/M7 fake audio only in immutable ancestry; never open/use its bytes, treat silence as narration, derive clip duration from it or synthesize a replacement. No speech, TTS capability, voice alignment or audible output is established. Human approval NONE, sourceVerified false, real TTS/publication eligibility false, spending NONE, rendering NOT_RENDERED and syntheticAncestry true remain permanent restrictions.

Legacy `lib/video-render/contracts.ts` describes full-movie subtitle BURN_IN/SOFT_SUBTITLE exports, including AAC/copy-audio policies, and `snapshot.ts` includes storage keys and a different hash protocol. Those profiles/requests/runners are not M7 audio-excluded recap contracts. Do not cast an M8 proposal into their RenderRequest, reuse their audio-preserving profile or connect their API/dispatch/worker during M8-01. Existing subtitle exports remain unchanged.

### Proposed pure implementation plan and acceptance matrix

For a separately authorized M8-01, create a sibling pure module such as `lib/storyline/render-planning/{contracts,input,resolution,planner,index}.ts` and synthetic tests under `tests/storyline/render-planning/`. Proposed exports: strict input/profile/source/request parsers, `generateRenderRecipe(input,resolver)` and `validateRenderRecipe(value,expectedInput,resolver)`. Names and schemas above are design proposals, not existing exports. The resolver is explicitly injected with no default, no authentication shortcut and no environment/SDK/DB/media/FFmpeg implementation in the pure runtime graph. Test-only composition may independently resolve actual saved M7 fixtures under unchanged M7 authorization, using fresh owned PostgreSQL only if that later task explicitly authorizes it.

Implement in this order: strict versioned contracts and bounds → independent M7/M6/source/profile resolution and replay → exact rational frame/tick projection → deterministic frozen recipe/request metadata with executable false → full regeneration/replay comparison and adversarial import/I/O tests. No new Studio controls or production adapters are necessary for this foundation.

Required future tests:

- Exact current saved M7/M6 scope/version/hash/domain/head/parent, deterministic duplicate planning, immutable originals and stable content recipe across different request keys.
- Missing/unsaved/superseded/stale/unknown M7, stale M6/source/media/narration/candidate/dependency/policy/profile and unauthorized/cross-tenant/session resolution. Supplied roles/CURRENT/approval/executable flags never authorize.
- Coordinated segment/recipe/dependency/reference rehash attacks, changed evidence or audio policy, wrong source bytes/hash/duration, altered output order, duplicate/missing/excluded candidate, parent/self-link and hash-domain substitution.
- Half-open touching intervals, nonchronological presentation, exact prefix sums, unequal durations, media-end boundary, frame/tick non-divisibility, negative zero/fraction/unsafe arithmetic, rational overflow and mismatched duration/frame counts. Unsupported M7-to-frame conversion rejects without rewriting M7.
- Unknown/unsupported codecs/containers/timebases/stream layouts, missing or synthetic-to-real capability promotion, fake-audio-to-narration promotion, original audio inclusion and output-track claims. No serializer accepts paths, arbitrary command strings/filter graphs, URLs, credentials or provider options.
- Resolver UNKNOWN/exception makes one bounded resolution attempt, produces no executable result, allocates no execution/paid permit and causes no automatic retry. Metadata-only same-key/changed-recipe classification is not a durable idempotency reservation; a future owner service must separately enforce it.
- Strict replay after newly stale dependencies; canonical Unicode/bounds/getter/cycle/prototype/extra-field attacks; transitive runtime import and global network/filesystem/process/provider fail assertions. Production imports/routes/actions/bundles remain free of this future planner and all test transports.

### Separate future media-execution milestone — not authorized here or by M8-01

Any actual probing or rendering needs separate authorization/design and its own disposable media-execution milestone. Review at least:

1. Actual authenticated source-media ownership/possession and current scope/dependencies, opaque server-owned source handles, byte fingerprint/probe reconciliation and fresh execution admission. A hash or synthetic metadata manifest cannot satisfy this gate.
2. Real verified decoder/encoder/container/timebase capability for the exact installed engine/version/profile; untrusted/malformed/encrypted/VFR/rotation/PTS inputs; bounded decode/keyframe pre-roll and exact output frame/duration reconciliation. Probing itself executes parsers on hostile media and requires isolation.
3. FFmpeg invocation only through a reviewed fixed argument builder and direct subprocess API, never shell concatenation or caller filter graphs. Minimal explicit subprocess environment, no provider credentials, no remote protocols/URLs or automatic downloads, private safe paths, no symlink/traversal access and scoped process-group cancellation. No GPU dependency or package installation is implied.
4. Bounded CPU, memory, disk, decoded pixels/frames, process concurrency, wall time, staging retention and kill/cleanup behavior; exclusive private staging, scoped immutable object/version ownership, private artifacts and exact ownership-checked garbage collection. No public output URL or shared mutable output path.
5. A durable original operation/key/recipe binding, atomic reservation and acknowledged admission/checkpoint before execution; single-owner generation fencing and no automatic rerun/new key on crash, lost ACK, timeout or UNKNOWN. NOT_FOUND is not rollback. Recovery inspects the original operation and owned staging/artifact; late results cannot overwrite another generation. Define exact crash cuts and no-overwrite publication of private artifacts separately.
6. Independent validation of actual output bytes/container/video stream/frame count/PTS/duration and **zero audio and unwanted tracks**, actual output-byte SHA-256 and versioned canonical artifact/probe metadata hashes and provenance bound to M7/M6/source/recipe/profile/software identity. An engine exit code, claimed duration or metadata-only recipe is not a verified video. Silent/fake audio never proves Myanmar speech.
7. Separate canReadSource/canRender/private-storage authorization, operational resource admission and any necessary canSpend/quote/human cost-consent/budget/one-use permit services. Existing M7 canCreate is only a metadata-save grant. No saved/synthetic plan, profile or proposal grants provider spending or TTS authority. No provider is needed or activated by the proposed foundation.
8. Final dependency/adoption validation and independent human approval over the exact non-synthetic source/narration/timeline/output before publication. Subtitle approval, a saved edit, SOURCE_VERIFIED alone or a successful synthetic render test cannot provide this approval. No issuer exists here; all current artifacts remain synthetic/nonpublishable.

Future private output references should be scoped opaque IDs plus immutable storage version, actual byte SHA-256/byte count, recipe/dependency/profile/source/M7/M6 hashes and exact independently measured container/frame/duration/track metadata under a new artifact domain. Never expose a raw filesystem path or reuse a text/plan/fake-WAV hash as an output-media hash. Storage/engine/authorization schemas and recovery protocols need their own review; this handoff implements none of them.

## Completion, production blockers and Git disposition

**M7-01/02/03 is complete within the synthetic-only scope: final acceptance PASS. M8-01 is ready to begin only after separate authorization, with pure contracts/resolution/recipe validation and fake fixtures as proposed above.** No M8 implementation is performed. Production remains blocked on real session/resource membership, reviewed tenant/source authorization and least-privilege schema/key deployment, durable operation recovery/retention, operational lock/deadline behavior, actual source acquisition/codec capability, human approval and separately reviewed execution/storage/spending/publication. Currentness observations and memory-only UI recovery do not waive those gates.

Exact-path staging and review passed: only the new `docs/STORYLINE_M7_FINAL_ACCEPTANCE.md`, no existing tracked-file changes or other untracked files, staged bytes identical to the reviewed document, `git diff --check` and `git diff --cached --check` clean, zero credential-pattern matches. All 41 baseline M7 hashes and the original expiry hash remain unchanged. Final checks repeat after this disposition is recorded, then the requested local commit uses message `docs(storyline): complete M7 timeline final acceptance`. The full resulting hash and final tree state will be reported in the final response. No push, destructive Git, unrelated UI change, approval issuance, provider/TTS, media execution or worker activation.
