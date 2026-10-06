# Production runbook

## Release gate

This is a deployment foundation, **not permission to expose the application publicly**. Authentication, per-resource authorization, CSRF protection, abuse limits and budget controls are not implemented. IDs and slugs are not authorization. Until those controls exist, use a private network or a trusted access gateway that protects every page/API, including uploads, paid actions, reads and exports. An IP allowlist alone is not multi-tenant isolation.

No GPU, local AI model, recognition or diarization service is required. OpenRouter is the external processing provider; assess consent, retention and data handling before uploading sensitive media. Use HTTPS at the ingress; do not enable wildcard CORS.

## Services and ownership

| Service | Canonical/operational responsibility |
| --- | --- |
| Next.js web | UI, API, upload acceptance and FFprobe validation; no AI calls on page render |
| PostgreSQL | Projects, Movie metadata, transcripts, translations, manual review, TM/glossary, QC, scenes, characters and recaps |
| Private storage | Movie and extracted audio/media files; never serve the root through the web server |
| Redis/BullMQ | Queue/job operational state; not canonical subtitle/analysis content |
| OpenRouter | External paid text/audio processing, not the application's system of record |

Deploy one web service plus independent worker services, sharing PostgreSQL, Redis and private storage. Isolate resource-intensive media/scene workers from web latency. Workers may initially share a host, but must be separate supervised processes. Start only the workers you need. Protect DB/Redis on private networks, use TLS where appropriate, and allocate DB pools across **all** web replicas and workers, not just one process. Prisma remains one lazy singleton per process; the adapter's default pool is retained, with a 2-second connection timeout. Size infrastructure for its connection count; do not launch a client per request.

| Role | Command | DB/Redis | Storage | FFmpeg/FFprobe | AI configuration |
| --- | --- | --- | --- | --- | --- |
| Web | `pnpm start` | yes | yes | yes, uploads are probed | none at startup; paid endpoints validate their provider |
| Media | `pnpm worker:media` | yes | yes | yes | none |
| Transcription | `pnpm worker:transcription` | yes | yes | yes, audio chunking | key + `TRANSCRIPTION_MODEL` |
| Translation | `pnpm worker:translation` | yes | no | no | key + `TRANSLATION_MODEL` |
| Refinement | `pnpm worker:translation-refinement` | yes | no | no | key + `TRANSLATION_REFINEMENT_MODEL` |
| Scene | `pnpm worker:scenes` | yes | yes | yes | none; numeric scene settings validated |
| Character | `pnpm worker:characters` | yes | no | no | key + `CHARACTER_ANALYSIS_MODEL` |
| Recap | `pnpm worker:recap` | yes | no | no | key + `RECAP_MODEL` |

## Environment and startup

Inject secrets at runtime from your platform's secret store, or an owner-readable untracked environment file on a trusted host. Do not bake `.env`, credentials or media into an image; never use `NEXT_PUBLIC_` for secrets. Existing variable names and `dotenv` workflow are retained. `.env.example` groups DB, Redis, storage, provider, models, scene thresholds and shutdown policy. Benchmark model variables are optional and not needed in deployed services.

Production requires explicit `DATABASE_URL`, `REDIS_URL`, `STORAGE_DRIVER=local` and an **absolute** `LOCAL_STORAGE_ROOT` on a persistent private volume. Development defaults to the existing `storage/` directory when storage settings are omitted. Unknown drivers, malformed URLs, public/build-directory roots, missing role-specific models, invalid OpenRouter base URLs and invalid numeric configuration fail startup. OpenRouter URL is restricted to HTTPS `openrouter.ai/api/v1`; credentials/query fragments/alternative hosts are rejected. No paid provider request is used as a health check.

`instrumentation.ts` validates web configuration and initializes private storage before serving. Build phase does not run runtime validation. Live dependencies are checked by `/api/ready`, so the liveness endpoint does not become a dependency outage detector. All seven worker commands use a shared bootstrap: validate role → initialize needed storage → read-only DB check / Redis PING / needed binary checks → import and accept jobs. Startup failure exits nonzero with controlled logs; no half-ready worker consumes jobs.

## Health and shutdown

