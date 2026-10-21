# M8-06 Phase 1A — Disposable fake maintenance decision foundation

Date: 2026-10-21, Asia/Bangkok. Scope: maintenance authorization, original evidence references and durable metadata decisions only. **Phase 1A PASS — DISPOSABLE_FAKE_ONLY metadata foundation.** No filesystem fence release, SQL reader-hold release, quarantine, GC, original fake invocation, real media, provider, public route or production activation.

## Preimplementation freeze (before runtime code or SQL)

Baseline is clean `main` at `ddbfd40dc64d6f2e5ca61d260826494aa3a83d5a`; accepted M8 and M8-05 ancestry verified, upstream `origin/main`, no fetch or branch operation. All 661 existing tracked text files are frozen. Read AGENTS/CLAUDE, installed Next testing guidance, Phase 0/M8-05/M8 final/M8-04/real-media feasibility reports and actual storage/process/authorization/gateway/canonical/validation/disposable PostgreSQL code.

Phase 0 establishes cooperative local descriptor closure, not durable authority or legacy recovery. Process-private receipts cannot be reconstructed after supervisor loss. Unknown descendant or owner evidence remains blocked. This phase must not convert closure of a fixture storage reader/writer into an original M8 process result or UNKNOWN resolution.

New domains: `story-recap-fake-maintenance-{root,owner,decision,writer-closure,reader-closure,successor-observation,authorization-proof,decision-result,audit-event,health-snapshot}-v1`. Strict envelopes have schemaVersion, namespace/four-part scope, permanent fake restrictions and exact body. Body field catalogs are frozen in the new contract module and tested before scratch schema installation. Existing 7+14 M8 domains and Phase 0 domains remain unchanged.

Actions are submit/evidence/qualify/reconcile/read/health, each with a separate restricted login/key. Native identity is explicitly injected disposable session authority, exact Request URL/method/Origin/Fetch Metadata and mutation CSRF. Browser roles are rejected. SQL independently agrees on principal/session/scope/root/action, rejects NULL permission elements, and validates one-use action/body/backend/transaction/deadline MACs. Evidence fact MACs use a different domain projection and must match independently provisioned immutable original observation anchors. Action/fact keys cannot insert, replace or invent those anchors. Trusted fixture owner/source authority remains a declared assumption, not protection against a malicious administrator.

Original source ownership is established by a separately owned Phase 0 supervisor fixture. Root/owner hashes, original writer/reader receipts and successor observation are captured before evidence registration; no client payload becomes an original observation. Kernel details and credentials stay private/untracked. Missing original anchor, unknown owner or uncertain descendants cannot qualify even with a correctly signed rehashed payload. Runtime evidence handles use a WeakMap, are nonserializable and cannot be copied or reconstructed.

The new schema is an independent disposable island: no USAGE/SELECT/DML grants on M6/M7/M8 and no alteration of their schemas/roles. Existing M7→M6→M7→execution prefix remains unchanged. Planned independent order: action key → scoped authorization/session/grant → quota → root head → decision state → immutable owner/anchor references → audit. The implemented branch-specific order is recorded below; the singleton quota serializes every gateway before root/state acquisition. Health reads authorize but return bounded counters only. No filesystem/process I/O under SQL locks. Cross-schema operational integration requires another review and is not implemented.

Lifecycle: REGISTERED → EVIDENCE_PENDING → QUALIFICATION_BLOCKED or QUALIFIED_FOR_FUTURE_PHASE_ONLY → DECISION_RECONCILED. Original decision ID/body immutable; same ID/body discovers original state/outcome, changed body conflicts. Qualification advances only the new maintenance root generation/revision using CAS, never an existing M8/storage generation. Immutable result preserves its original qualified/blocked outcome after reconciliation. Missing or uncertain results never authorize external effects, a replacement identity or launch.

Metadata ceilings: 16 decisions, 32 registered evidence references, 1 MiB ordinary logical reservations, 2 MiB total policy envelope with 1 MiB excluded recovery margin; each decision reserves 32 KiB, each evidence reference 16 KiB; 4096 one-use proof records; bounded source/anchor setup and 8-KiB record bodies. These bound logical fixture metadata, not physical PostgreSQL/WAL storage. No eviction, truncation or quota recycling.

