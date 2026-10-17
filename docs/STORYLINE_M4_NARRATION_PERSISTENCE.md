# M4-03 Durable provisional narration persistence

## Scope and implementation

This milestone adds explicitly composed, server-only persistence and retrieval of **synthetic provisional narration** in newly owned disposable PostgreSQL only. No application datasource, live migration, Prisma model, HTTP route, UI, worker, provider or runtime activation is installed.

`createProvisionalNarrationPersistence` in `lib/storyline/narration-integration/persist.ts` exposes:

```ts
const receipt = await persistence.persist({
  scope: { projectId, movieId, studioId },
  candidateId,
  candidateHash,
  draft: prepared.draft, // { payload, draftHash }; proposal, never authority
});
const view = await persistence.read({
  scope: { projectId, movieId, studioId },
  narrationId: receipt.id,
});
```

The injected writer/reader connections, fixed synthetic profile, media inspector and ephemeral 32-byte validation key are trusted server/test composition dependencies. They cannot be supplied by the request. The key authenticates the validation boundary to the disposable gateway; it is not operator authentication, spending permission or a human verification signature. Missing keys or mismatched keys fail closed. No production bootstrap imports these services.

## Durable record and dependency identity

The review-only `docs/drafts/storyline-m4-narration-persistence.sql` creates `StoryNarrationDraft` with:

| Fields | Meaning |
| --- | --- |
| Project/Movie/Studio IDs; expected Studio revision | Exact selected movie and captured Studio context. |
| M3 candidate ID/hash | Immutable validated evidence-analysis payload, separate from M2 completion marker. |
| M2 task/generation/result/submission IDs and result hash | Exact definitive completed synthetic result lineage. |
| M1 snapshot ID/content/context/dependency/binding hashes; media SHA-256 | Immutable Chinese-authoritative evidence and ALL_CURRENT context dependencies. |
| Recipe/profile hashes | Originating M2 immutable task/profile, not a newly admitted drafting task. |
| Schema/composer versions; canonical payload; draft SHA-256 | Exact Myanmar bytes, ordered sections/claims, evidence, qualification, review metadata and deterministic content identity. |
| Origin/review/approval; creation time | SYNTHETIC_TEST / NEEDS_HUMAN_REVIEW / PROVISIONAL; database timestamp. |

An additive composite unique index on M3 candidate metadata supports a composite FK across the exact scope/task/result/snapshot/dependency/recipe binding. Studio ownership also has a composite FK. All delete/update relationships restrict history loss. Bounds include generation/revision, byte ceiling (512 KiB), finite creation time, hash shape, exact domain-separated payload SHA-256, fixed versions and provisional-only metadata. The gateway checks the payload's full source and analysis projection against authoritative records.

Uniqueness is `(candidateId, schemaVersion, composerVersion)`. This fixed synthetic composer produces one immutable draft for an exact candidate/version. Same bytes return the same database ID, timestamp and receipt. Different bytes cannot overwrite that identity; conflict aborts the transaction. New text-edit/version workflows are not implemented and cannot be simulated by overwriting this record.

Canonicalization and grounding use the existing TypeScript validators. The database hashes the exact signed UTF-8 bytes, checks relational/projection invariants and requires the validation attestation; it does not independently implement JavaScript canonical serialization or prove semantic truth. Chinese evidence remains authoritative; Myanmar approval, MANUAL origin or QC state never grants source-verification authority. Duration remains unavailable under the existing synthetic policy, with no fabricated TTS estimate.

## Restricted disposable gateways

The SQL draft ends in ROLLBACK. Only the owned disposable harness transforms that final rollback to commit after isolated baseline and M1/M2/M3/M4-02 setup.

- `storyline_m4_narration_writer`: NOLOGIN group inheriting the existing source reconstruction/read capability, plus narrowly granted `story_m4_test_narration_open` and `story_m4_test_narration_finish`.
- `storyline_m4_narration_reader`: existing source read capability, plus historical `story_m4_test_draft_read` only; cannot open or finish writes.
- Both lack direct draft/fence/key table SELECT or DML. Existing admission/outbox/checkpoint/runtime/verification roles receive no new draft write/read gateway permission.
- PUBLIC execution is revoked; SECURITY DEFINER functions use fixed search paths, qualified objects and a separate migration owner. The service verifies actual connection privileges and existing M1 checks reject owner/elevated identities.

The existing private test-login scope map binds all calls to exact Project/Movie/Studio. Raw source SELECT privileges required for M1 reconstruction are not RLS or public multi-user authorization. Synthetic scope provisioning and credentials exist only in the isolated harness.

`open` uses the existing M4-02 scoped read/lock operation and creates a transaction/backend/login-bound nonce challenge in the private `StoryTestNarrationFence`. `finish` requires a matching current transaction, a challenge younger than 20 seconds, a valid HMAC over challenge plus draft hash, exact canonical-byte hash and fresh authoritative M1/M2/M3 relational binding. It inserts or returns the identical record, removes the fence and returns an allowlisted receipt. Neither operation issues confirmations, checkpoints, M1 receipts or M2 results.

UPDATE/DELETE and statement-level TRUNCATE triggers reject immutable history changes even for ordinary administrative DML. Runtime roles cannot alter tables/triggers or use direct inserts. The privileged migration administrator remains outside the runtime trust boundary; it can install or alter schema and is used only for disposable provisioning/corruption fixtures.

## Atomic currentness and rollback

M4-02's reconstruction was extracted into internal `context-access.ts`; its public preparation signature/output remains unchanged. Preparation and persistence share one implementation instead of accepting an earlier prepared draft as proof of freshness.

Persistence performs:

