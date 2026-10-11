import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import RenderHistory from "@/components/export/render-history";
import SubtitleExportControls from "@/components/export/subtitle-export-controls";
import { completedRender, renderModes, renderModeLabel, renderProfile, needsRenderPolling, parseRenderItem, renderActions, renderBase, renderDownloadUrl, renderPrerequisite, renderRequest, type RenderItem } from "@/components/export/render-model";

const movieId = "older-movie";
const base = renderBase("real-project-id", movieId);
const job: RenderItem = { id: "render-id", movieId, mode: "BURN_IN", profileId: "myanmar-mp4-cpu-v1", state: "QUEUED", exportMode: "APPROVED_ONLY", execution: "QUEUED", generation: 0, createdAt: "2026-10-11T00:00:00.000Z", phase: null, progressPercent: null, errorCode: null, cancelRequestedAt: null };
const signal = new AbortController().signal;

test("render prerequisites block missing/ambiguous media, unavailable storage and empty subtitle scopes", () => {
  assert.match(renderPrerequisite(false, false, false, false, 0), /Upload/);
  assert.match(renderPrerequisite(true, false, true, true, 1), /Confirm/);
  assert.match(renderPrerequisite(true, true, false, true, 1), /missing/);
  assert.match(renderPrerequisite(true, true, null, true, 1), /could not be checked/);
  assert.match(renderPrerequisite(true, true, true, false, 0), /saved translation/);
  assert.match(renderPrerequisite(true, true, true, true, 0), /selected scope/);
  assert.equal(renderPrerequisite(true, true, true, true, 1), "");
});

test("history GET is read-only; POST is explicit, fixed-profile and scoped to the selected older movie", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init: init! });
    const submitted = init?.body ? JSON.parse(String(init.body)) : null;
    return Response.json({ data: init?.method === "GET" ? { items: [job], limit: 50 } : { ...job, mode: submitted.mode, profileId: submitted.profileId, exportMode: submitted.exportMode } });
  };
  await renderRequest(base, movieId, signal, undefined, fetcher);
  assert.equal(requests[0].init.method, "GET"); assert.equal(requests[0].init.body, undefined);
  assert.equal(requests[0].url, "/api/projects/real-project-id/movies/older-movie/renders");
  assert.equal(requests[0].init.signal, signal); assert.equal(requests[0].init.cache, "no-store");
  for (const mode of renderModes) for (const scope of ["ALL_CURRENT", "APPROVED_ONLY"] as const) {
    const [first] = await renderRequest(base, movieId, signal, { mode, scope }, fetcher);
    const [duplicate] = await renderRequest(base, movieId, signal, { mode, scope }, fetcher);
    assert.equal(first.id, duplicate.id);
    assert.equal(first.mode, mode); assert.equal(first.profileId, renderProfile(mode).id); assert.equal(first.exportMode, scope);
    assert.deepEqual(JSON.parse(requests.at(-1)!.init.body as string), { mode, exportMode: scope, profileId: renderProfile(mode).id });
    assert.equal(requests.at(-1)!.init.method, "POST");
  }
  assert.ok(requests.every((request) => !/openrouter|translation\//i.test(request.url)));
});

test("retry/resume/cancel follow existing lifecycle; cancellation pending cannot repeat or retry", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(init?.method, "POST"); assert.equal(init?.body, "{}");
    assert.match(String(url), /\/renders\/render-id\/(retry|cancel)$/);
    return Response.json({ data: job });
  };
  for (const state of ["QUEUED", "ACTIVE"] as const) await renderRequest(base, movieId, signal, { job: { ...job, state }, operation: "cancel" }, fetcher);
  for (const state of ["FAILED", "CANCELLED"] as const) await renderRequest(base, movieId, signal, { job: { ...job, state, cancelRequestedAt: state === "CANCELLED" ? job.createdAt : null }, operation: "retry" }, fetcher);
  await renderRequest(base, movieId, signal, { job: { ...job, execution: "DEFERRED" }, operation: "retry" }, fetcher);
  assert.equal(calls, 5);
  for (const state of ["COMPLETED", "ACTIVE", "QUEUED"] as const) await assert.rejects(renderRequest(base, movieId, signal, { job: { ...job, state }, operation: "retry" }, fetcher));
  await assert.rejects(renderRequest(base, movieId, signal, { job: { ...job, cancelRequestedAt: job.createdAt }, operation: "cancel" }, fetcher));
  await assert.rejects(renderRequest(base, movieId, signal, { job: { ...job, movieId: "other-movie" }, operation: "cancel" }, fetcher));
  assert.equal(calls, 5);
  assert.deepEqual(renderActions({ ...job, state: "ACTIVE", cancelRequestedAt: job.createdAt }), { cancel: false, retry: false });
});

