# M3-03: disposable evidence candidate persistence

## Boundary and status

M3-03 stores a separately supplied, structurally grounded **synthetic candidate** after a definitive M2 `COMPLETED` result. The durable M2 result remains the `story-fake-result-v1` completion marker; its bytes are never relabeled as an evidence candidate. A candidate is `PROVISIONAL_CANDIDATE` / `STRUCTURALLY_GROUNDED`, never `SOURCE_VERIFIED`, script-approved or human-approved. This implementation is disposable-test-only and does not install a live migration, production provider, API or worker.

The review-only SQL is [`docs/drafts/storyline-m3-candidate-persistence.sql`](drafts/storyline-m3-candidate-persistence.sql). It is installed only by the owned scratch PostgreSQL fixture after the M1 baseline and M2/M3-02 drafts. It must not be copied into `prisma/migrations` or deployed without a separate production design, authentication, migration and security review.

## Immutable record

`StoryEvidenceCandidate` stores one row per `(taskId, generation)` with:

| Identity | Recorded fields |
| --- | --- |
| Scope | project, movie, Studio, M2 task and generation |
| Durable result | result ID, submission ID and immutable M2 result hash |
| M1 source | snapshot ID, Chinese content/context, preparation dependency and binding hashes, expected Studio revision |
| Recipe | immutable recipe and profile hashes |
| Candidate | version, exact canonical UTF-8 JSON bytes, domain-separated SHA-256 hash, synthetic origin, structural-validation status and timestamp |

Foreign keys restrict deletion of the scoped Studio, task, result and snapshot. The transaction gate checks all task/result/snapshot bindings, the completed/resolved/validated state, fixed synthetic profile and candidate JSON projections. A row-level trigger rejects UPDATE and DELETE, and the writer has no table DML. Same-byte retries return the original row; different bytes for the same task generation fail. Historical rows remain stored when live source dependencies change.

The SQL draft does not add a live Prisma model or change existing M1/M2 records. The final live schema will need a reviewed migration and separately configured restricted roles.

## Restricted write and read

The disposable `storyline_m3_candidate_writer` role receives SELECT only on the M1 source tables needed for authoritative reconstruction. It has EXECUTE only on `story_m3_test_candidate_open` and `story_m3_test_candidate_finish`; it has no generic paid-table or candidate-table DML, spending decision, provider checkpoint, result or verification receipt privilege. `storyline_m2_reader` receives only the scoped `story_m3_test_candidate_read` function. Both role-installation orders used by the existing fixture are tested.

The server-only synthetic service in `lib/storyline/evidence-analysis/persist-candidate.ts` takes explicit restricted connections, a fixed synthetic profile, media inspector and a process-local disposable validation key. It does not read application `DATABASE_URL` or accept caller-supplied persistence/verification claims. The key is created in memory by the disposable fixture, inaccessible to the writer role and never returned or logged. This is **not** a production authentication or spending mechanism.

Persistence follows one restricted Read Committed transaction:

1. Reject oversized/malformed input and inspect selected movie media.
2. Open the SQL fence, locking Project → Movie → Studio → Task and reading the exact definitive M2 result.
3. Reconstruct the persisted M1 source and current Chinese, translation/QC, scene, character, Studio and media dependencies under those cooperating locks.
4. Verify the immutable recipe/profile and synthetic M2 result marker, then run M3-01 candidate grounding validation.
5. Canonicalize exact candidate bytes, compute the domain-separated hash and sign the transaction-bound challenge plus candidate hash.
6. Insert through the narrow gateway; recheck media before transaction commit. Any failure rolls back candidate and fence together.

The SQL gateway verifies the transaction-bound proof and its own task/result/snapshot/recipe projection before insert. This protects against direct writer-role fabrication and races with **cooperating** source writers that use the repository's Project/Movie lock order. It cannot establish semantic truth or protect against a privileged administrator mutating child rows outside the cooperating lock protocol. M3-02 and M3-03 remain synthetic, local acceptance infrastructure.

The read operation requires exact project/movie/Studio/task/generation scope, validates canonical bytes and hash, and returns `MISSING`, `VALIDATED_CURRENT` or `STALE_DEPENDENCIES`. Its server-only DTO always labels the candidate provisional and `humanApproval: NONE`; no HTTP route exposes it. A stale historical candidate is not silently republished as current.

## Acceptance and next boundary

The focused disposable tests cover M1-first and M2-first role installation, genuine M1 → M2 → M3 completion and persistence, simultaneous first inserts, same-payload idempotency, conflicting-payload rejection, exact scope, missing/UNKNOWN result, QC/Chinese/media/Studio staleness, restricted privileges, and rollback after a forced post-insert failure. No provider or human-verification side effect is permitted.

M3-04 may consume the provisional candidate as input to draft planning **only after** a separate design/implementation for candidate selection, semantic review and source verification. It must not interpret this record as human approval, create paid requests from GET, or bypass M2 UNKNOWN and spending controls. Production deployment remains blocked pending live schema/role review, authenticated operator authority and explicit paid-operation activation.
