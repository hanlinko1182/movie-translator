# M4-05 Final Myanmar narration acceptance

## Scope and decision

Acceptance covers the **synthetic/disposable-only** M1→M2→M3→M4 pipeline and a disabled, provider-neutral M5 handoff. It does not certify psychological truth, production authentication, live schema deployment, real provider behavior, human approval or TTS eligibility. Existing application databases/media, migrations, queues, UI and paid services are untouched.

M4-05 adds executable final integration and expiry controls, pure versioned voice proposal types/parser and the implementation-ready [M5 voice handoff](STORYLINE_M5_VOICE_HANDOFF.md). No additional review-only milestone or runtime activation is introduced.

## Executable acceptance evidence

`tests/storyline/narration-final-acceptance-postgres.test.ts` uses actual exported M1 persistence, M2 admission/outbox/worker/checkpoint/fake-wire/result, M3 candidate and M4 workflow/preparation/persistence/read services. Newly owned isolated PostgreSQL is provisioned from existing baseline/drafts. Runtime service connections retain their reviewed restricted roles; the fixture administrator only provisions synthetic data and audits rows/guards.

| Boundary | Evidence |
| --- | --- |
| Authoritative M1 | Exact persisted snapshot has 12 Chinese segments, captured source/media identity and real selected `movie-old`; no newest-movie fallback. |
| Definitive M2 | Task is COMPLETED, submission/result lineage agrees, and the immutable result remains a `story-fake-result-v1` completion marker. |
| Immutable M3 | Candidate ID/hash/canonical bytes match the selected narration and original task/result. Candidate and marker hashes remain separate. |
| Grounded M4 | Narration row, strict validated payload and restricted read agree on all source/context/dependency/binding/media hashes, Studio revision, candidate/task/generation/result/submission/recipe IDs and hashes. |
| Exact Unicode/hash | Canonical stored Myanmar payload matches restricted read and recomputed domain-separated SHA-256. |
| Recovery/concurrency | Same invocation and simultaneous candidate recovery using distinct restricted writer connections return the same immutable receipt with no additional send, result, candidate or narration. |
| Scope/security | Cross-Project/Movie/Studio and wrong task references fail; writer has no direct narration DML; immutable UPDATE/DELETE/TRUNCATE guards reject administrative DML attempts. |
| Staleness/history | QC drift rejects renewed current use, returns STALE_DEPENDENCIES on read, and retains unchanged historical narration bytes. |
| Human/voice boundary | Verification receipt count remains zero, M1 script count is unchanged, all M4 output is synthetic/provisional, and a proposal from actual stored narration remains ineligible for a real provider. |
| UNKNOWN | Explicit repeated completed-result recovery remains UNKNOWN, with zero candidates/narrations/voice outputs and one original fake send. |

The final acceptance suite exercises both M1/M2 role orders. Existing M4-02/03/04 suites supply the additional complete failure matrix: source/media/translation/QC/script/Studio drift; actual cooperating writer races; conflicting immutable bytes; rollback after insertion/media checks; committed-receipt interruption; task A/B queued and completed-candidate isolation; missing/incomplete tasks; bad proofs/keys and role denials. Those suites are included in the combined run rather than replacing them with mock-only assertions.

All currentness labels are point-in-time observations. Publication/approval/voice must reacquire dependency fences; no M4 read supplies future authority. Studio-scoped incidental fake outbox delivery remains a production scheduling gate; exact-target checks prevent unrelated task execution/composition/persistence.

## Expiry investigation: established facts

The M4-04 first combined run failed one legacy subtest, plus its parent group:

```text
checkpoint-transport-postgres.test.ts: untilWire()
expected fake-wire calls 1; actual 0
```

Its fixture issues a 700 ms confirmation before admission/reconciliation/worker claim/checkpoint/pre-send validation. `untilWire` polls 100 times at 5 ms. A worker lease is `min(confirmation expiry, now + 500 ms)` before checkpoint. A committed checkpoint creates a two-second result lease. The process-owned one-use send permit has a separate monotonic one-second deadline starting before checkpoint work. PRE_SEND independently checks current lease, original confirmation expiry and source; RESULT requires the original valid owner/lease and definitive original result, without requiring the already-spent confirmation to remain unexpired.

Therefore a completed checkpoint does **not** guarantee that an attempt can enter wire by the test's polling deadline. Delayed preparation/pre-send can legitimately produce zero calls and sticky UNKNOWN. Increasing a grant, permit, lease or polling timeout to force success would not establish correctness.

`tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts` adds 16 controls with the original 700 ms grant and unchanged gateway/profile timing:

| Scenario | Repeats across two role orders | Required observation |
| --- | --- | --- |
| Expired confirmation before checkpoint | 2 | Grant-capped worker lease is no longer valid; checkpoint rejected, zero submissions/results. |
| Monotonic permit expiry with a still-valid long-lived confirmation | 2 | Burned permit denies send, zero fake-wire calls, sticky UNKNOWN, no replay. The long grant isolates permit expiry; it does not replace the legacy 700 ms scenario. |
| Deliberately held pre-send media inspection until database confirmation expiry | 6 | Checkpoint/result lease still valid and process permit still within one second; no wire entry, UNKNOWN, no result and no resend/recovery requeue. |
| Fake-wire entry before confirmation expiry, held response until database expiry | 6 | Lease remains valid; exact original definitive result persists COMPLETED once, idempotent delivery works and the permit cannot send twice. |

