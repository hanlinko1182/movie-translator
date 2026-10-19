# M7-03 — Timeline Studio UI and immutable versioning

Date: 2026-10-20, Asia/Bangkok. **M7-03 PASS — SYNTHETIC_ONLY, metadata-only. All required final checks passed.**

Entry branch `recovery/m9-studio`, clean at `b4c0adad91ec02584afa3bbec1939e1ae5bee82a`. Read AGENTS/CLAUDE, the UI freeze, M9 and M6 final acceptance, M6-03, M7-01/02 reports and installed Next.js client/data-security guidance. Inspected actual shell, Script/Highlights coordinators, erased bridges, pure planner, repository, native authentication, SQL gateway/contracts and browser/disposable fixtures. Historical counts do not establish current results.

## Inventory

New:

- `components/storyline/timeline-version-session.ts`: identity-bound memory coordinator and independent browser DTO consistency checks.
- `components/storyline/timeline-workspace.tsx`: accessible metadata timeline, source/output/evidence review, saved identities and history/preview/loading.
- `lib/storyline/studio-timeline-types.ts`: exclusively erased DTO/service type exports.
- `tests/storyline/timeline-studio/adapter.fixture.ts`: actual repository composition with separately authorized native requests.
- `tests/storyline/timeline-studio/presentation.fixture.ts`: pure valid fixtures with selected qualified contradictory inference, nonchronological presentation and unequal segment durations.
- `tests/storyline/timeline-studio/acceptance.test.ts`: coordinator/repository round trips and adverse paths on newly owned disposable PostgreSQL.
- `tests/storyline/timeline-studio/component.test.tsx`: default/injected shell, exact segment metadata/evidence, proportional scale and full identity checks.
- `tests/storyline/timeline-studio/browser-server.fixture.ts`: test-owned localhost server, disposable PostgreSQL, native incoming-header authentication and fault controls.
- `tests/storyline/timeline-studio/browser.fixture.tsx`: explicit test transport, current saved M6 selection and independent companion buffers.
- `tests/storyline/timeline-studio/browser.test.mjs`: Chromium actions, request/build graph audit, viewport/keyboard/history/recovery/isolation checks and screenshots.
- `tests/storyline/timeline-studio/production-audit.mjs`: source/client/server/route/action/erased-bridge/credential checks.
- `docs/STORYLINE_M7_03_TIMELINE_STUDIO_UI.md`: this implementation and acceptance record.

Modified:

- `components/storyline/recap-studio-shell.tsx`: optional isolated Timeline controller under Export, retained state, independent full-identity disposal and combined unload feedback.
- `tests/storyline/timeline-persistence/fixture.ts`: forwards the existing M6 pre-seed callback, allowing a separately validated inferred corpus before immutable rows exist. Default fixtures, SQL and service semantics are unchanged.
- `tests/storyline/timeline/boundaries.test.ts`: replaces the prior milestone's blanket prohibition of any Timeline UI/domain literal with checks allowing only the newly authorized metadata coordinator's protocol literals; still prohibits planner/resolver composition and all production adapter activation.
- `tests/storyline/timeline/production-audit.mjs`: allows public metadata domain strings/derived segment-ID consistency hashing; still rejects runtime planner/resolver imports/exports, activated production injection, routes and actions.
- `tests/storyline/timeline-persistence/production-audit.mjs`: permits public proposal/record hash-domain constants needed for independent DTO checking; private repository/auth/gateway/session/SQL/proof/fence/audit/dependency markers remain forbidden. The new M7-03 audit additionally checks all emitted server and client JS and type-only bridge purity.

No M1–M7 runtime foundation, parser, policy, time contract, service, authorization, SQL schema, M4 expiry control, package, production route or Server Action changes.

## Placement, presentation and identity

The six destinations remain Saved Recap, Script, AI Review, Voice, Highlights and Export. Timeline is a nested synthetic workspace under Export, activated only when a matching explicitly injected adapter exists. Production app callers omit it and retain “No recap video output.” Highlights and Script retain their existing independent workspaces and memory buffers; no seventh destination or shared navigation/theme redesign.

The workspace displays the selected saved M6 identity/version/record and plan hashes, requires explicit authorized preparation, then shows exact source/media/narration/dependency references and M6 head observation, fixed policy, segment count, total planned output milliseconds and timeline hash. SYNTHETIC_ONLY, NOT_RENDERED, Human Approved: No, publication ineligible, original audio EXCLUDED and voice synchronization unsupported remain explicit. Fake audio, when present, stays REFERENCE_ONLY / speech NOT_VERIFIED; it never controls placement.

