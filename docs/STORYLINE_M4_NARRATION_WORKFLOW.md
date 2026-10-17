# M4-04 End-to-end synthetic Myanmar narration workflow

## Implemented composition

`createSyntheticNarrationWorkflow` in `lib/storyline/narration-integration/synthetic-workflow.ts` composes the existing exported services:

```text
Persisted authoritative M1 source
→ reviewed M2 synthetic admission/outbox/worker/checkpoint/one-use fake wire
→ definitive immutable M2 completion marker
→ validated immutable M3 evidence candidate
→ M4-02 trusted context acquisition and deterministic Myanmar composition
→ M4-03 revalidation and immutable provisional insertion under source locks
→ restricted narration receipt and current/stale historical read
```

Only explicitly injected, isolated server/test composition can invoke it. The module has no default datasource, environment activation, authority issuer, provider transport, timer, worker startup, API or UI import. Existing restricted roles and disposable SQL gateways are sufficient; this milestone adds no SQL privileges, schema or migration.

The workflow uses the existing character-psychology composer unchanged. Chinese observations, cautious motivation/inference, competing interpretations and captured relationship references retain their exact grounded lineage. Decisions, conflicts and consequences are narrated only when the candidate contains supporting findings; missing categories are not invented to fill a plot outline. Myanmar ALL_CURRENT translations remain advisory. Drafts are SYNTHETIC_TEST, PROVISIONAL and NEEDS_HUMAN_REVIEW, with no human verification/approval and no duration or audio estimates.

## Explicit service entry points

The constructor accepts existing M3 analysis and candidate-read, M4 preparation and M4 persistence service capabilities. These are trusted server dependencies, never client JSON. The actual database services enforce roles, resource scope and source currentness; TypeScript shape is not authentication or spending authority.

| Method | Input | Behavior |
| --- | --- | --- |
| `run` | Existing M3 `{ decisionId, selection, identity }` | Explicitly delegates synthetic admission/execution to M3, then prepares/persists narration only for its exact current candidate. Never issues a decision itself. |
| `resumeCompleted` | Existing M3 `{ selection, identity, reference }` | Uses M3's non-executing completed-result recovery, including interrupted M3 publication, then M4 persistence. No dispatch, claim, checkpoint or send. |
| `resumeCandidate` | `{ scope, reference, candidateId, candidateHash }` | M4-only recovery of an exact persisted candidate. Does not call the analysis workflow or accept candidate/draft bytes. |
| `read` | `{ scope, narrationId }` | Delegates restricted historical status/read only. Does not prepare, persist or execute work. |

`scope` is exact Project/Movie/Studio; `reference` is exact task ID/generation. `selection` retains exact source snapshot/revision and existing recipe identity. Unknown fields, forged verification flags, cross-scope identities and mismatched candidate/task/generation fail closed. Selected older movies remain selected throughout; there is no newest-movie fallback.

M3's existing `IN_PROGRESS`, `UNKNOWN` and `TERMINAL` outcomes pass through without narration creation. A queued recovery remains IN_PROGRESS. UNKNOWN is never converted to completed or automatically resent. The fixed synthetic profile, acknowledged checkpoint, one-use fake permit and global unresolved-slot rules remain unchanged.

## Provenance and readback

The first M4-stage read resolves the candidate by the **intended task ID/generation**, then compares its persisted candidate ID/hash. A candidate belonging to task B is rejected before M4 composition when the caller targets task A. M4 preparation independently reloads the same immutable identity afterward; this preliminary read grants no future freshness lease.

Before persistence the workflow compares the independently loaded M4 candidate/task/generation and source scope with the selected M3 identity. For initial and completed-result recovery, source snapshot, Studio revision and recipe hash must also match the input already validated by M3. M4-03 reconstructs authoritative dependencies again inside its own write fence; earlier M4 preparation is not a freshness or write permit.

`NARRATION_READY` returns only:

- Exact task reference and M3 candidate ID/hash.
- M4 immutable provisional receipt.
- Restricted current-at-read narration view, with explicit synthetic trust, `humanApproval: NONE` and `sourceVerified: false`.

Receipt/readback IDs, candidate hashes, draft hashes, creation timestamps, provisional flags and canonical narration bytes must agree. The M3 candidate hash never substitutes for or gets replaced by the M2 completion-marker hash. Raw M2 result envelopes, private source context/storage keys, validation challenges and signing keys are not returned. Narration/evidence payload is server-side data, not an automatically authorized browser API DTO.

## Recovery, concurrency and transaction boundaries

There is no automatic retry loop. Each call executes one bounded pass using existing services.

1. An identical repeat or explicit candidate recovery reaches M4-03's duplicate-safe identity and returns the same durable record/hash/timestamp.
2. Concurrent post-result recovery uses existing source fences and unique constraints; one immutable narration wins, both callers receive the same receipt.
3. Failure after insertion but before transaction commit leaves no narration or fence row. Retrying starts at completed-result or candidate recovery and never resends the fake wire.
4. Interruption after commit leaves the committed immutable record. Recovery returns that record; it does not overwrite or silently create another version.
5. Changed source/media/QC/translation/script/Studio dependencies deny current publication. Historical committed records remain immutable and scoped reads mark them stale.
6. Conflicting historical bytes fail closed through existing validation/idempotency guards. The workflow does not delete, repair, rewrite or regenerate a conflicting record.

