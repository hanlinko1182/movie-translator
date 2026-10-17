import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { canonicalJson, contractHash } from "@/lib/storyline/canonical";
import { composeSyntheticNarration } from "@/lib/storyline/narration/synthetic-composer";
import { STUDIO_EDIT, unapprovedEdit } from "@/lib/storyline/studio-versions/contracts";
import { StudioVersionError } from "@/lib/storyline/studio-versions/errors";
import { editedContentHash, parseEditedVersion, parseSave } from "@/lib/storyline/studio-versions/validation";
import { narrationFixture } from "../narration.fixture";

function proposal() {
  const f = narrationFixture(), draft = composeSyntheticNarration(f.context), s = draft.payload.source;
  return { scope: { projectId: s.projectId, movieId: s.movieId, studioId: s.studioId },
    binding: { original: { id: "synthetic-persisted-m4-row", payloadId: draft.payload.id, draftHash: draft.draftHash }, source: structuredClone(s), analysis: structuredClone(draft.payload.analysis) },
    expectedRevision: 0, previousVersion: null, idempotencyKey: "synthetic-idempotency-key",
    sections: draft.payload.sections.map(section => ({ sectionId: section.id, paragraphs: draft.payload.beats.find(row => row.id === section.beatId)!.narration.map(row => row.text) })) };
}
function version() { return parseEditedVersion({ ...proposal(), id: "edited-version-one", version: 1, createdAt: "2026-10-18T00:00:00.000Z",
  schemaVersion: STUDIO_EDIT.version, origin: "SYNTHETIC_TEST_EDIT", editor: { tenantId: "tenant-one", principalId: "editor-one" }, review: unapprovedEdit }); }

test("R4 canonical edited contract binds complete actual M4/M3/M2/M1 lineage and actor metadata", () => {
  const p = version(), bytes = canonicalJson(p);
  assert.equal(canonicalJson(parseEditedVersion(JSON.parse(bytes))), bytes);
  assert.equal(editedContentHash(p), editedContentHash(Object.fromEntries(Object.entries(p).reverse()) as typeof p));
  assert.notEqual(editedContentHash(p), contractHash("story-narration-draft-v1", p));
  assert.notEqual(p.binding.analysis.candidateHash, p.binding.analysis.resultHash);
  for (const field of ["id", "createdAt", "idempotencyKey", "editor", "binding", "previousVersion"] as const) {
    const changed = structuredClone(p);
    if (field === "id") changed.id = "another-id";
    if (field === "createdAt") changed.createdAt = "2026-10-18T00:00:01.000Z";
    if (field === "idempotencyKey") changed.idempotencyKey = "another-key";
    if (field === "editor") changed.editor.principalId = "another-editor";
    if (field === "binding") changed.binding.analysis.submissionId = "another-submission";
    if (field === "previousVersion") { changed.previousVersion = { id: "previous", contentHash: "a".repeat(64) }; changed.expectedRevision = 1; changed.version = 2; }
    assert.notEqual(editedContentHash(changed), editedContentHash(p));
  }
});

test("R4 preserves exact Unicode, spaces and newlines without normalization", () => {
  const p = proposal(), exact = "  မြန်မာစာ\nက\u1031\u102c\tဖြစ်နိုင်သည်။  ";
  p.sections[0].paragraphs[0] = exact; const parsed = parseSave(p);
  assert.equal(parsed.sections[0].paragraphs[0], exact); assert.equal(p.sections[0].paragraphs[0], exact);
  p.sections[0].paragraphs[0] = "က".repeat(1200); assert.equal(parseSave(p).sections[0].paragraphs[0].length, 1200);
  p.sections[0].paragraphs[0] = "က".repeat(1201); assert.throws(() => parseSave(p));
});

test("R4 captures JSON without executing inherited array methods or retaining caller buffers", () => {
  const input = proposal(); let invoked = false;
  const prototype = Object.create(Array.prototype, { map: { value() { invoked = true; throw new Error("Inherited method must not execute"); } } });
  Object.setPrototypeOf(input.sections, prototype);
  const parsed = parseSave(input); assert.equal(invoked, false);
  input.sections[0].paragraphs[0] = "ပြောင်းလဲထားသည်။";
  assert.notEqual(parsed.sections[0].paragraphs[0], input.sections[0].paragraphs[0]);
});

test("R4 strict version schema rejects invented approval, actor, revision and metadata claims", () => {
  const p = version();
  for (const review of [{ ...unapprovedEdit, humanApproval: "APPROVED" }, { ...unapprovedEdit, sourceVerified: true }, { ...unapprovedEdit, eligibleForTts: true }, { ...unapprovedEdit, readyForPublication: true }])
    assert.throws(() => parseEditedVersion({ ...p, review }));
  for (const patch of [{ schemaVersion: "unknown" }, { origin: "HUMAN_APPROVED" }, { version: 2 }, { createdAt: "yesterday" }, { editor: { principalId: "x" } }, { extra: true }])
    assert.throws(() => parseEditedVersion({ ...p, ...patch }));
  const request = proposal(); assert.throws(() => parseSave({ ...request, editor: { principalId: "forged" } }));
  assert.throws(() => parseSave({ ...request, previousVersion: { id: "prior", contentHash: "a".repeat(64) } }));
});

test("R4 static errors carry no raw database, request, source or authentication details", () => {
  const error = new StudioVersionError("R4_FORBIDDEN");
  assert.deepEqual(JSON.parse(JSON.stringify(error)), { code: "R4_FORBIDDEN", message: "Studio version request rejected" });
  assert.doesNotMatch(JSON.stringify(error), /stack|sql|session|secret|source/);
});

test("R4 remains explicitly disposable, server-only and absent from production pages/routes/workers/UI", async () => {
  const service = await readFile("lib/storyline/studio-versions/service.ts", "utf8");
  assert.match(service, /STORYLINE_STUDIO_VERSION_PRODUCTION_ENABLED = false/);
  for (const file of await readdir("lib/storyline/studio-versions")) {
    const source = await readFile(join("lib/storyline/studio-versions", file), "utf8");
    if (file !== "contracts.ts") assert.match(source, /^import "server-only"/);
    assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|lib\/(?:prisma|queue)|from ["'](?:@openrouter|bullmq|ioredis)|local-script-model|previewForTest|use server/);
  }
  async function inspect(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await inspect(path);
      else if (/\.[cm]?[jt]sx?$/.test(path)) assert.doesNotMatch(await readFile(path, "utf8"), /studio-versions|story_r4_|storyline-m9-r4/);
    }
  }
  for (const directory of ["app", "components", "workers"]) await inspect(directory);
  const sql = await readFile("docs/drafts/storyline-m9-r4-disposable-versions.sql", "utf8");
  assert.match(sql, /ROLLBACK;\s*$/); assert.doesNotMatch(sql, /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE|SELECT)\b[^;]*TO storyline_r4/i);
  assert.doesNotMatch(sql, /UPDATE public\."StorylineStudio"|INSERT INTO public\."StorySourceVerification"/);
});
