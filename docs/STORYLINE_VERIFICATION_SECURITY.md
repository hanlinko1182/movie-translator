# Storyline durable verification security — M1-E2B

## Deployment status

The server infrastructure is implemented and tested with synthetic data in disposable PostgreSQL. **Enabling durable receipts in the application is BLOCKED.** `STORYLINE_VERIFICATION_ISSUANCE_ENABLED` remains `false`; no application service instance, authenticated operator adapter, issuer connection, signing key, route, UI, worker or environment switch is installed. No existing application database was contacted or migrated. M1-E2A files and existing logs are preserved.

## Operator authority and explicit decisions

`operator-authority.ts` is a trusted server bootstrap port. Its default `null` adapter denies authorization. A future authenticated provider must validate an opaque server session and independently authorize the exact database project/movie/Studio, action (`VERIFY_SOURCE` or `REVOKE_VERIFICATION`) and decision hash. It returns a verified subject, safe audit label, authentication timestamp and session expiry. The server bounds the grant to five minutes. A label, browser object, environment flag, subtitle approval, MANUAL provenance or AI acceptance is never authority. No trusted-local authentication source currently exists. A local audit label remains only an audit label.

Bootstrap handles, proposals and decision commands use instance-owned WeakMaps; structural objects, JSON clones, another instance's capabilities and replayed/expired decisions cannot issue. Authorization consumes the exact source comparison proposal once. A failed stale/expired issuance also consumes its command. Provider errors become static safe codes; no session or private diagnostic is persisted or logged. Concurrent authorization of one proposal admits one command after the asynchronous authority check.

The M1-C Chinese comparison rubric and strict decision validator are reused: identity/attribution, Chinese meaning, Myanmar consistency, observed versus inferred, anchor relevance, ownership, chronology/causality and sufficiency. `SOURCE_VERIFIED` requires every applicable comparison supported. Contradiction requires `UNSUPPORTED`; insufficient evidence yields `INCONCLUSIVE`. Supported inference additionally needs current verified observed basis receipts. No human decision can waive deterministic invalid references, character/relationship ownership or confidence restrictions. Claims/narration are compared with exact Chinese anchors, not inferred from subtitle approval.

## Database role proposal

`docs/drafts/storyline-verification-roles.sql` is a separate **review-only deployment proposal**, not a live migration. Only disposable tests execute it. It creates credential-free NOLOGIN groups; separate login credentials must be provisioned privately in a later authorized deployment. Runtime and issuer must not belong to the migration owner or each other. The proposal transfers only Storyline table ownership; source records are not rewritten. Its schema privilege change and grants require review against the target deployment before use.

| Identity | Source/application tables | Storyline snapshots/scripts/beats | Verification history | Fixed issuer gateways | DDL/role administration |
| --- | --- | --- | --- | --- | --- |
| Migration owner | Source lock privileges; privileged administration | Owner | Owner; guards still enforce append-only behavior | Owner | Privileged administration |
| Normal runtime | Existing application CRUD grants, no truncate/trigger grant | CRUD subject to immutable SQL guards | SELECT only, including no column INSERT/UPDATE | No EXECUTE | No CREATE, ownership or role membership bypass |
| Verification issuer | SELECT only | SELECT only | SELECT only; no direct INSERT/UPDATE/DELETE | EXECUTE only | No CREATE or source writes |

The two fixed `SECURITY DEFINER` gateways lock Project → Movie → Studio and append one bounded envelope. They have a fixed `pg_catalog, public` search path, schema-qualified tables/functions/types, no dynamic SQL and no PUBLIC/runtime EXECUTE. Existing schema guards allocate/fence ledger sequence, previous global head, previous claim head, scope, bounds, immutable bindings and append-only history. A failed transaction rolls back both receipt and Studio revision.

Every issuance and lookup transaction checks effective database privileges, inherited/column grants, owner membership, privileged role membership, schema CREATE, enabled ledger guards, gateway ownership/search path and PUBLIC ACLs. Owner, superuser, DDL roles, ordinary application credentials with receipt write access, and a runtime identity inheriting issuer gateways fail closed. Existing owner-based application credentials are deliberately unsuitable. Owner/superuser administration is outside the runtime guarantee.

SQL cannot authenticate a human or calculate semantic truth. Issuer credentials alone also do not authenticate a decision. A pinned server signature therefore separates trusted issuance from merely well-shaped database rows.

## Receipt attestation and durable payload

The existing `StorySourceVerification` table and migration are unchanged. Its bounded canonical payload now carries the versioned durable envelope (`story-persisted-human-verification-v1`, `story-server-issuer-v1`), Studio/script identity, complete M1-C proposal, exact comparison, outcome/rationale, authenticated audit grant, review/issue timestamps, observed-basis receipt hashes and Ed25519 attestation. Project/movie, source content/context, exact claim/narration, cited/allowed Chinese anchor sets, translation context row hashes, inference basis/qualification, script and policies are bound through the recomputed proposal and signed envelope.

