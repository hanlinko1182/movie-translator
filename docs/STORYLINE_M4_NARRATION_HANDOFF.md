# M4 Myanmar narration handoff — M3-05

## Ready implementation boundary

M4-01 can implement bounded provisional Myanmar narration contracts, parsing and a deterministic fake composer against current, persisted M3 candidates. It must remain explicitly invoked, server-only and disposable-only. M3 acceptance is not permission to activate a provider, authentication, spending, approval, a production worker or a live migration.

The exported TypeScript handoff is `lib/storyline/narration/contracts.ts`, version `story-narration-draft-v1`. These are definitions only: no runtime parser, generation, persistence, script approval or HTTP endpoint is installed by M3-05. TypeScript shape never establishes trust. M4-01 must reject untrusted payloads at runtime before using them.

## Narrative product contract

The output is natural Myanmar narration about observed character behavior, qualified motivations, psychological tension, choices, relationships and consequences. Plot facts supply context; shortening a plot summary alone is insufficient. A single scene may yield several ordered beats. An empty or unusable finding inventory must return an explicit blocked/no-draft outcome. Do not invent a character arc, emotion, diagnosis, event, speaker identity or causal link to fill a section or duration target.

- `beats` reuse M1 `StoryBeat` and `StoryClaim` directly. Exact Myanmar paragraphs live once in `beat.narration[].text`, each with its essential claim IDs. Claims retain Chinese anchors, character/relationship ownership, advisory translation row hashes, observed/inferred classification, confidence, observed basis and cautious Myanmar qualification.
- `sections` give each beat its ordered editorial heading and focus: behavior, qualified motivation, psychological tension, decision, relationship change, consequence or resolution. There is one section per beat in the initial contract. Source intervals remain source bounds, not an output playback timeline. Narrative order may differ from chronology only with explicit language that does not invent causality.
- `paragraphs` annotate each `(beatId, paragraphIndex)` with observed-only, qualified-inference, competing-interpretations or insufficient-evidence status, pacing intent and an optional planning duration. An insufficient-evidence marker is a blocker/omission instruction, not permission to narrate an unsupported assertion. Inference qualification must occur in the spoken paragraph, as required by the existing M1 script validator.
- `claimLineage` binds every narration claim to the selected M3 findings or explicitly identifies a new human claim. IDs and anchors must be validated against the exact candidate/source; a model cannot assert `NEW_HUMAN_CLAIM`. A paraphrase or human edit changes claim content and needs fresh source comparison. Structural lineage alone proves neither entailment nor Chinese semantic meaning.
- Draft origin is explicit: `SYNTHETIC_TEST`, `MODEL_DRAFT`, or `HUMAN_EDIT`. The immutable analysis dependency preserves candidate origin through edits. Synthetic ancestry can never become approved material by changing the draft origin or passing another validator.

## Provenance acquisition and recipe identity

Load the selected Project/Movie/Studio and persisted M1 snapshot, then use the restricted M3 read and M3-02 validator. Require `VALIDATED_CURRENT`, `PROVISIONAL_CANDIDATE`, exact canonical candidate hash and a definitive resolved M2 `COMPLETED` result. Recheck source, translation/QC, media, Studio revision and applicable script before use and again under the publication fence.

`NarrationSourceBinding` retains exact snapshot/content/context/dependency/binding hashes, Studio revision and media SHA-256. `NarrationAnalysisDependency` retains candidate ID/hash/version/origin, task/generation, result ID/hash, submission ID, recipe hash and fixed profile-definition hash. The existing restricted M3 public read does **not** return all these private fields. Acquire result/submission/recipe identity from `createPersistedEvidenceCandidateValidator().validate()` and the fixed trusted profile revalidated there; never fill missing fields from caller JSON. A future persist gateway must independently recheck this binding.

The M2 completion marker is not the candidate payload. `parentResultHashes` alone cannot identify the separate M3 candidate bytes. Before durable `PLAN_BEATS` or `DRAFT_SCRIPT` admission, implement an additive, versioned recipe dependency that includes the exact candidate ID/hash and enforces its result/source relationship. Do not place a candidate hash into a field defined as an M2 result hash. Pure M4-01 fake composition can operate without admitting another task; real/durable drafting cannot skip this dependency implementation.

## Duration and pacing

`NarrationDurationTarget` has either an explicit unavailable reason with null budget/dependencies, or a supported planning budget bound to the M1 duration plan's input hash, current verification dependency hash and full explicit `AutoStoryPolicy`. A future service must resolve/recompute that plan for the exact source and script/claim projection; supplied hashes or a supplied budget are not authoritative. The existing policy remains uncalibrated. A supported test budget is an editorial planning ceiling, not a production-approved coefficient set or measured speaking duration.

No current human verification means no supported duration budget. Provisional translation-only claims and synthetic analysis contribute zero supported events/arcs. Do not infer Myanmar speech rate from English word counts, add filler, repeat footage, truncate meaningful narration or accelerate audio to satisfy a target. Paragraph targets remain null without a current supported plan; when available, their sum must stay within its budget. A future measured TTS artifact supersedes planning estimates and binds the exact approved text/voice; no TTS artifact or duration exists in this handoff.

## Immutable editing and approval distinction

