# M6-01 — Source-grounded Character and Psychology Highlights Foundation

Date: 2026-10-19. Baseline: `recovery/m9-studio` at `d56a893dad4e898a49282941cc5d692b6281fc31`, initially clean.

## Scope and verdict

**M6-01 PASS, synthetic-only.** This milestone implements a pure, deterministic, **SYNTHETIC_ONLY** planning library and executable tests. It introduces no UI, routes, sessions, database adapter, persistence, worker, media extraction, audio generation or renderer. All required final verification below passed against the expected baseline; no production capability was activated.

## Module inventory and public API

All files are new. Existing M1–M5 implementations and expiry tests are unchanged.

| File | Responsibility |
| --- | --- |
| `lib/storyline/highlights/contracts.ts` | Versioned input/source/audio/candidate/rubric/policy/decision/plan contracts, resolver interface, restrictions and safe error codes. |
| `lib/storyline/highlights/input.ts` | Strict JSON capture and input/source/policy parsing; reuses existing narration-reference parsing. |
| `lib/storyline/highlights/resolution.ts` | Independent synthetic capture acquisition, M1–M4 revalidation, exact R4 identity and section mapping, currentness comparison. |
| `lib/storyline/highlights/candidates.ts` | Evidence intersections and connected interval unions, exact source/evidence/claim mapping, deterministic fixed scoring. |
| `lib/storyline/highlights/planner.ts` | Budget/coverage/overlap selection, source and recap ordering, gaps, canonical hashes, complete replay validation. |
| `lib/storyline/highlights/index.ts` | Public contracts and planning/parsing exports. |
| `tests/storyline/highlights/fixture.ts` | Isolated synthetic source, M2 result, M3 findings, M4 draft, optional R4 edit and resolver fixtures. |
| `tests/storyline/highlights/foundation.test.ts` | Focused functional/adversarial/boundary tests. |
| `docs/STORYLINE_M6_01_HIGHLIGHTS_FOUNDATION.md` | This implementation and acceptance record; M6-02 handoff. |

Public functions:

```ts
parseHighlightInput(value: unknown): Immutable<HighlightInput>
parseHighlightPolicy(value: unknown): HighlightPolicy

generateHighlightPlan(
  value: unknown,
  resolver: SyntheticHighlightResolver,
): HighlightPlan

validateHighlightPlan(
  value: unknown,
  expectedInput: unknown,
  resolver: SyntheticHighlightResolver,
): HighlightPlan
```

The principal interfaces implemented in `contracts.ts` are:

```ts
type HighlightSourceReference = {
  schemaVersion: "story-highlight-source-v1";
  narration: NarrationReference; // Reused M5 v2 reference, not a voice authority.
  media: { sha256: string; bytes: number; durationMs: number };
  currentness: {
    sourceRevision: number;
    narrationRevision: number;
    observedAt: string;
  };
};

type HighlightInput = {
  schemaVersion: "story-highlight-input-v1";
  execution: "SYNTHETIC_ONLY";
  source: HighlightSourceReference;
  policy: HighlightPolicy;
  audio: HighlightAudioReference | null;
};

interface SyntheticHighlightResolver {
  resolve(scope: Immutable<NarrationReference["scope"]>): HighlightResolution;
}
```

`SyntheticHighlightCapture` supplies the complete `SyntheticNarrationContext`, original `NarrationDraft`, exact stored-original identity, optional full R4 edited payload/hash and independent current source reference. The request cannot supply candidates, AI scores, roles or an authentication bootstrap. A fixture owner must inject the resolver independently of the request. This is a consistency boundary for tests; it is not authentication, proof of database existence or a production source reader.

Resolution distinguishes `CAPTURED_SYNTHETIC` from `STALE_SOURCE`, `STALE_MEDIA`, `CHANGED_CANDIDATE`, `CHANGED_NARRATION`, `MISSING_EVIDENCE`, `UNAUTHORIZED`, `UNSUPPORTED`, `INSUFFICIENT_INFORMATION` and `INVALID_CAPTURE`. Invalid resolver exceptions become a safe `UNSUPPORTED` error. Current source/media/narration identities and revision observations must match both the independently validated capture and the request. The revisions/time are fixture observations; no live database fence is claimed.

## Reused foundations and hash domains

The implementation reuses `validateSyntheticNarrationDraft`, which revalidates M1 source hashes/admissions, the M2 definitive result, M3 evidence ownership/inference basis and the exact M4 narration projection/claim lineage. `referenceFromM4` and `referenceFromR4` retain the exact `story-narration-draft-v1` versus `story-edited-narration-v1` identity and original lineage. R4 section IDs/order and paragraph counts must match the original section mapping; saved edits remain semantically unreviewed.