The entire M1→M4 chain is not one database transaction. Each existing durable boundary commits independently. In particular, a post-commit readback failure can leave a valid historical narration record while the workflow returns an error; recovery/read is explicit. Current-at-validation/read is a point-in-time observation, not permission to publish future voice/video without rechecking dependencies. Existing cooperating source-writer lock order, media checks and bounded transactions are reused unchanged.

Disposable fault hooks before/after M4 stages are constructor-only test coordination, not request fields or production feature switches.

## Task isolation and scheduling limitation

M3's Studio-scoped outbox may publish another queued task's reference to fake delivery. Its exact-target check rejects that delivery **before** worker claim/checkpoint/send; M4 is never called unless the requested task returns its exact candidate. A later explicit invocation can process the target task. No task-scoped dispatch gateway or expanded grant is introduced here.

Tests choose task A as the later ordered ID, guaranteeing B is dispatched first. They prove zero execution/result/candidate/narration for B, zero M4 preparation on the rejected pass, and one A narration on the later invocation. A separate test creates genuine completed candidates for A and B and proves that using B's candidate with A's reference (or A's candidate with B's reference) cannot persist a B narration.

Incidental fake delivery and scheduling/liveness remain a **production deployment gate**: choose a reviewed dedicated dispatcher or narrowly scoped task-specific dispatch before activating real queue consumers. This does not block synthetic correctness or the M4 handoff.

## Acceptance tests and verification

`tests/storyline/narration-workflow-postgres.test.ts` installs the existing baseline/M1/M2/M3/M4 drafts only into newly owned disposable PostgreSQL with synthetic source/media. Runtime operations use the existing restricted service connections; the fixture administrator only provisions synthetic records and inspects audit state.

The 20 focused tests cover both role orders; full persisted flow and exact Myanmar provenance; repeated calls; concurrent post-result recovery; rollback and committed-receipt interruption; Chinese/translation/media/QC/script/Studio drift; post-commit staleness; task isolation; wrong task/candidate/scope; UNKNOWN/incomplete tasks; wrong writer identity; immutable conflicts; read-only status; unchanged approval/verification records; both relationship endpoints and their captured Chinese anchor; and absence of production imports/provider calls. Fetch is denied. The intentionally corrupt conflict fixture is a new synthetic row installed by the disposable administrator, never a mutation of existing immutable history.

| Check | Result |
| --- | --- |
| Final focused M4-04 run, including task-first composition guard | 20/20 PASS, zero failures/skips |
| Final M4-04 cases in sequential combined run | 20/20 PASS |
| Relevant M1/M2/M3/M4 and listed legacy regressions, final sequential run | 815/815 PASS, zero failures/skips |
| Isolated existing M2 checkpoint regression suite | 54/54 PASS, including both role orders |
| Existing Recap UI / Studio navigation regression files | 2/2 PASS |
| `pnpm lint` / `pnpm exec tsc --noEmit` | PASS / PASS |
| `git diff --check` / `git diff --cached --check` / new-file whitespace | PASS / PASS / PASS |
| Final Webpack production build with unreachable dummy datasource | PASS |

The first combined run overlapped other validation processes and reported 813 passes / 2 failures: one existing M2 expiry subtest and its parent group. The exact failure was `untilWire(): 0 !== 1` in `checkpoint-transport-postgres.test.ts`, before fake-wire entry; the fixture uses a 700 ms confirmation window. All M4 cases passed in that run. Without changing M2 code, test timings or safety rules, the isolated checkpoint suite passed 54/54 and the final combined sequential run passed 815/815. This demonstrates a non-reproducing timing-sensitive regression-test failure, not a proven M4 application defect. Keep expiry suites separate from competing builds/test processes when reproducing; precise host scheduling attribution was not measured.

PostgreSQL tests and build verification run outside the sandbox with approval for local execution, using newly owned clusters and an unreachable dummy application datasource. Existing application data and real media are not accessed. Early TypeScript checks exposed safe-read DTO narrowing issues; the wrapper now checks the exact readback fields/canonical bytes and constructs its allowlisted result, and the final TypeScript check passes.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-reporter=spec \
  tests/storyline/narration-workflow-postgres.test.ts
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

## Files and handoff

Created: the integrated workflow, focused end-to-end PostgreSQL tests, and this implementation document. Existing M1/M2/M3/M4 services, SQL, harness, application schema, routes, UI, environment and dependencies are unchanged. Earlier uncommitted work, staged index and logs are preserved. No real provider, paid spending, audio, human approval, SOURCE_VERIFIED issuance or production activation is added.

M4-05 can perform final synthetic narration acceptance over these exported services and freeze the exact provisional artifact handoff. No additional contract-review phase is required. Before any M5 voice execution, distinguish synthetic test narration from eligible approved text; establish the separately authorized human review/approval and currentness gates, provider-neutral voice input, measured per-section audio duration/checksum and explicit paid authorization. Current synthetic drafts remain ineligible for TTS. New durable M2 drafting jobs must first bind exact M3 candidate identity in versioned recipes. Live schema/authentication/provider/queue activation, production dispatch strategy, calibrated Myanmar pacing and actual TTS support remain unproven separate gates.

**M4-04: PASS (synthetic/disposable only). M4-05 acceptance and M5 planning handoff: READY. Paid/live/voice execution and human approval remain BLOCKED.**
