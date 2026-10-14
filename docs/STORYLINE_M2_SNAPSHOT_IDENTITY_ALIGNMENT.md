# Storyline M2-03D — persisted snapshot identity alignment

## Decision and scope

Snapshot IDs are **opaque immutable identifiers**, not persistence credentials. M1's existing `candidate-*` IDs remain unchanged when persisted and are valid durable references after database-backed eligibility checks. No existing identifier, payload, hash, FK or history is rewritten. No schema, migration, SQL gateway, API, queue, worker, UI, dependency or environment change is required.

Pure recipe assembly validates structure and computes the same versioned canonical bytes/hashes. It establishes neither persistence nor execution authority for any ID. The separate server-only `lib/storyline/jobs/persisted-source.ts` supplies database-backed current-source eligibility through transaction-owned opaque handles. An in-memory candidate, `persisted: true`, provider JSON, copied hash or invented handle cannot enter that trusted path.

This resolves the M2-03C integration blocker without turning an ID convention into a security rule. Paid admission, human SOURCE_VERIFIED receipts and script/subtitle approval remain independent and disabled in application bootstrap.

## Proven identity lifecycle and root cause

1. `prepareStorylineSource` reads actual selected source records, inspects media and calls `reconstructStorylineSource`. Reconstruction assigns `candidate-${hash}` from dependency/media identity. The returned wrapper says `PREPARED_CANDIDATE`, `persisted: false`, `approved: false`.
2. `persistPreparedStorylineSource` verifies that candidate identity, locks Project → Movie → Studio, reconstructs authoritative current source and checks media before/after insertion. It stores `snapshot.payload.id` **unchanged**, or returns the existing matching immutable record. It does not rename the identifier after commit.
3. M1 SQL/Prisma contracts enforce immutable scope/content/dependency fields and historical relations. They do not reserve the `candidate-` namespace for nonpersisted records.
4. M2 `checkedSource` previously rejected every ID beginning with `candidate-`. That contradicted the actual M1 producer and did not prove persistence for any other spelling. No database fact can be inferred from that prefix.
5. The alignment removes only this prefix heuristic from the **structural** validator. Trusted eligibility now loads the real row for the exact selected movie/project/Studio, validates its complete immutable content and current dependencies, then constructs/validates the recipe. The restricted M2-03C admission still rechecks source under its locks and requires its separate authenticated synthetic decision/fence proof.

## Structural identity versus trusted eligibility

| Boundary | Establishes | Does not establish |
| --- | --- | --- |
| `createStoryTaskRecipe` / `validateStoryTaskRecipe` | Bounded source/script/profile/Studio shape, evidence constraints, exact canonical recipe and deterministic hashes | Database persistence, operator identity, live freshness, profile approval, permission to spend or send |
| `createPersistedStoryTaskSourceAccess(database)` | Explicit trusted server dependency installation; each transaction probes actual effective PostgreSQL privileges | Browser authentication or authority from constructor/role labels |
| `load(tx, selection, inspectedMedia)` | Existing immutable record, exact scope/current pointers/revision, canonical payload/projections, authoritative M1 Chinese/ALL_CURRENT/QC/evidence context and media observation | Human verification or a future source reservation |
| `createRecipe` / `validateRecipe` on this access | Recognized handle owned by this access and active transaction; fresh reload/comparison before canonical assembly | Spending authority, a completed task or an executable provider checkpoint |
| Existing disposable `open_fence` → validation → `finalize` | Cooperating source locks through transaction completion, separate synthetic decision, HMAC-bound server validation and atomic first admission | Production authentication, billing guarantees or permission to activate paid workflows |

The helper has **no default datasource** and no application instantiation. Its Prisma connection and previously inspected M1 media object are trusted server-bootstrap dependencies, never client/provider payloads or user-selectable callbacks. Prisma 7 returns an Object.prototype proxy (`instanceof PrismaClient` is false); the guard rejects ordinary/serialized adapter proposals using the exported constructor, and the actual transaction performs privilege checks. This JavaScript guard is not authentication of hostile server code. Trusted bootstrap/database adapter/inspector code and privileged administrators remain outside the caller-JSON threat boundary, as in the existing M1 services.

The PostgreSQL probe rejects owner/superuser/DDL identities, privileged inherited membership, changed replication mode and direct paid-table/receipt DML (including column grants). Actual restricted admission/runtime test connections pass. Schema owners are used only to seed disposable fixtures or exercise a negative privilege test, never to perform the success-path admission.

Handles live in a private per-access WeakMap. Callers cannot issue them, supply a lookup callback, serialize them, clone them into authority, transfer them to another access/transaction, or reuse them after transaction completion. They contain no exposed snapshot text or persistence boolean. Every trusted recipe operation reloads the row, current Studio/source/script and full source reconstruction; even a recognized handle cannot authorize changed content.

## Exact validation and transaction behavior

The loader validates exact Project/Movie/Studio ownership, current snapshot ID, expected Studio revision and optional current script ID. It parses the immutable canonical payload, rechecks ID, source/content/context/dependency/binding hashes, media SHA/bytes/duration and captured timestamp against stored columns, and compares the complete source with existing `assertAuthoritativeStorylineSource` reconstruction. The optional script is checked against its current Studio/source, exact canonical payload/hash/ID/version/parent/origin and existing script/evidence validator.

