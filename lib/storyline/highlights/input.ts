import "server-only";
import { canonicalJson } from "../canonical";
import { array, date, enumeration, hash, id, integer, literal, record, unique, freeze, fail } from "../validation";
import { fakeVoiceRestrictions } from "../voice/foundation/contracts";
import { parseNarrationReference } from "../voice/foundation/reference";
import { HIGHLIGHTS as H, type HighlightInput, type HighlightPolicy, type HighlightSourceReference } from "./contracts";

export const sameHighlightValue = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
function positive(v: unknown, path: string, max = 2147483647) {
  const n = integer(v, path, max); if (!n || Object.is(n, -0)) fail("INVALID_NUMBER", path); return n;
}
function ids(v: unknown) {
  const rows = array(v, 200, "highlight.coverage").map(v => id(v, "highlight.coverage.id"));
  unique(rows, v => v, "highlight.coverage");
  if (rows.some((v, i) => i > 0 && v <= rows[i - 1])) fail("INVALID_ORDER", "highlight.coverage");
  return rows;
}
export function parseHighlightSource(v: unknown): HighlightSourceReference {
  const r = record(v, ["schemaVersion", "narration", "media", "currentness"], "highlight.source");
  const narration = parseNarrationReference(r.narration);
  if (narration.artifact.kind === "FUTURE_APPROVED_REFERENCE" || narration.analysis.candidateOrigin !== "SYNTHETIC_TEST") fail("INVALID_ENUM", "highlight.synthetic");
  const m = record(r.media, ["sha256", "bytes", "durationMs"], "highlight.media");
  const c = record(r.currentness, ["sourceRevision", "narrationRevision", "observedAt"], "highlight.currentness");
  return { schemaVersion: literal(r.schemaVersion, H.source, "highlight.source.schema"), narration,
    media: { sha256: hash(m.sha256, "highlight.media.hash"), bytes: positive(m.bytes, "highlight.media.bytes", Number.MAX_SAFE_INTEGER), durationMs: positive(m.durationMs, "highlight.media.duration") },
    currentness: { sourceRevision: integer(c.sourceRevision, "highlight.source.revision"), narrationRevision: integer(c.narrationRevision, "highlight.narration.revision"), observedAt: date(c.observedAt, "highlight.observedAt") } };
}
export function parseHighlightPolicy(v: unknown): HighlightPolicy {
  const r = record(v, ["schemaVersion", "rubricVersion", "maxClips", "maxTotalSourceMs", "minClipMs", "maxClipMs", "coverage", "overlap", "transition", "presentation"], "highlight.policy");
  const c = record(r.coverage, ["characterIds", "relationshipIds", "mode"], "highlight.coverage");
  const minClipMs = positive(r.minClipMs, "highlight.min"), maxClipMs = positive(r.maxClipMs, "highlight.max");
  const maxTotalSourceMs = positive(r.maxTotalSourceMs, "highlight.budget");
  if (maxClipMs < minClipMs || maxTotalSourceMs < minClipMs) fail("INVALID_INTERVAL", "highlight.budget");
  return { schemaVersion: literal(r.schemaVersion, H.policy, "highlight.policy.schema"), rubricVersion: literal(r.rubricVersion, H.rubric, "highlight.rubric"),
    maxClips: positive(r.maxClips, "highlight.maxClips", H.maxClips), maxTotalSourceMs, minClipMs, maxClipMs,
    coverage: { characterIds: ids(c.characterIds), relationshipIds: ids(c.relationshipIds), mode: literal(c.mode, "REQUIRE", "highlight.coverage.mode") },
    overlap: literal(r.overlap, "REJECT", "highlight.overlap"), transition: literal(r.transition, "CUT_ONLY", "highlight.transition"),
    presentation: enumeration(r.presentation, ["SOURCE_CHRONOLOGY", "SCORE_ORDER"], "highlight.presentation") };
}
/** Structural parsing is never database existence, currentness or authorization. */
export function parseHighlightInput(value: unknown) {
  const r = record(JSON.parse(canonicalJson(value, H.maxBytes)), ["schemaVersion", "execution", "source", "policy", "audio"], "highlight.input");
  const source = parseHighlightSource(r.source);
  let audio: HighlightInput["audio"] = null;
  if (r.audio !== null) {
    const a = record(r.audio, ["schemaVersion", "artifactId", "artifactHash", "planHash", "reference", "execution", "evidence", "speech", "verification", "restrictions"], "highlight.audio");
    const reference = parseNarrationReference(a.reference);
    if (!sameHighlightValue(reference, source.narration) || !sameHighlightValue(a.restrictions, fakeVoiceRestrictions)) fail("RECEIPT_BINDING_INVALID", "highlight.audio");
    audio = { schemaVersion: literal(a.schemaVersion, H.audio, "highlight.audio.schema"), artifactId: id(a.artifactId, "highlight.audio.id"),
      artifactHash: hash(a.artifactHash, "highlight.audio.hash"), planHash: hash(a.planHash, "highlight.audio.plan"), reference,
      execution: literal(a.execution, "FAKE_ONLY", "highlight.audio.execution"), evidence: literal(a.evidence, "SYNTHETIC_BYTE_INTEGRITY_ONLY", "highlight.audio.evidence"),
      speech: literal(a.speech, "NOT_VERIFIED", "highlight.audio.speech"), verification: literal(a.verification, "REFERENCE_ONLY", "highlight.audio.verification"), restrictions: fakeVoiceRestrictions };
  }
  return freeze({ schemaVersion: literal(r.schemaVersion, H.input, "highlight.input.schema"), execution: literal(r.execution, "SYNTHETIC_ONLY", "highlight.execution"),
    source, policy: parseHighlightPolicy(r.policy), audio });
}
