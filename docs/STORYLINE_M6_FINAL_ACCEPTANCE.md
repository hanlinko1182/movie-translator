# M6 Final Acceptance — Highlights and M7-01 Timeline Handoff

Date: 2026-10-19 (Asia/Bangkok). Scope: fresh acceptance of M6-01, M6-02 and M6-03 together; documentation and handoff only.

## Verdict and baseline

**M6 Final Acceptance PASS — synthetic/disposable only.** Fresh M6-01/02/03, consolidated server, component, Chromium, lint, TypeScript, build and security checks all passed. M6 is complete for its authorized synthetic scope. Production activation remains blocked; M7-01 is specified below and is not implemented.

The expected branch `recovery/m9-studio` and exact baseline `f868b8696f00a15e53e78eab57ff68eae8aa7245` were verified, with no staged, unstaged or untracked work at entry. The audited chain is `d39a9bb` (M6-01), `e7c6f07` (M6-02), `f868b86` (M6-03), following `d56a893` (M5 acceptance). Committed files agree with the milestone inventories. Historical PASS statements are requirements/context, not evidence of this run.

Read AGENTS.md, CLAUDE.md, the frozen UI baseline, all three M6 implementation reports, M5 and M9 final acceptance. Inspected actual planner/input/resolution/candidate contracts, repository/authentication/gateway, scratch SQL and fixture, UI controller/workspace/shell/type bridge, direct and browser adapters, focused/component/browser tests and production audit. This acceptance introduces no M7 implementation, runtime feature, authentication, route, schema, provider or media processing.

## Architecture and reviewed inventory

The runtime path is: independent synthetic capture → M1/M2/M3/M4/R4 revalidation → source evidence intersections → deterministic coverage/scoring selection → immutable M6-01 plan → independently authenticated M6-02 preparation/save/replay → fenced SQL reservation/version/audit/head → separate authorized read-back/history → explicitly injected M6-03 UI. There is no production composition of this path.

Reviewed M6-01 files:

- `lib/storyline/highlights/contracts.ts`: versioned inputs, references, candidates, policy, rubric, decisions, plan and permanent restrictions.
- `lib/storyline/highlights/input.ts`: bounded strict input/source/policy/audio parsing.
- `lib/storyline/highlights/resolution.ts`: independent source/narration/analysis resolution and exact domain/currentness checks.
- `lib/storyline/highlights/candidates.ts`: connected scene/transcript intersections, evidence/claim lineage and explainable integer scoring.
- `lib/storyline/highlights/planner.ts`: coverage-before-score greedy selection, budgets/overlap, separate orders/gaps, canonical hash and complete replay.
- `lib/storyline/highlights/index.ts`: server-only public exports.
- `tests/storyline/highlights/fixture.ts`, `foundation.test.ts`: independent synthetic inputs and functional/adversarial/I/O-boundary cases.
- `docs/STORYLINE_M6_01_HIGHLIGHTS_FOUNDATION.md`.

Reviewed M6-02 files:

- `lib/storyline/highlights-persistence/contracts.ts`: strict proposal/record/scope/parent, dependency/fence/audit and recovery contracts.
- `lib/storyline/highlights-persistence/auth.ts`: opaque server-owned synthetic identity, native request, origin/CSRF, scope, expiry/revocation.
- `lib/storyline/highlights-persistence/database.ts`: restricted owned-database connections, same-backend catalog checks, transaction-bound proofs and unknown-commit handling.
- `lib/storyline/highlights-persistence/service.ts`: authoritative capture/replay, preparation/save/read/head/history/original-operation lookup.
- `lib/storyline/highlights-persistence/index.ts`: server-only exports.
- `tests/storyline/highlights-persistence/schema.sql`: private scratch schema, restricted gateways, immutable rows, composite FKs, head CAS, audit and deferred completion/fence checks.
- `tests/storyline/highlights-persistence/fixture.ts`, `contracts.test.ts`, `persistence.test.ts`, `security.test.ts`.
- `docs/STORYLINE_M6_02_HIGHLIGHTS_PERSISTENCE.md`.

