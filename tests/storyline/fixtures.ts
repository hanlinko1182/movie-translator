import { createHash } from "node:crypto";
import { normalizeMemorySource } from "../../lib/translation-memory/normalize";
import { STORYLINE, type SourceAnchor, type SourceVerificationReceipt, type StorySourcePayload,
  type StoryScriptPayload, type StorySourceSnapshot, type StoryScriptVersion, type StoryEvent } from "../../lib/storyline/contracts";
import { verificationBinding } from "../../lib/storyline/verification";

export const scope = { projectId: "fixture-project", movieId: "movie-old" };
export const date = "2026-10-01T00:00:00.000Z";
export const anchor = (segmentSequence = 0): SourceAnchor => ({ movieId: scope.movieId, transcriptId: "transcript-old", sceneSequence: 0, segmentSequence });

export function sourceFixture(): StorySourcePayload {
  const segments = Array.from({ length: 12 }, (_, sequence) => ({ id: `source-${sequence}`, transcriptId: "transcript-old", sequence,
    startMs: sequence * 2000, endMs: (sequence + 1) * 2000, text: `  中文对话 ${sequence}。\n` }));
  return {
    schemaVersion: STORYLINE.sourceVersion, id: "snapshot-one", capturedAt: date, ...scope,
    sourceLanguage: "zh", targetLanguage: "my", media: { sha256: "a".repeat(64), bytes: 4096, durationMs: 24000 },
    transcript: { id: "transcript-old", movieId: scope.movieId, language: "zh", segments },
    scenes: [{ id: "scene-one", movieId: scope.movieId, sequence: 0, startMs: 0, endMs: 24000 }],
    characterContext: "CURRENT", characters: [{ id: "character-a", ...scope, name: "人物甲", uncertain: false,
      evidence: [{ anchor: anchor(), confidence: "LOW", evidenceText: "人物甲说话", inference: "" }] }], relationships: [],
    translationContextPolicy: "ALL_CURRENT",
    translation: { id: "translation-old", movieId: scope.movieId, sourceTranscriptId: "transcript-old",
      sourceLanguage: "zh", targetLanguage: "my", revision: 3, provider: "synthetic", model: "fixture",
      createdAt: date, updatedAt: date, qcScannedAt: date,
      rows: segments.slice(0, 11).map((segment, sequence) => ({ id: `target-${sequence}`, translationId: "translation-old", sequence,
        startMs: segment.startMs, endMs: segment.endMs + (sequence === 10 ? 1 : 0), text: `  မြန်မာစာ ${sequence}။\n`, revision: 2,
        origin: sequence === 0 || sequence === 9 ? "MANUAL" : "MODEL", provider: "synthetic", model: "fixture", refinementJobId: null,
        reviewStatus: sequence === 1 ? "APPROVED" : sequence === 0 ? "NEEDS_REVIEW" : "UNREVIEWED",
        manualSourceHash: sequence === 0 ? createHash("sha256").update(normalizeMemorySource(segment.text)).digest("hex") : sequence === 9 ? "b".repeat(64) : null,
        createdAt: date, editedAt: sequence === 0 ? date : null, reviewedAt: sequence === 1 ? date : null,
        qcIssues: sequence < 2 ? [{ id: `qc-${sequence}`, translatedSegmentId: `target-${sequence}`, category: "POSSIBLE_OMISSION", severity: "WARNING", source: sequence === 0 ? "MANUAL" : "HEURISTIC",
          message: "Synthetic finding", createdAt: date, updatedAt: date, resolvedAt: sequence === 1 ? date : null, resolution: sequence === 1 ? "Synthetic resolution" : null }] : [],
      })),
    },
  };
}
export function scriptFixture(source: StorySourceSnapshot): StoryScriptPayload {
  return { schemaVersion: STORYLINE.scriptVersion, id: "script-one", version: 1, parentVersionId: null,
    sourceSnapshotId: source.payload.id, sourceContentHash: source.sourceContentHash, sourceContextHash: source.sourceContextHash,
    style: "CHARACTER_PSYCHOLOGY", durationMode: "AUTO_STORY_COMPLEXITY", translationContextPolicy: "ALL_CURRENT", language: "my", origin: "MODEL",
    beats: [0, 1].map(order => {
      const admission = source.admissions.find(row => row.sequence === order)!;
      return { id: `beat-${order}`, order, category: "OBSERVATION", startMs: order * 2000, endMs: (order + 1) * 2000,
        narration: [{ text: "သူက စကားပြောလိုက်သည်။", claimIds: [`claim-${order}`] }],
        claims: [{ id: `claim-${order}`, kind: "OBSERVED", statement: "Observed dialogue", confidence: "LOW",
          characterRefs: order === 0 ? ["character-a"] : [], relationshipRef: null, evidence: [anchor(order)],
          translationContextRefs: admission.status === "ADMITTED" ? [{ translationSegmentId: admission.row.id, rowContextHash: admission.rowContextHash }] : [] }],
      };
    }),
  };
}
export function withInference(script: StoryScriptPayload): StoryScriptPayload {
  const copy = structuredClone(script);
  copy.beats[0].claims.push({ ...structuredClone(copy.beats[0].claims[0]), id: "claim-inferred", kind: "INFERRED",
    statement: "Possible concern", inferenceBasisClaimIds: ["claim-0"], qualification: "ဖြစ်နိုင်" });
  copy.beats[0].narration.push({ text: "စိုးရိမ်နေခြင်း ဖြစ်နိုင်သည်။", claimIds: ["claim-inferred"] });
  return copy;
}
export function receiptFixture(source: StorySourceSnapshot, script: StoryScriptVersion, claimId = "claim-0", outcome: SourceVerificationReceipt["outcome"] = "SUPPORTED"): SourceVerificationReceipt {
  return { schemaVersion: STORYLINE.verificationVersion, id: `receipt-${claimId}`, issuer: "HUMAN",
    ...structuredClone(verificationBinding(claimId, source, script)),
    translationContextRefs: structuredClone(verificationBinding(claimId, source, script).translationContextRefs) as SourceVerificationReceipt["translationContextRefs"],
    policyVersion: STORYLINE.verificationVersion, outcome, operatorLabel: "Synthetic operator", rationale: "Synthetic source comparison", verifiedAt: date };
}
export function receiptStore(source: StorySourceSnapshot, script: StoryScriptVersion) {
  const receipts = script.payload.beats.flatMap(beat => beat.claims).map(claim => receiptFixture(source, script, claim.id));
  const stored = new Map(receipts.map(row => [row.id, row]));
  return { references: receipts.map(row => ({ claimId: row.claimId, receiptId: row.id })), lookup: (id: string) => stored.get(id) };
}
export const eventsFixture = (): StoryEvent[] => [0, 1].map(sequence => ({ id: `event-${sequence}`, kind: "ACTION", startMs: sequence * 2000, endMs: (sequence + 1) * 2000, claimIds: [`claim-${sequence}`], precedingEventIds: sequence ? ["event-0"] : [] }));