The read-only strip follows canonical output order. Each width is `durationMs / totalOutputMs * 100`; all arithmetic/labels derive from immutable integer-millisecond metadata. Exact start/end/duration buttons provide a text alternative and keyboard selection with aria-pressed, selected text and visual feedback. Independent native disclosures expose segment/M6 candidate IDs, presentation/source chronology indices, source/output intervals, CUT_ONLY, character/relationship, Chinese scene/transcript references, OBSERVED/INFERRED, qualification/uncertainty, basis and contradictions. Missing evidence remains unavailable. Full basis/contradictory finding bodies that are not in selected segments remain references to the bound saved M6 artifact, never invented statements.

Source Chronology and Recap Presentation Order are separate lists with an explicit difference explanation. Intentional omissions add zero output and remain metadata. No video/audio player, frame, waveform, rendered preview, dragging, reordering, clip extraction or playback is added.

Complete Timeline identity includes session adapter identityKey plus the full target: tenant/project/movie/studio, exact saved M6 ID/version/hash/domains, policy, source/media/currentness/narration/candidate bindings and dependency ID/hash. Same-identity destination switches retain controller state, selection, disclosures and proposals. Any complete identity change disposes Timeline and ignores late responses. Changes to only Timeline identity preserve Script and Highlights buffers; a movie/artifact change also follows their existing isolation rules. An already dispatched transaction can finish in its original scope after disposal; disposal prevents adoption, not transaction cancellation.

Prepared or unresolved work contributes to shell beforeunload feedback. Memory is lost on identity changes/page remount; this is not autosave, persistent drafts or a universal Next.js navigation blocker. Reprepare and explicit historical loading confirm before replacing unsaved work. Cancellation retains the plan. Confirmation focuses Keep, restores focus, and uses a nonmodal alertdialog with native keyboard buttons. Historical preview cannot write or change the reviewed plan; explicit loading switches to HISTORICAL with saving disabled. A fresh authorized preparation is required for any subsequent save. History is scoped and paginated, at most five contiguous versions per page, with IDs, hashes, editor/time, source/M6/parent bindings and CURRENT_AT_READ/SUPERSEDED/STALE_DEPENDENCIES observations.

## Adapter and authentication boundary

The adapter covers actual M7-02 prepareTimeline/saveVersion/readVersion/readHead/listHistory/readOperation operations, with erased service/DTO types. No executable repository/planner/authentication/gateway/private resolver enters its browser runtime graph. The coordinator reuses the existing browser canonical JSON/WebCrypto helper; it contains no network client, environment lookup, DB or Node hashing code. Its hash checks are consistency checks, not authentication or a substitute for independent server replay.

Mode and identityKey grant no authority. Every Timeline operation independently passes unchanged native server session authentication, exact method/URL/Origin/Fetch Metadata, write CSRF, scope grants, DB session/principal agreement, one-use action proof, catalog checks and currentness fencing. The browser harness forwards actual incoming cookie/Origin/Fetch Metadata/CSRF headers, never silently substitutes an always-valid identity. The test server's read RPC maps to native GET on its exact `/isolated-fixture` path; saves use separate POST/create and GET/read requests for the same verified actor. No browser role claims, source capture, HMAC, credentials, fixture administrator or source resolver can authorize a request.

Only tests own the localhost transport/session controls and new private Unix-socket PostgreSQL. Boot DTOs contain safe public metadata and the public anti-CSRF value; the session token stays in an HttpOnly SameSite cookie. The localhost harness uses HTTP (no Secure attribute there); the original direct fixture cookie policy remains HttpOnly/Secure/SameSiteStrict. Companion Highlights regression preparation independently verifies the incoming Timeline session, then uses that server-verified principal's separate M6 native read request; it never authenticates Timeline through M6 or trusts JSON identities. No application route/action, production authentication bootstrap, environment activation switch or default adapter exists.

## Saving, conflicts and unknown outcomes

Explicit preparation reacquires the current authorized selected M6 and captures exact scope, complete plan, expected Timeline revision and previous record identity. Browser checks input/plan/policy/segment hashes, exact selected target/source/dependency, integer source/output intervals, contiguous prefix sums, separate nonoverlapping source order, plan/record restrictions and scope. Server M7-01/M6 replay remains authoritative.

