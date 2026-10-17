import "server-only";
import { contractHash } from "../canonical";
import type { StoryBeat, StoryClaim } from "../contracts";
import type { CandidateFinding } from "../evidence-analysis/contracts";
import { anchorKey } from "../source";
import { fail, text } from "../validation";
import { NARRATION_DRAFT, type NarrationDraftPayload, type NarrationSection } from "./contracts";
import type { checkSyntheticNarrationContext } from "./context";

type Checked = ReturnType<typeof checkSyntheticNarrationContext>;
type Finding = Checked["candidate"]["payload"]["findings"][number];
const headings: Record<CandidateFinding["category"], string> = {
  DIALOGUE: "စကားနောက်ကွယ်က ဇာတ်ကောင်", ACTION: "အပြုအမူက ပြောပြသည့်အရာ", BEHAVIOR: "အပြုအမူက ပြောပြသည့်အရာ",
  MOTIVATION: "ရည်ရွယ်ချက်ကို နားလည်ခြင်း", TRAIT: "ဇာတ်ကောင်၏ စိတ်နေသဘောထား", RELATIONSHIP: "ဆက်ဆံရေးကို ဖတ်ရှုခြင်း",
  CONFLICT: "ပဋိပက္ခနှင့် စိတ်ဖိစီးမှု", DECISION: "ဆုံးဖြတ်ချက်၏ နောက်ကွယ်", CONSEQUENCE: "ရွေးချယ်မှု၏ အကျိုးဆက်",
};
const categories: Record<CandidateFinding["category"], StoryBeat["category"]> = {
  DIALOGUE: "OBSERVATION", ACTION: "OBSERVATION", BEHAVIOR: "OBSERVATION", MOTIVATION: "OBSERVATION", TRAIT: "OBSERVATION",
  RELATIONSHIP: "OBSERVATION", CONFLICT: "CONFLICT", DECISION: "DECISION", CONSEQUENCE: "CONSEQUENCE",
};
const focus: Record<CandidateFinding["category"], NarrationSection["focus"]> = {
  DIALOGUE: "CHARACTER_BEHAVIOR", ACTION: "CHARACTER_BEHAVIOR", BEHAVIOR: "CHARACTER_BEHAVIOR", MOTIVATION: "QUALIFIED_MOTIVATION",
  TRAIT: "QUALIFIED_MOTIVATION", RELATIONSHIP: "RELATIONSHIP_CONTEXT", CONFLICT: "PSYCHOLOGICAL_TENSION", DECISION: "DECISION", CONSEQUENCE: "CONSEQUENCE",
};
export const syntheticClaimId = (findingId: string) => `claim-${contractHash("narration-finding-id-v1", findingId).slice(0, 32)}`;
export function syntheticNarrationText(finding: Finding, checked: Checked): string {
  const names = finding.subject.characterIds.map(id => checked.source.payload.characters.find(row => row.id === id)!.name).join("နှင့် ");
  if (finding.classification === "OBSERVED") {
    // Evidence ownership is not proof of who spoke. Never turn a mention into
    // a quotation attributed to that character, or synthesize a translation.
    if (finding.category === "DIALOGUE") return `${names}နှင့် ဆက်စပ်သည့် စကားပြောအထောက်အထားကို ကြည့်လျှင် ဇာတ်ကောင်ကို နားလည်ရန် အခြေခံတစ်ခု ရလာသည်။ သို့သော် စကားတစ်ခွန်းတည်းဖြင့် အတွင်းစိတ်ကို အတည်မပြုနိုင်သေးပါ။`;
    if (finding.category === "RELATIONSHIP") return `${names}တို့၏ ဆက်ဆံရေးကို အထောက်အထားနှင့် တွဲဖတ်ရမည်။ ဆက်ဆံရေးဆိုင်ရာ အထောက်အထားကို တွေ့ရသော်လည်း စိတ်ရင်းနှင့် ဆက်ဆံရေးပြောင်းလဲမှုကို အတည်မပြုနိုင်သေးပါ။`;
    return `${names}၏ အပြုအမူကို အထောက်အထားအဖြစ် တွေ့ရသည်။ ထိုအပြုအမူနှင့် အတွင်းစိတ်ကို တစ်ထပ်တည်း မယူဆဘဲ နောက်ကွယ်က အကြောင်းရင်းကို သတိထားဖတ်ရမည်။`;
  }
  // We cannot translate arbitrary candidate prose without a model. Synthetic
  // inference fixtures must already contain Myanmar interpretation text.
  if (!/\p{Script=Myanmar}/u.test(finding.statement)) fail("INVALID_TEXT", "narration.syntheticInferenceLanguage");
  if (/သေချာပေါက်|ကျိန်းသေ|မုချ|အတည်ပြုပြီး/u.test(finding.statement))
    fail("INFERENCE_INVALID", "narration.syntheticInferenceCertainty");
  const caution = finding.qualification === "ဖြစ်နိုင်" ? "ဤအမြင်မှာ ဖြစ်နိုင်ခြေတစ်ခုသာဖြစ်ပြီး သေချာသော အကြောင်းရင်းဟု မဆိုနိုင်သေးပါ။"
    : `ဤအမြင်ကို “${finding.qualification}” ဟူသော သတိပြုချက်ဖြင့်သာ နားလည်ရမည်။`;
  return `${names}နှင့် ဆက်စပ်သည့် အထောက်အထားကို အခြေခံ၍ အဓိပ္ပာယ်ဖွင့်ဆိုရလျှင် ${finding.statement} ${caution}${finding.uncertainty === "COMPETING" ? " အခြားဖြစ်နိုင်ခြေများလည်း ရှိနေသဖြင့် ဤအမြင်တစ်ခုတည်းကို အမှန်ဟု မယူဆသင့်ပါ။" : ""}`;
}

