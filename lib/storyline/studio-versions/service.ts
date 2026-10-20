import "server-only";
import { createHmac } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { canonicalJson, contractHash } from "../canonical";
import { LIMITS } from "../contracts";
import { StoryTaskContractError } from "../jobs/errors";
import { taskScope, type StoryTaskScope } from "../jobs/service-boundary";
import { createNarrationContextRunner } from "../narration-integration/context-access";
import { NARRATION_DRAFT } from "../narration/contracts";
import { validateSyntheticNarrationDraft } from "../narration/validate";
import { array, date, enumeration, freeze, hash, id, integer, literal, record, text, unique } from "../validation";
import { STUDIO_EDIT, unapprovedEdit, type OriginalIdentity, type SaveStudioEdit,
  type StudioHistoryView, type StudioOriginalView, type StudioSavedView } from "./contracts";
import { assertStudioDatabase, requireStudioDatabase, signStudioAuthorization, studioReadTransaction } from "./database";
import { rejectVersion, StudioVersionError, versionCall } from "./errors";
import { assertSyntheticStudioAuthentication, verifyStudioRequest, type VerifiedStudioEditor } from "./synthetic-auth";
import { editedContentHash, editedSections, originalBinding, originalIdentity, parseEditedVersion, parseSave, previousVersion } from "./validation";

export const STORYLINE_STUDIO_VERSION_PRODUCTION_ENABLED = false;

function requireOutcome(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object") rejectVersion("R4_TRANSACTION_FAILED");
  const outcome = Object.getOwnPropertyDescriptor(value, "outcome")?.value;
  if (outcome === "MISSING") rejectVersion("R4_NOT_FOUND");
  if (outcome === "PARENT_MISMATCH") rejectVersion("R4_PARENT_MISMATCH");
  if (outcome === "SOURCE_STALE") rejectVersion("R4_SOURCE_STALE");
  if (outcome === "REVISION_CONFLICT") rejectVersion("R4_REVISION_CONFLICT");
  if (outcome === "IDEMPOTENCY_CONFLICT") rejectVersion("R4_IDEMPOTENCY_CONFLICT");
  if (!["OK", "OPEN", "REUSED", "SAVED"].includes(outcome)) rejectVersion("R4_TRANSACTION_FAILED");
  return record(value, ["outcome", ...fields], "gateway");
}

