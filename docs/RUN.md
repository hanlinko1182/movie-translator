# Run Movie Translator on Ubuntu/Linux

This guide covers a fresh clone, local development, workers, and production/Docker startup. Run project commands from the repository root unless a step says otherwise. Source of truth: `package.json`, `pnpm-lock.yaml`, `.env.example`, `prisma7.config.ts`, `Dockerfile`, `docker-entrypoint.sh`, and the [production runbook](production-runbook.md).

ဒီ project မှာ local GPU သို့မဟုတ် local AI model မလိုပါ။ AI processing အတွက် OpenRouter ကိုသုံးပြီး media processing နဲ့ scene detection ကို FFmpeg ဖြင့် local မှာလုပ်ပါတယ်။

## Quick Start

Prerequisites: Node.js 24 with Corepack, pnpm 12.3.4, PostgreSQL, Redis, FFmpeg/FFprobe, Git, and curl. See [system requirements](#system-requirements) if these are not installed.

1. **Clone.**

   ```bash
   git clone https://github.com/hanlinko1182/movie-translator.git
   cd movie-translator
   ```

2. **Activate pnpm and install the locked dependencies.**

   ```bash
   corepack enable
   corepack prepare pnpm@12.3.4 --activate
   pnpm --version
   pnpm install --frozen-lockfile
   ```

3. **Create the private environment file.**

   ```bash
   cp .env.example .env
   chmod 600 .env
   nano .env
   ```

   Fill in `DATABASE_URL`, `REDIS_URL`, and the AI key/models for features you will use. The [environment section](#environment-file) provides placeholders and explanations.

4. **Start PostgreSQL and create the development role/database.**

   ```bash
   sudo systemctl enable --now postgresql
   ```

   On a fresh database installation, complete the SQL in [PostgreSQL setup](#postgresql-setup).

5. **Start Redis.**

   ```bash
   sudo systemctl enable --now redis-server
   redis-cli ping
   ```

   Expected response: `PONG`. Local `REDIS_URL` is normally `redis://127.0.0.1:6379`.

6. **Generate Prisma and apply the repository migrations.**

   ```bash
   pnpm exec prisma validate
   pnpm exec prisma generate
   pnpm exec prisma migrate deploy
   ```

7. **Start Next.js in Terminal 1.**

   ```bash
   pnpm dev
   ```

8. **Start the workers you need in separate terminals**, from the same clone, using the same `.env`. For the complete first test workflow, use all seven commands in the [terminal layout](#terminal-layout-example).

9. **Open [http://localhost:3000](http://localhost:3000)** and follow the [first test workflow](#first-test-workflow).

> `.env` ဖြည့်ပြီး database ပြင်ဆင်ပြီးမှ web နဲ့ workers ကိုစပါ။ Web server စတင်ခြင်းက workers ကို အလိုအလျောက်မစတင်ပေးပါ။

## System requirements

| Tool | Repository version/convention |
| --- | --- |
| Node.js | Use the Node.js 24 major used by `Dockerfile` (`node:24-bookworm-slim`); no exact host patch or `engines` version is pinned. |
| pnpm | **12.3.4**, pinned by `package.json` `packageManager` and the Dockerfile. |
| PostgreSQL | Server and `psql` client required; server version is not pinned in the repository. |
| Redis | Server and `redis-cli` required for BullMQ; server version is not pinned. |
| FFmpeg / FFprobe | Both required by web upload validation, media, transcription chunking, and scenes. Docker installs Debian Bookworm packages without an exact version pin. |
| Git | Required to clone; version not pinned. |
| curl | Used for the guide's health/API checks; version not pinned. |
| Docker | Optional alternative runtime; Engine version not pinned. Docker image builds include Node, pnpm, FFmpeg/FFprobe and Tini. |

Application versions in the current package/lock files: Next.js **16.3.6**, React **19.2.8**, TypeScript **5.9.3**, Prisma **7.10.0**, BullMQ **6.3.10**, and ioredis **6.0.0**. BullMQ/ioredis versions are client library versions, not Redis server versions.

For Ubuntu system packages, if missing:

```bash
sudo apt-get update
sudo apt-get install -y git curl postgresql postgresql-client redis-server redis-tools ffmpeg
```

Install Node.js 24 using your normal Node toolchain first. Use an installation that provides Corepack, as the project's Docker base does; if Corepack is absent, provision it in that toolchain before the Quick Start commands. Do not assume Ubuntu's default `nodejs` package is the project's Node version. Use pnpm for project dependencies, not npm/yarn/bun; retain the existing lockfile and `pnpm-workspace.yaml` build-script approvals.

Verify tools:

```bash
node --version
pnpm --version
psql --version
redis-server --version
ffmpeg -version
ffprobe -version
git --version
curl --version
docker --version
```

Skip the Docker check when using local processes only. The FFmpeg Ubuntu package normally includes `ffprobe`.

## Clone and dependencies

```bash
git clone https://github.com/hanlinko1182/movie-translator.git
cd movie-translator
pnpm install --frozen-lockfile
```

Activate the pinned pnpm version first if necessary (Quick Start, step 2). A fresh clone already contains the committed lockfile and build approvals, so frozen installation is appropriate. A lock mismatch should be investigated rather than switching package managers or deleting the lockfile. `pnpm install` is available when intentionally updating dependencies in development; no dependency update is needed just to run the app.

## Environment file

For a **fresh clone**:

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Do not overwrite an existing configured `.env` with the copy command. `.env.example` is the committed template and contains no real credentials. `.env` is private, ignored by Git, and must never be committed, included in an image, or copied into frontend code.

Use this development structure. Replace the password/key placeholders before enabling AI actions; these are not real credentials. The production AI models below are recommended values to fill into `.env`; the template deliberately leaves several model fields blank.

```dotenv
DATABASE_URL=postgresql://movie_translator_user:YOUR_PASSWORD@localhost:5432/movie_translator
REDIS_URL=redis://127.0.0.1:6379

STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=storage

OPENROUTER_API_KEY=YOUR_OPENROUTER_API_KEY
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

TRANSCRIPTION_MODEL=qwen/qwen3-asr-1.7b

TRANSLATION_MODEL_PRIMARY=
TRANSLATION_MODEL_COMPARE=

TRANSLATION_MODEL=openai/gpt-6-luna
TRANSLATION_REFINEMENT_MODEL=openai/gpt-6-sol
CHARACTER_ANALYSIS_MODEL=openai/gpt-6-luna
RECAP_MODEL=openai/gpt-6-luna

SCENE_CHANGE_THRESHOLD=0.4
SCENE_MIN_DURATION_MS=15000
SCENE_TRANSCRIPT_GAP_MS=8000

WORKER_SHUTDOWN_TIMEOUT_MS=120000
```

| Variable | Meaning / requirement |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for web, Prisma and every worker. Use your own credentials; percent-encode special characters in URL credentials. |
| `REDIS_URL` | Redis/BullMQ connection for web and every worker. Local example uses database 0. Runtime accepts `redis://` or `rediss://` URLs, without query/hash fragments. |
| `STORAGE_DRIVER` | `local` is the only implemented driver. Explicitly required in production. |
| `LOCAL_STORAGE_ROOT` | Relative `storage` works in development from the repo root. Production requires an absolute private path on persistent storage; `/`, `public`, `.next`, and `node_modules` are invalid roots. |
| `OPENROUTER_API_KEY` | Required by AI workers and AI actions. Leave blank if only testing non-AI features; do not start AI workers then. Never prefix secrets with `NEXT_PUBLIC_`. |
| `OPENROUTER_BASE_URL` | Keep `https://openrouter.ai/api/v1`; runtime restricts the provider URL to this HTTPS endpoint. |
| `TRANSCRIPTION_MODEL` | Required by transcription; `qwen/qwen3-asr-1.7b` is the current choice. `openai/whisper-large-v3` is also supported. |
| `TRANSLATION_MODEL_PRIMARY` | Optional translation benchmark model, not used by normal translation. Leave blank for normal startup; the existing benchmark uses `openai/gpt-6-sol` as primary. |
| `TRANSLATION_MODEL_COMPARE` | Optional benchmark comparison model; existing pair uses `openai/gpt-6-luna`. Benchmarks make paid requests and are not a startup step. |
| `TRANSLATION_MODEL` | Required by production translation worker; `openai/gpt-6-luna` is the normal translation strategy. |
| `TRANSLATION_REFINEMENT_MODEL` | Required by refinement worker; `openai/gpt-6-sol` is used only for explicit selective refinement. |
| `CHARACTER_ANALYSIS_MODEL` | Required by character worker; use `openai/gpt-6-luna` for the current strategy. |
| `RECAP_MODEL` | Required by recap worker; use `openai/gpt-6-luna`. Recap output language is Myanmar. |
| `SCENE_CHANGE_THRESHOLD` | FFmpeg visual change threshold; default `0.4`, allowed `0.01`–`1`. |
| `SCENE_MIN_DURATION_MS` | Minimum scene grouping duration; default `15000`, allowed `5000`–`300000`. |
| `SCENE_TRANSCRIPT_GAP_MS` | Transcript gap threshold; default `8000`, allowed `3000`–`300000`. |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | Worker drain deadline; default `120000` ms, allowed `1000`–`21600000` ms. Supervisor/Docker stop grace must exceed it. |

Keep web and workers on consistent DB/Redis/storage/provider settings. Workers load `.env` through `dotenv`; Next.js loads it for the web process. An already exported environment variable can take precedence over a file value. Do not paste connection strings, keys, or the full environment into logs/support messages.

## PostgreSQL setup

These are example development role/database names, not a claim about any existing private installation. Create them only on your own local development PostgreSQL server.

```bash
sudo systemctl enable --now postgresql
sudo -u postgres psql
```

In `psql`, replace `YOUR_PASSWORD` with a private password:

```sql
CREATE USER movie_translator_user WITH PASSWORD 'YOUR_PASSWORD';
CREATE DATABASE movie_translator OWNER movie_translator_user;
GRANT CONNECT ON DATABASE movie_translator TO movie_translator_user;
\connect movie_translator
GRANT USAGE, CREATE ON SCHEMA public TO movie_translator_user;
\quit
```

Set the matching URL in `.env`:

```dotenv
DATABASE_URL=postgresql://movie_translator_user:YOUR_PASSWORD@localhost:5432/movie_translator
```

Check connectivity with an interactive password prompt (no password in command arguments):

```bash
psql -h 127.0.0.1 -p 5432 -U movie_translator_user -d movie_translator -W -c 'SELECT 1;'
```

Applying committed migrations with `migrate deploy` does **not** need a shadow database or `CREATEDB`. If you later author schema changes using `migrate dev`, Prisma needs a shadow database. For an isolated local developer role, an administrator may grant:

```bash
sudo -u postgres psql -c 'ALTER USER movie_translator_user CREATEDB;'
```

That grant is optional for development migration authoring; do not grant it to the production runtime role just to run the app. Do not use a superuser application connection or change database security/listeners to bypass a connection problem.

## Redis setup

```bash
sudo systemctl enable --now redis-server
redis-cli ping
```

Expected: `PONG`. Match `.env` to the service:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
```

All producers and workers must use the same Redis endpoint/database. Do not expose Redis publicly or flush an existing Redis instance to make queues work. BullMQ expects `maxmemory-policy noeviction`; check it on your local service:

```bash
redis-cli CONFIG GET maxmemory-policy
```

For deployment, provision adequate memory, persistence and `noeviction` through the service configuration; see the production runbook. A configured/authenticated remote service needs its own protected connection settings.

## Storage setup

Development configuration:

```dotenv
STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=storage
```

The app initializes the root plus `movies/` and `audio/` automatically. If preparing them yourself, run from the repo root as the account that will run web/workers:

```bash
mkdir -p storage/movies storage/audio
chmod 700 storage storage/movies storage/audio
```

Directories are private (`0700`); app-written files are `0600`. Storage and its ancestors must be real directories, not symlinks. Web/media/transcription/scene workers must share the same storage. Do not run local processes with sudo or place media under `public/`. The two media subdirectories are Git-ignored; see [Git safety](#git-safety) for exact coverage.

မူရင်း movie နဲ့ extracted audio ကို private storage ထဲမှာပဲသိမ်းပါ။ Storage ကိုဖျက်လျှင် database record တွေရှိနေပေမယ့် media processing ဆက်လုပ်လို့မရနိုင်ပါ။

## Prisma setup

`prisma7.config.ts` loads `.env`, points to `prisma/schema.prisma` and `prisma/migrations`, and configures the optional development seed. Generated client output is `generated/prisma/`.

For a fresh development clone, apply the **existing committed migrations**:

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

This avoids creating a new migration or requiring a shadow database just to run the current schema. When intentionally developing a schema change on an isolated local database, use `pnpm exec prisma migrate dev --name descriptive_change`, then regenerate the client. If Prisma requests a destructive reset, stop and investigate drift; a reset is not a startup procedure.

**Production:** apply reviewed migrations once per release using `pnpm exec prisma migrate deploy`. Never use `migrate dev` or a database reset in production.

Optional, on a fresh disposable development database only:

```bash
pnpm exec prisma db seed
```

The seed upserts three sample projects and creates Movie metadata if missing; it does not upload real media, transcribe, or translate. It can update existing sample project metadata. Skip it for production or curated data; the upload-based first workflow does not need seeded projects.

## Start the web app

From the configured repository:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). To bind development to loopback explicitly:

```bash
pnpm dev --hostname 127.0.0.1
```

Next.js does not start PostgreSQL, Redis, or workers for you. This app currently lacks authentication/authorization and abuse controls; use a trusted local/private environment, not public exposure. See the [production release gate](production-runbook.md#release-gate).

## Workers

Run each selected worker from the repo root in its own terminal. Every worker needs PostgreSQL and Redis. Startup validates configuration/dependencies before accepting jobs; successful startup emits `worker_ready`.

| Worker / command | Purpose | Requires OpenRouter? |
| --- | --- | --- |
| Media — `pnpm worker:media` | Probe/process uploaded movies and extract private WAV audio with FFmpeg/FFprobe. | No |
| Transcription — `pnpm worker:transcription` | Chunk audio as needed, call speech-to-text, persist timed source transcript segments. | Yes: key + `TRANSCRIPTION_MODEL` |
| Translation — `pnpm worker:translation` | Use glossary/exact Translation Memory and translate remaining Chinese segments to Myanmar. | Yes: key + `TRANSLATION_MODEL` |
| Refinement — `pnpm worker:translation-refinement` | Explicit selective GPT-6 Sol refinement of eligible segments. | Yes: key + `TRANSLATION_REFINEMENT_MODEL` |
| Scenes — `pnpm worker:scenes` | Estimate scene boundaries from local FFmpeg visual changes and transcript timing. | No |
| Characters — `pnpm worker:characters` | Infer characters/relationships from scene/transcript evidence. | Yes: key + `CHARACTER_ANALYSIS_MODEL` |
| Recap — `pnpm worker:recap` | Generate a Myanmar recap grounded in source scenes/transcript and available character evidence. | Yes: key + `RECAP_MODEL` |

Media, transcription and scenes also need shared private storage and both binaries. Other workers do not need local media access. Starting an AI worker does not itself make a paid request, but it can immediately consume queued work. Start it only against your intended database/queue with a budget for pending jobs.

## Terminal layout example

In **each** terminal, `cd` into the cloned `movie-translator` repository first:

| Terminal | Command |
| --- | --- |
| 1 | `pnpm dev` |
| 2 | `pnpm worker:media` |
| 3 | `pnpm worker:transcription` |
| 4 | `pnpm worker:translation` |
| 5 | `pnpm worker:translation-refinement` |
| 6 | `pnpm worker:scenes` |
| 7 | `pnpm worker:characters` |
| 8 | `pnpm worker:recap` |

Not every worker must be running when its feature is unused. For example, omit refinement if you will not request selective refinement. Keep needed workers running until their jobs finish.

## Health checks

```bash
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/ready
```

- `GET /api/health`: process **liveness**, normally HTTP 200 with `{"status":"ok"}`. It does not query dependencies or AI.
- `GET /api/ready`: **dependency availability**, HTTP 200 with `status: "ready"` when database, Redis, private storage, FFmpeg and FFprobe checks succeed; otherwise HTTP 503 with `status: "not_ready"` and safe `ok`/`unavailable` component states.
- Readiness does not verify migrations, provider credentials/model access, or that workers are running. Inspect migration status and each worker's `worker_ready` log separately. Neither endpoint makes a paid provider call.

## First test workflow

Use a short Chinese clip with audio before trying a long movie. Supported upload extensions are `.mp4`, `.mkv`, `.mov`, `.webm`, up to **512 MiB**; uploaded contents are probed before acceptance. AI stages below are explicit **paid** operations; only run them when you intend to spend provider credits.

1. Open the app and go to `/projects/new`.
2. Fill project name/languages, choose a movie file, then click **Create Project**. This form uploads media and creates the project together; it is not an automatic full processing pipeline. Existing projects are listed at `/projects`.
3. Record the slug from the resulting `/projects/{slug}` URL. Get the real uploaded Movie database ID using the read-only list:

   ```bash
   curl -fsS http://localhost:3000/api/movies
   ```

   Identify your new movie by its title/project. Each Movie in API `data` contains its own `id` and a nested `project` with `id`, `name`, and `slug`; `GET /api/projects` also lists project database IDs and slugs. Seed-only Movie metadata without actual media is not a processing sample. Set this shell variable to the uploaded Movie's **database ID**, not the project slug:

   ```bash
   MOVIE_ID=YOUR_UPLOADED_MOVIE_ID
   ```

4. **Process media** with the media worker running. The current overview pipeline is a demo preview; use the actual API rather than expecting a processing button there:

   ```bash
   curl -i -X POST "http://localhost:3000/api/movies/${MOVIE_ID}/process-media"
   curl -fsS "http://localhost:3000/api/movies/${MOVIE_ID}/process-media"
   ```

   POST normally returns 202, meaning queued, not finished. Repeat only the GET to poll until `data.state` is `completed`. If failed, inspect the controlled error/worker log before continuing.

5. **Transcribe** after media completion, with the transcription worker running. This POST queues paid speech-to-text:

   ```bash
   curl -i -X POST "http://localhost:3000/api/movies/${MOVIE_ID}/transcribe"
   curl -fsS "http://localhost:3000/api/movies/${MOVIE_ID}/transcribe"
   ```

   Poll GET until completed, then inspect `/projects/{slug}/subtitles` (**Source Transcript**, read-only).

6. **Translate** after the transcript exists, with the translation worker running. This POST queues paid translation for segments that need the model:

   ```bash
   curl -i -X POST "http://localhost:3000/api/movies/${MOVIE_ID}/translate"
   curl -fsS "http://localhost:3000/api/movies/${MOVIE_ID}/translate"
   ```

   Wait for completion before opening `/projects/{slug}/translation`. The current Translation UI reviews saved translation; initial translation is queued via the API above.

7. **Review subtitles** in Translation: edit Myanmar text, click **Save**, use **Run QC**, then explicitly **Approve** or **Approve selected** after checking the current text. Saving and local QC do not call AI. Human edits are authoritative and update manual Translation Memory; approval is human-only and text changes invalidate it. Optional **Refine selected with GPT-6 Sol** is a separate acknowledged paid action and will not overwrite human-edited rows.
8. **Detect scenes** at `/projects/{slug}/scenes` using **Detect scenes** with the scene worker running. This is local, not a paid AI action. Wait for completion; intervals are estimates, not guaranteed narrative boundaries.
9. **Analyze characters** at `/projects/{slug}/characters`: with scenes/transcript available and the character worker running, acknowledge the paid action and use **Analyze characters**. Inspect the resulting evidence.
10. **Generate recap** at `/projects/{slug}/recap`: run the recap worker, acknowledge the paid action and use **Generate recap**. Recap is Myanmar text. Scenes and transcript are required; current character evidence is used when available, otherwise recap can show limited character context.
11. **Export** at `/projects/{slug}/export`: choose **Format** (SRT/ASS) and **Review filter** (**All current subtitles** or **Approved only**), then **Download SRT** / **Download ASS**. Approved-only mode omits other rows without collapsing original timing gaps. Export uses current saved human/AI target text and is not a paid AI call.

Project workspaces generally use the newest movie; Translation additionally offers movie selection. For this first workflow, use the project you just uploaded. UI project URLs use **slugs**; `/api/movies/{id}` endpoints use real **Movie database IDs**. Do not substitute a sample/hard-coded project slug for a Movie ID.

Myanmar စာသားပြင်ပြီးရင် **Save** နှိပ်ပါ။ QC finding မရှိတာက **APPROVED** ဖြစ်သွားတာမဟုတ်ပါ။ လူကစစ်ဆေးပြီးမှ approve လုပ်ရပါတယ်။

## Important routes

Replace `{slug}` with your actual project slug; braces are placeholders, not literal URL text.

| Route | Workspace |
| --- | --- |
| `/` | Dashboard |
| `/projects` | Projects |
| `/projects/new` | New project + movie upload |
| `/movies` | Movies |
| `/settings` | Settings |
| `/projects/{slug}` | Project overview |
| `/projects/{slug}/subtitles` | Read-only source transcript |
| `/projects/{slug}/translation` | Human target subtitle editor, review, QC and selective refinement |
| `/projects/{slug}/scenes` | Scene detection/review |
| `/projects/{slug}/characters` | Character/relationship evidence |
| `/projects/{slug}/recap` | Myanmar recap |
| `/projects/{slug}/glossary` | Project terminology |
| `/projects/{slug}/translation-memory` | Project Translation Memory |
| `/projects/{slug}/export` | Current subtitle SRT/ASS downloads |
| `/api/health` | Liveness |
| `/api/ready` | Dependency readiness |

## Run with Docker

Docker is optional. This repository provides a Dockerfile and entrypoint, **not a Compose stack** that automatically starts PostgreSQL/Redis.

Build from the repo root:

```bash
docker build -t movie-translator:latest .
```

The build uses the lockfile and existing build approvals, generates Prisma, and builds Next.js with webpack. `.dockerignore` excludes real environment files, host dependencies/cache, `.git`, and local media. Do not add secrets as build arguments or copy `.env` into the image.

### Prepare private services and runtime environment

The following commands are a **template** for already provisioned private PostgreSQL/Redis services. They assume a Docker network named `movie-translator-private` with reachable service DNS names `postgres` and `redis`. Provision those services first using Docker Compose or your private deployment infrastructure; match actual service names/network names when different. This guide does not change host service listeners or their security.

For a manually managed network, create it once if it does not already exist:

```bash
docker network create movie-translator-private
```

Creating a network alone does not connect/start your DB/Redis. A Compose-managed stack can use its own existing private network instead.

Create a separate runtime file (fresh file only), then fill credentials/models as above:

```bash
cp .env.example .env.docker
chmod 600 .env.docker
nano .env.docker
```

Adjust these entries for the private container services:

```dotenv
DATABASE_URL=postgresql://movie_translator_user:YOUR_PASSWORD@postgres:5432/movie_translator
REDIS_URL=redis://redis:6379
STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=/app/storage
```

Production validation requires an **absolute** root; `LOCAL_STORAGE_ROOT=storage` from the development example is invalid in the production image. `/app/storage` is already prepared for non-root UID/GID **1000** in the image. A fresh Docker named volume mounted there inherits its prepared contents/ownership. If using another path such as `/data/movie-translator` or a bind mount, provision ownership for UID 1000 and mode 0700 first; an arbitrary root-owned empty mount will not satisfy private storage initialization.

Container `localhost` refers to that container, not your host. Host-loopback-only PostgreSQL/Redis are not reachable from a bridge container; a host-gateway alias does not make loopback-only listeners reachable. Do not change them to public listeners or disable authentication to make a smoke test pass. Use a properly configured private Compose/service network. Runtime `--env-file` injection does not copy the file into the image; protect access to the host and Docker daemon.

### Migrations, persistent volume and web

Run deployment migrations once against the intended private database before starting the release:

```bash
docker run --rm --no-healthcheck \
  --network movie-translator-private \
  --env-file .env.docker \
  movie-translator:latest pnpm exec prisma migrate deploy
```

This performs real migrations; check the target database and review backups before using a production connection. Do not seed production automatically.

Create a persistent media volume and start the web container:

```bash
docker volume create movie-translator-storage

docker run -d \
  --name movie-translator-web \
  --network movie-translator-private \
  --stop-timeout 180 \
  -p 127.0.0.1:3000:3000 \
  --env-file .env.docker \
  -e STORAGE_DRIVER=local \
  -e LOCAL_STORAGE_ROOT=/app/storage \
  --mount type=volume,source=movie-translator-storage,target=/app/storage \
  movie-translator:latest
```

The image's `NODE_ENV=production` and default `pnpm start` are retained. The entrypoint executes the existing Next.js Node CLI directly under Tini, so application shutdown is not cut short by a package-manager parent. The port binds only to host loopback. Do not run `pnpm dev` in the production image.

```bash
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/ready
docker inspect --format '{{.State.Health.Status}}' movie-translator-web
```

Expect `healthy` after the liveness health check succeeds. Readiness must also return 200 before treating DB/Redis/storage/binaries as available. Retain the volume across container replacement; do not delete it as routine cleanup.

## Docker workers

Use the **same image**, private network/runtime environment and persistent storage. Worker containers do not publish ports. Disable the web-only HEALTHCHECK:

```bash
docker run -d \
  --name movie-translator-media \
  --network movie-translator-private \
  --no-healthcheck \
  --stop-timeout 180 \
  --env-file .env.docker \
  -e STORAGE_DRIVER=local \
  -e LOCAL_STORAGE_ROOT=/app/storage \
  --mount type=volume,source=movie-translator-storage,target=/app/storage \
  movie-translator:latest pnpm worker:media

docker run -d \
  --name movie-translator-translation \
  --network movie-translator-private \
  --no-healthcheck \
  --stop-timeout 180 \
  --env-file .env.docker \
  movie-translator:latest pnpm worker:translation
```

The entrypoint maps all seven `pnpm worker:*` commands to `node --conditions=react-server --import tsx /app/workers/start.ts <role>` under Tini. Use distinct container names when repeating the template for other roles. Transcription/scenes need the same volume options as media; translation/refinement/characters/recap do not require media mounts.

Check safe startup logs with `docker logs movie-translator-media` or the matching worker name; look for `worker_ready`. In deployment, supervise each container separately with restart/backoff and adequate resource limits. A worker started against an existing queue may immediately process pending paid work. Compose/private infrastructure is recommended for organizing services; there is no checked-in Compose file to run blindly.

## Production startup without Docker

Read [production-runbook.md](production-runbook.md), especially its release gate, storage/backups and supervisor requirements. Keep all services private until authentication, authorization and abuse/budget controls are supplied by the deployment.

Set `.env` `STORAGE_DRIVER=local` and an absolute `LOCAL_STORAGE_ROOT`. For a single-host checkout, find the path with `pwd` and use `<absolute-repository-path>/storage`; production shared storage must persist across releases and be accessible to all relevant processes. Do not leave the relative development value.

Apply migrations, build, then start the production web server:

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm exec next build --webpack
pnpm start
```

For explicit loopback binding, `pnpm start --hostname 127.0.0.1` is available. The verified webpack command avoids the known restricted-environment Turbopack problem. Normal `pnpm build` remains the project's default build script. Do not disable TypeScript/React checks to obtain a build.

Run workers as separate supervised production processes, for example:

```bash
NODE_ENV=production pnpm worker:media
NODE_ENV=production pnpm worker:translation
```

Start other required roles using the worker table, also with `NODE_ENV=production`. Do not put web and every worker into one terminal/background command and assume supervision. Production startup is `next start`, not `next dev`; database migrations precede the release.

## Environment changes require restart

After editing `.env`, stop and restart the relevant web/worker processes. Do not assume running processes reload environment values automatically. For example, restart Next.js after DB/Redis/storage changes, transcription after `TRANSCRIPTION_MODEL`, translation after `TRANSLATION_MODEL`, and recap after `RECAP_MODEL` changes. Key changes affect every AI process using the key.

Docker containers retain their injected environment. Updating `.env.docker` requires recreating affected containers with the updated `--env-file`; `docker restart` alone does not reread the file. Keep the persistent volume when recreating them.

`.env` ပြင်ပြီးရင် သက်ဆိုင်ရာ process ကို restart လုပ်ပါ။ Docker မှာ env အသစ်ရဖို့ container ကို recreate လုပ်ရပါတယ်။

## Safe stop

Locally, press **Ctrl+C** (SIGINT) in each process terminal and allow worker drain to finish. Workers also handle SIGTERM, stop accepting new jobs, finish active work, close owned connections and disconnect Prisma.

For the Docker templates (configured with `--stop-timeout 180`):

```bash
docker stop movie-translator-media
docker stop movie-translator-translation
docker stop movie-translator-web
```

For an existing container without an appropriate configured grace:

```bash
docker stop --time 180 CONTAINER_NAME
```

These 180-second examples exceed the default `WORKER_SHUTDOWN_TIMEOUT_MS=120000`; long media/scene/AI jobs may need a larger worker deadline **and** an even larger Docker/supervisor grace. Configure both before running those jobs. Tini signals the application directly, allowing active child work to drain. Avoid `kill -9` / `docker kill` for normal shutdown; forced termination is a last resort for a stuck process and can cause stalled/retried jobs and repeated provider cost. Never equate a forced kill with a completed drain.

## Troubleshooting

| Problem | Checks / action |
| --- | --- |
| PostgreSQL connection failed | `systemctl status postgresql`; test the `psql -h 127.0.0.1 -p 5432 ... -W` command above. Check `.env` role/database/host/port, URL-encoded password and whether another exported `DATABASE_URL` overrides it. Do not print the URL. |
| Redis unavailable | `systemctl status redis-server`; `redis-cli ping`; confirm `REDIS_URL` points to the intended endpoint/database. An authenticated service needs its configured credentials; do not disable them. |
| Prisma/schema/client error | Run `pnpm exec prisma validate`, `pnpm exec prisma generate`, and `pnpm exec prisma migrate status`. Confirm `prisma7.config.ts` sees the intended DB and apply missing reviewed migrations. Do not reset data to bypass drift. |
| FFmpeg not found | Check `ffmpeg -version` and `ffprobe -version` in the environment running web/worker. Install Ubuntu's FFmpeg package if absent and restart the process. |
| OpenRouter error | Ensure the private key is configured, the correct role's model is set, provider credit/access is available and base URL is unchanged. Review controlled error codes; do not paste the key, full provider reply or transcript. Restart the relevant process after env changes. Do not trigger benchmarks as a routine diagnosis. |
| Jobs queue but nothing happens | Start the correct worker, verify its `worker_ready` log, and match web/worker DB/Redis endpoint/database. Web readiness is not worker readiness. Poll the specific job GET; inspect safe logs. Existing retained jobs can return an earlier completed/failed state rather than start new work. Do not flush Redis/delete all jobs/repeatedly POST paid actions. Consult the runbook for scoped rerun recovery. |
| `/api/ready` returns 503 | Read safe component states: `database`, `redis`, `storage`, `ffmpeg`, `ffprobe`. Check that component's service/config/tool. Storage requires real private writable directories owned by the runtime user, shared where needed. A 200 liveness response does not override failed readiness. |
| Docker readiness 503 with host services | Container loopback is not host loopback. A gateway alias still cannot reach host-loopback-only DB/Redis. Use proper private Docker/Compose/service networking; do not broaden public listeners or weaken authentication. |
| Docker startup reports storage config/access failure | Override relative `LOCAL_STORAGE_ROOT` with an absolute mounted path. Use the prepared `/app/storage` named-volume target, or provision alternate mounts for UID 1000/private modes. Do not run the application as root just to pass readiness. |
| `pnpm build` has Turbopack port-binding / `Operation not permitted` error | The production runbook records a restricted-environment process/port limitation. Use `pnpm exec next build --webpack` for production verification there. If webpack also reports a real application error, investigate it; do not assume every build failure is environmental or disable checks. |
| A port/container name is already in use | Stop your own earlier test process/container safely, or choose another port/name. Do not terminate unrelated services. |

## Git safety

Never commit `.env`/runtime env files, private movie/audio storage, `node_modules/`, `.next/`, generated Prisma client, logs or credentials. Review:

```bash
git status --short
git diff --check
```

The current `.gitignore` protects `.env*` (except the safe `.env.example`), `node_modules`, `.next`, `generated/prisma`, `storage/movies`, `storage/audio`, listed package-manager debug logs and `*.pem`. **It does not blanket-ignore every file under `storage/`, every log name or every credential extension.** Keep other sensitive files outside the repository or explicitly ignored through your approved workflow; inspect new files before staging. Ignoring a file does not protect a secret that was previously committed.

Keep the generated client out of Git; reproduce it with `pnpm exec prisma generate`. Do commit reviewed schema/migrations and the dependency lockfile when intentionally changing those, not generated runtime artifacts. This guide does not require changing application code or committing anything.
