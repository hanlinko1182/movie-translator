# Phase 21.2C — Local Myanmar burn-in execution

This section supersedes the historical Phase 21.2B execution boundary below.
Trusted-local **Linux** only; no public/multi-user authorization claim. UI v1.0,
seven other queues, subtitle exports, review/QC/manual-edit/TM semantics are unchanged.
No paid AI, GPU, soft tracks, blur/cover, TTS or recap video.

## Worker and compatibility

Run `pnpm worker:render` after migrations/generation. Existing DB/Redis/private
local storage settings are reused. No new environment variables or packages.
Provision system FFmpeg with libass/HarfBuzz/libx264/AAC, FFprobe, fontconfig
`fc-match`/`fc-query`, util-linux `flock`/`prlimit`, and installed **Noto Sans Myanmar**
regular. The app downloads nothing. The deployment must include the supervisor
script and existing tsx runtime. The existing container image may need system
font provisioning before running this worker; Docker/environment files are unchanged.
Startup checks DB/Redis, binaries/storage and a supervised one-frame font fixture.
Missing font/glyph coverage/complex shaping fails closed. Exact saved ASS bytes
are preserved, including styles; child-local fontconfig resolves its generic
family to the verified face. Other scripts depend on installed font coverage.
Font/FFmpeg versions can change MP4 bytes without changing the frozen recipe;
content identity is not cross-runtime byte reproducibility.

Fixed `myanmar-mp4-cpu-v1`: libx264 medium/CRF20, yuv420p, AAC192k when source audio
exists, MP4 faststart. One video, at most one mono/stereo audio stream. No synthetic
audio; other tracks/chapters are omitted. No seek/trim/shortest/resize/retiming.
Supported source: ≤6h, even dimensions16..3840×16..2160, ≤60fps, square/unspecified
SAR, zero rotation, progressive/unspecified field order, SDR-compatible/unspecified
color tags, start offsets within100ms. Tagged HDR/wide gamut, rotated/anamorphic/
interlaced sources and multiple/surround audio are rejected. Untagged color cannot
prove SDR; inspect unknown-color material before relying on color accuracy.

The source must retain its Project/key binding, actual size/SHA/probed metadata.
It is resolved through the private provider, staged privately and hashed again.
Snapshot recipe and exact subtitle checksums are validated; execution never reads
current translations to regenerate/select/approve/modify subtitles.

## Explicit lifecycle operations and download

Existing POST/list/detail routes retain their contracts. Metadata adds phase,
progressPercent and cancelRequestedAt. `executionAvailable` means encoder support,
not file existence. Previously deferred jobs stay QUEUED/DEFERRED until explicit
resume. All IDs below are database IDs, including Project.

```http
POST /api/projects/{projectId}/movies/{movieId}/renders/{renderId}/cancel
{}
POST /api/projects/{projectId}/movies/{movieId}/renders/{renderId}/retry
{}
GET /api/projects/{projectId}/movies/{movieId}/renders/{renderId}/download
```

Operation bodies must be an empty JSON object, bounded128bytes. Queued cancellation
is CANCELLED when the shared CPU lock is available; otherwise it remains pending
until bounded reconciliation confirms quiescence. Active cancellation persists a request, polled within5s,
then the owner terminates/drains the child before committing CANCELLED. Already
cancelled is idempotent; completed/failed cannot be cancelled. Retry permits only
FAILED/CANCELLED or legacy deferred jobs, increments generation, resets the bounded
attempt budget and releases deferral before publication of the new queue ID.
It keeps the same frozen recipe. New source/subtitles require a new submission.
Neither repeated submit nor GET restarts terminal/deferred work.

Download scopes Project→Movie→Job→Output plus frozen Project identity; requires
COMPLETED and verified receipt. It checks regular file, size/SHA using O_NOFOLLOW
and streams that same descriptor. Missing/corrupt output returns410
RENDER_OUTPUT_MISSING. Attachment filename is generated/safe; headers include
video/mp4, measured Content-Length, private/no-store and nosniff. No range/resume
support; hashing before headers incurs large-file latency/I/O. No GET writes,
encodes or enqueues. No storage keys, server paths, stderr, tokens or secrets in
responses. This is relationship validation for trusted local use, not authorization.

## Execution, reliability and resources

The Phase B outbox, deterministic generation IDs, bounded reconciliation/backoff
and queue local/global concurrency1 remain. Owner token/live60s lease are required
for progress, candidate publication and completion; serialized5s control/heartbeat
poll aborts on cancellation or lost ownership/connectivity. Phases: preparing,
encoding, verifying, publishing. Bounded `-progress pipe:1` parsing uses verified
duration; percentage0..99 writes at most every2s and clears at terminal state.
COMPLETED indicates success. No ETA is invented.

QUEUED→ACTIVE→COMPLETED/FAILED/CANCELLED. Recoverable storage/lock failures and
shutdown requeue with new generation/backoff, at most3 claimed attempts. Invalid
source/snapshot/font/output, encoder failure and timeout are permanent for that
run. Explicit retry can start a fresh bounded budget. Expired owners are fenced
and requeued/cancelled, or FAILED at the attempt cap. Generation guards protect
publication; an inherited Linux flock independently prevents overlapping encoders
while an old process survives a lease. All render workers must share the same
private root and reliable local flock filesystem semantics. Lock conflicts consume
bounded retries; do not bypass the lock. No DB transaction spans encoding.

