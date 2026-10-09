# Movie Translator — Approved UI/UX Baseline

## Status and scope

The current Movie Translator UI/UX is approved and frozen. This document records the existing implementation after the visual QA and fine-polish pass; it does not propose a redesign or authorize application changes.

The freeze covers layouts, theme, navigation, spacing scales, typography, shared components, interaction hierarchy, responsive composition, and capability presentation. Persisted content, counts, timestamps, job states, and other real data remain dynamic. Approval of the design does not certify AI output, human approval, or export readiness.

## Freeze policy

1. Do not redesign approved layouts.
2. Do not change the theme, navigation structure, spacing scales, or shared visual patterns without explicit user approval.
3. Reuse existing shared styles and components before adding presentation code. Do not create a parallel design system or introduce new fonts, icon families, or visual dependencies without approval.
4. Integrate authorized new features into the existing layouts and action hierarchy. A feature request alone does not authorize a broader redesign.
5. Targeted bug fixes, accessibility fixes, and security improvements are allowed. Keep them scoped, preserve the baseline wherever practical, and report any necessary visual impact. Broader visual changes still require approval.
6. Preserve existing real-data behavior, human-edit authority, review semantics, source freshness, polling, and explicit paid-action behavior.
7. Preserve honest empty, unavailable, read-only, and not-implemented states. Do not introduce fabricated capabilities or activity.
8. Request approval for a concrete description of any proposed baseline change before implementing it. Update this document when an approved change alters the baseline.

## Approved design language

- Dark cinematic workspace with zinc/neutral surfaces, restrained violet accents, fine borders, and compact editorial panels.
- Clear hierarchy: page title and purpose, contextual actions, workspace panels, then supporting metadata.
- Dense source/review workspaces remain distinct from overview cards and media-library cards. Consistency does not require every screen to use the same composition.
- Use lucide-react icons with existing sizes and spacing. Keep decorative icons hidden from assistive technology and label icon-only actions.
- Avoid excessive glassmorphism, decorative gradients, shadows, nested cards, oversized empty areas, and speculative media imagery. Retain the limited gradients already used in media/context and tips panels.

## Shared implementation references

| Reference | Responsibility |
| --- | --- |
| `components/ui/styles.ts` | Page/container, card, media fallback, focus, button, link, control, and status styles |
| `app/globals.css` | Base colors, system font stack, metadata contrast, focus defaults, Myanmar wrapping |
| `components/layout/app-shell.tsx` | Application shell |
| `components/layout/app-sidebar.tsx` | Global, project, Advanced, and System navigation |
| `components/ui/advanced-workspace-header.tsx` | Advanced breadcrumbs, title, description, and context badge |
| `components/ui/workspace-unavailable.tsx` | Shared unavailable/error workspace with retry and contextual navigation |

These files and the existing page components are the implementation reference. The values below describe the current baseline, not a replacement token system. Preserve intentional local variations.

## Colors and status semantics

| Element | Existing baseline |
| --- | --- |
| Page background / primary text | `#09090b` / `#f4f4f5` |
| Sidebar | `#0d0d10`, subtle white border |
| Cards | `#111115`, `border-white/10` |
| Controls and recessed media surfaces | `#0c0c10` and existing nearby dark tones |
| Metadata | Zinc 400/500; global zinc 500 override is `#8b8b96` |
| Primary action | Violet 600; hover violet 500; white text |
| Keyboard focus | Violet 300 / `#c4b5fd`, visible 2px outline |

| Semantic tone | Meaning |
| --- | --- |
| Green / emerald | Completed, approved, ready, success |
| Violet | Active, selected, processing |
| Amber | Needs attention, review, stale source, uncertainty |
| Red / rose | Failure, destructive action |
| Neutral / zinc | Waiting, unavailable, read-only, not implemented |

Use `badgeClass` and `badgeTones` where applicable. Status text must carry the meaning; color alone is insufficient. Keep workflow state, review state, provenance, and evidence support distinct. A saved result or recorded movie status does not establish an active job, correctness, or readiness.

## Typography and density

