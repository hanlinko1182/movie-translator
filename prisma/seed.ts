import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before running the development seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const projects = [
  {
    name: "The Hidden Dragon",
    slug: "hidden-dragon",
    sourceLanguage: "zh",
    targetLanguage: "my",
  },
  {
    name: "Moonlight Sword",
    slug: "moonlight-sword",
    sourceLanguage: "zh",
    targetLanguage: "my",
  },
  {
    name: "Legend of the Phoenix",
    slug: "legend-of-the-phoenix",
    sourceLanguage: "zh",
    targetLanguage: "my",
  },
];

async function main() {
  const seededProjects: {
    id: string;
    name: string;
    sourceLanguage: string;
  }[] = [];

  for (const project of projects) {
    const seededProject = await prisma.project.upsert({
      where: { slug: project.slug },
      update: {
        name: project.name,
        sourceLanguage: project.sourceLanguage,
        targetLanguage: project.targetLanguage,
      },
      create: project,
      select: { id: true, name: true, sourceLanguage: true },
    });
    seededProjects.push(seededProject);
  }

  let moviesCreated = 0;

  for (const project of seededProjects) {
    const existingMovie = await prisma.movie.findFirst({
      where: { projectId: project.id, title: project.name },
      select: { id: true },
    });

    if (existingMovie) continue;

    await prisma.movie.create({
      data: {
        projectId: project.id,
        title: project.name,
        sourceLanguage: project.sourceLanguage,
        status: "UPLOADED",
        processingProgress: 0,
      },
    });
    moviesCreated += 1;
  }

  console.log(
    `Development seed upserted ${projects.length} projects and created ${moviesCreated} movies.`,
  );
}

main()
  .catch(() => {
    console.error("Development project seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
