# M6-02 — Immutable Highlights Persistence, Scoped History and Currentness Fencing

Date: 2026-10-19. Expected and verified starting branch: `recovery/m9-studio`. Starting commit: `d39a9bbcc79272ae9c250b3f94c761588570e39b`; working tree initially clean.

## Scope and acceptance

**M6-02 PASS, synthetic-only.** This milestone implements the authenticated **synthetic-only** workflow: independent stored resolution → M6-01 planning/replay → authorized reservation → transactional source fence → immutable version save → separately authorized read-back → scoped history. All required final checks below passed. It adds no UI, production session, route, Server Action, application migration, worker, provider, clipping or rendering capability.

M6-01 plan semantics and hashes are unchanged. The nested pure plan still says `NOT_PERSISTED`; a separate M6-02 record envelope says `DISPOSABLE_POSTGRES_ONLY`. Database IDs identify saved metadata versions and never replace `story-highlight-plan-v1` hashes. Saving confers no human approval, source verification, real voice or publication eligibility.

## New file inventory

Existing source, UI and prior tests are unchanged.

| File | Implemented responsibility |
| --- | --- |
| `lib/storyline/highlights-persistence/contracts.ts` | Strict proposal/record parsers; versioned identity, dependency, fence, audit, read/history and recovery contracts. |
| `lib/storyline/highlights-persistence/auth.ts` | Explicit server-owned synthetic session registry; origin, CSRF, scope, expiry and revocation checks. |
| `lib/storyline/highlights-persistence/database.ts` | Explicit restricted connection injection, same-backend catalog assertions, transaction-bound action proofs, fenced validation MAC, commit uncertainty. |
| `lib/storyline/highlights-persistence/service.ts` | Independent stored context loading, replay, reservation/save/read-back, head/history, scoped operation recovery and integrity verification. |
| `lib/storyline/highlights-persistence/index.ts` | Server-only public contracts/factories. |
| `tests/storyline/highlights-persistence/schema.sql` | Scratch-only schema, restricted action gateways, immutable triggers, CAS, deferred completion constraint, audit and source fences. |
| `tests/storyline/highlights-persistence/fixture.ts` | Newly owned PostgreSQL cluster, explicit restricted logins/keys/sessions, independent source/analysis/narration fixtures and capture advancement. |
| `tests/storyline/highlights-persistence/contracts.test.ts` | Strict serialization, domain, scope, parent, numeric and saved-record contract tests. |
| `tests/storyline/highlights-persistence/persistence.test.ts` | Complete lifecycle, exact round-trip, concurrency, currentness, rollback, recovery, pagination and fake-audio tests. |
| `tests/storyline/highlights-persistence/security.test.ts` | Authentication, ownership, SQL privilege, catalog, proof, immutability, coordinated tampering and production-import tests. |
| `docs/STORYLINE_M6_02_HIGHLIGHTS_PERSISTENCE.md` | This implementation/acceptance record and M6-03 handoff. |

The sibling module directory intentionally leaves `lib/storyline/highlights/` and its pure runtime dependency graph untouched.

## Implemented contracts and interfaces

`HIGHLIGHT_STORE` reserves these new domains:

| Constant | Domain/purpose |
| --- | --- |
| `proposal` | `story-highlight-save-proposal-v1`: exact scoped canonical proposal hash. |
| `record` | `story-highlight-saved-record-v1`: immutable saved-record hash. |
| `dependency` | `story-highlight-stored-dependency-v1`: tenant-scoped independent capture envelope hash. |
| `fence` | `story-highlight-currentness-fence-v1`: validation MAC binding the exact record/dependency/reservation to a SQL backend and transaction. |
| `audit` | `story-highlight-save-audit-v1`: append-only save event hash. |
| `authorization` | `disposable-highlight-m602-authorization-v1`: short-lived, one-use, action/operation/body/session/scope/transaction proof. |

Principal actual interfaces are:

```ts
type HighlightStoreScope = {
  tenantId: string; projectId: string; movieId: string; studioId: string;
};
type HighlightRecordIdentity = {
  id: string; recordHash: string; planHash: string; version: number;
};
type SaveHighlightProposal = {
  schemaVersion: "story-highlight-save-proposal-v1";
  scope: HighlightStoreScope;
  idempotencyKey: string;
  expectedRevision: number;
  previous: HighlightRecordIdentity | null;
  plan: HighlightPlan;
};
type HighlightDependencyEnvelope = {
  schemaVersion: "story-highlight-stored-dependency-v1";
  scope: HighlightStoreScope;
  capture: SyntheticHighlightCapture;
};
type HighlightCurrentnessFence = {
  schemaVersion: "story-highlight-currentness-fence-v1";
  scope: HighlightStoreScope;
  reservationId: string;
  challenge: string;
  recordHash: string;
  dependencyHash: string;
  backendPid: number;
  transactionId: string;
};
```

