# Storyline M2-02C contract and SQL alignment

**Status:** review-only pure contracts, draft Prisma/SQL and synthetic tests. No live Prisma schema or migration changed, no application database was used, and no paid operation or role gateway was enabled. The M2 draft SQL still ends in `ROLLBACK` and is applied only in a process-owned disposable PostgreSQL cluster.

## Root causes and chosen state machine

M2-01 treated every pre-checkpoint retry as a new task generation, while M2-02 SQL reserved generation changes for terminal retries. M2-01 permitted a definitive UNKNOWN cancellation resolution that SQL omitted. The architecture also left grant consumption ambiguous; M2-02 consumed at admission. Separately, the M1 role draft's `ON ALL TABLES` grant could have covered M2 tables when applied later. Finally, older architecture text used `RESPONSE_STORED` and decimal USD while the tested draft uses `RESOLVED` and integer USD micros.

| Operation | Pure decision | Review SQL constraint | Authority and result boundary |
| --- | --- | --- | --- |
| Initial admission | QUEUED, generation 0 | Insert guard requires QUEUED/0/revision 0; logical `(studioId,kind,recipeHash)` unique | Explicit authenticated acknowledgement and consumed grant are **future service requirements**; SQL alone cannot authenticate |
| Lease | QUEUED → LEASED | Task guard; dispatch/current-generation guard | Future CAS must check task generation, stateRevision, owner and lease |
| Pre-checkpoint retry | LEASED → QUEUED, **same generation** | Requires no checkpoint, current consumed grant, cleared lease and atomic increment of `preSubmitAttempts`, at most 3 | No new spending authorization or provider send; delay policy remains runtime work |
| Retry exhausted or grant expired | LEASED → FAILED without checkpoint | Terminal transition allowed without result only when no checkpoint | Expiry cannot be extended or silently replaced; new attempt needs explicit fresh acknowledgement |
| Checkpoint | LEASED → SUBMITTED | Unique `(taskId,generation)` and confirmation ID; live owner/lease, unexpired consumed grant, no cancel and global unresolved slot | Checkpoint must commit before any one-use send permit; pure decision never grants the permit |
| Unknown result | SUBMITTED → UNKNOWN | Submission SUBMITTED → UNKNOWN and task transition require corresponding checkpoint | No resend, timeout release or charge assumption |
| Definitive original result | SUBMITTED/UNKNOWN → COMPLETED or FAILED | Immutable result inserted **before** submission RESOLVED; task transition then requires that resolved result | Revalidate current source before publication; result is not script approval or M1 verification |
| Cancel before checkpoint | QUEUED/LEASED → CANCELLED | Checkpoint insertion rejects a cancelled task | No provider call; explicit retry requires fresh grant/new generation |
| Cancel after checkpoint | Sticky cancel request; after definitive result → CANCELLED | UNKNOWN/SUBMITTED → CANCELLED only with pending cancel plus original stored result and RESOLVED submission | Cancel flag alone neither terminates remote work nor releases the global slot; cancellation wins only if recorded before terminal task resolution |
| Definitive terminal retry | FAILED/CANCELLED → QUEUED, generation +1 | No unresolved submission; a **new consumed, unexpired grant for next generation** must be bound before task advances | Fresh authenticated acknowledgement required; prior checkpoint/grant is never reused |
| Duplicate logical recipe | Return existing task without state change | Unique logical task identity | Future service must compare exact canonical bytes and scoped idempotency/authority; hash alone is insufficient |

Every task update in the draft requires `stateRevision + 1`. This is a database shape guard, **not** caller CAS. Future services must include expected revision/generation/owner predicates and check exactly one affected row. Pre-checkpoint retry increments the dispatch counter in the same task transition; new generation resets that counter on its dispatch row. Historical submission/result/event rows retain old generations. The global slot is a unique partial index on `SUBMITTED` and `UNKNOWN`; it releases only after a result row exists and the original submission becomes `RESOLVED`. A definitive result may have UNKNOWN or PARTIAL accounting when provider usage is unavailable.

## Confirmation lifecycle