- `GET /api/health`: liveness only, quick `{status:"ok"}`, no dependency queries.
- `GET /api/ready`: 200 ready / 503 not ready; component states for database, Redis, storage, FFmpeg and FFprobe only. No hosts, paths, stack traces or credentials. Each check has a 4-second response deadline. DB health uses read-only `SELECT 1` in a transaction with 2-second pool wait / 3-second transaction deadline. Redis uses PING with 2-second connection/command limits and always closes its owned connection. Binaries use `execFile -version`, no shell, 3-second timeout.
- Storage readiness verifies existing real private directories and access permissions. It creates no probe file per request. Startup creates the root/movie/audio directories if absent and enforces directory mode 0700; files are 0600. Volume must be owned by the runtime UID and support normal filesystem semantics.
- Workers emit structured `worker_ready` after preflight and BullMQ readiness. Web readiness does **not** prove every worker is running; supervisors must watch worker process status, ready logs and queue lag.
- SIGINT/SIGTERM stop accepting jobs and drain active work, close the BullMQ worker and its owned connections, await media terminal-state events, then disconnect Prisma. Fatal worker-level errors exit nonzero after controlled drain. Job processor failures retain existing bounded retry policy.
- `WORKER_SHUTDOWN_TIMEOUT_MS` defaults to 120,000; configure a longer drain window for long scene/media/AI jobs (maximum 6 hours). Supervisor/container stop grace must exceed this setting and terminate the entire process group/container, including FFmpeg children, after the deadline. Deadline exit is nonzero; abandoned jobs may be stalled/retried and repeat paid work. Never treat SIGKILL as a clean drain.

## Storage and upload policy

Only the local adapter is implemented. Web/media/transcription/scene processes must mount the **same persistent private volume** at the configured root. Without a persistent volume, media disappears when a container is replaced. Multi-host local mode needs a shared POSIX filesystem supporting atomic hard links/rename; unrelated per-host directories are not a valid deployment.

Keys are constrained to generated movie UUIDs with allowed extensions and validated audio IDs. The adapter rejects traversal, absolute keys, root/ancestor/directory/file symlinks and nonregular files. It supports put, exists, stat, open, delete and scoped input resolution. Writes stage in unique private directories and publish atomically; failed writes clean up in `finally`. Exclusive creation refuses overwrites; explicit replacement is atomic. Trust and restrict storage ownership: filesystem validation is not protection against a privileged host administrator changing files between checks. Local FFmpeg input resolution avoids copies. Audio extraction/chunking retain their existing private temp directories and cleanup.

A future S3-compatible adapter should use private buckets, narrow credentials and encryption; fetch an input into a unique 0700 local workspace, run FFmpeg, publish output, then clean up in `finally`. Object storage needs a staging capability, not a pretend filesystem path. Current extraction/chunk helpers are explicitly local-capability workflows; no cloud adapter or cloud credentials are included.

Uploads remain limited to 512 MiB plus 64 KiB multipart overhead. Declared length and actual bytes are bounded, extensions restricted to MP4/MKV/MOV/WebM, filename controls/path parts stripped, label/language/filename lengths bounded, and MIME treated as a hint. Stored content is probed with forced local container/protocol settings before acceptance; missing audio/corrupt content produces controlled errors and compensating file/DB cleanup. FFprobe limits processing but is not a malware scanner. Keep media tools patched via image maintenance.

Next's multipart parser may buffer accepted uploads. Enforce the **same or smaller** body limit, request/upload deadlines, connection limits and upload concurrency at ingress. Do not expose Next directly to untrusted clients without those limits. General JSON mutations use a 64 KiB actual-byte limit, even without Content-Length. Existing edit/glossary/TM length limits, review-list bounds and 24-segment refinement selection remain. Oversized JSON retains repository-consistent controlled invalid-body errors (400), multipart oversize returns 413.

## Paid endpoints and queue semantics

High-cost actions: project upload, movie process-media/transcribe/translate/translation-refine/characters-analyze/recap-generate. All paid provider work is behind explicit POST + workers; page reads and job polling are free. Put authentication, authorization, CSRF checks, per-user quotas and Redis-backed/request-gateway rate limits **before** these actions for public use. No ad hoc IP limiter was added that could imply security without identity.

Queues retain up to 1,000 completed and 1,000 failed jobs each (counts, not time guarantees); cleanup may be lazy. Media/transcription/translation/scene use stable Movie IDs. Refinement uses selection/source/revision identity; character/recap use source hashes. Repeated retained completed jobs reuse completion; retention eviction permits re-submission. A changed source does not automatically change those stable Movie job IDs: inspect/remove only the relevant inactive retained job when an intentional rerun is needed. Refinement and character/recap can recover committed results after receipt failure. Earlier transcription/translation do not have equivalent durable per-batch checkpoints, and any pre-commit paid call may repeat after a crash or retry. Do not promise exactly-once paid processing or automatically retry failed jobs in incident scripts.

Retries remain three attempts, exponential 2-second base backoff, concurrency 1, stalled interval 30 seconds and at most one stalled recovery. Provider timeouts: STT 65 seconds, translation/character/recap 120 seconds per request. FFprobe 30 seconds; extraction/chunking 15 minutes; scene detection dynamically ranges 5 minutes–6 hours. Long multi-request jobs have no global cost/time ceiling or durable per-chunk checkpoint. Use supervisor/resource limits and budget alerts; do not kill legitimate long jobs with short deployment grace periods.

