# M7-02 — Immutable timeline persistence and transactional currentness

Date: 2026-10-19 (Asia/Bangkok). Scope: SYNTHETIC_ONLY, newly owned disposable PostgreSQL, metadata only.

## Verdict and baseline

**M7-02 PASS — SYNTHETIC_ONLY, disposable database and immutable metadata only.** All required final acceptance checks passed. Production persistence/authentication, Timeline Studio UI, rendering, providers, approvals and publication remain disabled.

Entry was clean on `recovery/m9-studio`, exact HEAD `0c0bf91b94cebf813f5a605bc799e41a1997f446`. Read AGENTS.md/CLAUDE.md, M7-01 implementation/handoff, M6 final/02/03, M5/M9 acceptance and the installed Next.js data-security guide; inspected actual M7 contracts/planner/resolver/tests, M6 planning/repository/authentication/gateway/SQL/fixtures, canonical hashing and owned PostgreSQL patterns. Historical PASS reports are context, not current evidence.

All milestone files are new. Existing M7-01, M6, M1–M5, UI, production routes/actions, workers, schemas, hash domains and expiry controls remain unchanged. This milestone adds no production transport or Timeline UI.

## Actual inventory

| Path | Responsibility |
| --- | --- |
| `lib/storyline/timeline-persistence/contracts.ts` | Strict proposals, scoped/domain-tagged parent identities, saved records, dependency/fence/audit, read/history/UNKNOWN contracts and restrictions. |
| `lib/storyline/timeline-persistence/auth.ts` | Explicit server-owned synthetic session registry; pinned native request, origin, Fetch Metadata, cookie, CSRF, scope/capabilities, expiry/revocation. |
| `lib/storyline/timeline-persistence/database.ts` | Exact owned Unix-socket configurations, restricted action logins, catalog checks, backend/transaction/action proofs and commit uncertainty. |
| `lib/storyline/timeline-persistence/resolution.ts` | Restricted SQL-output checks, independent M6 record/proposal/audit/parent/capture replay, named archival integrity and separate present admission replay. |
| `lib/storyline/timeline-persistence/service.ts` | Preparation, save, verified read-back, immediate-parent replay, head/history and original-operation lookup. |
| `lib/storyline/timeline-persistence/index.ts` | Server-only exports. |
| `tests/storyline/timeline-persistence/schema.sql` | Owned M7 scratch schema, same-database M6 loader/locks, immutable tables/FKs, restricted wrappers, CAS/audit/deferred completion. |
| `tests/storyline/timeline-persistence/fixture.ts` | Fresh owned M6+M7 database, random restricted credentials/keys, explicit sessions/cookie policy and source composition. |
| `tests/storyline/timeline-persistence/contracts.test.ts` | Bounded canonical proposal/record/domain/parent/restriction and hostile serialization cases. |
| `tests/storyline/timeline-persistence/persistence.test.ts` | Save/read/history, duplicate/concurrent CAS, rollback, UNKNOWN/recovery, M4/R4 and nonchronological fake-reference round trips. |
| `tests/storyline/timeline-persistence/fencing.test.ts` | Saving-backend drift checks, real independent writers/locks, actual M6 writer and commit-time session expiry. |
| `tests/storyline/timeline-persistence/security.test.ts` | Native auth, database agreement, scope/existence isolation, privileges, proofs, immutable rows and no-network assertions. |
| `tests/storyline/timeline-persistence/catalog.test.ts` | Live catalog/trigger/grant tampering, composite cross-tenant FK and incomplete transaction rejection. |
| `tests/storyline/timeline-persistence/tampering.test.ts` | Rehashed caller plans, exact M6 identities and coordinated stored plan/proposal/record/audit/parent forgeries. |
| `tests/storyline/timeline-persistence/boundaries.test.ts` | Server-only/no ambient datasource/no media/provider/production composition assertions. |
| `tests/storyline/timeline-persistence/production-audit.mjs` | Built production client/server/source/route/action and owned secret-pattern audit. |
| `docs/STORYLINE_M7_02_TIMELINE_PERSISTENCE.md` | This implementation, acceptance evidence and separately authorized M7-03 handoff. |

## Implemented interfaces and domains

Every executable module starts with `server-only`. No factory is constructed by app code, environment switch or default composition.