Separate supervisor process group: worker abort/shutdown or control-pipe EOF on
worker death sends group SIGTERM, then SIGKILL after2s; parent fallback after4s.
The supervisor waits after acquiring the OS lock for a fresh database ownership/
cancellation check before starting movie FFmpeg. Stale cancellation becomes terminal
only under the same OS lock, so a late old owner cannot start encoding afterward.
Arguments/filter/font config are fixed server-built arrays, shell disabled; child
environment excludes DB/AI credentials. Shared drain helper's optional pre-drain
hook is used only by render; other workers retain defaults. Deployment must supervise
the entire process group/container: simultaneous supervisor SIGKILL can leave a
descendant until normal exit/OS limits, while inherited flock still prevents
overlap. Leases are never treated as process termination.

Limits:2 video/decoder threads,1 filter/audio thread,4GiB address space,256MiB maximum
single FFmpeg allocation,24h wall/CPU budget,8GiB source. Disk headroom requires
source + `min(32GiB,max(256MiB,4×sourceBytes))` output budget +64MiB. FFmpeg/OS file
size limits enforce output budget. Concurrent unrelated disk writers can exhaust
headroom; process checks are not filesystem quotas/cgroups. Node/service memory
and total volume capacity need deployment limits separately.

Exit0 is insufficient. Verify regular nonempty MP4, one H264/yuv420p video with
source dimensions, AAC iff expected, measured SHA/size and full video/audio duration.
Tolerance=max(500ms,0.1% source), capped2s, allowing AAC padding/frame rounding.
This is not perceptual proof of every frame/sample. A durable verified publication
candidate precedes exclusive atomic publication to random `renders/{uuid}.mp4`;
file/directory are fsynced and published bytes/probe reverified. Owner-locked short
publication transaction rechecks the live lease immediately before the exclusive
same-volume file link; no large file copy occurs under that lock. A separate short
transaction rechecks Movie binding, creates Output then completes Job. Crash after
publication recovers via candidate/source revalidation in a new owned generation,
without encoding again. Missing/corrupt candidates never count as completion.
Stale workers cannot finalize or overwrite another attempt's random key.

Scratch dirs0700/files0600 are removed after drain. Failed/cancelled candidates
are detached under job lock before unlink. Reconciliation cleans terminal
candidates and old scratch/upload/orphan outputs after25h, in bounded batches;
successful Output/candidate keys are protected independently of Redis receipts.
Movie deletion still cascades DB receipts; aged orphan cleanup reclaims files.
Cleanup requires a running/restarted worker. Privileged filesystem writers remain
outside this trusted-local model.

Additive migration `20261010140000_add_render_execution`: nullable Job phase/progress,
Dispatch publication JSON, metadata CHECK and failure codes SOURCE_PROFILE_UNSUPPORTED,
MYANMAR_FONT_UNAVAILABLE, RENDER_RESOURCE_LIMIT. No records rewritten/deleted;
original snapshot/completion triggers preserved. Keep custom SQL guards in future
migrations. Existing failure codes remain; operation/download codes additionally
include RENDER_NOT_FOUND, RENDER_NOT_COMPLETED, RENDER_OUTPUT_MISSING,
RENDER_OPERATION_CONFLICT. No raw tool failures are exposed.

## Short-fixture verification

Run the historical foundation/queue commands below, plus:

```sh
node --conditions=react-server --import tsx tests/video-render/execution.test.ts
RUN_RENDER_EXECUTION_TESTS=1 node --conditions=react-server --import tsx tests/video-render/render-integration.test.ts
```

DB suites must run sequentially with local PostgreSQL/Redis and no production
render worker consuming temporary API jobs. Queue regression explicitly defers
its uploaded-media references before consuming; it never encodes uploaded movies.
Execution tests use six-/twelve-second synthetic media, random Redis prefix and
temporary records/private files; original Project/Movie records are checked after
cleanup. Visual QA MP4/PNGs remain in printed `/tmp/movie-translator-render-qa-*`.
Tests cover audio tone/full duration, cue/gap pixels, download checksums/scope,
publication crash, stale ownership, source mismatch/missing, font/shaping failures,
timeout, cancellation, shutdown and completion guards. No provider calls.
Sandbox process groups/local connections may require unrestricted local validation.

Next: separately approve integration of real render actions into the frozen Export
layout. Broader media profiles, public security, range downloads, deployment fonts/
quotas remain separate work. No soft subtitle/blur/recap pipeline is implied.

---

## Phase 21.2C change inventory

Created:

- `lib/video-render/cleanup.ts`, `download.ts`, `execution.ts`, `files.ts`,
  `fonts.ts`, `operations.ts`, `probe.ts`, `runner.ts`.
- `scripts/render-supervisor.ts`.
- `app/api/projects/[id]/movies/[movieId]/renders/[renderId]/cancel/route.ts`,
  `download/route.ts`, `retry/route.ts` (the same scoped parent directory).
- `prisma/migrations/20261010140000_add_render_execution/migration.sql`.
- `tests/video-render/execution.test.ts`, `render-integration.test.ts`,
  `crash-parent.fixture.ts`.

Modified:

- `.gitignore` (private render/scratch directories).
- `prisma/schema.prisma` (additive execution metadata/failures).
- `lib/env.ts` (render role only), `lib/storage/local.ts` (private render keys and
  fenced exclusive publication), `lib/worker-runtime.ts` (optional render drain hook).
- `lib/video-render/api.ts`, `contracts.ts`, `dispatch.ts`, `job-contract.ts`, `lifecycle.ts`.
- `workers/render-worker.ts`.
- `tests/video-render/queue-contract.test.ts`, `queue-integration.test.ts`.
- `docs/VIDEO_RENDER_FOUNDATION.md`, this lifecycle document.

No frontend, other worker/queue implementation, subtitle export route, snapshot
trigger/recipe implementation, dependency/lockfile or environment file changed.

## Historical Phase 21.2B — Deferred foundation (superseded above)

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
