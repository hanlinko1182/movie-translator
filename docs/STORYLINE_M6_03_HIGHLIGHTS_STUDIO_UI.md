# M6-03 — Highlights Studio UI, Evidence Review and Immutable Plan Versioning

Date: 2026-10-19 (Asia/Bangkok). Entry branch `recovery/m9-studio`, clean at `e7c6f07432fb18556e1ed76f0b2d95d8726b5308`.

## Scope and verdict

**M6-03 PASS — synthetic/disposable only.** All required checks completed successfully. This accepts the explicitly injected Highlights UI integration, not production deployment, approval, media processing or speech.

The milestone integrates the recovered six-destination Studio shell with the actual M6-01/M6-02 planner/repository through an explicitly injected synthetic adapter. Production still receives no adapter and retains its unavailable Highlights panel. No production authentication, route, Server Action, database deployment, worker, media extraction, audio generation, provider or renderer is activated.

Read AGENTS.md, CLAUDE.md, the frozen UI baseline, M9 final acceptance, M6-01 foundation, M6-02 persistence, M5 final acceptance and the installed Next.js data-security guide. Inspected actual shell, navigation, local Script editor, Script version session/panel/harness, planner/contracts, M6-02 service/auth/gateway/contracts and fixtures. Historical counts are context only; the results below come from this milestone's commands. Existing M1–M6 foundations, schemas, authorization boundaries and all original expiry assertions remain unchanged.

## Exact owned file inventory

Modified:

- `components/storyline/recap-studio-shell.tsx`: optional synthetic Highlights seam, identity-bound controller lifecycle and combined unload feedback. Script buffers retain their independent identity; six destinations and frozen layout remain.

New:

- `components/storyline/highlight-version-session.ts`: memory coordinator, exact DTO/hash checks, proposal capture, independent read-back/history, explicit conflict reconciliation, original-operation recovery and disposal fencing.
- `components/storyline/highlights-workspace.tsx`: accessible evidence/score/order review, preparation/save feedback, paged history, preview and confirmed historical loading.
- `lib/storyline/studio-highlight-types.ts`: exclusively erased type exports bridging exact M6-02 DTO/service contracts; no executable loader or authority.
- `tests/storyline/highlights-studio/adapter.fixture.ts`: direct server-side adapter composition with a fresh fixture's native requests.
- `tests/storyline/highlights-studio/presentation.fixture.ts`: safe source/editor projection and pure presentation fixture compilation.
- `tests/storyline/highlights-studio/acceptance.test.ts`: disposable repository integration and adversarial coordinator tests.
- `tests/storyline/highlights-studio/component.test.tsx`: default/injected rendering, evidence/score/missing-reference labels and workspace keys.
- `tests/storyline/highlights-studio/browser-server.fixture.ts`: dedicated localhost server, newly owned PostgreSQL and server-owned native-request authentication; never an application route.
- `tests/storyline/highlights-studio/browser.fixture.tsx`: explicit synthetic test transport and shell composition; no default client.
- `tests/storyline/highlights-studio/browser.test.mjs`: Chromium integration, keyboard/confirmation/identity behavior, request audit and responsive artifacts.
- `tests/storyline/highlights-studio/production-audit.mjs`: fresh emitted-client, production source/import, route, action and secret-pattern audit.
- `docs/STORYLINE_M6_03_HIGHLIGHTS_STUDIO_UI.md`: this implementation/verification record.

## UI and evidence presentation

Prepare Highlight Plan explicitly asks the repository to load the independent stored context and run the unchanged planner. The UI shows SYNTHETIC_ONLY, plan status, exact M4/R4 narration identity/domain/ancestry, source/media and M3 candidate hashes, revision observations, policy/rubric, budgets, candidate/selected/excluded counts and selected source duration. Parent/source/analysis bindings can be expanded without overwhelming the mobile workspace.