- System font stack: Arial, Helvetica, "Myanmar Text", "Noto Sans Myanmar", Padauk, system-ui, sans-serif. These are fallback names, not bundled/downloaded fonts.
- Page titles: `text-2xl` (24px), semibold, tight tracking, including Advanced workspaces.
- Section titles: existing `text-sm` or `text-base` semibold hierarchy; larger titles remain where already used for prominent context.
- Body text: typically `text-sm`, with `leading-6` or the existing workspace-specific rhythm.
- Labels and metadata: typically `text-xs` or 11px; retain readable zinc contrast.
- Timestamps and counts: tabular numerals and/or monospace where already used.
- Myanmar: preserve `lang="my"`, wrapping, and generous line height. Global Myanmar text uses line-height 2 and overflow wrapping; existing explicit `leading-7`/`leading-8` editorial styles remain intentional. Do not clip glyphs or compress lines to fit a card.
- Preserve read-full-text disclosures and scrollable source/target areas for long content.

## Spacing, cards, and controls

- Shared page padding: 16px horizontal / 24px vertical by default; 24px horizontal at `sm`; 32px horizontal and vertical at `lg`.
- Shared content: centered `max-w-7xl` (1280px), `space-y-6` (24px).
- Preserve the existing Tailwind spacing vocabulary: small 8–12px control gaps, 16–20px panel padding, and 20–24px section gaps. Do not introduce a new spacing scale.
- Cards: `rounded-xl`, subtle border, dark surface, `min-w-0`; controls and inner panels generally use `rounded-lg`.
- Unavailable media fallbacks: shared `mediaFallbackClass`, content-safe minimum height of 192px / 224px at `sm`. Movie library placeholders and Recap context retain their existing distinct sizing.
- Buttons: shared minimum height 40px, 8px icon gap, stable icon size, visible focus, disabled cursor and reduced opacity. Compact table actions and links retain their existing intentional sizes.
- Use one dominant primary CTA per action area. Secondary actions use subtle bordered dark surfaces; navigation links use violet text. Keep destructive and paid actions explicit.
- Inputs, selects, and textareas reuse `controlClass` and existing labels. Tabs and filters retain violet selected states, keyboard behavior, and existing responsive wrapping.
- Loading uses existing spinner/status treatment. Show percentages or progress only when supported by real data; do not invent estimates.

## Navigation and sidebar

- Desktop sidebar is 256px (`w-64`) and appears at `lg` (1024px). Preserve its dark surface, brand, active violet state, and group spacing.
- Main navigation: Dashboard, Projects, Movies.
- Within a project, Project workspace: Overview, Transcription, Translation, Review, Recap, Export.
- Advanced: Scenes, Characters & evidence, Glossary, Translation Memory.
- System: Settings, separated with a subtle divider.
- Below `lg`, retain the compact application header and keyboard-operable Navigation disclosure containing the same links.
- Breadcrumbs preserve Projects → current project → workspace context; retain existing back links and active-page semantics.
- Use Next.js `Link` for internal navigation and the current project's dynamic slug. Preserve movie-selection query parameters where the existing flow uses them. Do not hard-code example project IDs or add redundant routes.

## The 14 approved screens

`{slug}` denotes the current project slug resolved through the existing `[id]` route segment.

| Screen | Existing route | Approved composition and purpose |
| --- | --- | --- |
| Dashboard | `/` | Workflow summary, recent projects, attention/activity context, project/upload entry actions |
| Projects | `/projects` | Workflow-centric search/filter controls, responsive grid/list, real next action, New Project CTA |
| Movies | `/movies` | Media-centric library, consistent no-thumbnail placeholder, metadata/output availability, desktop selected-movie inspector |
| Project Overview | `/projects/{slug}` | Project identity, next step, workflow stages, source media and persisted output context |
| Transcription | `/projects/{slug}/subtitles` | Source/context panel, read-only Chinese transcript and timing, status/processing details |
| Translation | `/projects/{slug}/translation` | Source/timing context, dense translated-segment table, glossary/TM/QC tools and human editor |
| Review | `/projects/{slug}/translation?view=review#review` | Human review summary, filtered subtitle rows, selected-segment inspector and explicit review actions |
| Recap | `/projects/{slug}/recap` | Left media/context workspace; right recap section list with violet selection; Recap Script, Characters, Relationships, Evidence, Scene List tabs |
| Export | `/projects/{slug}/export` | Source context, SRT/ASS type cards, settings, output files, honest queue/unavailable-video panels, saved subtitle sample |
| Settings | `/settings` | Category navigation and read-only configuration/system panels |
| Scenes | `/projects/{slug}/scenes` | Detection/status context, persisted interval summary, interval strip/list and selected-scene inspector |
| Characters & Evidence | `/projects/{slug}/characters` | Explicit analysis action, compact summaries, Characters/Relationships/Evidence/Analysis Info views and supporting source anchors |
| Glossary | `/projects/{slug}/glossary` | Search/type filters, terminology table, contextual entry form |
| Translation Memory | `/projects/{slug}/translation-memory` | Compact origin counts, search/origin filters, reusable pair table, entry form and manual-protection explanation |

