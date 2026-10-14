# Storyline M1-E2A server persistence

**Implementation status:** five additive Prisma models and their reviewed SQL migration are present in source control, but the migration has **not** been applied to the Movie Translator development or production database. No API, worker, Studio UI, provider call or receipt writer is connected to these services. The only SQL execution in this milestone used a fresh, verified disposable PostgreSQL 18.6 cluster.

## Migration and database boundary

`prisma/schema.prisma` adds `StorylineStudio`, `StorySourceSnapshot`, `StoryScriptVersion`, `StoryBeat` and `StorySourceVerification`, the four reviewed enums, plus Movie's composite `(id, projectId)` key and optional Studio relation. `prisma/migrations/20261012120000_add_storyline_m1_foundation/migration.sql` contains the reviewed additive DDL, CHECK/FK/unique/index/trigger guards and a transactional `COMMIT`. A static parity test strips comments and confirms its executable SQL matches the review draft except for the draft's final `ROLLBACK`. Earlier migrations and existing records are unchanged.

Tests start a uniquely named private PostgreSQL 18.6 cluster under `/tmp`, with a new database, dedicated random credentials and a private Unix socket. They verify data directory, database, role, UTF8 and local connection before applying every committed baseline migration followed by this artifact. Prisma tests use `PrismaPg` configured only from that disposable harness. Prisma validation and generation use a dummy unreachable datasource; neither step connects to the application database. The normal test teardown removes only the current test-owned scratch cluster.

## Snapshot write contract

`persistPreparedStorylineSource` is server-only and has no route. It requires an exact M1-B `PREPARED_CANDIDATE`, with `persisted: false`, `approved: false`, mandatory preparation manifest, recomputed source/content/context hashes, admissions, and the deterministic candidate ID. The caller provides the exact project/movie selection and expected Studio revision (`null` when no Studio exists). The result contains only Studio/snapshot IDs, hashes, final revision and a deduplication flag; no source text, storage key, path or approval claim is returned.

The service reads the selected authoritative source, hashes/probes the private media outside its write transaction using `inspectStorylineMedia`, and compares the candidate's dependency, media, video and storage binding. The write transaction takes locks in **Project → Movie → Studio** order, matching existing Recap and character publication paths. It rereads the full source inside that transaction after the locks, compares the exact dependency and binding hashes, storage key and recorded file size, then calls the inspector's descriptor/path identity check before and after writing. A source/media mismatch aborts the transaction. The existing storage provider publishes movie keys exclusively; this service does not rewrite media. External filesystem edits that bypass that controlled provider cannot be made transactional with PostgreSQL and are outside the trusted-local guarantee.

The Studio and immutable snapshot are created atomically. Deduplication is scoped to `(studioId, sourceContextHash)`; an existing artifact is revalidated against its canonical payload and projected fields before reuse. Exact duplicate calls can return the current row without a write even when their original revision is stale. A different source or pointer change requires the expected revision. A new source pointer clears the old current script pointer; historical snapshots and scripts remain intact. Trigger-owned Studio revisions may advance more than once per transaction, so callers use the returned revision rather than predicting it.

All current aligned Myanmar rows remain context regardless of subtitle approval; source Chinese remains primary evidence. Snapshot writes never change translation text, subtitle approval, QC, Translation Memory, source timing, legacy Recap or source media.

## Draft script version contract

`persistStorylineScriptDraft` is server-only and accepts the exact selection, persisted source snapshot ID, Studio revision, `MODEL` or `HUMAN` draft origin, and beats. It loads and revalidates the immutable source, then checks current source/media dependencies. Under Project → Movie → Studio locks it requires the snapshot to be the Studio's current pointer, checks the expected revision, allocates `nextScriptVersion`, binds the immediately preceding version as parent, generates a server ID, and validates all beats and claim anchors against the immutable Chinese/source evidence. The script and complete beat projection commit together; the deferred SQL guard rejects partial or mismatched beat sets. Concurrent writers yield one version winner. The result says `approved: false` and `sourceVerified: false`.

Persisting a draft is **not** human source verification, subtitle approval, AI review or narration approval. No voice or render eligibility is inferred.

## Receipt issuance boundary and M1-E2B

M1-E2B now supplies an uninstalled, gated server issuer/lookup and a disposable-tested role proposal; see [STORYLINE_VERIFICATION_SECURITY.md](STORYLINE_VERIFICATION_SECURITY.md). Application issuance remains disabled. The following describes the boundary at M1-E2A completion.

`STORYLINE_VERIFICATION_ISSUANCE_ENABLED` is explicitly `false`. No receipt writer, API or automatic path is implemented. The application Prisma connection currently owns its tables; valid shape and `REVOKE FROM PUBLIC` do not prove operator authority. M1-E2B must provide a trusted-local operator authority mechanism, server-owned single-use decision/receipt issuance, least-privilege runtime and issuer database roles, exact claim/Chinese-anchor/context hash recomputation, current source/media checks, and append-only authoritative lookup including revocation/supersession. A local audit label is not authentication. Until then, verification issuance remains disabled.

## Verification and deployment gates

The disposable integration suite covers migration application, source deduplication, source-key race after lock wait, media identity failures, text/approval/QC/alignment/scene/character-evidence staleness, cross-selection rejection, script allocation and rollback, and unchanged synthetic transcript/translation/Recap rows. The earlier M1-E1.5 SQL guard/concurrency suite remains a separate regression. No test uses a real media file, real transcript or existing database.

Applying this migration to an existing database still requires separate explicit authorization, target identity verification, backup and recovery planning, and review of the new Movie index build/retention behavior. Before enabling receipt issuance, complete the M1-E2B security dependencies above. This milestone does not authorize `prisma migrate dev`, `deploy`, `db push` or `reset` on the application database.