```ts
createSyntheticTimelineAuthenticationForTest({
  mode: "M702_DISPOSABLE_ONLY", origin, sessions,
})
createTimelineGatewayForTest({
  mode: "M702_DISPOSABLE_ONLY", connections, keys, authentication,
})
createDisposableTimelineRepositoryForTest({
  mode: "M702_DISPOSABLE_ONLY", gateway, ...testHooks,
})

// All operations return Promises; runtime wire values are unknown and strictly parsed.
prepareTimeline(request: unknown, value: unknown)
  // value: RecapTimelineInput; => {scope, plan, expectedRevision, previous}
saveVersion(writeRequest: unknown, readRequest: unknown, value: unknown): Promise<TimelineSaveResult>
  // value: SaveTimelineProposal; => SAVED | REUSED view, or UNKNOWN operation identity
readVersion(request: unknown, value: unknown) // value: {scope, id}
readHead(request: unknown, value: unknown) // value: {scope}
listHistory(request: unknown, value: unknown) // value: {scope, afterVersion, limit}
readOperation(request: unknown, value: unknown) // value: {scope, idempotencyKey, proposalHash}
```

The exported types include `TimelineStoreScope`, `TimelineRecordIdentity`, `SaveTimelineProposal`, `StoredTimelineRecord`, `TimelineDependencyEnvelope`, `TimelineCurrentnessFence`, `TimelineSaveAuditEvent`, `TimelineRecordView`, `TimelineHistoryView`, `TimelineSaveResult` and `DisposableTimelineRepository`. Contract exports include `parseStoreScope`, `parseRecordIdentity`, `parseSaveTimelineProposal`, `parseStoredRecord`, `timelineProposalHash`, `TIMELINE_STORE` and `savedTimelineRestrictions`. The separately named `validateHistoricalTimelineIntegrity` is exported for review/testing; it is an integrity operation, never admission/authentication or a save capability.

| New domain | Purpose |
| --- | --- |
| `story-recap-timeline-save-proposal-v1` | Exact scoped key/expected revision/parent/complete M7-01 plan. |
| `story-recap-timeline-saved-record-v1` | Immutable record ID/version/editor/time, proposal/dependency and original plan identity. |
| `story-recap-timeline-stored-dependency-v1` | Scoped independently reconstructed historical M6 observation. |
| `story-recap-timeline-currentness-fence-v1` | Validation MAC: scope/reservation/challenge/record/dependency/backend/transaction. |
| `story-recap-timeline-save-audit-v1` | Immutable matching save event. |
| `disposable-timeline-m702-authorization-v1` | Short-lived one-use action/body/session/scope/backend/transaction proof. |

Existing `story-recap-timeline-plan-v1`, input/policy/segment domains, `tl-`/`tlseg-` identities, M6 hashes and integer-millisecond time policy are unchanged. The exact original M7-01 plan remains byte-identical inside a saved envelope, including its original NOT_PERSISTED planning restriction; the new saved envelope separately declares storage DISPOSABLE_POSTGRES_ONLY. A storage ID never replaces the plan hash.

Proposals contain only `{schemaVersion,scope,idempotencyKey,expectedRevision,previous,plan}`. Parent identities include `{id,version,recordHash,recordHashDomain,planHash,planHashDomain}` with the new saved-record and unchanged M7 plan domains. Strict parsers reject unknown fields, malformed Unicode, negative zero/fractions/unsafe numbers, bad IDs/hashes/domains, unsupported schemas, parent/revision mismatch and self-parenting. Canonical serialization rejects getters, cycles, dates, unsupported prototypes and sparse arrays. Proposal/record/action bodies are bounded at 3 MiB, M7 plan at its unchanged 2 MiB, captured resolution at 32 MiB with inherited M6/M1–M4 bounds; versions cap at 1,000,000 and history pages at five. Shape parsing alone never establishes semantic integrity.

## Scratch schema and server trust boundary

Each fixture first creates a fresh `DisposableStorylinePostgres` cluster, random database/owner credentials and private Unix socket; it installs unchanged M6 scratch SQL and then independently owned `timeline_m702` in that **same database**. No application datasource, migration or Prisma schema is used. Gateway connections require the exact owned-harness socket/database/action-login patterns, explicit random passwords/32-byte proof keys and identical read/create database target. Unknown actions and ambient/TCP/connection-string overrides fail before `pg.Client` construction. Same-backend checks establish the actual unprivileged login, local socket and scratch catalog.

