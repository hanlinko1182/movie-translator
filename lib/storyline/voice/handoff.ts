import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import type { NarrationDraft } from "../narration/contracts";
import { date, enumeration, fail, freeze, hash, id, integer, literal, nullable, record, text } from "../validation";
import { VOICE_HANDOFF, type ParsedVoiceProposal, type VoiceRequestProposal } from "./contracts";

function opaqueId(value: unknown, path: string) {
  const result = text(value, 128, path);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(result) || result.includes("..")) fail("INVALID_TEXT", path);
  return result;
}

/** Strict structural planning parser. A reference/quote/hash never supplies
 * approval, authenticated spending or evidence of provider language support. */
export function parseVoiceRequestProposal(value: unknown): ParsedVoiceProposal {
  canonicalJson(value, VOICE_HANDOFF.maxBytes);
  const r = record(value, ["schemaVersion", "execution", "scope", "narration", "source", "analysis", "approval", "language", "locale", "voice", "audio", "cost", "spending"], "voice");
  const scope = record(r.scope, ["projectId", "movieId", "studioId"], "voice.scope");
  const n = record(r.narration, ["draftId", "draftHash", "sectionId", "sectionOrder", "chunkIndex", "chunkCount", "textHash"], "voice.narration");
  const s = record(r.source, ["snapshotId", "contentHash", "contextHash", "dependencyHash", "bindingHash", "mediaSha256", "studioRevision"], "voice.source");
  const a = record(r.analysis, ["candidateId", "candidateHash", "taskId", "generation", "resultId", "resultHash", "recipeHash"], "voice.analysis");
  const v = record(r.voice, ["providerId", "modelId", "voiceId", "profileId", "profileHash", "capabilityEvidenceHash", "delivery", "cloning"], "voice.voice");
  const audio = record(r.audio, ["format", "sampleRateHz", "channels"], "voice.audio");
  const chunkCount = integer(n.chunkCount, "voice.chunkCount", VOICE_HANDOFF.maxChunks), chunkIndex = integer(n.chunkIndex, "voice.chunkIndex", VOICE_HANDOFF.maxChunks - 1);
  if (!chunkCount || chunkIndex >= chunkCount) fail("INVALID_ORDER", "voice.chunks");
  const sampleRate = integer(audio.sampleRateHz, "voice.sampleRateHz", 48000);
  if (![24000, 48000].includes(sampleRate) || audio.channels !== 1) fail("INVALID_ENUM", "voice.audio");
  const proposal: VoiceRequestProposal = {
    schemaVersion: literal(r.schemaVersion, VOICE_HANDOFF.version, "voice.schemaVersion"), execution: literal(r.execution, "DISABLED_HANDOFF_ONLY", "voice.execution"),
    scope: { projectId: id(scope.projectId, "voice.projectId"), movieId: id(scope.movieId, "voice.movieId"), studioId: id(scope.studioId, "voice.studioId") },
    narration: { draftId: id(n.draftId, "voice.draftId"), draftHash: hash(n.draftHash, "voice.draftHash"), sectionId: id(n.sectionId, "voice.sectionId"),
      sectionOrder: integer(n.sectionOrder, "voice.sectionOrder", 59), chunkIndex, chunkCount, textHash: hash(n.textHash, "voice.textHash") },
    source: { snapshotId: id(s.snapshotId, "voice.snapshotId"), contentHash: hash(s.contentHash, "voice.contentHash"), contextHash: hash(s.contextHash, "voice.contextHash"),
      dependencyHash: hash(s.dependencyHash, "voice.dependencyHash"), bindingHash: hash(s.bindingHash, "voice.bindingHash"), mediaSha256: hash(s.mediaSha256, "voice.mediaSha256"), studioRevision: integer(s.studioRevision, "voice.studioRevision") },
    analysis: { candidateId: id(a.candidateId, "voice.candidateId"), candidateHash: hash(a.candidateHash, "voice.candidateHash"), taskId: id(a.taskId, "voice.taskId"),
      generation: integer(a.generation, "voice.generation", 1000000), resultId: id(a.resultId, "voice.resultId"), resultHash: hash(a.resultHash, "voice.resultHash"), recipeHash: hash(a.recipeHash, "voice.recipeHash") },
    approval: nullable(r.approval, value => { const x = record(value, ["approvalId", "approvalHash", "policyVersion", "verificationDependencyHash"], "voice.approval");
      return { approvalId: id(x.approvalId, "voice.approvalId"), approvalHash: hash(x.approvalHash, "voice.approvalHash"), policyVersion: id(x.policyVersion, "voice.approvalPolicy"), verificationDependencyHash: hash(x.verificationDependencyHash, "voice.verificationDependencyHash") }; }),
    language: literal(r.language, "my", "voice.language"), locale: literal(r.locale, "my-MM", "voice.locale"),
    voice: { providerId: opaqueId(v.providerId, "voice.providerId"), modelId: opaqueId(v.modelId, "voice.modelId"), voiceId: opaqueId(v.voiceId, "voice.voiceId"), profileId: id(v.profileId, "voice.profileId"),
      profileHash: hash(v.profileHash, "voice.profileHash"), capabilityEvidenceHash: hash(v.capabilityEvidenceHash, "voice.capabilityEvidenceHash"),
      delivery: enumeration(v.delivery, ["MEASURED", "REFLECTIVE", "TENSE"], "voice.delivery"), cloning: literal(v.cloning, "NONE", "voice.cloning") },
    audio: { format: literal(audio.format, "WAV_PCM16", "voice.audio.format"), sampleRateHz: sampleRate as 24000 | 48000, channels: 1 },
    cost: nullable(r.cost, value => { const x = record(value, ["quoteId", "policyVersion", "currency", "estimatedUsdMicros", "maxUsdMicros", "expiresAt"], "voice.cost");
      const estimate = integer(x.estimatedUsdMicros, "voice.cost.estimate"), cap = integer(x.maxUsdMicros, "voice.cost.cap");
      if (!cap || estimate > cap) fail("INVALID_NUMBER", "voice.cost.cap");
      return { quoteId: id(x.quoteId, "voice.quoteId"), policyVersion: id(x.policyVersion, "voice.cost.policy"), currency: literal(x.currency, "USD", "voice.cost.currency"), estimatedUsdMicros: estimate, maxUsdMicros: cap, expiresAt: date(x.expiresAt, "voice.cost.expiry") }; }),
    spending: nullable(r.spending, value => { const x = record(value, ["decisionId", "confirmationId", "scopeHash", "expiresAt"], "voice.spending");
      return { decisionId: id(x.decisionId, "voice.decisionId"), confirmationId: id(x.confirmationId, "voice.confirmationId"), scopeHash: hash(x.scopeHash, "voice.spending.scopeHash"), expiresAt: date(x.expiresAt, "voice.spending.expiry") }; }),
  };
  return freeze({ proposal, proposalHash: contractHash(VOICE_HANDOFF.hashDomain, proposal), executable: false as const });
}

