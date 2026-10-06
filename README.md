This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Local media jobs

Configure `DATABASE_URL` and `REDIS_URL` in your local environment (see
`.env.example`), and run PostgreSQL and Redis separately. Restart the Next.js
development server after changing its environment. No service starts automatically.

Run `pnpm worker:media` from the repository root in a separate terminal. It reuses
`tsx`; the `react-server` condition lets the process load `server-only` modules.
The worker needs the same database, Redis, private storage, FFmpeg, and FFprobe
as the Next.js server.

`POST /api/movies/<database-id>/process-media` returns 202 after queue submission.
`GET` returns only job ID, state, and attempts made. Queue `movie-processing`
runs `process-media` jobs with payload `{ movieId }` and stable ID
`media-<encoded-movie-id>`.

Jobs use three attempts with exponential backoff starting at two seconds.
Permanent input failures skip retries. Movies move `QUEUED` → `PROCESSING` →
`UPLOADED`; retryable failures return to `QUEUED`, terminal failures to `FAILED`.
Progress remains zero because media preprocessing does not complete subtitles.
BullMQ checks stalled jobs every 30 seconds and allows one stalled recovery.

Completed and failed jobs are retained up to 1,000 each. Repeated submission
reuses a retained job; failed jobs return 409. After fixing a failed input, remove
that specific inactive job with BullMQ before resubmitting. Retention cleanup may
eventually permit reprocessing; audio still replaces the same private WAV key.

Enqueue holds a short PostgreSQL movie-row lock while adding the job to Redis.
Redis errors roll back the database change; a commit failure attempts to remove
the job. Workers acquire the same lock and refuse movies without a committed
queue state. This is not a distributed transaction: database outages can still
require operational status reconciliation.

## Background transcription jobs

Set `OPENROUTER_API_KEY` in the ignored local `.env` file. Keep
`OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`, and set
`TRANSCRIPTION_MODEL` to either `qwen/qwen3-asr-1.7b` or
`openai/whisper-large-v3`. Qwen is the current preferred candidate based on the
first Chinese benchmark; that result is not a permanent quality conclusion, and
Whisper remains supported. Never put a real key in `.env.example` or client code.

After the media worker creates `audio/<movie-id>.wav`, run
`pnpm worker:transcription` in a separate terminal. `POST
/api/movies/<database-id>/transcribe` returns 202 after submitting a
`transcribe-movie` job to the `movie-transcription` queue. `GET` returns the safe
job state and, once complete, a compact receipt with the transcript ID. Read the
full transcript and ordered segments from `GET /api/movies/<database-id>/transcript`.
The payload is
only `{ movieId }`, with stable ID `transcription-<encoded-movie-id>`.

Jobs use three attempts with exponential backoff starting at two seconds.
Permanent configuration, movie, audio, and model failures skip remaining
attempts. Completed and failed jobs are retained up to 1,000 each. Repeated
submission reuses the retained job and does not start another provider request.
The worker runs separately from Next.js with concurrency one.

Transcription returns normalized millisecond segments in the original spoken
language (`zh` is supplied for Chinese movies). A model response without real
timestamped segments is rejected as unsuitable for subtitle mode. Long audio is
split into private ten-minute FFmpeg chunks and merged with global timestamps.
Movie status is unchanged because there is no transcription status column yet.
The worker atomically replaces the movie's current transcript and its segments in
PostgreSQL before completing the job. BullMQ stores only the compact receipt;
PostgreSQL is the transcript source of truth. Phase 10 will add a transcript UI.

For a small private WAV already produced by the media worker, run
`pnpm benchmark:stt -- <movie-id>`. The benchmark sends that same WAV to Qwen3
ASR 1.7B and Whisper Large V3 sequentially, then reports text, timestamp
availability, segment count, runtime, and provider usage/cost when returned. It
rejects inputs over 5 MB and does not assign an automatic quality winner.

## Translation benchmark (Phase 11)

Set `TRANSLATION_MODEL_PRIMARY` to the verified OpenRouter ID for GPT-6 Sol and
`TRANSLATION_MODEL_COMPARE` to the verified OpenRouter ID for GPT-6 Luna. Keep
`OPENROUTER_API_KEY` server-side. Run `pnpm benchmark:translation -- <movie-id>`
to compare both models on the same ordered, persisted Chinese transcript segments.
Each model receives the full segment context in one request. The CLI prints
side-by-side Myanmar translations, unchanged source timestamps, runtime, and
provider-reported usage/cost when available. Benchmark results are ephemeral;
only the production worker below saves translations to PostgreSQL.

## Production translation jobs (Phase 12)

