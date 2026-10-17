# M4-01 Myanmar narration contracts and synthetic composer

## Implemented boundary

The explicitly invoked exports in `lib/storyline/narration/index.ts` are:

| Export | Behavior |
| --- | --- |
| `composeSyntheticNarration(context)` | Revalidates captured M1/M2/M3 consistency and returns a frozen provisional synthetic draft with a canonical SHA-256. |
| `validateSyntheticNarrationDraft(payload, context)` | Strictly checks schema, bounds, lineage and the exact allowed synthetic rendering. |
| `prepareNarrationSpeechText(draft, context)` | Revalidates draft/hash and projects provider-neutral ordered Myanmar text, expressly ineligible for synthesis. |

All functions are synchronous and pure. There are no database/network/filesystem operations, provider callbacks, workers, routes, environment switches, persistence, spending or approval issuance. Imports are guarded by `server-only`. The existing M1/M2/M3 implementations are reused without modifying their behavior.

The implemented initial policy accepts `SYNTHETIC_TEST`, version 1, no parent, `NEEDS_HUMAN_REVIEW` and `PROVISIONAL` only. The wider handoff types retain future MODEL/HUMAN/version/approval shapes, but this validator deliberately rejects them. It must not be used as a validator for arbitrary model prose or human edits.

## Exact dependency contract and trust

`SyntheticNarrationContext` is a separate server dependency, not a browser/provider body. It requires:

- Immutable M1 source, exact M2 recipe/fixed synthetic profile and M3 validated candidate.
- A separately acquired candidate record binding: candidate ID/hash/schema/origin, task ID/generation, result ID/hash, submission ID, recipe hash and profile definition hash.
- A separately acquired definitive completed/resolved M2 result, exact canonical synthetic completion-marker bytes, request hash and result identity.

`checkSyntheticNarrationContext` reruns `validateEvidenceAnalysisCandidate`, checks candidate wrapper and record hashes, recomputes profile/request identity, and uses the existing M2 `parseStoryFakeResult` parser. It requires SUCCESS, COMPLETED, RESOLVED and VALIDATED_CANDIDATE. UNKNOWN, failed, missing, malformed, mismatched and fabricated extra verification fields fail. Candidate and completion-marker hashes are never interchangeable.

The draft also binds exact Project/Movie/Studio, snapshot ID/content/context/dependency/binding hashes, media SHA-256 and expected Studio revision. Wrong draft scope or source identity fails comparison against the independently validated captured context.

**Trust limitation:** a pure function cannot prove that a supplied candidate ID exists in PostgreSQL, authenticate a server caller, or acquire live source/media freshness. Consistent synthetic fixtures are not durable authority. M4-02 must obtain these inputs through restricted current M3/source/result services and recheck them under a publication fence. A client must never be allowed to provide this trusted context. Nothing in M4-01 installs that server composition or claims live approval/security.

## Narration, grounding and uncertainty

The `story-narration-draft-v1` payload includes explicit `story-synthetic-narration-v1` composer identity. It reuses M1 `StoryBeat`/`StoryClaim` types without relabeling the draft as an M1 MODEL/HUMAN record. One validated finding produces one ordered beat, one section with a stable ID, one spoken paragraph and exact finding-to-claim lineage. A single scene supports multiple beats; scene intervals are not an output timeline.

- Chinese quotations, captured observations, character/relationship endpoints, allowed anchors, confidence ceilings and exact advisory Myanmar translation row hashes pass the existing M3 validator again.
- Claims preserve exact candidate statements, observed/inferred classification, evidence, qualification and observed-basis dependencies. Generic character evidence is not proof of who spoke; dialogue text does not attribute a quote to that character or invent a Chinese-to-Myanmar translation.
- Myanmar templates emphasize behavior, inner motivation, conflicting interpretations, decisions, relationships and consequences where those categories exist. They do not generate missing categories or a complete plot/arc to fill space. Relationship context is labeled `RELATIONSHIP_CONTEXT`, not a fabricated change.
- Inferred statements must already contain Myanmar text. No model or hidden translation converts English fixtures. Spoken inference includes a cautious qualification, and competing interpretations retain explicit alternative-possibility wording. A small deterministic certainty guard rejects explicit phrases such as “သေချာပေါက်”; this is not a complete semantic certainty detector.
- The validator requires the exact synthetic spoken projection. A new event, attributed dialogue, unsupported statement, changed subject, removed caveat or arbitrary prose cannot ride on valid claim IDs. Unknown fields and fabricated SOURCE_VERIFIED/approval assertions are rejected recursively.

Structural grounding and template equality do not prove semantic truth or psychological correctness of the input candidate. A synthetic inference is a test interpretation, not a verified finding about a movie. Future freeform narration needs a separately versioned parser, source comparison and review policy; removing the exact-template check would weaken this milestone's guarantee.

## Bounds, hashing and duration

