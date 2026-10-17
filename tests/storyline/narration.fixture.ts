import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import type { EvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis/contracts";
import { generateSyntheticEvidenceCandidate } from "../../lib/storyline/evidence-analysis/synthetic-generator";
import { validateEvidenceAnalysisCandidate } from "../../lib/storyline/evidence-analysis/validate";
import { createStoryTaskRecipe, storyTaskGenerationIdentity } from "../../lib/storyline/jobs/recipe";
import type { SyntheticNarrationContext } from "../../lib/storyline/narration/contracts";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { anchor, date, scope, sourceFixture } from "./fixtures";

/** Entirely synthetic acquisition fixture; not an authenticated DB receipt. */
export function narrationFixture(relationships = false) {
  const raw = sourceFixture();
  raw.preparation = {
    policyVersion: "story-source-preparation-v1", dependencyHash: "d".repeat(64), sourceBindingHash: "e".repeat(64), translationQcState: "SCAN_RECORDED",
    video: { format: "mp4", videoIndex: 0, videoCodec: "h264", width: 320, height: 240, timeBase: "1/12800", frameRate: "25/1", hasAudio: false },
    characterAnalysis: { id: "analysis-one", sourceHash: "f".repeat(64), provider: "synthetic", model: "fixture", createdAt: date, updatedAt: date },
    aliases: [], observations: [{ id: "observation-one", ownerKind: "CHARACTER", ownerId: "character-a", anchor: anchor(), sceneId: "scene-one",
      transcriptSegmentId: "source-0", kind: "BEHAVIOR", evidenceText: "人物甲说话", inference: "", confidence: "LOW",
      relationshipType: null, relationshipSummary: null, createdAt: date, updatedAt: null }], legacyRecapState: "ABSENT", legacyRecap: null,
  };
  if (relationships) {
    raw.characters.push({ id: "character-b", ...scope, name: "人物乙", uncertain: false,
      evidence: [{ anchor: anchor(), confidence: "LOW", evidenceText: "人物乙说话", inference: "" }] });
    raw.relationships.push({ id: "relationship-ab", ...scope, characterAId: "character-a", characterBId: "character-b", type: "ALLY",
      summary: "ယာယီ မဟာမိတ်ဆက်ဆံရေး", confidence: "LOW", evidence: [{ anchor: anchor(), confidence: "LOW", evidenceText: "两人交谈", inference: "" }] });
    raw.preparation.observations.push({ ...raw.preparation.observations[0], id: "observation-b", ownerId: "character-b", evidenceText: "人物乙说话" });
    raw.preparation.observations.push({ ...raw.preparation.observations[0], id: "observation-ab", ownerKind: "RELATIONSHIP", ownerId: "relationship-ab",
      kind: "RELATIONSHIP", relationshipType: "ALLY", relationshipSummary: "ယာယီ မဟာမိတ်ဆက်ဆံရေး", evidenceText: "两人交谈" });
  }
  const source = validateSourceSnapshot(raw, scope);
  const profile = { id: "synthetic-text", version: "v1", kind: "ANALYZE_EVIDENCE" as const, execution: "PAID_TEXT" as const,
    providerId: "synthetic", modelId: "synthetic/model", promptVersion: "p1", responseSchemaVersion: "story-evidence-candidate-v1", validatorVersion: "v1",
    policyVersion: "policy-v1", limits: { requestBytes: 100000, responseBytes: 50000, inputTokens: 1000, outputTokens: 500, timeoutMs: 1000 },
    costPolicy: { id: "synthetic-quote", version: "v1", maxEstimatedUsdMicros: 10000 } };
  const recipe = createStoryTaskRecipe({ ...scope, studioId: "studio-old", expectedStudioRevision: 3, sourceSnapshotId: source.payload.id,
    scriptVersionId: null, kind: "ANALYZE_EVIDENCE", profileId: profile.id, profileVersion: profile.version,
    window: { firstSegmentSequence: 0, lastSegmentSequence: 11 }, parentResultHashes: [] }, source, profile, null,
  { id: "studio-old", ...scope, revision: 3, currentSourceSnapshotId: source.payload.id, currentScriptVersionId: null });
  const reference = { taskId: "task-one", generation: 0 };
  const candidate = structuredClone(generateSyntheticEvidenceCandidate({ source, recipe, profile, reference }).payload) as EvidenceAnalysisCandidate;
  const requestHash = contractHash("story-fake-request-v1", { schemaVersion: "story-fake-request-v1", synthetic: true, ...reference, recipeHash: recipe.recipeHash });
  const marker = { schemaVersion: "story-fake-result-v1", synthetic: true, ...reference, submissionId: "submission-one", requestHash, outcome: "SUCCESS" };
  const resultHash = contractHash("story-fake-result-v1", marker);
  const context: SyntheticNarrationContext = {
    source, recipe, profile, candidate: validateEvidenceAnalysisCandidate(candidate, source, recipe, storyTaskGenerationIdentity(reference), profile),
    record: { candidateId: "candidate-one", candidateHash: "", candidateSchemaVersion: candidate.schemaVersion, candidateOrigin: "SYNTHETIC_TEST", ...reference,
      resultId: "result-one", resultHash, submissionId: "submission-one", recipeHash: recipe.recipeHash, profileDefinitionHash: contractHash("story-task-profile-v1", profile) },
    result: { state: "COMPLETED", submissionState: "RESOLVED", outcome: "VALIDATED_CANDIDATE", ...reference,
      resultId: "result-one", submissionId: "submission-one", requestHash, canonicalMarker: canonicalJson(marker), resultHash },
  };
  const refresh = () => {
    context.candidate = validateEvidenceAnalysisCandidate(candidate, context.source, recipe, storyTaskGenerationIdentity(reference), profile);
    context.record.candidateHash = context.candidate.candidateHash;
  };
  refresh();
  return { raw, source, recipe, profile, candidate, context, refresh };
}
