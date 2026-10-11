# Failed Recap recovery (Phase 22.1)

## Cause and scope

The Recap header excluded failed jobs from Generate/Regenerate, while ordinary
`POST /api/movies/{movieId}/recap/generate` rejected the retained deterministic
job with `RECAP_JOB_FAILED`. Restarting a worker does not move a terminal failed
job into the waiting queue. Failed job state lives in BullMQ; Prisma stores the
successful recap and its evidence, not a separate failed-generation record.

The existing tabs and layout remain unchanged. Failed state now offers
**Retry Generation**, the existing paid-action checkbox, and **Refresh Status**.
The selected movie remains explicit, including an older movie selected by
`?movieId=...`. Missing prerequisites/configuration disable or replace generation
actions and explain the problem.

## Explicit recovery contract

`POST /api/movies/{movieId}/recap/generate/retry`

```json
{
  "jobId": "recap-<movieId>-<current-source-sha256>",
  "failureToken": "<finishedOn>:<attemptsStarted>:<attemptsMade>",
  "acknowledged": true
}
```

Only these fields are accepted. The token is a failed-attempt version, not an
authorization credential. Status GET returns it only for a recoverable failed
attempt. The service validates the current source, model/provider configuration,
job identity, and movie/source payload before attempting queue mutation. No
provider request occurs during submission. The worker makes any paid requests
after explicit submission, using the existing generation/validation pipeline.

Recovery reuses the original source-hash job ID and unchanged source payload.
An atomic Redis precondition checks the failed set, failure version and absence
of a job lock, then executes BullMQ 6's existing `reprocessJob` script. Exactly
one concurrent request moves that failed attempt to waiting. Duplicates reuse
waiting/active/completed state. A delayed request cannot retry a subsequent
failure; that requires a new status read and new confirmation.

The existing three-attempt exponential-backoff budget resets for the explicitly
authorized run. The cumulative `attemptsStarted` counter remains monotonic.
Strict invalid-response failures remain terminal and are never auto-repaired.
Waiting/delayed/active lead to completed or failed through the existing worker.
Globally paused queues can report waiting in BullMQ 6 while consumption pauses.

Controlled errors include `RECAP_RETRY_INVALID`,
`RECAP_RETRY_CONFIRMATION_REQUIRED`, `RECAP_RETRY_UNSUPPORTED`,
`RECAP_RETRY_STALE`, existing prerequisite/configuration errors and
`RECAP_SOURCE_CHANGED`. Missing/pruned jobs or missing safe version metadata do
not cause automatic replacement. Refresh the page for changed source data;
ordinary generation still handles a new source hash.

## Preservation and read-only behavior

- No database writes occur in the retry service. Saved recap/evidence remain
  available during queueing, execution and failure. Existing transactional
  persistence replaces data only after successful strict validation; existing
  worker receipt recovery can reuse an already saved matching recap.
- Existing safe `RECAP_INVALID_RESPONSE` logs remain attached to the same job.
  The retry script removes the current failed reason/finished timestamp as
  BullMQ normally does; it retains diagnostic log entries and stack history.
  Old jobs without structured diagnostics cannot recover historical details.
- Status returns an allowlisted error code and fixed message, never provider
  response bodies, paths, SDK messages or credentials.
- GET, page rendering, Refresh Status, polling and worker restart never retry.
- Client submission is synchronously fenced against double clicks. Confirmation
  clears after submission/error. Polling starts from the POST receipt, aborts on
  unmount, and stops at terminal state or 150 checks; Refresh Status can resume
  status checks without submitting work.
- This remains trusted-local operation, not authenticated public authorization.

## Offline verification

```sh
node --conditions=react-server --import tsx tests/recap/recovery.test.ts
node --conditions=react-server --import tsx tests/recap/response-diagnostics.test.ts
node --import tsx tests/recap/recovery-ui.test.tsx
node --conditions=react-server --import tsx tests/recap/recovery-redis.test.ts
```

The Redis test starts/removes its own temporary socket-only Redis server; it
does not use configured application Redis or PostgreSQL. The browser fixture
uses a separately provided existing Playwright runtime via `PLAYWRIGHT_MODULE`
and a built webpack stylesheet. Run `node tests/recap/recovery-browser.test.mjs`
with that variable to exercise intercepted synthetic responses at
1440/1024/390px. No real recap job, source data or paid provider is used.

The atomic adapter imports BullMQ's installed script and must be checked with
the isolated Redis test when upgrading BullMQ. Existing queue retention limits
still apply. Worker operational readiness is not guaranteed by submission; a
waiting job requires the normal recap worker to be running.

## One manually authorized live retry

1. Ensure the recap worker is running the current validation diagnostics code
   and reports ready; use the normal operator startup/restart procedure.
2. Open `/projects/test/recap?movieId=b00f2fba-7f2f-4019-b8b2-02f7e4d15a97`.
3. Confirm the selected movie is `test.mp4`, prerequisites are available and
   the job is failed. **Refresh Status** only reads state.
4. After authorizing the paid operation, check the OpenRouter paid-token
   acknowledgement and click **Retry Generation once**.
5. Observe waiting/Generating, then completed or failed. A very short job may
   skip an observable intermediate state. Keep polling or use Refresh Status;
   neither submits again.
6. If it fails, inspect the safe diagnostic event correlated with that job ID.
   Do not automatically retry or weaken evidence validation. Any further paid
   attempt requires another explicit acknowledgement/action.

Implementation/testing does not perform these live steps.
