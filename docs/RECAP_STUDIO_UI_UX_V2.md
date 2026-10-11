# Recap Studio UI/UX v2.0 — design audit and interaction specification

## 1. Approval, scope and implementation status

The user explicitly authorizes a **Recap Studio-only v2.0 design exception** to [UI/UX v1.0](UI_UX_BASELINE.md). This document and [screen architecture](RECAP_STUDIO_SCREEN_ARCHITECTURE.md) are design deliverables, not an implemented Studio or authorization to execute future backend milestones. Do not change Dashboard, global sidebar/navigation, Projects, Movies, Transcription, Translation, Settings, Advanced workspaces or the existing subtitle/full-movie Export workflows.

Retain v1.0 dark cinematic styling and reusable visual vocabulary. Preserve the legacy Recap viewer, its five tabs, links, real source playback, strict evidence semantics, explicit paid generation/recovery and saved results. The exception permits the proposed Studio composition inside the Recap route; it does not approve a global design system replacement. AGENTS.md and the baseline document remain unchanged in this task.

Within this approved design scope, the separate experience/workspace hierarchy below supersedes the earlier proposal to nest all five Studio subviews inside the legacy Recap Script tab. The earlier backend contracts and milestones still apply; implementation remains separately authorized.

Product identities: `CHARACTER_PSYCHOLOGY`, `AUTO_STORY_COMPLEXITY`, `ALL_CURRENT`, Chinese primary dialogue evidence, mandatory human review/approval, standard Myanmar TTS first, measured voice-first composition, CPU H.264/AAC final video with **original source audio excluded**. Optional authorized cloning comes later. Follow the source and approval rules in [Storyline architecture](STORYLINE_RECAP_ARCHITECTURE.md) and [implementation plan](STORYLINE_RECAP_IMPLEMENTATION_PLAN.md).

Repository audit baseline: HEAD `9099820`; M1-B read-only preparation changes are present but uncommitted. Their presence does not imply persistence, public endpoints or approved scripts. This audit uses source code and existing test definitions, without running the app, querying live records or invoking providers. Responsive descriptions below are design specifications, not new browser verification results.

## 2. Current Recap UI audit

| Area | Implemented behavior and source | Design implication |
| --- | --- | --- |
| Route | `app/projects/[id]/recap/page.tsx`; `[id]` resolves Project **slug**, APIs use database IDs | Keep existing route and breadcrumbs; never pass a slug as an API project ID |
| Movie choice | Explicit `movieId` is validated and queried within the project. Invalid/foreign selection returns not-found. If omitted, latest `createdAt`, then ID, selects the movie | Preserve old-movie selection. Pin the resolved ID when entering Studio; never silently follow a later upload |
| Composition | `RecapControls.tsx`: header/actions; source, prerequisites, scenes and summary on left; five-tab context panel on right at `xl` | Preserve the saved viewer. Studio can use its own scoped panel composition |
| Source preview | Shared native `SourceVideoPreview`, private scoped GET/HEAD and ranges; actual metadata, seek, volume/fullscreen and honest playback errors | Reuse it; source playback is not generated narration or a rendered Studio preview |
| Timing interactions | Section selection seeks to its starting scene; evidence disclosure seeks to its transcript segment; selected timing shown | Retain both. Scene List and left scene cards are interval displays, not currently clip editors or individual seek controls |
| Saved content | Myanmar title/summary/sections; character and relationship insights; generation metadata | Read-only legacy output, no script editing, versions, approvals, voice or timeline |
| Evidence | Scene/segment references, notes, source timing and limited Chinese excerpts; current source comparison for staleness | A full Studio claim comparison needs a new safe snapshot DTO; legacy excerpt data is insufficient |
| Generation | Generate/Regenerate/Retry with paid-token acknowledgement, synchronous double-click guard, safe error messages | Preserve this independent legacy workflow; do not repurpose it to generate Studio scripts |
| Recovery | Failed attempt confirmation uses job ID/failure token; unsupported retained failures explain why Retry is disabled | A worker restart or Refresh Status must never be described as a retry |
| Polling | Active BullMQ states trigger abortable 2-second GET polling, bounded to 150 cycles; refresh can resume checks | Reuse the lifecycle pattern, not assumed Studio endpoints or task semantics |
| Export | Open Export preserves selected movie. Existing export supports SRT/ASS, Burn-in MP4 and Soft Subtitle MP4; Recap Video remains unavailable | Studio Export is a separate future recap composition workflow |
| Accessibility | Named tablist/tabpanel, roving focus and directional keys; focus styles, labels, semantic buttons/details, `lang="my"` | Preserve these and extend the new hierarchy with clearly distinguished landmarks |

### Existing five tabs — retained under Saved Recap

