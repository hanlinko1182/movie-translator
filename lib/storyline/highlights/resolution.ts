import "server-only";
import { canonicalJson } from "../canonical";
import type { Immutable } from "../contracts";
import { validateSyntheticNarrationDraft } from "../narration/validate";
import { record, literal, enumeration, StorylineContractError } from "../validation";
import { referenceFromM4, referenceFromR4 } from "../voice/foundation/reference";
import type { NarrationReference } from "../voice/foundation/contracts";
import { HIGHLIGHTS as H, HighlightError, RESOLUTION_FAILURES, type HighlightInput, type SyntheticHighlightCapture, type SyntheticHighlightResolver } from "./contracts";
import { parseHighlightSource, sameHighlightValue as same } from "./input";

function compareReference(a: Immutable<NarrationReference>, b: Immutable<NarrationReference>) {
  if (!same(a.scope, b.scope) || !same(a.source, b.source)) throw new HighlightError("STALE_SOURCE");
  if (!same(a.analysis, b.analysis)) throw new HighlightError("CHANGED_CANDIDATE");
  if (!same(a.original, b.original) || !same(a.artifact, b.artifact)) throw new HighlightError("CHANGED_NARRATION");
}
/** Only a fixture-owned resolver supplies the independent context and current observations.
 * No caller-supplied candidate, score or alleged auth role is accepted in the input. */
export function resolveHighlightCapture(input: Immutable<HighlightInput>, resolver: SyntheticHighlightResolver) {
  if (!resolver || typeof resolver.resolve !== "function") throw new HighlightError("UNSUPPORTED");
  let result: unknown;
  try { result = resolver.resolve(input.source.narration.scope); }
  catch { throw new HighlightError("UNSUPPORTED"); }
  const status = result && typeof result === "object" ? Object.getOwnPropertyDescriptor(result, "status")?.value : null;
  if (status !== "CAPTURED_SYNTHETIC") {
    const row = record(result, ["status"], "highlight.resolution");
    throw new HighlightError(enumeration(row.status, RESOLUTION_FAILURES, "highlight.resolution.status"));
  }
  const row = record(result, ["status", "capture"], "highlight.resolution");
  try {
    const c = record(JSON.parse(canonicalJson(row.capture, H.captureBytes)), ["schemaVersion", "execution", "context", "original", "storedOriginal", "edit", "current"], "highlight.capture");
    literal(c.schemaVersion, H.capture, "highlight.capture.schema"); literal(c.execution, "SYNTHETIC_ONLY", "highlight.capture.execution");
    const capture = c as unknown as SyntheticHighlightCapture;
    const original = record(c.original, ["payload", "draftHash"], "highlight.original");
    // M4 independently revalidates M1 source hashes, the complete M2 definitive
    // result, M3 evidence/observed basis, and exact M4 projection/claim lineage.
    const draft = validateSyntheticNarrationDraft(original.payload, capture.context);
    if (original.draftHash !== draft.draftHash) throw new HighlightError("CHANGED_NARRATION");
    const base = referenceFromM4(draft, capture.storedOriginal);
    let reference = base;
    if (capture.edit !== null) {
      const edit = record(c.edit, ["payload", "contentHash"], "highlight.edit");
      reference = referenceFromR4(edit.payload, capture.edit.contentHash, base);
      const sections = capture.edit.payload.sections;
      if (!same(sections.map(s => s.sectionId), draft.payload.sections.map(s => s.id)) || sections.some((s, i) =>
        s.paragraphs.length !== draft.payload.beats.find(b => b.id === draft.payload.sections[i].beatId)!.narration.length)) throw new HighlightError("CHANGED_NARRATION");
    }
    const current = parseHighlightSource(c.current);
    compareReference(current.narration, reference);
    if (!same(current.media, capture.context.source.payload.media)) throw new HighlightError("STALE_MEDIA");
    compareReference(input.source.narration, reference);
    if (!same(input.source.media, current.media)) throw new HighlightError("STALE_MEDIA");
    if (!same(input.source.currentness, current.currentness)) throw new HighlightError("STALE_SOURCE");
    const source = capture.context.source.payload;
    if (input.policy.coverage.characterIds.some(i => !source.characters.some(c => c.id === i)) ||
      input.policy.coverage.relationshipIds.some(i => !source.relationships.some(r => r.id === i))) throw new HighlightError("MISSING_EVIDENCE");
    return { context: capture.context, draft, reference };
  } catch (e) {
    if (e instanceof HighlightError) throw e;
    if (e instanceof StorylineContractError && ["INVALID_ANCHOR", "EVIDENCE_OWNERSHIP", "INFERENCE_INVALID"].includes(e.rule)) throw new HighlightError("MISSING_EVIDENCE");
    throw new HighlightError("INVALID_CAPTURE");
  }
}
