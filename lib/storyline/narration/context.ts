import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { EVIDENCE_ANALYSIS } from "../evidence-analysis/contracts";
import { validateEvidenceAnalysisCandidate } from "../evidence-analysis/validate";
import { parseStoryFakeResult } from "../jobs/fake-transport";
import { storyTaskGenerationIdentity } from "../jobs/recipe";
import { hash, id, integer, literal, record, text, fail } from "../validation";
import type { NarrationAnalysisDependency, SyntheticNarrationContext } from "./contracts";

/** Consistency of separately acquired server inputs only. This pure check
 * cannot authenticate a row, grant, operator or live database currentness. */
export function checkSyntheticNarrationContext(context: SyntheticNarrationContext) {
  record(context, ["source", "recipe", "profile", "candidate", "record", "result"], "narration.context");
  const wrapper = record(context.candidate, ["payload", "candidateHash", "trust"], "narration.context.candidate");
  literal(wrapper.trust, "PROVISIONAL_CANDIDATE", "narration.context.trust");
  const fields = ["candidateId", "candidateHash", "candidateSchemaVersion", "candidateOrigin", "taskId", "generation",
    "resultId", "resultHash", "submissionId", "recipeHash", "profileDefinitionHash"] as const;
  const raw = record(context.record, fields, "narration.context.record");
  const binding: NarrationAnalysisDependency = {
    candidateId: id(raw.candidateId, "narration.context.candidateId"),
    candidateHash: hash(raw.candidateHash, "narration.context.candidateHash"),
    candidateSchemaVersion: literal(raw.candidateSchemaVersion, EVIDENCE_ANALYSIS.version, "narration.context.candidateSchemaVersion"),
    candidateOrigin: literal(raw.candidateOrigin, "SYNTHETIC_TEST", "narration.context.candidateOrigin"),
    taskId: id(raw.taskId, "narration.context.taskId"), generation: integer(raw.generation, "narration.context.generation", 1_000_000),
    resultId: id(raw.resultId, "narration.context.resultId"), resultHash: hash(raw.resultHash, "narration.context.resultHash"),
    submissionId: id(raw.submissionId, "narration.context.submissionId"), recipeHash: hash(raw.recipeHash, "narration.context.recipeHash"),
    profileDefinitionHash: hash(raw.profileDefinitionHash, "narration.context.profileDefinitionHash"),
  };
  const candidate = validateEvidenceAnalysisCandidate(wrapper.payload, context.source, context.recipe,
    storyTaskGenerationIdentity({ taskId: binding.taskId, generation: binding.generation }), context.profile);
  if (candidate.payload.origin !== "SYNTHETIC_TEST" || context.profile.providerId !== "synthetic" ||
    context.profile.modelId !== "synthetic/model") fail("INVALID_ENUM", "narration.context.syntheticProfile");
  if (candidate.candidateHash !== wrapper.candidateHash || candidate.candidateHash !== binding.candidateHash ||
    binding.recipeHash !== context.recipe.recipeHash || binding.profileDefinitionHash !== contractHash("story-task-profile-v1", context.profile))
    fail("STALE_CONTEXT", "narration.context.candidateBinding");

  const r = record(context.result, ["state", "submissionState", "outcome", "taskId", "generation", "resultId", "submissionId",
    "requestHash", "canonicalMarker", "resultHash"], "narration.context.result");
  literal(r.state, "COMPLETED", "narration.context.result.state");
  literal(r.submissionState, "RESOLVED", "narration.context.result.submissionState");
  literal(r.outcome, "VALIDATED_CANDIDATE", "narration.context.result.outcome");
  const requestHash = hash(r.requestHash, "narration.context.requestHash");
  const expectedRequest = { schemaVersion: "story-fake-request-v1", synthetic: true,
    taskId: binding.taskId, generation: binding.generation, recipeHash: binding.recipeHash };
  if (r.taskId !== binding.taskId || r.generation !== binding.generation || r.resultId !== binding.resultId ||
    r.submissionId !== binding.submissionId || r.resultHash !== binding.resultHash ||
    requestHash !== contractHash("story-fake-request-v1", expectedRequest)) fail("STALE_CONTEXT", "narration.context.resultBinding");
  const bytes = text(r.canonicalMarker, context.profile.limits.responseBytes, "narration.context.resultMarker");
  let marker;
  try { marker = parseStoryFakeResult(bytes, { taskId: binding.taskId, generation: binding.generation,
    submissionId: binding.submissionId, requestHash }, context.profile.limits.responseBytes); }
  catch { fail("STALE_CONTEXT", "narration.context.resultMarker"); }
  if (marker.outcome !== "SUCCESS" || marker.canonical !== bytes || marker.hash !== binding.resultHash)
    fail("STALE_CONTEXT", "narration.context.resultMarker");
  // Capture independently parsed metadata, not caller-mutated identity objects.
  const analysis = JSON.parse(canonicalJson(binding)) as NarrationAnalysisDependency;
  return { candidate, analysis, source: context.source, recipe: context.recipe };
}
