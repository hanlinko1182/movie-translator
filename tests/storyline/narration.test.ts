import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { canonicalJson, contractHash } from "../../lib/storyline/canonical";
import type { NarrationDraftPayload, SyntheticNarrationContext } from "../../lib/storyline/narration/contracts";
import { NARRATION_DRAFT, composeSyntheticNarration, prepareNarrationSpeechText, validateSyntheticNarrationDraft } from "../../lib/storyline/narration";
import { validateSourceSnapshot } from "../../lib/storyline/source";
import { StorylineContractError } from "../../lib/storyline/validation";
import { scope } from "./fixtures";
import { narrationFixture } from "./narration.fixture";

before(() => { mock.method(globalThis, "fetch", () => assert.fail("M4-01 cannot make provider requests")); });
after(() => mock.restoreAll());
function rejected(run: () => unknown, rule?: string) {
  assert.throws(run, error => error instanceof StorylineContractError && (!rule || error.rule === rule));
}
function mutateDraft(mutate: (draft: NarrationDraftPayload) => void, rule?: string) {
  const f = narrationFixture(true), draft = structuredClone(composeSyntheticNarration(f.context).payload) as NarrationDraftPayload;
  mutate(draft); rejected(() => validateSyntheticNarrationDraft(draft, f.context), rule);
}

test("Myanmar synthetic narration preserves one-scene multiple beats, psychology, source text and provisional state", () => {
  const f = narrationFixture(), before = canonicalJson(f.context);
  const draft = composeSyntheticNarration(f.context);
  assert.equal(draft.payload.beats.length, 2);
  assert(draft.payload.beats.every(beat => beat.claims[0].evidence[0].sceneSequence === 0));
  assert.equal(draft.payload.beats[0].claims[0].kind, "OBSERVED");
  assert.equal(draft.payload.beats[0].claims[0].statement, f.source.payload.transcript.segments[0].text);
  assert.equal(draft.payload.beats[1].claims[0].kind, "INFERRED");
  assert(draft.payload.beats[1].narration[0].text.includes(f.candidate.findings[1].statement));
  assert(draft.payload.beats[1].narration[0].text.includes("ဖြစ်နိုင်"));
  assert.equal(draft.payload.sections[1].focus, "QUALIFIED_MOTIVATION");
  assert.equal(draft.payload.paragraphs[1].uncertainty, "QUALIFIED_INFERENCE");
  assert.deepEqual(draft.payload.review, { status: "NEEDS_HUMAN_REVIEW", approval: "PROVISIONAL" });
  assert.equal(draft.payload.origin, "SYNTHETIC_TEST");
  assert.equal(canonicalJson(f.context), before);
  assert(Object.isFrozen(draft.payload.beats[0]));
  assert(!canonicalJson(draft).includes("SOURCE_VERIFIED"));
});

test("candidate identity/hash, completed result marker and recipe remain separate and bound", () => {
  const f = narrationFixture(), draft = composeSyntheticNarration(f.context);
  assert.equal(draft.payload.analysis.candidateId, f.context.record.candidateId);
  assert.equal(draft.payload.analysis.candidateHash, f.context.candidate.candidateHash);
  assert.notEqual(draft.payload.analysis.candidateHash, draft.payload.analysis.resultHash);
  assert.equal(draft.payload.analysis.resultId, f.context.result.resultId);
  assert.equal(draft.payload.source.snapshotId, f.source.payload.id);
  assert.equal(draft.payload.source.expectedStudioRevision, 3);
  assert.equal(draft.payload.analysis.recipeHash, f.recipe.recipeHash);
  assert.equal(draft.draftHash, contractHash(NARRATION_DRAFT.hashDomain, draft.payload));
});

for (const field of ["candidateId", "candidateHash", "taskId", "generation", "resultId", "resultHash", "submissionId", "recipeHash", "profileDefinitionHash"] as const)
  test(`draft rejects altered ${field}`, () => {
    mutateDraft(draft => {
      if (field === "generation") draft.analysis.generation++;
      else draft.analysis[field] = field.endsWith("Hash") ? "0".repeat(64) : "foreign-id";
    });
  });

for (const field of ["projectId", "movieId", "studioId", "snapshotId", "contentHash", "contextHash", "dependencyHash", "bindingHash", "mediaSha256", "expectedStudioRevision"] as const)
  test(`draft rejects cross-scope or stale ${field}`, () => {
    mutateDraft(draft => {
      if (field === "expectedStudioRevision") draft.source.expectedStudioRevision++;
      else draft.source[field] = field.endsWith("Hash") || field === "mediaSha256" ? "0".repeat(64) : "foreign-id";
    });
  });

