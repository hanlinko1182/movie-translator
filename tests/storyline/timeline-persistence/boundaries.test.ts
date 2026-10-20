import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
async function files(dir: string): Promise<string[]> { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))).flat(); }
test("M7-02 executable modules are server-only, explicitly injected and contain no provider/media/ambient datasource path", async () => {
  for (const file of await files("lib/storyline/timeline-persistence")) {
    const s = await readFile(file, "utf8"); assert.match(s, /^import "server-only";/);
    assert.ok(!/process\.env|DATABASE_URL|\bfetch\s*\(|node:(?:fs|child_process)|\b(?:spawn|execFile)\s*\(|PrismaClient|BullMQ|ffmpeg|\.mp4/.test(s), file);
    assert.ok(!/"use server"|"use client"/.test(s), file);
  }
});
test("M7-02 has no production source/bootstrap, UI, route, action or worker composition", async () => {
  for (const dir of ["app", "components", "workers", "scripts"]) for (const file of await files(dir)) if (/\.[cm]?[jt]sx?$/.test(file)) {
    assert.ok(!/timeline-persistence|timeline_m702|M702_DISPOSABLE_ONLY|createDisposableTimeline|createSyntheticTimelineAuthentication|createTimelineGateway/.test(await readFile(file, "utf8")), file);
  }
});
