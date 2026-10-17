# M4-02 Trusted narration context integration

## Implemented boundary

`createPersistedNarrationPreparation` in `lib/storyline/narration-integration/prepare.ts` is an explicitly composed, server-only service. It accepts injected restricted database access, a server-controlled synthetic analysis profile and media inspection. There is no default application datasource, HTTP route, worker bootstrap, feature flag, provider transport or signing authority.

```ts
await service.prepare({
  scope: { projectId, movieId, studioId },
  candidateId,
  candidateHash,
});
```

This strict request accepts no approval, freshness, verification, recipe, task/result assertions or candidate payload. It requires the exact selected movie, including an older movie in a multi-movie project. It never substitutes the newest movie.

The returned frozen value contains `persisted: false`, `trust: PROVISIONAL_SYNTHETIC_DRAFT`, `humanApproval: NONE`, `sourceVerified: false`, `currentness: CURRENT_AT_VALIDATION`, allowlisted candidate/result identity and the validated narration draft/hash. It does not return storage keys, private result envelopes or the server context. The draft intentionally contains captured evidence and narration for server-side use; this is **not a public/browser DTO**.

## Trusted identity acquisition

The service loads rather than accepts:

1. Exact immutable M3 candidate ID, canonical payload and domain-separated candidate hash.
2. Exact M2 task/generation, completed result/submission, canonical immutable recipe and profile hash.
3. Exact M1 persisted source snapshot, dependency/binding hashes and Studio revision.
4. Reconstructed authoritative Chinese transcript, scenes, character/relationship permitted anchors and advisory ALL_CURRENT Myanmar context.

The M2 completion marker and M3 candidate remain separate artifacts. Both are validated independently; the result marker hash is never substituted for the candidate hash. Only definitive COMPLETED/RESOLVED synthetic results with `VALIDATED_CANDIDATE` and `synthetic-v1` qualify. UNKNOWN, incomplete, missing or mismatched lineage fails closed.

The supplied profile must be the fixed synthetic ANALYZE_EVIDENCE definition and match the persisted profile hash and recipe. This milestone does not invent a durable profile registry or authorize paid execution.

Existing `createPersistedStoryTaskSourceAccess` reconstructs and validates current source/media/QC/script state. Existing M3 grounding validation runs again over canonical persisted bytes, even when the stored validation label and hash are internally consistent. M4-01's composer and validator then check the complete captured context, evidence ownership, inference qualification and exact synthetic Myanmar rendering. Structural grounding remains distinct from semantic truth.

## Minimal disposable read gateway

`docs/drafts/storyline-m4-narration-read.sql` is review/disposable-only and ends with ROLLBACK. Only the owned test harness replaces that final rollback with commit. There is no live migration, Prisma change or application database installation.

The new NOLOGIN `storyline_m4_narration_reader` group has:

- SELECT on the M1 source tables needed for authoritative reconstruction.
- EXECUTE only on the new `story_m4_test_narration_read` envelope operation.
- No direct SELECT on M2 paid tables, M3 candidate storage, M1 receipts, signing keys or candidate fence records.
- No table DML, admission, outbox, worker/checkpoint, candidate-write or verification-issuance privileges.

The SECURITY DEFINER function has a fixed search path, qualified objects, explicit grants and no PUBLIC access. It checks the private test-login READER scope map, exact candidate ID/hash, task/result/submission identity, source and current Studio binding. It reuses the existing bounded M3 read projections. The service also inspects actual connection privileges and rejects schema-owner/elevated or incorrectly privileged connections.

Source SELECT privileges are those required by the existing M1 reconstruction service; they are not row-level multi-user authorization. The private scope map and synthetic logins belong only to the disposable harness. This does not activate production authentication, spending authority or public deployment security.

## Currentness and concurrent readers/writers

The operation has two stages:

1. Scoped gateway read and private media-key lookup; commit, then inspect media outside database locks.
2. Repeat the gateway read under Project → Movie → Studio → Task locks; reconstruct authoritative M1 source, recheck immutable M2/M3 bindings, compose/validate, perform a final authoritative inspection and media unchanged check, then commit before returning.

Transactions use the existing bounded ReadCommitted service (20-second transaction timeout, five-second lock timeout). Fresh SQL snapshots after acquiring locks observe any cooperating source writer that committed during media inspection. Existing Project → Movie source-writer locks are compatible with the final fence. A writer arriving during composition waits until the read transaction commits.

