# M9-05 — synthetic editor and immutable version saving

## Scope and audited baseline

M9-05 integrates recovered M9-03 editing with the R4 service in explicitly injected synthetic tests. Production Storyline reads and writes remain disabled. It does not implement genuine authentication, human approval, source verification, provider spending, TTS, publication or M5.

Entry audit: `recovery/m9-studio`, clean index and working tree, HEAD `6db849c39ee7910a65fa393f47e91c137528c722`. The earlier recovery work is committed in this baseline; the historical `b8780ee` reports do not describe the entry checkout. Read AGENTS/CLAUDE, UI freeze, R0–R3/R4 reports, actual UI/model/browser fixtures, R4 modules and restricted disposable SQL, plus installed Next.js server/client boundary guidance. Existing files/logs were preserved. No dependency, foundation, schema, migration, application page/API, worker or environment change is needed.

## Architecture and trust boundary

`RecapStudioShell` accepts optional `versionAdapterForTest` only alongside the existing explicitly injected synthetic artifact. Default production callers provide neither and retain their unavailable panels. No production route, Server Action, authentication fallback, environment switch, adapter bootstrap or default network client is added.

`SyntheticScriptVersionAdapter` shares the actual R4 `SaveStudioEdit`, `OriginalIdentity`, original/saved/history DTOs and scopes. Read targets use exactly R4's existing `{scope, original}`, with `versionId` or `afterVersion/limit` as appropriate. A durable M4 row identity contains ID/hash; its separate payload ID belongs inside the full save binding. Requests send the exact complete existing source/analysis/parent binding, expected revision, previous ID/hash, stable idempotency key and ordered section/paragraph text. They never send a principal/tenant/role as authority.

The adapter is an injection seam, not authentication. `identityKey` is a memory invalidation key, not a verified identity. Every operation reaches the unchanged R4 server service, which verifies the server-owned session, real request headers, origin/CSRF, read/save grants, database-owned tenancy/ownership maps, exact parent/M3/source bindings, current source fence and restricted PostgreSQL gateway. Browser-submitted hashes or movie selection do not confer access. All R4 service/authentication/SQL/privilege mechanisms remain unchanged.

Only type-only R4 DTO imports enter the client source. The existing R4 static boundary test is adjusted narrowly to erase `import type {…} from "@/lib/storyline/studio-versions/contracts"` before checking forbidden runtime references. It still rejects service/auth/database imports, fixture IDs, SQL gateways and activation in app/components/workers. Chromium additionally inspects the actual bundle dependency graph to ensure no server service, authentication, Prisma or test bootstrap ships to the browser.

Two test compositions exercise the seam. Direct acceptance binds native synthetic Requests on the server, with fresh owned PostgreSQL and the existing R4 restricted clients. Chromium starts a dedicated localhost child process which creates another fresh owned cluster, pins its actual ephemeral origin in R4 authentication and uses HTTP-only SameSite test session cookies. A test-only POST RPC transport carries the browser's actual Origin, cookie, CSRF and Fetch Metadata. For read operations it explicitly translates POST transport to the native GET Request expected by R4, preserving authentication/origin headers. It never fabricates identity/origin from request JSON. Session/fault controls are isolated fixtures under `tests/`, never application routes or development auth. The POST envelope accepts only operation/input; trusted server bootstrap owns keys, sessions, grants and databases. No production datasource is used.

The M1→M4 synthetic bootstrap uses the existing fake wire to create a legitimate test parent. Counters record its one fake-wire invocation before editor work; editing/read/save/history add no providers, job events, approvals, submissions or original drafts. All databases are newly owned disposable clusters using the existing ownership guards. No application database or live migration is accessed.

## Editor, status and history behavior

The version coordinator lives above workspace branching, like local editor state. All six destinations remain: Saved Recap, Script, AI Review, Voice, Highlights, Export. Evidence inspection, character references, observed/inferred distinctions, original provenance, Myanmar wrapping and confirmed section reset remain intact. New controls reuse existing buttons/styles/layout and do not redesign navigation.

Authorized reads start only through **Load saved versions**. Rendering and local edits perform no requests. **Save New Version** is disabled until a successful authorized parent read and actual changes, and during operations or unresolved pending proposals. No autosave exists. The editor buffer stays mutable and memory-only; saved versions are separate immutable records. Dirty comparison uses the last verified save or explicitly loaded saved text, rather than falsely calling every difference from the AI original unsaved. Section labels still disclose differences from the original. Reset restores original section text after confirmation and becomes dirty when that differs from the loaded saved baseline.

A save captures the entire text proposal and its random request key before awaiting. Editing can continue during a save; only the captured snapshot becomes the saved baseline, so later typing stays dirty. Success requires authorized read-back matching every save DTO field except separately observed currentness: immutable ID, canonical content hash, full binding/scope, version/previous pointer, timestamp/editor/review and exact Unicode text. A separately authorized history read must match its exact summary. The hash is verified by R4's canonical server validation and compared across independent save/read/history responses; the browser does not reconstruct a private canonical envelope with the excluded idempotency key.