Set `TRANSLATION_MODEL` to `openai/gpt-6-luna` in the server and worker
environment, alongside the existing OpenRouter, PostgreSQL, and Redis settings.
Run `pnpm worker:translation` separately from Next.js. `POST
/api/movies/<database-id>/translate` returns 202 after adding a `translate-movie`
job to `movie-translation`; `GET` on that route reports job state and a compact
receipt. Read the ordered, persisted Myanmar segments from `GET
/api/movies/<database-id>/translation`. The Phase 11 benchmark remains available.
GPT-6 Sol is reserved for later QC and selective re-translation.

Each job uses at most 24 active segments and 4,000 source characters per provider
request, with up to two neighboring context segments and 800 context characters
on each side. Segments larger than that single-request budget are rejected.
Three attempts use exponential backoff starting at two seconds; deterministic
input and malformed model responses fail without retry. A retained job ID prevents
repeat POSTs from starting another paid run. The worker replaces the current
translation and its segments in one PostgreSQL transaction, then returns only a
compact receipt to BullMQ. Movie status is unchanged. The translation records
its source transcript ID; if that transcript is later edited in place, the
existing translation can become stale and needs a future invalidation policy.

## Glossary and Translation Memory (Phase 13)

`/projects/<slug>/glossary` manages explicit project terminology (names, places,
titles, organizations, terms, and phrase preferences). `/projects/<slug>/translation-memory`
manages reusable subtitle source/target pairs. Both pages read PostgreSQL on the
server and support adding, editing, deleting, and searching entries. Their APIs
are `/api/projects/<slug>/glossary` and `/api/projects/<slug>/translation-memory`
(GET/POST), with `/<entryId>` for PATCH/DELETE. The existing `[id]` route segment
represents a public project slug for these nested endpoints; mutations also filter
by the resolved database project ID. Duplicate POSTs return 409.

Glossary sources are trimmed, remain case-sensitive, and are unique per project,
source text, and language pair. Only terms appearing literally in a bounded
translation batch or its source context are passed to the provider: longest
matching terms first, at most 20 mappings and 2,000 combined mapping characters.
Mappings override stylistic preferences and are literal data, not instructions.
Adding a glossary rule does not create a memory entry.

Memory sources are trimmed and consecutive whitespace is collapsed to one space.
Case, Chinese characters, punctuation, and Unicode forms are preserved. Node's
built-in SHA-256 hashes the normalized UTF-8 source. The unique key is project,
source language, target language, and hash; lookup also verifies normalized source
text. Language codes are trimmed and lowercased, with `cmn` canonicalized to `zh`
to match existing Chinese movie and project records; regional variants stay distinct.

Production translation checks exact memory matches before model calls. Hits are
removed from active targets, though bounded source-only context may include them.
Unmatched segments use GPT-6 Luna with relevant glossary mappings. Results merge
in source sequence order with original timestamps. A full memory hit uses explicit
`translation-memory` / `exact-match` metadata, zero model calls and no invented
usage or cost. Compact receipts include total segments, memory hits, model-translated
segments, and model calls; full translations stay in PostgreSQL, not Redis.

Memory capture follows successful segment replacement inside the same transaction.
Duplicate capture skips existing keys: the first stored translation wins, including
manual corrections, until explicitly edited or deleted. Repeated persistence does
not duplicate memory rows. Deleting a Project cascades to both terminology tables;
existing Project-to-Movie behavior is unchanged. There is no approval/QC metadata,
fuzzy matching, vector search, or automatic invalidation after glossary changes yet.
GPT-6 Sol remains reserved for future QC and selective re-translation.

## Local translation QC and selective refinement (Phase 14)

The Translation screen now reads actual source/target rows and per-segment
provenance. Run QC performs free, deterministic checks via POST
`/api/movies/<database-id>/translation/qc`; GET returns persisted findings and
the current review. Findings describe suspicious evidence, not objective quality,
confidence, or human approval. No heuristic automatically starts a paid request.

Checks cover empty output, extreme length differences, numeric values, Markdown
or commentary prefixes, literal glossary mismatch, identical long targets for
different sources, long Chinese source leakage, and general explanation/repetition
signals that may indicate ambiguity. Length uses graphemes: excessive output is
over max(200, 8 × source length); possible omission requires source length ≥20
and target length below max(4, 0.12 × source length). These are warnings. Numbers
normalize ASCII, fullwidth and Myanmar digits plus conventional comma thousands
groups; Chinese number words, written number words and complex locale formats
are not interpreted. English code-switching and ordinary names are not errors.
Repetition requires targets of at least 30 graphemes and sources of at least 10.
Chinese leakage requires a matching span of at least six Han characters. Ambiguity
signals use mixed English explanations or a repeated Chinese bigram (at least four
occurrences with two questions), not a hard-coded sample word.

Repeated scans replace unresolved HEURISTIC issues under the movie row lock,
preserving manual issues and resolved history. A scan timestamp distinguishes
unscanned translations from scans without findings. QC issues cascade through
their TranslatedSegment; full translation replacement removes old-row findings.

