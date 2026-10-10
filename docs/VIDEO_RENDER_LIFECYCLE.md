# Phase 21.2B — Durable render submission and worker lifecycle

Trusted-local backend only. There is no encoding, paid AI, TTS, GPU work, video
download or UI change. The Phase 21.2A recipe, immutable snapshot fields, subtitle
selection and serializers are unchanged. No existing queue changes its behavior.

## Explicit API

All identities below are database IDs, including `projectId`; project slugs remain
navigation identities. The existing route tree names that parameter `[id]`.

```http
POST /api/projects/{projectId}/movies/{movieId}/renders
Content-Type: application/json

{"mode":"BURN_IN","exportMode":"ALL_CURRENT","profileId":"myanmar-mp4-cpu-v1"}
```

Exactly those three body fields are required (2 KiB maximum). Export mode may
also be `APPROVED_ONLY`. No paths, arbitrary FFmpeg settings or identity overrides
are accepted. The existing strict foundation validator creates the snapshot.
The Movie must belong to the supplied Project. The response is `202 {data: job}`,
including for a retained identical recipe; inspect its state rather than assuming
it was restarted. FAILED, CANCELLED, completed and deferred jobs are never reset
by another POST. A Redis outage after commit still returns durable job metadata
when PostgreSQL remains readable. A lost HTTP response can be retried idempotently.

```http
GET /api/projects/{projectId}/movies/{movieId}/renders
GET /api/projects/{projectId}/movies/{movieId}/renders/{renderId}
```

GET is PostgreSQL-only and read only, with `private, no-store`. List returns
`{data:{items:[...],limit:50}}`, newest first; cursor pagination is not implemented.
Detail scopes render ID by Movie and Project; absent resources return controlled
404 errors. Malformed IDs/bodies return 400; unavailable infrastructure returns
a controlled 503. No raw exception is exposed.

Safe metadata includes identity, mode/exportMode/profile, persisted state,
generation, attempt count, lifecycle timestamps, controlled error code and execution
availability. It excludes snapshots, subtitle content, storage keys, server paths,
ownership tokens and credentials. No percentages, ETA, output-existence claim or
download link is fabricated.

## Durable dispatch

The additive `RenderDispatch` companion table holds dispatch intent/lease,
generation, retry timing, publication receipt time, active owner/lease/heartbeat
and deferral time. No Phase 21.2A columns or immutable trigger are replaced. The
migration backfills pending foundation jobs without rewriting them. Snapshot and
dispatch intent are committed in the same transaction before Redis is contacted.

- Queue: `movie-video-render`; job name: `render-video`.
- Payload: **only** `{renderJobId,generation}`.
- Deterministic BullMQ ID: `render-{renderJobId}-g{generation}`.
- Per-worker concurrency 1 and queue-wide global concurrency 1. Producers and
  worker startup establish the global limit before adding/consuming work.
- BullMQ retries: 3 attempts with exponential backoff starting at 2 seconds;
  retain up to 1000 completed/failed transport receipts.
- Producer connections reuse the existing 2-second connection/command bounds,
  disabled offline queue and bounded request retries. Worker connections reuse
  the existing blocking-worker Redis policy.

The render worker reconciles on startup and every 10 seconds after the previous
scan finishes. A scan handles at most 20 expired owners and 20 due publications
(internal hard maximum 50 each). It is safe to repeat and uses only the new
render table/queue. Dispatch claims have random tokens and 15-second leases.
Acknowledgements must match token, generation and live lease. Late publishers
cannot overwrite newer dispatch metadata. Duplicate Redis publication deduplicates
by deterministic ID; a stale generation cannot obtain database execution ownership.

Publication failures preserve the DB intent and schedule exponential retries
from 2 seconds up to 60 seconds, without a busy loop. Successful publication is
rechecked after 30 seconds while still queued, so lost receipts/Redis data can be
recovered. Terminal or corrupt receipts with a still-pending DB job produce a
controlled FAILED state, never automatic video success or infinite transport
retries. A worker already owning/defering the job wins the DB guard over a late
publisher's terminal-receipt observation. Restart the render worker after a
startup readiness failure; running workers retain the normal Redis reconnect
behavior. The web server does not run a background reconciler.

## Ownership and the Phase 21.2B execution boundary