`StoredHighlightRecord` adds immutable ID/version/parent, expected revision, scoped key/proposal hash, dependency ID/hash, creation time, server editor principal/session, exact M6-01 plan and permanent synthetic restrictions. `HighlightSaveAuditEvent` binds scope, version/parent, record/proposal/dependency hashes, actor, time and `SAVE_HIGHLIGHT_VERSION`. Its expected contents are rebuilt independently during reads.

`HighlightRecordView` returns `{record, recordHash, currentness}`. Currentness is `CURRENT_AT_READ` or `STALE_DEPENDENCIES`, describing dependency observations rather than whether this record is the latest repository head. `HighlightHistoryView` returns bounded full validated views and `nextAfterVersion`. Limits are five history entries, 1,000,000 repository revisions, 3 MiB proposal/record payloads, 8 KiB action proofs, and inherited M6-01/M1–M4 source/plan bounds. JSONB storage also enforces explicit size limits; near-limit values can be rejected rather than truncated.

Public server-only factories require explicit `M602_DISPOSABLE_ONLY` mode:

- `createSyntheticHighlightAuthenticationForTest({mode, origin, sessions})`.
- `createHighlightGatewayForTest({mode, connections, keys, authentication})`.
- `createDisposableHighlightRepositoryForTest({mode, gateway, ...testHooks})`.

The repository implements:

```ts
preparePlan(readRequest, {scope, policy, audio})
  // Independently loads stored context; returns plan and expected head/parent.
saveVersion(writeRequest, readRequest, proposal)
readVersion(readRequest, {scope, id})
readHead(readRequest, {scope})
listHistory(readRequest, {scope, afterVersion, limit})
readOperation(readRequest, {scope, idempotencyKey, proposalHash})
```

There is no default client or environmental connection fallback. Unknown runtime actions are rejected **before** indexing credentials or constructing `pg.Client`. Connections must name the exact owned-harness private Unix socket/database and the appropriate random restricted action login. Connection-string overrides, TCP targets, unsupported options and elevated privileges are rejected.

All JSON-facing proposals reject unknown fields, malformed domains/IDs/hashes, unsafe integers, invalid Unicode, invalid parent order and changed scope. Existing canonical serialization rejects getters, unsupported objects, negative zero and sparse arrays. Parsing a proposal is structural only; successful creation additionally requires independent stored resolution and complete M6-01 replay.

## Scratch schema and restricted gateways

Only the newly owned `DisposableStorylinePostgres` fixture installs `schema.sql`. No application Prisma migration or application datasource is used by M6-02 setup. Credentials and MAC keys are generated in memory. The fixture verifies its owned cluster/database/socket and PostgreSQL 18 identity through the existing harness, revokes PUBLIC temporary-table permission on the actual disposable database, and cleans up only resources its ownership marker authorizes.

The private schema `highlight_m602` is owned by NOLOGIN, non-superuser `highlight_m602_owner`. Two NOLOGIN action groups grant only the exact corresponding `read(text,text,text)` or `create(text,text,text)` function to generated nonprivileged login roles. The private dispatcher and all helpers are inaccessible directly. The application action logins have no private SELECT/column SELECT, INSERT, UPDATE, DELETE, TRUNCATE, trigger, schema creation, temporary-table or server-file/program privileges.

Tables:

- `tenant`, `principal`, `scope`, `session`, `access_grant`: independently seeded ownership, session and read/create authority fixtures.
- `proof_key`, `used_proof`, `policy`: action/login-specific server keys, bounded one-use proof tracking and the allowed M6-01 policy/rubric registry.
- `source_snapshot`, `analysis_snapshot`, `narration_snapshot`: distinct immutable M1 source, M2/M3 metadata/candidate/result and original M4/optional R4 projections.
- `dependency`: immutable composite-scoped links to those rows, exact source reference/revision observations and tenant-scoped envelope hash.
- `current_dependency`: the separately mutable current dependency pointer and independently observed reference.
- `reservation`: immutable scoped key/proposal, actor/session, dependency, creation time, random challenge and backend/transaction identity.
- `version`: immutable canonical plan-record payload/hash, original M6-01 plan hash, explicit scoped previous-version FK and dependency/reservation links.
- `repository_head`: one scoped revision/head, advanced with row locking and CAS.
- `audit_event`: one immutable, hashed save event per version.