`timeline_m702_owner` is a separate non-login, non-superuser/non-bypass/non-creator role. Read/create login groups receive schema USAGE and only their corresponding SECURITY DEFINER wrapper; all private tables, column privileges, helpers and other action wrapper are denied. Every private function has fixed `pg_catalog,timeline_m702,pg_temp` search path and no PUBLIC EXECUTE. Catalog checks verify owners/search paths, exact wrapper authority, no direct private privileges or elevated membership, eight immutable row/truncate triggers and deferred completion. They also verify the independent M6 owner, function security and fourteen immutable triggers, with no direct M6 authority for M7 action logins. Tests deliberately change grants, helper ownership/search path and trigger state to prove rejection on the same backend used for the action.

M7 tables are tenant, principal, scope, session, access_grant, proof_key, used_proof, policy, dependency, reservation, version, repository_head and audit_event. Composite tenant/project/movie/studio FKs bind dependencies to real immutable M6 versions and bind reservations/versions/parents/head/audits within the exact scope. Dependency/reservation/version/audit UPDATE/DELETE/TRUNCATE are blocked even through the fixture administrator unless an adversarial test explicitly disables a trigger. Head revision, previous ID and canonical identity are checked independently of payload claims. Deferred completion rejects an orphan reservation or missing version/audit and rechecks authorization/currentness at commit.

Only the non-login M7 owner receives SELECT on the necessary M6 source/analysis/narration/dependency/version/reservation/audit and membership/currentness tables plus three existing read helpers. It receives UPDATE privilege on the six mutable M6 scope/session/grant/policy/current-dependency/head tables solely because PostgreSQL row-lock operations require that privilege. No exposed wrapper performs M6 DML, and M7 action logins cannot use these privileges or assume either owner. M6 proof-key/used-proof access is not granted. Compromised owner code or a fully compromised database administrator remains outside this bounded synthetic guarantee; production deployment needs its own privilege/code review.

The authentication factory captures its registry independently in a WeakMap; copied role/session/authentication JSON is not authority. It requires a native Request with GET reads or POST create, the exact `${origin}/isolated-fixture` URL (no alternate path/query), pinned Origin and same-origin Fetch Metadata, exactly one recognized server session cookie and write CSRF. Exact tenant/project/movie/studio membership, separate read/create capabilities, process expiry/revocation and stable actor are checked before database access and again during/following transaction work. The fixture-only cookie serialization is HttpOnly, Secure, SameSite=Strict, Path=/; no production cookie issuer, browser bootstrap or HTTP route exists here.

SQL independently verifies its session/principal/grant rows and current read membership in the M6 source scope, plus method/origin/CSRF/Fetch Metadata agreement. HMAC proofs bind exact body hash, scope, actor/session, action/login, backend PID, transaction ID, nonce and database-clock deadline. They cannot be copied to another action/backend/transaction or reused. Signing keys remain in the private test process. No browser role, supplied CURRENT label or identity injection becomes production authentication.

## Independent M6 resolution and historical integrity

The restricted SQL loader resolves the selected **saved** M6 ID within exact scope, its actual parent/version/hash/plan identity, immutable dependency, separate M1 source/analysis/narration projections, current M6 head/revision, current dependency/source observation and M6 policy/rubric. The request never supplies this authoritative capture. The server validates raw M6 proposal/record/audit hashes and actual parent identity, independently replays both selected M6 and immediate M6 parent against their captured context, verifies tenant-bound R4 editing ancestry, then calls unchanged M7-01 generation/validation.

A dependency row stores exact M6 ID with a composite FK and the stable `tldep-<dependency hash>` identity. Its hash covers scope and a historical observation independently reconstructed from immutable M6 rows: selected view, immediate parent, selected record's head revision/identity, stored capture and source/policy coordinates. Mutable read-currentness flags are excluded from historical identity. Complete M1 media/source fingerprints and revisions, M2/M3 result/candidate/evidence/claim lineage, original M4 and optional R4 domain/parent, exact selected M6 version/plan and M7 input/policy/head/dependency are bound through the record, unchanged plan and dependency hash.

`validateHistoricalTimelineIntegrity` is explicitly separate. It reconstructs historical head/source/policy coordinates from immutable rows and calls the unchanged M7-01 validator to reproduce the original deterministic bytes. Those reconstructed coordinates are **not claims about current eligibility**. Reads and exact reuse of an already committed operation may use this path. Every new preparation/save instead uses a separately reacquired present observation and requires PLANNED/nonempty/complete coverage, current enabled M6 and M7 policies, unchanged source/dependency and selected M6 equal to the actual current head. There is no new-save fallback to archival coordinates.

