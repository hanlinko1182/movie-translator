# Auto Story Complexity Duration Engine — M1-D

## Scope and entry point

`planStoryDuration(source, script, inventory, policy, authority)` is exported by `lib/storyline/duration.ts` and implemented in `duration-engine.ts`. It reads the selected M1-C foundation's current ephemeral verification view, then performs a pure deterministic calculation from that captured view and validated immutable inputs. It issues no receipt and modifies no source, script, subtitle, QC, TM or ledger state. No instance, route, UI, storage adapter, worker or provider is installed. Existing M1-A duration contracts remain unchanged.

`readHumanSourceVerification` is a read-only M1-C bridge registered by foundation instance identity in a private WeakSet. A lookalike authority, supplied review/status object, JSON receipt or provider assertion cannot substitute for the instance-owned ledger. Capture checks exact project/movie, source and script bindings and existing character/relationship/inference rules. Currentness remains **relative to the supplied immutable source**, not a live database/media reservation. M1-B live dependency acquisition/revalidation and durable receipt lookup still require future authorized persistence work.

## Inventory and admission

The strict, canonical, bounded inventory contains:

- `events`: up to 200 existing `StoryEvent` contracts (ACTION, CONFLICT, DECISION, OUTCOME, RELATIONSHIP_CHANGE), with exact source bounds, essential claim IDs and causal predecessor IDs. Unknown fields, duplicate IDs, bad timing, nonexistent claims and invalid causal links fail before calculation.
- `characterArcs`: up to 200 candidate arcs, each with an existing character ID and 1–12 event/claim-backed candidate states. Every state claim must belong to that event and character. Candidate status does not establish a verified arc.
- `visualIntervals`: up to 400 server-owned candidate source ranges with ID, exact selected movie ID, source SHA-256, integer millisecond bounds, AVAILABLE/UNAVAILABLE and associated event IDs. Wrong source identity, out-of-bounds ranges and missing event IDs fail. No client file paths, clips or FFmpeg options are accepted.

Inventory input is capped at 512 KiB; output at 1 MiB. Arrays/ref sets are canonically ordered, reference duplicates normalized and original source/script Unicode never rewritten. The returned candidate inventory retains event aliases, provisional events, candidate arcs and unavailable visuals. A visual range is a bounded assertion about the captured source, **not proof of current file existence, decoding, clip suitability or human clip approval**. No probing or video processing occurs here.

## Supported versus provisional

An event is supported only if **every essential claim** is currently SOURCE_VERIFIED through M1-C and every causal predecessor is supported. PENDING, INCONCLUSIVE, UNSUPPORTED, REVOKED, STALE and superseded success cannot contribute. Translation APPROVED, MANUAL origin, clean QC and AI acceptance never establish verification. A superseded receipt cannot be selected to bypass the latest disposition; an inference loses support when its observed-basis receipt changes or is revoked.

`supportedEvents` counts structurally distinct supported event candidates after exact deduplication. `provisionalEvents` counts every retained distinct candidate that is not eligible, including known unsupported/revoked/stale material; each result reports claim states and blocked predecessors. The term is a planning bucket, not permission to accept an unsupported claim. `submittedEvents` includes all aliases; `distinctCandidates` excludes exact aliases. Unsupported/provisional material adds zero to all complexity and coverage features.

Exact event identity uses kind, bounds and the sorted essential claim-reference set. Duplicate candidates count once and retain their IDs. Causal prerequisites across aliases are unioned, so an alias cannot discard a required provisional predecessor. Repeated anchors across claims/events do not multiply coverage. Different claims, interpretations or event kinds sharing anchors are retained in `semanticDuplicateReviewGroups`; shared anchors do not prove equivalence, and this engine does not understand synonyms or verify semantic event uniqueness. The structural counts and provisional budget remain subject to explicit inventory/semantic review and human selection before downstream planning.

## Features and coverage

- **E:** distinct eligible events.
- **A:** characters with a candidate arc containing at least two nonoverlapping supported source-evidence states/decisions. Use the actual state claims' source intervals, not broad event envelopes. Repeated temporal states do not create an arc. Multiple qualifying arc candidates for one character remain visible but contribute one character arc, a conservative anti-inflation rule pending reviewed semantic arc identities.
- **C:** eligible CONFLICT plus DECISION events, once per distinct event. The separate ID lists remain visible.
- **R:** eligible RELATIONSHIP_CHANGE events. Existing script validation requires correct relationship endpoints and their own permitted character/relationship anchors; IDs cannot borrow generic plot evidence. Output identifies the supported relationship references.
- **Q:** union of actual source-segment/scene-intersection intervals for essential claims in counted events divided by real captured runtime. Whole-scene lengths and repeated/overlapping segments do not inflate coverage.
- **V:** union of AVAILABLE source ranges intersected with the supported evidence of their associated events. Missing/unavailable ranges, unverified events and ranges outside supporting evidence add zero. Duplicate/overlapping ranges count once; `suitabilityApproved: false` is explicit.

