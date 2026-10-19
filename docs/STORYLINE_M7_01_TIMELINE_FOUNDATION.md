# M7-01 — Pure recap timeline foundation

Date: 2026-10-19, Asia/Bangkok. Scope: synthetic metadata planning and replay only.

## Verdict and audited baseline

**M7-01 PASS — SYNTHETIC_ONLY, metadata-only.** Every required final acceptance check passed. This completes the pure timeline foundation, without production activation, persistence, Studio Timeline UI or media processing.

Branch `recovery/m9-studio`, exact starting HEAD `3c758984c441624a74d207fa8e203c6f31b01bd2` (`docs(storyline): complete M6 highlights final acceptance`) and an entirely clean working tree were confirmed. AGENTS.md, CLAUDE.md, the UI freeze, M6-01/02/03 and final handoff, M5/M9 acceptance, installed Next.js data-security guidance and actual M1 source, M4/R4 narration, M5 reference, M6 planning/persistence/authentication/fixture contracts informed this implementation. Historical test results are not this milestone's evidence.

No existing foundation, hash domain, UI, route, action, schema, dependency or expiry-control file is changed. All eleven milestone paths below are new.

## Inventory and exact API

| Path | Responsibility |
| --- | --- |
| `lib/storyline/timeline/contracts.ts` | Versioned input, fixed policy, resolver observations, segments, plan, restrictions and safe errors. |
| `lib/storyline/timeline/input.ts` | Strict bounded canonical input parser; exact M6 scope/identity and hash domains. |
| `lib/storyline/timeline/resolution.ts` | Independently resolved record/head/parent/dependency/current-policy checks and complete M6 replay. Internal implementation, not re-exported. |
| `lib/storyline/timeline/planner.ts` | Separate orders, safe source/output arithmetic, deterministic IDs, frozen plan and full replay validation. |
| `lib/storyline/timeline/index.ts` | Server-only public exports. |
| `tests/storyline/timeline/fixture.ts` | Independently owned in-memory saved-record model, reused M6 synthetic capture and hostile envelope rehash helper. This model does not prove PostgreSQL persistence. |
| `tests/storyline/timeline/foundation.test.ts` | Functional, strict serialization, evidence/identity/currentness and coordinated-rehash attacks. |
| `tests/storyline/timeline/postgres.test.ts` | Actual authorized M6 repository save/read/head integration on newly owned disposable PostgreSQL. All new database I/O lives here. |
| `tests/storyline/timeline/boundaries.test.ts` | AST-based transitive runtime-import checks, no production composition, zero-network replay and unchanged originals. |
| `tests/storyline/timeline/production-audit.mjs` | Built client/server/source/route/action and owned secret-pattern audit. |
| `docs/STORYLINE_M7_01_TIMELINE_FOUNDATION.md` | This implementation, verification and separately authorized persistence handoff. |

Public functions, exported from the server-only index:

```ts
parseRecapTimelineInput(value: unknown): Immutable<RecapTimelineInput>
generateRecapTimelinePlan(value: unknown, resolver: SyntheticTimelineResolver): Promise<RecapTimelinePlan>
validateRecapTimelinePlan(value: unknown, expectedInput: unknown,
  resolver: SyntheticTimelineResolver): Promise<RecapTimelinePlan>
```

The index also exports contracts, `TIMELINE`, `timelinePolicy`, `timelineRestrictions` and `TimelineError`. Error codes are `INVALID_INPUT`, `RESOLUTION_FAILED`, `INTEGRITY_FAILED`, `INELIGIBLE`, `STALE`, `INVALID_PLAN`; safe messages contain no credentials or private context. Async APIs allow an injected test resolver to reacquire authorized records on every call. The implementation itself performs no I/O and has no default resolver.

## Versioned input and policy

New domains are `story-recap-timeline-input-v1`, `story-recap-timeline-policy-v1`, `story-recap-timeline-segment-v1` and `story-recap-timeline-plan-v1`. Existing `contractHash` uses SHA-256 over `domain + newline + canonicalJson(value)`. No old domain changes.