| Existing tab | Actual purpose |
| --- | --- |
| Recap Script | Read-only ordered saved sections, violet selected section, summary and evidence |
| Characters | Saved recap character insights, uncertainty/support labels and first evidence anchor |
| Relationships | Saved relationship interpretations, endpoint names, uncertainty and first anchor |
| Evidence | Aggregate section/character/relationship anchors; all saved insights' references are available here |
| Scene List | Persisted scene intervals/methods, with “In recap” where a saved section covers a scene |

The tab choice is currently local React state and defaults to Recap Script; there is no existing URL tab parameter. Existing `recap-tab-*` element IDs and project/movie URLs should remain valid. Do not claim that individual legacy tabs already have bookmarkable routes.

### Existing state findings

- No project/load failure: not-found or shared `WorkspaceUnavailable`. No movie: Open Project. Missing/empty transcript or no scenes: prerequisite explanation and relevant next action.
- Current/stale saved result remains readable. Failed job and a prior successful result can coexist; the header can say Failed while saved content is still displayed. Preserve result and attempt as separate facts.
- Active generation shows a spinner and real job state, without an invented percentage. Failed state exposes Retry Generation when retained failure metadata supports it, plus GET-only Refresh Status. Provider unconfigured and job-status unavailable have separate messages.
- Legacy character analysis is **optional/advisory**; absent or stale analysis permits plot-focused legacy generation. Planned CHARACTER_PSYCHOLOGY Studio preparation requires CURRENT analysis. Do not change the legacy prerequisite to match Studio.
- The server catches a failed recap read and leaves `initial.recap` null; that path can resemble an empty result. Future Studio reads must distinguish unavailable from absent instead of inheriting this ambiguity. No fix is implemented here.
- Current compact evidence cards omit the Chinese excerpt even though the read DTO has a bounded excerpt; the UI does not offer the full paired source/translation review or human source-verification controls required by Studio.
- Existing `xl` split stacks below 1280px; legacy tabs wrap into two columns at mobile, three at `sm`, five at `xl`. Some lists use capped internal scroll areas. Review focus reachability and scroll behavior when adding Studio panels rather than stacking more nested scroll regions.

## 3. Proposed navigation hierarchy

```text
Global sidebar (unchanged)
  Project workspace → Recap
    Breadcrumb: Projects → Project → Recap
    Selected movie identity + source/currentness summary
    Experience navigation: Saved Recap | Storyline Studio
      Saved Recap: existing five tabs and existing paid actions
      Storyline Studio: Script | AI Review | Voice | Highlights | Export
        Local panel disclosures: beats / source & evidence / versions, as relevant
```

Keep the unadorned `/projects/{slug}/recap?movieId={id}` as Saved Recap. Propose `&studio=script|ai-review|voice|highlights|export` for Studio links, with no new global sidebar items or top-level application routes. These query values are **proposed**, not implemented. Preserve unrelated supported query values and hashes when constructing links. A return to Saved Recap removes only Studio-specific state; it retains `movieId`. Invalid explicit movie selection never falls back. Unknown Studio workspace values should show a safe navigation fallback, not perform a mutation.

Use links with `aria-current` for URL workspace navigation, and genuine button tabs only for local panels. Name navigation regions “Recap experience”, “Storyline workspaces” and the existing “Recap views”; do not create two ambiguous “Script” tabs in one tablist. Returning from Studio must leave all five legacy tabs reachable. Dirty editor handling is scoped to Studio and must not introduce global route blocking.

## 4. Workspace designs

### Script

- **Primary surface:** ordered beat list and selected-beat narration editor. Show category, actual source interval, OBSERVED/INFERRED claim count and review state; one scene can contain many beats. Never derive beat count from scene count.
- **Editor:** labeled Myanmar textarea, exact preserved Unicode/line breaks, visible dirty/saving/saved/conflict state. Explicit Save creates a parent-linked immutable script version; no keystroke generation or autosave requests. Invalid local drafts may remain visible, but cannot become validated saved versions.
- **Context:** source/evidence inspector, allowed characters/relationships, inference basis and cautious wording. Clause-to-claim mapping must survive editing or show a blocker; arbitrary narration cannot bypass grounding.
- **Duration explanation:** source runtime, supported versus provisional events, approved policy identity and actual available coverage when known. Until numeric policy/calibration exists show “Supported duration pending verification” or “Voice duration unavailable”. Existing M1-A duration code validates identities/eligibility; it does not compute a budget. Do not implement the architecture's unapproved coefficients in UI or inflate text to meet a target.
- **History:** explicit version selection, parent, saved time, origin and historical approval/currentness. Opening history is read-only. Editing an old version creates a new draft after explicit save; it does not overwrite or silently restore approval.
- Dominant CTA: Save version while dirty; otherwise the applicable explicit draft-generation action when its backend exists. Source preparation is a separate unpaid explicit action. Keep approval in AI Review.

