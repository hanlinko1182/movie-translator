# Phase 21.3B — Myanmar soft subtitle MP4 backend

Backend only; the approved UI v1.0 is unchanged. Trusted-local Linux deployment,
not public/multi-user authorization. No AI, GPU, automatic transcoding, MKV output,
blur/cover, recap video or new dependencies. Existing standalone SRT/ASS selection
and serialization, human edits, review, QC and TM behavior are unchanged.

## Contract and compatibility

The existing explicit render POST accepts this additional fixed combination:

```json
{"mode":"SOFT_SUBTITLE","exportMode":"APPROVED_ONLY","profileId":"myanmar-mp4-soft-copy-v1"}
```

Use the existing database Project/Movie-scoped `/api/projects/{projectId}/movies/{movieId}/renders`
route. `ALL_CURRENT` is also supported. Wrong mode/profile pairs or extra options
are rejected. GET remains read-only; neither source inspection nor submission calls AI.
The frozen Export UI still offers burn-in only; soft submission and mode-aware
history presentation require a separately authorized UI task. Do not interpret its
existing burn-in-only labels as soft-output qualification.

The copy-only input policy is deliberately conservative:

- Exactly one moving H.264 8-bit yuv420p video, even16..3840×16..2160, ≤6h,
  average frame rate0..60fps, square/unspecified SAR, progressive/unspecified SDR.
  VFR is accepted without FPS conversion. Nonzero rotation (including display
  matrices), tagged HDR/wide gamut and multiple moving videos are rejected.
- Zero to eight AAC-LC mono/stereo audio streams, sample rate8..192kHz. All such
  tracks are copied in source order. Unsupported audio rejects the entire job;
  it is not silently dropped. Shorter audio tracks remain shorter; no synthetic
  audio or `-shortest` is used.
- MP4/MOV/MKV/WebM private source keys retain existing forced demuxer validation.
  Container extension alone does not establish compatibility. Required packet
  timestamps/durations must be available, DTS nondecreasing, presentation video
  starts at zero (1ms tolerance), audio starts within100ms (AAC priming allowed),
  no packet duration/DTS gap above1s, no audio past video end beyond100ms.
  Inputs with unknown/discontinuous timelines are rejected. Matroska inputs may
  fail strict copy verification when remuxing changes AAC duration rounding;
  there is no fallback conversion. Accepted container does not imply all its
  codecs/timing forms are accepted.
- Attached pictures, existing subtitle tracks, data tracks, chapters and arbitrary
  metadata are omitted by explicit mappings. Captions/metadata already encoded
  inside copied video packets remain; this profile does not alter video payloads. Audio retains only a valid three
  lowercase letter language tag (otherwise `und`); first audio/video are default.
  Generated subtitle is exactly one `mov_text`, language `mya`, title/handler
  `Myanmar`, non-default and non-forced.

`SOURCE_PROFILE_UNSUPPORTED` is a controlled422 for incompatible sources.
`SUBTITLE_PROFILE_UNSUPPORTED` is a controlled422 for incompatible cues/target
language. Existing source/storage/snapshot/output/resource failure codes remain.
No absolute paths, source keys, recipes, leases or stderr enter client responses.

## Immutable version2 recipe

Burn-in version1 bytes, hashing, profile and stored snapshots are not rewritten.
Soft snapshots use version2 and the full fixed soft profile. They retain exact
selected SRT/ASS UTF-8 bytes/checksums, authoritative text, source alignment,
provenance, human review/QC context, approval gaps and original timestamps.
Source identity includes actual size/SHA-256 and a frozen stream-selection plan:
numeric input/output indexes, dimensions, time base, audio properties/languages,
subtitle metadata and per-stream packet receipts. Receipts contain packet count,
rolling SHA-256 of packet payload hashes, rolling timestamp hash (PTS/DTS/duration
at FFprobe microsecond precision), and presentation start/end.

Mode/profile/plan/source/content/subtitle checksums and an exact cue text/timing
hash belong to the recipe identity. Capture times/audit-only revisions do not.
Sol text changes affect the hash even without a revision increment. Identical
recipes reuse their first snapshot; retries never re-read current translation.
Source staging and subsequent inspections must match the frozen source plan/SHA.
This is output-input identity, not byte reproducibility across FFmpeg versions.

## Lossless text policy

The shared SRT serializer remains unchanged. For soft execution only, FFmpeg's
`text` decoder is explicitly selected for the SRT input, avoiding the default
SubRip decoder's HTML/entity interpretation. Literal `<b>text</b>`, angle brackets,
`&amp;`, mixed scripts, interior spaces and newlines are preserved as text.
No Unicode normalization or Zawgyi conversion occurs.

Reject zero-duration, overlapping, out-of-video cues, >50,000 selected cues,
>60,000 UTF-8 bytes per cue, invalid Unicode, control characters/tabs, backslashes,
braces, cue-edge whitespace or blank lines. The last forms do not survive the
supported SRT/raw-text/ASS-intermediate path losslessly. They are rejected, never
trimmed/escaped into different authoritative text. Other unexpected conversion
loss is caught by output verification and never published as completed.

## Execution and verification