test("context wrappers cannot bypass M3 candidate or completed-result checks", () => {
  for (const mutation of [
    (c: SyntheticNarrationContext) => { c.record.candidateHash = c.result.resultHash; },
    (c: SyntheticNarrationContext) => { c.candidate = { ...c.candidate, candidateHash: "0".repeat(64) }; },
    (c: SyntheticNarrationContext) => { c.result.resultId = "foreign-result"; },
    (c: SyntheticNarrationContext) => { c.result.canonicalMarker = "{"; },
    (c: SyntheticNarrationContext) => { c.result.requestHash = "0".repeat(64); },
    (c: SyntheticNarrationContext) => { Object.assign(c.result, { state: "UNKNOWN" }); },
    (c: SyntheticNarrationContext) => { Object.assign(c.record, { candidateOrigin: "MODEL_CANDIDATE" }); },
    (c: SyntheticNarrationContext) => { Object.assign(c.candidate, { sourceVerified: true }); },
  ]) {
    const context = structuredClone(narrationFixture().context); mutation(context);
    rejected(() => composeSyntheticNarration(context));
  }
});

test("forged Chinese, character and relationship evidence never becomes narrator authority", () => {
  for (const mutation of [
    (f: ReturnType<typeof narrationFixture>) => { f.candidate.findings[0].evidence[0].anchor.movieId = "other-movie"; },
    (f: ReturnType<typeof narrationFixture>) => { f.candidate.findings[0].subject.characterIds = ["missing-character"]; },
    (f: ReturnType<typeof narrationFixture>) => { Object.assign(f.candidate.findings[0].evidence[0], { quote: "捏造的话" }); },
  ]) {
    const f = narrationFixture(); mutation(f); rejected(() => f.refresh());
  }
  mutateDraft(draft => { draft.beats[0].claims[0].evidence[0].segmentSequence = 1; });
  mutateDraft(draft => { draft.beats[0].claims[0].characterRefs = ["character-b"]; });
  const f = narrationFixture(true), draft = composeSyntheticNarration(f.context);
  const relationship = draft.payload.beats.find(beat => beat.claims[0].relationshipRef !== null)!;
  assert.deepEqual(relationship.claims[0].characterRefs, ["character-a", "character-b"]);
  assert.equal(draft.payload.sections.find(section => section.beatId === relationship.id)?.focus, "RELATIONSHIP_CONTEXT");
  const bad = structuredClone(draft.payload) as NarrationDraftPayload;
  bad.beats.find(beat => beat.id === relationship.id)!.claims[0].characterRefs.pop();
  rejected(() => validateSyntheticNarrationDraft(bad, f.context));
});

test("advisory MANUAL/unapproved/QC context is preserved and source drift invalidates it", () => {
  const f = narrationFixture(), draft = composeSyntheticNarration(f.context);
  const ref = draft.payload.beats[0].claims[0].translationContextRefs[0];
  const admission = f.source.admissions.find(row => row.status === "ADMITTED" && row.row.id === ref.translationSegmentId);
  assert(admission?.status === "ADMITTED");
  assert.equal(admission.row.origin, "MANUAL"); assert.equal(admission.row.reviewStatus, "NEEDS_REVIEW");
  assert(admission.row.qcIssues.some(row => row.resolvedAt === null));
  const raw = structuredClone(f.raw); raw.translation!.rows[0].qcIssues[0].message += " ပြောင်းလဲချက်";
  f.context.source = validateSourceSnapshot(raw, scope);
  assert.throws(() => composeSyntheticNarration(f.context));
  mutateDraft(draft => { draft.beats[0].claims[0].translationContextRefs[0].rowContextHash = "0".repeat(64); });
});

