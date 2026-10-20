import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import type { StorySourcePayload, StorySourceSnapshot } from "../../../lib/storyline/contracts";
import type { CandidateEvidence, CandidateFinding, EvidenceAnalysisCandidate } from "../../../lib/storyline/evidence-analysis/contracts";
import { validateEvidenceAnalysisCandidate } from "../../../lib/storyline/evidence-analysis/validate";
import { createStoryTaskRecipe, storyTaskGenerationIdentity } from "../../../lib/storyline/jobs/recipe";
import { composeSyntheticNarration } from "../../../lib/storyline/narration/synthetic-composer";
import { validateSourceSnapshot } from "../../../lib/storyline/source";
import { referenceFromM4, referenceFromR4 } from "../../../lib/storyline/voice/foundation/reference";
import { STUDIO_EDIT, unapprovedEdit, type EditedVersionPayload } from "../../../lib/storyline/studio-versions/contracts";
import { HIGHLIGHTS as H, type HighlightInput, type SyntheticHighlightCapture, type SyntheticHighlightResolver } from "../../../lib/storyline/highlights/contracts";
import { narrationFixture } from "../narration.fixture";
import { date, scope } from "../fixtures";

export function highlightsFixture(options: { raw?: (raw: StorySourcePayload) => void; candidate?: (c: EvidenceAnalysisCandidate, s: StorySourceSnapshot) => void; edited?: boolean } = {}) {
  const base = narrationFixture(true), raw = base.raw;
  for (const c of raw.characters) c.evidence = raw.transcript.segments.map(s => ({ anchor: { movieId: raw.movieId, transcriptId: raw.transcript.id, sceneSequence: 0, segmentSequence: s.sequence },
    confidence: "LOW", evidenceText: `${c.name}行为 ${s.sequence}`, inference: "" }));
  raw.relationships[0].evidence = [{ ...raw.characters[0].evidence[4], evidenceText: "两人合作" }];
  raw.preparation!.observations = raw.characters.flatMap(c => c.evidence.map((e, i) => ({ id: `obs-${c.id}-${i}`, ownerKind: "CHARACTER" as const, ownerId: c.id,
    anchor: e.anchor, sceneId: "scene-one", transcriptSegmentId: `source-${i}`, kind: "BEHAVIOR", evidenceText: e.evidenceText, inference: "", confidence: "LOW" as const,
    relationshipType: null, relationshipSummary: null, createdAt: date, updatedAt: null })));
  raw.preparation!.observations.push({ ...raw.preparation!.observations[4], id: "obs-rel", ownerKind: "RELATIONSHIP", ownerId: "relationship-ab",
    kind: "RELATIONSHIP", evidenceText: "两人合作", relationshipType: "ALLY", relationshipSummary: "ယာယီ မဟာမိတ်ဆက်ဆံရေး" });
  options.raw?.(raw);
  const source = validateSourceSnapshot(raw, scope), profile = base.profile;
  const recipe = createStoryTaskRecipe({ ...scope, studioId: "studio-old", expectedStudioRevision: 3, sourceSnapshotId: source.payload.id,
    scriptVersionId: null, kind: "ANALYZE_EVIDENCE", profileId: profile.id, profileVersion: profile.version,
    window: { firstSegmentSequence: 0, lastSegmentSequence: 11 }, parentResultHashes: [] }, source, profile, null,
  { id: "studio-old", ...scope, revision: 3, currentSourceSnapshotId: source.payload.id, currentScriptVersionId: null });
  function observed(seq: number, relationship = false): CandidateFinding {
    const o = source.payload.preparation!.observations.find(o => o.id === (relationship ? "obs-rel" : `obs-character-a-${seq}`))!;
    const evidence: CandidateEvidence = { kind: "CAPTURED_OBSERVATION", anchor: structuredClone(o.anchor), segmentId: o.transcriptSegmentId, sceneId: o.sceneId, observationId: o.id };
    return { id: relationship ? "relationship-4" : `behavior-${seq}`, classification: "OBSERVED", category: relationship ? "RELATIONSHIP" : "BEHAVIOR",
      subject: { characterIds: relationship ? ["character-a", "character-b"] : ["character-a"], relationshipId: relationship ? "relationship-ab" : null }, statement: o.evidenceText,
      confidence: "LOW", uncertainty: "NONE", evidence: [evidence], translationContextRefs: [], observedBasisIds: [], qualification: null };
  }
  const findings = [observed(0), observed(2), observed(4, true), observed(6), observed(11)];
  for (const seq of [0, 6]) findings.push({ ...structuredClone(findings.find(f => f.id === `behavior-${seq}`)!), id: `inference-${seq}`,
    classification: "INFERRED", category: seq ? "DECISION" : "MOTIVATION", statement: "စိုးရိမ်မှု ရှိနိုင်သည်။", uncertainty: "POSSIBLE", observedBasisIds: [`behavior-${seq}`], qualification: "ဖြစ်နိုင်" });
  const candidate: EvidenceAnalysisCandidate = { ...structuredClone(base.candidate), task: { ...base.candidate.task, recipeHash: recipe.recipeHash },
    source: { ...base.candidate.source, contentHash: source.sourceContentHash, contextHash: source.sourceContextHash }, findings, contradictions: [], openQuestions: [] };
  options.candidate?.(candidate, source);
  const context = { ...base.context, source, recipe, candidate: validateEvidenceAnalysisCandidate(candidate, source, recipe,
    storyTaskGenerationIdentity({ taskId: candidate.task.taskId, generation: candidate.task.generation }), profile) };
  const requestHash = contractHash("story-fake-request-v1", { schemaVersion: "story-fake-request-v1", synthetic: true, taskId: "task-one", generation: 0, recipeHash: recipe.recipeHash });
  const marker = { schemaVersion: "story-fake-result-v1", synthetic: true, taskId: "task-one", generation: 0, submissionId: "submission-one", requestHash, outcome: "SUCCESS" };
  const resultHash = contractHash("story-fake-result-v1", marker);
  context.record = { ...base.context.record, candidateHash: context.candidate.candidateHash, recipeHash: recipe.recipeHash, resultHash };
  context.result = { ...base.context.result, requestHash, canonicalMarker: canonicalJson(marker), resultHash };
  const original = composeSyntheticNarration(context), storedOriginal = { id: "stored-original", draftHash: original.draftHash };
  const originalReference = referenceFromM4(original, storedOriginal);
  const editPayload: EditedVersionPayload = { schemaVersion: STUDIO_EDIT.version, origin: "SYNTHETIC_TEST_EDIT", id: "edit-one", version: 1, createdAt: date,
    scope: originalReference.scope, binding: { original: { ...storedOriginal, payloadId: original.payload.id }, source: original.payload.source, analysis: original.payload.analysis },
    expectedRevision: 0, previousVersion: null, idempotencyKey: "edit-request", sections: original.payload.sections.map(s => ({ sectionId: s.id, paragraphs: ["မြန်မာစာ ပြင်ဆင်ချက် ဖြစ်သည်။"] })),
    editor: { tenantId: "synthetic-tenant", principalId: "synthetic-editor" }, review: unapprovedEdit };
  const edit = options.edited ? { payload: editPayload, contentHash: contractHash(STUDIO_EDIT.hashDomain, editPayload) } : null;
  const narration = edit ? referenceFromR4(edit.payload, edit.contentHash, originalReference) : originalReference;
  const capture: SyntheticHighlightCapture = { schemaVersion: H.capture, execution: "SYNTHETIC_ONLY", context, original, storedOriginal, edit,
    current: { schemaVersion: H.source, narration: structuredClone(narration), media: structuredClone(source.payload.media), currentness: { sourceRevision: 3, narrationRevision: edit ? 1 : 0, observedAt: date } } };
  const input: HighlightInput = { schemaVersion: H.input, execution: "SYNTHETIC_ONLY", source: structuredClone(capture.current), audio: null,
    policy: { schemaVersion: H.policy, rubricVersion: H.rubric, maxClips: 6, maxTotalSourceMs: 12000, minClipMs: 1, maxClipMs: 8000,
      coverage: { mode: "REQUIRE", characterIds: ["character-a", "character-b"], relationshipIds: ["relationship-ab"] }, overlap: "REJECT", transition: "CUT_ONLY", presentation: "SOURCE_CHRONOLOGY" } };
  const resolver: SyntheticHighlightResolver = { resolve: () => ({ status: "CAPTURED_SYNTHETIC", capture }) };
  return { input, capture, resolver, candidate, originalReference };
}
