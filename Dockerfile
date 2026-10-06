# One image for web and workers; dependencies are pinned by pnpm-lock.yaml.
FROM node:24-bookworm-slim AS base
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*
# Corepack prepares the wrapper; first use also caches pnpm 12's native binary.
RUN corepack enable && corepack prepare pnpm@12.3.4 --activate && pnpm --version
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate
# Non-secret build-only placeholders; no live database or provider is contacted.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    REDIS_URL=redis://127.0.0.1:6379 STORAGE_DRIVER=local \
    LOCAL_STORAGE_ROOT=/tmp/movie-translator-build pnpm exec next build --webpack

FROM base AS runtime
ENV NODE_ENV=production \
    COREPACK_ENABLE_NETWORK=0 \
    STORAGE_DRIVER=local \
    LOCAL_STORAGE_ROOT=/app/storage \
    PORT=3000
# Workers need tsx and deployment migrations need Prisma CLI. Keep the same
# locked dependencies rather than pruning tools that these processes require.
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/storage/movies /app/storage/audio \
    && chown -R node:node /app/storage && chmod 700 /app/storage /app/storage/movies /app/storage/audio
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Signal the application directly so it can drain active work before children exit.
ENTRYPOINT ["/usr/bin/tini", "--", "/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["pnpm", "start"]
