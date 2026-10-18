import "server-only";
import type { NarrationDraft } from "../../narration/contracts";
import { array, fail, record } from "../../validation";
import { captureVoiceJson, checkedEditedNarration, referenceFromM4, referenceFromR4 } from "./reference";
import type { VoiceSectionInput } from "./contracts";

/** Captured canonical inputs only; these converters do not establish durable
 * existence, authoritative currentness, semantic approval or real send rights. */
export function m4NarrationVoiceInput(value: NarrationDraft, receipt: { id: string; draftHash: string }) {
  const draft = captureVoiceJson(value) as NarrationDraft;
  const reference = referenceFromM4(draft, receipt);
  const beats = array(draft.payload.beats, 60, "voice.m4.beats", 1);
  const sections: VoiceSectionInput[] = array(draft.payload.sections, 60, "voice.m4.sections", 1).map((raw, index) => {
    const section = record(raw, ["id", "beatId", "order", "heading", "focus"], "voice.m4.section");
    const beat = beats.find(b => b && typeof b === "object" && "id" in b && b.id === section.beatId);
    if (!beat || section.order !== index) fail("INVALID_ANCHOR", "voice.m4.beat");
    const b = record(beat, ["id", "order", "category", "startMs", "endMs", "claims", "narration"], "voice.m4.beat");
    const paragraphs = array(b.narration, 12, "voice.m4.paragraphs", 1).map(raw => {
      const p = record(raw, ["text", "claimIds"], "voice.m4.paragraph");
      if (typeof p.text !== "string") fail("INVALID_TEXT", "voice.m4.paragraph"); return p.text;
    });
    if (typeof section.id !== "string") fail("INVALID_TEXT", "voice.m4.section");
    return { sectionId: section.id, order: index, paragraphs, separators: paragraphs.slice(1).map(() => "\n\n") };
  });
  return { reference, sections };
}
export function editedNarrationVoiceInput(value: unknown, contentHash: string, original: NarrationDraft, receipt: { id: string; draftHash: string }) {
  const parent = m4NarrationVoiceInput(original, receipt), edit = checkedEditedNarration(value, contentHash, parent.reference);
  const reference = referenceFromR4(edit, contentHash, parent.reference);
  if (edit.sections.length !== parent.sections.length || edit.sections.some((s, i) => s.sectionId !== parent.sections[i].sectionId || s.paragraphs.length !== parent.sections[i].paragraphs.length)) fail("INVALID_ANCHOR", "voice.edit.sections");
  return { reference, sections: edit.sections.map((s, order) => ({ sectionId: s.sectionId, order, paragraphs: s.paragraphs, separators: s.paragraphs.slice(1).map(() => "\n\n") })) };
}