GPT-6 Luna remains the normal translation model. Set the server/worker variable
`TRANSLATION_REFINEMENT_MODEL=openai/gpt-6-sol` and run
`pnpm worker:translation-refinement` for explicit paid refinement. The UI requires
selection and a paid-request acknowledgement. POST
`/api/movies/<database-id>/translation/refine` accepts only `{ "sequences": [...] }`,
normalizes sorted unique nonnegative integers, validates alignment, and returns
202 with a job ID. GET the same endpoint with `?jobId=<returned-id>` for status.
Select at most 24 rows; whole-movie selection is rejected (a one-segment movie
can still refine its one row). Pages and QC scans never trigger paid requests.

Queue `translation-refinement` runs `refine-translation` with concurrency one.
Payload contains movie ID, sequences, translation ID/revision and a snapshot
hash, never full dialogue. IDs hash translation identity, replacement/human-mutation revision,
source snapshot and normalized selection. Equivalent concurrent submissions and
repeated retained requests reuse one job, including after successful refinement.
Completed/failed jobs retain up to 1,000 each. A deliberate repeat requires removing
that specific inactive job; retention cleanup can eventually permit a new request.
Three attempts use exponential backoff from two seconds. Configuration, alignment,
missing records, stale snapshots, provider rejection and malformed output are
permanent; network/429/5xx and transient database failures are retryable.

Sol receives only selected active sources, bounded neighboring/source-only context,
their current translations and relevant glossary mappings. Structured JSON must
contain exactly the requested sequences and non-empty text, with no extra fields,
commentary or generated timestamps. Original sequence/timestamps remain application
owned. A row-locked transaction rechecks source and selected-target snapshots,
updates only selected row IDs with REFINED/provider/model/job provenance, updates
safe memory pairs, and reruns local QC for changed rows. The Translation ID and
unselected rows stay stable. Automatic findings that disappear receive a resolution
timestamp and refinement reference; manual findings never auto-resolve.

Memory now distinguishes MANUAL and AUTOMATIC. Manual API creation/editing always
marks a pair MANUAL; production capture marks new pairs AUTOMATIC. Legacy pairs
are conservatively treated as MANUAL because Phase 13 did not record their origin.
Refinement only overwrites an AUTOMATIC pair whose current source and target match
the selected pre-refinement snapshot. Missing pairs can be created automatically;
manual or changed pairs remain untouched. Legacy segment origin stays UNKNOWN
unless a full memory result proves TRANSLATION_MEMORY; new production rows record
their actual MODEL or TRANSLATION_MEMORY origin. Translation-level model metadata
does not claim to describe every refined row.

A committed refinement can recover using its per-row job marker without another
model call. A crash after a provider response but before transaction commit may
still repeat a paid request on retry; there is no distributed exactly-once guarantee.
No model-based QC or automatic Sol fallback is implemented. Source edits
in place still require a future invalidation policy for automated translations.

## Phase 15 — Human subtitle editing and review

Use `/projects/<slug>/translation` to edit current Myanmar targets. Chinese source,
sequence and timestamps are read-only. Save is explicit and runs no provider call;
it atomically stores the current text, MANUAL origin, edit timestamp, manual memory
pair and refreshed local QC. Prior provider/model metadata remains as previous
automation, not the current origin. No duplicate editedText or full history is kept.

Review states are UNREVIEWED, NEEDS_REVIEW and APPROVED. Only explicit human
review actions approve a row. Changed text becomes NEEDS_REVIEW and clears
reviewedAt; save changed text before approving separately. QC findings do not
approve rows. Status-only actions do not change text, origin or memory. Bulk
approval/needs-review accepts up to 24 selected rows atomically.

PATCH `/api/movies/<id>/translation/segments/<sequence>` accepts only `text` and/or
`reviewStatus` plus the current `version` token. Text is trimmed, non-empty and at
most 32,000 characters. PATCH `/api/movies/<id>/translation/review` accepts only
`sequences`, `reviewStatus` and `versions` (sequence-to-token map). Tokens bind the
translation generation, row identity/revision and aligned source contents. Reads
from the translation and QC APIs expose tokens, review state, editedAt/reviewedAt
and QC evidence. Stale mutations return 409 STALE_TRANSLATION_SEGMENT. A stale
editor retains its draft and requires comparing the latest saved text before rebasing.

Human edits are authoritative: production reruns preserve MANUAL row identities,
text, review state, timestamps and QC history. Non-manual rows can be replaced;
previous approvals are invalidated. A stored manualSourceHash prevents reruns from
silently attaching human work to changed source text; mismatched source bindings
reject with MANUAL_EDIT_PROTECTED. No force override exists. Sol selection and
commit also reject MANUAL rows before overwriting; selection rejects before any
provider call. Automated Sol target changes invalidate approval.