Reviewed M6-03 files:

- `components/storyline/recap-studio-shell.tsx`: existing six-destination shell, optional matching test seam, separate Highlights/Script lifecycle and unload feedback.
- `components/storyline/highlight-version-session.ts`: stable proposal/key, DTO consistency checks, independent read/history, conflicts/recovery, frozen snapshots and disposed-response fencing.
- `components/storyline/highlights-workspace.tsx`: evidence, scoring, source/presentation orders, history preview/confirmed load and visible capability limits.
- `lib/storyline/studio-highlight-types.ts`: erased type exports only; no runtime loader or authority.
- `tests/storyline/highlights-studio/adapter.fixture.ts`, `presentation.fixture.ts`, `acceptance.test.ts`, `component.test.tsx`, `browser-server.fixture.ts`, `browser.fixture.tsx`, `browser.test.mjs`, `production-audit.mjs`.
- `docs/STORYLINE_M6_03_HIGHLIGHTS_STUDIO_UI.md`.

These are 33 existing M6 paths. The **only new/changed path owned by final acceptance** is `docs/STORYLINE_M6_FINAL_ACCEPTANCE.md`; no implementation fix or new test was required. Existing source, schemas, dependencies, environment, prior reports and logs are preserved.

## Functional acceptance map

| Requirement | Audited implementation and executable evidence |
| --- | --- |
| Independent source and narration | The M6-01 resolver reruns M4 validation over captured M1 source/admission, M2 definitive result and M3 evidence/basis/ownership. Exact stored-original identity and optional R4 sections/hash/domain must match. M6-02 reacquires separate stored source/analysis/narration projections; the request plan is never its source of truth. |
| Evidence and candidates | Candidate intervals are connected unions of scene/transcript intersections, never unsupported gaps or narration-derived timestamps. Chinese source text, anchors, scene/segment IDs, M3 findings/claims, characters/relationships, OBSERVED/INFERRED, uncertainty, qualifications, observed basis and contradictions remain bound. Missing references fail validation or display explicitly unavailable in review. |
| Scoring and selection | Fixed integer factors and weights, code-unit tie breaks, coverage-before-score greedy selection, per-clip/count/total budgets, duplicate/overlap rejection, exact decisions/reasons. Both PLANNED and honest INSUFFICIENT_INFORMATION results exist; no optimality or psychological truth is claimed. |
| Orders and duration | Canonical source chronology is separate from SOURCE_CHRONOLOGY/SCORE_ORDER presentation. Selected duration sums disjoint original source intervals. Intentional between-clip omissions and CUT_ONLY are metadata; no extracted clips or finished recap exist. |
| Immutable saving | Authorized preparation captures the exact plan/head/parent. Save replays twice against independent data, including on the saving backend; SQL binds actor, dependency, expected head and complete parent identity. Version/head/audit update atomically. Original M4 drafts and pure plans remain unchanged. |
| Verified read/history | The service independently authorizes/replays reads. The UI additionally checks exact scope, plan/proposal/record hashes, content/lineage/time/editor, independent read-back and scoped history before Saved and Verified. History pages contain at most five entries. Historical integrity and dependency currentness are separate. |
| Conflict and UNKNOWN | Same key/canonical proposal reuses its original identity; changed proposal conflicts. Other writers produce revision conflicts, requiring refresh, explicit head acceptance and fresh preparation. Stale saves retain the view. UNKNOWN/lost acknowledgement retains the original key/hash/proposal; operation lookup cannot write. NOT_FOUND does not prove rollback or allocate a new key. |
| Preview/load and memory | Preview leaves the reviewed plan intact; historical load confirms replacement of active unsaved work, with cancellation/retention. Loading never advances the head and cannot directly save history. Normal retained-shell tab changes preserve state; full target/session identity changes dispose/reset Highlights and ignore late responses. Highlights-only changes preserve the independent Script buffer. |
| Capability boundaries | Saved is separate from Human Approved: No. Source verification, real TTS, publication and voice synchronization remain false/unsupported. Fake audio is REFERENCE_ONLY with speech NOT_VERIFIED, never spoken Myanmar duration or synchronization authority. |