test("invention, dialogue attribution, certainty and fabricated lineage are rejected even with valid IDs", () => {
  mutateDraft(draft => { draft.beats[1].narration[0].text = "သူသည် သေချာပေါက် လက်စားချေရန် ဆုံးဖြတ်လိုက်သည်။"; });
  mutateDraft(draft => { draft.beats[0].narration[0].text += " သူက ‘ငါပြန်လာမည်’ ဟု ပြောလိုက်သည်။"; });
  mutateDraft(draft => { draft.beats[1].claims[0] = { ...draft.beats[0].claims[0], id: draft.beats[1].claims[0].id }; });
  mutateDraft(draft => { draft.paragraphs[1].uncertainty = "OBSERVED_ONLY"; });
  mutateDraft(draft => { draft.claimLineage[0].candidateFindingIds = ["missing-finding"]; });
  mutateDraft(draft => { draft.claimLineage[0].change = "NEW_HUMAN_CLAIM"; });
  mutateDraft(draft => { draft.beats[0].claims[0].statement = "မရှိခဲ့သော ဖြစ်ရပ်"; });
  const f = narrationFixture();
  f.candidate.findings[1].statement = "သူသည် သေချာပေါက် လက်စားချေလိုသည်။"; f.refresh();
  rejected(() => composeSyntheticNarration(f.context), "INFERENCE_INVALID");
});

test("competing interpretations and conflict/decision/consequence candidates stay qualified", () => {
  const f = narrationFixture(), inferred = f.candidate.findings[1];
  inferred.uncertainty = "COMPETING";
  f.candidate.findings.push({ ...structuredClone(inferred), id: "other-motive", statement: "မိမိကိုယ်ကို ကာကွယ်လိုခြင်း ရှိနိုင်သည်။" });
  const first = [inferred.id, "other-motive"].sort();
  f.candidate.contradictions.push({ firstFindingId: first[0], secondFindingId: first[1], explanation: "အဓိပ္ပာယ်ဖွင့်ဆိုချက် နှစ်မျိုး ရှိသည်။" });
  for (const category of ["CONFLICT", "DECISION", "CONSEQUENCE"] as const)
    f.candidate.findings.push({ ...structuredClone(inferred), id: `synthetic-${category}`, category, uncertainty: "POSSIBLE" });
  f.refresh();
  const draft = composeSyntheticNarration(f.context);
  assert.equal(draft.payload.paragraphs[1].uncertainty, "COMPETING_INTERPRETATIONS");
  assert(draft.payload.beats[1].narration[0].text.includes("အခြားဖြစ်နိုင်ခြေ"));
  assert(draft.payload.sections.some(row => row.focus === "PSYCHOLOGICAL_TENSION"));
  assert(draft.payload.sections.some(row => row.focus === "DECISION"));
  assert(draft.payload.sections.some(row => row.focus === "CONSEQUENCE"));
});

test("strict objects, unknown fields, invalid Unicode, duplicates and sequences fail safely", () => {
  mutateDraft(draft => { Object.assign(draft, { trusted: true }); }, "UNKNOWN_FIELDS");
  mutateDraft(draft => { Object.assign(draft.beats[0].claims[0], { sourceVerified: true }); }, "UNKNOWN_FIELDS");
  mutateDraft(draft => { draft.beats[0].narration[0].text = "\ud800"; });
  mutateDraft(draft => { draft.beats[0].narration[0].text += "\u202e"; }, "INVALID_TEXT");
  mutateDraft(draft => { draft.sections[0].order = 3; });
  mutateDraft(draft => { draft.sections.reverse(); });
  mutateDraft(draft => { draft.beats[1].id = draft.beats[0].id; }, "DUPLICATE_ID");
  mutateDraft(draft => { draft.sections[1].id = draft.sections[0].id; });
  mutateDraft(draft => { Object.defineProperty(draft, "origin", { enumerable: true, get() { assert.fail("Getter must not execute"); } }); });
  rejected(() => validateSyntheticNarrationDraft(null, narrationFixture().context), "INVALID_OBJECT");
});

test("Myanmar narration at the Unicode ceiling passes, exceeding it fails without truncation", () => {
  const f = narrationFixture();
  f.candidate.findings[1].statement = "က"; f.refresh();
  const initial = composeSyntheticNarration(f.context);
  const overhead = [...initial.payload.beats[1].narration[0].text].length - 1;
  f.candidate.findings[1].statement = "က".repeat(NARRATION_DRAFT.maxTextPerBeat - overhead); f.refresh();
  const atLimit = composeSyntheticNarration(f.context);
  assert.equal([...atLimit.payload.beats[1].narration[0].text].length, NARRATION_DRAFT.maxTextPerBeat);
  f.candidate.findings[1].statement += "က"; f.refresh();
  rejected(() => composeSyntheticNarration(f.context), "SIZE_LIMIT");
  mutateDraft(draft => { draft.sections[0].heading = "က".repeat(NARRATION_DRAFT.maxHeading + 1); }, "SIZE_LIMIT");
  mutateDraft(draft => { draft.beats[0].narration[0].text = "က".repeat(NARRATION_DRAFT.maxTextPerBeat + 1); }, "SIZE_LIMIT");
});

