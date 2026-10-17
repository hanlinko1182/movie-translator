import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { array, fail, freeze, integer, interval, literal, record, text, unique } from "../validation";
import { checkSyntheticNarrationContext } from "./context";
import { NARRATION_DRAFT, type NarrationDraft, type SyntheticNarrationContext } from "./contracts";
import { projectSyntheticNarration } from "./synthetic-projection";

/** Recursively strict synthetic schema/projection. Expected keys, not supplied
 * keys, form safe diagnostic paths. No provider text enters error messages. */
function assertProjection(value: unknown, expected: unknown, path: string): void {
  if (expected === null) {
    if (value !== null) fail(path.includes("Duration") || path.endsWith("budgetMs") ? "INVALID_NUMBER" : "INVALID_ENUM", path);
  } else if (Array.isArray(expected)) {
    const rows = array(value, expected.length, path, expected.length);
    rows.forEach((row, index) => assertProjection(row, expected[index], `${path}.${index}`));
  } else if (typeof expected === "object") {
    const keys = Object.keys(expected), row = record(value, keys, path);
    keys.forEach(key => assertProjection(row[key], (expected as Record<string, unknown>)[key], `${path}.${key}`));
  } else if (typeof expected === "number") {
    if (integer(value, path) !== expected) fail("INVALID_ORDER", path);
  } else if (value !== expected) {
    if (path.startsWith("narration.source") || path.startsWith("narration.analysis")) fail("STALE_CONTEXT", path);
    if (path.endsWith("kind") || path.endsWith("qualification") || path.includes("uncertainty")) fail("INFERENCE_INVALID", path);
    fail("INVALID_ANCHOR", path);
  }
}

/** Pure, synthetic-only validation. Independently revalidates M3 grounding,
 * then rejects any claim, reference or spoken text outside its exact projection.
 * It does not establish durable existence, live freshness or semantic truth. */
export function validateSyntheticNarrationDraft(value: unknown, context: SyntheticNarrationContext): NarrationDraft {
  canonicalJson(value, NARRATION_DRAFT.maxBytes);
  const expected = projectSyntheticNarration(checkSyntheticNarrationContext(context));
  const root = record(value, Object.keys(expected), "narration");
  literal(root.schemaVersion, NARRATION_DRAFT.version, "narration.schemaVersion");
  literal(root.composerVersion, NARRATION_DRAFT.composerVersion, "narration.composerVersion");
  literal(root.origin, "SYNTHETIC_TEST", "narration.origin");
  const review = record(root.review, ["status", "approval"], "narration.review");
  literal(review.approval, "PROVISIONAL", "narration.review.approval");
  const beats = array(root.beats, NARRATION_DRAFT.maxBeats, "narration.beats", 1);
  let total = 0;
  beats.forEach(raw => {
    const beat = record(raw, ["id", "order", "category", "startMs", "endMs", "claims", "narration"], "narration.beats");
    interval(integer(beat.startMs, "narration.beats.startMs"), integer(beat.endMs, "narration.beats.endMs"),
      context.source.payload.media.durationMs, "narration.beats");
    array(beat.claims, NARRATION_DRAFT.maxClaimsPerBeat, "narration.beats.claims", 1);
    const chunks = array(beat.narration, NARRATION_DRAFT.maxParagraphsPerBeat, "narration.beats.narration", 1);
    let beatLength = 0;
    chunks.forEach(raw => {
      const chunk = record(raw, ["text", "claimIds"], "narration.beats.narration");
      const spoken = text(chunk.text, NARRATION_DRAFT.maxTextPerBeat, "narration.beats.narration.text");
      if (!/\p{Script=Myanmar}/u.test(spoken) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(spoken))
        fail("INVALID_TEXT", "narration.beats.narration.text");
      beatLength += [...spoken].length;
    });
    if (beatLength > NARRATION_DRAFT.maxTextPerBeat) fail("SIZE_LIMIT", "narration.beats.narration");
    total += beatLength;
  });
  if (total > NARRATION_DRAFT.maxTextTotal) fail("SIZE_LIMIT", "narration.beats.narration");
  unique(beats, raw => record(raw, ["id", "order", "category", "startMs", "endMs", "claims", "narration"], "narration.beats").id as string, "narration.beats");
  array(root.sections, NARRATION_DRAFT.maxBeats, "narration.sections", 1).forEach(raw => {
    const section = record(raw, ["id", "beatId", "order", "heading", "focus"], "narration.sections");
    text(section.heading, NARRATION_DRAFT.maxHeading, "narration.sections.heading");
  });
  array(root.paragraphs, NARRATION_DRAFT.maxBeats * NARRATION_DRAFT.maxParagraphsPerBeat, "narration.paragraphs", 1);
  array(root.claimLineage, NARRATION_DRAFT.maxBeats * NARRATION_DRAFT.maxClaimsPerBeat, "narration.claimLineage", 1).forEach(raw => {
    const lineage = record(raw, ["claimId", "candidateFindingIds", "change"], "narration.claimLineage");
    array(lineage.candidateFindingIds, NARRATION_DRAFT.maxFindingRefs, "narration.claimLineage.candidateFindingIds", 1);
  });
  // In M4-01 an unauthenticated numerical plan/voice rate never supplies a
  // budget. Synthetic ancestry cannot be counted as human-verified events.
  assertProjection(value, expected, "narration");
  canonicalJson(expected, NARRATION_DRAFT.maxBytes);
  return freeze({ payload: expected, draftHash: contractHash(NARRATION_DRAFT.hashDomain, expected) });
}