Audit is part of every business transition in the same transaction, with deferred completeness, current session/action/grant/deadline checks. Immutable decision/evidence/result/audit rows and truncate guards; fixed qualified search paths, NOLOGIN non-elevated owner, no PUBLIC helpers, direct table/column access, TEMP/CREATE or owner membership. Lost commit ACK observes the same original ID/body/result; crash before COMMIT rolls back metadata, with no external effect to repeat. A service-only child will test those boundaries; it cannot invoke media or original fake work.

The independent scratch arrangement is feasible using the existing ownership-marked PostgreSQL helper and private Unix sockets, new restricted roles and no application datasource. Bootstrap/catalog failures must stop tests rather than widen grants. The application DATABASE_URL is explicitly unreachable. Test-only original observation registration is provisioned under the fixture owner, outside maintenance logins; this is the independent authority boundary that action signatures cannot replace.

## Actual implementation and exact inventory

All fourteen paths below are new. No baseline file, existing runtime contract, test, dependency, schema, grant or UI file is changed.

| Path | Responsibility |
| --- | --- |
| `lib/storyline/maintenance-fake/contracts.ts` | Ten domains, strict bounded canonical envelopes, immutable restrictions and state vocabulary. |
| `lib/storyline/maintenance-fake/auth.ts` | Injected, process-private synthetic session authority; native Request verification and revocation. |
| `lib/storyline/maintenance-fake/evidence.ts` | Trusted original-observation seam and one-use nonserializable evidence handles. |
| `lib/storyline/maintenance-fake/database.ts` | Six restricted gateways, independent catalog audit, action/fact proofs, transaction and ambiguous-COMMIT handling. |
| `lib/storyline/maintenance-fake/service.ts` | Explicit submit/register/qualify/reconcile/read/health service; no operational callback. |
| `lib/storyline/maintenance-fake/index.ts` | Server-only explicit exports; no default composition. |
| `tests/storyline/maintenance-fake/schema.sql` | Separate disposable metadata schema, private tables, six wrappers, CAS, immutable results and atomic audit. |
| `tests/storyline/maintenance-fake/fixture.ts` | Fresh owned PostgreSQL, separate native/SQL authorities and original non-media Phase 0 observations. |
| `tests/storyline/maintenance-fake/contracts.test.ts` | Contract, domain, serialization and handle-copy negatives. |
| `tests/storyline/maintenance-fake/lifecycle.test.ts` | Original identity, competing decisions, lost ACK, transport ambiguity and enumerated child crash tests. |
| `tests/storyline/maintenance-fake/security.test.ts` | Independent SQL, catalog, expiry, NULL grants, scope, origin, evidence and quota negatives. |
| `tests/storyline/maintenance-fake/decision-child.fixture.ts` | Metadata-only child with three fixed pre/post-COMMIT barriers, privately provisioned over IPC. |
| `tests/storyline/maintenance-fake/production-audit.mjs` | Read-only production import and built bundle marker audit. |
| This document | Freeze, implementation, evidence, limitations and Phase 1B gate. |

The new factories are `createMaintenanceAuthenticationForTest`, `newMaintenanceSessionForTest`, `createMaintenanceEvidenceOriginForTest`, `createMaintenanceGatewayForTest` and `createMaintenanceServiceForTest`. Mode is explicitly `M806_PHASE1A_DISPOSABLE_ONLY`. The service exposes only `submit`, `registerEvidence`, `qualify`, `reconcile`, `read`, `health` and pure `decisionHash`. There is no launch, release, deletion, quarantine or availability mutation entry point. Existing `createFakeProcessOwnerForTest` is instantiated only as a zero-start oracle in tests; new runtime modules cannot import it.

### New domains and exact records