test("duration remains honestly unavailable; negative, fractional, invented budgets and source times fail", () => {
  const f = narrationFixture(), draft = composeSyntheticNarration(f.context);
  assert.equal(draft.payload.duration.budgetMs, null);
  assert(draft.payload.paragraphs.every(row => row.pacing.estimatedDurationMs === null && row.pacing.targetDurationMs === null));
  for (const value of [-1, 1.5, NaN, 5000]) {
    mutateDraft(draft => { draft.paragraphs[0].pacing.targetDurationMs = value; });
    mutateDraft(draft => { Object.assign(draft.duration, { budgetMs: value }); });
  }
  mutateDraft(draft => { draft.beats[0].endMs = 25000; }, "INVALID_INTERVAL");
  mutateDraft(draft => { draft.beats[0].startMs = -1; }, "INVALID_NUMBER");
  mutateDraft(draft => { draft.beats[0].endMs = 0; }, "INVALID_INTERVAL");
});

test("stable canonical hashes and section IDs survive duplicate composition without normalizing Unicode", () => {
  const f = narrationFixture(), one = composeSyntheticNarration(f.context), two = composeSyntheticNarration(structuredClone(f.context));
  assert.deepEqual(one, two);
  const reordered = Object.fromEntries(Object.entries(one.payload).reverse());
  assert.equal(validateSyntheticNarrationDraft(reordered, f.context).draftHash, one.draftHash);
  assert.equal(one.payload.beats[0].claims[0].statement, f.source.payload.transcript.segments[0].text);
  f.candidate.findings[1].statement += " ပြောင်းလဲချက်။"; f.refresh();
  const changed = composeSyntheticNarration(f.context);
  assert.notEqual(changed.draftHash, one.draftHash);
  assert.equal(changed.payload.sections[1].id, one.payload.sections[1].id);
  rejected(() => validateSyntheticNarrationDraft(one.payload, f.context));
});

test("provider-neutral speech text is bounded and expressly ineligible for audio generation", () => {
  const f = narrationFixture(), draft = composeSyntheticNarration(f.context), speech = prepareNarrationSpeechText(draft, f.context);
  assert.equal(speech.language, "my"); assert.equal(speech.eligibleForSynthesis, false);
  assert.equal(speech.reason, "PROVISIONAL_SYNTHETIC_DRAFT");
  assert.equal(speech.sections[0].sectionId, draft.payload.sections[0].id);
  assert.equal(speech.sections[0].text, draft.payload.beats[0].narration[0].text);
  assert(speech.sections.every(row => row.estimatedDurationMs === null));
  rejected(() => prepareNarrationSpeechText({ ...draft, draftHash: "0".repeat(64) }, f.context), "STALE_CONTEXT");
  mutateDraft(draft => { Object.assign(draft.review, { approval: "APPROVED" }); }, "INVALID_ENUM");
  mutateDraft(draft => { draft.origin = "HUMAN_EDIT"; }, "INVALID_ENUM");
});

test("empty evidence, more than 60 findings and non-Myanmar inference fixtures fail without filler", () => {
  const f = narrationFixture(); f.candidate.findings = []; f.refresh();
  rejected(() => composeSyntheticNarration(f.context), "SIZE_LIMIT");
  const many = narrationFixture();
  const observed = many.candidate.findings[0];
  many.candidate.findings = Array.from({ length: 61 }, (_, i) => ({ ...structuredClone(observed), id: `finding-${i}` }));
  many.refresh(); rejected(() => composeSyntheticNarration(many.context), "SIZE_LIMIT");
  const english = narrationFixture(); english.candidate.findings[1].statement = "Unsupported English template"; english.refresh();
  rejected(() => composeSyntheticNarration(english.context), "INVALID_TEXT");
});

test("narration stays pure, uninstalled and has no database, network, provider or approval-issuer imports", async () => {
  for (const name of await readdir("lib/storyline/narration")) {
    if (!name.endsWith(".ts")) continue;
    const source = await readFile(`lib/storyline/narration/${name}`, "utf8");
    assert.doesNotMatch(source, /from\s+["'](?:pg|@prisma|@openrouter|ioredis|bullmq|https?|node:(?:https?|net|fs)|.*(?:prisma|human-verification|verification-issuer))["']/);
    assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|invokeStoryFakeWire\s*\(|\.\$transaction\s*\(/);
  }
});
