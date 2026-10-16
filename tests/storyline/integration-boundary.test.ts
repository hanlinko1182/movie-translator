import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

test("Recap page and Studio navigation never invoke or serialize private preparation services", async () => {
  for (const path of ["app/projects/[id]/recap/page.tsx", "components/storyline/recap-studio-shell.tsx", "components/storyline/navigation.ts"]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /prepareStorylineSource|readStorylineSource|projectPreparedEvidence|lib\/storyline\/(?:prepare-source|read-source|media|evidence-dto)|sourceBindingHash|dependencyHash/);
  }
});

test("preparation and DTO projection stay server-only; only scoped disabled Storyline task routes exist", async () => {
  for (const path of ["lib/storyline/prepare-source.ts", "lib/storyline/read-source.ts", "lib/storyline/media.ts", "lib/storyline/evidence-dto.ts"]) assert.match(await readFile(path, "utf8"), /^import "server-only";/);
  async function routes(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? routes(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
  }
  const storylineRoutes = (await routes("app/api")).filter(path => /storyline/i.test(path)).sort();
  assert.deepEqual(storylineRoutes, [
    "app/api/projects/[id]/movies/[movieId]/storyline/studios/[studioId]/tasks/[taskId]/cancel/route.ts",
    "app/api/projects/[id]/movies/[movieId]/storyline/studios/[studioId]/tasks/[taskId]/route.ts",
    "app/api/projects/[id]/movies/[movieId]/storyline/studios/[studioId]/tasks/route.ts",
  ]);
  for (const path of storylineRoutes) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /prepareStorylineSource|readStorylineSource|projectPreparedEvidence|lib\/storyline\/(?:prepare-source|read-source|media|evidence-dto)|lib\/storyline\/jobs\/fake-|transactional-gateway\.fixture/);
    assert.match(source, /createScopedStoryTaskApi\(\)/);
  }
  const dto = await readFile("lib/storyline/evidence-dto.ts", "utf8");
  assert.doesNotMatch(dto, /\bfetch\s*\(|@\/lib\/(?:prisma|storage|queue)|\bprepareStorylineSource\s*\(|\bFFmpeg\b|use server|use client/);
});
