# Storyline M9 recovery R0–R3

## Scope and baseline audit

Recovery starts from `b8780ee` on `recovery/m9-studio`, with a clean index and working tree. `master` and the recovery branch both resolved to the expected baseline. `CLAUDE.md` delegates to `AGENTS.md`. The UI baseline, Studio architecture, M1–M4 acceptance/contracts, narration handoff/persistence/workflow, Recap components and existing component/Chromium harnesses were inspected. The installed Next.js Server and Client Components guide was read before editing.

The baseline contains the six-destination Studio navigation shell and M1–M4 synthetic server foundations. It does **not** contain the reported M9-01/02/03 implementations or M9-04 services. Historical results are requirements only. This recovery adds executable source and tests; it does not restore files from an unverified report or claim a previous run as present evidence.

Reusable contracts are `NarrationDraft` (ordered sections/beats, exact paragraph text, claim lineage, parent, source and analysis bindings), `ValidatedEvidenceAnalysisCandidate` (classification, subjects, basis, uncertainty, contradictions and Chinese anchors), and the selected M1 source transcript/scene/character/relationship/observation fields. No M1–M4 contract, service, SQL draft, migration, role, worker or immutable artifact is modified.

## R1: presentation with production reads disabled

`RecapStudioShell` accepts an optional, explicitly named `previewForTest` input. **No production caller supplies it**, and the application page is unchanged. Omission preserves the existing unavailable shell. There is no feature flag, datasource fallback, loader, route or synthetic fixture import in the application.

The ready preview accepts only an explicitly labeled synthetic artifact and checks consistency of the selected Project/Movie, Studio/source/candidate/task/generation/recipe bindings against that input. A mismatched input renders unavailable with no text editor. These are presentation consistency checks, **not authentication, canonical-hash verification, freshness proof or a new security boundary**. They must never be repurposed as production authorization. The source input omits private preparation metadata, storage locations, signing material and raw provider results.

Presentation includes ordered Myanmar sections, provisional/synthetic origin, stale/unknown/current-at-fixture-read labels, exact original draft/version/parent/source/candidate/analysis provenance, Chinese text and source intervals, unknown voice duration and separate no-approval/no-source-verification labels. Loading, empty, error and unavailable are distinct. No synthetic artifact is labeled human approved or eligible for TTS. Source times are labeled source intervals, not a narration timeline or playable seek capability.

Saved Recap, Script, AI Review, Voice, Highlights and Export remain reachable through the existing links. Navigation, layout, zinc/violet styles, responsive breakpoints and legacy Recap behavior are preserved. Voice/Highlights/Export retain their existing unavailable behavior.

## R2: local evidence review

Narration sections have stable ID selection and independently collapsible content. Script and AI Review share the selected section and local session. Findings show character names, claim/relationship links, observed versus inferred classification, confidence, uncertainty, qualification, observed basis and contradictory interpretations. Finding buttons inspect basis/competing references locally. Chinese comparison resolves the exact movie/transcript/scene/segment, literal quote or captured observation; unavailable evidence/characters/relationships/lineage/basis references are called out instead of invented.

Local review performs no network request, seeking, source verification or approval. Native buttons and disclosures retain keyboard behavior; the existing manual-activation Studio tabs are unchanged.

## R3: memory-only Myanmar editor

Only local paragraph buffers are edited. The original M4 draft, paragraph claim IDs, parent, source and candidate provenance remain unchanged. No new artifact ID/hash/version is minted. Exact Unicode is preserved without normalization or silent truncation. Limits reuse M1 ceilings: 1,200 Unicode code points across a section's paragraphs and 36,000 across the script. Malformed Unicode and unsupported controls are rejected with feedback. Empty local text is displayed honestly; it is not a validated publishable draft.

Dirty state compares against the exact original paragraph arrays. Reverting to original text clears dirty state. Section reset requires an explicit in-flow confirmation and supports Keep editing. Changing the selected section cancels a pending reset. Section and destination switches, including Saved Recap, retain local buffers; an unsaved notice remains visible across destinations. A session key binds selected project/movie, draft ID/hash, parent, complete source binding/Studio revision and analysis/candidate identity. Identity transitions remount the session and discard text, selection, expanded state, evidence inspection, errors and pending reset confirmations. Reload also loses edits. These memory limits are explicitly labeled. Long section/local previews retain full text in keyboard-focusable scroll regions, using the existing workspace content pattern rather than truncating text or creating an excessively tall page.

There is no save, autosave, browser storage, backend write, publication, provider call, approval issuance or TTS integration. Local edits do not update claims/evidence or inherit semantic review. Production saving and authenticated reads remain separate future work.

## Executable coverage and verification

The fixture process invokes the existing M3 validator and M4 composer on synthetic M1 source. It includes observed material, qualified competing motivations, a relationship and exact Chinese anchors. It emits only the allowlisted UI input. The component suite also supplies deliberately missing references to verify honest presentation. Browser identity probes are explicitly synthetic UI probes, not persisted/validated replacement drafts.

The browser fixture runs an isolated React shell, preserving the existing application's Link construction while simulating same-page query navigation in the harness. No application server or database is started for the UI suite. The suite uses the existing external Playwright package and installed Chromium-based browser, plus CSS from the Webpack build; no packages are installed. It checks 1440/1024/390 px, all six destinations, legacy tabs, collapses/selection, inferred and contradictory evidence, bounded local edits, reset cancellation/confirmation, destination preservation, movie/source/draft/candidate resets, loading/error/missing states, keyboard controls, reload loss, frozen original fixture and zero network calls during local interactions. Screenshots and a machine-readable result are retained in a unique `/tmp/storyline-m9-recovery-browser-*` directory.