## Security and trust-boundary findings

1. **Server authentication is authoritative.** Adapter mode, identityKey, client hash equality and browser-supplied roles do not authenticate. Every repository operation uses the opaque server-owned session registry and restricted gateway. Native method/URL, pinned Origin, same-origin Fetch Metadata, exactly one recognized cookie, write CSRF, expiry/revocation and exact tenant/project/movie/studio grants are checked. Saving requires independently verified create/read requests from the same actor/session/tenant.
2. **Database authority is separate.** SQL independently checks session/principal/grant/scope rows. Generated action logins can execute only their exact read/create wrapper; they cannot directly read/write private tables or columns, call private helpers, create schemas/temp tables, run server programs or inherit owner/elevated privileges. Same-backend catalog assertions check owner/search-path/grants/triggers before use and commit.
3. **Proof and currentness fencing are concrete.** Action/login-specific HMAC binds body, nonce, actor/scope, method/origin/CSRF, backend PID, transaction ID and database-clock deadline. A separate validation MAC binds reservation/challenge/record/dependency to the actual saving backend/transaction. Shared scope/session/grant/policy/current-dependency locks survive through commit; head locking/CAS and the deferred reservation-completion constraint protect atomic version/audit completion and expiry/currentness. Tests use independent backends to verify writer blocking and drift rejection.
4. **Immutable provenance survives history.** Composite scoped FKs, unique keys/versions, immutable source/analysis/narration/dependency/reservation/version/audit rows, canonical hashes and full replay reject coordinated rehash/tampering. M4 `story-narration-draft-v1` and R4 `story-edited-narration-v1` never substitute for one another. Historical integrity is checked against immutable captured dependencies; CURRENT_AT_READ describes dependency observations, not latest-head status or a future processing lease.
5. **Ambiguous outcomes retain ownership.** Unknown commit acknowledgement or independent read-back failure cannot establish rollback. UI lookup preserves the original key/hash and never automatically retries a write. A stale read-back error cannot release a potentially committed proposal. An already dispatched save can finish in its original authorized scope after UI disposal; disposal prevents late UI adoption, not transaction completion.
6. **Browser separation is explicit.** The bridge contains types only. Client runtime contains no PostgreSQL, private resolver, signing key or authentication authority. Only tests own localhost RPC/control/session bootstrap. Public anti-CSRF data is not authentication; the test session cookie remains HttpOnly. Production callers omit all test adapters; no environment switch activates them. Browser bundle-graph assertions and the fresh production import/chunk/route/action audit independently check these claims.
7. **This is a bounded synthetic trust model.** The fixture administrator and trusted server/key owner control the corpus and authorization bootstrap. Catalog checks and hashes cannot defend against a fully compromised administrator/server, establish real media existence, or prove Chinese/Myanmar semantics. M9's inherited source-table/RLS limitations remain a production concern, not a new M6 production security certification. No human approval issuer or spending authority is added. Legacy foundation regressions may seed ephemeral synthetic verification facts; these are fixture setup, not human approval or M6-issued SOURCE_VERIFIED receipts.

## UI and responsive acceptance

The six destinations remain Saved Recap, Script, AI Review, Voice, Highlights and Export. The approved dark shell, navigation, responsive split/stack layout and legacy Recap behavior are preserved. Without an explicit authorized test adapter, Highlights remains unavailable; rendering/navigation cannot prepare or save a plan.

Review exposes Chinese source references and cautious Myanmar statements, character/relationship ownership, observed/inferred distinctions, confidence/uncertainty/basis/contradictions, fixed factors/explanations and exact selection/exclusion reasons. Missing references are not replaced with invented evidence. A separately labeled presentation-only fixture exercises competing interpretation, nonchronological order and fake-audio warning; it is not misrepresented as a saved workspace artifact.