BullMQ worker connections require `maxRetriesPerRequest=null`; producers use bounded retries/offline queue disabled. API queue instances close in `finally`, worker-owned connections close with Worker. Readiness creates and disconnects one short-lived PING connection. Redis must use `maxmemory-policy noeviction` for BullMQ; provision capacity and persistent storage/AOF as appropriate rather than silently dropping jobs.

## Deploy

1. Provision private PostgreSQL with automated backups/PITR where supported; test restore.
2. Provision private Redis with appropriate persistence, capacity and `noeviction`.
3. Provision private persistent shared media storage; set ownership for runtime UID 1000 in the image.
4. Build one image with the locked dependency tree; inject runtime environment separately.
5. Run **once per release**: `pnpm exec prisma migrate deploy` using the new release image and production DB configuration. Never `migrate dev` or reset in production. Review additive/destructive migration risks and backups before release. Do not run seeds automatically.
6. Start web with `pnpm start`, not `next dev`; place behind HTTPS ingress/access protection and request limits.
7. Start each selected worker using the command matrix and role-specific environment.
8. Gate web traffic on `/api/ready`; verify workers are ready and queues are draining.
9. Smoke-test existing transcript/translation/scenes/characters/recap/export reads without paid AI calls; verify private/no-store and safe download headers.

Docker: `docker build -t movie-translator:release .`. The Dockerfile uses Node 24, pinned pnpm 12.3.4, FFmpeg/FFprobe, frozen-lockfile install, Prisma generation and a verified webpack production build. It includes the existing tsx/Prisma CLI dependencies for workers/migrations. No standalone output is enabled: workers and generated Prisma files remain present. Non-secret build-only URL placeholders are discarded with the build stage; runtime requires real injected values. Prefer pinning the base image to a reviewed digest in your deployment system and scan the built image; image reproducibility also depends on base/OS package repositories.

Run the same image with command overrides, e.g. `pnpm worker:translation`. Docker HEALTHCHECK is web liveness only; **disable/override it for worker containers**, whose readiness is startup/process/queue monitoring. Set stop grace and persistent volume correctly. Docker/Compose, systemd or a managed container platform are all viable; no PM2/Kubernetes assumption. Use a supervisor to restart nonzero exits with backoff rather than an infinite tight loop.

The image entrypoint maps `pnpm start` and the seven `pnpm worker:*` commands to their existing Node entry points. Tini forwards signals and waits for that application process directly; package-manager wrappers must not exit before asynchronous worker draining finishes. Signals target the application, not the entire process group, so active FFmpeg children can finish while the worker drains. Other command overrides (including Prisma CLI commands) pass through normally. The shared base stage caches pnpm's native binary for offline CLI use, and dependency installation copies the existing `pnpm-workspace.yaml` build approvals before running the frozen install.

## Rollback and incidents

Application rollback: stop/drain workers, switch to a previously validated compatible image, then resume. Database migrations are not automatically reversible; prefer forward repair or a reviewed restore plan. Never reset DB or remove migration records to make an old release run. Check schema compatibility before rolling back code.

Incident: pause job intake and affected worker processes, inspect safe structured logs/queue state, preserve PostgreSQL and media first, then reconcile individual jobs. Do not delete Redis jobs blindly, clear canonical data or rerun every paid task. Verify source hashes/revisions and manual-authority protection before retrying. Stalled recovery may incur provider costs.

Backups: PostgreSQL automated backups/PITR plus restore drills; private media volume snapshots now, object-storage versioning/lifecycle later. Back up DB and storage consistently enough to reconcile references. Redis persistence helps job recovery but cannot replace canonical DB/media backups. Restore-test media access, current subtitle/manual state and source-based analysis freshness.

## Observability and known limitations

JSON logs allow only safe metadata: event/level/time, worker/job IDs, attempt, stable error code, model, runtime, numeric tokens and cost. No prompts, bodies, credentials, raw provider replies, binary stderr or local full paths. New health endpoints expose component states only. No request-correlation layer or external telemetry vendor is introduced; add those with an access-control rollout if needed.

Monitor queue depth/age, job latency/failure/stalls/retries, worker availability, provider latency/tokens/cost, FFmpeg duration, DB/Redis errors, storage failures/capacity and backup age/restore success. Aggregate safe provider receipts; cost is omitted when a provider does not report it, never guessed.

Known: PostgreSQL adapter concurrent `client.query()` deprecation warning is tracked; no speculative dependency upgrade. Turbopack's port-binding failure in this restricted environment is separate from application code; webpack is the verification/build path here. Local storage/shared-volume requirements, lack of auth/access control/abuse controls, no durable AI chunk checkpoints and nontransactional DB/storage/Redis boundaries remain real operational constraints. This phase has no schema migration, cloud storage implementation, deployment or paid AI test.
