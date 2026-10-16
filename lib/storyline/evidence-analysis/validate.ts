import "server-only";
import { CONFIDENCES } from "@/lib/character-analysis/types";
import { canonicalJson, contractHash } from "../canonical";
import type { StorySourceSnapshot } from "../contracts";
import type { StoryTaskGenerationIdentity, StoryTaskProfileDefinition, StoryTaskRecipeIdentity } from "../jobs/contracts";
import { parseStoryTaskProfile, storyTaskGenerationIdentity, validateStoryTaskRecipe } from "../jobs/recipe";
import { allowedClaimAnchors, CAUTIOUS_MYANMAR_MARKERS } from "../script";
import { anchorKey, assertAnchor, parseAnchor, validateSourceSnapshot } from "../source";
import { array, enumeration, fail, freeze, hash, id, integer, literal, nullable, record, text, unique } from "../validation";
import { EVIDENCE_ANALYSIS, type CandidateEvidence, type CandidateFinding, type CandidateSubject, type EvidenceAnalysisCandidate, type ValidatedEvidenceAnalysisCandidate } from "./contracts";

const categories = ["DIALOGUE", "ACTION", "BEHAVIOR", "MOTIVATION", "TRAIT", "RELATIONSHIP", "CONFLICT", "DECISION", "CONSEQUENCE"] as const;
const rank = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function ids(value: unknown, max: number, path: string): string[] {
  const result = array(value, max, path).map((item, index) => id(item, `${path}.${index}`));
  unique(result, item => item, path);
  if (result.some((item, index) => index > 0 && item <= result[index - 1])) fail("INVALID_ORDER", path);
  return result;
}

function subject(value: unknown, source: StorySourceSnapshot, path: string): CandidateSubject {
  const row = record(value, ["characterIds", "relationshipId"], path);
  const characterIds = ids(row.characterIds, 12, `${path}.characterIds`);
  const relationshipId = nullable(row.relationshipId, value => id(value, `${path}.relationshipId`));
  if (!characterIds.length && relationshipId === null || characterIds.some(value => !source.payload.characters.some(character => character.id === value))) fail("EVIDENCE_OWNERSHIP", path);
  if (relationshipId !== null) {
    const relationship = source.payload.relationships.find(item => item.id === relationshipId);
    if (!relationship || characterIds.join(":") !== [relationship.characterAId, relationship.characterBId].sort().join(":")) fail("EVIDENCE_OWNERSHIP", path);
  }
  return { characterIds, relationshipId };
}

function evidence(value: unknown, source: StorySourceSnapshot, recipe: StoryTaskRecipeIdentity["recipe"], subjectValue: CandidateSubject, path: string): CandidateEvidence {
  if (!value || typeof value !== "object") fail("INVALID_OBJECT", path);
  const kind = enumeration(Object.getOwnPropertyDescriptor(value, "kind")?.value, ["CHINESE_QUOTE", "CAPTURED_OBSERVATION"], `${path}.kind`);
  const row = record(value, ["kind", "anchor", "segmentId", "sceneId", kind === "CHINESE_QUOTE" ? "quote" : "observationId"], path);
  const anchor = parseAnchor(row.anchor, `${path}.anchor`);
  assertAnchor(anchor, source.payload, `${path}.anchor`);
  if (anchor.segmentSequence < recipe.window.firstSegmentSequence || anchor.segmentSequence > recipe.window.lastSegmentSequence) fail("INVALID_ANCHOR", `${path}.anchor`);
  const segment = source.payload.transcript.segments.find(item => item.sequence === anchor.segmentSequence)!;
  const scene = source.payload.scenes.find(item => item.sequence === anchor.sceneSequence)!;
  const segmentId = id(row.segmentId, `${path}.segmentId`), sceneId = id(row.sceneId, `${path}.sceneId`);
  if (segmentId !== segment.id || sceneId !== scene.id) fail("INVALID_ANCHOR", path);
  const allowed = allowedClaimAnchors({ characterRefs: subjectValue.characterIds, relationshipRef: subjectValue.relationshipId }, source);
  if (!allowed.some(item => anchorKey(item) === anchorKey(anchor))) fail("EVIDENCE_OWNERSHIP", path);
  if (kind === "CHINESE_QUOTE") {
    const quote = text(row.quote, 600, `${path}.quote`);
    if (!segment.text.includes(quote)) fail("INVALID_ANCHOR", `${path}.quote`);
    return { kind, anchor, segmentId, sceneId, quote };
  }
  const observationId = id(row.observationId, `${path}.observationId`);
  const observation = source.payload.preparation?.observations.find(item => item.id === observationId);
  if (!observation || observation.sceneId !== sceneId || observation.transcriptSegmentId !== segmentId || anchorKey(observation.anchor) !== anchorKey(anchor) ||
    (subjectValue.relationshipId ? observation.ownerKind !== "RELATIONSHIP" || observation.ownerId !== subjectValue.relationshipId : observation.ownerKind !== "CHARACTER" || !subjectValue.characterIds.includes(observation.ownerId))) {
    fail("EVIDENCE_OWNERSHIP", `${path}.observationId`);
  }
  return { kind, anchor, segmentId, sceneId, observationId };
}