### AI Review

- Beat/claim queue, exact selected narration and side-by-side Chinese source/Myanmar contextual target on desktop; stack languages on narrow screens. Show read-only source timestamps and a source seek action.
- Each Myanmar row carries **separate** subtitle approval, MANUAL/model/refinement provenance and active/resolved/unscanned QC. Missing/stale/invalid rows show exclusion reason with Chinese-only context; no replacement text or Approved Only filter.
- Claims show OBSERVED versus INFERRED, allowed owner-specific anchors, uncertainty, observed basis and qualification. Translation text or a generic scene match cannot broaden character/relationship ownership.
- Distinguish deterministic structural validity, AI proposed findings, human comparison outcomes and script approval. Invalid IDs/ownership/freshness can never be waived. AI “pass”, high confidence and APPROVED subtitles cannot create SOURCE_VERIFIED.
- Human comparison records Supported / Unsupported / Inconclusive against exact bound source/claim/context. Evidence remains assessed transcript support, not guaranteed objective truth. Receipt entry stays unavailable until server-owned persistence and policy exist.
- Blocking findings lead to source comparison or a corrected saved version. Advisory language findings allow policy-permitted explicit disposition with rationale. Manual findings are not auto-cleared by AI review.
- Evidence/psychology review and Myanmar narrative review are separate explicit paid actions. Save, disposition, verification and approval are unpaid. The primary CTA becomes Approve Script only when current backend eligibility proves all material narration source-verified and required reviews/dispositions complete. Explain every disabling blocker.

### Voice

- Show real provider/standard Myanmar voice capability state; never imply OpenRouter supplies TTS or cloning. Missing configuration is an honest neutral unavailable panel with operator guidance, not a fabricated selector.
- Require the exact current approved script. Show selected standard voice/profile identity, narration versions, per-beat job/asset state and real measured duration/checksum verification status.
- Explicit paid confirmation lists selected beats, request ceiling and reported/unknown cost. Successful takes may be reused only by exact approved recipe; partial failure does not regenerate every beat automatically. Ambiguous provider-send outcome remains deferred for explicit resolution.
- Use native `<audio controls preload="metadata">` only for verified available artifacts through a future scoped endpoint. Label beat and voice. Listen approval is an explicit human action for the exact voice set; successful decoding is not pronunciation approval.
- Cloning remains a concise “Later: authorized voice profiles” explanation, without sample upload, provider transmission or enabled cloning controls.

### Highlights

- Source video is the main visual surface. Evidence-linked interval suggestions and selected-beat timing appear alongside it. Suggestions are not assertions about visible characters/actions; require actual human visual review.
- Edit **clip plan** start/end/order through labeled millisecond-based controls; original transcript/scene timing stays read-only. Offer keyboard reorder buttons alongside any later pointer interaction.
- Reordering clips within a beat and saving/approving the plan is distinct from reordering beats, which creates a script version and invalidates relevant approvals.
- Voice-first representation uses real measured beat audio, source interval labels and proportional interval blocks only when their data exists. No invented waveform, frame thumbnails, or drag-to-seek interface before implementation.
- No suitable clips and insufficient unique footage are explicit states. Once measured, show the actual coverage deficit; never fill it by hidden repeats, freezes, speed changes, audio truncation or extra narration. Source preview may play original audio for inspection; final recap excludes it.

### Export (inside Studio)

- Summarize exact approved script/source, human verification/reviews, voice set, clip plan, timeline and fixed render profile. Show dependency-specific stale/missing reasons. Do not reuse subtitle approval as narration approval.
- Require explicit local CPU/resource confirmation and Start Render. Show only real persisted tasks, phase/progress when reliable, and backend-supported retry/cancel/resume. Worker availability does not imply submission or completion.
- Final audio policy is visibly “Myanmar narration only · original movie audio excluded”. No source-audio toggle, TTS regeneration from render, soft subtitle option, blur, arbitrary FFmpeg options or full-movie dubbing.
- Verified available MP4 output gets a scoped download action. Historical completed output remains labeled historical if current dependency equality is unknown. Missing artifact means unavailable, never automatic regeneration.
- Keep the unrelated project Export unchanged, including its unavailable Recap Video slot until a separately authorized integration milestone. Never send a Studio timeline to the existing whole-movie render endpoint.

## 5. Studio visual vocabulary