The same queue, concurrency1, process supervisor/flock, resource limits, leases,
heartbeat, cancellation, retry, dispatch recovery and atomic publication are used.
FFmpeg receives server-built explicit numeric maps; video/audio use `copy` and
only the generated track uses `mov_text`. `-copyts`, `-copytb 1`, disabled timestamp
shifting and edit lists preserve the accepted source presentation timeline.
No filters, FPS/trim/seek options or arbitrary client arguments are accepted.
Soft jobs do not use fontconfig/libass rendering preflight. Burn-in still performs
its full font/glyph/complex-shaping preflight before encoding.

FFmpeg8 MOV enables the first subtitle track even with `-disposition:s:0 0`.
A bounded private-file finalization step walks MP4 box headers and clears only
that generated track's `tkhd` enabled bit, then fsyncs. It neither rewrites packet
content nor changes box offsets/sizes. Malformed/ambiguous structures fail closed.
This can hide the track in QuickTime; it is not a universal player guarantee.
[FFmpeg's MOV implementation](https://github.com/FFmpeg/FFmpeg/blob/n8.0.1/libavformat/movenc.c)
documents the automatic enabling and QuickTime behavior.

Before candidate recording, after atomic publication and during crash recovery:

- Verify real regular MP4, measured size/SHA, H.264 dimensions/pixel format,
  exact stream counts/order, AAC profile/channels/rates/language, subtitle codec,
  `mya`/Myanmar metadata and default/forced flags.
- Verify video/container duration within100ms and copied media packet counts,
  payload hashes and every packet's timestamp digest against the frozen source.
  This includes original AAC priming, shorter audio, B-frame timing and VFR.
- Stream FFprobe subtitle packets, decode the length-prefixed UTF-8 text with
  fatal decoding, and compare each nonempty cue exactly with frozen text and
  start/end within1ms. Empty muxer clearing samples are permitted between cues;
  extra text, changed gaps, styles/extra boxes or missing cues fail verification.
- FFprobe scans have120s wall limit, ≤1MiB buffered line, ≤2.5million media
  packets or100,002 subtitle packets; stderr is discarded. Abort kills FFprobe.
  These bounds may reject otherwise compatible long/high-track-count inputs.
  Source byte hashing remains chunked and checks cancellation between reads;
  existing large-file output hashing is bounded by file size and checked for
  abort before/after, not interrupted midway through a single hash pass.

A versioned verified stream manifest is persisted in RenderOutput and the durable
publication candidate. The completion guard requires soft metadata, selected cue
count and text/timing checksum matching the immutable recipe. A DB receipt cannot
prove disk bytes; runtime verification remains mandatory. Download retains the
existing scope, no-follow, size/SHA and same-descriptor streaming checks.

Fast stream-copy work may finish between polls. There is no invented ETA or
whole-job percentage: existing FFmpeg presentation progress excludes hashing,
staging, faststart, verification and publication. No completed state without a
verified output. Deferred jobs still require explicit resume.

## Migration and rollout

Stop **all old render workers** and pause new submissions before deployment.
Review/apply `20261011120000_add_soft_subtitle_render`, then run Prisma generate
and deploy matching server/worker code before enabling soft POSTs. The migration
commits enum additions before using them in constraints, adds nullable output
`streamManifest`, and replaces mode/profile/version and completion guards. It
preserves legacy receipts, immutable-snapshot trigger, uniqueness, dispatch table,
all domain records and all existing recipe identities. No rows are rewritten.
Old workers cannot execute v2 snapshots and must not consume this queue.

Use the unchanged `pnpm worker:render` launcher. Shared readiness still checks
DB/Redis/storage/FFmpeg/FFprobe; font readiness is now checked only for each
burn-in attempt, allowing soft jobs without a burn-in font renderer. Deployment
still needs existing Linux `flock`/`prlimit` and private shared local storage.

## QA and known limitations

```sh
node --conditions=react-server --import tsx tests/video-render/soft-subtitle.test.ts
RUN_SOFT_RENDER_TESTS=1 node --conditions=react-server --import tsx tests/video-render/soft-integration.test.ts
node --conditions=react-server --import tsx tests/video-render/execution.test.ts
RUN_RENDER_EXECUTION_TESTS=1 node --conditions=react-server --import tsx tests/video-render/render-integration.test.ts
```

Run DB suites sequentially with no production render worker. Tests use disposable
synthetic media/records, unique Redis prefix and clean only their known records,
keys and transport receipts. QA MP4 samples are retained in printed `/tmp` dirs.
They check Unicode/literal tags, approval gaps, VFR, multi-audio/silent media,
existing-track exclusion, strict failures, concurrent POST deduplication, read-only
GET, actual worker output, scoped checksum-verified download, stale ownership,
cancellation/publication races, explicit retry/deferral and crash recovery.

Embedded MP4 subtitle selection is **not supported uniformly by browsers**.
Source preview remains the original file. Desktop VLC/mpv still require actual
manual testing for track selection, On/Off and Myanmar shaping. `mov_text` has
limited styling and does not embed fonts; player/system fonts determine glyph
coverage, size, wrapping and shaping. FFprobe text/timing equality does not prove
visual shaping or player controls. No GUI playback claim is made from metadata.