function finding(value: unknown, source: StorySourceSnapshot, recipe: StoryTaskRecipeIdentity["recipe"], path: string): CandidateFinding {
  const row = record(value, ["id", "classification", "category", "subject", "statement", "confidence", "uncertainty", "evidence", "translationContextRefs", "observedBasisIds", "qualification"], path);
  const classification = enumeration(row.classification, ["OBSERVED", "INFERRED"], `${path}.classification`);
  const category = enumeration(row.category, categories, `${path}.category`);
  const parsedSubject = subject(row.subject, source, `${path}.subject`);
  const evidenceRows = array(row.evidence, EVIDENCE_ANALYSIS.maxEvidencePerFinding, `${path}.evidence`, 1).map((item, index) => evidence(item, source, recipe, parsedSubject, `${path}.evidence.${index}`));
  unique(evidenceRows, item => `${item.kind}:${anchorKey(item.anchor)}:${item.kind === "CHINESE_QUOTE" ? item.quote : item.observationId}`, `${path}.evidence`);
  const statement = text(row.statement, 1200, `${path}.statement`);
  const confidence = enumeration(row.confidence, CONFIDENCES, `${path}.confidence`);
  const uncertainty = enumeration(row.uncertainty, ["NONE", "POSSIBLE", "COMPETING"], `${path}.uncertainty`);
  const observedBasisIds = ids(row.observedBasisIds, 12, `${path}.observedBasisIds`);
  const qualification = nullable(row.qualification, value => text(value, 160, `${path}.qualification`));
  const translationContextRefs = array(row.translationContextRefs, EVIDENCE_ANALYSIS.maxContextPerFinding, `${path}.translationContextRefs`).map((item, index) => {
    const p = `${path}.translationContextRefs.${index}`, ref = record(item, ["translationSegmentId", "rowContextHash"], p);
    const translationSegmentId = id(ref.translationSegmentId, `${p}.translationSegmentId`), rowContextHash = hash(ref.rowContextHash, `${p}.rowContextHash`);
    const admission = source.admissions.find(item => item.status === "ADMITTED" && item.row.id === translationSegmentId);
    if (!admission || admission.status !== "ADMITTED" || admission.rowContextHash !== rowContextHash || !evidenceRows.some(item => item.anchor.segmentSequence === admission.sequence)) fail("STALE_CONTEXT", p);
    return { translationSegmentId, rowContextHash };
  });
  unique(translationContextRefs, item => item.translationSegmentId, `${path}.translationContextRefs`);
  if (classification === "OBSERVED") {
    if (!["DIALOGUE", "ACTION", "BEHAVIOR", "RELATIONSHIP"].includes(category) || uncertainty !== "NONE" || qualification !== null || observedBasisIds.length) fail("INFERENCE_INVALID", path);
    // A candidate observation may quote Chinese or repeat a frozen M1 observation exactly.
    // Paraphrase and semantic truth still require human comparison.
    if (!evidenceRows.some(item => {
      if (item.kind === "CHINESE_QUOTE") return category === "DIALOGUE" && item.quote === statement;
      const observation = source.payload.preparation?.observations.find(row => row.id === item.observationId);
      return observation?.evidenceText === statement &&
        (category === "RELATIONSHIP" ? observation.kind === "RELATIONSHIP" : observation.kind === "BEHAVIOR");
    })) fail("INVALID_ANCHOR", `${path}.statement`);
    if (category === "DIALOGUE" && !evidenceRows.some(item => item.kind === "CHINESE_QUOTE")) fail("INVALID_ANCHOR", `${path}.evidence`);
  } else {
    if (!observedBasisIds.length || uncertainty === "NONE" || qualification === null || confidence === "HIGH" ||
      !CAUTIOUS_MYANMAR_MARKERS.some(marker => qualification.includes(marker))) fail("INFERENCE_INVALID", path);
  }
  if (category === "RELATIONSHIP" && parsedSubject.relationshipId === null) fail("EVIDENCE_OWNERSHIP", path);
  if (parsedSubject.characterIds.some(characterId => {
    const character = source.payload.characters.find(item => item.id === characterId)!;
    return character.uncertain && confidence !== "LOW" || evidenceRows.some(item => rank[confidence] > rank[character.evidence.find(allowance => anchorKey(allowance.anchor) === anchorKey(item.anchor))!.confidence]);
  })) fail("CONFIDENCE_INVALID", `${path}.confidence`);
  if (parsedSubject.relationshipId) {
    const relationship = source.payload.relationships.find(item => item.id === parsedSubject.relationshipId)!;
    if (rank[confidence] > rank[relationship.confidence] || relationship.type === "UNKNOWN" && confidence !== "LOW" ||
      evidenceRows.some(item => rank[confidence] > rank[relationship.evidence.find(allowance => anchorKey(allowance.anchor) === anchorKey(item.anchor))!.confidence])) fail("CONFIDENCE_INVALID", `${path}.confidence`);
  }
  return { id: id(row.id, `${path}.id`), classification, category, subject: parsedSubject, statement, confidence, uncertainty, evidence: evidenceRows, translationContextRefs, observedBasisIds, qualification };
}