Coverage uses half-open integer millisecond intervals. Fractions are represented as exact numerator/denominator pairs. Source bounds and hashes are revalidated; no scene count, filename, English word count or inferred video/voice duration enters the formula.

## Explicit `auto-story-v1` configuration

There is **no installed numeric default**. Every invocation must supply a complete configuration with `id: auto-story-v1`, `coefficientSetId`, `calibrationId: null`, `calibrationStatus: UNCALIBRATED`, all caps/weights/evidence factors and duration limits. Non-null calibration or an APPROVED status is rejected; supplying an ID cannot claim calibration. The architecture example below exists only in synthetic test fixtures:

| Setting | Uncalibrated architecture example |
| --- | --- |
| Caps E / A / C / R | 40 / 6 / 10 / 6 |
| Per-unit weights E / A / C / R | 6,000 / 10,000 / 6,000 / 5,000 ms |
| Evidence base / addition / full coverage | 650 / 350 / 150 permille |
| Absolute cap / runtime cap | 720,000 ms / 200 permille |
| Soft floor / runtime floor | 30,000 ms / 80 permille |

Policy limits enforce positive contribution caps ≤200, positive weights ≤60,000 ms, permille values ≤1,000, a positive evidence threshold/base with base+addition ≤1,000, duration limits ≤3,600,000 ms and coherent floor/cap configuration. These are computational safety ceilings, not recommended production tuning values.

For explicitly configured capped feature counts `e,a,c,r`:

```text
needMs = eventWeight*e + arcWeight*a + conflictDecisionWeight*c + relationshipWeight*r
factor = base/1000 + addition/1000 * min(1, Q / (fullCoverage/1000))
hardCapMs = min(maxBudgetMs, floor(runtimeMs*runtimeCapPermille/1000), Vms)
planningCapMs = floor(hardCapMs * factor)
softFloorMs = min(configuredFloorMs, floor(runtimeMs*runtimeFloorPermille/1000), planningCapMs)
suggestedBudgetMs = min(planningCapMs, max(softFloorMs, needMs))
```

BigInt rational arithmetic computes the evidence factor and cap division without floating-point drift, using constructors compatible with the existing TypeScript target. Only final millisecond caps are rounded down. Serialized outputs contain safe integers, not BigInt or floating-point JSON values. Full exact policy numbers participate in the versioned input hash even when `coefficientSetId` is reused. Hash inputs also include engine identity, exact source/script/context identity, M1-C verification dependency, and canonical inventory; changed verification or context invalidates the plan.

- E=0 → PENDING_SOURCE_VERIFICATION, no supported floor/cap/budget.
- E>0 and V=0 → INSUFFICIENT_VISUAL_COVERAGE, no budget or invented clips.
- Positive evidence/visuals but cap rounds below 1 ms → INSUFFICIENT_SUPPORTED_MATERIAL, no fabricated minimum.
- Otherwise → BUDGET_AVAILABLE, with `floor ≤ suggested ≤ cap`. This is an uncalibrated editorial **maximum useful planning budget**, not an output target or approval. Useful narration below the soft floor is valid.

The result exposes raw/capped features, supported/provisional IDs and counts, exact duplicate aliases, semantic-review groups, verified arc candidates, conflicts/decisions/relationship changes, union coverage intervals, need/factor/caps/floor/budget, input hash, full policy and limiting factors. Factors explain missing support/visuals, sparse evidence, runtime/absolute/visual caps, contribution caps and duplicate review. UNCALIBRATED_POLICY and TTS_DURATION_UNAVAILABLE are always explicit.

## Calibration and persistence prerequisites

`estimatedVoiceDurationMs` is always null. No TTS rate, filler, time stretching, repeated footage, freezing, trimming or automatic content truncation is implemented. Measured decoded TTS durations must supersede future estimates. Provider/voice-specific Myanmar calibration, coefficient approval, semantic event/arc review and beat-level allocation remain separate decisions; this milestone creates no clip plan or timeline.

Before Prisma persistence, separately authorize immutable snapshot/script and append-only verification storage, authoritative current-source acquisition, transactional latest-receipt/revocation fencing, persisted planning inventory/visual availability provenance, approved policy registry and immutable duration-plan identity. Store exact counts, intervals, policy/hash and review dependencies; recheck them at approval/downstream use. Keep historical plans and invalidate current eligibility on source/verification/policy changes rather than rewriting records. No migration, database write, provider call, API, UI or worker is included in M1-D.