```ts
RecapTimelineInput = {
  schemaVersion: "story-recap-timeline-input-v1";
  execution: "SYNTHETIC_ONLY";
  scope: { tenantId, projectId, movieId, studioId };
  selected: {
    id, version, recordHash, recordHashDomain: "story-highlight-saved-record-v1",
    planHash, planHashDomain: "story-highlight-plan-v1"
  };
  policy: typeof timelinePolicy;
}
```

The fixed policy has schema `story-recap-timeline-policy-v1`, `timeUnit: INTEGER_MILLISECONDS_V1`, `intervals: HALF_OPEN`, `speedNumerator: 1`, `speedDenominator: 1`, `transition: CUT_ONLY`, `placement: CONTIGUOUS`, `sourceOverlap: REJECT`, `filler: NONE`. Exact canonical policy equality rejects extra fields, other units, speed changes, transition duration and audio synchronization.

No clips, times, durations, scores, evidence, narration, roles, approval, audio tracks or caller currentness are accepted. Existing strict scope/record parsers enforce ASCII IDs (1–128 characters), lowercase 64-character hashes and supported version range (1–1,000,000). Canonical JSON rejects negative zero, fractions, unsafe integers, getters without executing them, cycles, dates, holes, unsupported prototypes/nonenumerable fields and malformed Unicode. Input and complete output envelopes are bounded at 2 MiB; captured resolution at 32 MiB, with inherited per-record (3 MiB), M6 plan/input (2 MiB), capture (24 MiB), canonical hashing and M1–M4 limits also enforced. These are rejection bounds, never truncation or a promise every maximal combination fits.

## Resolver, M6 identity and currentness

`SyntheticTimelineResolver.resolve(frozenInput)` returns a `TimelineResolution` directly or through a Promise. `RESOLVED_SYNTHETIC` supplies:

- Authorized selected `HighlightRecordView` and separately observed scoped head revision/identity.
- Independent immediate-parent view, or null for the first version.
- Stored dependency ID/hash and independent full M1/M2/M3/M4/R4 `SyntheticHighlightCapture`.
- Current dependency ID/hash, source reference and enabled M6 policy/rubric version observation.

`NOT_FOUND`, `UNAUTHORIZED`, `UNKNOWN`, `UNSAVED`, resolver exceptions and unsupported observations fail closed. There is no retry or request-authored capture fallback. The seam is **not authentication**; a trusted fixture owner must own its implementation. It cannot turn test identity injection into production authority.

The planner parses the stored record/proposal, recomputes record and M6 plan hashes, verifies exact requested scoped ID/version/hash/domains, checks head identity/revision, validates parent scope/version/ID/hash/plan identity, and recomputes the tenant-scoped immutable dependency envelope hash. Record version must equal head revision; first version requires null parent. Later versions require the exact independently supplied previous view. It checks current dependency/source/revisions and enabled policy/rubric, then calls unchanged `validateHighlightPlan` against the separately captured context. M6 revalidates M1 hashes/media/admissions, M2 definitive synthetic result, M3 evidence/subjects/basis and M4 projection, original stored ID/hash and optional R4 payload/domain/section mapping.

M6 must be PLANNED, nonempty, complete coverage and the current head. An intact historical M6 record may be CURRENT_AT_READ while being superseded; it is deliberately ineligible for a new v1 timeline. No rebasing or substitution occurs. Disabled policy and source/media/candidate/narration or revision drift reject both generation and replay. The input hash binds the selected record hash; the plan additionally binds observed head revision and exact dependency ID/hash. No new wall-clock time, random ID, credential or expiry token is added to timeline identity.

The disposable integration resolver calls actual `readVersion` and `readHead`, including an authorized parent read. Only the test composition uses its newly owned administrator to reconstruct the stored dependency from independent source/analysis/narration tables and observe current policy/dependency. It neither exposes this data through production DTOs nor adds a runtime database adapter. M6 reads retain their existing disposable one-use authentication-proof bookkeeping; timeline generation adds no version/reservation/audit/head writes. Counters and immutable originals are checked explicitly.