Reproduction commands (run the timing-sensitive server suite without competing builds):

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec \
  tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  pnpm exec next build --webpack
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  CHROME_PATH=/opt/brave.com/brave/brave \
  node --test --test-concurrency=1 tests/recap/recovery-browser.test.mjs \
  tests/storyline/ui/navigation-browser.test.mjs tests/storyline/ui/script-preview-browser.test.mjs
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
```

Verification completed on 2026-10-18. The full server glob also includes the existing pure disabled M5 handoff tests; no M5 implementation or execution is added. All counts below are actual completed runs in this recovery, not historical counts.

| Check | Final actual result |
| --- | --- |
| Full sequential Storyline M1–M4 plus existing pure M5/Recap/render-contract regressions | **842/842 PASS**, zero failures/skips; 385.870 seconds. Existing owned disposable PostgreSQL harness; unreachable application datasource. |
| Recovered component/model plus existing Recap and Studio navigation tests | **26/26 PASS**, zero failures/skips; 11 recovered cases and 15 existing cases. |
| Chromium: existing Recap recovery, existing Studio navigation, recovered R1–R3 | **3/3 PASS**, zero failures/skips; 24.772 seconds; all cover 1440/1024/390 px. |
| Recovered browser flow network/immutability/identity assertions | **PASS**: zero local network/API calls; unchanged frozen original; movie/source/draft/candidate isolation; expanded provenance and long previews wrap; no browser errors. |
| `pnpm lint` | **PASS** (exit 0). |
| `pnpm exec tsc --noEmit` | **PASS** (exit 0). |
| `git diff --check` / `git diff --cached --check` | **PASS / PASS**. Eight changed/new files also checked for trailing whitespace and final newline. |
| `pnpm exec next build --webpack` with unreachable dummy `DATABASE_URL` | **PASS** (exit 0), including compilation, TypeScript, static generation and build traces; final build includes scrollable preview adjustment. |

Retained logs: `/tmp/movie-translator-m9-recovery-8whvwS/`. Final files are `server-tests.log`, `component-tests-verified.log`, `browser-tests-final.log`, `build-final.log`, `lint-verified.log` and `typescript-final.log`. Earlier diagnostic/rerun logs remain alongside them. The initial sandbox test runner could not spawn the synthetic fixture process (`EPERM`); actual component counts were obtained outside that restriction. Initial TypeScript fixture annotation errors were corrected. One expanded component run was **25/26 PASS, 1 FAIL** because its new observation test assumed a quote section contained a captured observation; selecting through actual finding/claim/beat/section lineage corrected the test. The first combined browser run was **2/3 PASS, 1 FAIL** because its new text locator also counted the textarea; the locator now explicitly checks the two paragraph previews. The focused browser rerun passed, followed by the final complete **3/3** run after the scrollable preview adjustment. No foundation code, safety rule, existing assertion, deadline or expiration was weakened.

Final screenshots/results:

- Recovered R1–R3: `/tmp/storyline-m9-recovery-browser-SsFL6Y/` (six screenshots plus `results.json`).
- Existing Studio navigation: `/tmp/recap-studio-navigation-KtG04c/`.
- Existing Recap recovery: `/tmp/recap-recovery-browser-7SLDES/`.

The final mobile editor and desktop evidence screenshots were inspected, including Myanmar wrapping and long-text scrolling. No page-level horizontal overflow was observed/asserted at the three widths. The existing Recap browser suite intercepts three explicit synthetic retry POSTs and reports zero paid requests; this is a legacy regression fixture, not a new Studio write capability. The recovered editor/review flow makes **zero requests of any kind during local interactions**.

## Changed files

Modified:

- `components/storyline/recap-studio-shell.tsx` — optional isolated preview and identity-keyed memory session; existing production/default behavior preserved.

Created:

- `components/storyline/local-script-model.ts` — safe preview shape, consistency/session identity and bounded immutable local buffers.
- `components/storyline/script-preview.tsx` — presentation, evidence inspection, local session and editor.
- `tests/storyline/ui/script-preview.fixture.ts` — synthetic M4-composed fixture producer.
- `tests/storyline/ui/script-preview.test.tsx` — component/model/boundary tests.
- `tests/storyline/ui/script-preview-browser.fixture.tsx` — isolated interactive harness.
- `tests/storyline/ui/script-preview-browser.test.mjs` — Chromium acceptance.
- `docs/STORYLINE_M9_RECOVERY_R0_R3.md` — audit, implementation, commands, actual results and handoff.

No dependencies, shared styles, application pages/APIs, environment files or existing tests are changed. No application database access, live migration, real provider/paid spending, TTS/audio generation, Redis worker startup, production receipt issuance, authentication shortcut, commit, push, reset or destructive cleanup is part of this recovery. Existing files/logs and the staged index are preserved. Existing regression fixtures may exercise ephemeral synthetic verification within owned disposable databases; that does not issue production human approval.

## R4 boundary

**R0–R3 PASS: isolated synthetic UI recovery only. Ready for a separately authorized R4 milestone.** This recovery does not implement or certify M9-04 authenticated version saving. R4 must establish authenticated server identity, session/origin verification, exact Project/Movie/Studio and source/candidate/parent scope, restricted immutable writes, idempotency/conflict/rollback semantics and safe read DTOs independently. The preview prop and consistency checks supply no authority. Production read/write/provider/approval activation remains disabled. No unresolved implementation failure remains in the covered recovery scope; production authentication, data access and durable saving remain unimplemented and unverified. Stop at R3; do not begin R4 or M5 here.