Tenant/project/movie/studio composite foreign keys are used throughout artifacts, dependencies, reservations, versions, head and audit. Scoped idempotency keys and version numbers are unique. Previous IDs cannot join another tenant/scope. Historical artifact/reservation/version/audit rows reject UPDATE, DELETE and TRUNCATE, including ordinary owner DML. A deferred reservation-completion constraint rejects commit without both its immutable version and audit, then rechecks the saving session/grant and current source observation. An authorized reservation cannot be committed as an orphan pending operation.

On every actual action connection and again before commit, catalog assertions verify the real session login, private Unix connection/database identity, role/membership safety, NOLOGIN schema ownership, no direct table/column privileges, exact function OID grants, no PUBLIC helper execution, fixed security-definer ownership/search paths, all 14 immutable triggers and the deferred completion trigger. Missing/null search-path configuration is rejected explicitly. Functions use `search_path=pg_catalog,highlight_m602,pg_temp` and qualified private/crypto objects. These checks cannot turn a fixture bootstrap administrator into an untrusted user; that administrator remains a deliberately trusted test owner.

## Synthetic authentication and source authority

Authentication is an opaque server-owned WeakMap registry. Recreating its JSON shape does not authenticate. A request must be a server `Request`, use the configured canonical origin/URL origin and `Sec-Fetch-Site: same-origin`, and contain exactly one recognized synthetic session cookie. Reads use GET; creation uses POST plus a matching CSRF token. Session expiry/revocation and exact tenant/project/movie/studio read/create grants are checked before database work and rechecked through the transaction. Browser role/principal labels are never accepted as authority. Write and independent read-back requests must identify the same session/principal/tenant at entry.

PostgreSQL independently revalidates the session, principal, ownership and capability rows. A permissive in-memory grant cannot bypass absent database ownership; revoked, expired, wrong-tenant or read-only database authority fails. The action proof binds exact scoped actor/session, origin, CSRF hash, method/fetch-site, operation payload hash, nonce, backend PID, transaction ID and a short database-clock deadline. The key is action/login-specific; proof replay on a different backend/transaction, changed body/action/identity, or a reused nonce fails. No credential or signing facility is sent to a browser.

The restricted loader reconstructs `SyntheticNarrationContext` from separate stored source/analysis/narration rows. It does not accept a request plan as its authoritative context. It checks the tenant-scoped dependency envelope and exact expected scope, including R4 editor tenant ownership. M6-01 replay then reuses the existing M1 source/admission, M2 definitive-result/UNKNOWN, M3 evidence/observed-basis, M4 projection and R4 identity/layout validation. Current source/media/candidate/narration hashes and source/narration revisions must match independently stored observations.

The database stores **synthetic projections**, not a claim that real media, application M1 rows, production sessions or live approval exist. Media fingerprints/durations are independently seeded fixture observations; this phase performs no media read/probe/download. Currentness is the current database pointer/reference under the fence, not a wall-clock guarantee about an uninspected movie.

## Save transaction and currentness fence

The service parses/bounds the proposal and verifies the exact create action and prospective read-back identity. A preliminary authorized capture is independently loaded and the full M6-01 plan is replayed. For an existing scoped key, the loader chooses its original immutable dependency so exact retries remain recoverable after source changes; changed canonical proposals conflict. This lookup provides expectations, never acceptance on a supplied hash alone.

A fresh saving transaction independently reloads/replays the plan again on the **actual saving connection**. Lock order is action key → exact scope → session → principal grant → policy → current dependency → repository head. Shared locks retain source/authorization observations; the head uses `FOR UPDATE` plus an explicit revision/ID CAS. Source/policy/session/grant writers must serialize on these rows. No provider, media or external operation occurs inside the default save transaction; test-only hooks pause synthetic races deliberately.

