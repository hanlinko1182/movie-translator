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
  for (const project of projects) {
    await prisma.project.upsert({
      where: { slug: project.slug },
      update: {
        name: project.name,
        sourceLanguage: project.sourceLanguage,
        targetLanguage: project.targetLanguage,
      },
      create: project,
    });
  }

  console.log(`Development seed upserted ${projects.length} projects.`);
}

main()
  .catch(() => {
    console.error("Development project seed failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
