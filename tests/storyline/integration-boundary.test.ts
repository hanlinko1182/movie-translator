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

test("preparation and DTO projection stay server-only with no Storyline route", async () => {
  for (const path of ["lib/storyline/prepare-source.ts", "lib/storyline/read-source.ts", "lib/storyline/media.ts", "lib/storyline/evidence-dto.ts"]) assert.match(await readFile(path, "utf8"), /^import "server-only";/);
  async function routes(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? routes(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
  }
  assert.ok((await routes("app/api")).every(path => !/storyline/i.test(path)));
  const dto = await readFile("lib/storyline/evidence-dto.ts", "utf8");
  assert.doesNotMatch(dto, /\bfetch\s*\(|@\/lib\/(?:prisma|storage|queue)|\bprepareStorylineSource\s*\(|\bFFmpeg\b|use server|use client/);
});
