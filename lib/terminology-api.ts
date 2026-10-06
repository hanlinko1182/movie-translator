import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hasOnlyKeys, isPrismaError, jsonError, readJsonObject } from "@/lib/project-api";
import { glossaryCategories, type GlossaryCategory, type TerminologyKind } from "@/lib/terminology-types";
import { sourceTextHash } from "@/lib/translation-memory/hash";
import { normalizeMemorySource, normalizeTerminologyLanguage } from "@/lib/translation-memory/normalize";

const commonSelect = {
  id: true, sourceText: true, targetText: true, sourceLanguage: true,
  targetLanguage: true, createdAt: true, updatedAt: true,
} as const;
export const glossaryEntrySelect = {
  ...commonSelect, category: true, notes: true,
} satisfies Prisma.GlossaryEntrySelect;
export const memoryEntrySelect = {
  ...commonSelect, sourceHash: true, origin: true,
} satisfies Prisma.TranslationMemoryEntrySelect;

export class TerminologyError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

export async function getTerminologyProject(slug: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, sourceLanguage: true, targetLanguage: true },
  });
  if (!project) throw new TerminologyError("PROJECT_NOT_FOUND", "Project not found", 404);
  return project;
}

export async function getTerminologyWorkspace(slug: string, kind: TerminologyKind) {
  const project = await getTerminologyProject(slug);
  const entries = kind === "glossary"
    ? await prisma.glossaryEntry.findMany({
      where: { projectId: project.id }, select: glossaryEntrySelect,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    })
    : await prisma.translationMemoryEntry.findMany({
      where: { projectId: project.id }, select: memoryEntrySelect,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
  return {
    project,
    entries: entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    })),
  };
}

type EntryInput = {
  sourceText?: string;
  targetText?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  category?: GlossaryCategory;
  notes?: string | null;
};

async function entryInput(request: Request, kind: TerminologyKind, partial: boolean): Promise<EntryInput> {
  const body = await readJsonObject(request);
  const fields = ["sourceText", "targetText", "sourceLanguage", "targetLanguage"];
  if (kind === "glossary") fields.push("category", "notes");
  if (!body || !hasOnlyKeys(body, fields) || Object.keys(body).length === 0) invalidInput();
  const data: EntryInput = {};
  for (const key of ["sourceText", "targetText", "sourceLanguage", "targetLanguage"] as const) {
    if (partial && !Object.hasOwn(body, key)) continue;
    if (typeof body[key] !== "string" || !body[key].trim()) invalidInput();
    let value = body[key].trim();
    if (key.endsWith("Language")) {
      value = normalizeTerminologyLanguage(value);
      if (value.length > 35 || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u.test(value)) invalidInput();
    } else {
      if (kind === "translation-memory" && key === "sourceText") value = normalizeMemorySource(value);
      const maxLength = key === "sourceText"
        ? kind === "glossary" ? 500 : 4_000
        : kind === "glossary" ? 2_000 : 32_000;
      if (value.length > maxLength) invalidInput();
    }
    data[key] = value;
  }
  if (Object.hasOwn(body, "category")) {
    if (!glossaryCategories.includes(body.category as GlossaryCategory)) invalidInput();
    data.category = body.category as GlossaryCategory;
  }
  if (Object.hasOwn(body, "notes")) {
    if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 2_000)) invalidInput();
    data.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  return data;
}

export async function terminologyCollection(request: Request, slug: string, kind: TerminologyKind) {
  try {
    if (request.method === "GET") {
      const workspace = await getTerminologyWorkspace(slug, kind);
      return Response.json({ data: workspace.entries });
    }
    const project = await getTerminologyProject(slug);
    const input = await entryInput(request, kind, false);
    const common = {
      projectId: project.id,
      sourceText: input.sourceText!, targetText: input.targetText!,
      sourceLanguage: input.sourceLanguage!, targetLanguage: input.targetLanguage!,
    };
    const entry = kind === "glossary"
      ? await prisma.glossaryEntry.create({
        data: { ...common, category: input.category ?? "TERM", notes: input.notes ?? null },
        select: glossaryEntrySelect,
      })
      : await prisma.translationMemoryEntry.create({
        data: { ...common, sourceHash: sourceTextHash(common.sourceText), origin: "MANUAL" },
        select: memoryEntrySelect,
      });
    return Response.json({ data: entry }, { status: 201 });
  } catch (error) {
    return terminologyErrorResponse(error, kind);
  }
}

export async function terminologyEntry(request: Request, slug: string, entryId: string, kind: TerminologyKind) {
  try {
    const project = await getTerminologyProject(slug);
    // Include projectId in each mutation filter; an entry ID alone grants no scope.
    const where = { id: entryId, projectId: project.id };
    if (request.method === "DELETE") {
      if (kind === "glossary") await prisma.glossaryEntry.delete({ where });
      else await prisma.translationMemoryEntry.delete({ where });
      return Response.json({ data: { id: entryId } });
    }
    const input = await entryInput(request, kind, true);
    const entry = kind === "glossary"
      ? await prisma.glossaryEntry.update({ where, data: input, select: glossaryEntrySelect })
      : await prisma.translationMemoryEntry.update({
        where,
        data: {
          sourceText: input.sourceText, targetText: input.targetText,
          sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage,
          origin: "MANUAL",
          ...(input.sourceText ? { sourceHash: sourceTextHash(input.sourceText) } : {}),
        },
        select: memoryEntrySelect,
      });
    return Response.json({ data: entry });
  } catch (error) {
    return terminologyErrorResponse(error, kind);
  }
}

function invalidInput(): never {
  throw new TerminologyError("INVALID_TERMINOLOGY_ENTRY", "Provide valid source, target, language codes, and entry fields", 400);
}

function terminologyErrorResponse(error: unknown, kind: TerminologyKind) {
  if (error instanceof TerminologyError) return jsonError(error.code, error.message, error.status);
  const prefix = kind === "glossary" ? "GLOSSARY" : "TRANSLATION_MEMORY";
  if (isPrismaError(error, "P2002")) {
    return jsonError(`${prefix}_DUPLICATE`, "An entry with this source and language pair already exists", 409);
  }
  if (isPrismaError(error, "P2025")) return jsonError(`${prefix}_ENTRY_NOT_FOUND`, "Entry not found in this project", 404);
  console.error("Project terminology request failed.");
  return jsonError(`${prefix}_REQUEST_FAILED`, "Unable to manage project entries", 500);
}
