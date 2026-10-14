import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Identity } from "./contracts";
import { StorylinePersistenceError } from "./persistence-errors";

/** Match existing Recap/character publication order: Project → Movie → Studio. */
export async function lockStorylineSelection(tx: Prisma.TransactionClient, scope: Identity) {
  const projects = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "Project" WHERE id = ${scope.projectId} FOR UPDATE`;
  if (projects.length !== 1) throw new StorylinePersistenceError("MOVIE_NOT_FOUND");
  const movies = await tx.$queryRaw<Array<{ id: string; projectId: string }>>`SELECT id, "projectId" FROM "Movie" WHERE id = ${scope.movieId} FOR UPDATE`;
  if (movies.length !== 1) throw new StorylinePersistenceError("MOVIE_NOT_FOUND");
  if (movies[0].projectId !== scope.projectId) throw new StorylinePersistenceError("PROJECT_MOVIE_MISMATCH");
}

export async function lockStorylineStudio(tx: Prisma.TransactionClient, movieId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "StorylineStudio" WHERE "movieId" = ${movieId} FOR UPDATE`;
  return rows[0]?.id ?? null;
}