These observations are point-in-time checks, not a single transaction snapshot, durable authorization, future-currentness guarantee or processing lease. A later head/source change can invalidate a previously valid plan. Replay reacquires all observations; future persistence/execution must independently authorize and fence again.

## Exact source and output semantics

Every source/output coordinate is an integer millisecond and describes a half-open interval `[startMs,endMs)`. Original speed is exactly 1:1. Require `0 <= start < end <= authoritative media.durationMs`. Safe integer checks cover subtraction and each prefix addition. Unsupported arithmetic is rejected rather than rounded; accepted disjoint source intervals and existing M6 media bounds also keep totals below the safe-integer ceiling.

Exactly one segment is generated for every M6 SELECTED candidate. Unknown, missing, excluded or duplicated selections, wrong source/presentation orders, overlap and coordinated rehashes fail M6 replay or the independent M7 selected-set/order checks. Source overlap is checked after independently sorting source intervals, with touching endpoints allowed.

Output follows **M6 presentation order**, even when nonchronological. For each segment, duration is `sourceEndMs - sourceStartMs`, output start is the prior output end (initially zero), and output end is start plus duration. Total output equals M6 `totalSourceMs`. No source omission, transition, filler or audio adds time. Separate `sourceOrder` and `presentationOrder` contain derived segment IDs; each segment retains its M6 candidate ID. Exact M6 between-clip omission metadata is copied; no leading/trailing omissions are invented.

For example, source `[8000,10000)` then `[0,2000)` maps to output `[0,2000)` then `[2000,4000)`, while source chronology stays reversed relative to presentation. The omitted source interval contributes zero output. There are no frames, samples, seconds conversion, black frames, extracted clips or playable media.

## Identity, character/psychology provenance and replay

Each `tlseg-<hash>` hashes the segment body under the segment domain, excluding only its derived ID. That body binds exact tenant/project/movie/studio, selected saved M6 record and plan identities/domains, original source/media/narration reference, full selected M6 candidate, presentation index, source interval, duration, output interval and permanent restrictions.

The candidate preserves exact M3 finding/claim IDs, characters/relationship, Chinese evidence references/text/intervals/anchors, OBSERVED versus INFERRED, category/statement, confidence, uncertainty, qualification, observed-basis IDs, contradiction references/explanations and original rubric factors. Referenced basis/contradictory findings remain tied through the exact saved M6 plan and captured M3 hash; no invented psychological claim is introduced. Tests include a selected qualified, competing inference whose observed basis spans a longer excluded interval.

The complete payload binds input and policy hashes, dependency/head observations, source, segments, both orders, omissions, optional fake reference, total and restrictions. `planHash` hashes it under the plan domain; the outer ID is `tl-<planHash>`. Selected-version, evidence, source, index or placement changes alter identity or fail replay. Hashes are consistency identifiers, never authorization or semantic truth.

Validation captures a bounded strict envelope, independently regenerates everything, checks its outer hash and compares complete canonical content. Rehashing modified segments and outer envelope cannot authorize changed source, evidence, selected set, output positions, order, omissions, timing policy, domain or restrictions. The independently regenerated result is returned deeply frozen, with no mutations of M4, M6, input or resolver fixtures.

## Audio, approval and production boundaries

Null audio works. An optional matching M6 fake reference is preserved exactly: FAKE_ONLY, REFERENCE_ONLY, SYNTHETIC_BYTE_INTEGRITY_ONLY, speech NOT_VERIFIED and existing fake restrictions. No artifact existence, actual speech duration, semantic verification or ownership is inferred. Fake WAV silence never controls placement; audio changes may change immutable lineage IDs but not source/output coordinates or total. No tracks are created. Original movie audio is EXCLUDED.

Every plan/segment permanently declares SYNTHETIC_ONLY, NOT_PERSISTED, NOT_RENDERED, humanApproval NONE, sourceVerified false, real-TTS/publication eligibility false, spendingAuthority NONE, syntheticAncestry true and voiceSynchronization UNSUPPORTED. Saving M6 is not approval. No approval or SOURCE_VERIFIED receipt is issued.

