import "server-only";
import type { StorySourceSnapshot } from "../contracts";
import type { StoryTaskProfileDefinition, StoryTaskRecipeIdentity } from "../jobs/contracts";
import { taskFail } from "../jobs/errors";
import { storyTaskGenerationIdentity } from "../jobs/recipe";
import { anchorKey } from "../source";
import { EVIDENCE_ANALYSIS, type CandidateFinding, type EvidenceAnalysisCandidate } from "./contracts";
import { validateEvidenceAnalysisCandidate } from "./validate";

/** Zero-cost fixture only. It quotes frozen Chinese source exactly; any
 * psychological interpretation is expressly provisional synthetic material. */
export function generateSyntheticEvidenceCandidate(input: {
  source: StorySourceSnapshot;
  recipe: StoryTaskRecipeIdentity;
  profile: StoryTaskProfileDefinition;
  reference: Readonly<{ taskId: string; generation: number }>;
}) {
  const { source, recipe, profile, reference } = input;
  if (!source.payload.preparation || recipe.recipe.kind !== "ANALYZE_EVIDENCE" ||
    recipe.recipe.script !== null || profile.providerId !== "synthetic" ||
    profile.modelId !== "synthetic/model" || profile.responseSchemaVersion !== EVIDENCE_ANALYSIS.version)
    taskFail("STORY_TASK_PROFILE_INVALID", "syntheticGenerator.profile");
  const window = recipe.recipe.window;
  const findings: CandidateFinding[] = [];
  for (const character of source.payload.characters.slice(0, 8)) {
    const matched = character.evidence.find(item => {
      const segment = source.payload.transcript.segments.find(row => row.sequence === item.anchor.segmentSequence);
      return item.anchor.segmentSequence >= window.firstSegmentSequence &&
        item.anchor.segmentSequence <= window.lastSegmentSequence &&
        segment !== undefined && [...segment.text].length <= 600;
    });
    if (!matched) continue;
    const anchor = matched.anchor;
    const segment = source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)!;
    const scene = source.payload.scenes.find(row => row.sequence === anchor.sceneSequence)!;
    const admitted = source.admissions.find(row => row.sequence === anchor.segmentSequence);
    const observedId = `synthetic-observed-${findings.length}`;
    findings.push({ id: observedId, classification: "OBSERVED", category: "DIALOGUE",
      subject: { characterIds: [character.id], relationshipId: null }, statement: segment.text,
      confidence: "LOW", uncertainty: "NONE", evidence: [{ kind: "CHINESE_QUOTE", anchor,
        segmentId: segment.id, sceneId: scene.id, quote: segment.text }],
      translationContextRefs: admitted?.status === "ADMITTED" ?
        [{ translationSegmentId: admitted.row.id, rowContextHash: admitted.rowContextHash }] : [],
      observedBasisIds: [], qualification: null });
    // The fixed phrase is a hypothetical example, not a finding about the film.
    if (findings.length === 1) findings.push({ id: "synthetic-inference-0", classification: "INFERRED",
      category: "MOTIVATION", subject: { characterIds: [character.id], relationshipId: null },
      statement: "စိုးရိမ်မှု ရှိနိုင်သည်။", confidence: "LOW", uncertainty: "POSSIBLE",
      evidence: [{ kind: "CHINESE_QUOTE", anchor, segmentId: segment.id, sceneId: scene.id, quote: segment.text }],
      translationContextRefs: admitted?.status === "ADMITTED" ?
        [{ translationSegmentId: admitted.row.id, rowContextHash: admitted.rowContextHash }] : [],
      observedBasisIds: [observedId], qualification: "ဖြစ်နိုင်" });
  }
  if (!findings.length) taskFail("STORY_TASK_INVALID", "syntheticGenerator.evidence");

  // Relationship output is included only when a frozen relationship observation
  // and both endpoint allowances already share the exact anchor.
  for (const relationship of source.payload.relationships.slice(0, 8)) {
    const characterA = source.payload.characters.find(row => row.id === relationship.characterAId);
    const characterB = source.payload.characters.find(row => row.id === relationship.characterBId);
    if (!characterA || !characterB) continue;
    const observation = source.payload.preparation.observations.find(row =>
      row.ownerKind === "RELATIONSHIP" && row.ownerId === relationship.id && row.kind === "RELATIONSHIP" &&
      row.anchor.segmentSequence >= window.firstSegmentSequence &&
      row.anchor.segmentSequence <= window.lastSegmentSequence &&
      relationship.evidence.some(item => anchorKey(item.anchor) === anchorKey(row.anchor)) &&
      characterA.evidence.some(item => anchorKey(item.anchor) === anchorKey(row.anchor)) &&
      characterB.evidence.some(item => anchorKey(item.anchor) === anchorKey(row.anchor)));
    if (!observation) continue;
    findings.push({ id: `synthetic-relationship-${findings.length}`, classification: "OBSERVED",
      category: "RELATIONSHIP", subject: { characterIds: [characterA.id, characterB.id].sort(), relationshipId: relationship.id },
      statement: observation.evidenceText, confidence: "LOW", uncertainty: "NONE",
      evidence: [{ kind: "CAPTURED_OBSERVATION", anchor: observation.anchor,
        segmentId: observation.transcriptSegmentId, sceneId: observation.sceneId, observationId: observation.id }],
      translationContextRefs: [], observedBasisIds: [], qualification: null });
  }
  const preparation = source.payload.preparation;
  const candidate: EvidenceAnalysisCandidate = {
    schemaVersion: EVIDENCE_ANALYSIS.version, origin: "SYNTHETIC_TEST",
    task: { taskId: reference.taskId, generation: reference.generation, recipeHash: recipe.recipeHash },
    source: { projectId: source.payload.projectId, movieId: source.payload.movieId,
      studioId: recipe.recipe.studioId, snapshotId: source.payload.id,
      contentHash: source.sourceContentHash, contextHash: source.sourceContextHash,
      dependencyHash: preparation.dependencyHash, bindingHash: preparation.sourceBindingHash },
    model: { providerId: "synthetic", modelId: "synthetic/model", profileId: profile.id,
      profileVersion: profile.version, responseSchemaVersion: profile.responseSchemaVersion },
    findings, contradictions: [], openQuestions: [],
  };
  return validateEvidenceAnalysisCandidate(candidate, source, recipe,
    storyTaskGenerationIdentity(reference), profile);
}