Built-in Node crypto signs exact canonical UTF-8 content before adding the attestation. The entry hash then includes the signature; its ID is `verification-{entryHash}`. Lookup verifies against an independently pinned bootstrap public key, never a key supplied in a receipt, request or database record. A public-only verifier cannot sign. No keys or credentials are written to Git, environment files or logs. Tests generate ephemeral keys in memory. Privileged issuer/database tampering can cause denial of service but cannot turn an unsigned or incorrectly signed row into current verified status. A compromised trusted signer/authority is outside this guarantee.

Key provisioning, custody, loss recovery, audited rotation and a historical verification key ring remain deployment gates. This version supports one pinned key per bootstrap instance; do not rotate it and silently invalidate old history. Existing review-test receipts lack signatures and cannot be imported as trusted durable receipts.

## Server services and currentness

`createDurableStorylineVerificationService` is server-only and requires trusted bootstrap dependencies. It is not installed in application routes/actions. Read and issuer connections are distinct. There is no environment boolean that enables issuance.

1. `propose` loads and revalidates immutable source/script/beat projections and the complete bounded, signed ledger from authoritative storage. It requires the current Studio pointers and live source/media compatibility. The proposal is instance-owned and binds the Studio revision and ledger head.
2. `authorize` validates the explicit Chinese comparison and asks the authenticated provider for the exact decision. It returns an opaque single-use command. There is no desired trusted status field outside the human decision rubric.
3. `issue` consumes authorization, performs full private checksum/probe outside the short write transaction, checks the actual issuer role, takes Project → Movie → Studio locks through the fixed gateway, reloads immutable context and ledger, compares revision/head, and rereads authoritative transcript, translation text/approval/QC/alignment, scene, character/evidence and source-media bindings after the locks. It checks media descriptor/path identity before and after append. Cooperating source writers already lock Movie; arbitrary out-of-band filesystem/database edits are privileged operations outside that protocol. Any mismatch aborts the transaction. No automatic retry or approval occurs.
4. `proposeRevocation` / `authorizeRevocation` / `revoke` bind the latest exact receipt and an explicit separately authorized reason. Revocation preserves its historical context and remains possible when old source dependencies are stale. It still checks scope, immutable context, ledger/revision and authorization. Another append or supersession requires a fresh proposal/decision.
5. `lookup` uses restricted runtime credentials and READ ONLY RepeatableRead transactions, pinned signature verification and authoritative historical context. It checks contiguous global sequence/hash chain, per-claim predecessors, timestamps, projected columns, recomputed proposals/bindings, comparison rules, issuer signatures and observed-basis support. It rechecks current live source/media and Studio pointers. It returns only bounded IDs/hashes and `PENDING`, `SOURCE_VERIFIED`, `INCONCLUSIVE`, `UNSUPPORTED`, `REVOKED`, `SUPERSEDED` or `STALE` states. A requested historical receipt must belong to the selected script and Studio. Invalid/untrusted history returns a controlled error instead of authorizing anything.

Lookup currentness is measured at its checked transaction/descriptor observation, not a promise that files can never change later. Missing media or changed dependencies fail source eligibility. Supersession/revocation is append-only; old receipts stay historical. Replacing or revoking a basis receipt makes dependent inference stale until independently reviewed again. The existing 2048-entry ceiling remains; reaching it blocks further append rather than resetting history.

Source eligibility is distinct from final script approval and voice permission. Lookup always reports `scriptApproved: false` and `voiceEligible: false`; downstream approval remains a future workflow. Subtitles, QC, Translation Memory, source timing and legacy Recap are untouched.

## Validation and release gates

The disposable harness verifies its fresh PostgreSQL 18.6 database, private socket, role, directory and ownership before running migrations or role SQL. It provisions new runtime/issuer logins with random credentials in memory. It never reads the application datasource. Synthetic fixtures cover twelve Chinese segments, one scene, mixed subtitle approvals, manual context and observed/inferred claims.

Tests cover unauthorized/forged authority, exact scoped decisions, expiry/replay/cloning, signature pinning, runtime/issuer ACLs, blocked privilege escalation/direct writes, signed current lookup, supersession/revocation and inference invalidation, source changes while waiting for locks, competing append/revoke, post-insert media failure/rollback, forged signature rejection, and unchanged legacy data. Existing M1-E2A persistence, SQL guard, Storyline, Recap and navigation regressions remain required.

Verified on 2026-10-13: disposable security suite **11/11**, M1-E2A service suite **7/7**, existing SQL guard/concurrency suite **20/20**, and all selected Storyline, Recap and navigation regression files passed. Prisma validation, lint, TypeScript and diff checks passed. The webpack production build passed outside the sandbox using an unreachable dummy datasource; the sandbox attempt encountered the existing TypeScript `--showConfig` output-read limitation. No validation step used the application database or a paid provider.

Before enabling any real durable receipt, separately authorize application database deployment and credential changes; establish authenticated operator access and Chinese-source review responsibility; provision isolated roles and a trusted signer; prove the actual connection catalog gates; define historical key retention/rotation and ledger-limit policy; and run an explicitly authorized operator acceptance test. This milestone authorizes none of those live actions.
