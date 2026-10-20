# M9 recovery R4 — authenticated disposable read/save foundation

## 1. Scope, audit and trust boundaries

R4 implements a **synthetic/disposable-only** server foundation. It does not implement M9-05, UI Save buttons, a Next.js route/Server Action, production session authentication, a live migration, provider execution, approval, publication or TTS.

Audited baseline: branch `recovery/m9-studio`, HEAD `b8780ee`. The existing unstaged shell change and seven untracked R0–R3 files were present at entry and are preserved. The index was empty and is preserved. `AGENTS.md`, `CLAUDE.md` (delegates to AGENTS), the UI freeze, R0–R3 report/components/tests, M1 source and verification/currentness contracts, M2 durable recipe/result/transaction semantics, M3 candidate bindings, M4 narration contracts/context/persistence/SQL and existing owned PostgreSQL harnesses were inspected. The installed Next.js data-security guide was read. No M1–M4 foundation or R0–R3 file is modified by R4.

The service composes the **actual** `createNarrationContextRunner` from M4. It reuses authoritative M1 reconstruction, fixed M2 recipe/profile and completed-result validation, M3 grounding, deterministic original M4 validation, Project → Movie → Studio → Task locking and final media/source checks. Shape-valid browser provenance, `previewForTest` and the local editor model are never authorization inputs.

Trust belongs to the explicitly constructed server service, its process-owned synthetic session registry, pinned origin, ephemeral HMAC key, restricted PostgreSQL connections, fixed profile and synthetic media inspector. These are trusted test-bootstrap dependencies, never request JSON. Tests provision independent database-owned tenancy/session/scope maps. Application environment/datasource, request role claims and local UI consistency checks supply no authority.

## 2. File inventory

R4 creates eleven files and modifies no pre-existing files:

| File | Responsibility |
| --- | --- |
| `lib/storyline/studio-versions/contracts.ts` | Versioned edit, original binding, safe view/history contracts and immutable no-approval flags. |
| `lib/storyline/studio-versions/validation.ts` | Strict bounded proposals/payloads, exact source/analysis parsing, Unicode and canonical edited hashes. |
| `lib/storyline/studio-versions/synthetic-auth.ts` | Explicit process-owned synthetic session registry, origin/CSRF/scope validation and test revocation. |
| `lib/storyline/studio-versions/database.ts` | Effective privilege/catalog checks and transaction/backend/operation-bound signed authorization. |
| `lib/storyline/studio-versions/errors.ts` | Static, non-sensitive structured errors. |
| `lib/storyline/studio-versions/service.ts` | Authorized original/read/save/history methods and M4 currentness composition. |
| `docs/drafts/storyline-m9-r4-disposable-versions.sql` | Opt-in disposable tables, constraints, immutable guards and restricted gateways; ends in ROLLBACK. |
| `tests/storyline/studio-versions/fixture.ts` | Existing owned-cluster bootstrap, actual synthetic M1→M4 parents, ephemeral sessions/keys and negative gateway probes. |
| `tests/storyline/studio-versions/contracts.test.ts` | Canonical/Unicode/safety/production-inactivity controls. |
| `tests/storyline/studio-versions/postgres.test.ts` | Real PostgreSQL authentication, privileges, scope, races, staleness, idempotency, immutability and rollback tests. |
| `docs/STORYLINE_M9_RECOVERY_R4.md` | This audit, contract, implementation, verification and handoff. |

No dependency, app page/API, shared UI, worker, environment file, generated Prisma model, migration or existing test is changed. Earlier R0–R3 changes remain uncommitted and unstaged. Existing `logs/` and other logs are preserved; R4 verification writes unique `/tmp` logs.

## 3. Authentication and authorization model

`createSyntheticStudioAuthenticationForTest` requires literal `DISPOSABLE_SYNTHETIC_ONLY`, one exact configured origin and an explicit bounded session registry. The returned authority is registered in a module-private WeakMap; missing, ordinary, serialized or spread-cloned objects cannot authenticate. Registry data is cloned at construction. There is no environment key, default principal, permissive development mode or production resolver.

Every method requires a native server `Request` and verifies:

- GET for reads; POST for save.
- Request URL origin, `Origin` and `Sec-Fetch-Site: same-origin` against the independently pinned origin. Missing/foreign/ambiguous values fail.
- Exactly one `story_r4_test_session` cookie matching the registry, unexpired server time and no synthetic revocation.
- For save, a constant-time match of `x-story-r4-csrf` to the independent server-held session token.
- Exact Project/Movie/Studio grant, with distinct read and save flags. Save also requires read.

