# Storyline M1 persistence — disposable PostgreSQL validation

**Phase 23.2 M1-E1.5; 2026-10-12.** The proposed schema remains review-only. No application database, live Prisma schema, migration directory, media, job, or receipt was changed. The test uses synthetic records and keeps existing `logs/` untouched.

## Isolation and reproduction

Run `node --conditions=react-server --import tsx tests/storyline/persistence-postgres.test.ts` from the repository root. The harness in `tests/storyline/disposable-postgres.ts` requires local PostgreSQL 18 binaries at `/usr/lib/postgresql/18/bin`. It creates a unique mode-private `/tmp/movie-translator-storyline-m1e15-*` root, initializes a fresh UTF8 cluster, disables TCP listening, binds a private Unix socket, and creates a unique database plus dedicated admin and runner credentials. Neither `DATABASE_URL` nor the Prisma application config is read by the integration harness. Credentials are random, local to the process, and never printed.

Before SQL, the harness checks the admin connection's database/user/owner, exact PostgreSQL data and socket directories, local socket address, UTF8 encoding and major version. It then checks the dedicated runner's database/user/owner and local connection. It refuses to run when those identities differ. Teardown requires the exact scratch prefix, real path, current-process ownership marker and nonce; it stops only that cluster and removes only its scratch root. Normal test exits clean up in `finally`. A hard kill may leave a scratch cluster for operator inspection; this test never searches for or removes prior scratch clusters or other databases. The application database is never a fallback.

The ordinary sandbox blocked the private Unix socket with `Operation not permitted`; the actual database run used the approved escalated execution of **only this integration test command**. No application connection or real source data was used.

The existing `persistence-draft.test.ts` assembles the proposed Prisma fragment into a temporary schema and validates it with an isolated dummy Prisma config at unreachable `127.0.0.1:1`. That command does not contact PostgreSQL or read the application datasource.

## SQL execution and migration recovery

PostgreSQL **18.6** accepted all committed baseline migration SQL, in order, on the empty scratch database. The review-only Storyline draft remained outside `prisma/migrations` and still ends in `ROLLBACK;`. After target verification, the integration harness replaces only that terminal word **in memory** with `COMMIT;` to allow multi-connection tests; it does not rewrite the draft file or invoke `prisma migrate`, `db push`, or the app config.

A forced `division by zero` between the first Storyline objects and later tables produced SQLSTATE `22012`; subsequent catalog checks found no Storyline Studio table, enum or Movie composite index. A clean application then created all five tables. An incomplete script failed at deferred constraint commit and rolled back the script row, beat rows, version allocation and Studio revision. A later failed pointer update after receipt append rolled back the receipt too. These are transactional recovery results on synthetic data, not a down migration or proof that an already deployed immutable ledger can be erased safely.

## Results from real constraints and triggers

| Area | Observed result on PostgreSQL 18.6 |
| --- | --- |
| Project/movie ownership | Wrong project/movie composite scope rejected; duplicate Studio for a Movie rejected. Existing Movie with Studio cannot be deleted or reparented (`RESTRICT`). |
| Snapshot binding and deduplication | Cross-Studio snapshot rejected; duplicate exact snapshot rejected. Negative bytes and malformed hash rejected. Exact Chinese/Myanmar Unicode, whitespace, source timings, ALL_CURRENT approvals, MANUAL provenance and QC data round-tripped from canonical TEXT. An invalid timed row remained excluded and a missing row remained missing. |
| Script and beats | Cross-Studio source reference rejected. Version allocation serialized. Missing/surplus beat projection failed at commit; duplicate beat order rejected. |
| History | UPDATE and DELETE of snapshot, script, beat and verification receipt rejected with `23514`; TRUNCATE of the tested history table rejected. |
| Receipt ledger | Exact projected binding mismatch, wrong claim/scope, stale sequence/head, duplicate append, invalid second revocation and sequence beyond the 2048-entry ceiling rejected. Valid synthetic receipt and revocation appended in order. |
| Transaction rollback | Failed DDL, deferred beat failure, uniqueness loser and failed pointer update left no partial artifact/receipt/allocation state. |