The new runtime graph imports no database, runtime repository, authentication bootstrap, provider, network, media execution, filesystem or subprocess implementation. The inherited M4 context uses only the pure result parser from `jobs/fake-transport.ts`; its in-process fake invocation is never called. AST checks follow every runtime import, ignore erased type imports, reject dynamic runtime import and restrict external imports to server-only/node:crypto. Existing pure validation/canonical modules are reused unchanged.

No production source, client/server build chunk, route, Server Action, UI or worker composes M7. No datasource fallback, application database access, schema/migration, FFmpeg/download/extraction, rendering, real TTS/provider, paid spending, synchronization, publication or new worker is introduced. All existing Studio/legacy behavior remains intact.

## Fresh verification

Logs: `/tmp/movie-translator-m7-01-HhmH2E/`. All old logs are preserved. Every test, compiler, lint and build command uses the explicitly unreachable application datasource `postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`. Database fixtures own fresh private Unix-socket PostgreSQL clusters; no application DB or external provider is used. Timing-sensitive server tests run serially, without competing build/browser/compiler work.

| Final verification | Actual completed result |
| --- | --- |
| Combined focused M7/M6 suite | **300/300 PASS**, 0 failed/skipped; 102.47 seconds (`focused-acceptance.log`). Includes all 118 new M7 cases and 182 unchanged M6 cases. |
| Consolidated serial M1–M7, M5 lifecycle, R4/M9 and applicable legacy server suite | **1,482/1,482 PASS**, 0 failed/skipped; 611.33 seconds (`server-regressions.log`). Includes all focused cases and all 16 unchanged M4 expiry controls. |
| Studio and legacy components | **47/47 PASS**, 0 failed/skipped; 1.10 seconds (`ui-components.log`). |
| All five existing Chromium suites | **5/5 PASS**, 0 failed/skipped; 54.65 seconds (`chromium.log`). Responsive checks at 1440/1024/390 px, keyboard access, original immutability, save/read/history/recovery and isolation. |
| `pnpm lint` | **PASS**, exit 0, no warnings (`lint.log`). |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0 (`tsc.log`); build type-check also passed. |
| Dummy-datasource Webpack build | **PASS**, Next.js 16.3.6, compiled in 9.9 seconds, type-checked and generated all 12 static pages (`webpack.log`). |
| Existing M6 production security audit | **PASS**, 71 client chunks, 38 unchanged API routes, zero Server Actions, zero inspected authority/test-transport/credential markers, exclusively erased type bridge (`security-audit.json`). |
| New M7 production audit | **PASS**, 71 client chunks, 144 server JS files, 106 production source files, 38 unchanged API routes, zero Server Actions, zero timeline runtime markers or owned secret-pattern matches (`timeline-production-audit.json`). |
| Baseline/owned-file/expiry audit | **PASS**, eleven new owned paths, zero modifications of existing tracked files; original expiry SHA-256 remains `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7` (`source-audit.json`). |
| Working/staged whitespace, exact paths, source and credential-pattern review | **PASS**, only the eleven owned new paths; no unrelated work or detected credentials (`staged-audit.json`). |

The final acceptance commands completed **1,834 passing test executions representing 1,534 distinct cases**: 1,482 server + 47 component + 5 Chromium. The separate 300-case focused run repeats cases contained in the consolidated server command. Viewport iterations, fixture subprocesses, development runs and historical reports are not counted as additional distinct cases.

Development execution is recorded separately: 105/105, 109/110, 116/118 and 118/118, totaling **451 executions: 448 passes and three failures**, all in new tests and resolved before final acceptance. The import audit initially confused a TypeScript type query with dynamic runtime import, then over-rejected the inherited pure fake-result parser; the new inferred fixture initially paired DIALOGUE with nonquote evidence. The audit now distinguishes runtime syntax and traverses the actual pure parser, and the fixture uses independently valid observed-basis evidence with competing inferences. No existing assertions or foundation contracts were weakened. Two new-fixture TypeScript issues were corrected before the final type check. A component invocation initially never started because automatic permission review timed out; its one permitted unchanged retry passed. That timeout executed zero tests.