Manual saves upsert project/language/source-hash exact memory pairs as MANUAL
using existing normalization. Automatic capture skips existing pairs; refinement
only updates qualifying AUTOMATIC pairs. Repeated identical source lines share
one pair, so the latest explicit human save determines that future memory match.
Disappearing HEURISTIC findings receive a resolution timestamp after an edit;
manual findings are never auto-resolved. Approval remains a human decision.

Per-row revision provides monotonic write protection. Translation revision advances
on production replacement and every human save/review action, invalidating queued
refinement generations. Sol completion advances selected row revisions, but retains
the translation generation so retained completed jobs still deduplicate paid requests.
QC scans leave edit tokens unchanged. Drafts survive search/filter/QC refresh and
show unsaved status; browser reload/close warns, but SPA route navigation is not
blocked. Saving/reviewing one row can invalidate another draft's generation token;
the editor explicitly compares/rebases that draft before saving.

Migration `20261006160000_add_human_subtitle_review` is additive: MANUAL origin,
TranslationReviewStatus, segment reviewStatus/revision/editedAt/reviewedAt and
manualSourceHash. Existing rows default to UNREVIEWED. Authentication and
multi-user locking remain outside this phase; API writes are scoped to the current
movie/translation. Phase 16 exports authoritative current target text with explicit review filters,
never regenerating over manual edits.

## Phase 16 — SRT and ASS subtitle export

`/projects/<slug>/export` shows the newest movie's real translation/review summary
and downloads server-generated subtitle files. Selecting another movie is future
work; the review link opens that exact movie in Translation. No readiness score,
AI approval, mock export history, video processing or persistent export storage.

GET `/api/movies/<database-id>/export/subtitles?format=srt&mode=all` downloads SRT;
use `format=ass` for ASS, or `mode=approved` to include APPROVED rows only. Defaults
are SRT/all. Other formats/modes, duplicate options and unknown query fields return
controlled 400 errors. Missing Movie/Translation returns 404; an empty export or
zero approved rows returns 409; invalid saved sequence/timing/text returns 422.

ALL_CURRENT uses every current TranslatedSegment.text, including MANUAL edits,
TM matches and model/refined output. APPROVED_ONLY omits UNREVIEWED/NEEDS_REVIEW
rows, retains original time ranges/gaps and numbers SRT cues sequentially. No
replacement subtitles are fabricated. The UI warns about non-approved rows or
omissions and disables zero-approved downloads. Counts reflect the page load;
each download reads the current saved data in a consistent read transaction.

Timing comes only from persisted startMs/endMs. Export validates non-empty text,
strict increasing sequences, nondecreasing start times and safe integer ranges
with end >= start. It never edits source, targets, review state, TM, QC, Movie,
Translation revisions or timing. Text is copied with CRLF/CR normalized to LF;
SRT retains other whitespace, punctuation and meaningful line breaks.

SRT uses HH:MM:SS,mmm (hours can exceed 99), UTF-8 without a BOM. ASS uses
H:MM:SS.cc, flooring both bounds to centiseconds. The sample ranges become
0:00:00.00–0:00:10.68, 0:00:11.01–0:00:38.21 and 0:00:38.21–0:00:42.51.
Short ranges can collapse to equal ASS bounds; export never stretches or retimes
them. ASS includes standard Script Info, V4+ Styles and Events sections, a generic
sans-serif style, white text/black outline and conventional bottom-center margins.
Font fallback depends on installed player fonts; no font files are bundled.

ASS newlines become \N. Literal backslashes gain an invisible U+2060 WORD JOINER
so text such as literal \N/\n/\h cannot become commands. Braces use libass literal
escapes; an empty block after each opening brace prevents VSFilter from treating
following text as override tags. Literal brace appearance can differ in VSFilter,
which lacks libass's literal-brace extension; target words remain safe from override
injection. This follows [libass's escaping guidance](https://github.com/libass/libass/wiki/Libass%27-ASS-Extensions)
and [parser behavior](https://github.com/libass/libass/blob/master/libass/ass_parse.c).
SRT does not share ASS's override syntax; subtitle text is otherwise preserved.

Files use a sanitized movie filename/title plus `.my.srt` or `.my.ass`. Path/control
characters, unsafe characters, traversal dots and reserved device names are handled;
stems are limited by UTF-8 byte length. Content-Disposition includes a safe ASCII
fallback and encoded UTF-8 filename*. SRT uses application/x-subrip; ASS text/plain,
both charset=utf-8, private/no-store and nosniff. The API generates bytes in memory;
the client downloads the server bytes and does not generate subtitle content.

Run `pnpm exec tsx scripts/verify-subtitle-export.ts` for pure formatter, Unicode,
multiline/CRLF, long-hour, gap, injection, filename/header and validation tests.
This script imports no database, environment configuration or paid providers.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