function storedOriginal(value: unknown, expected: OriginalIdentity, scope: StoryTaskScope) {
  const r = record(value, ["id", "candidateId", "candidateHash", "draftHash", "canonicalPayload", "schemaVersion", "composerVersion", "createdAt", "currentBinding"], "original.stored");
  literal(r.schemaVersion, NARRATION_DRAFT.version, "original.schema"); literal(r.composerVersion, NARRATION_DRAFT.composerVersion, "original.composer");
  const bytes = text(r.canonicalPayload, STUDIO_EDIT.maxBytes, "original.bytes"), payload: unknown = JSON.parse(bytes);
  if (r.id !== expected.id || r.draftHash !== expected.draftHash || canonicalJson(payload) !== bytes || contractHash(NARRATION_DRAFT.hashDomain, payload) !== expected.draftHash || typeof r.currentBinding !== "boolean") rejectVersion("R4_PARENT_MISMATCH");
  const p = record(payload, ["schemaVersion", "composerVersion", "id", "version", "parentDraft", "language", "style", "durationMode", "translationContextPolicy", "origin", "source", "analysis", "beats", "sections", "paragraphs", "claimLineage", "duration", "review"], "original.payload");
  literal(p.origin, "SYNTHETIC_TEST", "original.origin"); literal(p.language, "my", "original.language");
  const binding = originalBinding({ original: { ...expected, payloadId: p.id }, source: p.source, analysis: p.analysis });
  if (r.candidateId !== binding.analysis.candidateId || r.candidateHash !== binding.analysis.candidateHash ||
    canonicalJson(scope) !== canonicalJson({ projectId: binding.source.projectId, movieId: binding.source.movieId, studioId: binding.source.studioId })) rejectVersion("R4_PARENT_MISMATCH");
  const beats = array(p.beats, LIMITS.beats, "original.beats", 1).map(raw => {
    const b = record(raw, ["id", "order", "category", "startMs", "endMs", "claims", "narration"], "original.beat");
    return { id: id(b.id, "beat.id"), paragraphs: array(b.narration, LIMITS.claimsPerBeat, "original.paragraphs", 1).map(raw => {
      const n = record(raw, ["text", "claimIds"], "original.paragraph");
      return text(n.text, LIMITS.narrationPerBeat, "original.text");
    }) };
  });
  unique(beats, row => row.id, "original.beats");
  const sections = array(p.sections, LIMITS.beats, "original.sections", 1).map((raw, index) => {
    const s = record(raw, ["id", "beatId", "order", "heading", "focus"], "original.section");
    const beatId = id(s.beatId, "section.beatId"), beat = beats.find(row => row.id === beatId);
    if (!beat || s.order !== index) rejectVersion("R4_PARENT_MISMATCH");
    return { sectionId: id(s.id, "section.id"), paragraphs: beat.paragraphs, beatId, order: integer(s.order, "section.order", LIMITS.beats),
      heading: text(s.heading, NARRATION_DRAFT.maxHeading, "section.heading"),
      focus: enumeration(s.focus, ["CHARACTER_BEHAVIOR", "QUALIFIED_MOTIVATION", "PSYCHOLOGICAL_TENSION", "DECISION", "RELATIONSHIP_CONTEXT", "RELATIONSHIP_CHANGE", "CONSEQUENCE", "RESOLUTION"], "section.focus") };
  });
  editedSections(sections.map(({ sectionId, paragraphs }) => ({ sectionId, paragraphs })));
  return { binding, sections, payload, currentBinding: r.currentBinding };
}
type Original = ReturnType<typeof storedOriginal>;
function checkEditLayout(input: SaveStudioEdit, original: Original) {
  if (canonicalJson(input.binding) !== canonicalJson(original.binding) || input.sections.length !== original.sections.length ||
    input.sections.some((s, index) => s.sectionId !== original.sections[index].sectionId || s.paragraphs.length !== original.sections[index].paragraphs.length)) rejectVersion("R4_PARENT_MISMATCH");
}
function savedView(bytes: unknown, contentHash: unknown, original: Original, currentness: StudioSavedView["currentness"], editor: VerifiedStudioEditor): StudioSavedView {
  const canonical = text(bytes, STUDIO_EDIT.maxBytes, "saved.bytes"), payload = parseEditedVersion(JSON.parse(canonical));
  if (canonicalJson(payload) !== canonical || hash(contentHash, "saved.hash") !== editedContentHash(payload) || payload.editor.tenantId !== editor.tenantId) rejectVersion("R4_PARENT_MISMATCH");
  checkEditLayout(payload, original);
  // Explicit allowlist: no idempotency key, session, proof, fence or raw context.
  return freeze({ status: "SAVED_VERSION", schemaVersion: payload.schemaVersion, origin: payload.origin, id: payload.id, version: payload.version,
    scope: payload.scope, binding: payload.binding, expectedRevision: payload.expectedRevision, previousVersion: payload.previousVersion,
    sections: payload.sections, editor: payload.editor, createdAt: payload.createdAt, review: unapprovedEdit, contentHash: hash(contentHash, "saved.hash"), currentness });
}

/** Explicit disposable composition only. No environment, default database,
 * production session resolver, route, Server Action, UI or provider bootstrap. */
