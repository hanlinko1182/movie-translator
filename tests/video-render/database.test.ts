import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { prisma, disconnectPrisma } from "@/lib/prisma";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { BURN_IN_PROFILE, RenderError } from "@/lib/video-render/contracts";
import { createRenderJobSnapshot } from "@/lib/video-render/service";
import { fingerprintSourceMedia } from "@/lib/video-render/source-media";
import type { PreparedRenderSnapshot } from "@/lib/video-render/snapshot";

// Explicit opt-in. Only temporary DB rows are written; existing source bytes are read.
test("PostgreSQL integration: immutable snapshots, content deduplication, scope and isolation", { skip: process.env.RUN_RENDER_DB_TESTS !== "1" }, async () => {
  const id = `render-test-${randomUUID()}`;
  const otherId = `render-test-${randomUUID()}`;
  const originalProjects = await prisma.project.findMany({ orderBy: { id: "asc" } });
  const originalMovies = await prisma.movie.findMany({ orderBy: { id: "asc" } });
  const counts = async () => ({ jobs: await prisma.renderJob.count(), outputs: await prisma.renderOutput.count(), transcripts: await prisma.transcript.count(), translations: await prisma.translation.count(), memory: await prisma.translationMemoryEntry.count(), qc: await prisma.translationQcIssue.count() });
  const beforeCounts = await counts();
  try {
    const source = originalMovies.find((movie) => movie.id === "77721d20-f7a2-41af-8fb0-832207072432" && movie.storageKey) ?? originalMovies.find((movie) => movie.storageKey);
    assert.ok(source?.storageKey, "A real uploaded source is required for this explicitly enabled integration test");
    const mediaBefore = await fingerprintSourceMedia(source.storageKey);
    await prisma.project.create({ data: { id, name: "Temporary render foundation test", slug: id } });
    await prisma.project.create({ data: { id: otherId, name: "Temporary unrelated render test", slug: otherId } });
    const movie = await prisma.movie.create({ data: { projectId: id, title: "Temporary read-only source reference", storageKey: source.storageKey } });
    const sources = ["你好", "再见", "谢谢"].map((text, sequence) => ({ sequence, text, startMs: sequence * 1000, endMs: sequence * 1000 + 800 }));
    const transcript = await prisma.transcript.create({ data: { movieId: movie.id, provider: "fixture", model: "fixture", text: sources.map((row) => row.text).join("\n"), segments: { create: sources } } });
    const translation = await prisma.translation.create({ data: {
      movieId: movie.id, sourceTranscriptId: transcript.id, provider: "fixture", model: "fixture", sourceLanguage: "zh", targetLanguage: "my", qcScannedAt: new Date(),
      segments: { create: sources.map((row, index) => ({ sequence: row.sequence, startMs: row.startMs, endMs: row.endMs,
        text: ["လူပြင်ထားသော စာသား", "စစ်ဆေးရန်", "ကျေးဇူးတင်ပါတယ်"][index],
        origin: index === 0 ? "MANUAL" : "MODEL", reviewStatus: index === 1 ? "NEEDS_REVIEW" : "APPROVED",
        manualSourceHash: index === 0 ? sourceTextHash(row.text) : null,
        editedAt: index === 0 ? new Date() : null, reviewedAt: index === 1 ? null : new Date(),
        qcIssues: index === 0 ? { create: { category: "POSSIBLE_OMISSION", severity: "WARNING", message: "Fixture manual finding", source: "MANUAL" } } : undefined,
      })) },
    } });
    await prisma.translationMemoryEntry.create({ data: { projectId: id, sourceText: sources[0].text, targetText: "လူပြင်ထားသော စာသား", sourceLanguage: "zh", targetLanguage: "my", sourceHash: sourceTextHash(sources[0].text), origin: "MANUAL" } });
    const request = { projectId: id, movieId: movie.id, mode: "BURN_IN", scope: "ALL_CURRENT", profileId: BURN_IN_PROFILE.id };
    const readDomain = async () => ({
      translation: await prisma.translation.findUnique({ where: { id: translation.id }, include: { segments: { orderBy: { sequence: "asc" }, include: { qcIssues: true } } } }),
      transcript: await prisma.transcript.findUnique({ where: { id: transcript.id }, include: { segments: { orderBy: { sequence: "asc" } } } }),
      memory: await prisma.translationMemoryEntry.findMany({ where: { projectId: id } }),
    });
    const domainBefore = await readDomain();
    const [first, duplicate] = await Promise.all([createRenderJobSnapshot(request), createRenderJobSnapshot(request)]);
    assert.equal(first.id, duplicate.id);
    assert.equal(first.state, "QUEUED");
    assert.equal(await prisma.renderOutput.count({ where: { renderJobId: first.id } }), 0);
    assert.deepEqual(await readDomain(), domainBefore);
    const frozen = first.snapshot as unknown as PreparedRenderSnapshot["snapshot"];
    assert.equal(frozen.rows[0].origin, "MANUAL");
    assert.equal(frozen.rows[0].text, "လူပြင်ထားသော စာသား");
    assert.equal(frozen.rows[0].qcIssues[0].source, "MANUAL");
    assert.deepEqual(frozen.recipe.sourceMedia, mediaBefore);
    const approved = await createRenderJobSnapshot({ ...request, scope: "APPROVED_ONLY" });
    const approvedSnapshot = approved.snapshot as unknown as PreparedRenderSnapshot["snapshot"];
    assert.deepEqual(approvedSnapshot.rows.map((row) => [row.sequence, row.startMs, row.endMs]), [[0, 0, 800], [2, 2000, 2800]]);
    assert.notEqual(first.recipeHash, approved.recipeHash);

    // Simulate an already-persisted Sol result on TEMPORARY rows, no provider call.
    await prisma.translatedSegment.update({ where: { translationId_sequence: { translationId: translation.id, sequence: 1 } }, data: { text: "ပြန်လည်ပြင်ဆင်ထားသည်", origin: "REFINED", refinementJobId: "same-generation" } });
    const refined = await createRenderJobSnapshot(request);
    assert.notEqual(first.recipeHash, refined.recipeHash);
    assert.equal((refined.snapshot as unknown as PreparedRenderSnapshot["snapshot"]).translation.revision, frozen.translation.revision);
    assert.deepEqual((await prisma.renderJob.findUniqueOrThrow({ where: { id: first.id } })).snapshot, first.snapshot);
    const jobCount = await prisma.renderJob.count({ where: { movieId: movie.id } });
    await assert.rejects(createRenderJobSnapshot({ ...request, projectId: otherId }), (error: unknown) => error instanceof RenderError && error.code === "PROJECT_MOVIE_MISMATCH");
    await assert.rejects(createRenderJobSnapshot({ ...request, options: ["-vf", "arbitrary"] }), RenderError);
    assert.equal(await prisma.renderJob.count({ where: { movieId: movie.id } }), jobCount);
    await assert.rejects(prisma.renderJob.update({ where: { id: first.id }, data: { snapshot: { changed: true } } }));
    assert.deepEqual((await prisma.renderJob.findUniqueOrThrow({ where: { id: first.id } })).snapshot, first.snapshot);
    await prisma.renderJob.update({ where: { id: first.id }, data: { state: "CANCELLED", cancelledAt: new Date() } });
    const retained = await createRenderJobSnapshot({ ...request, scope: "APPROVED_ONLY" });
    assert.equal(retained.id, approved.id);
    assert.equal(await prisma.renderOutput.count({ where: { renderJob: { movieId: movie.id } } }), 0);
    assert.deepEqual(await fingerprintSourceMedia(source.storageKey), mediaBefore);
    await prisma.movie.update({ where: { id: movie.id }, data: { storageKey: null } });
    await assert.rejects(createRenderJobSnapshot(request), (error: unknown) => error instanceof RenderError && error.code === "SOURCE_MEDIA_MISSING");
    assert.equal(await prisma.renderJob.count({ where: { movieId: movie.id } }), jobCount);
  } finally {
    // Only the two known temporary identities can be deleted; source files are untouched.
    await prisma.movie.deleteMany({ where: { projectId: { in: [id, otherId] } } });
    await prisma.project.deleteMany({ where: { id: { in: [id, otherId] } } });
    try {
      assert.deepEqual(await prisma.project.findMany({ orderBy: { id: "asc" } }), originalProjects);
      assert.deepEqual(await prisma.movie.findMany({ orderBy: { id: "asc" } }), originalMovies);
      assert.deepEqual(await counts(), beforeCounts);
    } finally { await disconnectPrisma(); }
  }
});
