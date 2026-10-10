import "server-only";
import { createWriteStream } from "node:fs";
import { writeFile, rm } from "node:fs/promises";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { localStorage } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { BURN_IN_PROFILE, RenderError } from "./contracts";
import { canonicalJson, hashRenderRecipe, sha256, type PreparedRenderSnapshot } from "./snapshot";
import { fingerprintSourceMedia } from "./source-media";
import { assertDiskBudget, createAttemptDirectory, hashFile, MAX_SOURCE_BYTES, newOutputKey, validOutputKey } from "./files";
import { probeMedia, supportedSource, verifyOutput } from "./probe";
import { prepareMyanmarFont } from "./fonts";
import { runSupervised } from "./runner";
import { attemptControl, completeRenderAttempt, ownedAttempt, recordPublication, updateRenderProgress, type Publication } from "./lifecycle";
import type { RenderJobReference } from "./job-contract";
import { localInputArgs } from "@/lib/media";

export function validatedSnapshot(value: unknown, expected: { recipeHash: string; movieId: string }) {
  try {
    const snapshot = value as PreparedRenderSnapshot["snapshot"];
    if (snapshot.version !== 1 || snapshot.recipeHash !== expected.recipeHash || hashRenderRecipe(snapshot.recipe) !== expected.recipeHash ||
      snapshot.recipe.movieId !== expected.movieId || canonicalJson(snapshot.recipe.profile) !== canonicalJson(BURN_IN_PROFILE)) throw new Error();
    const media = snapshot.recipe.sourceMedia;
    if (!Number.isSafeInteger(media.sizeBytes) || media.sizeBytes <= 0 || media.sizeBytes > MAX_SOURCE_BYTES) throw new Error();
    for (const kind of ["srt", "ass"] as const) {
      const entry = snapshot.subtitles[kind];
      if (entry.encoding !== "utf8" || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 1 || entry.sizeBytes > 16 * 1024 ** 2 || entry.bytesBase64.length > 24 * 1024 ** 2) throw new Error();
      const bytes = Buffer.from(entry.bytesBase64, "base64");
      if (bytes.toString("base64") !== entry.bytesBase64 || bytes.length !== entry.sizeBytes || sha256(bytes) !== entry.sha256 || entry.sha256 !== snapshot.recipe.subtitleChecksums[kind]) throw new Error();
      if (new TextDecoder("utf-8", { fatal: true }).decode(bytes).includes("\u0000")) throw new Error();
    }
    return snapshot;
  } catch { throw new RenderError("SUBTITLE_SNAPSHOT_INVALID"); }
}
export function encodingArguments(source: string, hasAudio: boolean, outputLimit: number) {
  return ["-hide_banner", "-nostdin", "-loglevel", "warning", "-n", "-max_alloc", "268435456", "-threads", "2", "-filter_threads", "1", "-noautorotate",
    ...localInputArgs(source), "-map", "0:v:0", ...(hasAudio ? ["-map", "0:a:0"] : ["-an"]), "-map_metadata", "-1", "-map_chapters", "-1",
    "-vf", "ass=subtitles.ass:shaping=complex", "-c:v", BURN_IN_PROFILE.videoCodec, "-preset", BURN_IN_PROFILE.preset, "-crf", String(BURN_IN_PROFILE.crf),
    "-pix_fmt", BURN_IN_PROFILE.pixelFormat, "-threads:v", "2", ...(hasAudio ? ["-c:a", "aac", "-b:a", BURN_IN_PROFILE.audioBitrate, "-threads:a", "1"] : []),
    "-movflags", "+faststart", "-fs", String(outputLimit), "-progress", "pipe:1", "-nostats", "-f", "mp4", "output.mp4"];
}
export async function executeRenderAttempt(reference: RenderJobReference, token: string, controller: AbortController) {
  const job = await prisma.renderJob.findUniqueOrThrow({ where: { id: reference.renderJobId }, include: { movie: true, dispatch: true } });
  const snapshot = validatedSnapshot(job.snapshot, job);
  if (job.movie.projectId !== snapshot.recipe.projectId) throw new RenderError("PROJECT_MOVIE_MISMATCH");
  if (job.movie.storageKey !== snapshot.recipe.sourceMedia.storageKey) throw new RenderError("SOURCE_MEDIA_CHANGED");
  const signal = controller.signal;
  const phase = async (value: "preparing" | "encoding" | "verifying" | "publishing") => {
    if (signal.aborted || !await updateRenderProgress(reference, token, value)) { controller.abort(); throw new RenderError("RENDER_FAILED"); }
  };
  await phase("preparing");
  const media = await fingerprintSourceMedia(job.movie.storageKey);
  if (canonicalJson(media) !== canonicalJson(snapshot.recipe.sourceMedia)) throw new RenderError("SOURCE_MEDIA_CHANGED");
  const directory = await createAttemptDirectory();
  let pendingProgress: Promise<unknown> = Promise.resolve();
  try {
    const outputLimit = await assertDiskBudget(media.sizeBytes);
    const sourceName = `source${extname(media.storageKey)}`;
    const sourcePath = join(directory, sourceName);
    let copied = 0;
    await pipeline(await localStorage.open(media.storageKey), new Transform({ transform(chunk: Buffer, _encoding, callback) {
      copied += chunk.length;
      callback(copied > media.sizeBytes ? new RenderError("SOURCE_MEDIA_CHANGED") : null, chunk);
    } }), createWriteStream(sourcePath, { flags: "wx", mode: 0o600 }), { signal });
    const staged = await hashFile(sourcePath, MAX_SOURCE_BYTES);
    if (staged.sizeBytes !== media.sizeBytes || staged.sha256 !== media.sha256) throw new RenderError("SOURCE_MEDIA_CHANGED");
    const source = supportedSource(await probeMedia(sourcePath));
    if (source.durationMs !== media.durationMs || source.width !== media.width || source.height !== media.height || source.hasAudio !== media.hasAudio) throw new RenderError("SOURCE_MEDIA_CHANGED");

    const previous = job.dispatch?.publication as unknown as Publication | null;
    if (previous && previous.recipeHash === job.recipeHash && validOutputKey(previous.storageKey)) {
      try {
        await phase("verifying");
        const measured = await verifyOutput(await localStorage.localPath(previous.storageKey), source);
        if (measured.sha256 !== previous.sha256 || measured.sizeBytes !== previous.sizeBytes) throw new RenderError("OUTPUT_INVALID");
        await phase("publishing");
        if (await completeRenderAttempt(reference, token, { ...measured, recipeHash: job.recipeHash, storageKey: previous.storageKey }, snapshot.recipe.projectId, media.storageKey)) return;
        throw new RenderError("RENDER_FAILED");
      } catch (error) {
        if (signal.aborted || error instanceof RenderError && !["OUTPUT_INVALID"].includes(error.code)) throw error;
        // Missing/corrupt candidate is never treated as completion. A new random
        // key replaces its durable intent; orphan cleanup handles the old key.
      }
    }
    const fontConfig = await prepareMyanmarFont(directory, snapshot.recipe.selected.map((s) => s.text).join("\n"), signal);
    await writeFile(join(directory, "subtitles.ass"), Buffer.from(snapshot.subtitles.ass.bytesBase64, "base64"), { flag: "wx", mode: 0o600 });
    await phase("encoding");
    let last = 0; let writing = false;
    await runSupervised({ cwd: directory, fontConfig, signal, outputLimit, durationMs: source.durationMs,
      authorize: async () => { const control = await attemptControl(reference, token); return control.owned && !control.cancel; },
      args: encodingArguments(sourceName, source.hasAudio, outputLimit), progress(percent) {
        if (writing || Date.now() - last < 2000 || signal.aborted) return;
        writing = true; last = Date.now();
        pendingProgress = updateRenderProgress(reference, token, "encoding", percent).then((owned) => { if (!owned) controller.abort(); }).catch(() => controller.abort()).finally(() => { writing = false; });
      } });
    await pendingProgress;
    await phase("verifying");
    const outputPath = join(directory, "output.mp4");
    const verified = await verifyOutput(outputPath, source);
    const publication: Publication = { ...verified, recipeHash: job.recipeHash, storageKey: newOutputKey() };
    await phase("publishing");
    if (!await recordPublication(reference, token, publication)) throw new RenderError("RENDER_FAILED");
    // Intent precedes exclusive atomic publication. A crash is recoverable using
    // this key without regenerating or selecting any current subtitle content.
    await prisma.$transaction(async (tx) => {
      const owner = await ownedAttempt(tx, reference, token);
      if (!owner || owner.cancelRequestedAt || signal.aborted) throw new RenderError("RENDER_FAILED");
      await localStorage.publishRenderFile(publication.storageKey, outputPath, async () => {
        const current = await ownedAttempt(tx, reference, token);
        return !!current && !current.cancelRequestedAt && !signal.aborted;
      });
    }, { timeout: 30_000 });
    const publishedPath = await localStorage.localPath(publication.storageKey);
    const measured = await verifyOutput(publishedPath, source);
    if (measured.sha256 !== publication.sha256 || measured.sizeBytes !== publication.sizeBytes) throw new RenderError("OUTPUT_INVALID");
    if (signal.aborted || !await completeRenderAttempt(reference, token, publication, snapshot.recipe.projectId, media.storageKey)) throw new RenderError("RENDER_FAILED");
  } finally { await pendingProgress; await rm(directory, { recursive: true, force: true }); }
}