Each keyboard-operable candidate disclosure retains character/relationship ownership, source intervals, scene/transcript and M3 finding/claim references, Chinese source evidence, Myanmar statements, OBSERVED/INFERRED, confidence, uncertainty, qualification and observed basis. Supporting evidence and contradictory interpretation references have separate labeled regions. Missing references remain explicitly unavailable; no replacement evidence is invented. Fixed factors, rubric weights, total, explanations and exact selection/exclusion reason codes are visible. The UI does not relabel psychological interpretation as fact.

Source chronology and recap presentation order have separate lists, exact start/end/duration and an explicit difference label. Intentional between-clip omissions, CUT_ONLY, coverage/missing coverage and total selected source duration remain metadata. The existing original-source preview remains read-only. No playable clips, screenshots, audio or rendered recap are fabricated. Fake audio says speech NOT_VERIFIED and REFERENCE_ONLY; silent fixture duration is never spoken Myanmar narration or clip timing.

## Adapter and authentication trust boundary

`SyntheticHighlightAdapter` maps the actual M6-02 preparePlan/saveVersion/readVersion/readHead/listHistory/readOperation signatures. The browser receives source/plan/record/history DTOs only. The type-only bridge emits no executable JavaScript and preserves the existing M6-02 production-import guards unchanged. The coordinator contains no database, Node hashing, HMAC key, restricted gateway, source resolver, environment lookup, fixture controller, authentication registry or network client.

Injection mode and identityKey confer no authentication. In the direct and browser fixtures every operation passes through the unchanged M6-02 service, opaque server-owned authentication authority and restricted PostgreSQL gateway. Native method/URL/Origin/Fetch Metadata, HttpOnly session cookie, write CSRF, exact tenant/project/movie/studio grants, session expiry/revocation and PostgreSQL authorization/proofs are checked independently. Save uses separate create/read native requests for the same verified actor. Browser JSON cannot supply roles, resolver expectations or proof keys.

Only `tests/` owns the localhost RPC/session/fault controls, bootstraps a fresh disposable database, and constructs authentication/gateways. The browser's public anti-CSRF value is not a session credential or authentication authority; the session cookie is HttpOnly and never serialized in boot DTOs. The test bundle graph excludes all repository/auth/database/planner/resolver/bootstrap modules, and the production audit excludes transport/fixture/credential markers entirely. Production app callers pass none of the test injection props; there is no route, Server Action, environment switch or default adapter.

## Immutable save, conflicts and recovery

Preparation captures exact plan, scope, expected revision and complete previous identity. An explicit Save New Highlight Version creates one stable key and domain-separated canonical proposal hash. Captured DTOs are frozen; the adapter receives a clone. The unchanged service reacquires/replays M1/M3/M4/R4 dependencies and uses its transactional currentness fence, immutable reservation/version/audit and head CAS. The original pure plan and M4 draft are never mutated.

The UI recomputes input/plan/proposal/record hashes using browser Web Crypto, checks exact scope, lineage/parent, expected revision, restrictions and canonical proposal content, then independently calls readVersion and listHistory. Immutable identity/hash/time/editor/ancestry/content must match across save, independent read and the history entry before Saved and Verified appears. Currentness is a separate observation at each read and can change without changing historical integrity. These client checks detect transport inconsistency; authentication and full semantic replay remain server responsibilities.

Revision conflicts retain the reviewed plan and original proposal. Refresh head and history does not rebase it. Accept refreshed head is disabled until an authorized refresh, explicitly drops the rejected proposal and requires separate preparation. If the head changes again before preparation, another conflict requires acceptance again. A known stale-save rejection retains the view and requires fresh authorized preparation; a changed source identity requires a new matching target. No overwrite or automatic rebase occurs.

UNKNOWN, transport loss and failed read-back retain original key/hash/proposal. Recover Original Operation performs only readOperation, then independent readVersion/history verification if FOUND. NOT_FOUND is an observation, never proof of rollback; preparation/new saves remain blocked. The UI never automatically retries a write or allocates a replacement key. A stale error during read-back cannot be treated as a rejected save and cannot release a possibly committed proposal. No provider retry path exists.