The UI displays **Unsaved Draft**, **Saved Version** and **Human Approved: No** separately. Saving creates no approval or verification receipt and no TTS/publication eligibility. Original evidence remains provisional and does not semantically approve edited prose. Voice duration remains unknown.

History is scoped to the exact original and R4 authorization. It presents immutable IDs, hashes, sequence, date and authenticated synthetic editor metadata; pages use R4's bounded ascending 50-row contract and explicit **Load more versions**. **Preview saved version** independently reads that version without modifying editor text. **Load selected version into editor** requires explicit discard confirmation when unsaved text exists; cancellation retains it. This changes the editor baseline only, never the latest version head or lineage. Saving older text still creates a new child of an explicitly accepted current head.

Project/movie/source/artifact/draft/candidate identity, target and adapter identity-key changes remount local/version memory. Old responses are ignored, and a disposed save coordinator stops subsequent read-back requests. A save already dispatched can still commit under its original authorized scope; disposal is not a transaction cancel/rollback claim. Re-entering a scope requires a fresh authorized read. Browser unload/navigation receives native unsaved-change feedback; same-session destination switches preserve edits. External artifact/session changes reset the isolated memory as documented, rather than carrying text/history across identities.

## Failure, conflict and recovery behavior

No save silently overwrites or rebases. Duplicate clicks are coalesced while pending. An uncertain acknowledgement/read-back/history failure retains the exact request snapshot/key for explicit **Retry same save request**, which uses R4 idempotency. Typing after failure does not replace that retry snapshot. Snapshot retry never autosaves later text.

Revision and changed-payload/key conflicts show explicit feedback and retain text. **Refresh version history** observes the authorized latest head without changing the proposal/editor. **Use refreshed history head** is enabled only after a fresh successful observation, requires an explicit click, clears the old pending proposal and accepts the observed head without changing local text. Another editor can still win afterwards, producing another explicit conflict. The next save uses a new key and new immutable lineage; no automatic retry or last-write-wins exists.

Stale source or mismatched parent blocks save through R4 and directs the editor to reload a current authorized artifact. Unauthorized read/write, expired/revoked/session-transition, origin and CSRF failures have static feedback; raw errors never appear. Validation and transaction/uncertain-result failures retain editor text and the stable retry proposal. A post-insert exception actually rolls back the version/fence. The UI does not promise that a generic lost response proves rollback. Wrong Project/Movie/Studio and forged bindings are rejected independently by the server, not presentation checks.

## Exact file inventory

Modified:

- `components/storyline/recap-studio-shell.tsx` — explicit adapter/session injection, realm isolation, saved-baseline dirty status, unload feedback and version panel.
- `components/storyline/script-preview.tsx` — explicit buffer replacement and accurate optional persisted-baseline labels; original-only mode preserved.
- `tests/storyline/studio-versions/contracts.test.ts` — narrow type-only DTO allowance in the existing runtime boundary check.

Created:

- `components/storyline/script-version-session.ts` — adapter contract, snapshot coordination, verified save/read/history, retry/conflict handling and disposal.
- `components/storyline/script-version-panel.tsx` — explicit save/status/history/selected-preview/load confirmation UI.
- `tests/storyline/editor-saving/adapter.fixture.ts` — server-only test composition and safe actual M4 presentation projection.
- `tests/storyline/editor-saving/acceptance.test.ts` — fresh PostgreSQL editor integration, security, concurrency, rollback, uncertain result and late-response checks.
- `tests/storyline/editor-saving/component.test.tsx` — production/default no-capability and explicit-injection render checks.
- `tests/storyline/editor-saving/browser-server.fixture.ts` — isolated localhost disposable server; real R4 session headers/cookies and opt-in fault probes.
- `tests/storyline/editor-saving/browser.fixture.tsx` — isolated client adapter and labeled test controls.
- `tests/storyline/editor-saving/browser.test.mjs` — actual Chromium/database workflow, retained text, conflict recovery, responsive and session/source/movie isolation checks.
- `docs/STORYLINE_M9_RECOVERY_M9_05.md` — this report.

## Verification commands and actual results

