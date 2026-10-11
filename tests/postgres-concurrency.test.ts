import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Pool } from "pg";
import { prisma, disconnectPrisma } from "@/lib/prisma";
import { readDashboard } from "@/app/dashboard-data";

// Run in a fresh process: pg emits this deprecation only once per process.
// RUN_PG_CONCURRENCY_TESTS=1 NODE_OPTIONS=--trace-deprecation \
// node --conditions=react-server --import tsx tests/postgres-concurrency.test.ts
// Only this fixture's Project is mutated. No workers, media, AI or schema changes.
test("Prisma/pg concurrency, transaction isolation and pool lifecycle", {
  skip: process.env.RUN_PG_CONCURRENCY_TESTS !== "1", timeout: 30_000,
}, async (t) => {
  const warnings: string[] = [];
  const onWarning = (warning: Error) => { warnings.push(warning.message); };
  process.on("warning", onWarning); // Observe only; Node still prints warnings/traces.
  const connect = PrismaPg.prototype.connect;
  let pool: Pool | undefined;
  let connections = 0;
  // Observe the real singleton's adapter-owned pool using its public API.
  PrismaPg.prototype.connect = async function () {
    const adapter = await connect.call(this);
    pool = adapter.underlyingDriver(); connections++;
    return adapter;
  };
  const id = `pg-concurrency-${randomUUID()}`;
  let created = false;
  try {
    await prisma.project.create({ data: { id, slug: id, name: "Before concurrent update" } });
    created = true;
    await t.test("Dashboard relation fan-out and concurrent reads return correct results", async () => {
      const count = await prisma.project.count();
      const dashboards = await Promise.all(Array.from({ length: 4 }, () => readDashboard()));
      for (const dashboard of dashboards) assert.equal(dashboard.totalProjects, count);
      const counts = await Promise.all(Array.from({ length: 32 }, () => prisma.project.count()));
      assert.ok(counts.every((value) => value === count));
    });
    await t.test("explicit isolation levels and same-connection concurrent reads are retained", async () => {
      for (const isolationLevel of ["ReadCommitted", "RepeatableRead", "Serializable"] as const) {
        await prisma.$transaction(async (tx) => {
          const results = await Promise.all(Array.from({ length: 8 }, () =>
            tx.$queryRaw<{ isolation: string; pid: number }[]>`SELECT current_setting('transaction_isolation') AS isolation, pg_backend_pid() AS pid`));
          const expected = { ReadCommitted: "read committed", RepeatableRead: "repeatable read", Serializable: "serializable" }[isolationLevel];
          assert.ok(results.every(([row]) => row.isolation === expected && row.pid === results[0][0].pid));
        }, { isolationLevel });
      }
    });
    await t.test("Repeatable Read holds its snapshot across a committed external update", async () => {
      await prisma.$transaction(async (tx) => {
        const before = await tx.project.findUniqueOrThrow({ where: { id } });
        await prisma.project.update({ where: { id }, data: { name: "Committed external update" } });
        const after = await tx.project.findUniqueOrThrow({ where: { id } });
        assert.equal(after.name, before.name);
      }, { isolationLevel: "RepeatableRead" });
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id } })).name, "Committed external update");
    });
    await t.test("dependent writes commit in order; query errors roll back and return connections", async () => {
      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id }, data: { name: "Committed dependent write" } });
        assert.equal((await tx.project.findUniqueOrThrow({ where: { id } })).name, "Committed dependent write");
      });
      await assert.rejects(prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id }, data: { name: "Must roll back" } });
        const results = await Promise.allSettled([
          tx.$queryRaw`SELECT 1 / 0`, tx.$queryRaw`SELECT 1`, tx.project.count(),
        ]);
        assert.equal(results[0].status, "rejected");
        // Independent Prisma promises can reach the driver in a different order.
        // A query submitted after the failure must still see the aborted transaction.
        await assert.rejects(tx.$queryRaw`SELECT 1`);
        throw new Error("Rollback the failed test transaction");
      }), /Rollback the failed test transaction/);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id } })).name, "Committed dependent write");
      const results = await prisma.$transaction([prisma.project.count(), prisma.movie.count()]);
      assert.ok(results.every((value) => Number.isInteger(value)));
    });
    await t.test("one bounded pool drains after reads and failures without pg deprecations", async () => {
      await setImmediate();
      assert.ok(pool);
      assert.equal(pool.options.pipeline, true);
      assert.equal(connections, 1, "The lazy singleton must not create per-query pools");
      assert.ok(pool.totalCount <= (pool.options.max ?? 10));
      assert.equal(pool.waitingCount, 0);
      assert.equal(pool.idleCount, pool.totalCount, "Every transaction connection must be returned");
      assert.deepEqual(warnings.filter((message) => message.includes("Calling client.query()")), []);
    });
  } finally {
    try { if (created) await prisma.project.delete({ where: { id } }); }
    finally {
      await disconnectPrisma();
      PrismaPg.prototype.connect = connect;
      process.off("warning", onWarning);
    }
  }
  assert.equal(pool?.totalCount, 0, "Adapter disposal must close its owned pool");
});