1. **Prepared:** a server-origin proposal binds selected project/movie/Studio, exact recipe and source/script/profile/revision, versioned quote, one generation, authority reference and at most five-minute expiry. The pure parser checks structure only and returns `authorizesProviderSubmission: false`.
2. **Authenticated and approved:** a future distinct spending authority must verify the operator/session, exact scope and explicit acknowledgement. M1 source-verification authority is unrelated. No such authority exists in the running application.
3. **Consumed:** the reviewed SQL permits PREPARED → CONSUMED once, bound to one task/generation and before expiry. The proposed admission service must perform this atomically with task/outbox creation. A rollback leaves the grant unconsumed. A consumed grant can support bounded **same-generation** pre-checkpoint redispatch only while unexpired; it cannot authorize a second checkpoint.
4. **Expired or invalidated:** expiry is checked at consumption, redispatch and checkpoint. Source, media, translation context, Studio revision, profile or quote changes fail future service currentness checks; immutable historical rows remain. An expired grant cannot be refreshed in place or substituted into the same generation. The task fails safely without a provider call.
5. **New generation:** only a definitive terminal FAILED/CANCELLED task with no unresolved submission may bind a fresh prepared and authenticated decision, consume it for generation +1, then advance the task. Fresh human acknowledgement is required even if the logical recipe is unchanged. SQL constrains binding/expiry, while authentication remains a separate unresolved gate.

## UNKNOWN, cancellation and accounting

`UNKNOWN` is a task state and a provider-submission state; neither means an original result is definitive. The result row must be bound to the original checkpoint and stored before its submission is marked `RESOLVED`. A cancellation request made after checkpoint is sticky but cannot move UNKNOWN to terminal by itself. Once original-request evidence is definitively validated, a prior cancellation request yields terminal CANCELLED with result and cost history retained. Without that request, a valid/current candidate may complete; invalid or stale publication fails. Concurrent cancellation and result transactions are serialized by task row updates: a cancellation that commits first prevents a subsequent COMPLETED/FAILED transition; terminal completion that commits first rejects a later cancellation request. No second provider request is permitted by reconciliation.

The submission state names are `SUBMITTED`, `UNKNOWN`, `RESOLVED`; task states are separate. Store quote/estimated exposure in bounded **integer USD micros** separately from result `reportedUsdMicros`. Result usage is `REPORTED`, `PARTIAL` or `UNKNOWN`, with absent values `NULL`, never fabricated zero. No live model, price or hard cost cap is approved.

## Effective role boundary tested

The review-only M1 role script now grants runtime rights to an **explicit existing-table list**, never `ALL TABLES`. M2 draft revokes PUBLIC rights and grants no direct nonowner M2 DML. Tests apply baseline + M1 + both review scripts in each order using process-owned PostgreSQL 18 and fresh restricted logins.

| Principal | Effective draft M2 table rights after either order | Limits |
| --- | --- | --- |
| Executing migration/schema owner (disposable administrator) | Owns six draft M2 tables; can read/write/alter them | Must never be an application/worker credential; production owner/grant mapping remains to be designed |
| Normal runtime | No direct SELECT/INSERT/UPDATE/DELETE on six M2 tables | Existing M1/legacy rights are separately enumerated; no M2 safe view exists yet |
| Admission gateway role | No direct M2 table rights | Proposed role only; no EXECUTE gateway is installed |
| Checkpoint worker role | No direct M2 table rights | Proposed role only; no EXECUTE gateway is installed |
| M1 verification issuer | No direct M2 table rights or M2 gateway | Its M1 receipt gateway remains separate |

Negative login tests reject attempted M2 INSERT with SQLSTATE 42501 in both orders. They do **not** prove a future SECURITY DEFINER gateway, role membership/default ACL on an existing deployment, or an authenticated spending decision. Any live promotion needs distinct credentials and a separately reviewed narrow gateway implementation.

## Verification and remaining decisions

The synthetic suites cover pure transition parity, untrusted proposals, exact recipe/scope; isolated Prisma fragment validation; pre-retry bounds/generation, expiry, consumed-grant reuse, fresh terminal generation, UNKNOWN cancellation, result-before-resolution, global-slot races, cancellation/result race, stale revision, wrong movie/Studio, rollback and both ACL orders. M1 security/persistence regressions are required alongside these suites. No application database or provider is involved.

**Recommendation:** PASS for a separately authorized **fake-only M2-03 design/implementation against disposable infrastructure**; BLOCKED for real admission, deployment and paid activation. Remaining decisions are explicit product approval of the one-slot indefinite-blocking policy; authenticated spending authority and a durable decision/idempotency ledger; exact restricted roles/gateways and deployment order; fixed profile/model and quote/cost policy; audited original-request UNKNOWN investigation; and separate migration/activation approval. M2-02C does not start M2-03.