All hashable records use `SHA256(domain + "\n" + canonicalJson(parsedEnvelope))`, reusing unchanged [canonical serialization](../lib/storyline/canonical.ts) and [validation](../lib/storyline/validation.ts). Parsing rejects getters/non-JSON/invalid Unicode/unsafe or fractional numbers/negative zero, unexpected or missing fields, wrong domains, promoted restrictions and malformed identity/hash fields. Envelopes are deep frozen, bounded to 8 KiB and have exactly `schemaVersion`, `namespace`, `scope`, `restrictions`, `body`. Scope is exactly tenant/project/movie/studio. ID parsing uses the existing repository bounds. Hashes are lowercase SHA-256. Generations are positive integers; revisions are nonnegative, both at most 1,000,000.

| Domain suffix, under `story-recap-fake-maintenance-…-v1` | Exact body |
| --- | --- |
| `root` | rootId, incarnationHash, guardHash, writerId, readerId, supervisorHash |
| `owner` | rootId, ownerId, incarnationHash, kind=WRITER/READER, generation |
| `decision` | decisionId, rootId, rootHash, writerId, readerId, expectedGeneration, expectedRevision, purpose=OBSERVE_CLOSURE_ONLY, evidenceHashes (exactly three distinct hashes) |
| `writer-closure`, `reader-closure` | rootId, ownerId, ownerHash, supervisorHash, guardHash, generation, descriptorsClosed, noFutureIO, descendants=PROVEN_QUIESCENT/UNKNOWN, origin=ORIGINAL_PHASE0_SUPERVISOR |
| `successor-observation` | rootId, writerHash, readerHash, guardHash, generation, revision, observation=QUALIFIED_FOR_FUTURE_PHASE_ONLY/BLOCKED, origin=ORIGINAL_PHASE0_SUPERVISOR |
| `decision-result` | decisionId, decisionHash, outcome=QUALIFICATION_BLOCKED/QUALIFIED_FOR_FUTURE_PHASE_ONLY, reason=ORIGINAL_EVIDENCE_INCOMPLETE/ORIGINAL_EVIDENCE_COMPLETE, generation, revision |
| `audit-event` | decisionId, decisionHash, revision, action, principalId, state, bodyHash |
| `health-snapshot` | decisionCount, evidenceCount, reservedBytes, pendingCount, blockedCount, qualifiedCount, reconciledCount, capacity=AVAILABLE/SATURATED |

`authorization-proof` is a separate strict canonical wire, not the ordinary body envelope: schemaVersion, namespace, scope, restrictions, sessionId, principalId, action, bodyHash, nonce, backendPid, transactionId, expiresAtMs, method, origin, fetchSite, csrfHash. The SQL wrapper binds the real login to its action key, then compares backend PID and transaction ID on that connection. Its MAC is `HMAC-SHA256(actionKey, accessDomain + "\n" + canonicalWire)`; bodyHash is SHA-256 of the exact canonical gateway body. Wire is at most 8 KiB; gateway body at most 64 KiB. Nonce is a generated 24-byte hex value with a durable uniqueness record, bounded to 4096 records. Maximum SQL proof horizon is five seconds; normal gateway TTL is three seconds.

A fact MAC uses the writer/reader/successor domain plus newline and the canonical projection `{context,rootId,decisionId,revision,kind,factHash,backendPid,transactionId}`. This is distinct from the access MAC. Even possession of both action/fact signing keys does not create original evidence: SQL requires the separately provisioned exact anchor payload and hash. Hash integrity and signatures are not kernel closure authority.

Restrictions permanently include DISPOSABLE_FAKE_ONLY, SYNTHETIC_ONLY, SIMULATED_NOT_MEDIA, MEDIA_VERIFICATION_NOT_PERFORMED, NOT_RENDERED, humanApproval NONE, sourceVerified false, spendingAuthority NONE, publicationEligibility false, originalMovieAudio EXCLUDED, synthesizedNarration NONE, speech NOT_VERIFIED, voiceSynchronization UNSUPPORTED, operationalRecovery false and originalProcessQuiescence NOT_ASSERTED. Existing M8 seven planning/fourteen execution domains remain unchanged.

## Purpose-specific authority and PostgreSQL findings

