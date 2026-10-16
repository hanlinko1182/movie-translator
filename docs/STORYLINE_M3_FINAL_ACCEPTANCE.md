# M3-05 final evidence-analysis acceptance

## Decision

M3 synthetic-only acceptance is **PASS**, subject to the verification record below. **M4-01 pure contracts and fake narration composition are ready for a separately authorized implementation task.** Production deployment, real provider transport, authenticated spending, live migrations and human script approval remain disabled/unproven. This acceptance does not certify semantic or psychological truth.

## Executable acceptance evidence

`tests/storyline/evidence-final-acceptance-postgres.test.ts` composes the exported M1 persistence, M2 admission/outbox/worker/checkpoint/result and M3 workflow/validation/persistence services using a newly owned disposable PostgreSQL cluster, synthetic media identity and the branded fake wire. Runtime operations use restricted admission/outbox/worker/checkpoint/reader/candidate-writer connections. The test administrator provisions fixtures and reads audit counts only; it is not the workflow runtime identity.

| Boundary | Evidence |
| --- | --- |
| Persisted M1 identity | Database snapshot ID/canonical source has 12 Chinese segments; candidate content/context hashes match real M1 persistence output. |
| Exact M2 provenance | Candidate result ID/hash, submission ID, recipe hash and COMPLETED task agree with the restricted validator and immutable database records. The seven-field M2 marker remains separate from candidate bytes. |
| Chinese authority and advisory Myanmar | Exact source quote/anchor is retained; a MANUAL, NEEDS_REVIEW row with active QC is context only. M3-01 tests reject forged quotes, ownership, confidence and translation references. |
| Character/relationship ownership | A genuine persisted two-character/relationship source passes through M1→M2→M3. Removing one relationship endpoint fails validation and persistence, leaving one immutable candidate. |
| Hashes, immutability and currentness | Exact canonical bytes/hash agree across serialization and stored rows. QC drift marks the historical candidate stale; resume fails without changing bytes or resending. |
| Scope | Foreign project/movie/Studio reads and resumes fail through the exported services. |
| Human boundary | Forged SOURCE_VERIFIED metadata fails, verification receipts remain zero, and only the preexisting synthetic M1 draft script remains. No candidate becomes approved content. |
| Recovery/UNKNOWN | M3-04 tests cover duplicate invocation, concurrent post-result persistence, interrupted publication, source drift, expired authority and UNKNOWN with no second fake send. M2 tests retain acknowledged-commit, one-use permit, global unresolved-slot and rollback guards. |

The fixture now accepts an optional test-only additional-source seeder before M1 capture. It is used solely to install synthetic relationship evidence in the owned database; existing fixture defaults and production code are unchanged.

## Studio outbox finding resolved for M4 readiness

The existing `story_m2_test_claim_due` operation orders a bounded batch by task ID within the restricted Studio. The M3 workflow compares each returned delivery's task ID to its target **before** calling `worker.claim(reference)`; the worker and checkpoint independently resolve exact task/generation/recipe/ownership from PostgreSQL.

The new test creates two real durable tasks in one Studio and chooses the later UUID as task A, ensuring that the first dispatch selects task B. Targeting A publishes B's reference to fake delivery and returns `STORY_TASK_SCOPE_MISMATCH`. There is no lease, execution, checkpoint, fake send, result or candidate for B. Both task states remain QUEUED. The next explicit invocation for A dispatches and completes A once; B retains only its QUEUED event. This passes in both M1/M2 role-script orders. A duplicate invocation adds no send/candidate.

Therefore no restricted SQL or privilege change is needed for fake-only correctness or M4-01. The remaining issue is scheduling/liveness and incidental fake delivery, not unrelated task execution. Before production orchestration, add a narrowly scoped exact-task dispatch operation or deliberately use a separate Studio-wide dispatcher. Do not silently replace the requested task, loosen the reference check, broaden role grants or infer execution authority from delivery. There is no real queue consumer in this proof.

## M4 handoff

`lib/storyline/narration/contracts.ts` defines `story-narration-draft-v1` with exact source/analysis/result identities, reused M1 claims/beats, Myanmar paragraphs, ordered editorial sections, per-paragraph uncertainty/pacing, claim lineage, immutable parent drafts, provisional human review and a separate proposed server-derived approval view. No parser, generator, approval issuer, persistence, API or UI is activated by these types.

See [STORYLINE_M4_NARRATION_HANDOFF.md](STORYLINE_M4_NARRATION_HANDOFF.md) for exact field meaning, limits, script-review gates, duration behavior and M4-01 implementation order. A discovered dependency gap is explicit: M2 `parentResultHashes` authenticates the completion marker, not the separate M3 candidate. Durable M4 task recipes must bind candidate ID/hash through a versioned dependency extension before new drafting admission. This does not block pure fake composition and contract parsing.

## Verification record

Commands use an unreachable dummy application datasource. Only the existing harness creates/provisions/drops its owned disposable PostgreSQL; no application database or real media is read. The sandboxed focused attempt exited before assertions with the runner's generic `test failed` message. The same command passed outside the sandbox without code changes; disposable PostgreSQL setup in this environment is run outside the sandbox.

| Check | Result |
| --- | --- |
| New M3-05 disposable final acceptance | 4/4 PASS; zero failures/skips |
| Full relevant Storyline/M1/M2/M3 and legacy server regressions | 734/734 PASS; zero failures/skips, including the four new acceptance tests |
| Recap recovery/Studio navigation component regressions | 2/2 PASS; zero failures/skips, normal React condition |
| Scoped total, excluding focused repeat runs | 736/736 PASS |
| `pnpm lint` / `pnpm exec tsc --noEmit` | PASS / PASS |
| `git diff --check` / `git diff --cached --check` / new-file whitespace | PASS / PASS / PASS |
| Webpack production build with unreachable dummy datasource | PASS outside sandbox; disabled Storyline routes compile without activation |

Current reproduction commands:

```sh
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test tests/recap/recovery-ui.test.tsx tests/storyline/ui/navigation.test.tsx
pnpm lint
pnpm exec tsc --noEmit
git diff --check
git diff --cached --check
DATABASE_URL='postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable' pnpm exec next build --webpack
```

No live schema/M3 migration, real Redis/BullMQ, provider response, paid request, human verification issuance or approval was tested or activated. Existing staged/untracked work and logs are preserved; there is no commit or push.
