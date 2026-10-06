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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
