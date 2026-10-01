import { prisma } from "@/lib/prisma";
import {
  hasOnlyKeys,
  isPrismaError,
  isProjectStatus,
  jsonError,
  nonEmptyString,
  projectResource,
  projectSelect,
  readJsonObject,
  slugify,
} from "@/lib/project-api";
import type { Prisma } from "@/generated/prisma/client";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateFields = [
  "name",
  "slug",
  "sourceLanguage",
  "targetLanguage",
  "status",
] as const;

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: projectSelect,
    });

    if (!project) {
      return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
    }

    return Response.json({ data: projectResource(project) });
  } catch {
    return jsonError("PROJECT_FETCH_FAILED", "Unable to fetch project", 500);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = await readJsonObject(request);

  if (!body || !hasOnlyKeys(body, updateFields)) {
    return jsonError("INVALID_PROJECT", "Invalid project request body", 400);
  }

  const data: Prisma.ProjectUpdateInput = {};

  if (Object.hasOwn(body, "name")) {
    const name = nonEmptyString(body.name);
    if (!name) {
      return jsonError("INVALID_PROJECT", "Name cannot be empty", 400);
    }
    data.name = name;
  }

  if (Object.hasOwn(body, "slug")) {
    const slug = typeof body.slug === "string" ? slugify(body.slug) : "";
    if (!slug) {
      return jsonError("INVALID_PROJECT_SLUG", "A valid slug is required", 400);
    }
    data.slug = slug;
  }

  if (Object.hasOwn(body, "sourceLanguage")) {
    const sourceLanguage = nonEmptyString(body.sourceLanguage);
    if (!sourceLanguage) {
      return jsonError(
        "INVALID_PROJECT",
        "Source language cannot be empty",
        400,
      );
    }
    data.sourceLanguage = sourceLanguage;
  }

  if (Object.hasOwn(body, "targetLanguage")) {
    const targetLanguage = nonEmptyString(body.targetLanguage);
    if (!targetLanguage) {
      return jsonError(
        "INVALID_PROJECT",
        "Target language cannot be empty",
        400,
      );
    }
    data.targetLanguage = targetLanguage;
  }

  if (Object.hasOwn(body, "status")) {
    if (!isProjectStatus(body.status)) {
      return jsonError("INVALID_PROJECT_STATUS", "Invalid project status", 400);
    }
    data.status = body.status;
  }

  if (Object.keys(data).length === 0) {
    return jsonError("EMPTY_PROJECT_UPDATE", "No project fields to update", 400);
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data,
      select: projectSelect,
    });

    return Response.json({ data: projectResource(project) });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
    }

    if (isPrismaError(error, "P2002")) {
      return jsonError(
        "PROJECT_SLUG_TAKEN",
        "A project with this slug already exists",
        409,
      );
    }

    return jsonError("PROJECT_UPDATE_FAILED", "Unable to update project", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            movies: true,
          },
        },
      },
    });

    if (!project) {
      return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
    }

    if (project._count.movies > 0) {
      return jsonError(
        "PROJECT_HAS_MOVIES",
        "Projects with movies cannot be deleted",
        409,
      );
    }

    await prisma.project.delete({ where: { id } });
    return Response.json({ data: { id } });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return jsonError("PROJECT_NOT_FOUND", "Project not found", 404);
    }

    if (isPrismaError(error, "P2003")) {
      return jsonError(
        "PROJECT_HAS_MOVIES",
        "Projects with movies cannot be deleted",
        409,
      );
    }

    return jsonError("PROJECT_DELETE_FAILED", "Unable to delete project", 500);
  }
}