All **16/16 expiry controls passed once in the fresh consolidated run**, preserving every original assertion, 700 ms positive-control deadline and both M1-first/M1-last interleavings. The historical M1-last positive control that observed zero sends instead of one did not recur. Its root cause remains unknown; this PASS does not claim a timing repair. Investigate a recurrence rather than weakening controls, extending the deadline or dismissing it as flaky.

Fresh browser logs include `/tmp/recap-recovery-browser-HPULoZ/`, `/tmp/storyline-m603-browser-7nLNq3/`, `/tmp/recap-studio-navigation-DBtofT/`, `/tmp/storyline-m9-recovery-browser-hbt9Uh/` and the M9-05 path printed in `chromium.log`. The Highlights results record all three widths with no overflow, keyboard/exact-save checks, seven immutable versions, no browser errors/rejections and zero production API/provider/media-processing calls. Local editor interactions record zero network calls and immutable originals. These are existing UI regressions; no new M7 UI is claimed.

Exact commands (all from the repository root, after exporting the dummy datasource above):

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/timeline/*.test.ts tests/storyline/highlights/*.test.ts \
  tests/storyline/highlights-persistence/*.test.ts tests/storyline/highlights-studio/acceptance.test.ts

node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/durable-fake/*.test.ts \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/highlights-studio/acceptance.test.ts tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts \
  tests/storyline/timeline/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts

node --import tsx --test --test-reporter=spec \
  tests/storyline/highlights-studio/component.test.tsx tests/storyline/editor-saving/component.test.tsx \
  tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
pnpm exec next build --webpack

PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs tests/storyline/editor-saving/browser.test.mjs \
  tests/storyline/highlights-studio/browser.test.mjs
node tests/storyline/highlights-studio/production-audit.mjs /tmp/movie-translator-m7-01-HhmH2E/security-audit.json
node tests/storyline/timeline/production-audit.mjs /tmp/movie-translator-m7-01-HhmH2E/timeline-production-audit.json
git diff --check
git diff --cached --check
```

The command outputs are retained separately in the owned log directory. No development or historical run is substituted for final verification.

## Known limitations and M7-02 handoff

This is bounded synthetic timeline metadata, not media existence verification, Chinese/Myanmar semantic approval, speech measurement, rendering or publication. M6 greedy selection/structural-evidence limitations remain inherited. Full source/evidence data remains private server/test material; no browser DTO or durable timeline storage is designed here. A compromised fixture/resolver owner can fabricate observations: hashes cannot replace independent production authentication, membership or trustworthy acquisition.

The accepted M7-01 foundation is ready for **separately authorized M7-02** immutable persistence design/implementation. It should preserve these domains and exact M6/dependency/source/narration identities; independently authenticate exact scope and capabilities; prepare/save/replay against repository-owned context; fence M6 head, dependency/source revisions and enabled policy through commit; enforce immutable version/parent/head CAS and audit atomically; preserve same-request idempotency; retain original ownership on UNKNOWN outcomes without automatic write/provider retry; and independently authorize read-back/history. Decide historical-integrity versus current-admission semantics explicitly. Do not make historical versions executable by waiving currentness checks.

Future Studio Timeline UI needs separate authorization, frozen-layout integration, explicit memory/saved/approved states, identity/session isolation, history preview/load and unsaved-change confirmation. Media acquisition/extraction, rational frame/sample conversions, approved real narration, measured audio synchronization, rendering/publication, production schema/authentication and spending are further independent gates. M7-01 implements none of them.


## Completion and Git disposition

M7-01 is complete for synthetic metadata planning/replay. Only the eleven paths in the inventory are owned by this milestone. After final exact-path, staged whitespace/content and secret checks, the authorized local commit message is `feat(storyline): add deterministic recap timeline planning`. The full resulting hash and final status are reported to the user; no push, unrelated cleanup, M7-02, UI integration or rendering is performed.