test("safe metadata allowlist drops internal values and rejects mismatched movie; errors never echo raw server messages", async () => {
  const safe = parseRenderItem({ ...job, snapshot: "private", storageKey: "private", lease: "private", phase: "private-path", progressPercent: -10 }, movieId);
  assert.doesNotMatch(JSON.stringify(safe), /private|snapshot|storageKey|lease/);
  assert.equal(safe.phase, null); assert.equal(safe.progressPercent, null);
  assert.throws(() => parseRenderItem({ ...job, movieId: "newest-movie" }, movieId));
  await assert.rejects(renderRequest(base, movieId, signal, undefined, async () => Response.json({ error: { code: "UNKNOWN", message: "/private/server/path" } }, { status: 503 })), /Render backend unavailable/);
});

test("only live queued/active jobs poll; deferred and terminal states stop", () => {
  assert.equal(needsRenderPolling([job]), true);
  assert.equal(needsRenderPolling([{ ...job, state: "ACTIVE" }]), true);
  for (const state of ["FAILED", "CANCELLED", "COMPLETED"] as const) assert.equal(needsRenderPolling([{ ...job, state }]), false);
  assert.equal(needsRenderPolling([{ ...job, execution: "DEFERRED" }]), false);
  assert.equal(needsRenderPolling([]), false);
});