The installed Next.js data-security guide was read. All executable planner modules use `server-only`, with no app or browser integration. Existing `fingerprintSourceMedia`/render snapshot identity and interval patterns were inspected; the planner consumes the existing SHA-256/bytes/duration shape and calls no fingerprint or media subprocess.

New versioned domains are:

- `story-highlight-input-v1`: exact accepted input hash.
- `story-highlight-source-v1`: source-reference schema.
- `story-highlight-candidate-v1`: candidate schema and local deterministic candidate ID hash domain.
- `story-highlight-rubric-v1`: fixed scoring rubric schema.
- `story-highlight-policy-v1`: selection policy schema.
- `story-highlight-plan-v1`: complete immutable plan hash domain.
- `story-highlight-synthetic-capture-v1`: isolated capture schema.
- `story-highlight-synthetic-audio-ref-v1`: optional unverified fake-audio reference schema.

The existing `canonicalJson`/`contractHash` functions provide domain-separated SHA-256, safe integer serialization and rejection of getters, cycles, unsupported objects, sparse arrays, invalid Unicode and negative zero. Input/plan wire values are bounded at 2 MiB; capture values at 24 MiB, with the inherited M1–M4 limits still enforced. Strict parsers reject unknown fields, unsupported versions, malformed IDs/hashes, duplicate/noncanonical coverage IDs, unsafe numbers and unsupported policies.

Candidate IDs are local to a bound plan input and are not persisted/global identities. The **plan** binds the exact project/movie/studio, source snapshot ID/content/context/dependency/binding hashes, media fingerprint/duration, M3 candidate ID/hash and full analysis/result dependencies, M4/R4 identity and original lineage, currentness observations, policy/rubric, evidence, factors, selection and ordering. Hash consistency alone proves none of authorization, storage existence, semantic truth or live currentness.

## Candidate extraction and source intervals

Candidates derive only from revalidated M3 findings and M1 evidence. Each includes the finding ID, original M4 claim IDs, characters/relationship, exact statement, classification/category, confidence, uncertainty, qualification, observed-basis IDs, exact supporting evidence and contradictory finding references/explanations. Evidence includes exact M1 scene/transcript IDs, source anchors and Chinese source text.

For each evidence reference, reuse `assertAnchor` and intersect its transcript interval with its referenced scene interval. The candidate uses only this intersection. Merge touching/overlapping intersections for the same finding into connected unions; disconnected intervals yield separate candidates. Never bridge an unsupported gap or use the M4 beat's enclosing interval to fabricate footage. Selected intervals satisfy `0 <= startMs < endMs <= media.durationMs`, in integer milliseconds. Point-only evidence has no playable source interval and cannot be selected; inherited M4 validation may reject such a draft earlier.

Observed behavior/quotes remain observed evidence. Inferences retain their M3 observed basis and cautious qualification; they are never relabeled as directly observed motivations. Contradictions remain explicit and reduce scoring. Missing, stale, wrong-owner, cross-movie and conflicting identity references fail validation rather than generating replacement content.

## Fixed character/psychology rubric

Each factor is an integer from 0 to 3. Total is the sum of factor × fixed weight, bounded by 66. The caller cannot supply scores or change weights.

| Factor | Weight | Exact rule |
| --- | --- | --- |
| Evidence reliability | 4 | OBSERVED = 3; INFERRED = 1. This is structural evidence class, not human-verified truth. |
| Development | 3 | DECISION/CONSEQUENCE/CONFLICT = 3; BEHAVIOR/ACTION/RELATIONSHIP = 2; other = 1. |
| Behavior/personality | 2 | BEHAVIOR/ACTION/TRAIT = 3; MOTIVATION/DECISION = 2; other = 1. |
| Relationship | 2 | An exact validated relationship subject = 3; otherwise 0. |
| Narrative importance | 2 | DECISION/CONSEQUENCE/CONFLICT = 3; other = 1. |
| Confidence | 2 | LOW/MEDIUM/HIGH = 1/2/3, subject to inherited M3 evidence confidence ceilings. |
| Certainty | 2 | NONE/POSSIBLE/COMPETING = 3/1/0. |
| Contradiction safety | 3 | Recorded contradictory interpretation = 0; none recorded = 3. Absence of a record is not proof of no contradiction. |
| Coverage diversity | 1 | Subject represented in at most two M3 findings = 3; otherwise 1. Counts character overlap or the exact relationship. |
| Source interval availability | 1 | Positive source-grounded interval = 3; point interval = 0. |