History uses the actual M6-02 maximum of five ascending entries per page, with nextAfterVersion and refresh-to-first-page. Every entry presents version/record/plan hashes, time/editor/session metadata, original narration domain, previous identity, currentness, selected count and duration. Read-only preview does not replace the reviewed plan. Explicit historical loading confirms replacement of active unsaved work; cancellation retains it. Loading is memory-only and never changes the repository head; a historical plan cannot be directly saved. Fresh preparation is required.

## Identity, memory and accessibility

The complete target (tenant/project/movie/studio, original/artifact/source/media/M3 references/revisions, policy/audio) plus adapter/session identityKey defines the Highlights workspace. Callers must change identityKey whenever their session realm changes; it is a disposal key, not a credential. The shell separately owns the controller so normal tab switching and Saved Recap navigation within the retained shell preserve prepared/saved/history state and bounded candidate disclosure state. The controller captures its target independently of later caller mutation. Identity changes dispose the old controller, clear isolated Highlights state and invalidate late responses before they can update a new workspace or initiate follow-up reads.

Highlights-only identity changes preserve the independent Script editor's unsaved text. Project/movie/source/editor-artifact changes retain the established M9 isolation behavior. Unload feedback covers unsaved Script text and active prepared/pending Highlights work. All unpersisted state remains memory-only; there is no localStorage, sessionStorage, autosave or universal route-blocking guarantee. Leaving/remounting the page or changing identity clears it deliberately, not durably.

Existing zinc/violet cards, spacing, responsive split/stack layout and six destinations are preserved. Buttons/labels, native disclosures, live status, pending disabled controls and unsaved replacement dialogs are keyboard accessible. Confirmation focuses Keep unsaved plan; cancellation restores the initiating control, while acceptance announces pending results. This is executable keyboard/responsive coverage, not comprehensive assistive-technology certification.

## Verification

Owned logs: `/tmp/movie-translator-m6-03-6Txw2W/`. Development logs/artifacts under `/tmp/m603-*` and `/tmp/storyline-m603-browser-*` are preserved. No package installed. All database work uses freshly owned disposable UNIX-socket clusters; application datasource is explicitly unreachable. Timed server suites run serially without concurrent browser/build/compiler work.

| Final check | Actual completed result |
| --- | --- |
| Focused M6-03 acceptance | **23/23 PASS**, 0 failed/skipped, 39.82 seconds (`focused-final.log`). |
| Consolidated serial M1–M6, M5 lifecycle, R4/M9 and applicable legacy server regressions | **1,364/1,364 PASS**, 0 failed/skipped, 894.73 seconds (`server-regressions.log`). Includes M6-01 70, M6-02 89 and the new M6-03 23. |
| Relevant Studio and legacy components | **47/47 PASS**, 0 failed/skipped (`ui-components.log`). |
| All Studio/legacy Chromium suites | **5/5 PASS**, 0 failed/skipped, 80.14 seconds (`chromium.log`). Each applicable suite checks 1440/1024/390 px. |
| `pnpm lint` | **PASS**, exit 0, no warnings (`lint-final.log`). An earlier prefer-const error in the new test-server fixture was corrected. |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0 (`tsc-final.log`); fresh build type-check also passed. |
| Dummy-datasource Webpack build | **PASS**, Next.js 16.3.6; compiled, type-checked and generated all 12 static pages (`webpack.log`). |
| Fresh production source/client/route/action and secret-pattern audit | **PASS**: 71 client chunks, 38 unchanged API routes, zero voice/audio/highlight API routes, zero Server Actions, zero inspected server-authority/test-transport or secret-pattern matches (`security-audit.json`). |
| Owned-path, whitespace and staged-content review | **PASS**; exactly 13 owned paths, including one modified shell and 12 new files. |