| Action / independent login and key | Allowed effect |
| --- | --- |
| submit | Reserve one immutable original decision/body; same ID/body returns original, changed body conflicts. |
| evidence | Register only exact preexisting independently owned anchors for that decision. |
| qualify | Commit one immutable blocked/future-only outcome and maintenance root CAS. |
| reconcile | Observe pending original, or record reconciliation while retaining its original immutable outcome. |
| read | Exact authorized root/decision/hash metadata inspection. |
| health | Scoped redacted counts; no decision or original evidence content. |

Every action requires its own native grant and SQL grant; health/read cannot borrow mutations. Exact native URL, GET versus POST, Origin and same-origin Fetch Metadata are checked; mutations also require CSRF. Duplicate cookies, browser objects, revoked/expired identities and wrong namespace/four-part scope/root deny. Synthetic identities are provisioned by explicit test composition, not a production HttpOnly-cookie issuer or an authentication shortcut. SQL independently checks session/principal/scope/root/action/origin/CSRF/deadline and explicitly rejects NULL-containing action or root arrays, including arrays that also contain the allowed action.

Only a new owned private-socket disposable database is accepted; every test sets the application DATABASE_URL to the unreachable dummy below. New schema `maintenance_m806` has a NOLOGIN non-elevated owner and purpose-specific inherited wrapper roles. The six logins have no direct private table, column or sequence access; no helper execution, owner membership, server-file/program role, database CREATE/TEMP or schema CREATE. The crypto extension is isolated, with no login EXECUTE. All functions use fixed `pg_catalog,maintenance_m806,pg_temp` paths with no caller-writable schema before private objects. Changing a caller search_path is harmless. Tests also deliberately add one column grant and prove catalog validation stops the gateway.

Actual catalog assertions cover function/table/schema owners, safe role memberships, six own-wrapper grants, seven SECURITY DEFINER entry/helper functions, sixteen immutable UPDATE/DELETE/TRUNCATE triggers and the deferred state-completion constraint. The schema contains scope/principal/session/access_grant/proof_key/used_proof/quota/root/root_head/owner/anchor/decision/state/evidence/result/audit_event. Composite keys bind scope/root/decision/anchor; decisions, original roots/owners/anchors, evidence, results, audit and proof history are append-only to restricted callers. Only the private gateway updates maintenance root head/state/quota. A trusted fixture administrator can provision or fault-inject original registries; malicious owner/admin compromise is outside the model.

No existing M6/M7/M8 schema, identity, grant, currentness policy, hash or execution permission changes. This foundation is a distinct database island, not a same-database operational integration with old execution state.

## Original closure evidence and its limitations

Fixture setup owns a new Phase 0 root/guard and arbitrary NON-MEDIA `.blob` fixture. A separately supervised writer acquires the pinned guard then seals; a reader opens its registered blob then seals; an independent successor observer acquires the same registered guard and qualifies the prior generation. Recognized original closure receipts and owner/root/guard/incarnation hashes are captured before PostgreSQL registration. The fixture administrator installs immutable anchors outside every maintenance login. Kernel observations stay in ignored receipts; no actual process identifier, path, root nonce, key or session credential is committed.

The uncertain-descendant variant withholds the original probe ACK, kills/reaps the owned child and deliberately retains UNKNOWN. The available guard, elapsed lease or process exit cannot manufacture full descendant closure. That original uncertain observation can be registered durably, but qualification commits BLOCKED. A plain closure JSON, rehash, copied handle or action/fact signature cannot replace an anchor. Repeated evidence tickets can reference only the same trusted original capture; they neither recapture nor restart work.

The runtime source seam is deliberately injected under fixture-owner trust. It cannot itself interrogate the kernel, and cannot distinguish a lying trusted fixture owner. The executable fixtures establish the limited local observation; the database persists that observation, not a transferable kernel capability. The live supervisor remains alive during metadata child crashes. Supervisor death, boot changes, legacy unregistered owners, missing original closure journals, hidden descriptor transfer, hostile same-UID processes, foreign descendants, network filesystems, host power loss and multi-host recovery remain unsupported/BLOCKED. The original M8 simulator's quiescence is never asserted by this maintenance result.

## State, lock order, quota and audit

