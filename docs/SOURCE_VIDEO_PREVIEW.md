# Source video preview

The existing Overview, Transcription, Translation, Review, Recap and Export media panels use the shared native HTML5 player. Scenes uses its existing selected-scene inspector; no new top-level workspace panel is added. Playback shows the original uploaded video, without a translated subtitle overlay.

## Read-only streaming

`GET /api/projects/{projectId}/movies/{movieId}/source` uses database project/movie IDs, checks the relationship, and resolves only the movie's recorded private storage key. `HEAD` performs the same checks without streaming bytes. Clients cannot supply a path or storage key.

- Full responses: `200`, content type/length and `Accept-Ranges: bytes`.
- Single bounded, open-ended or suffix byte range: `206` and `Content-Range`.
- Invalid, multiple or unsatisfiable ranges: `416`, `Content-Range: bytes */{size}` and an empty body.
- Missing movie/source: controlled `404`; unsafe/empty source: `422`; storage failure: `503`.
- All responses use private/no-store and nosniff; source responses also restrict cross-origin resource use to the same origin.
- Private directory/symlink checks and `O_NOFOLLOW` precede file-descriptor streaming. Size and streamed bytes come from the same opened file. Cancellation closes the stream. No full movie buffering, hashing, transcoding, queue submission, paid requests or source writes occur.

This remains a **trusted-local application**. Project scoping does not authenticate users or establish multi-user authorization. Host administrators can alter storage; filesystem checks do not defend against a hostile administrator racing ancestor-directory replacement. Add authentication and per-user ownership before public deployment.

## Selection and timing

The supported workspaces honor an explicit `movieId` query parameter, validate that it belongs to the current project and retain selection in workspace navigation. Without a selection they keep the existing newest-movie default. Invalid selections do not fall back to a different movie.

Transcript/translation timing controls seek to saved source timestamps. Recap evidence and saved scene intervals also seek within the original source. Timing, transcript text, translations, approval, QC, TM and rendering behavior remain unchanged. The native player reports the duration actually decoded by the browser; persisted duration metadata may be rounded.

## Compatibility and failures

Accepted upload containers remain MP4, MOV, WebM and MKV. An accepted extension does not establish browser codec support. Native browser/platform decoding determines playback; no preview conversion is performed. Unsupported containers/codecs, missing files and network/decode failures produce an honest unavailable state with retry. No new source-download action is introduced.

## Checks

```sh
node --conditions=react-server --import tsx tests/source-video/stream.test.ts
node --import tsx tests/source-video/preview.test.tsx
SOURCE_VIDEO_INTEGRATION=1 node --conditions=react-server --import tsx tests/source-video/database.test.ts
```

The integration test requires the existing local PostgreSQL and private storage. It creates and removes only its own temporary project, movies and small streaming fixture; it submits no jobs. Browser QA should use an authorized short MP4 to confirm native playback, audio, saved-timestamp seeking and the existing 1440/1024/390 layouts.

## Implementation files

Created:

- `app/api/projects/[id]/movies/[movieId]/source/route.ts`
- `components/media/source-video-preview.tsx`
- `lib/source-video/range.ts`
- `lib/source-video/selection.ts`
- `lib/source-video/playback.ts`
- `lib/source-video/stream.ts`
- `tests/source-video/stream.test.ts`
- `tests/source-video/preview.test.tsx`
- `tests/source-video/database.test.ts`
- `docs/SOURCE_VIDEO_PREVIEW.md`

Modified:

- `app/projects/[id]/page.tsx`
- `app/projects/[id]/overview-model.ts`
- `app/projects/[id]/overview-components.tsx`
- `app/projects/[id]/subtitles/page.tsx`
- `app/projects/[id]/subtitles/transcription-workspace.tsx`
- `app/projects/[id]/translation/page.tsx`
- `app/projects/[id]/recap/page.tsx`
- `app/projects/[id]/recap/RecapControls.tsx`
- `app/projects/[id]/scenes/page.tsx`
- `app/projects/[id]/export/page.tsx`
- `components/export/subtitle-export-controls.tsx`
- `components/layout/app-sidebar.tsx`
- `components/movies/movie-library.tsx`
- `components/scenes/scene-workspace.tsx`
- `components/translation/review-workspace.tsx`
- `components/translation/translation-review.tsx`
- `components/translation/workspace-model.ts`
- `components/ui/advanced-workspace-header.tsx`
- `lib/storage/local.ts`

Schema, dependencies, environment files, existing subtitle export APIs and the rendering pipeline are unchanged.