The same session/tenant/principal snapshot is compared after asynchronous work; switching to another valid session during a request fails rather than misattributing an edit. Save revalidates through a request-local wrapper around the existing M4 runner's media checks, including its final post-insertion checks. Session revocation or identity switching causes transaction rollback. No mutable global “current request” is used.

The database separately verifies the session/principal/tenant/scope/permission/expiry mapping for the actual login and the Project → tenant and Movie → Project → Studio ownership relationships. Its map cannot be written/read directly by the restricted runtime. A broad synthetic process grant cannot bypass the database map. Save acquires a shared lock on the exact database access row; a cooperating grant revocation either wins first and denies save, or waits until the authorized transaction finishes. Registry revocation remains separately checked. Expiry/currentness/authorization checks are point-in-time observations, not future publication leases.

The registry is **test-only identity verification**, not real authentication. No secure cookie is issued, user logged in, production IdP contacted, genuine tenant membership resolved or production identity verified. The Project model has no newly invented tenant field: `StoryR4ProjectTenant` is an administrator-provisioned disposable fixture map. Synthetic identities and ancestry cannot be promoted by changing their label. Tests also check an independently expired database access row and an attempted cross-tenant ownership grant rejected by its foreign key.

## 4. Immutable edited-version contract and exact lineage

`story-edited-narration-v1` records:

- Exact selected scope and original M4 **durable row ID**, its `draftHash`, and its distinct payload ID. The durable receipt ID is not the deterministic payload ID.
- The complete existing `NarrationSourceBinding`: Project/Movie/Studio, snapshot/content/context/dependency/binding hashes, expected Studio revision and media SHA-256.
- The complete existing `NarrationAnalysisDependency`: candidate ID/hash/schema/origin, task/generation, result ID/hash, submission ID, recipe hash and profile-definition hash. M3 candidate hash is never substituted for M2 result hash. Additional M2 request/result-marker validation remains in the reused M4 context acquisition, rather than invented request fields.
- Server-authenticated editor tenant/principal; independently numbered edit version; expected history revision; previous version ID/hash; idempotency key; canonical proposal/content hashes; database-generated UUID and UTC millisecond creation timestamp.
- Ordered original section IDs and original paragraph counts, with exact edited Myanmar text. Reordering/removing sections or changing paragraph topology fails. Headings, claims, annotations, parent/source/candidate artifacts are not rewritten. Original claim/evidence lineage does not semantically verify the new prose.

The immutable M4 parent hash transitively binds its full original payload, including its original version/parent, language, style and review metadata. Original and edited text use separate domain hashes. The edited payload is not relabeled as a new M4 AI draft.

Inputs reject unknown fields, getters, holes, invalid objects, malformed Unicode, empty/non-Myanmar paragraphs and unsupported controls. Exact Unicode, leading/trailing spaces, tabs and line breaks are preserved without normalization or silent truncation. Shared M1 ceilings apply: 60 sections, 12 paragraphs per section, 1,200 Unicode code points across a section and 36,000 across the script, plus 512 KiB serialized bounds. Idempotency keys/IDs and hashes have strict bounded shapes. Saving local R3 text can legitimately fail server validation; there is no automatic repair.

Every record fixes `origin: SYNTHETIC_TEST_EDIT` and `review` to `humanApproval: NONE`, `sourceVerified: false`, `semanticReview: NOT_REVIEWED`, `eligibleForTts: false`, `readyForPublication: false`. These flags are immutable and cannot be supplied through the save proposal. Saving does not issue a human receipt, approve narration, confer spending permission or authorize audio/video/publication.

The edit-history revision is **separate from** `StorylineStudio.revision`. No Studio pointer/revision, source, M3 candidate or original M4 draft is updated by saving an edit.

## 5. PostgreSQL restrictions and transactional persistence

The R4 draft is installed only by tests into an owned disposable cluster after existing M4-03. The fixture uses the existing harness's target ownership/socket/data-directory checks. It never loads the application datasource; test commands pin that variable to an unreachable dummy. The existing harness bootstraps repository baseline SQL only inside its new scratch database. No live Prisma migration command is run.

`storyline_r4_reader` and `storyline_r4_writer` are non-login, non-superuser/no-DDL/no-replication/no-bypass groups. Fresh least-privilege logins are created only in the fixture. They inherit the existing M4 source-reader privileges required for authoritative reconstruction, **not** original M4 persistence, M3 publication, verification issuance, admission, checkpoint, outbox or spending capabilities. The reader cannot execute save gateways. Neither can directly SELECT/write R4 versions, keys, access maps or fences, or SELECT original M4/M3/M2 private tables. The service checks actual effective privileges, inherited/column grants, unsafe memberships, schema CREATE, replication mode, protected triggers and pinned SECURITY DEFINER functions with no PUBLIC execution. Unexpected private SELECT, public-table DML or extra SECURITY DEFINER execution fails closed.