The database resolves the exact scoped key, verifies expected revision and complete previous identity, and allocates a transaction-bound reservation/challenge. The server constructs the strict saved record and signs the explicit `HighlightCurrentnessFence`. Its record hash includes exact source/candidate/narration identities/revisions, original lineage, policy, scoring, selected clips, order and expected parent. SQL reconstructs the same fence on the same backend/transaction, verifies its MAC, independently builds the expected record, inserts one version, advances the head by CAS and appends the audit. A final seal rechecks authorization/currentness; the deferred commit constraint checks completion and expiry again. Source locks remain held through commit.

A source change before the final transaction/fence rejects the save. A source writer arriving after the fence waits until the valid save commits, then makes that historical version stale. A preliminary resolver read alone is never a sufficient fence. Original source/analysis/narration artifacts remain immutable.

After commit, a separate read transaction independently authorizes and reconstructs the exact saved version. The return value reports `SAVED` or `REUSED` with the validated view. It does not imply that the head or dependencies cannot subsequently change.

## Integrity, idempotency, conflict and recovery semantics

- Same scoped key and exact canonical proposal: the original immutable identity is reused, even after the head/source/policy changes, subject to current read/create authorization. No second version is created.
- Same key and changed canonical proposal: `IDEMPOTENCY_CONFLICT`.
- Different key with stale expected head/parent: `REVISION_CONFLICT`; no automatic overwrite/rebase.
- Changed source/media/M3/narration/revisions or incompatible current observation: `STALE_SOURCE`; no reservation/version remains from that rejected save.
- Audit failure or an interruption before commit: the saving transaction rolls back reservation, version, head and audit together. Separately committed preflight authorization nonce bookkeeping is not a saved artifact.
- Lost commit acknowledgement: return `UNKNOWN / COMMIT_ACK_LOST` with the **original** scope/key/proposal hash. There is no automatic retry or fresh key.
- Failed independently authorized read-back after a committed save: `UNKNOWN / READBACK_UNAVAILABLE`; never report a known committed save as rolled back.
- `readOperation` independently authorizes a scoped lookup of the original operation. It returns FOUND with a fully validated view or NOT_FOUND; it never creates anything. An explicit retry, if later authorized, must preserve the original proposal/key.

NOT_FOUND after an UNKNOWN result is only an observation: it does not prove rollback while a prior commit might still be in progress. Retain the original operation identity. Do not silently generate another key.

Reads independently verify actual row identity, record/proposal/dependency/audit hashes and bindings, full previous identity and complete M6-01 replay. Exact source text, evidence, observed/inferred labels, scoring factors, source order, recap order, gaps and restrictions are retained. History is scoped, ascending, bounded and replay-validated. A historical record remains structurally verifiable against its own immutable snapshot while currentness can be stale. A disabled current planning policy blocks new saves/preparation but permits authorized historical reads and exact-key recovery marked stale.

## Verification

Logs: `/tmp/movie-translator-m6-02-z70Jah/`. Earlier owned debug runs are retained under `/tmp/m602-*.log`. All commands ran from the project root; all database mutations used newly owned disposable clusters. No package was installed. Local process/socket execution permission was used for the explicitly authorized PostgreSQL, Node/browser and build subprocesses.

| Final verification | Completed result |
| --- | --- |
| Focused M6-02 contracts, persistence and SQL/auth security suite | **89/89 PASS**, 0 failed/skipped (`focused-envelope.log`). |
| Consolidated serial M1–M6, M5 durable, R4/M9 and applicable Recap/render server regressions | **1,341/1,341 PASS**, 0 failed/skipped, 509.58 seconds (`server-regressions.log`). |
| Relevant Studio/legacy UI components | **43/43 PASS**, 0 failed/skipped (`ui-components.log`). |
| All Studio/legacy Chromium suites | **4/4 PASS**, 0 failed/skipped, 1440/1024/390 px (`chromium.log`). |
| `pnpm lint` | **PASS**, exit 0, no warnings (`lint-final.log`). An unused test import found in an earlier lint run was removed. |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0 (`tsc-final.log`). |
| Dummy-datasource Webpack build | **PASS**, Next.js 16.3.6, compiled/type-checked and generated all 12 static pages (`webpack.log`). |
| Fresh production source/client/action audit and secret-pattern scan | **PASS**, 71 client chunks with zero M6/fake-adapter markers, 38 unchanged API routes with zero voice/audio/highlight routes, zero Node/Edge Server Actions, zero secret-pattern hits across the 11 owned files (`security-audit.json`). |
| Working/staged whitespace, explicit inventory and staged-content review | **PASS**; only the 11 new owned files listed above. |