Save allocates one key, captures one canonical proposal and hash, and invokes unchanged M7-02 transactional source/M6/policy fences, immutable insert/audit and head CAS. It independently reads the returned version, recomputes record/proposal/content identities and exact parent, and independently reads/validates the corresponding history entry. Only then is status Saved and Verified and unsaved state cleared. Same-key duplicate service calls reuse one immutable record. Saving issues no approval, SOURCE_VERIFIED, voice eligibility, spend or publication authority.

Conflicts retain the original reviewed plan and proposal. Authorized head/history refresh cannot rebase it. Explicit head acceptance is required before a separate preparation; a head change during that preparation conflicts again. A transient failed refresh retains the acceptance requirement; a later successful authorized refresh restores CONFLICT and the explicit acceptance control. Original-operation recovery cannot bypass that requirement. This new-coordinator edge case was found during review and has focused regression coverage. Stale M6/source/policy keeps inspected metadata and requires fresh authorized preparation. Exact requests cannot silently substitute another M6 record or source/dependency.

Lost acknowledgement, transport error and failed independent read-back retain original key/hash/proposal and block another save/fresh key. Recovery is original readOperation only. NOT_FOUND is an observation, never proof of rollback, and cannot permit new writes. FOUND must independently pass readVersion/history checks before success. A stale read-back error cannot release a possibly committed proposal. Read-only business lookup still uses inherited one-use proof bookkeeping, not zero private proof-table writes.

## Verification

Fresh logs: `/tmp/movie-translator-m7-03-cpHJaL/`. All previous logs are preserved. Every test/compiler/build command sets the unreachable application datasource:

`DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`

No timing-sensitive server/PG suite overlaps compiler, build or browser work. Fresh owned Unix-socket PostgreSQL only; no application DB, live migration, production endpoints, provider, paid call, media processing or worker startup. Inherited foundation tests may seed synthetic verification facts; this integration issues no human approval or SOURCE_VERIFIED receipt.

| Final check | Actual completed result |
| --- | --- |
| Focused M7-03 coordinator/actual repository | **30/30 PASS**, zero failed/skipped, 53.95 s (`focused-final-30.log`). Includes duplicate-click coalescing, actual stored M4 narration-row and M6 counter preservation, and transient conflict-refresh recovery. |
| Consolidated serial M1–M7 / M5 lifecycle / M6 / R4–M9 / applicable legacy server regressions | **1,624/1,624 PASS**, zero failed/skipped, 702.05 s (`server-regressions.log`). Includes all M7-01/M7-02 and new M7-03 cases, original scope/auth/parser/time/fence controls and all 16 unchanged M4 expiry controls. |
| All UI component suites | **51/51 PASS**, zero failed/skipped, 2.03 s (`ui-components-accepted.log`). Includes the valid unequal-duration pure fixture and exact proportional scale, original Script/Highlights and legacy Recap/Export/source preview. |
| All Studio and legacy Chromium suites | **6/6 PASS**, zero failed/skipped, 92.44 s (`chromium-final.log`). All three widths 1440/1024/390 pass. |
| Lint / TypeScript | **PASS**, exit 0 (`lint-final.log`, `tsc-final.log`), no lint warnings. |
| Dummy-datasource Webpack | **PASS**, Next.js 16.3.6; compile 10.8 s, type check 4.1 s, 12/12 static pages (`webpack-final.log`). |
| M6, M7-01, M7-02 and M7-03 production audits | **4/4 PASS**, exit 0 (`m6-production.json`, `m701-production.json`, `m702-production.json`, `m703-production.json`). 71 client chunks, 144 server JS files, 108 production sources, 38 unchanged API routes, zero Server Actions, zero inspected private repository/auth/gateway/planner/resolver/credential/fixture/test-transport markers; new bridge is exclusively erased types. Public metadata/hash-domain strings are intentionally allowed for the authorized UI, not reported as absent. |
| Exact source inventory, credential patterns and working whitespace | **PASS**, 12 new and 5 modified paths only; zero credential-pattern matches; existing runtime foundations and original expiry SHA unchanged (`source-audit.json`). |
| Final staged content / whitespace / credentials | **PASS**, exact 17-path index equals reviewed working content; whitespace and credential-pattern checks pass (`staged-audit.json`). Only the final verdict wording is updated after that review, then re-staged and rechecked before commit. |

Final acceptance totals are **1,711 passing test executions / 1,681 distinct cases**: 1,624 server + 51 component + 6 Chromium; the separate 30 focused cases overlap the consolidated server run. Viewport iterations, subprocess fixtures and development runs are not extra distinct cases.