ReadVersion/readHead/history/original-operation results verify exact record/proposal/dependency/audit/physical parent identity, full deterministic plan replay and independently loaded immediate timeline-parent integrity. This is bounded immediate-parent validation rather than an unbounded recursive ancestor walk. Each directly read ancestor gets the same independent checks. Currentness is a separate mutable observation: CURRENT_AT_READ when both source admission and timeline head match, SUPERSEDED when only the timeline head has advanced, STALE_DEPENDENCIES when M6 source/head/policy admission no longer holds. No historical ID/hash/plan bytes are rewritten or silently promoted. Currentness may change after any read; it is not a future execution lease.

## Save transaction, lock order and atomicity

Save strictly captures the proposal/key/hash, authorizes separate create/read native requests for the same session/actor/tenant and independently preflights M7-01 replay. On the actual saving backend it reacquires the capture, locks currentness, replays again, locks/CAS-checks the timeline head/complete previous identity and claims the scoped key. It inserts the independent dependency, immutable reservation, version, matching audit and advances head atomically. A separate backend/transaction-bound validation MAC binds the reservation challenge and final record/dependency hashes. Final seal and deferred completion/session-expiry checks run before COMMIT. Read-back uses a fresh independently authorized read transaction and verifies the original proposal/plan identity.

Cooperating lock order:

1. M7 action key, M7 scope/session/exact principal grant.
2. M6 scope/session/exact read grant, policy, current_dependency, repository_head, all shared through commit.
3. M7 policy shared, then M7 repository_head for update when reserving/finishing.

M6 writers already acquire their overlapping scope/session/grant/policy/current_dependency before their head CAS and never acquire M7 rows. Thus overlapping M6 rows follow the same order and there is no M7→M6→M7 cycle. A cooperating multirow administrative source/policy mutator must follow the same M6 order before M7 policy/head; single-row updates block on the existing shared lock. Immutable M6 source/dependency rows cannot change through normal writers.

A committed source/head change between preparation/preflight and the saving transaction is rejected. An independent M6 head/source/policy/session/grant writer arriving after M7 locks must wait until M7 commit/rollback; it can then make the committed timeline stale. This is a valid serialization after the timeline's commit, not evidence that stale input was accepted before commit. Tests observe actual `pg_blocking_pids` and an actual unchanged M6 repository writer on separate backends. Deferred expiry tests additionally prove a session can be valid before final seal yet expire during commit, rolling everything back. No external network, provider or media work occurs while locks are held. This is a same-database fence; no cross-database atomicity is claimed.

## Idempotency, conflicts and uncertainty

Same scope/key and exact canonical proposal returns REUSED with the original immutable record/editor; changed proposal conflicts. Independent timeline writers allow one CAS winner; stale revision/parent rejects explicitly without rebasing. A duplicate of an existing operation can be recovered/reused after source/policy/head drift because it creates no new version; a fresh key with the historical plan remains ineligible. Authorization is still current for reuse and lookup.

Audit/transaction failure rolls back dependency/reservation/version/head/audit together. Lost commit acknowledgement returns UNKNOWN with original scope/key/proposal hash and COMMIT_ACK_LOST. Failed separately authorized read-back after successful commit returns UNKNOWN/READBACK_UNAVAILABLE. Neither establishes rollback. Authorized original-operation lookup performs no creation: FOUND returns independently verified history, and NOT_FOUND is only an observation, never a retry permit. Domain reads retain existing one-use authentication-proof bookkeeping; they do not modify timeline/M6 versions, reservations, audits or heads. No fresh-key allocation, write retry, provider retry or M2 spending/retry permit exists in the service.

## Time, provenance and capability boundaries

Complete unchanged M7 metadata is persisted: integer milliseconds, half-open source/output intervals, original speed 1:1, CUT_ONLY, contiguous output, no source overlap/repeated clips/filler, exact M6 presentation and separate source chronology, intentional omissions and exact character/evidence/psychology provenance. Rehashing changed placement/source order/evidence/narration/parent/approval cannot pass independent regeneration. Nonchronological order and optional matching fake-audio identity round-trip without controlling timeline duration.

SYNTHETIC_ONLY, NOT_RENDERED, humanApproval NONE, sourceVerified false, real-TTS/publication eligibility false, spendingAuthority NONE, originalMovieAudio EXCLUDED, voiceSynchronization UNSUPPORTED and synthetic ancestry remain permanent. A saved version is not human-approved. M5 references remain FAKE_ONLY/REFERENCE_ONLY/SYNTHETIC_BYTE_INTEGRITY_ONLY with speech NOT_VERIFIED. No playable asset, audio track, real speech duration or fake-silence synchronization is created.