Native disclosures/buttons, manual keyboard tab activation, keyboard Save, visible pending/status/error feedback and unsaved confirmation focus are covered. Script text and Highlights proposal state remain memory-only until their explicit respective saves. Identity changes or page remount can discard unsaved memory; this is not autosave or universal route blocking. Screenshot and actual request-audit findings from this acceptance are recorded with the results below; no comprehensive assistive-technology certification is implied.

## Fresh verification and overlap accounting

All commands run from `/home/hanlinko/Desktop/movie-translator`. Fresh owned logs: `/tmp/movie-translator-m6-final-5HEW3X/`. Existing milestone logs are untouched. All database fixtures create new marked private UNIX-socket PostgreSQL clusters, with no TCP listener or application database connection. The application DATABASE_URL is explicitly unreachable. Server tests run serially, without competing compiler/build/browser/database workloads; read-only source review and documentation do not start extra test workloads.

| Fresh verification | Actual completed result |
| --- | --- |
| M6-01/02/03 focused command | **182/182 PASS**, 0 failed/skipped, 61.64 seconds (`m6-focused.log`). Actual completed-name counts: M6-01 **70**, M6-02 **89**, M6-03 **23** (`source-audit.json`). |
| Full consolidated serial applicable M1–M6, M5 lifecycle, R4/M9 and legacy server suite | **1,364/1,364 PASS**, 0 failed/skipped, 572.69 seconds (`server-regressions.log`). Includes every focused M6 case and all unchanged expiry controls. |
| Relevant Studio and legacy component suites | **47/47 PASS**, 0 failed/skipped, 1.68 seconds (`ui-components.log`). |
| All five Chromium suites | **5/5 PASS**, 0 failed/skipped, 50.85 seconds (`chromium.log`). Covered 1440/1024/390 px, keyboard/focus, save/read/history, conflicts/recovery, isolation and legacy Recap. |
| `pnpm lint` | **PASS**, exit 0, no warnings (`lint.log`). |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0 (`tsc.log`); the separate build type-check also passed. |
| Dummy-datasource Webpack build | **PASS**, Next.js 16.3.6, compiled in 9.7 seconds, type-checked and generated all 12 static pages (`webpack.log`). |
| Fresh production source/client/route/action and secret-pattern audit | **PASS**, 71 client chunks, 38 unchanged API routes, zero voice/audio/highlight routes, zero Node/Edge Server Actions, zero inspected authority/test-transport/secret markers, exclusively erased type bridge (`security-audit.json`). |
| Baseline and exact-file audit | **PASS**, all 33 committed M6 files match baseline bytes; only this acceptance document is new. Original expiry-control file is byte-identical (`source-audit.json`). |
| Working/staged whitespace, exact owned path and secret-pattern review | **PASS**, repeated before the exact-path local commit; no unrelated files, credentials or runtime changes are staged. |

The actual final commands completed **1,598 passing test executions representing 1,416 distinct cases**: 1,364 server + 47 component + 5 Chromium. The separate 182-test focused run repeats cases fully contained in the consolidated command; it adds executions, not distinct cases. Each consolidated test file is listed once. Viewport iterations, fixture subprocesses and prior milestone/development runs are not counted as additional cases. No test failed or needed a retry during this acceptance.

Fresh browser request/results audit: `/tmp/movie-translator-m6-final-5HEW3X/browser-audit-summary.json`; original Highlights artifacts `/tmp/storyline-m603-browser-0jPiE5/` contain results, full-page/viewport PNGs and server diagnostics. The request audit observed 16 preparation RPCs, 10 save RPC attempts, 10 independently authorized UI version-read RPCs, one head refresh, seven history RPCs and three original-operation lookups. These counts exclude internal service read-back transactions and competing-writer setup. There are **seven versions, seven reservations, seven immutable audits and head revision seven**; conflict/recovery checks created no duplicate versions, and lost-acknowledgement recovery retained its original committed version. Audited errors include FORBIDDEN, REVISION_CONFLICT, STALE_SOURCE and the intentionally injected TRANSPORT_UNKNOWN; browser errors and external rejections are empty. Production API/provider/media-processing requests are zero. Local disclosure review and tab switches make zero requests; save/recovery requests go only to the isolated test server.