```mermaid
stateDiagram-v2
  [*] --> REGISTERED: Original decision and audit commit
  REGISTERED --> EVIDENCE_PENDING: Independently anchored reference
  EVIDENCE_PENDING --> EVIDENCE_PENDING: Additional original reference
  REGISTERED --> QUALIFICATION_BLOCKED: Missing evidence
  EVIDENCE_PENDING --> QUALIFICATION_BLOCKED: Incomplete or uncertain evidence
  EVIDENCE_PENDING --> QUALIFIED_FOR_FUTURE_PHASE_ONLY: Complete original evidence and CAS
  QUALIFICATION_BLOCKED --> DECISION_RECONCILED: Preserve immutable blocked result
  QUALIFIED_FOR_FUTURE_PHASE_ONLY --> DECISION_RECONCILED: Preserve immutable future-only result
```

Only the new maintenance root generation/revision advances on qualification. A blocked outcome is immutable; later evidence cannot rewrite it. Repeated qualification returns the original result. Reconciliation of a pending decision returns pending unchanged. It cannot resolve an original execution UNKNOWN or create another decision automatically. Multiple original decisions may coexist, but the shared root CAS permits only one outcome to advance a given generation. Same-ID/body lookup still works after the root moves; changed content never does.

Actual new lock order on the committing backend is proof key SHARE → scope SHARE → session SHARE → grant SHARE → singleton metadata quota UPDATE → root head UPDATE. New submission then inserts decision/state; other actions load original decision then state UPDATE. Evidence takes its immutable anchor SHARE after state; qualification takes writer then reader owner SHARE after state. Immutable references cannot be changed by any action login. Every business transition inserts its audit in that same transaction; a deferred trigger checks current final revision audit, original result where required, session/action/root agreement and deadline through COMMIT. The singleton quota serializes all new gateway branches before root/state acquisition; no branch upgrades an authorization/source lock or takes an old M6/M7/M8 lock. SQL row-lock waits recheck proof/session wall expiry; a late deferred commit rejects. Catalog queries precede this graph and perform no external I/O.

Existing cooperating graph, inspected from actual gateways: M7 action key/scope/session/grant → M6 scope/session/grant/policy/current_dependency/head → M7 policy/head → execution authorization. Execution capture acquires source SHARE before fixture/state; standalone execution maintenance takes fixture then source/state. These are unchanged branch-specific constraints. Phase 1A never joins either graph, acquires an existing storage guard inside SQL, or waits for a supervisor under SQL locks. Future integration must review the full graph again rather than append locks opportunistically.

Logical reservations are 32 KiB per decision and 16 KiB per evidence reference, at most 16 decisions and 32 references, with a serialized 1 MiB ordinary ceiling and 1 MiB unspendable margin in a 2 MiB policy envelope. This covers bounded original references, outcomes and transition audits; no eviction or recycling. Original fixture roots/owners/anchors are independently bounded setup data. Used-proof count is independently capped at 4096; reaching it blocks even read/reconcile wrappers and preserves original facts. This provides bounded fixture admission, not liveness under saturation or physical PostgreSQL/WAL/disk limits. Dedicated operational recovery reserve policy is a Phase 1B blocker.

Health counts/bytes are scoped and omit original root/owner/guard/decision content. Health/read consume anti-replay proof metadata but cannot change business decision state, outcomes, availability or byte storage. The AVAILABLE/SATURATED capacity bit reflects the fixture-wide admission budget, so it is a coarse global capacity observation, not per-principal content isolation. It does not claim storage availability, filesystem health, process quiescence or production readiness.

## Crash, ambiguity and reproduced correction

| Cut / injected fault | Required observed behavior |
| --- | --- |
| Metadata child killed before submit COMMIT | PostgreSQL rolls back decision/audit/quota; exact original lookup remains DECISION_UNKNOWN. No external work exists to repeat. |
| Submit COMMIT complete, application ACK withheld, child SIGKILL | Same original ID/hash is REGISTERED; no replacement identity or fake start. |
| Qualification COMMIT complete, application ACK withheld, child SIGKILL | Same original immutable future-only result is discoverable and reconciled. |
| Application hook loses submit/qualification ACK | MaintenanceCommitUnknown; explicit original lookup/reconciliation. |
| Server COMMIT complete, transport rejects with ECONNRESET before client receives ACK | Conservative MaintenanceCommitUnknown; original committed decision survives. |
| Audit insertion fails or final commit deadline expires | Atomic rollback of outcome/root CAS/audit; no external release. |
| Two competing original decisions | One generation advance and one immutable result; stale loser cannot overwrite. |
| Uncertain descendants or missing registered owner | Durable blocked qualification, no repaired/reconstructed closure authority. |