The consolidated run lists every test file once. Its 1,341 cases already include the focused M6-02 89, M6-01 70, all current M5 folders, R4/M9 files, and the root/jobs regression files. The separately completed focused 89 is a rerun, not another distinct suite. Final acceptance commands therefore completed **1,477 passing executions representing 1,388 distinct cases**: 1,341 + 43 + 4, plus the separately reported repeated 89. Earlier development/debug runs are excluded from these final acceptance totals. Historical reports were not used as proof of current test counts.

All **16/16 unchanged M4 expiry controls passed** in the consolidated run: six forced pre-send expiry repetitions produced zero sends/sticky UNKNOWN, six positive actual-wire repetitions retained their original definitive results across expiry, and four additional confirmation/lease/permit controls passed across M1-first/M1-last. The historical timing miss did not recur. Its root cause remains unknown; passing this run does not establish that it was repaired.

Actual final commands (application datasource remains explicitly unreachable):

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/highlights-persistence/*.test.ts

DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/storyline/voice-foundation/*.test.ts tests/storyline/audio-verification/*.test.ts \
  tests/storyline/private-artifacts/*.test.ts tests/storyline/durable-fake/*.test.ts \
  tests/storyline/highlights/*.test.ts tests/storyline/highlights-persistence/*.test.ts \
  tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts \
  tests/storyline/studio-versions/postgres.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts

node --import tsx --test --test-reporter=spec \
  tests/storyline/editor-saving/component.test.tsx \
  tests/storyline/ui/script-preview.test.tsx tests/storyline/ui/navigation.test.tsx \
  tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx \
  tests/video-render/export-ui.test.tsx

PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
CHROME_PATH=/opt/brave.com/brave/brave \
node --test --test-concurrency=1 tests/recap/recovery-browser.test.mjs \
  tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs \
  tests/storyline/editor-saving/browser.test.mjs

pnpm lint
pnpm exec tsc --noEmit
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  pnpm exec next build --webpack
git diff --check
git diff --cached --check
```

The production audit scans app/components/workers/scripts for M6-02 factories, private schema/authorization/persistence markers, then scans the fresh client chunks for those and prior synthetic M6/M5/owned-database helpers. It inspects API route names and the Server Action manifest. Chromium retains exact legacy save/read-back, immutable originals and responsive layouts; its harness audits report zero production API/provider calls during local editor interactions. No existing UI was changed.

The focused cases cover exact round-trip, original M4 and R4 separation, duplicate/concurrent saves, parent CAS, source/narration drift, real independent connections blocked by the save fence, audit/insert rollback, uncertain commit recovery, independent read-back failure, current-versus-historical integrity, tenant isolation/pagination, source/candidate/media forgery, rehashed scores/domain confusion, missing M3 evidence, expiry/revocation, Origin/CSRF, database ownership and read/create grants, direct SQL/column privileges, composite FKs, owner immutability, catalog tampering, null bounds, unknown runtime action, action/backend/transaction/body/nonce proofs and coordinated plan/proposal/record/audit rehash attacks. Fake audio remains optional reference metadata with `speech: NOT_VERIFIED`; it cannot grant approval, real TTS, publication or clip duration.

## Production limitations and M6-03 handoff

This is complete only as a synthetic disposable repository. Production authentication, tenant ownership acquisition, durable schema deployment, real media currentness and operational key management remain separately unimplemented/unauthorized. The fixture administrator controls the authoritative corpus; hashes and replay do not establish psychological truth or human approval. M6-01's documented greedy-selection limitations remain. No Highlights UI, extraction, synchronization, rendering, provider or worker was added. The historical M4 expiry timing miss remains unexplained even if current controls pass; preserve all 16 assertions and investigate any recurrence.

**M6-03 is separate and unimplemented.** A future explicitly injected synthetic Studio adapter may connect the existing six-destination shell to prepare/save/read/history. It should expose immutable identity, dependency currentness, expected revision/parent, readable selection/exclusion evidence and scoring, and separate Saved versus Human Approved states. Retain edits during conflicts/errors; show stale-source and head conflicts explicitly. An UNKNOWN save must preserve the original proposal/key and offer authorized operation lookup, not silently save again with a fresh key. Never send auth keys, database credentials, fixture sessions or raw dependency loaders to browser code. UI integration requires its own synthetic acceptance, accessibility/responsive tests and production-bundle audit. It must not activate production routes, approve content, promote fake audio or extract/render clips. Stop at this handoff.