/** Pure binding checks for one whole synthetic section (no invented chunks).
 * All current M4 artifacts are blocked. No lookup or receipt issuer exists here. */
export function assessNarrationVoiceHandoff(value: unknown, draft: NarrationDraft, stored: Readonly<{ id: string; draftHash: string }>) {
  const parsed = parseVoiceRequestProposal(value), p = parsed.proposal, d = draft.payload;
  if (p.narration.draftId !== stored.id || stored.draftHash !== draft.draftHash || contractHash("story-narration-draft-v1", d) !== draft.draftHash || p.narration.draftHash !== draft.draftHash ||
    canonicalJson(p.scope) !== canonicalJson({ projectId: d.source.projectId, movieId: d.source.movieId, studioId: d.source.studioId }) ||
    canonicalJson(p.source) !== canonicalJson({ snapshotId: d.source.snapshotId, contentHash: d.source.contentHash, contextHash: d.source.contextHash,
      dependencyHash: d.source.dependencyHash, bindingHash: d.source.bindingHash, mediaSha256: d.source.mediaSha256, studioRevision: d.source.expectedStudioRevision }) ||
    canonicalJson(p.analysis) !== canonicalJson({ candidateId: d.analysis.candidateId, candidateHash: d.analysis.candidateHash, taskId: d.analysis.taskId, generation: d.analysis.generation,
      resultId: d.analysis.resultId, resultHash: d.analysis.resultHash, recipeHash: d.analysis.recipeHash })) fail("STALE_CONTEXT", "voice.dependencies");
  const section = d.sections.find(section => section.id === p.narration.sectionId);
  const beat = section && d.beats.find(beat => beat.id === section.beatId);
  if (!section || !beat || section.order !== p.narration.sectionOrder || p.narration.chunkIndex !== 0 || p.narration.chunkCount !== 1 ||
    contractHash("story-voice-section-text-v1", beat.narration.map(row => row.text).join("\n\n")) !== p.narration.textHash) fail("INVALID_ANCHOR", "voice.section");
  return freeze({ proposalHash: parsed.proposalHash, eligibleForProviderSubmission: false as const, eligibility: "BLOCKED" as const,
    reasons: ["HUMAN_APPROVAL_LOOKUP_UNAVAILABLE", "PRODUCTION_SPENDING_DISABLED", "PROVIDER_CAPABILITY_UNVERIFIED",
      ...(d.origin === "SYNTHETIC_TEST" || d.analysis.candidateOrigin === "SYNTHETIC_TEST" ? ["SYNTHETIC_ANCESTRY"] : []),
      ...(d.review.approval === "PROVISIONAL" ? ["PROVISIONAL_NARRATION"] : [])],
    measuredAudioDurationMs: null, sourceCurrentness: "NOT_ESTABLISHED_BY_PURE_CONTRACT" as const });
}