The independently added coded-transport test first failed: the new gateway classified ECONNRESET during COMMIT as TRANSACTION_FAILED because it only recognized ambiguity when the error lacked a code. Receipt `commit-transport-reproduction.log` retains that 0/1 failure. Corrected only the new gateway: any attempted COMMIT without a definitive recognized maintenance rejection remains UNKNOWN regardless of transport code. It is safe to retain uncertainty even for some other commit failures; callers must inspect the original identity. No test deadline, old source or existing assertion changed. Successful focused acceptance must include this exact unchanged new regression.

Child tests use only the enumerated metadata child and fixed IPC barriers; they do not simulate power loss, supervisor restart, media execution or multihost durability. The new source has no original process import/callback, and zero-start assertions are a structural oracle alongside that source/bundle audit; they are not a claim that a disconnected counter instruments arbitrary OS activity. Existing fake-execution regressions separately exercise original one-use starts/recovery.

## Fresh verification and failure preservation

All applicable final checks passed. This is an in-task implementation and adversarial review using independent restricted database sessions and original fixture authorities, not external auditor certification. No historical count is current evidence. Receipts, exact command arrays, source hashes and file manifests are retained in the already ignored `coverage/m8-06-phase1a-vde4wxde/`; earlier logs are preserved.

| Fresh suite | Actual result | Receipt |
| --- | --- | --- |
| Final new maintenance contracts/lifecycle/security, 3 files | **49/49 PASS**, 32.04 s | `acceptance-final.log` |
| Unchanged M8 fake execution/security/storage/recovery/restart, 8 files | **108/108 PASS**, 199.39 s | `m8-fake.log` |
| Unchanged M8 planning/replay/SQL/boundaries, 5 files | **150/150 PASS**, 39.72 s | `m8-planning.log` |
| Unchanged Phase 0 ownership/exclusion, 1 file | **27/27 PASS**, 0.98 s | `phase0.log` |
| M6 foundation/persistence/security/Studio acceptance, 5 files | **182/182 PASS**, 60.81 s | `m6.log` |
| M7 foundation/persistence/catalog/fencing/security/Studio acceptance, 11 files | **260/260 PASS**, 154.30 s | `m7.log` |
| Original M4 expiry file run alone, serial | **16/16 PASS**, 31.48 s | `m4-expiry.log` |
| All eight existing component files | **51/51 PASS**, 2.88 s wall time | `components.log` |
| Lint | **PASS**, final zero warnings/errors | `lint-final.log` |
| TypeScript (`--noEmit --incremental false`) | **PASS** | `typescript.log` |
| Dummy-datasource Webpack build | **PASS**, 30.77 s wall time; no application DB | `webpack.log` |
| Existing M6/M7-01/02/03/M8-01/03 production audits + new maintenance audit | **7/7 PASS** (scripts, not counted as test cases) | `*-production.json` |
| Exact owned inventory, all 661 existing hashes, domain collision, links, Mermaid structure, secrets and whitespace | **PASS** | `static.json`; staged receipts |

The final acceptance selection contains **843 distinct passing test cases across 42 test files**, with zero final failures, skips, cancellations or TODO. No parent test groups add to this selection's count. Earlier successful overlapping development/bootstrap executions are 11 pre-SQL contracts + 1 bootstrap retry + 42 initial focused + 47 expanded focused = **101 repeats**, giving **944 successful test executions representing 843 distinct cases**. The early saturation test label was clarified; its renamed case is not counted twice. Five failed test executions are retained separately: four socket-permission setup failures and the one reproduced transport-classification defect, all covered by final passing cases. No viewport iterations, assertions, audit scripts, kernel child observations or historical results inflate case counts.

