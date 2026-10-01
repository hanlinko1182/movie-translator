import { Prisma, ProjectStatus } from "@/generated/prisma/client";

export const projectSelect = {
  id: true,
  name: true,
  slug: true,
  sourceLanguage: true,
  targetLanguage: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      movies: true,
    },
  },
} satisfies Prisma.ProjectSelect;

export function projectResource<T extends { _count: { movies: number } }>(
  project: T,
) {
  const { _count, ...fields } = project;
  return { ...fields, movieCount: _count.movies };
}

export function jsonError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function readJsonObject(request: Request) {
  try {
    const value: unknown = await request.json();

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Invalid JSON is returned as the same client error as an invalid body.
  }

  return null;
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

export function nonEmptyString(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}

export function generatedSlugForAttempt(base: string, attempt: number) {
  const suffix = attempt === 1 ? "" : `-${attempt}`;
  const stem = base.slice(0, 120 - suffix.length).replace(/-+$/g, "");
  return `${stem || "project"}${suffix}`;
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return (
    typeof value === "string" &&
    Object.values(ProjectStatus).includes(value as ProjectStatus)
  );
}

export function isPrismaError(
  error: unknown,
  code: string,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
