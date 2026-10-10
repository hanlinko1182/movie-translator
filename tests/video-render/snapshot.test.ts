import assert from "node:assert/strict";
import { test } from "node:test";
import { BURN_IN_PROFILE, assertRenderTransition, parseRenderFailureCode, parseRenderRequest, parseRenderState, RenderError, type RenderRequest } from "@/lib/video-render/contracts";
import { buildRenderSnapshot, canonicalJson, hashRenderRecipe, sha256, type SourceMediaIdentity } from "@/lib/video-render/snapshot";
import type { TranslationSnapshot } from "@/lib/translation-qc/service";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { SubtitleExportError } from "@/lib/subtitle-export/types";
import { formatSrt } from "@/lib/subtitle-export/srt";
import { formatAss } from "@/lib/subtitle-export/ass";

const request: RenderRequest = { projectId: "project-1", movieId: "movie-1", mode: "BURN_IN", scope: "ALL_CURRENT", profileId: BURN_IN_PROFILE.id };
const media: SourceMediaIdentity = { storageKey: "movies/00000000-0000-4000-8000-000000000001.mp4", sha256: sha256("source bytes"), sizeBytes: 12, durationMs: 8000, width: 1920, height: 1080, hasAudio: true };
function fixture(): TranslationSnapshot {
  const date = new Date("2026-10-10T00:00:00Z");
  const sources = ["你好", "再见", "谢谢"].map((text, sequence) => ({ sequence, text, startMs: sequence * 2000, endMs: sequence * 2000 + 1500 }));
  return { id: "movie-1", projectId: "project-1", sourceLanguage: "zh", transcript: { id: "transcript-1", segments: sources },
    translation: { id: "translation-1", movieId: "movie-1", sourceTranscriptId: "transcript-1", provider: "openrouter", model: "openai/gpt-6-luna", sourceLanguage: "zh", targetLanguage: "my", revision: 3, qcScannedAt: date, createdAt: date, updatedAt: date,
      segments: sources.map((source, index) => ({
        id: `segment-${index}`, translationId: "translation-1", sequence: source.sequence, startMs: source.startMs, endMs: source.endMs,
        text: ["မင်္ဂလာပါ", "နှုတ်ဆက်ပါတယ်", "ကျေးဇူးတင်ပါတယ်"][index], provider: "openrouter", model: "openai/gpt-6-luna", origin: "MODEL",
        refinementJobId: null, reviewStatus: index === 1 ? "NEEDS_REVIEW" : "APPROVED", revision: 0, editedAt: null, reviewedAt: date, manualSourceHash: null, createdAt: date, qcIssues: [],
      })) },
  };
}

test("All Current and Approved Only reuse selection/serializers and preserve approval gaps", () => {
  const movie = fixture();
  const all = buildRenderSnapshot(request, movie, media);
  const approved = buildRenderSnapshot({ ...request, scope: "APPROVED_ONLY" }, movie, media);
  assert.deepEqual(all.snapshot.rows.map((row) => row.sequence), [0, 1, 2]);
  assert.deepEqual(approved.snapshot.rows.map((row) => [row.sequence, row.startMs, row.endMs]), [[0, 0, 1500], [2, 4000, 5500]]);
  assert.deepEqual(approved.snapshot.reviewSummary, { total: 3, approved: 2, needsReview: 1, unreviewed: 0 });
  for (const prepared of [all, approved]) {
    assert.equal(Buffer.from(prepared.snapshot.subtitles.srt.bytesBase64, "base64").toString("utf8"), formatSrt(prepared.snapshot.rows));
    assert.equal(Buffer.from(prepared.snapshot.subtitles.ass.bytesBase64, "base64").toString("utf8"), formatAss(prepared.snapshot.rows));
    for (const file of Object.values(prepared.snapshot.subtitles)) {
      const bytes = Buffer.from(file.bytesBase64, "base64");
      assert.equal(sha256(bytes), file.sha256);
      assert.equal(bytes.length, file.sizeBytes);
    }
  }
  assert.notEqual(all.recipeHash, approved.recipeHash);
});

test("human text, historical provenance and advisory QC freeze without mutation", () => {
  const movie = fixture();
  const row = movie.translation.segments[0];
  row.origin = "MANUAL";
  row.text = " လူပြင်ထားသော စာသား\r\nဒုတိယစာကြောင်း {\\N} ";
  row.manualSourceHash = sourceTextHash(movie.transcript.segments[0].text);
  row.editedAt = new Date(); row.reviewStatus = "NEEDS_REVIEW"; row.reviewedAt = null;
  row.qcIssues = [{ id: "issue-1", translatedSegmentId: row.id, category: "POSSIBLE_OMISSION", severity: "ERROR", source: "MANUAL", message: "Human finding", resolvedAt: null, resolution: null, createdAt: new Date(), updatedAt: new Date() }];
  const before = JSON.stringify(movie);
  const result = buildRenderSnapshot(request, movie, media);
  assert.equal(JSON.stringify(movie), before);
  assert.equal(result.snapshot.rows[0].origin, "MANUAL");
  assert.equal(result.snapshot.rows[0].text, row.text);
  assert.equal(result.snapshot.rows[0].subtitleText, row.text.replace(/\r\n/g, "\n"));
  assert.equal(result.snapshot.rows[0].model, "openai/gpt-6-luna");
  assert.equal(result.snapshot.rows[0].qcIssues[0].source, "MANUAL");
  assert.equal(result.snapshot.rows[0].reviewStatus, "NEEDS_REVIEW");
  assert.ok(Object.isFrozen(result.snapshot.rows[0].qcIssues));
  assert.throws(() => { result.snapshot.rows[0].text = "overwrite"; }, TypeError);
  row.text = "Later edit";
  assert.notEqual(result.snapshot.rows[0].text, row.text);
});

