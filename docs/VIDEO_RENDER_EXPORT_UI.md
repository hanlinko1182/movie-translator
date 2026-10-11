# Export workspace integration — Phases 21.2D / 21.3C

The existing Export composition now connects to the Phase 21.2C backend. Shared
styles, navigation, subtitle selection and backend execution are unchanged.
Trusted-local only; project/movie scoping is not multi-user authentication.

## Explicit controls

- Select Burn-in MP4 or Soft Subtitle MP4, All Current or Approved Only, and
  acknowledge local resource use before Start Render. Mode cards are explicit;
  only BURN_IN / myanmar-mp4-cpu-v1 and SOFT_SUBTITLE /
  myanmar-mp4-soft-copy-v1 are offered. There are no custom encoding/style controls.
- Burn-in subtitles are permanently visible. Soft Subtitle offers a selectable
  Myanmar track in compatible players; browser support varies. The original
  source preview shows neither translated burn-in nor the generated soft track.
  Soft media/cue incompatibility is rejected rather than automatically transcoded.
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
Mode/profile metadata is validated and retained in client state. History titles
and accessible download labels distinguish both MP4 modes. Output Files offers
the newest completed recipe **per mode** within the loaded history;
other loaded completed recipes remain downloadable from Export Queue.

No movie, no translation, no approved rows, missing source, no jobs, deferred work,
queued/active work, failure/cancellation, and backend load failures retain honest
messages. Known backend error codes are shown with static safe descriptions,
never raw server messages. Recap video and blur/cover are unavailable. SRT/ASS
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

## Phase 21.3C verification

The disposable older-movie fixture was used for real browser submission: Soft
Subtitle / Approved Only and Burn-in / All Current completed as separate jobs.
Duplicate soft submission reused its job; queued Cancel then Retry retained soft
mode and advanced its generation. Both verified MP4 downloads and standalone
SRT/ASS downloads worked. FFprobe confirmed a `mov_text` / `mya` track only in the
soft output. This verifies metadata/text delivery, not desktop-player On/Off or
Myanmar shaping. Empty translation/source and zero-approved states blocked Start
Render, with no jobs for the newer movie. The temporary fixture was cleaned up.
At 1440, 1024 and 390px, the existing panel composition stacked at its existing
breakpoints with no page horizontal overflow. UI tests cover both profiles,
mode-separated history/output selection, lifecycle controls, safe errors, empty
states and read-only GET/SSR. No backend or shared UI styles changed.
