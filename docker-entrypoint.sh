#!/bin/sh
set -eu

# Keep deployment command names while avoiding package-manager parents that
# can exit before an asynchronous application shutdown has completed.
if [ "$#" -ge 2 ] && [ "$1" = "pnpm" ]; then
  role=""
  case "$2" in
    start)
      shift 2
      exec node /app/node_modules/next/dist/bin/next start "$@"
      ;;
    worker:media) role="media" ;;
    worker:transcription) role="transcription" ;;
    worker:translation) role="translation" ;;
    worker:translation-refinement) role="refinement" ;;
    worker:scenes) role="scene" ;;
    worker:characters) role="character" ;;
    worker:recap) role="recap" ;;
  esac
  if [ -n "$role" ]; then
    shift 2
    exec node --conditions=react-server --import tsx /app/workers/start.ts "$role" "$@"
  fi
fi

exec "$@"