test("Sol content changes invalidate identity even with unchanged generation and revisions", () => {
  const movie = fixture();
  const before = buildRenderSnapshot(request, movie, media);
  movie.translation.segments[0].origin = "REFINED";
  movie.translation.segments[0].refinementJobId = "unchanged-generation";
  movie.translation.segments[0].text += " ပြင်ဆင်ချက်";
  const after = buildRenderSnapshot(request, movie, media);
  assert.equal(before.snapshot.translation.revision, after.snapshot.translation.revision);
  assert.equal(before.snapshot.rows[0].segmentRevision, after.snapshot.rows[0].segmentRevision);
  assert.notEqual(before.recipeHash, after.recipeHash);
});

test("stable canonical recipe ignores capture times and audit-only changes", () => {
  const movie = fixture();
  const first = buildRenderSnapshot(request, movie, media, new Date("2026-01-01"));
  movie.translation.revision++;
  movie.translation.segments[0].revision++;
  movie.translation.segments[0].reviewedAt = new Date();
  const second = buildRenderSnapshot(request, movie, media);
  assert.equal(first.recipeHash, second.recipeHash);
  assert.equal(first.deduplicationKey, second.deduplicationKey);
  assert.equal(canonicalJson({ b: [2, 1], a: "မြန်မာ" }), canonicalJson({ a: "မြန်မာ", b: [2, 1] }));
  assert.throws(() => canonicalJson({ invalid: undefined }), RenderError);
});

test("source bytes/key, subtitle timing/text, scope and profile settings affect identity", () => {
  const base = buildRenderSnapshot(request, fixture(), media);
  for (const replacement of [{ ...media, sha256: sha256("replacement") }, { ...media, storageKey: "movies/00000000-0000-4000-8000-000000000002.mp4" }]) {
    assert.notEqual(base.recipeHash, buildRenderSnapshot(request, fixture(), replacement).recipeHash);
  }
  for (const change of ["text", "timing"] as const) {
    const movie = fixture();
    if (change === "text") movie.translation.segments[0].text += " ပြောင်းလဲ";
    else { movie.translation.segments[0].endMs++; movie.transcript.segments[0].endMs++; }
    assert.notEqual(base.recipeHash, buildRenderSnapshot(request, movie, media).recipeHash);
  }
  const nextProfile = structuredClone(base.snapshot.recipe);
  // Future profile versions must change identity; the current request parser still rejects them.
  const differentProfile = { ...nextProfile, profile: { ...nextProfile.profile, version: 2, crf: 21 } };
  assert.notEqual(base.recipeHash, hashRenderRecipe(differentProfile));
});

test("wrong relationship, stale manual source, invalid media and empty selections fail safely", () => {
  assert.throws(() => buildRenderSnapshot({ ...request, projectId: "other" }, fixture(), media), (error: unknown) => error instanceof RenderError && error.code === "PROJECT_MOVIE_MISMATCH");
  assert.throws(() => buildRenderSnapshot({ ...request, movieId: "other" }, fixture(), media), RenderError);
  const manual = fixture(); manual.translation.segments[0].origin = "MANUAL";
  assert.throws(() => buildRenderSnapshot(request, manual, media), RenderError);
  for (const invalid of [{ ...media, sha256: "invalid" }, { ...media, sizeBytes: 0 }, { ...media, width: -1 }, { ...media, storageKey: "../private.mp4" }]) assert.throws(() => buildRenderSnapshot(request, fixture(), invalid), RenderError);
  const empty = fixture(); empty.translation.segments.forEach((row) => { row.reviewStatus = "UNREVIEWED"; });
  assert.throws(() => buildRenderSnapshot({ ...request, scope: "APPROVED_ONLY" }, empty, media), (error: unknown) => error instanceof SubtitleExportError && error.code === "NO_APPROVED_SUBTITLES");
  empty.translation.segments = [];
  assert.throws(() => buildRenderSnapshot(request, empty, media), SubtitleExportError);
});

test("strict requests reject malformed input, options, filenames, unknown fields and unsupported modes", () => {
  assert.deepEqual(parseRenderRequest(request), request);
  for (const input of [null, [], "text", {}, { ...request, options: ["-vf"] }, { ...request, storageKey: "/etc/passwd" }, { ...request, movieId: "../movie" }, { ...request, projectId: " space " }, { ...request, movieId: 123 }, { ...request, scope: "all" }, { ...request, mode: "SOFT_SUBTITLE" }, { ...request, profileId: "arbitrary" }]) assert.throws(() => parseRenderRequest(input), RenderError);
});

test("render state and controlled failure contracts reject unknown values and unsafe transitions", () => {
  assert.equal(parseRenderState("CANCELLED"), "CANCELLED");
  assert.equal(parseRenderFailureCode("SOURCE_MEDIA_CHANGED"), "SOURCE_MEDIA_CHANGED");
  assert.throws(() => parseRenderState("PROCESSING"), RenderError);
  assert.throws(() => parseRenderFailureCode("secret or stderr"), RenderError);
  assertRenderTransition("QUEUED", "ACTIVE"); assertRenderTransition("ACTIVE", "COMPLETED"); assertRenderTransition("FAILED", "QUEUED");
  assert.throws(() => assertRenderTransition("COMPLETED", "ACTIVE"), RenderError);
  assert.throws(() => assertRenderTransition("QUEUED", "COMPLETED"), RenderError);
});