Logs are retained at `/tmp/movie-translator-m9-05-2KICUM/`. The focused integration/security run completed **119/119 PASS**, zero failures/skips (74.654 seconds): 13 M9-05 cases and 106 R4 cases. The final editor plus boundary-contract rerun completed **19/19 PASS**, zero failures/skips (23.358 seconds). The final component suite completed **28/28 PASS**, zero failures/skips (1.322 seconds). The full applicable server suite completed **842/842 PASS**, zero failures/skips (358.893 seconds). All final results are recorded below. Existing expiry/deadline controls run serially without competing builds, with all assertions unchanged.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec \
  tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec \
  tests/storyline/editor-saving/component.test.tsx tests/storyline/ui/script-preview.test.tsx \
  tests/storyline/ui/navigation.test.tsx tests/recap/recovery-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  pnpm exec next build --webpack
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs tests/storyline/editor-saving/browser.test.mjs
```

| Required verification | Actual final result |
| --- | --- |
| Combined M9-05 + complete R4 contract/security matrix | **119/119 PASS**, zero failures/skips; 74.654 seconds (`focused-final.log`). |
| Final M9-05 + R4 shared-contract rerun after final UI/session adjustments | **19/19 PASS**, zero failures/skips; 23.358 seconds (`editor-final.log`); includes 13 M9-05 cases. |
| Full applicable M1–M4/Storyline and listed legacy regressions | **842/842 PASS**, zero failures/skips; 358.893 seconds (`server-regressions.log`). |
| New + existing Studio/editor/Recap component suite | **28/28 PASS**, zero failures/skips; 1.322 seconds (`components-final.log`). |
| All four Chromium suites | **4/4 PASS**, zero failures/skips; 39.876 seconds (`browser-final.log`); actual 1440/1024/390 px. |
| `pnpm lint` | **PASS**, exit 0 (`lint-final.log`). |
| `pnpm exec tsc --noEmit` after build | **PASS**, exit 0 (`typescript-final.log`). |
| Dummy-datasource Webpack build | **PASS**, exit 0 (`build.log`); compilation, TypeScript, 12 static pages and traces complete. |
| Working-tree and staged whitespace checks; twelve-file newlines/credential-pattern scan | **PASS**; explicit intended paths only. |

Final browser artifacts: `/tmp/storyline-m9-save-browser-ICkW4w/`, `/tmp/storyline-m9-recovery-browser-pUXJyP/`, `/tmp/recap-studio-navigation-YISpmD/`, `/tmp/recap-recovery-browser-ZgO82c/`. Final desktop saved-version and mobile layout screenshots were visually inspected. The new suite asserts exact text round-trip, original bytes unchanged, rollback, committed/lost acknowledgement retry, explicit conflict/reconciliation, origin/save-permission/source-stale failures, read-only preview, unsaved switch confirmation/cancellation, session/movie/artifact reset, keyboard Save and no horizontal overflow. Its final audit records eight immutable edited versions, unchanged original/approval/job/submission counters, one bootstrap fake-wire call and zero editor provider/production API calls. Existing local interaction tests assert zero requests at all three widths. The preserved Recap suite intercepts three explicit synthetic retry POSTs and reports zero paid requests; these are not production requests.

The full server command includes existing pure disabled M5 handoff contract tests; no M5 execution or implementation is introduced. Its unchanged expiry cases passed, including the previously timing-sensitive M1-last actual-wire control; no expiry failure recurred in this task. The earlier R4 timing incident remains documented in the R4/M4 reports and is not declared repaired by this pass.

Earlier diagnostics are preserved. The first direct M9-05 run was **3 PASS / 8 FAIL out of 11** because the test adapter incorrectly included the payload ID in R4's strict read target; projecting only durable ID/hash corrected it, followed by **11/11 PASS**. The expanded first integration/R4 run was **118 PASS / 1 FAIL out of 119** because the R4 static check still forbade erased UI DTO type references; the narrow type-only allowance described above corrected the milestone assumption, followed by **119/119 PASS**. The first Chromium startup was **0/1 PASS** due to a top-level-await/CommonJS fixture entrypoint mismatch; wrapping its entrypoint corrected it, followed by **1/1 PASS** against actual disposable PostgreSQL. Initial TypeScript readonly-section annotations were corrected. These diagnostic logs remain alongside final results. No R4 auth, hash, privilege, source-fence, immutability, transaction or expiry assertion was weakened.

## Production blockers and exit recommendation

R4's documented production blockers remain: genuine server sessions and membership/tenancy, secure deployment auth/origin/CSRF policy, reviewed source-access/RLS and role/key custody, additive schema deployment, production data projection/transport and integration review. The synthetic injection marker and passing tests grant none of those. Human approval/source verification, semantic review, paid providers/spending, TTS and publication need independent authorization and implementation. Existing M4 expiry timing uncertainty remains a separate operational gate; this UI work does not repair or certify it.

Stop after M9-05. No M5 work or push is authorized. The latest attachment explicitly authorizes an M9-05-only commit after every required acceptance check passes, using explicit paths; prior recovery commits/files are not restaged as new work.

**M9-05 PASS — synthetic/disposable integration only. Ready for a synthetic M9 final acceptance review. Production activation and M5 remain outside this authorization.** No real application database, live migration, production endpoint/authentication deployment, provider/TTS, human approval or publication was activated. Logs and existing files are preserved.
