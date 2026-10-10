# Phase 21.2A — Video render foundation

This is a trusted-local backend foundation. It does not expose a render API,
dispatch jobs, run a render worker, encode video, serve downloads or change UI.
It makes no multi-user/public security claim. Existing subtitle downloads are
unchanged; they now share the same pure selection helper with snapshots.

## Contracts and data

`lib/video-render/contracts.ts` accepts exactly five fields: database `projectId`,
database `movieId`, `mode: BURN_IN`, `scope: ALL_CURRENT | APPROVED_ONLY`, and
`profileId: myanmar-mp4-cpu-v1`. Slugs are for navigation, not database identity.
No path, codec, filter, FFmpeg arguments, font or arbitrary settings are accepted.
The fixed versioned profile reserves CPU libx264/H.264, yuv420p, medium/CRF 20,
AAC 192k when audio exists, MP4 faststart and existing ASS serialization.
Actual Myanmar font availability requires a future worker preflight.

`RenderJob` belongs to Movie; project scope is checked through that relationship
and recorded in its immutable snapshot. Unique `(movieId, recipeHash)` prevents
duplicate content recipes. Indexes support per-movie history and state polling.
QUEUED, ACTIVE, COMPLETED, FAILED and CANCELLED are explicit states. The pure
transition contract permits queued→active/failed/cancelled, active→completed/
failed/cancelled, failed/cancelled→queued. Lifecycle execution and generation
increments on retry are future worker responsibilities; the foundation never
resets a retained job. Generation/attempt counters, cancellation request and
lifecycle timestamps are reserved now. Failure codes are enumerated; raw process
errors, paths or credentials must never be persisted as client error messages.

`RenderOutput` is an optional one-to-one verified-file receipt: unique private
storage key, safe download filename, MIME, SHA-256, bytes, duration, dimensions,
codecs and verified timestamp. No output record is created in this phase.
Future publication must verify the actual file before creating that receipt;
the schema alone cannot prove disk existence. Movie deletion cascades render
records, preserving current DB deletion behavior. Private-file cleanup is still
a future worker/reconciliation responsibility.

## Immutable snapshots

`createRenderJobSnapshot` is an internal explicit-write service, unused by pages
or routes. It captures a coherent Repeatable Read translation/transcript view,
then releases the transaction before probing and streaming source bytes. A short
Movie-locked transaction rechecks project/source-key binding and upserts the
QUEUED record. No queue exists yet. Translation, transcript, human review, QC and
Translation Memory are read only throughout this process.

Snapshots contain:

- Capture timestamp, schema version, project/movie identity and fixed recipe.
- Real private source key, SHA-256, byte count and probed video dimensions,
  duration and audio presence. No absolute server paths or environment values.
- Translation/transcript IDs, revision, languages and historical provider/model.
- Exact selected original target text plus line-ending-normalized subtitle text,
  sequence, Chinese source, unchanged milliseconds, origin, refinement identity,
  segment revision, manual source hash, review/edit timestamps and frozen QC.
- Review counts over all rows, including rows omitted by Approved Only.
- Exact UTF-8 SRT/ASS bytes as base64, byte lengths and SHA-256 checksums.

All Current includes every current target. Approved Only includes explicitly
APPROVED rows without closing approval gaps or moving timestamps. Existing ASS
centisecond flooring and escaping are reused. Human targets are authoritative;
stale manual source hashes/alignment are rejected. QC remains advisory: findings
are captured without scanning, resolving, approving or rejecting based on QC.

The canonical SHA-256 recipe includes project/movie, mode/scope, all fixed profile
settings/version, actual source key/content/metadata, selected source/target text
and timing, and exact subtitle checksums. Sol content changes invalidate identity
even if translation revision or refinement generation is unchanged. Capture
timestamps, generated IDs, revisions and audit-only review/QC/provenance changes
are excluded from content identity. Consequently identical output inputs reuse
the **first** snapshot and its historical audit metadata; reuse never establishes
current approval or current QC. An approval change affecting Approved Only's
selected rows does change its recipe. Profile/font/serializer policy changes
require a new version and a deliberate schema/profile constraint update.

Runtime snapshots are deeply frozen copies. PostgreSQL rejects updates to stored
snapshot, recipe hash, Movie binding, mode, scope or profile using an immutable
snapshot trigger. No FK ties snapshots to replaceable translation/transcript rows.
The migration only creates new types/tables/indexes/constraints/function/trigger;
it does not rewrite or delete existing records. Custom SQL checks and the trigger
must be preserved in future migrations (they are not expressed by Prisma alone).

## Source safety and limitations

The existing private LocalStorageProvider validates generated movie keys, ancestor
directories, regular files and symlinks. Hashing opens with O_NOFOLLOW; FFprobe
uses existing forced local-container arguments, file-only protocols, bounded
output and timeout. Missing, empty, corrupt or video-less media fails safely.
File identity, size and modification/change timestamps are compared around the
probe/hash read to reject observed source replacement. Actual bytes are hashed,
not the nullable Movie file-size/duration metadata.

This is not protection from a privileged local filesystem writer. A future
worker must revalidate the frozen source checksum before encoding, use a private
per-attempt staged input, and verify profile/fonts/FFmpeg runtime. Snapshots do
not copy or retain source video bytes. Source removal after snapshot creation
will prevent a future render; it must produce a controlled failure.
Current Movie API storage-key reassignment remains trusted-local behavior;
project relationship checks are not authentication or tenant authorization.

## Verification

No new test dependencies or package scripts are required. With the repository's
Node runtime on PATH:

```sh
node --conditions=react-server --import tsx tests/video-render/snapshot.test.ts
node --conditions=react-server --import tsx tests/video-render/source-media.test.ts
RUN_RENDER_DB_TESTS=1 node --conditions=react-server --import tsx tests/video-render/database.test.ts
```

Each file registers and runs Node's built-in `node:test` cases directly, avoiding
the Node/tsx subprocess runner's file-only reporting in this environment.
The opt-in DB integration requires the additive migration and a real existing
uploaded movie. It creates only temporary projects/transcript/translation/render
records, reads an existing movie source without modifying it, and deletes only
its temporary identities. It verifies original project/movie records and domain
record counts after cleanup. No provider, encoding, queue or API calls are made.

## Exact next step

Implement the dedicated render queue and worker lifecycle using persisted job ID
and generation, explicit POST submission, guarded state/attempt ownership,
durable dispatch reconciliation, bounded CPU concurrency, cancellation/timeout
handling and private staging/cleanup. The worker must consume the stored ASS bytes
and verify their checksum plus the frozen source identity before encoding.
Keep the approved UI untouched until a separate UI task is authorized. Secure
scoped downloads and output publication require separately implemented disk/path
verification; no file availability may be inferred from a job state alone.