1. Strict proposal validation and bounded serialization.
2. Scoped preflight, media inspection outside locks.
3. Project → Movie → Studio → Task lock acquisition in a bounded ReadCommitted transaction.
4. Exact persisted M3/M2/source loading and authoritative M1 Chinese/translation/QC/media/script reconstruction.
5. Existing M3 grounding checks and M4-01 strict narration validation against the reconstructed context.
6. Open/finish challenge-attested insertion within that same transaction and source fence.
7. Final authoritative source and media checks **after insertion**, then commit before returning a receipt.

The final checks catch failed media identity or other source faults and roll back narration plus challenge state. A source writer committing during preflight is observed after lock acquisition and invalidates the proposal. A cooperating writer arriving during insertion blocks until commit; afterward the historical record remains immutable and the next read reports stale.

The existing 20-second transaction and five-second lock bounds remain. These transactions cannot be PostgreSQL READ ONLY because they acquire row locks; actual table DML is possible only through the narrow signed gateway. Historical retrieval starts with a true read-only transaction and performs no writes. Currentness reconstruction may acquire locks but has no insertion callbacks or gateway write privileges.

`CURRENT_AT_VALIDATION` / `PROVISIONAL_CURRENT_AT_READ` are point-in-time observations, not future freshness leases. Future review, editing, persistence or downstream publication must re-fence dependencies. Existing cooperating source-writer conventions and M1 media inspection guarantees remain required; this is not an atomic filesystem/PostgreSQL transaction or protection against a privileged administrator bypassing the protocol.

## Read DTO and historical state

Scoped retrieval returns:

- `MISSING`: no matching narration; no approved script implied.
- `PROVISIONAL_CURRENT_AT_READ`: historical payload still passes reconstructed current dependencies and strict M4 validation.
- `STALE_DEPENDENCIES`: captured source, media, translation/QC, Studio or script dependencies no longer qualify; exact historical payload remains readable as provisional.

Every existing record view includes `humanApproval: NONE`, `sourceVerified: false`, synthetic/provisional trust, bounded IDs/hashes, creation time and canonical payload. No keys, challenge, raw provider/result envelope, private paths or storage keys are returned. This server-side payload contains narration/evidence and is not automatically approved for a browser API. A database/authorization/validation failure is a controlled error, not silently reported as current; an unclassifiable concurrent relational change may require an explicit new read.

No human-approved M1 script is returned or created. The states distinguish provisional narration explicitly from that separate human approval domain. Receipt lookup cannot issue SOURCE_VERIFIED, change subtitle approval, count synthetic claims for supported duration or authorize TTS.

## Acceptance tests

`tests/storyline/narration-persistence-postgres.test.ts` uses actual exported services for persisted M1 → M2 fake admission/outbox/worker/checkpoint/result → M3 candidate → M4 preparation/persistence/read. Only setup uses the zero-cost branded fake wire; persistence retries do not send or checkpoint.

Tests cover both role orders, exact older-movie identity and candidate/result separation; concurrent first inserts on distinct connections; identical retry receipts; cross-scope/forged bindings; strict narration and recomputed conflicting hashes; immutable triggers; direct role denials and bad proofs/keys; schema bounds/FKs; current/stale/missing reads; Chinese/translation/QC/media/Studio/script drift; actual PostgreSQL source-writer lock races; rollback after insert/final media failure; incomplete/UNKNOWN rejection; unchanged M1 script/verification and M2 result counts; and no network/provider/TTS calls.

| Verification | Result |
| --- | --- |
| Final focused M4-03 PostgreSQL tests | 13/13 PASS, zero failures/skips |
| Combined relevant M1/M2/M3/M4 and listed legacy suites | 795/795 PASS, zero failures/skips; includes 33 M4-01, 15 M4-02 and 13 M4-03 tests |
| Existing Recap UI / Studio navigation regression files | 2/2 PASS |
| Lint / TypeScript | PASS / PASS |
| Working-tree / staged diff checks; new-file whitespace | PASS / PASS / PASS |
| Webpack build with unreachable dummy datasource | PASS |

Disposable PostgreSQL and the production build ran outside the sandbox with approval for local execution. The application datasource was unreachable and no application records were accessed. The first TypeScript check caught a test trying to read a non-exposed result hash from the M3 safe DTO; the assertion now uses the owned fixture's audit row, and final checks pass. No new dependency/build warnings were emitted. Existing M1 synthetic receipt regressions remain isolated test fixtures; this M4 workflow creates no verification receipts or approved content.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-reporter=spec \
  tests/storyline/narration-persistence-postgres.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test tests/recap/recovery-ui.test.tsx tests/storyline/ui/navigation.test.tsx
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable pnpm exec next build --webpack
```

## Files and next milestone

Created: this document, review-only SQL draft, `narration-integration/context-access.ts`, `narration-integration/persist.ts`, focused PostgreSQL tests.

Modified: `narration-integration/prepare.ts` (shared context runner, same public contract), disposable PostgreSQL role helper and transactional fixture (opt-in installation/connections only). Existing uncommitted M4-01/M4-02 work and logs are preserved. No dependency, environment, application Prisma schema/migration, API/UI or existing worker behavior changes.

M4-04 is ready for separately authorized synthetic workflow/recovery integration over durable provisional drafts: preserve explicit invocation, exact immutable dependency identity, no resend on persistence retry and currentness rechecks. A future freeform MODEL/HUMAN editing/review workflow needs a separately versioned validator and append-only version contract; the fixed synthetic projection cannot accept arbitrary prose. Durable M2 drafting jobs must bind M3 candidate identity in their recipes before admission. Human verification/approval, live migration, authenticated spending, production transport, TTS and UI activation remain separate gates. Do not enable them from this milestone.

**M4-03: PASS (synthetic/disposable only). M4-04 foundation readiness: READY for a separately authorized scope. Paid/live activation remains BLOCKED.**
