# M3-04 synthetic evidence analysis workflow

## Scope

`lib/storyline/evidence-analysis/synthetic-workflow.ts` composes existing M1 source access, M2 admission/outbox/fake worker/checkpoint/result services, and M3 validation/persistence. Invocation is explicit and server-only. It is not imported by application routes, startup code, Redis workers, or provider adapters. It requires injected restricted database services and the branded fake-wire adapter. No live provider transport or authenticated production spending authority exists here.

The M2 definitive result remains its existing synthetic completion marker. The M3 candidate is generated separately from the exact persisted M1 Chinese source and then stored in the immutable M3 candidate ledger. Neither marker nor candidate grants `SOURCE_VERIFIED` or script approval.

## Explicit sequence

1. `run` accepts one already issued synthetic decision ID, exact selected project/movie/Studio snapshot, and canonical M2 recipe identity. The restricted admission gateway checks authority, scope, freshness, idempotency, and confirmation expiry.
2. The existing reconciler publishes a task reference and generation only. The fake worker resolves that reference from PostgreSQL, claims the bounded lease, and rechecks source dependencies.
3. The restricted checkpoint commits an immutable submission identity before issuing one process-local fake-wire permit. The fake wire has no network or model access. A definitive result is persisted through M2; an ambiguous result becomes `UNKNOWN` and is never automatically resent.
4. Only after `COMPLETED`, the generator reads the frozen M1 source and uses actual Chinese transcript text, captured character anchors, and admitted Myanmar context row references. Observed and inferred findings remain distinct. The inference is a cautious synthetic example, not a semantic truth claim.
5. The M3-02 validator checks durable task/result/recipe/source identity and structural grounding. M3-03 then repeats currentness checks within its restricted transactional fence and writes canonical bytes/hash immutably. A scoped readback returns a provisional candidate receipt.

`resumeCompleted` is the explicit post-result recovery entry point. It performs no admission, dispatch, worker claim, checkpoint, or fake send. Existing current candidates are returned idempotently. Conflicting immutable bytes fail; stale dependencies fail closed. `UNKNOWN` remains unresolved.

## Safety and limits

- All tests use newly owned disposable PostgreSQL, synthetic records/media identity, restricted roles, and fake delivery. There is no application database access, real movie processing, Redis startup, or provider call.
- The generator needs at least one captured character evidence anchor within the fixed recipe window. It does not invent missing characters, scenes, or quotes. Relationship output requires an existing relationship observation and permitted anchor for both endpoints.
- Structural grounding does not prove psychological or semantic correctness. Human source comparison and durable verification remain separate.
- A same-Studio outbox reconciler is reused. It can encounter another queued task in that Studio; the workflow refuses to execute a delivery with a different task ID. M3-05 disposable tests prove this in both role-script orders, including successful explicit recovery for the intended task without executing the other task. This scheduling limitation is a production deployment gate and does not block fake-only M4 development; see [final acceptance](STORYLINE_M3_FINAL_ACCEPTANCE.md).
- The application API gate, authenticated spending authority, real provider adapter, and runtime worker activation remain disabled. No live schema or migration is installed by M3-04.

## Acceptance

The disposable acceptance suite covers both M1/M2 role-installation orders, complete M1→M2→M3 flow, repeat invocation, one durable candidate, one fake send, post-result crash/resume, source drift, `UNKNOWN`, expired authority, cross-scope access, immutable conflicts, and restricted-role denial. Broader regressions and build results belong in the task report; this document is not an activation approval.

## Next boundary

M3-05 or M4 may add a reviewed semantic candidate-to-script planning boundary. It must not treat this synthetic output as provider output or verified evidence. Any real provider phase first needs authenticated authority, deployment review, a separate transport adapter, and preservation of M2 checkpoint/`UNKNOWN` invariants.