The main regression orchestrator ran suites serially with `--test-concurrency=1`. The one targeted transport reproduction ran briefly alongside the unchanged M8 suite in a separate owned database; no M4 timing test overlapped other test/compiler workloads. The orchestrator was deliberately paused while the M7 child finished naturally, its exit status zero retained, then stopped before optional M5 fake-WAV parsing. Required remaining checks continued in a new serial runner. That orchestrator exit 143 is an intentional scope stop, not a failed test or a killed PostgreSQL/test child. Final maintenance acceptance includes the regression after correction. The first lint pass had one unused-import warning in the new gateway; that import was removed and final lint passed cleanly.

**NOT RUN:** optional M5 fake-audio lifecycle/verification suites (would exercise audio parsing outside this phase); full consolidated M1–M8 catalog (no foundation source changes; targeted M4/M6/M7/M8 and integrated fixtures selected instead); Chromium/browser suites (no UI/route changes; all existing component files executed). No unavailable suite is represented by an earlier milestone's result.

### Exact executed acceptance commands

All test/build commands set the unreachable application datasource and disabled build telemetry. The new fixture additionally enforces the exact dummy value. `commands.json` records initial arguments, including the explicitly unexecuted M5 candidate; `remaining-commands.json`, `results.json`, `remaining-results.json`, `scope-stop.json` and `counts.json` distinguish actual executions from candidates. Local orchestration/receipt scripts are ignored evidence, not committed runtime or deliverable files.

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
export NEXT_TELEMETRY_DISABLED=1
export MAINTENANCE_RECEIPTS="$PWD/coverage/m8-06-phase1a-vde4wxde/acceptance-final"
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 --test-isolation=none tests/storyline/maintenance-fake/contracts.test.ts tests/storyline/maintenance-fake/lifecycle.test.ts tests/storyline/maintenance-fake/security.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 tests/storyline/render-execution-fake/contracts.test.ts tests/storyline/render-execution-fake/independent-security.test.ts tests/storyline/render-execution-fake/independent-storage.test.ts tests/storyline/render-execution-fake/lifecycle.test.ts tests/storyline/render-execution-fake/recovery.test.ts tests/storyline/render-execution-fake/restart.test.ts tests/storyline/render-execution-fake/security.test.ts tests/storyline/render-execution-fake/storage-process.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 tests/storyline/render-planning/boundaries.test.ts tests/storyline/render-planning/contracts.test.ts tests/storyline/render-planning/foundation.test.ts tests/storyline/render-planning/postgres.test.ts tests/storyline/render-planning/tampering.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 tests/storyline/ownership-exclusion-phase0/feasibility.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 tests/storyline/highlights/foundation.test.ts tests/storyline/highlights-persistence/contracts.test.ts tests/storyline/highlights-persistence/persistence.test.ts tests/storyline/highlights-persistence/security.test.ts tests/storyline/highlights-studio/acceptance.test.ts
node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1 tests/storyline/timeline/boundaries.test.ts tests/storyline/timeline/foundation.test.ts tests/storyline/timeline/postgres.test.ts tests/storyline/timeline-persistence/boundaries.test.ts tests/storyline/timeline-persistence/catalog.test.ts tests/storyline/timeline-persistence/contracts.test.ts tests/storyline/timeline-persistence/fencing.test.ts tests/storyline/timeline-persistence/persistence.test.ts tests/storyline/timeline-persistence/security.test.ts tests/storyline/timeline-persistence/tampering.test.ts tests/storyline/timeline-studio/acceptance.test.ts
node --conditions=react-server --import tsx --test --test-isolation=none --test-concurrency=1 tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts
node --import tsx --test --test-reporter=tap --test-concurrency=1 tests/recap/recovery-ui.test.tsx tests/source-video/preview.test.tsx tests/storyline/editor-saving/component.test.tsx tests/storyline/highlights-studio/component.test.tsx tests/storyline/timeline-studio/component.test.tsx tests/storyline/ui/navigation.test.tsx tests/storyline/ui/script-preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm exec next build --webpack
node tests/storyline/highlights-studio/production-audit.mjs /home/hanlinko/Desktop/movie-translator/coverage/m8-06-phase1a-vde4wxde/m6-production.json
node tests/storyline/timeline/production-audit.mjs /home/hanlinko/Desktop/movie-translator/coverage/m8-06-phase1a-vde4wxde/m701-production.json
node tests/storyline/timeline-persistence/production-audit.mjs /home/hanlinko/Desktop/movie-translator/coverage/m8-06-phase1a-vde4wxde/m702-production.json
node tests/storyline/timeline-studio/production-audit.mjs /home/hanlinko/Desktop/movie-translator/coverage/m8-06-phase1a-vde4wxde/m703-production.json
node tests/storyline/render-planning/production-audit.mjs /home/hanlinko/Desktop/movie-translator/coverage/m8-06-phase1a-vde4wxde/m801-production.json
node tests/storyline/render-execution-fake/production-audit.mjs /home/hanlinko/Desktop/movie-translator/coverage/m8-06-phase1a-vde4wxde/m803-production.json
node tests/storyline/maintenance-fake/production-audit.mjs /home/hanlinko/Desktop/movie-translator/coverage/m8-06-phase1a-vde4wxde/maintenance-production.json
pnpm lint # final clean rerun after removing the unused import
python3 coverage/m8-06-phase1a-vde4wxde/collect.py
python3 coverage/m8-06-phase1a-vde4wxde/static.py
git diff --check
git diff --cached --check
```

Fresh production scans find **zero new maintenance markers** across 108 production sources, 250 other library files and 217 built JavaScript files. The existing audits independently report 71 client chunks, 144 server JavaScript files, 38 unchanged API routes and zero Server Actions; their narrower bundle roots explain the two-file scan-count difference. No fixture authentication, evidence authority, PostgreSQL gateway, signing credential, process capability or maintenance privilege enters production composition. The six new runtime modules are server-only and cannot import filesystem/process/provider/original execution adapters. Static preservation covers all 661 baseline tracked text hashes and finds ten unique new domains with no baseline collision. Documentation links resolve; the five-state Mermaid structure matches the contract vocabulary. These are source/fixture/bundle guarantees, not a production sandbox certification.


The first default-sandbox development run failed all four selected setups because PostgreSQL could not bind its owned Unix socket (EPERM), before SQL ran. One automatic approval review timed out; the explicitly permitted single scoped retry passed the bootstrap test with expanded socket permission. No application database fallback or privilege widening was used. These failed attempts and the subsequently reproduced transport regression are preserved separately from final acceptance.

## Preservation, limitations and Phase 1B recommendation

All sixteen [original M4 controls](../tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts), including the original 700-ms positive deadline, remain byte-identical at SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. This run passed all sixteen controls. The historical M1-last positive-control timing incident remains **UNRESOLVED**; one clean run does not diagnose or close it. A recurrence requires retaining original checkpoint ACK/lock wait/commit/confirmation and lease epochs, monotonic permit deadline and actual fake-wire entry. Never widen assertions or retry a provider to hide timing uncertainty.

Phase 1A readiness is limited to durable fake metadata authority/audit. **Phase 1B operational recovery remains BLOCKED pending separate authorization and design review**, including: exact original mutation/reader-hold identity, live original root/guard/incarnation fencing, complete independently admissible descriptor/descendant closure, a storage broker action permit distinct from this result, compatibility with existing execution lock order, exact-version effects with durable intent/tombstone/audit, loss-of-supervisor/boot handling, bounded recovery reserves and saturation behavior. Do not infer a release capability from a qualified result, hash, signature, guard availability, session expiry or missing SQL row.

The seven M8-04 fixes, existing UNKNOWN retention, one-use process ownership, root-wide quota serialization, output versions/tombstones, separate inspect/quarantine authority and six Studio destinations remain unchanged. No original M8 execution was added to new functionality, no SQL hold or storage fence was released, and no quarantine/GC/availability mutation was implemented. No media, providers/TTS, approval/SOURCE_VERIFIED, spending, production authentication, application database/migration, UI, route, Server Action, worker, public storage or deployment is activated. M10 real-media execution remains separately unauthorized. Stop after Phase 1A.
