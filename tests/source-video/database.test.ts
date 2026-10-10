import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { prisma, disconnectPrisma } from "@/lib/prisma";
import { localStorage, createMovieStorageKey } from "@/lib/storage";
import { GET } from "@/app/api/projects/[id]/movies/[movieId]/source/route";
import { selectMovie } from "@/lib/source-video/selection";

test("database/route integration: project scoping, older selection and read-only repeated GET", { skip: process.env.SOURCE_VIDEO_INTEGRATION !== "1" }, async () => {
  const id = randomUUID();
  const oldId = randomUUID();
  const newId = randomUUID();
  const key = createMovieStorageKey(".mp4");
  const get = (projectId: string, movieId: string, range = "bytes=1-3") => GET(new Request("http://localhost/source", { headers: { range } }), { params: Promise.resolve({ id: projectId, movieId }) });
  try {
    // Fail before writing a fixture if the database is unreachable.
    await prisma.$queryRaw`SELECT 1`;
    await localStorage.put(key, Readable.from(["0123456789"]));
    await prisma.project.create({ data: { id, slug: `source-video-test-${id}`, name: "Disposable source-video API test", movies: { create: [
      { id: oldId, title: "Older selected source", storageKey: key, createdAt: new Date("2020-01-01") },
      { id: newId, title: "Newer metadata-only movie", createdAt: new Date("2020-01-02") },
    ] } } });
    const movies = await prisma.movie.findMany({ where: { projectId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    assert.equal(selectMovie(movies, oldId)?.id, oldId);
    assert.equal(selectMovie(movies, undefined)?.id, newId);
    const before = await prisma.movie.findMany({ where: { projectId: id } });
    const renderCount = await prisma.renderJob.count();
    for (let i = 0; i < 3; i++) {
      const response = await get(id, oldId);
      assert.equal(response.status, 206); assert.equal(await response.text(), "123");
    }
    assert.equal((await get("unrelated-project", oldId)).status, 404);
    assert.equal((await get(id, "unrelated-movie")).status, 404);
    assert.equal((await get(id, newId)).status, 404);
    assert.equal(await prisma.renderJob.count(), renderCount);
    assert.deepEqual(await prisma.movie.findMany({ where: { projectId: id } }), before);
  } finally {
    try {
      await prisma.movie.deleteMany({ where: { projectId: id } });
      await prisma.project.deleteMany({ where: { id } });
    } finally {
      try { await localStorage.delete(key); } finally { await disconnectPrisma(); }
    }
  }
});
