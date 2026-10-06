import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = databaseUrl();

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 2000 }),
  });
}

// Lazy singleton: importing liveness/build modules does not open a connection.
let client = globalForPrisma.prisma;
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    client ??= createPrismaClient();
    if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = client;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
export async function disconnectPrisma() { if (client) await client.$disconnect(); }