Every candidate exposes factors, total, evidence and reason codes such as `QUALIFIED_INFERENCE_NOT_OBSERVED`, category/confidence/uncertainty codes, contradiction penalty and subject repetition. Development/narrative weights are transparent category heuristics, not semantic proof that a character actually developed. An inferred decision can rank highly for planning significance while retaining its lower reliability and explicit inference label.

## Selection, sequencing and replay

The strict policy sets `maxClips` (1–64), positive min/max clip duration, positive total source-duration budget, required sorted character/relationship IDs, `overlap: REJECT`, `transition: CUT_ONLY` and independent `presentation: SOURCE_CHRONOLOGY | SCORE_ORDER`. Reject reversed duration bounds, a total budget below minimum duration, zero clip count and unsupported policies. Real source availability can still make a valid policy infeasible; that produces explicit `INSUFFICIENT_INFORMATION` with missing coverage, rather than fabricated clips.

Selection is deterministic greedy selection: prioritize candidates that cover the most still-uncovered required subjects, then descending score, ascending source start/end and binary code-unit candidate ID. This is not an optimal set-cover solver. Each candidate receives a `SELECTED` or `EXCLUDED` decision and exact reason: rubric selection, missing narration claim, no source interval, min/max duration, duplicate interval, overlap, clip count or duration budget. Duplicate/overlapping alternatives remain inspectable but never enter the selected plan together. Durations sum only selected disjoint source intervals.

`sourceOrder` is canonical source chronology. `presentationOrder` independently follows source chronology or descending score; the source times remain unchanged. Between consecutive selected source intervals, positive omissions appear as `INTENTIONAL_SOURCE_OMISSION` gaps. CUT_ONLY adds no audio/transition duration or filler. No media is concatenated.

`validateHighlightPlan` is the strict parser and complete replay validator. It requires independent expected input and a fresh fixture resolution, regenerates the complete plan, checks its hash and exact canonical equality, and returns the independently generated frozen result. Manipulated scores, factors, evidence, classification, times, selected IDs, order, budgets, gaps, coverage, unknown fields or duplicates fail even when an attacker recomputes the outer hash. Replay errors do not trigger retries, provider calls or persistence.

## M5 dependency and synthetic boundaries

The plan works with `audio: null`. Optional fake audio is a **REFERENCE_ONLY** structural reference: exact narration reference, artifact/plan hashes and mandatory `FAKE_ONLY`, `SYNTHETIC_BYTE_INTEGRITY_ONLY`, `speech: NOT_VERIFIED` and existing fake-voice restrictions. It is not a receipt/byte verification API or proof of artifact existence. Audio duration is not accepted and cannot affect clip selection, budget or ordering. Future approved references and alleged approval/voice eligibility are rejected.

Every result declares SYNTHETIC_ONLY, NOT_PERSISTED, humanApproval NONE, sourceVerified false, real-TTS/publication eligibility false, original movie audio EXCLUDED and voice synchronization UNSUPPORTED. No production session, route, Server Action, database write/migration, worker, network/provider call, FFmpeg/media subprocess, source download, audio retention, TTS, approval issuance, video rendering or MP4 creation was added. No UI changed.

## Verification

Logs are owned by this milestone at `/tmp/movie-translator-m6-01-JcNKEO/`; earlier fixture-debug output is under `/tmp/m6-01-*.log`. The final commands ran from the project root. Database regressions created only newly owned disposable PostgreSQL clusters and private fake storage; the application datasource was never used. Local test/browser/build subprocesses ran with the execution permission required by the sandbox. No dependencies were installed.

| Final verification | Actual result |
| --- | --- |
| Focused M6 command below, including final fake-audio privilege-denial assertions | **70/70 PASS**, 0 fail/skip (`m6-focused-final.log`). |
| Consolidated serial M1–M6, R4/M9 and applicable Recap/video-render server tests | **1,252/1,252 PASS**, 0 fail/skip, 490.07 seconds (`server-regressions.log`). |
| All relevant UI component tests | **43/43 PASS**, 0 fail/skip (`ui-components.log`). |
| All Studio/legacy Chromium suites | **4/4 PASS**, 0 fail/skip; widths 1440/1024/390 (`chromium.log`). |
| `pnpm lint` | **PASS**, exit 0 (`lint.log`). |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0 (`tsc.log`). |
| Dummy-datasource `pnpm exec next build --webpack` | **PASS**, Next.js 16.3.6; compiled/type-checked, all 12 static pages generated (`webpack.log`). |
| Fresh source/bundle/route audit and owned-file secret-pattern scan | **PASS**, 71 client chunks, zero M6/fake-adapter markers, zero new voice/audio/highlight routes among 38 existing API routes, zero Node/Edge Server Actions, zero secret-pattern matches (`security-audit.json`). |
| Working/staged whitespace and explicit staged-file review | **PASS**; only the nine files listed above are owned by this milestone. |