The inherited M4 reader has raw SELECT privileges on the existing authoritative source tables for reconstruction. This is a trusted server validation connection, **not database-enforced per-user RLS across every M1 application table**. All R4 public service methods authorize before using it, and original/edited-history gateways enforce signed exact scope. This existing source-access trust boundary needs separate production deployment review; it is not disguised as complete production tenant isolation or changed by R4.

R4 gateways require domain-separated HMAC authorization covering the backend PID, transaction timestamp, verified session/tenant/principal, scope, operation, exact original ID/hash, version/page target and complete proposal hash. Proof replay into another backend/transaction/operation/target fails. Read authorization is stateless; reads do not create save fences. Initial original/version/history reads use READ ONLY transactions. Existing M4 freshness observation separately takes its normal source locks without creating a draft/job/receipt.

Write preparation revalidates the actual M4 parent against the authoritative M1/M2/M3 context inside M4's source fence. The SQL open/finish gateways compare exact original source/analysis bindings and independently inspect current Studio/task/result/candidate status. A second domain-separated proof attests the bounded canonical edited payload to a private transaction/PID/login-owned, twenty-second fence. Finish rechecks authorization, bindings and the proof before insertion. M4 then rechecks authoritative source/media and the request-bound session before commit. Failure rolls back both the edited record and fence. No read triggers preparation, generation or a provider call.

The version table enforces parent scope/hash foreign keys, tenant/project ownership, unique scoped idempotency, unique version numbers per original and a composite self-FK binding previous ID/hash/version/original/tenant/scope. Domain-separated SHA-256 and metadata/review constraints bind the canonical bytes. UPDATE/DELETE/TRUNCATE guards make history insert-only, including ordinary fixture-administrator statements. Once referenced by R4, truncating M4 alone is additionally blocked by its FK before triggers run. Truncating both tables still hits immutable guards. The privileged migration/test administrator can alter schema/disable protections and is outside the restricted-runtime threat model; production credentials must never have that power.

## 6. Idempotency, concurrency, recovery and currentness

Idempotency is scoped by tenant, principal, Project, Movie, Studio and key. The canonical proposal includes the exact original binding, expected revision, previous version and all text. Same key/same bytes returns the same ID/hash/timestamp/version, including after another edit advances the head. Same key/different bytes or original returns `R4_IDEMPOTENCY_CONFLICT`. Different principals have independent key namespaces and still contend on the same original's version head.

The head is derived from immutable history; no mutable counter table or M1 pointer is introduced. Under the shared source lock, a new save must match the latest edit revision and exact previous ID/hash. Concurrent editors based on one head produce one success and one `R4_REVISION_CONFLICT`. Identical concurrent retries reuse one record. No last-write-wins, silent rebase, implicit retry, regeneration or overwrite exists.

Stale source/current-parent dependencies reject new saves, including duplicate submissions whose source is now stale. Authorized historical original/version/history reads remain available with `STALE_DEPENDENCIES` and exact unchanged text. Current labels are `CURRENT_AT_READ` or `CURRENT_AT_SAVE`, observed at that operation, never future authority. Generic/uncertain transaction failures are not automatically called source drift: the service checks the durable current-binding observation before returning `R4_SOURCE_STALE`; otherwise it returns `R4_TRANSACTION_FAILED`. After an uncertain commit acknowledgement, an explicit same-key retry/read resolves the existing immutable identity; there is no automatic second save or paid recovery.

## 7. Verification commands and actual results

