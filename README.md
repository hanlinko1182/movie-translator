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
hash, never full dialogue. IDs hash translation identity, full-replacement revision,
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
No model-based QC, automatic Sol fallback, human approval, subtitle editing, or
export is implemented. Source edits in place still require a future invalidation
policy for already-persisted translations.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