The transactions are not `SET TRANSACTION READ ONLY`: PostgreSQL forbids SELECT FOR UPDATE there. They perform no record writes; the restricted reader has no DML and the new gateway creates no fence rows or history. Row locks provide consistency without modifying application records.

`CURRENT_AT_VALIDATION` is an observation, **not a future freshness lease**. A source can change after commit. Future persistence/approval/publication must reacquire the source fence and revalidate exact dependencies. Existing cooperating writer conventions are required; an unrestricted administrator bypassing those conventions is outside this guarantee. Media inspection and final unchanged checks reuse the M1 abstraction rather than claiming an atomic filesystem/database transaction.

Any failed identity, grounding, media or currentness check returns a controlled StoryTask error and no draft. Test-only coordination hooks are dependency injection, never request fields or production bootstrap.

## Acceptance evidence

`tests/storyline/narration-integration-postgres.test.ts` exercises exported M1 persistence, M2 admission/outbox/fake-worker/checkpoint/result, M3 workflow/persistence and this M4 service on newly owned isolated PostgreSQL clusters. Application DATABASE_URL is an unreachable dummy. Fixtures use synthetic media identities and source records, not actual movies.

Coverage includes both M1/M2 role installation orders; exact persisted lineage; older selected movie; MANUAL/unapproved/QC-flagged advisory translation; deterministic concurrent reads; source/translation/QC/media/script/Studio/character drift; actual source-writer lock races; missing and forged candidate identity; mismatched task/result; UNKNOWN refusal; persisted-but-invalid grounding; relationship endpoint reconstruction; wrong-role and schema-owner denial; unchanged record counts and no new send or approval.

Setup uses genuine zero-cost fake transport to create durable M2 results. Narration preparation never sends, checkpoints, retries or modifies those results. Fetch is explicitly denied in the focused suite. There is no M4 persistence, SOURCE_VERIFIED issuance, TTS, audio generation or paid provider call.

### Verification

| Check | Result |
| --- | --- |
| Focused M4-02 disposable integration suite | 15/15 PASS |
| Combined M1/M2/M3/M4 and listed legacy regressions | 782/782 PASS, zero failures/skips; includes the 15 M4-02 and 33 M4-01 tests |
| Recap recovery UI and Studio navigation regression files | 2/2 PASS |
| `pnpm lint` / `pnpm exec tsc --noEmit` | PASS / PASS |
| `git diff --check` / `git diff --cached --check` / new-file whitespace | PASS / PASS / PASS |
| Webpack production build with unreachable dummy datasource | PASS |

Disposable PostgreSQL tests and the Webpack build ran outside the sandbox with approval for local execution; no application database or paid service was used. An initial TypeScript check caught an attempted assignment to a readonly synthetic fixture field; the fixture now constructs a new corrupted object, and the final check passes. No dependency or browser compatibility warning was emitted by the successful build. UI checks are the existing navigation/component regressions, not a new visual redesign or browser playback audit.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-reporter=spec \
  tests/storyline/narration-integration-postgres.test.ts
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

## Changed files and next boundary

Created: this document, `docs/drafts/storyline-m4-narration-read.sql`, `lib/storyline/narration-integration/prepare.ts`, `tests/storyline/narration-integration-postgres.test.ts`.

Modified: `tests/storyline/disposable-postgres.ts` (restricted test role support), `tests/storyline/jobs/transactional-gateway.fixture.ts` (opt-in gateway installation and reader connection). Existing M4-01 uncommitted work and logs are preserved. No application UI/API, live schema, environment, dependency or worker changes.

M4-03 can implement separately authorized **durable provisional narration persistence**. It must bind exact M3 candidate ID/hash independently of the M2 completion marker, enforce immutable canonical bytes and duplicate-safe conflicting-content rejection, re-fence current source/task/result/candidate dependencies at insertion, and use a restricted writer/read gateway with rollback/concurrency tests. If new drafting tasks are introduced, extend their immutable recipe dependencies before admission. No M4-02 output authorizes human approval, voice generation, paid execution or production deployment.

**M4-02: PASS (synthetic/disposable only). M4-03 durable provisional persistence: READY for a separately authorized task. Production and paid activation remain BLOCKED.**