Every edit produces a parent-linked draft version and new domain-separated canonical SHA-256. Preserve exact Unicode, ordered paragraphs/sections and all dependency hashes. Use current M1 safety ceilings: 512 KiB total payload, 60 beats, 12 claims/paragraphs per beat, 1,200 Unicode code points across a beat's narration and 36,000 total narration code points. Editorial headings, lineage and annotations require additional bounded limits in M4-01 (heading ≤160 code points, one section per beat, one annotation per paragraph, one lineage entry per claim, ≤12 finding references per claim). Reject unknown fields, duplicate IDs, malformed Unicode, missing coverage, bad ordering and invalid references; never silently truncate.

Draft input always has `review.approval: PROVISIONAL`; `UNREVIEWED`/`NEEDS_HUMAN_REVIEW` expresses editorial state. `NarrationReviewView` is a proposed server-derived read shape for future `PROVISIONAL`/`APPROVED` display. Its approval binding is not a client request, a real receipt or an implemented approval mechanism.

M1 currently persists draft script versions and human source-verification receipts separately. There is no implemented Studio script approval ledger. M4 must not relabel a synthetic draft as M1 MODEL/HUMAN merely to fit the existing schema, discard its analysis identity, or add approval fields to immutable M1 payloads. Durable narration metadata/lineage and script approval need a separately authorized additive persistence implementation.

Approval requires current exact draft/source identities, trusted human Chinese-source verification for every material narrated claim, current inference basis, and disposition of all blocking evidence/psychology and Myanmar review findings. Ownership/reference violations cannot be waived. AI review only proposes findings. Subtitle approval, MANUAL provenance, clean QC or candidate validation do not authorize narration. Script approval never modifies subtitles, QC or TM. Editing or source/context/verification changes invalidate approval eligibility while preserving historical versions. Synthetic lineage is ineligible even if it is structurally valid.

## Concrete synthetic payload outline

This abbreviated JSON is a contract illustration, not persisted data or a valid fully populated payload. Hash/ID placeholders must be resolved from authoritative services; omitted M1 claims/anchors must never be fabricated.

```json
{
  "schemaVersion": "story-narration-draft-v1",
  "id": "synthetic-draft-1",
  "version": 1,
  "parentDraft": null,
  "language": "my",
  "style": "CHARACTER_PSYCHOLOGY",
  "durationMode": "AUTO_STORY_COMPLEXITY",
  "translationContextPolicy": "ALL_CURRENT",
  "origin": "SYNTHETIC_TEST",
  "source": "exact NarrationSourceBinding acquired on the server",
  "analysis": "exact NarrationAnalysisDependency acquired on the server",
  "beats": "M1 StoryBeat[] with Chinese-grounded claims and Myanmar paragraphs",
  "sections": [{"beatId": "beat-0", "order": 0, "heading": "ဆုံးဖြတ်ချက်၏ နောက်ကွယ်", "focus": "QUALIFIED_MOTIVATION"}],
  "paragraphs": [{"beatId": "beat-0", "paragraphIndex": 0, "uncertainty": "QUALIFIED_INFERENCE", "pacing": {"intent": "REFLECTIVE", "targetDurationMs": null}}],
  "claimLineage": [{"claimId": "claim-0", "candidateFindingIds": ["synthetic-inference-0"], "change": "PRESERVED_INTERPRETATION"}],
  "duration": {"status": "UNAVAILABLE", "reason": "PENDING_SOURCE_VERIFICATION", "planInputHash": null, "verificationDependencyHash": null, "policy": null, "budgetMs": null},
  "review": {"status": "NEEDS_HUMAN_REVIEW", "approval": "PROVISIONAL"}
}
```

For example, a paragraph containing “စိုးရိမ်မှုကြောင့် ဖြစ်နိုင်သည်။” must reference the inferred claim, its exact cautious qualification and permitted observed basis. This sentence alone is not evidence that a character is worried. A fake fixture remains synthetic and semantically unverified.

## M4-01 implementation order and acceptance

1. Implement the strict pure draft parser/hash and M1 beat/claim projection, preserving synthetic lineage, exact Unicode and bounded editorial metadata. Test malformed/oversized JSON, forbidden approval assertions and at-limit text.
2. Implement an explicitly invoked fake composer reading current durable M3 identity through restricted services. Map exact finding IDs to provisional claims and multiple beats in one scene. Include observations, cautious interpretations and consequences only where the source supports their references. No paid task or M1 script promotion is needed for this step.
3. Prove current/stale/cross-scope/UNKNOWN behavior, claim and relationship ownership, exact paragraph coverage, stable hashes, duplicate recovery, source drift before publication, no budget without current verification and no approval side effects in disposable exported-service tests. Reuse the M3-05 two-task regression.
4. Continue to durable narration persistence and human review only under their explicit implementation scope. Add candidate dependencies to durable recipes and preserve original M2 checkpoint/UNKNOWN invariants before any new fake durable drafting task. Production provider/profile, quote limits, authenticated spending, restricted deployment and script approval remain separate activation requirements.

No new UI is part of M4-01. Later integration belongs in the existing Recap Studio Script/AI Review panels, preserving selected movie and query navigation. Voice, highlights and export remain honest unavailable states until implemented.
