# Phase 21.2D — Export workspace integration

The existing Export composition now connects to the Phase 21.2C backend. Shared
styles, navigation, subtitle selection and backend execution are unchanged.
Trusted-local only; project/movie scoping is not multi-user authentication.

## Explicit controls

- Select Burn-in Video, All Current or Approved Only, and acknowledge CPU resource
  use before Start Render. Only BURN_IN / myanmar-mp4-cpu-v1 is offered.
- A project with multiple movies requires an explicit `movieId` selection before
  submission. The displayed movie can be confirmed with its scoped link. An
  explicit older selection never falls back to the newest movie. Invalid or
  cross-project selections are not found. Navigation preserves the selection.
- The server checks the source through the private storage provider without
  encoding, hashing whole movies or writing records. Missing/unchecked storage
  blocks new submissions. The backend revalidates at submission and execution.
- Start Render posts only mode, exportMode and profileId to
  `/api/projects/{databaseProjectId}/movies/{movieId}/renders`.
- Identical recipes return their retained job, including terminal/deferred jobs.
  Retry or Resume posts `{}` to `/{renderId}/retry`; it uses the original frozen
  snapshot. Cancel posts `{}` to `/{renderId}/cancel`. Pending cancellation stays
  visible until the backend confirms cancellation. Retry/resume also requires
  the CPU acknowledgement; cancellation never requires it.

## History, output and unavailable states

History GETs are read-only, scoped to the selected movie, and limited to the latest
50 recipes. Active/queued jobs poll every five seconds, sequentially, at most 100
successful checks per refresh. Three consecutive failures stop automatic checks.
Deferred and terminal jobs do not poll. Requests and timers abort on unmount;
mutations abort stale history reads. Refresh status explicitly restarts checking.
Only persisted active progress is shown; there is no estimated completion time.

Completed jobs are labeled **historical snapshots**, because current metadata
cannot prove a match to current source/subtitle content or current approvals.
Download links use `/{renderId}/download`, disable prefetch and use native browser
downloads, avoiding full-video blobs in client memory. The backend checks the
receipt and actual disk checksum on every download. A historical COMPLETED state
does not guarantee the file still exists. Download failures are controlled API
responses handled by the browser; they are not a separate UI download-error toast.
Output Files offers the newest completed recipe within the loaded history;
other loaded completed recipes remain downloadable from Export Queue.

No movie, no translation, no approved rows, missing source, no jobs, deferred work,
queued/active work, failure/cancellation, and backend load failures retain honest
messages. Recap video, soft subtitles and blur/cover are unavailable. SRT/ASS
remain current-text exports, independent of video snapshots. GET, page rendering,
format/scope selection and checkbox changes never submit work or call AI providers.

## Verification

With the repository Node runtime on PATH and installed dependencies:

```sh
node --import tsx tests/video-render/export-ui.test.tsx
RUN_RENDER_QUEUE_TESTS=1 node --conditions=react-server --import tsx tests/video-render/queue-integration.test.ts
RUN_RENDER_EXECUTION_TESTS=1 node --conditions=react-server --import tsx tests/video-render/render-integration.test.ts
```

For interactive browser QA, run the opt-in disposable fixture:

```sh
RUN_EXPORT_BROWSER_FIXTURE=1 node --conditions=react-server --import tsx tests/video-render/export-browser-fixture.ts
```

It prints a scoped URL for an older translated six-second synthetic movie and
creates a newer untranslated movie in the same temporary project. Submit/cancel/
retry via the browser. Enter `render` on stdin to consume only this fixture's
explicitly submitted jobs using a separate queue namespace and the real worker.
Enter `cleanup` to remove only its records, private files and queue receipts.
Keep the process running until browser verification finishes; do not kill it
before cleanup. Downloads already saved by the browser remain available.
No original project/movie/render or paid provider is used by this fixture.