Review is an existing view of Translation, not a separate `/review` route. New Project (`/projects/new`) is an existing supporting flow outside this 14-screen audit; it also inherits the freeze rules. The freeze does not authorize removal of any other working UI.

## Responsive baseline

Preserve the existing breakpoints rather than introducing device-specific layouts: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px.

| QA viewport | Expected existing behavior |
| --- | --- |
| 1440px | Desktop sidebar, bounded content, existing workspace split panels/inspectors and dense tables. Movies uses a library plus detail panel; Recap keeps its two-column composition; Export retains its 12-column panel composition. |
| 1024px | Desktop sidebar remains visible. Most `xl` workspace splits stack; grids and filters use their existing tablet arrangements. Keep every action and inspector reachable without forcing desktop column widths. |
| 390px | Navigation disclosure replaces sidebar. Main panels stack; filters/actions wrap; dense lists expose mobile labels/card rows as implemented. Dashboard summaries use two columns; character/TM counts remain compact; scene metadata uses two columns with a full-width method row. |

- No page-level horizontal overflow at these widths. Long project names, filenames, Chinese text, and Myanmar text must wrap safely.
- Preserve existing table-to-card breakpoints: Translation/Review and terminology tables need not switch at the same width.
- Maintain usable controls, visible selected rows, readable timestamps, and keyboard access when panels stack.
- Keep Recap tabs reachable on narrow screens, including the full-width final tab at mobile size. Settings categories remain a compact responsive grid before becoming a desktop category rail.

## Advanced workspace conventions

- Reuse `AdvancedWorkspaceHeader`: breadcrumb, uppercase 11px Advanced workspace label, 24px title, concise description, optional neutral context badge.
- Use shared dark cards, compact summaries, violet selection, and the existing responsive list/inspector or table/form composition.
- Keep scene intervals factual; no fabricated scene titles, images, playback, or seeking.
- Character identities and relationships remain advisory. Preserve uncertainty, evidence links, source-hash freshness, provenance, and analysis details.
- Keep Glossary and Translation Memory visually related through the existing entry manager, while preserving their distinct fields and ownership/origin semantics.
- Empty states explain the missing prerequisite or data and offer one clear next action where appropriate. Use `WorkspaceUnavailable` for the load-failure situations it already supports; do not confuse errors with an empty database result.

## Functional honesty and future extensions

- Repository capabilities define functional truth. Screenshots and visual references never authorize unsupported controls.
- Do not fabricate playable media, thumbnails, waveforms, seeking, render jobs, translated/recap video outputs, ETA, confidence percentages, or AI activity.
- Preserve actual SRT/ASS downloads and All Current / Approved Only modes. Unsupported video outputs remain visibly not generated/not implemented until separately authorized and implemented.
- Human edits and approval remain explicit. Do not infer approval from a model, QC result, TM hit, or refinement. Preserve manual authority and paid-action acknowledgements.
- GET/render stays read-only: no enqueueing or paid requests as a consequence of displaying a page.
- New authorized features must reuse the current project context, shared patterns, real-data derivation, empty/error conventions, and action hierarchy. Do not change backend semantics to accommodate visual polish.
- Maintain semantic controls, labels, visible focus, keyboard navigation, contrast, status text, and disabled/loading clarity.
- For future UI changes, inspect the affected existing components first, keep the diff focused, and verify affected states at 1440px, 1024px, and 390px. Follow repository validation rules and report intentional differences or limitations.
- Any approved change to theme, navigation, layout, or shared patterns must explicitly identify its scope and update this baseline document. Do not silently replace the approved baseline during a later development phase.