Reviewed the fresh Highlights viewport screenshots at **all three widths**: Chinese evidence, labels, source intervals and dense provenance wrap within the existing dark panel; no horizontal overflow was observed or measured. Long IDs remain deliberately dense. The executed browser flow also proves keyboard activation, confirmation focus/cancellation, retained disclosures, Script-buffer retention, verified saves and historical loading. The separate legacy/local-editor suites report exact Myanmar text round trips, zero local network calls and preserved Recap/navigation behavior. No screenshot is described as an extracted clip or rendered recap.

Actual commands:

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/highlights-studio/acceptance.test.ts

DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/durable-fake/*.test.ts \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/highlights-studio/acceptance.test.ts \
  tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts

DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
node --import tsx --test --test-reporter=spec \
  tests/storyline/highlights-studio/component.test.tsx tests/storyline/editor-saving/component.test.tsx \
  tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx

DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
pnpm lint
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
pnpm exec tsc --noEmit
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
pnpm exec next build --webpack

DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave \
node --test --test-concurrency=1 tests/recap/recovery-browser.test.mjs \
  tests/storyline/ui/navigation-browser.test.mjs tests/storyline/ui/script-preview-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs tests/storyline/highlights-studio/browser.test.mjs

node tests/storyline/highlights-studio/production-audit.mjs /tmp/movie-translator-m6-final-5HEW3X/security-audit.json
git diff --check
git diff --cached --check
```

The final exact-path/staged/secret review additionally verifies the acceptance document is the only changed path. This is a concrete source/build/pattern audit, not a general penetration test or proof of production tenant isolation.

## Historical M4 expiry safety

Keep all original 16 controls: six forced pre-send confirmation-expiry negative repetitions, six actual-wire-before-expiry positive repetitions and four expired confirmation/lease/one-use permit checks across M1-first/M1-last. No deadline, assertion, timer or safety gate is changed here.

The earlier M1-last positive repeat 2 expected one actual fake-wire entry and observed zero. Its root cause remains unresolved; scheduling, checkpoint acknowledgement, confirmation/lease expiry and the one-use permit deadline must remain distinguishable. A fresh passing run cannot establish that the historical defect was repaired. Any recurrence requires retaining diagnostics and investigating those states/timestamps, not extending deadlines or dismissing it as harmless flakiness.

Fresh result: **16/16 PASS** inside the complete serial server run; no recurrence, assertion weakening or targeted rerun occurred. All six forced-expiry negative cases and six actual-wire positive cases passed, as did the four confirmation/lease/permit controls. `tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts` remains byte-identical to baseline (SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`, recorded in `source-audit.json`). This is evidence of current control results, not a historical root-cause repair.

## Known limitations and production blockers

- Scoring is a transparent category/evidence heuristic, not a calibrated measure of character development, psychological truth, human approval or optimal selection. Greedy coverage-first selection can miss a feasible better combination under overlap/budget constraints and reports insufficiency rather than claiming optimality.
- Evidence anchors establish structural scene/transcript membership, not actual shot content or cinematic suitability. Media SHA/bytes/duration and currentness are independent fixture observations; no real movie was downloaded, probed or visually verified. Source interval length is not a spoken narration length.
- R4 prose edits are not semantically reanalyzed by M6. Evidence/claims remain tied to original M1/M3/M4 lineage. Saved edits, fake audio and synthetic ancestry cannot be promoted to human-approved or real processing inputs.
- Fake M5 references establish no speech quality, synchronized timing, durable ownership or even artifact existence merely by their shape/hash. Sample-derived fake audio duration, where independently verified by M5, remains synthetic silence rather than measured Myanmar narration.
- UI memory is intentionally ephemeral; identity/session changes and remounts can discard unsaved work. identityKey must change when the injected session realm changes. Historical preview/load never alters the repository head; source currentness and head identity require new independent observations before later work.
- Production authentication/resource membership, reviewed least-privilege/RLS deployment and key custody, approved durable schemas/transport, real media acquisition/currentness, retention and operational clock/lock/deadline behavior remain separate gates. Real narration requires explicit authorized human approval of exact current text/evidence/lineage; source verification alone is insufficient. Provider capability, request/spending/UNKNOWN ownership, actual speech verification and rendering/publication each need separate review.

No application database, live migration, production session/bootstrap, paid provider/TTS, human approval/SOURCE_VERIFIED issuance, FFmpeg/extraction, voice synchronization, original movie audio output, MP4 renderer, production worker, new endpoint or Server Action is activated. Legacy working real-data functionality is preserved.

## Proposed M7-01 handoff — not implemented

M7-01 is recommended as a separately authorized **pure TypeScript, versioned, SYNTHETIC_ONLY timeline metadata foundation**. No M7 source, test, schema, persistence, route or UI is created by this acceptance. The contracts/domains/functions below are proposals, not existing exports. Persistence and Studio integration must follow separately after foundation acceptance.

### Input, authority and immutable identity

Propose `story-recap-timeline-input-v1`, `story-recap-timeline-policy-v1`, `story-recap-timeline-segment-v1` and `story-recap-timeline-plan-v1`; use existing canonical JSON/domain-separated SHA-256 rules without changing M6/M5 hash domains.

The caller input contains only exact `HighlightStoreScope`, selected M6 identity `{id, version, recordHash, planHash}` with explicit record/plan hash domains, and the fixed M7 policy version. It does not supply replacement clips, scores, currentness flags, evidence, narration, timestamps, audio duration, roles or approval. Unsaved M6-01 plans and UNKNOWN save receipts are not saved M6 record identities.

A separately injected **fixture-owned** resolver must independently acquire the authorized M6 record view, head identity/revision, dependency ID/hash and full bound synthetic source/analysis/narration capture. Reuse the existing M6-02 validated read/head operations in test composition and acquire capture independently from the owned fixture; do not widen production DTOs or add a database reader inside the pure planner. This seam is not authentication. Reject unsupported/unauthorized/missing/ambiguous resolution; never fall back to request-supplied expectations.

Validate the exact scoped M6 record/proposal/previous identity and record/plan hashes, then rerun M6-01 replay against independently reconstructed expected input/capture. Bind M1 snapshot/content/context/dependency/binding hashes, media SHA-256/bytes/duration, M3 candidate/result lineage, original M4 and selected M4/R4 narration identity/hash domain, source/narration revisions, selection policy/rubric and complete selected evidence provenance.

For a deliberately simple first milestone, require `PLANNED`, nonempty complete coverage, current dependency observations, enabled M6 policy and selected identity equal to the independently observed head. A historical record can be structurally intact and still fail this **proposed stricter M7 admission policy**. Reject stale dependencies and superseded heads explicitly; never relabel historical integrity CURRENT or silently adopt a newer version. This does not change M6's existing historical read behavior.

Bind the observed head/dependency/revision identities and the M6 record's stable source observation to the input hash. Recheck them on every generation/validation call. Do not add wall-clock timestamps, random IDs or expiring session tokens to deterministic timeline identity. Pure resolution is a point-in-time validation, not a transaction fence or processing lease; future persisted/executable work would require separate server authorization/currentness fencing again.

### Proposed payload and exact time policy

| Proposed field/group | Required semantics |
| --- | --- |
| Schema/execution | Versioned timeline schema, SYNTHETIC_ONLY, metadata-only, NOT_PERSISTED, NOT_RENDERED; no playable asset or storage URL. |
| Scope/M6 binding | Exact tenant/project/movie/studio, immutable selected record ID/version/hash/domain, plan hash/domain, previous identity, dependency ID/hash and accepted head identity/revision. |
| Source/narration | Unchanged complete M6 source/media/narration and M3 lineage references; no new semantic claims or hash-domain casts. |
| Policy | `INTEGER_MILLISECONDS_V1`, original-speed 1:1, exact M6 presentation order, no source overlap/repetition, contiguous output placement and CUT_ONLY. No transition-duration field or frame assumptions. |
| Segments | One per selected M6 candidate: stable derived ID, M6 candidate ID, presentation index, exact source start/end, proposed output start/end, duration, character/relationship/finding/claim/evidence/basis/contradiction provenance. |
| Orders | Retain canonical M6 source order and independent M6 presentation order; map candidate IDs to derived segment IDs without resorting presentation by source time. |
| Omissions | Preserve exact M6 between-clip source omissions. An optional derived complement may label leading/trailing omissions against known media bounds; it must be computed exactly and distinguished from M6's recorded gap list. Neither adds output silence or footage. |
| Totals | Exact selected-source total and proposed output total; measured rendered duration and spoken narration length are unavailable, not inferred. |
| Audio | Original movie audio EXCLUDED; output audio NONE; optional exact existing M6/M5 fake reference remains FAKE_ONLY/REFERENCE_ONLY/speech NOT_VERIFIED and cannot alter placement or duration. |
| Restrictions | Human approval NONE, sourceVerified false, real TTS/publication/spending authority absent, synthetic ancestry permanent, voice synchronization UNSUPPORTED. |
| Identity | Canonical input hash plus immutable payload/hash under new timeline domain; derive `tl-<hash>` from content, not a database receipt. Deep-freeze the result. |

All times are safe integers in **milliseconds** with half-open intervals `[startMs,endMs)`. Reject negative zero, fractions, strings, NaN/infinity, unsafe arithmetic, mixed/unknown units, missing/zero media duration and implicit seconds/sample/frame conversion. Inherit M6's positive media/policy limits and at most 64 selected clips; bound proposed timeline serialization at 2 MiB and private capture at existing bounded fixture limits, rejecting overflow rather than truncating. A future finer tick/sample/frame scheme needs a separately versioned rational timebase and explicit conversion policy, not silent rounding in v1.

For presentation candidate `i`, let `d_i = sourceEndMs_i - sourceStartMs_i`. Require `d_i > 0`, `outputStartMs_0 = 0`, `outputStartMs_i = sum(d_j for j < i)`, and `outputEndMs_i = outputStartMs_i + d_i`. Check each addition for safe bounded integer arithmetic. Require `totalOutputMs = totalSelectedSourceMs = M6.totalSourceMs`, within the M6 budget and media duration. CUT_ONLY adds no time and creates no overlap, transition padding, black frames or filler. Output gaps are not permitted by this first policy.

Example: selected source intervals `[8000,10000)` then `[0,2000)` in a validated M6 SCORE_ORDER plan become proposed output `[0,2000)` then `[2000,4000)`. Source chronology remains `[0,2000)`, `[8000,10000)`. The source omission `[2000,8000)` contributes no output duration. These coordinates describe metadata only, not extracted clips or measured speech.

Derive each `tlseg-<hash>` using the segment domain over scope, selected M6 record/plan identity, candidate identity, exact source interval, immutable provenance and presentation index. Replays of identical inputs produce identical IDs, placements and timeline hash. Changing tenant, selected record/version, source, evidence or order must change identity or fail validation. IDs cannot authorize access.

### Generation, validation and negative-test contract

Proposed `generateRecapTimelinePlan(value, resolver)` strictly parses input/policy, independently resolves/revalidates M6, takes exactly the SELECTED candidates once each, validates source intervals in independently sorted source chronology, then places them in exact M6 presentation order. Source ordering may legitimately differ from output ordering; never test source overlap by assuming presentation is chronological.

Proposed `validateRecapTimelinePlan(value, expectedInput, resolver)` uses independently supplied expected input, reacquires current dependencies, regenerates the **complete** expected timeline and compares canonical payload/hash/IDs, including provenance, source and output intervals, totals, gaps, ordering and restrictions. Hash self-consistency alone is insufficient, even when an attacker rehashes all envelopes. For v1, this validation also rejects stale/superseded M6 inputs; a future archival-integrity reader must be separately designed rather than silently waiving current admission checks.

| Test family | Required acceptance/negative cases |
| --- | --- |
| Source bounds/evidence | Start zero and exact media end pass; negative/reversed/zero/out-of-bounds intervals, one-ms overflow, unsupported scene/transcript membership, missing/cross-owner/cross-movie evidence, changed media fingerprint or duration fail. |
| Selected set/order | Exact complete M6 selected set once each; reject excluded/unknown/missing/duplicate candidates, changed source or presentation permutation, duplicate IDs, fabricated segments and unsupported reorder policy. Nonchronological valid M6 order passes while original times remain unchanged. |
| Overlap/placement | Source overlap is checked after independent source sorting; output overlap, nonzero initial offset, invented output gap, wrong prefix sum, wrong duration/total, filler, speed changes and transition durations fail. Touching half-open boundaries pass. |
| Units/numbers/bounds | Reject seconds disguised by a different unit tag, floating/sample/frame units, fractional/unsafe values, -0, invalid Unicode/unknown fields, malformed hashes, over-limit segment counts/serialized sizes and arithmetic overflow. No coercion/truncation. |
| Identity/currentness | Reject wrong tenant/project/movie/studio, forged M4/R4 domain, wrong parent/dependency/record/plan hash, stale source/media/candidate/narration revision, disabled policy, superseded M6 head, UNKNOWN/nonexistent records and a client CURRENT flag without independent matching resolution. |
| Tampering/replay | Mutate clip order/source/output/provenance/gaps/restrictions/totals, then rehash; full replay must still reject. Repeated identical capture is deterministic and leaves original M4/M6 inputs unchanged. |
| Audio/approval | Null fake reference works; a matching reference remains NOT_VERIFIED with no duration effect. Reject mismatched narration/audio reference, supplied spoken-length claims, fake-silence synchronization, original movie audio inclusion, alleged approval/spending or synthetic-to-real promotion. |
| Side effects/architecture | Network/provider/FFmpeg/storage/queue calls fail the test; no default resolver, DB/client/route/Server Action/environment activation, approval issuer, persistence, playable assets or media subprocess. Existing M1–M6/expiry controls remain intact. |

Implementation order after separate authorization: strict contracts/parser/policy → independent in-memory fixture capture/resolver → source/selection/order validation → deterministic placement/IDs/totals/hash → complete replay validator and adversarial tests → unchanged M1–M6 regressions/import audit. Initially prefer no new database schema or UI. Disposable repository integration tests may reuse owned M6 fixtures solely to prove selected-record/currentness binding, keeping all I/O in tests. Any persistence, Studio controls, real narration eligibility, provider spending, synchronization or renderer requires a separately scoped milestone.

## Completion and Git disposition

**M6-01/02/03 are complete and freshly accepted together for the synthetic/disposable scope.** No failing check or implementation defect requiring a fix was identified. **M7-01 pure, synthetic-only timeline foundation is ready for a separately authorized implementation task**, using the proposed contract/replay/negative-test handoff above. M7 persistence/UI, real media, voice synchronization, rendering and production remain unimplemented and unauthorized here.

Only the acceptance document may be staged, with exact-path whitespace/secret/content checks and the authorized local message `docs(storyline): complete M6 highlights final acceptance`. No push, destructive Git operation, unrelated change, M7 implementation or production activation is authorized by this acceptance.