No production authentication bootstrap, app database/migration, API/Server Action, new worker, Timeline Studio UI, media extraction/download, FFmpeg/subprocess, rendering, MP4, TTS/provider/paid call, approval/SOURCE_VERIFIED issuance or publication is introduced. Production imports, chunks, routes/actions and owned secret patterns are audited after the build; existing capability defaults remain disabled.

## Fresh verification

Owned logs: `/tmp/movie-translator-m7-02-efzzAN/`. All earlier logs and unrelated files are preserved. Every acceptance command uses `DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`; fixtures create newly owned private Unix-socket clusters only. Timing-sensitive server runs are serial and do not overlap build/browser/compiler work. No packages are installed.

| Final verification | Actual completed result |
| --- | --- |
| M7-02 focused acceptance | **112/112 PASS**, 0 failed/skipped; 101.79 seconds (`focused-final.log`). |
| Consolidated serial applicable M1–M7, M5 lifecycle, R4/M9 and legacy server regressions | **1,594/1,594 PASS**, 0 failed/skipped; 678.42 seconds (`server-regressions.log`). Includes all 112 M7-02, unchanged 118 M7-01 and every original M4 expiry control; 79 distinct server files, each listed once (`test-file-inventory.json`). |
| All existing relevant component cases | **47/47 PASS**, 0 failed/skipped; 1.37 seconds (`ui-components.log`). |
| All five existing Chromium suites | **5/5 PASS**, 0 failed/skipped; 51.83 seconds (`chromium.log`). Responsive checks at 1440/1024/390 px, keyboard, legacy Recap, isolation and synthetic editor/Highlights save/history/recovery. |
| `pnpm lint` | **PASS**, exit 0, no warnings (`lint.log`). |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0 (`tsc.log`); separate build type-check also passed. |
| Dummy-datasource Webpack build | **PASS**, Next.js 16.3.6, compiled in 9.3 seconds, type-checked and generated all 12 static pages (`webpack.log`). |
| M6 production source/client/route/action audit | **PASS**, 71 client chunks, 38 unchanged API routes, zero Server Actions, zero authority/test-transport/credential markers, exclusively erased existing type bridge (`m6-production-audit.json`). |
| Unchanged M7-01 and new M7-02 production audits | **PASS** each: 71 client chunks, 144 server JS files, 106 production sources, 38 unchanged API routes, zero Server Actions, zero timeline/persistence runtime markers and owned secret-pattern matches (`m701-production-audit.json`, `m702-production-audit.json`). |
| Exact baseline/owned-file/expiry audit | **PASS**, seventeen new owned paths; every existing tracked file remains byte-identical to entry, including M7-01/M6 and all original expiry assertions (`source-audit.json`). |
| Working/staged whitespace, source, exact paths and secrets | **PASS**, seventeen owned new paths only, zero unrelated changes or detected credentials; staged runtime bytes equal the tested source (`staged-audit.json`). |

Final acceptance completed **1,758 passing test executions representing 1,646 distinct cases**: 1,594 server + 47 component + 5 Chromium. The separate 112 focused executions repeat cases fully included in the consolidated command. No viewport iteration, fixture subprocess, earlier milestone or development run is counted as another distinct case. No final acceptance test failed, skipped or needed a retry after execution.

Development is reported separately in `development-summary.json`: 1/1 failed, 1/1 passed, 5/6 passed, 11/16 passed, 96/96 passed and 110/110 passed, totaling **230 executions: 223 passes and seven failures**, resolved before final acceptance. The first save exposed an ambiguous new SQL variable; one lifecycle test exposed incorrect INVALID_INPUT error mapping; five blocking tests initially used an intentionally unprivileged fixture database runner as the source writer. The variable/error mapping were fixed and the race tests now use a distinct, ownership-checked administrator connection for authorized scratch mutations while retaining the actual blocking assertions. Two initial new-code TypeScript issues were corrected before the final type check. Existing security/expiry assertions and foundation source were never weakened. A final-focused invocation did not start because automatic permission review timed out; its one permitted unchanged retry passed. That timeout executed zero tests. Diagnostic SQL logs and every development output are retained.

Fresh M4 expiry result: **16/16 PASS** once inside the consolidated serial command, including all forced-expiry zero-send controls and actual-wire-before-expiry positive controls in both role orders. No recurrence or targeted rerun occurred. The unchanged file SHA-256 is `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`; the historical root cause remains unresolved, as discussed below.