test("real states and historical download links render without fake progress or prefetch", () => {
  const items = [job, { ...job, id: "active", state: "ACTIVE" as const, progressPercent: 42 }, { ...job, id: "completed", state: "COMPLETED" as const }, { ...job, id: "failed", state: "FAILED" as const }, { ...job, id: "cancelled", state: "CANCELLED" as const }, { ...job, id: "deferred", execution: "DEFERRED" }];
  const html = renderToStaticMarkup(<RenderHistory items={items} base={base} loading={false} error="" notice="" busy="" hasMovie reload={() => {}} operate={() => {}} />);
  for (const label of ["QUEUED", "ACTIVE", "COMPLETED", "FAILED", "CANCELLED", "DEFERRED", "Resume", "Retry", "Cancel", "42%", "Historical snapshot"]) assert.ok(html.includes(label), label);
  assert.match(html, /older-movie\/renders\/completed\/download/);
  assert.match(html, /download=""/); assert.doesNotMatch(html, /100%|up.to.date|storageKey|ETA:|snapshot":/);
  assert.equal(renderDownloadUrl(base, job), null);
});

test("queue loading, empty and backend-unavailable states are distinct", () => {
  const common = { items: [], base, notice: "", busy: "", hasMovie: true, reload: () => {}, operate: () => {} };
  assert.match(renderToStaticMarkup(<RenderHistory {...common} loading error="" />), /Loading render history/);
  assert.match(renderToStaticMarkup(<RenderHistory {...common} loading={false} error="" />), /No render jobs/);
  const unavailable = renderToStaticMarkup(<RenderHistory {...common} loading={false} error="Render backend unavailable" />);
  assert.match(unavailable, /role="alert"/); assert.match(unavailable, /Refresh status/); assert.doesNotMatch(unavailable, /No render jobs/);
});

test("existing Export panels, SRT/ASS and unavailable recap remain; SSR never fetches or submits", () => {
  const html = renderToStaticMarkup(<SubtitleExportControls projectId="real-project-id" projectName="Project" projectHref="/projects/slug?movieId=older-movie" reviewHref="/projects/slug/translation?movieId=older-movie" renderSelectionConfirmed sourceAvailable movie={{ id: movieId, title: "Older selected movie", sourceRecorded: true, filename: "source.mp4", durationSeconds: 6, sourceLanguage: "zh", status: "TRANSLATED", createdAt: job.createdAt }} translation={null} summary={{ total: 0, approved: 0, needsReview: 0, unreviewed: 0 }} filenames={{ srt: "source.srt", ass: "source.ass" }} previews={{ all: null, approved: null }} />);
  for (const label of ["Export Type", "Export Queue", "Export Settings", "Output Files", "Preview &amp; Check", "Export Tips", "Burn-in MP4", "Soft Subtitle MP4", "Download SRT", "Subtitle File (ASS)", "Recap Video", "Not implemented yet"]) assert.ok(html.includes(label), label);
  assert.match(html, /older-movie\/source/); assert.match(html, /xl:grid-cols-12/);
  assert.doesNotMatch(html, /Start Render|newest-movie|render progress/i);
});


test("mode/profile metadata is retained and invalid combinations fail closed", () => {
  for (const mode of renderModes) {
    const item = { ...job, mode, profileId: renderProfile(mode).id };
    assert.deepEqual(parseRenderItem(item, movieId), item);
    assert.throws(() => parseRenderItem({ ...item, profileId: "arbitrary-profile" }, movieId));
  }
  assert.throws(() => parseRenderItem({ ...job, mode: "SOFT_SUBTITLE" }, movieId));
  assert.throws(() => parseRenderItem({ ...job, mode: undefined }, movieId));
  assert.throws(() => parseRenderItem({ ...job, mode: "RECAP" }, movieId));
});

test("completed outputs and history labels stay distinct by mode, not current selection", () => {
  const soft: RenderItem = { ...job, id: "soft", mode: "SOFT_SUBTITLE", profileId: "myanmar-mp4-soft-copy-v1", state: "COMPLETED" };
  const burn: RenderItem = { ...job, id: "burn", state: "COMPLETED" };
  const items = [{ ...soft, id: "new-queued", state: "QUEUED" as const }, soft, burn];
  assert.equal(completedRender(items, "BURN_IN")?.id, "burn");
  assert.equal(completedRender(items, "SOFT_SUBTITLE")?.id, "soft");
  assert.equal(completedRender([burn], "SOFT_SUBTITLE"), undefined);
  const html = renderToStaticMarkup(<RenderHistory items={items} base={base} loading={false} error="" notice="" busy="" hasMovie reload={() => {}} operate={() => {}} />);
  for (const mode of renderModes) assert.ok(html.includes(renderModeLabel(mode)));
  assert.match(html, /aria-label="Download historical Soft Subtitle MP4"/);
  assert.match(html, /aria-label="Download historical Burn-in MP4"/);
  assert.match(html, /renders\/soft\/download/); assert.match(html, /renders\/burn\/download/);
});

test("soft jobs preserve their mode on duplicate reuse, retry, resume, cancel and download", async () => {
  const soft: RenderItem = { ...job, mode: "SOFT_SUBTITLE", profileId: "myanmar-mp4-soft-copy-v1" };
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.method, "POST");
    if (String(url) !== base) assert.equal(init?.body, "{}");
    return Response.json({ data: soft });
  };
  const [first] = await renderRequest(base, movieId, signal, { mode: "SOFT_SUBTITLE", scope: "APPROVED_ONLY" }, fetcher);
  const [duplicate] = await renderRequest(base, movieId, signal, { mode: "SOFT_SUBTITLE", scope: "APPROVED_ONLY" }, fetcher);
  assert.deepEqual(first, duplicate);
  for (const state of ["FAILED", "CANCELLED"] as const) {
    const [retried] = await renderRequest(base, movieId, signal, { job: { ...soft, state }, operation: "retry" }, fetcher);
    assert.equal(retried.mode, "SOFT_SUBTITLE"); assert.equal(retried.profileId, soft.profileId);
  }
  await renderRequest(base, movieId, signal, { job: { ...soft, execution: "DEFERRED" }, operation: "retry" }, fetcher);
  await renderRequest(base, movieId, signal, { job: soft, operation: "cancel" }, fetcher);
  assert.equal(calls.length, 6);
  assert.equal(renderDownloadUrl(base, { ...soft, state: "COMPLETED" }), `${base}/render-id/download`);
});

test("controlled compatibility, cue, approval and storage errors show safe codes, never raw details", async () => {
  for (const code of ["SOURCE_PROFILE_UNSUPPORTED", "SUBTITLE_PROFILE_UNSUPPORTED", "NO_APPROVED_SUBTITLES", "SOURCE_MEDIA_MISSING", "STORAGE_UNAVAILABLE", "SUBTITLE_SNAPSHOT_INVALID"]) {
    await assert.rejects(renderRequest(base, movieId, signal, { mode: "SOFT_SUBTITLE", scope: "ALL_CURRENT" }, async () => Response.json({ error: { code, message: "/private/path token=secret" } }, { status: 422 })), (error: Error) => {
      assert.ok(error.message.startsWith(`${code}:`)); assert.doesNotMatch(error.message, /private|secret|token=/); return true;
    });
  }
});