Development runs are separate: 22/22, 28/28 and 29/29 coordinator runs, 47/48 then 51/51 components, and 0/1, 0/1 then 1/1 new Chromium runs: **181 executions, 178 passes and 3 resolved failures**. The component fixture initially reused an imported fixture's `print` argument and emitted two JSON records; a dedicated `print-timeline` argument fixes only its entry-point protocol. Chromium first caught the new workspace's plural/singular accessible-name mismatch, then a test-control race that prepared before the newly selected M6 response was adopted; a dedicated visible completion status now precedes preparation. Review separately found and fixed the new coordinator's transient conflict-refresh acceptance affordance; its regression passed in both final server and focused commands. No old parser, authorization, timing assertion or deadline was weakened. All development logs are retained; no expiry failure occurred.

Final Timeline artifacts: `/tmp/storyline-m703-browser-c70o2l/`. Actual results record seven versions, seven reservations, seven audits and head revision seven; unchanged stored narration snapshots, no errors or rejected external page requests, zero production API/provider/media-processing calls, and actual FORBIDDEN / ORIGIN_REJECTED / CSRF_REJECTED / REVISION_CONFLICT / STALE_SOURCE denials. The test bundle graph excludes all M5/M6/M7 private runtime/planner/persistence/auth/fixture modules and the session cookie marker. Local segment/disclosure/navigation interactions make zero requests. Pagination, unsaved unload feedback/cleanup, historical confirmation/cancellation, keyboard inspection/save, current M6 selection, source/session/movie disposal and retained independent Script/Highlights buffers pass. Screenshots `visual-1440.png`, `visual-1024.png`, `visual-390.png` were inspected; proportional strips and wrapped exact labels are readable with no page overflow. This is covered keyboard/layout acceptance, not comprehensive assistive-technology certification.

Other browser artifacts are printed in `chromium-final.log`: `/tmp/recap-recovery-browser-wn1ycO/`, `/tmp/storyline-m9-save-browser-mbNHLj/`, `/tmp/storyline-m603-browser-L3i7Xh/`, `/tmp/recap-studio-navigation-MYNkkt/` and `/tmp/storyline-m9-recovery-browser-qKbZwV/`.

Exact final commands (from the project root, with the dummy DATABASE_URL exported):

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
node --conditions=react-server --import tsx --test --test-concurrency=1 \
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
node tests/storyline/highlights-studio/production-audit.mjs /tmp/movie-translator-m7-03-cpHJaL/m6-production.json
node tests/storyline/timeline/production-audit.mjs /tmp/movie-translator-m7-03-cpHJaL/m701-production.json
node tests/storyline/timeline-persistence/production-audit.mjs /tmp/movie-translator-m7-03-cpHJaL/m702-production.json
node tests/storyline/timeline-studio/production-audit.mjs /tmp/movie-translator-m7-03-cpHJaL/m703-production.json
git diff --check
git diff --cached --check
```

## Risks and handoff

Synthetic metadata integrity cannot establish real media existence, Chinese/Myanmar semantic correctness, human approval, voice duration, synchronized audio or rendered output. Currentness is a point-in-time observation, not a future processing lease. The trusted fixture/server administrator remains outside this synthetic adversary model.

The historical M4 M1-last positive-control failure (expected one fake-wire entry, observed zero under the unchanged 700 ms confirmation) has unknown root cause. All 16 assertions and deadlines remain unchanged; original file SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. A recurrence requires timing/state investigation, not deadline extension, weakened assertions, unsafe retry or dismissal as flaky. **All 16/16 controls passed once in the fresh consolidated run**, including the historical M1-last repeat-2 positive control. Its root cause remains unknown; this pass is not a timing repair.

Production remains blocked on separately approved real sessions/resource membership, deployment/key custody/tenant-source authorization, schema deployment, real authenticated transport, currentness/lock/expiry operational acceptance, exact narration human approval and spending authority, real media handling, rendering and publication design. This milestone activates none of them and implements no M8, provider, TTS, FFmpeg, download, worker or human receipt issuer.

**M7 final acceptance is READY for a separately authorized acceptance task.** M7-03 implementation/test scope is complete; production and M8 remain blocked and unimplemented. Final index review precedes the authorized local commit of only the 17 inventoried paths, with message `feat(storyline): integrate timeline Studio versioning`. The full resulting hash and working-tree state are reported in the final response; no push or destructive Git operation.