These tests exercise representative constraints. They do not exhaust every size boundary, historical child replacement, production index cost, role grant, or content-validation combination. Existing pure Storyline validators remain the authoritative semantic checks for Chinese evidence, claim ownership, inference and exact hashes.

## Real concurrency observations

Two or more independent connections used bounded connection, statement and lock timeouts. Competing Studio creation and identical snapshot insertion each yielded one winner; the losing transaction rolled back. Competing version-2 allocations yielded one committed version and `nextScriptVersion = 3`. A stale optimistic `revision` compare-and-set updated zero rows after the winner committed. Two receipts offered for the same global ledger head could not both append; a revocation competing with supersession likewise yielded one winner. A deliberately reversed Movie lock order produced `40P01` in about one second; rolling back the victim released the other transaction. The defined Movie-first ordering is necessary in the future write service.

**Source-writer boundary:** a synthetic Movie storage-key update held the Movie lock while snapshot insertion waited. Once the source writer committed, the waiting insertion proceeded with its previously prepared snapshot. SQL locks serialize the writes, but do not compare prepared source/media dependencies to current live data. M1-E2 must re-read dependency IDs/values and media binding **after acquiring Movie then Studio locks** and fail closed when they changed. It must audit other source publication paths or use the documented Serializable/fail-closed fallback. A DB row lock cannot freeze external media bytes.

## Receipt trust and ledger limits

The database enforces append ordering, scoped FKs, projected fields, structural bounds and immutability. It does **not** authenticate a human operator or recompute canonical SHA hashes. In a test transaction, the table owner inserted a syntactically valid receipt with a deliberately false `entryHash` and matching ID; PostgreSQL accepted it, and the test rolled it back. `REVOKE ... FROM PUBLIC` does not restrict the table owner. This is a proven trust boundary, not an authorized verification receipt.

No M1-E2 caller may accept provider/client JSON or a hash-shaped object as `SOURCE_VERIFIED`. Durable receipt issuance must remain unavailable until a server-owned issuer recomputes and checks canonical hashes, claim/evidence ownership, current source/context and rubric decisions, with restricted runtime and issuer role privileges. Receipt lookup must also revalidate those bindings. The 2048-entry cap rejects further issuance; it does not permit ledger reset or deletion.

## Prisma/SQL parity and open gates

The isolated Prisma validation succeeds for the five-model fragment assembled with the current schema. Real SQL covers the expected five tables, same-Studio/full-context FKs, Movie composite index, fixed enums, CHECK constraints and custom triggers. Prisma alone cannot express the SQL-only checks, partial root index or deferred/immutability/ledger triggers. A future deployable migration must be reviewed against generated Prisma diffs so these protections remain in place.

Open decisions before live deployment:

1. Approve `RESTRICT` Movie retention/reparent semantics and a controlled application error for deletion attempts.
2. Approve the 2048 receipt-entry ceiling, or version/expand it before long-lived issuance.
3. Implement and test the server issuer and separate least-privilege runtime/issuer roles; the current owner-role experiment proves this cannot be deferred if receipt issuance is enabled.
4. Audit source writers and implement post-lock source/media currentness checks, optimistic revision fencing and bounded retry/error handling.
5. Complete broader parity, privilege, size-boundary, historical-child and legacy-regression tests before any existing-database migration. Review index-build locking and backup/recovery for the target database. No destructive rollback script is proposed for append-only records.

**Recommendation: PASS for starting M1-E2 implementation only.** The additive draft applies, its core guards and concurrent behavior work on disposable PostgreSQL, and no draft SQL or Prisma defect required correction. This is **not** approval to apply a migration to the existing application database or to enable durable verification issuance. Those remain blocked by the gates above and require separate authorization.

## Verification record

- Disposable PostgreSQL integration: **20/20 tests passed**, including private-cluster teardown.
- Existing Storyline contract, preparation, media, human-verification, duration, evidence DTO, integration-boundary and persistence-draft suites: **8/8 files passed**. The draft suite includes isolated Prisma schema validation.
- `pnpm lint`: passed.
- `pnpm exec tsc --noEmit`: passed.
- `git diff --check`: passed; the new review artifacts were also scanned for trailing whitespace because Git's diff check omits untracked files.
- Production build: not run; this milestone changed only review documentation and tests, not application code or build-relevant files.
