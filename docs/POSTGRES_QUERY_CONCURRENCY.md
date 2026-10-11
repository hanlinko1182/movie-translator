# PostgreSQL query concurrency

## Diagnosis

Verified with Prisma/client/adapter-pg 7.10.0 and pg 8.23.0. A fresh process running
the real `readDashboard()` with `NODE_OPTIONS=--trace-deprecation` emitted:

```text
DeprecationWarning: Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0.
  at Client.query (pg/lib/client.js:762:7)
  at PgTransaction.performIO (@prisma/adapter-pg/dist/index.js:681:40)
  at PgTransaction.queryRaw (@prisma/adapter-pg/dist/index.js:631:41)
  at callback (@prisma/client-engine-runtime/src/interpreter/query-interpreter.ts:202:18)
  ...
  at <anonymous> (@prisma/client-engine-runtime/src/interpreter/query-interpreter.ts:261:39)
```

The installed Prisma runtime source map shows `join` evaluating child relation
reads with `Promise.all` at lines 258–263. Dashboard's application-level reads
already use sequential `await` within Repeatable Read. Nested Prisma relation
reads nevertheless share that transaction's checked-out pg client. The installed
adapter forwards them to `client.query`, and pg warns when the non-pipelined
client's legacy pending queue is occupied. This is a dependency concurrency/
configuration mismatch, not a missing application `await`, duplicate values
argument, per-request pool creation, or observed connection leak.

## Minimal fix

`lib/prisma.ts` passes `pipeline: true` through PrismaPg's existing pool config.
[pg's supported pool pipelining option](https://node-postgres.com/features/pipelining)
was added in [pg 8.23.0](https://github.com/brianc/node-postgres/blob/pg@8.23.0/CHANGELOG.md).
It uses the driver's supported wire pipeline for independent in-flight queries,
preserving PostgreSQL execution order and same-connection transactions. Dependent
application queries still await their preceding results. No warning handler,
suppression, private-driver patch, dependency upgrade or query rewrites are used.

The lazy Prisma singleton, adapter-owned bounded pool (default maximum 10),
two-second connection timeout, development hot-reload reuse, transaction options
and shutdown `$disconnect()` remain unchanged. Normal pool queries still check
out separate idle connections. No schema, UI, API, worker or AI changes.

Restart existing web/worker processes during normal deployment to pick up the
new pool configuration. Hot reload intentionally retains an existing Prisma
singleton and cannot retroactively reconfigure its open connections. Do not
reuse this option with pg versions older than 8.23; the current lockfile resolves
both application and adapter to 8.23.0. This validation does not certify pg 9 or
all upstream Prisma timeout/error race conditions.

## Regression verification

Run in a fresh process because pg emits the warning only once per process:

```sh
RUN_PG_CONCURRENCY_TESTS=1 NODE_OPTIONS=--trace-deprecation \
  node --conditions=react-server --import tsx tests/postgres-concurrency.test.ts
```

The test observes warnings without preventing Node's default printing. It uses
the real application singleton/adapter and Dashboard read. It checks concurrent
Dashboard and pool reads, same-connection concurrent transaction queries,
Read Committed/Repeatable Read/Serializable isolation, Repeatable Read visibility
across an external commit, ordered dependent writes, rollback after real SQL
failure, array transactions, one bounded pool, no waiting/checked-out connections
after completion, disposal and absence of the reproduced warning. Only a unique
temporary Project is created/updated/deleted; existing domain data is untouched.
No schema changes, worker dispatch or paid calls occur.
