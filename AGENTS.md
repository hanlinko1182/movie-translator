<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Movie Translator Development Rules

## Project

Movie Translator processes long Chinese movies, generates Chinese transcripts, translates them into natural Myanmar subtitles, analyzes stories, characters, and scenes, generates character-driven recaps, and exports subtitles.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- lucide-react
- pnpm

Planned backend technologies include PostgreSQL, Prisma, Redis, BullMQ, FFmpeg, cloud AI APIs, OpenAI Speech-to-Text, and DeepSeek for Chinese-to-Myanmar translation and quality checking. The project does not use a local GPU. Do not introduce GPU-dependent libraries or local AI models.

## Development Rules

1. Preserve the existing dark cinematic UI style.
2. Use TypeScript.
3. Prefer Server Components unless interactivity requires a Client Component.
4. Add `"use client"` only when necessary.
5. Use Next.js `Link` for internal navigation.
6. Do not use raw `<a>` tags for internal application routes.
7. Avoid unnecessary dependencies.
8. Do not install packages unless explicitly requested.
9. Do not change backend architecture unless explicitly requested.
10. Do not add database, Prisma, Redis, BullMQ, FFmpeg, or real AI integration yet unless the task specifically asks for it.
11. Do not expose API keys in frontend code.
12. Keep AI provider integrations behind abstractions when backend work begins.
13. Do not rewrite unrelated files while implementing a feature.
14. Keep changes small and feature-focused.
15. Reuse existing UI conventions.
16. Avoid excessive glassmorphism.
17. Use the existing zinc/neutral dark visual language.
18. Keep layouts responsive.
19. Use accessible buttons, inputs, and labels.
20. Avoid hard-coding project IDs in new dynamic project routes.
21. New project-specific links should use the current project ID.
22. Mock data is acceptable during the frontend phase.
23. Clearly separate mock data from future backend integrations.
24. Do not delete working functionality without explicit instruction.
25. Before finishing a coding task, run `pnpm lint`.
26. Report files created, files modified, commands run, lint result, and any remaining issues.

## Frontend Roadmap

- Dashboard
- Projects
- New Project
- Project Overview
- Translation
- Recap
- Characters
- Scenes
- Subtitle Editor
- Glossary
- Translation Memory
- Export
- Movies
- Settings

Already implemented: Dashboard, Projects, New Project, Project Overview, Recap prototype, and mock recap API.

Next planned screen: Translation.

## Architecture Direction

```text
Browser
→ Next.js Dashboard
→ API Layer
→ PostgreSQL
→ Redis / BullMQ Worker
→ FFmpeg
→ Speech-to-Text
→ Story/Scene/Character Analysis
→ Chinese-to-Myanmar Translation
→ Quality Check
→ Human Review
→ SRT / ASS Export
```

Long-movie processing should eventually be chunked, with jobs designed to be independently retryable.
