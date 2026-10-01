import { prisma } from "@/lib/prisma";
import {
  generatedSlugForAttempt,
  hasOnlyKeys,
  isPrismaError,
  jsonError,
  nonEmptyString,
  projectResource,
  projectSelect,
  readJsonObject,
  slugify,
} from "@/lib/project-api";

const createFields = ["name", "sourceLanguage", "targetLanguage", "slug"] as const;

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: projectSelect,
    });

    return Response.json({ data: projects.map(projectResource) });
  } catch {
    return jsonError("PROJECTS_FETCH_FAILED", "Unable to fetch projects", 500);
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);

  if (!body || !hasOnlyKeys(body, createFields)) {
    return jsonError("INVALID_PROJECT", "Invalid project request body", 400);
  }

  const name = nonEmptyString(body.name);
  const sourceLanguage = nonEmptyString(body.sourceLanguage);
  const targetLanguage = nonEmptyString(body.targetLanguage);

  if (!name || !sourceLanguage || !targetLanguage) {
    return jsonError(
      "INVALID_PROJECT",
      "Name, source language, and target language are required",
      400,
    );
  }

  const suppliedSlug = Object.hasOwn(body, "slug");
  const requestedSlug = suppliedSlug
    ? typeof body.slug === "string"
      ? slugify(body.slug)
      : ""
    : slugify(name) || "project";

  if (!requestedSlug) {
    return jsonError("INVALID_PROJECT_SLUG", "A valid slug is required", 400);
  }

  const data = { name, sourceLanguage, targetLanguage };

  if (suppliedSlug) {
    try {
      const project = await prisma.project.create({
        data: { ...data, slug: requestedSlug },
        select: projectSelect,
      });

      return Response.json({ data: projectResource(project) }, { status: 201 });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        return jsonError(
          "PROJECT_SLUG_TAKEN",
          "A project with this slug already exists",
          409,
        );
      }

      return jsonError("PROJECT_CREATE_FAILED", "Unable to create project", 500);
    }
  }

  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const slug = generatedSlugForAttempt(requestedSlug, attempt);

    try {
      const project = await prisma.project.create({
        data: { ...data, slug },
        select: projectSelect,
      });

      return Response.json({ data: projectResource(project) }, { status: 201 });
    } catch (error) {
      if (isPrismaError(error, "P2002")) continue;

      return jsonError("PROJECT_CREATE_FAILED", "Unable to create project", 500);
    }
  }

  return jsonError(
    "PROJECT_SLUG_COLLISION_LIMIT",
    "Unable to generate a unique project slug",
    409,
  );
}