export function createDisposableStudioVersionService(options: {
  mode: "DISPOSABLE_SYNTHETIC_ONLY";
  authentication: unknown;
  readerDatabase: PrismaClient; writerDatabase: PrismaClient;
  validationKey: Buffer;
  profile: Parameters<typeof createNarrationContextRunner>[0]["profile"];
  inspectMedia: Parameters<typeof createNarrationContextRunner>[0]["inspectMedia"];
  beforeFenceForTest?: () => Promise<void>;
  afterInsertForTest?: () => Promise<void>;
}) {
  const dependencies = Object.freeze({ ...options });
  if (dependencies.mode !== "DISPOSABLE_SYNTHETIC_ONLY") rejectVersion("R4_AUTH_REQUIRED");
  assertSyntheticStudioAuthentication(dependencies.authentication);
  requireStudioDatabase(dependencies.readerDatabase); requireStudioDatabase(dependencies.writerDatabase);
  if (!Buffer.isBuffer(dependencies.validationKey) || dependencies.validationKey.length !== 32) rejectVersion("R4_AUTH_REQUIRED");
  const key = Buffer.from(dependencies.validationKey);
  const reader = createNarrationContextRunner({ database: dependencies.readerDatabase, inspectMedia: dependencies.inspectMedia, profile: dependencies.profile });
  const verify = (request: unknown, scope: StoryTaskScope | null, save: boolean) => verifyStudioRequest(dependencies.authentication, request, scope, save);
  function verifySameEditor(request: unknown, scope: StoryTaskScope, save: boolean, expected: VerifiedStudioEditor) {
    if (canonicalJson(verify(request, scope, save)) !== canonicalJson(expected)) rejectVersion("R4_SESSION_INVALID");
  }
  async function queryOriginal(request: unknown, editor: VerifiedStudioEditor, scope: StoryTaskScope, target: OriginalIdentity,
    action: "ORIGINAL" | "VERSION" | "HISTORY", options: { versionId?: string; afterVersion?: number; limit?: number }, save = false) {
    return studioReadTransaction(dependencies.readerDatabase, async tx => {
      verifySameEditor(request, scope, save, editor);
      const authorization = await signStudioAuthorization(tx, key, editor, scope, action, target, options);
      const [row] = await tx.$queryRaw<Array<{ result: unknown }>>`SELECT public.story_r4_read(${authorization.bytes},${authorization.proof}) result`;
      verifySameEditor(request, scope, save, editor); return row?.result;
    });
  }
  async function currentness(original: Original): Promise<StudioOriginalView["currentness"]> {
    if (!original.currentBinding) return "STALE_DEPENDENCIES";
    try {
      await reader.run({ scope: { projectId: original.binding.source.projectId, movieId: original.binding.source.movieId, studioId: original.binding.source.studioId },
        candidateId: original.binding.analysis.candidateId, candidateHash: original.binding.analysis.candidateHash }, async (_tx, context) => {
        if (validateSyntheticNarrationDraft(original.payload, context).draftHash !== original.binding.original.draftHash) rejectVersion("R4_PARENT_MISMATCH");
      });
      return "CURRENT_AT_READ";
    } catch (error) {
      if (error instanceof StoryTaskContractError && ["STORY_TASK_SOURCE_STALE", "STORY_TASK_RESULT_STALE"].includes(error.code)) return "STALE_DEPENDENCIES";
      throw error;
    }
  }
  function readInput(value: unknown, extra: string[] = []) {
    canonicalJson(value, 4096);
    const r = record(value, ["scope", "original", ...extra], "read");
    return { r, scope: taskScope(r.scope), target: originalIdentity(r.original) };
  }
  return Object.freeze({
    async readOriginal(request: unknown, value: unknown): Promise<StudioOriginalView> {
      return versionCall(async () => {
        verify(request, null, false); const { scope, target } = readInput(value); const editor = verify(request, scope, false);
        const envelope = requireOutcome(await queryOriginal(request, editor, scope, target, "ORIGINAL", {}), ["original", "head"]);
        const original = storedOriginal(envelope.original, target, scope), head = record(envelope.head, ["revision", "previousVersion"], "head");
        const status = await currentness(original); verifySameEditor(request, scope, false, editor);
        return freeze({ status: "ORIGINAL", binding: original.binding, sections: original.sections, currentness: status,
          latestRevision: integer(head.revision, "head.revision", 1000001), latestVersion: previousVersion(head.previousVersion), review: unapprovedEdit });
      });
    },
    async readVersion(request: unknown, value: unknown): Promise<StudioSavedView> {
      return versionCall(async () => {
        verify(request, null, false); const { r, scope, target } = readInput(value, ["versionId"]); const editor = verify(request, scope, false);
        const versionId = id(r.versionId, "versionId");
        const envelope = requireOutcome(await queryOriginal(request, editor, scope, target, "VERSION", { versionId }), ["original", "canonicalPayload", "contentHash"]);
        const original = storedOriginal(envelope.original, target, scope);
        const status = await currentness(original); verifySameEditor(request, scope, false, editor);
        const view = savedView(envelope.canonicalPayload, envelope.contentHash, original, status, editor);
        if (view.id !== versionId) rejectVersion("R4_PARENT_MISMATCH"); return view;
      });
    },
    async listVersions(request: unknown, value: unknown): Promise<StudioHistoryView> {
      return versionCall(async () => {
        verify(request, null, false); const { r, scope, target } = readInput(value, ["afterVersion", "limit"]); const editor = verify(request, scope, false);
        const afterVersion = integer(r.afterVersion, "afterVersion", 1000001), limit = integer(r.limit, "limit", STUDIO_EDIT.maxHistory);
        if (!limit) rejectVersion("R4_INVALID_INPUT");
        const envelope = requireOutcome(await queryOriginal(request, editor, scope, target, "HISTORY", { afterVersion, limit }), ["original", "versions"]);
        const original = storedOriginal(envelope.original, target, scope);
        const versions = array(envelope.versions, limit + 1, "versions").map((raw, index) => {
          const v = record(raw, ["id", "contentHash", "version", "previousVersion", "createdAt", "editor"], "version.summary"), e = record(v.editor, ["tenantId", "principalId"], "version.editor");
          if (e.tenantId !== editor.tenantId || v.version !== afterVersion + index + 1) rejectVersion("R4_PARENT_MISMATCH");
          return { id: id(v.id, "version.id"), contentHash: hash(v.contentHash, "version.hash"), version: integer(v.version, "version.number", 1000001),
            previousVersion: previousVersion(v.previousVersion), createdAt: date(v.createdAt, "version.createdAt"), editor: { tenantId: id(e.tenantId, "editor.tenant"), principalId: id(e.principalId, "editor.principal") } };
        });
        const status = await currentness(original); verifySameEditor(request, scope, false, editor);
        return freeze({ status: "VERSION_HISTORY", binding: original.binding, currentness: status, versions: versions.slice(0, limit),
          nextAfterVersion: versions.length > limit ? versions[limit - 1].version : null, review: unapprovedEdit });
      });
    },
    async saveVersion(request: unknown, value: unknown): Promise<StudioSavedView> {
      return versionCall(async () => {
        verify(request, null, true); const input = parseSave(value); const editor = verify(request, input.scope, true);
        const target = { id: input.binding.original.id, draftHash: input.binding.original.draftHash };
        const envelope = requireOutcome(await queryOriginal(request, editor, input.scope, target, "ORIGINAL", {}, true), ["original", "head"]);
        const original = storedOriginal(envelope.original, target, input.scope); checkEditLayout(input, original);
        if (!original.currentBinding) rejectVersion("R4_SOURCE_STALE");
        await studioReadTransaction(dependencies.writerDatabase, async () => undefined, true);
        const proposal = canonicalJson(input, STUDIO_EDIT.maxBytes), proposalHash = contractHash(STUDIO_EDIT.proposalDomain, input);
        let callbackError: StudioVersionError | undefined;
        let authorityError: StudioVersionError | undefined;
        const verifyWrite = () => {
          try { verifySameEditor(request, input.scope, true, editor); }
          catch (error) { if (error instanceof StudioVersionError) authorityError = error; throw error; }
        };
        // Request-local wrapper: even the existing M4 runner's final, post-work
        // media checks revalidate this session. No global "current request".
        const writer = createNarrationContextRunner({ database: dependencies.writerDatabase, profile: dependencies.profile,
          beforeFenceForTest: dependencies.beforeFenceForTest,
          inspectMedia: async storageKey => {
            const media = await dependencies.inspectMedia(storageKey);
            return { ...media, assertUnchanged: async () => { await media.assertUnchanged(); verifyWrite(); } };
          } });
        try {
          return await writer.run({ scope: input.scope, candidateId: original.binding.analysis.candidateId, candidateHash: original.binding.analysis.candidateHash }, async (tx, context) => {
            try { return await versionCall(async () => {
              await assertStudioDatabase(tx, true); verifyWrite();
              if (validateSyntheticNarrationDraft(original.payload, context).draftHash !== target.draftHash ||
                canonicalJson(context.record) !== canonicalJson(input.binding.analysis) || canonicalJson(input.binding.source) !== canonicalJson({ ...context.candidate.payload.source,
                  expectedStudioRevision: context.recipe.recipe.expectedStudioRevision, mediaSha256: context.source.payload.media.sha256 })) rejectVersion("R4_PARENT_MISMATCH");
              const authorization = await signStudioAuthorization(tx, key, editor, input.scope, "SAVE", target, { proposalHash });
              const [opened] = await tx.$queryRaw<Array<{ result: unknown }>>`SELECT public.story_r4_save_open(${authorization.bytes},${authorization.proof},${proposal}) result`;
              const outcome = opened?.result && typeof opened.result === "object" ? Object.getOwnPropertyDescriptor(opened.result, "outcome")?.value : undefined;
              if (outcome === "REUSED") {
                const reused = requireOutcome(opened.result, ["canonicalPayload", "contentHash"]); verifyWrite();
                return savedView(reused.canonicalPayload, reused.contentHash, original, "CURRENT_AT_SAVE", editor);
              }
              const pending = requireOutcome(opened?.result, ["id", "version", "createdAt", "challenge"]);
              if (pending.outcome !== "OPEN") rejectVersion("R4_TRANSACTION_FAILED");
              const payload = parseEditedVersion({ ...input, id: pending.id, version: pending.version, createdAt: pending.createdAt,
                schemaVersion: STUDIO_EDIT.version, origin: "SYNTHETIC_TEST_EDIT", editor: { tenantId: editor.tenantId, principalId: editor.principalId }, review: unapprovedEdit });
              const bytes = canonicalJson(payload, STUDIO_EDIT.maxBytes), contentHash = editedContentHash(payload), challenge = text(pending.challenge, 16384, "challenge");
              const proof = createHmac("sha256", key).update(`disposable-story-r4-save-v1\n${challenge}\n${contentHash}`, "utf8").digest("hex");
              const [finished] = await tx.$queryRaw<Array<{ result: unknown }>>`SELECT public.story_r4_save_finish(${bytes},${contentHash},${proof}) result`;
              const saved = requireOutcome(finished?.result, ["canonicalPayload", "contentHash"]);
              if (saved.outcome !== "SAVED" || saved.canonicalPayload !== bytes || saved.contentHash !== contentHash) rejectVersion("R4_TRANSACTION_FAILED");
              await dependencies.afterInsertForTest?.(); verifyWrite();
              return savedView(saved.canonicalPayload, saved.contentHash, original, "CURRENT_AT_SAVE", editor);
            }); } catch (error) { if (error instanceof StudioVersionError) callbackError = error; throw error; }
          });
        } catch (error) {
          if (authorityError) throw authorityError;
          if (callbackError) throw callbackError;
          if (error instanceof StoryTaskContractError) {
            if (["STORY_TASK_SOURCE_STALE", "STORY_TASK_RESULT_STALE"].includes(error.code)) rejectVersion("R4_SOURCE_STALE");
            // A generic/uncertain transaction failure is not proof of source
            // drift. Re-observe only the cheap durable pointer before labeling
            // it stale; otherwise preserve an explicit transaction failure.
            const observed = requireOutcome(await queryOriginal(request, editor, input.scope, target, "ORIGINAL", {}, true), ["original", "head"]);
            if (!storedOriginal(observed.original, target, input.scope).currentBinding) rejectVersion("R4_SOURCE_STALE");
            rejectVersion("R4_TRANSACTION_FAILED");
          }
          throw error;
        }
      });
    },
  });
}