The existing M1 ceilings remain: 512 KiB payload, 60 beats, 12 claims/paragraphs per beat, 1,200 Unicode code points of narration per beat and 36,000 total. Headings are bounded at 160 code points and finding references at 12 per lineage entry. All findings must fit; empty or oversized inventories fail without silently truncating. Strict schema, array cardinality/order, duplicate beat IDs, integer source intervals, exact section/paragraph/lineage coverage, valid Unicode and safe control characters are checked. Point-only evidence that cannot form a positive source interval is rejected rather than assigned fabricated timing.

Canonical hashing uses the existing exact-Unicode, sorted-object-key serializer and domain-separated SHA-256. Ordered arrays remain significant. Draft IDs bind the analysis dependency and composer version; section/claim IDs bind the stable finding identity. Changing candidate text, source/recipe/result binding or rendering changes the draft hash. Identical captured inputs produce identical immutable outputs. No source or translation text is normalized, trimmed, edited or approved.

The M1 `AUTO_STORY_COMPLEXITY` mode is preserved. No human verification or calibrated Myanmar voice is available to this synthetic composer, so `duration` is unavailable with `PENDING_SOURCE_VERIFICATION`; budget, paragraph target and estimated voice duration remain null. Pacing intent is MEASURED, REFLECTIVE or TENSE only. Supplying a budget, negative/fractional duration or estimate cannot create eligibility. There is no English word-count estimate, invented minimum, filler, audio acceleration or TTS artifact.

`NarrationSpeechText` carries only language, exact draft hash, stable ordered section IDs and Myanmar text. It has `eligibleForSynthesis: false`, `PROVISIONAL_SYNTHETIC_DRAFT` and null estimates. A future Google Gemini or another TTS adapter can consume an approved text contract behind a provider-neutral boundary; no provider, voice configuration, cloning or synthesis request is implemented here.

## Tests and verification

`tests/storyline/narration.fixture.ts` creates synthetic captured M1 evidence, a real pure M2 recipe, an M3-validated candidate and a synthetic completed-result marker. It creates no database row, confirmation, checkpoint or fake send. `tests/storyline/narration.test.ts` exercises public exports, including mutations of exact candidate/task/result/scope/source bindings, forged evidence, relationship endpoints, inference certainty, unsupported text, unknown fields/getters, Unicode, size/timing bounds, canonical hash stability and no approval/provider side effects.

| Check | Result |
| --- | --- |
| M4 focused suite | 33/33 PASS in the final combined run; zero skips/failures |
| Combined relevant M1/M2/M3 and legacy pure regressions | 278/278 PASS, including the 33 M4 tests; zero skips/failures |
| `pnpm lint` / `pnpm exec tsc --noEmit` | PASS / PASS |
| `git diff --check` / `git diff --cached --check` / new-file whitespace | PASS / PASS / PASS |
| Webpack with unreachable dummy datasource | PASS outside sandbox |

The sandboxed focused runner exited before assertions with a generic `test failed`; outside-sandbox execution ran the tests normally. The initial implementation run exposed a strict M2 generation-reference projection mismatch, which was corrected by passing only task ID/generation; the final run above is green. No application database, live migration, real Redis worker, provider request or paid operation is part of this milestone. These are scoped pure regressions, not a new disposable/live database acceptance run.

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/narration.test.ts tests/storyline/evidence-analysis.test.ts \
  tests/storyline/contracts.test.ts tests/storyline/human-verification.test.ts \
  tests/storyline/duration.test.ts tests/storyline/evidence-dto.test.ts \
  tests/storyline/foundation-acceptance.test.ts tests/storyline/jobs/contracts.test.ts \
  tests/recap/response-diagnostics.test.ts tests/recap/recovery.test.ts
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

Files created: `lib/storyline/narration/context.ts`, `synthetic-projection.ts`, `validate.ts`, `synthetic-composer.ts`, `index.ts`, `tests/storyline/narration.fixture.ts`, `tests/storyline/narration.test.ts`, and this implementation document. Files modified: `lib/storyline/narration/contracts.ts` and `docs/STORYLINE_M4_NARRATION_HANDOFF.md`. Existing untracked logs are preserved. No dependencies, application APIs/UI, schemas, environment files or worker bootstraps change.

**M4-01: PASS for pure synthetic composition. M4-02: ready for a separately authorized server-integration task. Production/paid activation remains BLOCKED.**

## M4-02 recommendation

Proceed with server-owned context acquisition and durable provisional narration integration using restricted M3/source/result reads, exact candidate ID/hash dependencies and transactional currentness fencing. Extend durable M2 drafting recipes to bind the separate M3 candidate identity before admitting another task; its completion-marker parent hash alone is insufficient. Keep synthetic lineage explicit and unapprovable. Human editing/approval, freeform semantic/language review, live migration and provider activation require their own authorized implementation scope. No extra review-only submilestone is needed to implement that server boundary.