| Pattern | Proposed Studio treatment |
| --- | --- |
| Theme | Existing zinc backgrounds/cards, fine white borders, restrained violet selection; no new global tokens/fonts |
| Navigation | Compact experience links and five workspace links; no second application sidebar |
| Hierarchy | 24px semibold page title; 14–16px section titles; 14px Myanmar editor/body with line-height 2; 11–12px metadata/timestamps |
| Density | Existing 8–12px control gaps, 16–20px panel padding, 20–24px section spacing; one outer card per functional panel |
| Editor | Recessed existing control tone, wrapping textarea, clear label and save-state text; no decorative glass layers |
| Buttons | Shared primary/secondary/link hierarchy; one dominant CTA per task area; separate paid, approval and CPU actions |
| Evidence states | Green: current supported human receipt/approved artifact; amber: provisional/pending/stale/shortage; red: invalid/failed; violet: selected/active; neutral: unconfigured/missing/waiting/read-only |
| Meaning | Always pair tone with exact text. CURRENT analysis ≠ verified claim; SOURCE_VERIFIED ≠ approved script; Completed ≠ current output |
| Players | Existing native video for source; native audio for verified future voice assets; no autoplay/fake poster or waveform |
| Timeline | Labeled beat/clip rows initially, actual sample durations and source times; a proportional bar is optional real-data presentation, not a production editor claim |
| Feedback | Inline field error and panel summary, persistent dirty state, safe conflict/retry guidance, polite save/job announcements |

## 6. Responsive and accessibility design

At **1440px**, retain the 256px global sidebar and shared content/padding. Approximately 1120px remains for Recap content. Script/Review may use three panels: compact beat queue, primary editor/comparison, evidence inspector. Reserve at least 360px for the editor and 280px for the inspector; fold history into a disclosure rather than adding a fourth column. Highlights emphasizes video; Voice/Export generally use two panels. See wireframes in the screen architecture.

At **1024px**, the existing sidebar still consumes 256px and content is approximately 704px after padding. Do not squeeze three columns into this width. Move beat selection above the editor, stack source comparison and supporting panels, and use optional compact two-column summaries only where content fits. Disclosure state must not discard narration or restart media/provider tasks.

At **390px**, keep existing mobile application navigation. Use one primary panel and a named workspace navigation disclosure. Beats, source/evidence and versions open inline with a clear return to the editor, retaining draft state. No page-level horizontal timeline, truncated tabs, sticky overlay over native media controls, or mandatory drag operation. Do not render a second large source player above every editor.

Accessibility acceptance: labeled Chinese/Myanmar text and `lang`, exact-text wrapping with whitespace preservation, no glyph clipping/fixed text-card height, visible violet focus, text-backed status, labeled icon actions, usable touch targets, numeric timing labels/units, keyboard list navigation/reorder, disclosure-expanded state and unique tab/panel IDs. Confirmation dialogs need focus entry/return, Escape and keyboard handling; no background submit on close. Announce save/conflict/errors without reading private text aloud automatically. Avoid per-poll repetitive announcements, nested scroll traps and color-only selection. No viewport-specific action loss.

## 7. Incremental integration and acceptance

Recommended first coding milestone: **Recap Studio navigation shell and read-only capability/context panels**, with no new persistence or generation. Preserve Saved Recap as the default, keep `RecapControls` functioning, pin selected movie, reuse shared styles/player, and label all unavailable workspaces honestly. M1-B preparation is not a GET operation and has no endpoint; the shell must not invoke it merely by opening Studio. Existing persisted source metadata may be read through an audited server loader; candidate state must never be called a saved snapshot.

Then integrate only separately approved/implemented M1-C–M8 contracts: persisted snapshots/versions → explicit task generation → human review/approval → real standard voice → approved clips → measured timeline → Studio render/download. Do not implement all panels with mock behavior first. Treat the navigation query convention as part of the first milestone's reviewable scope.

Acceptance criteria for every step:

1. Outside-Recap design and current API behavior unchanged; legacy five-tab generation/retry/evidence flows preserved.
2. Old selected movie retained through links, reads, writes, audio, video and downloads; foreign or ambiguous identity blocks action.
3. Controls reflect real backend capability. No new API path, job state, sample text, duration, waveform or artifact invented by UI.
4. GET, page load, tab/navigation, refresh and polling perform reads only. Explicit paid/CPU confirmation is scoped, stale-safe and guarded against double clicks.
5. Mixed approval/manual/QC context remains exact and provisional where applicable. Invalid evidence has no override; human-only approval does not change subtitles/TM/QC.
6. Saved/historical/current/dirty states are independently understandable. No lost edits, silent rebase, false approval or auto-regeneration after failure.
7. Browser fixtures at 1440/1024/390 cover keyboard navigation, long Myanmar, no overflow, honest unavailable states, errors and accurate source seeks. Simulated fixtures do not establish real media playback or provider quality.

Open dependencies: additive persistence/receipt APIs, approved human review rubric, duration coefficients/calibration, actual Myanmar-capable TTS, clip/timeline validation, separately approved fixed recap render profile and verified delivery. These are implementation/product dependencies, not reasons to weaken evidence gates or redesign unrelated screens.