Run `pnpm worker:render`. The shared launcher validates DATABASE_URL/REDIS_URL,
checks PostgreSQL/Redis readiness, and the render entrypoint checks dispatch schema
availability and global concurrency. No AI credentials, FFmpeg or source-storage
readiness is required by this **deferred lifecycle** worker. Those become worker
preflight requirements when actual execution is authorized in Phase 21.2C.

State path in this phase:

```text
QUEUED → ACTIVE (random ownership token, 60-second lease, attempts + 1)
       → QUEUED + execution DEFERRED / RENDER_EXECUTION_UNAVAILABLE
```

Heartbeat interval is 15 seconds. Owner operations require matching generation,
token, ACTIVE state and unexpired lease. Deferral is persisted atomically with
release of ownership. Deferred jobs are excluded from reconciliation and ignored
by duplicate delivery. They remain visible as deferred in GET and repeated POST;
they do not churn through retries while encoding is unavailable.

BullMQ can mark a **transport delivery** completed after the DEFERRED/IGNORED
receipt. This is not RenderJob completion. Nothing in this worker creates
RenderOutput or marks RenderJob COMPLETED. An additional database guard rejects
COMPLETED without a RenderOutput verified receipt; actual future disk verification
must happen before creating that receipt. The original snapshot trigger remains
independent and enforced.

Expired ACTIVE attempts are recovered with a new generation and cleared ownership,
or FAILED after 3 claimed attempts. Old tokens and queue messages are fenced.
This recovery is safe because Phase 21.2B never launches a media process. **Before
enabling encoding**, Phase 21.2C must terminate/fence an old FFmpeg process before
allowing another attempt. A lease alone does not terminate a child process.

SIGINT/SIGTERM stops scheduling reconciliation, drains the BullMQ worker, waits for
in-flight reconciliation, closes producer connections and disconnects Prisma.
Shared worker lifecycle supplies controlled logging and the existing shutdown
deadline. Queue processor errors use static codes; raw Redis/DB errors are never
persisted in API messages or logs. A worker runtime error follows the existing
fatal drain convention. Existing seven workers retain their current startup,
readiness and queue settings.

## Retry/cancellation and Phase 21.2C

No retry/cancellation endpoints are exposed yet. FAILED/CANCELLED remain terminal
under POST and reconciliation. The foundation's pure transition contract reserves
explicit retry; stale ACTIVE recovery is not restarting a terminal job.
The next subtask must implement coherent queued/active cancellation and explicit
retry/resumption of deferred jobs together with the FFmpeg process supervisor,
generation changes, output cleanup and ownership checks. This avoids advertising
cancellation that cannot terminate future rendering. Deferred jobs require that
explicit future resumption operation; deploying an encoder must not silently
start them.

Also deferred: immutable source staging/checksum revalidation, FFmpeg/font/media
preflight, CPU/resource limits, H.264/AAC encoding, real progress, verified atomic
output publication, stale child-process cleanup and secure scoped downloads.
Do not enable any of these by swapping this worker's DEFERRED return alone.

## Verification and known limits

```sh
node --conditions=react-server --import tsx tests/video-render/queue-contract.test.ts
RUN_RENDER_QUEUE_TESTS=1 node --conditions=react-server --import tsx tests/video-render/queue-integration.test.ts
```

Run the existing foundation tests as well. Integration requires migrated local
PostgreSQL, Redis and a real uploaded source. It uses temporary database records,
read-only original media, one cleaned-up private media copy, and a unique Redis
test prefix for worker consumption. Only the API test's known temporary job IDs
are removed from the actual render queue; other queues/records are not cleaned.
Original Project/Movie records and render/output counts are verified after cleanup.
No provider or encoder is used.

There is no authentication, tenant authorization, CSRF/rate-limit policy or claim
of public deployment security. Project scoping is relationship validation for a
trusted-local installation. Source files can disappear/change after submission;
future execution must reject mismatched source checksums. Current Movie deletion
cascades DB render records; future running children and private outputs need
supervisor/reconciliation cleanup. DB/Redis are at-least-once coordinated, not an
exactly-once distributed transaction. Reliable recovery requires the render worker
process to be supervised/restarted. Custom SQL guards/checks must be preserved in
future migrations; Prisma schema diff alone does not describe them.