These final commands completed **1,439 passing executions representing 1,416 distinct cases**: 1,364 server + 47 component + 5 Chromium; the separately reported focused 23 repeats cases already in the consolidated run. No historical counts, development runs or viewport subchecks are added as distinct tests. The final focused/component/Chromium runs also verify the last UI disclosure/target-capture refinements; foundational server contracts did not change.

All **16/16 unchanged M4 expiry controls passed**: six forced pre-send expiry repetitions retained zero sends/sticky UNKNOWN, six positive actual-wire repetitions retained the original definitive result across expiry, and four additional expired confirmation/lease/one-use permit controls passed across M1-first/M1-last. The historical positive-wire miss did not recur; its root cause is still unknown and is not claimed repaired.

The new Chromium artifacts are `/tmp/storyline-m603-browser-1irDEe/` (results JSON, full-page and viewport screenshots, server diagnostics). Visual inspection of current 390 px and 1440 px screenshots confirms readable evidence, wrapped controls/content and the existing dark shell; automated no-overflow checks also pass at 1024 px. Its audit records seven immutable versions, matching reservation/audit/head counts, original immutability, zero browser errors/external rejections, zero production API/provider calls and no media processing. It exercises disclosure retention across normal tabs, Script-buffer preservation across Highlights source changes, keyboard save/confirmation, history preview/load cancellation, conflict/head acceptance, lost-ack recovery, failed read-back, NOT_FOUND with no new write, session/movie/source isolation and default unavailable state.

Direct acceptance additionally covers same-key reuse, genuinely concurrent writers, missing/expired/revoked/read-only sessions, Origin/CSRF failures, every scope dimension, exact canonical identity/parent/content, tampered read-back/history, bounded pagination, R4 domain separation, frozen originals/proposals, disposed late responses, stale post-save errors and fake-audio noneligibility. Existing M6-01 tests cover competing interpretations and ordering; a separately labeled presentation-only browser fixture displays their contradictory references, nonchronological order and fake-audio warning without treating it as the saved workspace.

Development logs are retained, including one initial assertion that incorrectly compared JSON property order rather than canonical content. It was corrected to compare the complete canonical plan, retaining identity/hash/content assertions. No server, authorization, currentness, expiry or immutability assertion was relaxed.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
node --conditions=react-server --import tsx --test --test-concurrency=1 \
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
  tests/storyline/highlights-studio/component.test.tsx \
  tests/storyline/editor-saving/component.test.tsx \
  tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx \
  tests/video-render/export-ui.test.tsx

PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave \
node --test --test-concurrency=1 tests/recap/recovery-browser.test.mjs \
  tests/storyline/ui/navigation-browser.test.mjs tests/storyline/ui/script-preview-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs tests/storyline/highlights-studio/browser.test.mjs

pnpm lint
pnpm exec tsc --noEmit
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  pnpm exec next build --webpack
node tests/storyline/highlights-studio/production-audit.mjs /tmp/movie-translator-m6-03-6Txw2W/security-audit.json
git diff --check
git diff --cached --check
```

## Remaining risks, production blockers and handoff

This remains synthetic/disposable only. No production source reads/writes, authentication bootstrap, schema migration, real media acquisition/currentness, key operations, retention policy, provider spending, TTS, human approval, SOURCE_VERIFIED issuance, clip extraction, voice synchronization or video rendering is implemented or authorized here. Saved versions are immutable synthetic metadata, not approved narration, psychological truth, speech or media outputs. The fixture administrator controls the independent source corpus. M6-01's deterministic greedy-selection limitations remain unchanged.

The historical M4 positive-wire expiry timing miss has no established root cause. Preserve all 16 original controls, investigate recurrence, and do not treat a passing rerun as a repair.

**M6 final acceptance is ready as a separate synthetic-only acceptance milestone.** M6-01 planning, M6-02 immutable repository and M6-03 Studio integration have completed current verification together. Production readiness remains blocked by the separately authorized capabilities above. This milestone stops at M6-03; M7, production activation and media processing require separate authorization.
