# Storyline authoritative source integrity — M1-FIX-01

## Result and scope

2026-10-13: **PASS for M1-FIX-01.** The three source-integrity assertions that failed in M1-F now pass unchanged. This does not approve complete M1 deployment: the authoritative durable verification-to-duration bridge remains unresolved and was not implemented.

No schema, migration, API, worker, UI, queue, media, environment or dependency changes. Existing staged changes and logs are preserved. All SQL execution uses newly owned disposable PostgreSQL clusters; no application database is accessed. No real receipt is issued, feature enabled, paid call made, video processed, commit created or push performed. Existing receipt-security tests use synthetic decisions, ephemeral keys and disposable records only.

## Root cause

Snapshot persistence and durable verification previously compared current database dependency hashes with copied preparation metadata, and checked that frozen payload hashes were internally consistent. An altered Chinese/translation/evidence payload could retain genuine dependency metadata and recompute its own hashes. Those checks established shape and dependency freshness, but did not authenticate the frozen payload against actual selected source records.

The restricted runtime legitimately has draft INSERT privileges, so application-only candidate branding would not close the independent direct-insertion path. Signing receipt envelopes also cannot repair an unverified source projection beneath them.

## Shared reconstruction algorithm

`lib/storyline/authoritative-source.ts` now owns the construction previously inline in `prepare-source.ts`:

1. Consume `captureStorylineSourceInTransaction` / `readStorylineSource` output for the exact selected database project/movie. Those readers check actual relationships, current character analysis and source prerequisites; no newest-movie fallback exists.
2. Bind inspected media to the actual storage key and recorded size. The source inspector supplies streamed SHA-256, measured duration/bytes, bounded video metadata and descriptor/path identity checks. No storage key/path is copied into public content.
3. Reconstruct Chinese segment IDs/sequences/text/timestamps, scenes, characters, relationship endpoints/allowances, exact current and excluded translation context, approval/manual/refinement/revision/QC metadata, analysis provenance, aliases, observations and validated advisory legacy recap from those authoritative reads.
4. Run the existing `validateSourceSnapshot` and ALL_CURRENT admission logic. No parallel admission or Unicode-normalization implementation was introduced. Missing, stale and invalid translation rows retain the existing explicit meanings; approval does not establish evidence truth.
5. Compare **complete canonical payload strings** against the frozen validated payload. No supplied hash is accepted as proof of content authenticity. Only top-level `id` and `capturedAt` are excluded, because they identify the historical capture rather than source equivalence. Every domain identity, review/edit/audit timestamp, media field and preparation/dependency field remains included.

Canonical serialization remains bounded by the existing 16 MiB source limit, JSON depth/node limits and Unicode validation. Transcript/scene sequence order remains meaningful and validated. Set-like collections retain existing deterministic ID/sequence canonicalization; harmless retrieval-order variation is not a new content change. Added/missing source or context rows and changed sequence-to-content assignments are rejected.

The source contract has no speaker field. Unknown speaker fields remain invalid; persisted character attribution, observation ownership and relationship endpoints are reconstructed and compared without inventing speaker data.

## Acceptance boundaries and errors

| Boundary | New enforcement |
| --- | --- |
| Genuine preparation | Builds through shared reconstruction; final read also compares full canonical content and media binding before returning an immutable provisional candidate |
| Snapshot persistence | After Project → Movie → Studio locks and fresh authoritative reread, compares full content **before creating Studio/snapshot or changing revision/pointers** |
| Script persistence | Applies the same post-lock check to the selected stored source before allocating/inserting a draft, preventing reuse of an internally forged immutable source |
| Verification proposal | `inspectVerificationSource` compares the stored source with fresh authoritative reconstruction after media inspection; altered contexts cannot produce an issuance proposal |
| Receipt issuance | Existing gateway locks, revision/head/signature checks and fresh read remain; `assertVerificationSourceCurrent` now also compares the complete reconstructed content inside the locked transaction |
| Authoritative lookup | Initial inspection and the final read-only transaction both enforce content equivalence; mismatched/stale content never returns `CURRENT` or source eligibility |

Self-consistent content mismatches yield `STALE_STORYLINE_SOURCE` at persistence and `VERIFICATION_SOURCE_STALE` for proposals. Lookup reports `STALE` / `sourceEligible: false`. Structurally invalid inserted content fails closed with `VERIFICATION_CONTEXT_INVALID`; malformed candidates retain `INVALID_CANDIDATE`. Errors contain static codes, not rejected text, raw database errors, paths or secrets.

Signed ledger verification, pinned keys, restricted roles, operator authorization, revocation/supersession and observed inference-basis checks are unchanged. Historical revocation intentionally remains possible after live source changes; revocation never authorizes current claims. No immutable artifact is rewritten or deleted when it becomes stale.

## Locking, rollback and freshness

The existing Project → Movie → Studio order and bounded ReadCommitted write transactions remain. Full media hashing/probing stays outside write transactions. Under the locks, a fresh authoritative source capture is reconstructed and compared, and file identity is checked before/after publication. Rejection rolls back all transaction effects, including Studio revision/pointer changes. Deduplication remains Studio-specific and revalidates stored content.