Only `{ projectId, movieId }` is passed to M1 reconstruction; Studio/snapshot/revision selection fields are not spread into the source payload. Exact Unicode, Chinese anchors, ALL_CURRENT approval/manual/QC metadata, timestamps and evidence ownership are preserved. No content truncation, normalization, human approval or SOURCE_VERIFIED claim is added.

Source access owns a bounded ReadCommitted transaction and rejects arbitrary/unregistered transaction objects. It performs reads and validation only; its transaction callback is trusted server code. It does not itself acquire source-writer locks or call a paid gateway. An unfenced planning result is an observation, not a future execution lease. In the integration fixture, the existing M2-03C gateway opens its fence **on that same transaction** before loading/validating the handle, and holds Project → Movie → Studio → Task → Decision locks through finalization/commit. Media hashing/probing remains outside; M1 descriptor/path freshness checks run inside and again before completion.

The helper returns only static controlled error codes/paths on read/validation failures and logs nothing. No private source content, key, path, provider response or database error is forwarded. Structural shape errors remain rejected through the trusted builder rather than being treated as proof of persistence.

## Compatibility and producer regression

Recipe schema/version, canonical serialization, domain-separated hash algorithm, logical keys and source/script hashes are unchanged. Identical previously accepted recipes retain identical bytes/hashes. Snapshot ID substitution still changes identity and is rejected against the actual persisted record; the new helper accepts the existing ID exactly as stored.

`transactional-gateway.fixture.ts` now prepares and persists through the **actual M1 services**, retrieves that one immutable row, preserves its returned `candidate-*` ID, persists its script through the actual M1 service, constructs the full M2 recipe through the trusted source access, and performs fenced admission using restricted connections. The old extra translation-revision change and replacement `disposable-current-source` fixture insertion are removed. The success path asserts **one snapshot**, one logical task, one consumed confirmation, dispatch, event and admission under concurrent requests.

The only extra source-row insertion in the new identity suite is an explicitly negative, self-consistent forged-content fixture. It uses existing M1 writer privileges in the disposable database, recomputes structural hashes and sets a current pointer, then must fail full authoritative Chinese reconstruction. It is never used as a success replacement and does not alter the original immutable producer row.

## Verification and remaining gates

The new identity suite covers genuine producer integration; real newly prepared/unpersisted candidate rejection; forged JSON/booleans and copied/expired/cross-access handles; wrong scope/revision/source/script; substituted recipe/hash/media; changes after handle creation; unsafe database owner; and forged persisted content. The existing 40-test M2-03C proof retains privilege, source/QC/media races, duplicate admission, late rollback, outbox/read and role-order checks on the genuine producer path. Existing UNKNOWN/global-slot and legacy tests remain required.

**Recommendation: PASS to restart separately scoped fake-only M2-03.** No identity/schema/authority prerequisite remains demonstrated within this bounded integration. This milestone does not implement full M2-03 services or M2-04. Real operator/spending authentication, approved profile/cost policy, production role/key management, existing-database migrations and runtime/paid activation remain separate approval gates. A source observation or successful synthetic admission proves none of those live guarantees.

| Check | Result |
| --- | --- |
| New snapshot identity suite, both role orders | 24/24 PASS |
| Existing transactional source/outbox/read proof on real producer | 40/40 PASS |
| Existing M2 contracts/SQL/gateway/role-order suites | 57/57 PASS |
| M1 Storyline source/persistence/verification/duration/contracts | 359/359 PASS |
| Legacy Recap/queue contracts | 37/37 PASS |
| Full combined regression run | **517/517 PASS**, no skips, including Node parent tests |
| pnpm lint | PASS |
| pnpm exec tsc --noEmit | PASS after build |
| git diff --check / cached / individual untracked files | PASS |
| pnpm exec next build --webpack | PASS outside sandbox with unreachable dummy datasource |

Commands executed:

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx tests/storyline/jobs/snapshot-identity.test.ts
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx tests/storyline/jobs/transactional-gateway.test.ts
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' node --conditions=react-server --import tsx --test-concurrency=1 --test tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts tests/video-render/queue-contract.test.ts
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

The sandboxed build failed with `Could not parse output from TypeScript's --showConfig.` The identical command succeeded outside the sandbox; no configuration was weakened. A constructor-only probe against the installed Prisma client used an unreachable dummy adapter without executing database queries. No application datasource, real provider/Redis, real movie rendering or live verification receipt was used. An import scan found no source-access instantiation in application pages/routes or worker bootstrap. Existing regression suites use their own synthetic disposable fixtures only.

Created: `lib/storyline/jobs/persisted-source.ts`, `tests/storyline/jobs/snapshot-identity.test.ts`, this document.

Modified: `lib/storyline/jobs/recipe.ts`, `contracts.ts`; `tests/storyline/jobs/contracts.test.ts`, `transactional-gateway.fixture.ts`, `transactional-gateway.test.ts`; `docs/STORYLINE_M2_ADMISSION_IMPLEMENTATION.md`, `STORYLINE_M2_ADMISSION_GATEWAY_REVIEW.md`. The obsolete prefix-rejection assertion now tests structural prefix neutrality; its actual persistence security is covered by the new trusted-path rejection matrix. The 40-test proof's former expected-blocker assertion now verifies the actual returned ID and exactly one persisted snapshot. All its role/evidence/freshness/rollback/outbox assertions remain intact.

No M1 preparation/persistence/integrity service, Prisma schema/migration, SQL gateway, role grant, dependency, environment, API, queue, worker or UI changed. Cached Git diff SHA-256 remained `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`; staging, unrelated files and logs were preserved. No commit or push occurred.