/** Internal projection only; public composition always revalidates its result. */
export function projectSyntheticNarration(checked: Checked): NarrationDraftPayload {
  const findings = checked.candidate.payload.findings;
  if (!findings.length || findings.length > NARRATION_DRAFT.maxBeats) fail("SIZE_LIMIT", "narration.findings");
  const beats: StoryBeat[] = findings.map((finding, order) => {
    const anchors = [...new Map(finding.evidence.map(row => [anchorKey(row.anchor), row.anchor])).values()]
      .sort((a, b) => a.sceneSequence - b.sceneSequence || a.segmentSequence - b.segmentSequence);
    const segments = anchors.map(anchor => checked.source.payload.transcript.segments.find(row => row.sequence === anchor.segmentSequence)!);
    const base = { id: syntheticClaimId(finding.id), statement: finding.statement, confidence: finding.confidence,
      characterRefs: [...finding.subject.characterIds], relationshipRef: finding.subject.relationshipId,
      evidence: structuredClone(anchors), translationContextRefs: finding.translationContextRefs.map(row => ({ ...row })) };
    const claim: StoryClaim = finding.classification === "OBSERVED" ? { ...base, kind: "OBSERVED" } : {
      ...base, kind: "INFERRED", inferenceBasisClaimIds: finding.observedBasisIds.map(syntheticClaimId).sort(), qualification: finding.qualification!,
    };
    return { id: `beat-${syntheticClaimId(finding.id).slice(6)}`, order, category: categories[finding.category],
      startMs: Math.min(...segments.map(row => row.startMs)), endMs: Math.max(...segments.map(row => row.endMs)),
      claims: [claim], narration: [{ text: text(syntheticNarrationText(finding, checked), NARRATION_DRAFT.maxTextPerBeat, "narration.text"), claimIds: [claim.id] }] };
  });
  return {
    schemaVersion: NARRATION_DRAFT.version, composerVersion: NARRATION_DRAFT.composerVersion,
    id: `draft-${contractHash(NARRATION_DRAFT.composerVersion, checked.analysis).slice(0, 32)}`, version: 1, parentDraft: null,
    language: "my", style: NARRATION_DRAFT.style, durationMode: NARRATION_DRAFT.durationMode,
    translationContextPolicy: NARRATION_DRAFT.translationPolicy, origin: "SYNTHETIC_TEST",
    source: { ...checked.candidate.payload.source, expectedStudioRevision: checked.recipe.recipe.expectedStudioRevision,
      mediaSha256: checked.source.payload.media.sha256 }, analysis: checked.analysis,
    beats, sections: findings.map((finding, order) => ({ id: `section-${syntheticClaimId(finding.id).slice(6)}`,
      beatId: beats[order].id, order, heading: headings[finding.category], focus: focus[finding.category] })),
    paragraphs: findings.map((finding, order) => ({ beatId: beats[order].id, paragraphIndex: 0,
      uncertainty: finding.classification === "OBSERVED" ? "OBSERVED_ONLY" : finding.uncertainty === "COMPETING" ? "COMPETING_INTERPRETATIONS" : "QUALIFIED_INFERENCE",
      pacing: { intent: finding.classification === "OBSERVED" ? "MEASURED" : finding.category === "CONFLICT" ? "TENSE" : "REFLECTIVE",
        targetDurationMs: null, estimatedDurationMs: null, estimation: "UNAVAILABLE_UNCALIBRATED_MYANMAR_VOICE" } })),
    claimLineage: findings.map(finding => ({ claimId: syntheticClaimId(finding.id), candidateFindingIds: [finding.id], change: "PRESERVED_INTERPRETATION" })),
    duration: { status: "UNAVAILABLE", reason: "PENDING_SOURCE_VERIFICATION", planInputHash: null,
      verificationDependencyHash: null, policy: null, budgetMs: null },
    review: { status: "NEEDS_HUMAN_REVIEW", approval: "PROVISIONAL" },
  };
}