Lookup uses the existing read-only RepeatableRead views, with a second content/media check after inspection. A proposal is not a reservation: source, revision, ledger head and media are rechecked at issuance. The currentness guarantee is at the checked transaction/file-identity observation. Cooperating source writers follow the existing row-lock protocol; arbitrary privileged database or filesystem writes cannot be made transactional by this patch.

## Deterministic verification results

Before: original M1-F PostgreSQL acceptance reported one successful prerequisite and three failing security assertions (Node also counted the failed parent, yielding 1 pass / 4 failures).

After:

| Suite | Result |
| --- | --- |
| Unchanged `foundation-postgres-acceptance.test.ts` | 5/5 PASS, including all three formerly failing assertions |
| New `authoritative-source-postgres.test.ts` | 39/39 PASS |
| Persistence service PostgreSQL | 7/7 PASS |
| Verification security PostgreSQL | 11/11 PASS |
| SQL guards / real concurrency PostgreSQL | 20/20 PASS |
| Storyline contracts / preparation / media / human verification / duration / evidence DTO / integration boundary / operator authority / persistence draft / pure acceptance | 96 / 46 / 5 / 36 / 38 / 12 / 2 / 4 / 8 / 4 PASS |
| Studio navigation / Recap recovery components | 13 / 2 PASS |
| Legacy Recap diagnostics / recovery | 24 / 10 PASS |
| Studio browser navigation | PASS at 1440 / 1024 / 390, no overflow; zero navigation API or paid requests |
| Prisma validate | PASS with an unreachable dummy datasource; schema unchanged |
| Lint / TypeScript / diff checks | PASS |
| Webpack production build | PASS outside the restricted sandbox, using an unreachable dummy datasource |

The expanded suite covers 32 internally self-consistent mutations with recomputed hashes and genuine copied dependencies. Each must fail snapshot persistence, durable proposal and script persistence; lookup must report stale/noneligible. Tests assert unchanged Studio rows and snapshot counts on rejection. Cases include Chinese text/IDs/timing/sequence assignments/missing/additional segments; Myanmar Unicode; approvals; manual/refinement provenance; revisions/alignment/manual binding; active/resolved/unscanned QC; missing/additional/excluded translation context; scene IDs/boundaries; attribution/character and relationship anchors/endpoints; aliases; analysis metadata; domain timestamps and advisory recap content.

Five further cases prove structural validation still rejects unknown speaker fields, reordered transcripts, invalid scene references, wrong relationship endpoints and wrong character observation ownership through persistence and durable proposal/lookup, even when SQL accepts externally inserted draft JSON. Genuine unchanged sources and capture-time deduplication succeed. A synthetic QC source-writer change makes old context stale while preserving historical snapshot bytes. No receipt is authorized or issued by either integrity suite.

Existing PostgreSQL races additionally verify source changes before/during lock waits, issuance/revocation competition, snapshot/version conflicts, rollback after media failures, cross-Studio/movie isolation and bounded deadlock handling. All clusters are fresh private PostgreSQL 18.6, use workflow-generated dedicated credentials and verified ownership, and are torn down only by their owning harness. No application datasource is used.

Commands run:

```sh
node --conditions=react-server --import tsx tests/storyline/foundation-postgres-acceptance.test.ts
node --conditions=react-server --import tsx tests/storyline/authoritative-source-postgres.test.ts
node --conditions=react-server --import tsx tests/storyline/persistence-service-postgres.test.ts
node --conditions=react-server --import tsx tests/storyline/verification-security-postgres.test.ts
node --conditions=react-server --import tsx tests/storyline/persistence-postgres.test.ts
```

The ten Storyline unit suites in the table and both Recap server suites used the same server-test command prefix. Component suites used `node --import tsx`; browser navigation used the already installed external Playwright runtime with synthetic intercepted APIs. Prisma validation and `pnpm exec next build --webpack` used `DATABASE_URL=postgresql://review:review@127.0.0.1:1/disposable_not_connected`. Also ran `pnpm lint`, `pnpm exec tsc --noEmit` and Git diff checks, including the new untracked files. No packages were installed.

## Changed files and remaining boundaries

Created: `lib/storyline/authoritative-source.ts`, `tests/storyline/authoritative-source-postgres.test.ts`, this document.

Modified: `lib/storyline/prepare-source.ts`, `lib/storyline/persist-source.ts`, `lib/storyline/persist-script.ts`, `lib/storyline/verification-context.ts`, and a follow-up status note in `docs/STORYLINE_M1_ACCEPTANCE.md`. Original failing acceptance tests and all existing migrations/SQL guards are unchanged.

The pre-existing Git index remains unchanged (cached diff SHA-256 `589624bc37ebf4af995697e9d6028c33db40137725a8e73141ed025bc98a7b80`). New working-tree imports require the new helper; the pre-existing staged subset is still not independently commit-ready. No staging was performed.

**Remaining:** the durable verification-to-duration bridge, complete M1 integration approval, real authenticated operator bootstrap, production role/key/retention deployment review and separately authorized application migration/runtime enablement. This fix supplies none of those capabilities. M2 remains unstarted.