New focused tests run first, then independent existing regression commands. Existing expiry/deadline tests run sequentially without competing builds. No historical 842/26/3 report substitutes for execution.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec tests/storyline/ui/script-preview.test.tsx \
  tests/storyline/ui/navigation.test.tsx tests/recap/recovery-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable pnpm exec next build --webpack
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs
```

Verification completed on 2026-10-18. The existing root server glob includes the pure disabled M5 handoff tests; no M5 implementation/execution is added. New R4 tests are in their own directory and have a separate actual count. All final counts below are completed runs from this task, not inherited reports.

| Check | Final actual result |
| --- | --- |
| Focused new R4 contracts and real PostgreSQL matrix | **106/106 PASS**, zero failures/skips; 50.024 seconds. |
| Independent existing Storyline/M1–M4 and listed legacy regressions | **842/842 PASS**, zero failures/skips; 346.797 seconds. Earlier 841/842 run retained below. |
| Existing unchanged M4 expiry controls in isolation | **16/16 PASS**, zero failures/skips; 32.171 seconds. |
| Preserved R0–R3 plus Recap component/model tests | **26/26 PASS**, zero failures/skips; 0.980 seconds. |
| Preserved Chromium suites: Recap, Studio navigation, local editor/review | **3/3 PASS**, zero failures/skips; 20.617 seconds; 1440/1024/390 px. |
| `pnpm lint` | **PASS**, exit 0. |
| `pnpm exec tsc --noEmit` | **PASS**, exit 0. |
| Working-tree/staged diff checks and eleven new R4 files' whitespace/newlines | **PASS**. |
| Webpack production build with unreachable dummy application datasource | **PASS**, exit 0; compilation, TypeScript, static generation and route/build traces complete. |

Final logs in `/tmp/movie-translator-r4-A1Pb0f/`: `focused-verified.log`, `server-regressions-final.log`, `expiry-isolated.log`, `component-regressions.log`, `browser-regressions.log`, `lint.log`, `typescript.log`, `build.log`. Earlier diagnostics remain alongside them. Browser artifacts/results are retained at `/tmp/storyline-m9-recovery-browser-ailpzh/`, `/tmp/recap-studio-navigation-BKMllJ/` and `/tmp/recap-recovery-browser-zzEjwl/`. The recovered local editor/review suite reports zero local network/API calls and unchanged original fixture; the legacy Recap retry suite intercepts three synthetic retry POSTs and reports zero paid requests. No real application API/provider request occurs.

Focused coverage includes real signed/authorized original→save→read→history; both M1/M2 role-install orders; no session/origin/CSRF, expired/revoked/switched identities, forged body/header claims and copied auth; read/save denial, independent database expiry and cross-tenant/scope ownership; Unicode, bounds, captured JSON (including inherited array methods), topology and every source/analysis/parent binding; independent database gateway binding/proof rejection with a proven real open fence; two real M4 originals; duplicate/changed-key payloads; concurrent sessions/CAS; Chinese/translation/QC/media/Studio/script drift; actual source/ACL lock contention; post-insert/final-media/session rollback; raw grants/column-grant/extra issuer capability denial; immutable M4 and saved history; real FK/hash/review constraints; safe errors/DTOs, unchanged verification/job/provider counts and no production imports/routes. The final focused run completed **106/106 PASS**, zero failures/skips, 50.024 seconds.

Retained R4 logs: `/tmp/movie-translator-r4-A1Pb0f/`. Earlier diagnostics remain there. Three initial draft smoke attempts were **0/2 PASS** each: they caught a reserved SQL identifier and SQL expression grouping errors before the eight selected flow/drift controls passed **8/8**. The first broader matrix was **92 PASS / 2 FAIL** (one truncation-code assertion and its parent); the next was **97 PASS / 1 FAIL** (the second-parent fixture incorrectly tried to create another M2 logical task using only a different idempotency key). The assertion now checks both FK and trigger denial explicitly; the fixture uses an actual distinct recipe window. Subsequent focused runs passed **99/99**, then **103/103** after adding identity-switch/final-check controls, and the final expanded run passed **106/106**. No M1–M4 code, existing assertion, timer, approval rule or protection was weakened.

The first independent existing-regression run completed **841 PASS / 1 FAIL out of 842**, zero skips (363.502 seconds). Its only failure was `M4 expiry M1 last: actual wire before expiry 2 retains original definitive result after expiry`: expected one fake-wire entry, observed zero at the existing positive-control assertion. The unchanged expiry file then passed **16/16**, zero failures/skips, in isolation (32.171 seconds). The full unchanged sequential rerun passed **842/842**, zero failures/skips (346.797 seconds). R4 is not imported by that suite; no changed timeout/grant/permit/assertion or competing build was used to force success. Exact scheduling/confirmation/lease/permit timing at the failed entry was not captured, so a passing rerun does **not** establish its root cause or production timing guarantees. Preserve the operational expiry gate and uncertainty in [M4 final acceptance](STORYLINE_M4_FINAL_ACCEPTANCE.md).

R4 tests assert zero verification rows and unchanged original/candidate/job/provider counts during R4 operations. The existing M1 regression suite separately exercises ephemeral synthetic verification fixtures in owned disposable databases; those are not production human receipts, R4 approval issuance or eligibility to synthesize/publish.

## 8. Safe responses and known limitations

Original views expose exact original identity/lineage, ordered heading/section/paragraph text, currentness, edit head identity and no-approval state. Saved views expose schema, immutable identity/content hash, source/analysis binding, editor tenant/principal, version/previous pointer/time, exact text and no-approval state. History is bounded ascending metadata (max 50/page), with explicit `nextAfterVersion`. Idempotency keys, canonical database envelopes, session/CSRF tokens, signing keys/proofs/challenges, private preparation/media locations, raw recipes/results and driver messages are excluded. Errors serialize only `{code,message}` with a static message.

This is structural/currentness and transaction acceptance, not Chinese semantic truth, Myanmar editorial approval, authenticated real-human attribution or production security certification. Synthetic history remains ineligible for approval/TTS/publication. Malicious privileged schema/fixture administrators, compromised server bootstrap/key custody, real session infrastructure and production deployment constraints remain outside this test boundary. Request-origin/Fetch Metadata enforcement here assumes a browser-compatible same-origin adapter and intentionally denies missing headers. A future non-browser adapter requires its own explicit reviewed trust model, not a permissive fallback.

## 9. Exact internal interfaces for future M9-05

The only constructor is `createDisposableStudioVersionService` in `lib/storyline/studio-versions/service.ts`. It requires explicit mode, genuine synthetic authentication authority, separate restricted reader/writer Prisma clients, a 32-byte ephemeral validation key, fixed synthetic profile and injected media inspector. Constructor-only fault/fence hooks are tests, never body fields. `STORYLINE_STUDIO_VERSION_PRODUCTION_ENABLED` is false and no application bootstrap imports the constructor.

```ts
// Internal test composition only; these are NOT live HTTP paths.
const original = await service.readOriginal(syntheticGetRequest, {
  scope: { projectId, movieId, studioId },
  original: { id: m4Receipt.id, draftHash: m4Receipt.draftHash },
});
const saved = await service.saveVersion(syntheticPostRequest, {
  scope: { projectId, movieId, studioId },
  binding: original.binding,
  expectedRevision: original.latestRevision,
  previousVersion: original.latestVersion,
  idempotencyKey: explicitRequestKey,
  sections: original.sections.map(section => ({
    sectionId: section.sectionId,
    paragraphs: editedParagraphsBySection[section.sectionId],
  })),
});
const readBack = await service.readVersion(syntheticGetRequest, {
  scope: { projectId, movieId, studioId },
  original: { id: m4Receipt.id, draftHash: m4Receipt.draftHash },
  versionId: saved.id,
});
const history = await service.listVersions(syntheticGetRequest, {
  scope: { projectId, movieId, studioId },
  original: { id: m4Receipt.id, draftHash: m4Receipt.draftHash },
  afterVersion: 0, limit: 50,
});
```

All methods require authorization independently. Read-back checks compare exact immutable ID/content hash/binding/text, allowing the distinct save/read currentness observation labels. Handle `R4_REVISION_CONFLICT`, `R4_IDEMPOTENCY_CONFLICT`, `R4_PARENT_MISMATCH`, `R4_SOURCE_STALE`, authentication/forbidden, invalid-input/not-found and transaction failures explicitly. Preserve dirty buffers on any failure. Save success is a saved-version state, never human approval. The future adapter must keep request keys stable across an uncertain retry and require explicit reconciliation for a conflicting new proposal. No autosave or UI wiring is implemented here.

## 10. Production activation prerequisites and exit

Production requires separate authorization and implementation/review for genuine server session verification and expiry/revocation, secure cookie/CSRF/origin policy, real tenant/resource membership, deployment-owned restricted roles/key custody, source-access/RLS trust boundaries, reviewed additive schema deployment and conflict/error/recovery handling. No environment flag, factory label, signed synthetic session or successful test activates any of those. Human approval/source verification, spending, providers, TTS and publication require their own independent reviewed workflows.

**R4 PASS — synthetic/disposable server foundation only. M9-05 READY for separately authorized, explicitly injected synthetic editor→save→read-back→history integration.** No M9-05 UI code or Save button is added here. Production read/write/session activation remains disabled, and approval/providers/spending/TTS/publication remain unavailable. No database outside newly owned disposable test instances was touched. No live migration, real media processing, Redis worker startup, commit, push, reset/clean or destructive Git operation occurred. Pre-existing source, staged/untracked work and logs are preserved. The earlier deadline-sensitive regression failure remains an explicitly documented timing uncertainty, not a repaired or production-certified behavior. Stop after R4.