The consolidated command executes each listed file once. The standalone final 70-test M6 run repeats cases already inside the 1,252. The final acceptance commands therefore completed **1,369 passing executions representing 1,299 distinct cases**: 1,252 + 43 + 4, with the extra focused 70 accounted for as a rerun. Earlier development checks are not added to these acceptance totals. No M4 expiry assertions were changed: **16/16 passed**, including all six forced-expiry zero-send/sticky-UNKNOWN repetitions and all six positive actual-wire/result-retention repetitions across M1-first/M1-last, plus four expiry/permit deadline controls. The historical timing miss did not recur; its root cause remains unknown.

Historical count correction: the prior M5 acceptance document treated its separate 119-test R4/M9 focused run as overlapping its root/jobs server glob. Those R4 files were not in that glob. This milestone includes them explicitly once in the consolidated command; the current 1,299 distinct total is derived from the actual completed run, not the prior report.

Server commands (the consolidated run also uses the shown unreachable dummy URL):

```sh
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/highlights/*.test.ts

DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts \
  tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts \
  tests/storyline/durable-fake/*.test.ts tests/storyline/highlights/*.test.ts \
  tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts \
  tests/storyline/studio-versions/postgres.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts

node --import tsx --test --test-reporter=spec \
  tests/storyline/editor-saving/component.test.tsx \
  tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx \
  tests/video-render/export-ui.test.tsx

PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave \
node --test --test-concurrency=1 tests/recap/recovery-browser.test.mjs \
  tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs

pnpm lint
pnpm exec tsc --noEmit
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  pnpm exec next build --webpack
git diff --check
git diff --cached --check
```

The source audit scans production app/components/workers/scripts for M6/test-adapter imports or schema markers and the freshly built client chunks for M6 schemas/factories, disposable helpers and M5 fake-lifecycle markers. It also checks route paths and the Server Action manifest. The focused test walks the M6 runtime import graph, excluding erased type imports, and rejects filesystem/network/media subprocess dependencies. Chromium reports zero production API/provider calls during local editor interactions, exact save/read-back, unchanged original draft, and no responsive overflow. No source or UI file outside this milestone was changed.

The focused tests cover exact lineage/media boundaries, connected/disconnected scene/transcript membership, observed/inferred psychology, development weights, contradictions/missing evidence, deterministic repeatability/ties, coverage/budgets, duplicate/overlapping intervals, source versus presentation order/gaps, rehashed forgery, changed currentness/identity, M4/R4 domain separation, fake-audio ineligibility, UNKNOWN exclusion, invalid Unicode/unsafe numbers, and production/runtime I/O dependency absence.

## Known limitations and M6-02 handoff

- This is synthetic structural planning. Fixture hashes/currentness do not prove live data existence or authorized access; scores do not establish psychological truth or human approval.
- Greedy required coverage may miss a feasible alternative combination under overlap/budget constraints. It reports insufficiency honestly; it does not claim global optimality.
- Semantic changes in R4 prose are not reanalyzed. Highlight evidence remains the exact original M1/M3/M4 lineage and the R4 version stays unapproved.
- Fake audio references carry no proof of durable ownership, validated bytes or speech quality; they never synchronize video.
- The historical M4 expiry positive-control timing miss is not considered repaired merely by a later passing run. Keep its assertions unchanged and investigate any recurrence.

**M6-02 is separate and unimplemented.** Before Studio UI integration, design and implement a test-only immutable plan repository with exact scope and independent source/candidate/narration capture, restricted disposable grants, revision/currentness fencing through transaction commit, immutable read-back/history, scoped idempotency, duplicate/conflict behavior, rollback and unknown-commit-result recovery without unsafe automatic retries. Preserve distinct original/edited narration domains and permanent synthetic/no-approval restrictions. Use newly owned disposable PostgreSQL only; no production datasource, route, session bootstrap or real provider. Validate stored plans by replay against independently acquired expected inputs; a self-consistent outer hash is insufficient. UI work follows that persistence/security acceptance and requires separate authorization. Media extraction and voice synchronization are later independent milestones.