/** Pure structural grounding against trusted M1/M2 inputs; no persistence or authority is implied. */
export function validateEvidenceAnalysisCandidate(value: unknown, trustedSource: StorySourceSnapshot, trustedRecipe: StoryTaskRecipeIdentity,
  trustedGeneration: StoryTaskGenerationIdentity, trustedProfile: StoryTaskProfileDefinition): ValidatedEvidenceAnalysisCandidate {
  canonicalJson(value, EVIDENCE_ANALYSIS.maxBytes);
  const source = validateSourceSnapshot(trustedSource.payload, { projectId: trustedSource.payload.projectId, movieId: trustedSource.payload.movieId });
  if (!source.payload.preparation || trustedSource.sourceContentHash !== source.sourceContentHash || trustedSource.sourceContextHash !== source.sourceContextHash || canonicalJson(trustedSource.admissions) !== canonicalJson(source.admissions)) fail("STALE_CONTEXT", "trustedSource");
  const recipe = trustedRecipe.recipe;
  const profile = parseStoryTaskProfile(trustedProfile);
  canonicalJson(value, Math.min(EVIDENCE_ANALYSIS.maxBytes, profile.limits.responseBytes));
  const checkedRecipe = validateStoryTaskRecipe(recipe, source, profile, null, {
    id: recipe.studioId, projectId: recipe.projectId, movieId: recipe.movieId,
    revision: recipe.expectedStudioRevision, currentSourceSnapshotId: source.payload.id, currentScriptVersionId: null,
  });
  if (trustedRecipe.canonicalRecipe !== canonicalJson(recipe) || trustedRecipe.recipeHash !== contractHash("story-task-recipe-v1", recipe) ||
    checkedRecipe.recipeHash !== trustedRecipe.recipeHash ||
    trustedRecipe.logicalTaskKey !== contractHash("story-logical-task-v1", { studioId: recipe.studioId, kind: recipe.kind, recipeHash: trustedRecipe.recipeHash }) ||
    profile.kind !== "ANALYZE_EVIDENCE" || profile.responseSchemaVersion !== EVIDENCE_ANALYSIS.version ||
    recipe.profile.id !== profile.id || recipe.profile.version !== profile.version ||
    recipe.profile.definitionHash !== contractHash("story-task-profile-v1", profile) || recipe.responseSchemaVersion !== profile.responseSchemaVersion ||
    recipe.kind !== "ANALYZE_EVIDENCE" || recipe.script !== null || recipe.projectId !== source.payload.projectId || recipe.movieId !== source.payload.movieId ||
    recipe.source.snapshotId !== source.payload.id || recipe.source.contentHash !== source.sourceContentHash || recipe.source.contextHash !== source.sourceContextHash ||
    recipe.source.dependencyHash !== source.payload.preparation.dependencyHash || recipe.source.bindingHash !== source.payload.preparation.sourceBindingHash || recipe.source.mediaSha256 !== source.payload.media.sha256) fail("STALE_CONTEXT", "trustedRecipe");
  const root = record(value, ["schemaVersion", "origin", "task", "source", "model", "findings", "contradictions", "openQuestions"], "candidate");
  const task = record(root.task, ["taskId", "generation", "recipeHash"], "candidate.task");
  const parsedTask = { taskId: id(task.taskId, "candidate.task.taskId"), generation: integer(task.generation, "candidate.task.generation", 1_000_000), recipeHash: hash(task.recipeHash, "candidate.task.recipeHash") };
  const generation = storyTaskGenerationIdentity({ taskId: parsedTask.taskId, generation: parsedTask.generation });
  if (parsedTask.recipeHash !== trustedRecipe.recipeHash || generation.taskId !== trustedGeneration.taskId || generation.generation !== trustedGeneration.generation || generation.generationKey !== trustedGeneration.generationKey) fail("STALE_CONTEXT", "candidate.task");
  const binding = record(root.source, ["projectId", "movieId", "studioId", "snapshotId", "contentHash", "contextHash", "dependencyHash", "bindingHash"], "candidate.source");
  const parsedBinding = { projectId: id(binding.projectId, "candidate.source.projectId"), movieId: id(binding.movieId, "candidate.source.movieId"), studioId: id(binding.studioId, "candidate.source.studioId"), snapshotId: id(binding.snapshotId, "candidate.source.snapshotId"), contentHash: hash(binding.contentHash, "candidate.source.contentHash"), contextHash: hash(binding.contextHash, "candidate.source.contextHash"), dependencyHash: hash(binding.dependencyHash, "candidate.source.dependencyHash"), bindingHash: hash(binding.bindingHash, "candidate.source.bindingHash") };
  if (parsedBinding.projectId !== recipe.projectId || parsedBinding.movieId !== recipe.movieId || parsedBinding.studioId !== recipe.studioId || parsedBinding.snapshotId !== recipe.source.snapshotId || parsedBinding.contentHash !== recipe.source.contentHash || parsedBinding.contextHash !== recipe.source.contextHash || parsedBinding.dependencyHash !== recipe.source.dependencyHash || parsedBinding.bindingHash !== recipe.source.bindingHash) fail("SCOPE_MISMATCH", "candidate.source");
  const model = record(root.model, ["providerId", "modelId", "profileId", "profileVersion", "responseSchemaVersion"], "candidate.model");
  const parsedModel = { providerId: text(model.providerId, 128, "candidate.model.providerId"), modelId: text(model.modelId, 160, "candidate.model.modelId"), profileId: text(model.profileId, 80, "candidate.model.profileId"), profileVersion: text(model.profileVersion, 80, "candidate.model.profileVersion"), responseSchemaVersion: text(model.responseSchemaVersion, 80, "candidate.model.responseSchemaVersion") };
  if (parsedModel.providerId !== profile.providerId || parsedModel.modelId !== profile.modelId || parsedModel.profileId !== recipe.profile.id || parsedModel.profileVersion !== recipe.profile.version || parsedModel.responseSchemaVersion !== recipe.responseSchemaVersion) fail("STALE_CONTEXT", "candidate.model");
  const findings = array(root.findings, EVIDENCE_ANALYSIS.maxFindings, "candidate.findings").map((item, index) => finding(item, source, recipe, `candidate.findings.${index}`));
  unique(findings, item => item.id, "candidate.findings");
  const byId = new Map(findings.map(item => [item.id, item]));
  for (const item of findings) if (item.classification === "INFERRED") {
    for (const basisId of item.observedBasisIds) {
      const basis = byId.get(basisId);
      if (!basis || basis.classification !== "OBSERVED" || basis.subject.relationshipId !== item.subject.relationshipId || basis.subject.characterIds.join(":") !== item.subject.characterIds.join(":") || rank[item.confidence] > rank[basis.confidence] || item.evidence.some(ref => !basis.evidence.some(other => anchorKey(ref.anchor) === anchorKey(other.anchor)))) fail("INFERENCE_INVALID", `candidate.findings.${item.id}.observedBasisIds`);
    }
  }
  const contradictions = array(root.contradictions, EVIDENCE_ANALYSIS.maxContradictions, "candidate.contradictions").map((item, index) => {
    const p = `candidate.contradictions.${index}`, row = record(item, ["firstFindingId", "secondFindingId", "explanation"], p);
    const firstFindingId = id(row.firstFindingId, `${p}.firstFindingId`), secondFindingId = id(row.secondFindingId, `${p}.secondFindingId`);
    const first = byId.get(firstFindingId), second = byId.get(secondFindingId);
    if (!first || !second || first === second || first.classification !== "INFERRED" || second.classification !== "INFERRED" || first.uncertainty !== "COMPETING" || second.uncertainty !== "COMPETING" || first.subject.relationshipId !== second.subject.relationshipId || first.subject.characterIds.join(":") !== second.subject.characterIds.join(":")) fail("INFERENCE_INVALID", p);
    if (firstFindingId >= secondFindingId) fail("INVALID_ORDER", p);
    return { firstFindingId, secondFindingId, explanation: text(row.explanation, 600, `${p}.explanation`) };
  });
  unique(contradictions, item => `${item.firstFindingId}:${item.secondFindingId}`, "candidate.contradictions");
  const openQuestions = array(root.openQuestions, 100, "candidate.openQuestions").map((item, index) => {
    const p = `candidate.openQuestions.${index}`, row = record(item, ["id", "reason", "question", "anchor"], p);
    const anchor = nullable(row.anchor, value => { const parsed = parseAnchor(value, `${p}.anchor`); assertAnchor(parsed, source.payload, `${p}.anchor`); if (parsed.segmentSequence < recipe.window.firstSegmentSequence || parsed.segmentSequence > recipe.window.lastSegmentSequence) fail("INVALID_ANCHOR", `${p}.anchor`); return parsed; });
    return { id: id(row.id, `${p}.id`), reason: enumeration(row.reason, ["INSUFFICIENT_EVIDENCE", "CONTRADICTORY_SOURCE", "UNKNOWN_ATTRIBUTION"], `${p}.reason`), question: text(row.question, 600, `${p}.question`), anchor };
  });
  unique(openQuestions, item => item.id, "candidate.openQuestions");
  const payload: EvidenceAnalysisCandidate = { schemaVersion: literal(root.schemaVersion, EVIDENCE_ANALYSIS.version, "candidate.schemaVersion"), origin: enumeration(root.origin, ["MODEL_CANDIDATE", "SYNTHETIC_TEST"], "candidate.origin"), task: parsedTask, source: parsedBinding, model: parsedModel, findings, contradictions, openQuestions };
  return freeze({ payload, candidateHash: contractHash(EVIDENCE_ANALYSIS.hashDomain, payload), trust: "PROVISIONAL_CANDIDATE" });
}