The tests observe PostgreSQL `clock_timestamp()` rather than assuming a sleep proves database expiry. Gated media inspection delays only the injected synthetic inspector; it changes no production code. Positive controls assert actual wire entry and valid lease rather than accepting a denial as success. Negative controls assert zero sends and immutable submission identity. Transport, grant, lease and worker timeout values are unchanged.

The first new run passed the 14 send/permit controls and caught two mistaken new-test assertions that expected a worker lease to outlive its confirmation. Inspection confirmed the existing 500 ms/grant-capped lease contract; only those assertions/names were corrected. The complete focused rerun passed all 16 expiry controls, three final M4 cases and eight pure M5 tests (27/27).

**Finding:** the covered expiry/lease paths preserve safety; no service correctness defect was confirmed and no worker/checkpoint/gateway change was warranted. Forced pre-send expiry deterministically reproduces the historical zero-wire symptom while preserving UNKNOWN/no-resend. The historical run lacks timestamps/outcome tracing, so its exact trigger (confirmation, permit, lease or scheduling before polling completed) cannot be recovered. Do not claim this uncertainty is resolved by a successful rerun.

**Operational gate:** execute expiry tests without competing builds/test processes, retain these explicit controls in CI, and repeat the deadline/clock/ownership matrix against any future real transport and deployment resource limits before paid activation. Uncertain submissions must remain UNKNOWN. This gate does not block pure/fake-only M5-01; it blocks using synthetic timing evidence as production paid-send certification. No timeout/expiration rule or legacy test was weakened.

## M5 handoff and remaining product gates

`story-voice-request-proposal-v1` binds the exact durable M4 row/hash, source/M3/M2 lineage, section/chunk/text identity, Myanmar locale, future verified voice/profile/format, cost cap and spending references. Shape-valid references never supply trusted approval/support/spending. Current proposals have mandatory disabled execution and both parser/assessment return non-executable results. See [STORYLINE_M5_VOICE_HANDOFF.md](STORYLINE_M5_VOICE_HANDOFF.md) for adapter, approval, checkpoint, budget, chunk, measured-duration and artifact contracts.

Google Gemini TTS, ElevenLabs and Azure Neural TTS are future candidates only. No exact model/voice has been verified or allowlisted here. Real TTS additionally requires a genuine immutable human-approved non-synthetic narration workflow, Chinese verification ownership/currentness, Myanmar language review, authenticated spending, provider capability evidence, budget reservations, durable audio checkpoint/result schema and safe private audio publication. Current M4 drafts cannot be promoted by changing their origin label or supplying approval JSON.

## Verification record

Verification completed on 2026-10-17. Application DATABASE_URL is an unreachable dummy. PostgreSQL uses the existing owned-cluster harness, synthetic source/media and private disposable credentials. No real receipts, provider/AI/TTS operations, application database, original media processing or Redis worker startup occurs. Existing M1 regression receipts remain synthetic test fixtures, not production issuance.

| Check | Actual result |
| --- | --- |
| Focused expiry, final narration and M5 handoff tests | **27/27 PASS**, zero failures/skips; includes 16 expiry controls, three disposable final-integration cases and eight pure handoff tests. |
| Combined Storyline M1/M2/M3/M4/M5 and legacy Recap/render regressions | **842/842 PASS**, zero failures/skips, 384.5 seconds. Original checkpoint expiry cases also passed. |
| Recap recovery and Studio navigation UI regression files | **2/2 PASS**, zero failures/skips. Component tests; no new browser/media execution or UI change. |
| ESLint | `pnpm lint` PASS. |
| TypeScript | `pnpm exec tsc --noEmit` PASS. |
| Working-tree and staged whitespace checks | `git diff --check` and `git diff --cached --check` PASS. |
| Webpack production build | `pnpm exec next build --webpack` PASS with unreachable dummy datasource; compilation, TypeScript, static generation and route/build traces completed. |

Disposable PostgreSQL execution required sandbox escalation to create local processes/sockets. No application datasource was substituted. Timing tests ran sequentially without competing build processes; all result counts above are actual completed runs, not planned coverage.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec \
  tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts \
  tests/storyline/narration-final-acceptance-postgres.test.ts tests/storyline/voice-handoff.test.ts
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

## Files and exit recommendation

Created eight files in M4-05:

- `lib/storyline/voice/contracts.ts`
- `lib/storyline/voice/handoff.ts`
- `tests/storyline/checkpoint-expiry-acceptance-postgres.test.ts`
- `tests/storyline/narration-final-acceptance-postgres.test.ts`
- `tests/storyline/voice-handoff.fixture.ts`
- `tests/storyline/voice-handoff.test.ts`
- `docs/STORYLINE_M4_FINAL_ACCEPTANCE.md`
- `docs/STORYLINE_M5_VOICE_HANDOFF.md`

Existing services, legacy tests, SQL drafts, schema, migrations, API/UI, workers, dependencies, environment, staged index and logs are preserved. No packages were added or removed.

**M4-05 PASS** applies only to its synthetic/disposable boundary. **M5-01 READY (pure/fake-only)** can proceed with the defined contracts and adapter planning. **Real TTS, human approval, paid/live activation remain BLOCKED.** Do not begin M5 from this task.