Fresh browser artifacts include `/tmp/recap-recovery-browser-0HXfMx/`, `/tmp/storyline-m9-save-browser-g5kiLu/`, `/tmp/storyline-m603-browser-UKkFfW/`, `/tmp/recap-studio-navigation-egoCc8/` and `/tmp/storyline-m9-recovery-browser-f2i51W/`. Highlights records all three widths with no overflow, keyboard/exact-save checks, seven immutable version/reservation/audit/head transitions, no browser errors/rejections and zero production API/provider/media-processing calls. The Script/browser flows preserve originals, local zero-network interactions, exact Myanmar round trips and identity isolation. These are existing UI regressions; no Timeline UI is implemented or claimed.

Exact commands (from the project root, with the dummy datasource exported):

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/timeline-persistence/*.test.ts

node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/durable-fake/*.test.ts \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/highlights-studio/acceptance.test.ts tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts \
  tests/storyline/timeline/*.test.ts tests/storyline/timeline-persistence/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts

node --import tsx --test --test-reporter=spec \
  tests/storyline/highlights-studio/component.test.tsx tests/storyline/editor-saving/component.test.tsx \
  tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
pnpm exec next build --webpack

PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs tests/storyline/editor-saving/browser.test.mjs \
  tests/storyline/highlights-studio/browser.test.mjs
node tests/storyline/highlights-studio/production-audit.mjs /tmp/movie-translator-m7-02-efzzAN/m6-production-audit.json
node tests/storyline/timeline/production-audit.mjs /tmp/movie-translator-m7-02-efzzAN/m701-production-audit.json
node tests/storyline/timeline-persistence/production-audit.mjs /tmp/movie-translator-m7-02-efzzAN/m702-production-audit.json
git diff --check
git diff --cached --check
```

Final exact-path/source/staged/secret review additionally checks every tested runtime byte and the unchanged original expiry SHA against the entry baseline. No historical or development count is substituted for final verification.

## Timing risk, production blockers and M7-03 handoff

Retain all original sixteen M4 expiry controls and the 700 ms positive-control deadline. The historical M1-last positive control expected one actual wire entry and observed zero; its root cause is unresolved. A passing run cannot establish a repair. Any recurrence must be investigated with its original assertions and timing/state diagnostics, without weakening controls, extending that deadline or dismissing the failure as flaky. New M7 deferred-expiry tests are independent of those unchanged controls.

This repository is a reviewed synthetic/disposable harness, not deployable production persistence. Production authentication/resource membership, independent real-media/source acquisition, least-privilege/RLS/schema/key-custody deployment, operational clock/lock/deadline behavior, retention and recovery need separate authorization/design. A compromised administrator/private owner can rewrite code/data; hashes and catalog patterns do not provide universal security. Pure/current read checks are point-in-time observations; only the actual save transaction has the demonstrated same-database fence. Immediate-parent replay is bounded; no unrestricted chain walk or future processing authorization is claimed.

After acceptance, M7-03 Timeline Studio UI is ready for a **separately authorized** implementation. Use an explicitly injected test adapter over these six operations and an erased type-only bridge. Select exact saved M6 identity, prepare on the server, review immutable segment/evidence/order/currentness metadata, explicitly Save New Timeline Version with one stable key/proposal, then independently verify record/read-back/history. Keep preview versus explicit historical load separate, confirm replacement of unsaved work, preserve state across retained-shell tabs and dispose/fence late responses on full scope/M6/source/artifact/session identity changes. Separate Script and Highlights memory, preserve the existing frozen six-destination shell and keyboard/responsive behavior, bound history to five, and retain original ownership on UNKNOWN with read-only recovery. Browser identity/roles/hash consistency never authenticate; server native session/origin/CSRF/scope and transaction replay remain mandatory. Display Saved, Current/Superseded/Stale, Human Approved: No and Not Rendered separately. Do not add playable clips, voice/audio timing or rendering/publication controls. M7-03, M8 and production integration are not implemented here.


## Completion and Git disposition

M7-02 is complete for the isolated synthetic/disposable scope. The seventeen new paths in the inventory are the only milestone changes. After exact-path/source/staged whitespace and secret review, the authorized local commit message is `feat(storyline): add immutable recap timeline persistence`. The resulting full hash and final working-tree status are reported to the user. No push, destructive Git operation, unrelated cleanup, M7-03 UI, M8 or production integration is performed.
