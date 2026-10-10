import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, symlink, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { LocalStorageProvider } from "@/lib/storage/local";
import { streamSourceVideo } from "@/lib/source-video/stream";
import { parseByteRange } from "@/lib/source-video/range";
import { selectMovie, withMovieSelection, sourceVideoUrl } from "@/lib/source-video/selection";
import { seekSourceVideo } from "@/lib/source-video/playback";

const key = "movies/00000000-0000-4000-8000-000000000001.mp4";
test("saved transcript seeking: milliseconds, repeated selection, metadata readiness and duration bounds", () => {
  const video = { currentTime: 0, duration: 6, readyState: 0 };
  assert.equal(seekSourceVideo(video, 1200), false);
  video.readyState = 1;
  assert.equal(seekSourceVideo(video, 1200), true); assert.equal(video.currentTime, 1.2);
  video.currentTime = 4;
  seekSourceVideo(video, 1200); assert.equal(video.currentTime, 1.2);
  seekSourceVideo(video, 8000); assert.equal(video.currentTime, 6);
  for (const time of [-1, NaN, Infinity]) assert.equal(seekSourceVideo(video, time), false);
  assert.equal(seekSourceVideo(null, 0), false);
});
test("range parsing: bounded, open, suffix, clamped and invalid ranges", () => {
  assert.equal(parseByteRange(null, 10), null);
  for (const [input, start, end] of [["bytes=2-5", 2, 5], ["bytes=5-", 5, 9], ["bytes=-3", 7, 9], ["bytes=-100", 0, 9], ["bytes=0-100", 0, 9]] as const) assert.deepEqual(parseByteRange(input, 10), { start, end });
  for (const input of ["bytes=", "bytes=-", "bytes=-0", "bytes=10-", "bytes=3-2", "bytes=0-1,5-6", "items=0-2", "bytes=NaN-3", "bytes=9007199254740992-"]) assert.throws(() => parseByteRange(input, 10), RangeError);
  assert.throws(() => parseByteRange("bytes=0-", 0), RangeError);
});

test("selection: explicit older movie is preserved, invalid selection never falls back", () => {
  const movies = [{ id: "new" }, { id: "old" }];
  assert.equal(selectMovie(movies, undefined)?.id, "new");
  assert.equal(selectMovie(movies, "old")?.id, "old");
  assert.equal(selectMovie(movies, "wrong"), undefined);
  assert.equal(selectMovie(movies, ["old", "new"]), undefined);
  assert.equal(selectMovie(movies, ""), undefined);
  assert.equal(withMovieSelection("/projects/slug/translation?view=review#review", "old"), "/projects/slug/translation?view=review&movieId=old#review");
  assert.equal(sourceVideoUrl("project", "old"), "/api/projects/project/movies/old/source");
});

test("source streaming: scoped read only, safe headers, 200/206/416/HEAD, no full-file buffering", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-stream-test-"));
  const storage = new LocalStorageProvider(root);
  const reads: string[] = [];
  const deps = { storage, findMovie: async (project: string, movie: string) => {
    reads.push(`${project}/${movie}`);
    return project === "project" && movie === "movie" ? { storageKey: key } : null;
  } };
  const get = (range?: string, project = "project", movie = "movie", method = "GET") => streamSourceVideo(new Request("http://localhost/source", { method, headers: range ? { range } : {} }), project, movie, deps);
  try {
    await storage.initialize();
    await storage.put(key, Readable.from([Buffer.from("0123456789")]));
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(response.headers.get("content-length"), "10");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(await response.text(), "0123456789");
    for (const [range, body, contentRange] of [["bytes=2-5", "2345", "bytes 2-5/10"], ["bytes=5-", "56789", "bytes 5-9/10"], ["bytes=-3", "789", "bytes 7-9/10"]]) {
      const partial = await get(range);
      assert.equal(partial.status, 206);
      assert.equal(partial.headers.get("content-range"), contentRange);
      assert.equal(partial.headers.get("content-length"), String(body.length));
      assert.equal(await partial.text(), body);
    }
    const invalid = await get("bytes=50-");
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get("content-range"), "bytes */10");
    assert.equal(await invalid.text(), "");
    const head = await get(undefined, "project", "movie", "HEAD");
    assert.equal(head.status, 200); assert.equal(head.headers.get("content-length"), "10"); assert.equal(head.body, null);
    assert.equal((await get(undefined, "wrong")).status, 404);
    assert.equal((await get(undefined, "project", "wrong")).status, 404);
    assert.equal((await get(undefined, "../private")).status, 404);
    assert.ok(reads.every((read) => !read.includes("..")));
    // No mutation or job capability is supplied to this dependency boundary.
    assert.deepEqual(Object.keys(deps).sort(), ["findMovie", "storage"]);
    assert.equal((await storage.stat(key)).size, 10);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source streaming: missing, unsafe key, symlink, private directories and empty source fail safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-stream-invalid-"));
  const storage = new LocalStorageProvider(root);
  const get = (storageKey: string | null) => streamSourceVideo(new Request("http://localhost/source"), "project", "movie", { storage, findMovie: async () => ({ storageKey }) });
  try {
    await storage.initialize();
    for (const input of [null, key]) assert.equal((await get(input)).status, 404);
    for (const input of ["../secret", "/etc/passwd", "audio/movie.wav", "movies/../../secret.mp4", "renders/00000000-0000-4000-8000-000000000001.mp4"]) {
      const response = await get(input); assert.equal(response.status, 422); assert.ok(!(await response.text()).includes(root));
    }
    await symlink("/etc/passwd", storage.path(key));
    assert.equal((await get(key)).status, 422);
    await rm(storage.path(key));
    await storage.put(key, Readable.from([]));
    assert.equal((await get(key)).status, 422);
    await rm(join(root, "movies"), { recursive: true });
    await symlink(tmpdir(), join(root, "movies"));
    assert.equal((await get(key)).status, 503);
    await rm(join(root, "movies"));
    await storage.initialize();
    await storage.put(key, Readable.from(["bytes"]));
    await chmod(join(root, "movies"), 0o755);
    assert.equal((await get(key)).status, 503);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("range metadata and bytes stay on the opened descriptor during external replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "source-stream-replaced-"));
  const storage = new LocalStorageProvider(root);
  try {
    await storage.initialize();
    await storage.put(key, Readable.from(["original"]));
    const response = await streamSourceVideo(new Request("http://localhost/source", { headers: { range: "bytes=0-3" } }), "project", "movie", {
      findMovie: async () => ({ storageKey: key }),
      storage: { openFile: async (key) => {
        const descriptor = await storage.openFile(key);
        await storage.put(key, Readable.from(["changed contents"]), { replace: true });
        return descriptor;
      } },
    });
    assert.equal(response.headers.get("content-range"), "bytes 0-3/8");
    assert.equal(await response.text(), "orig");
  } finally { await rm(root, { recursive: true, force: true }); }
});
