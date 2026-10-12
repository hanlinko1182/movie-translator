# Storyline source preparation — Phase 23.2 M1-B

## Boundary and entry point

Server-only `prepareStorylineSource({ projectId, movieId })` in `lib/storyline/prepare-source.ts` prepares an authoritative, deeply frozen **candidate**. The project ID is the database ID, not the navigation slug. There is no newest-movie fallback. The result is explicitly `{ kind: "PREPARED_CANDIDATE", persisted: false, approved: false, snapshot }`.

This service is deliberately not connected to an API, GET/page rendering, queue or worker. It does not write records, initialize/repair storage, modify media, translate, resolve QC, approve subtitles/scripts or call providers. Existing source/review/render services remain unchanged. Deployment remains trusted-local; this service does not provide multi-user authentication or authorization.

## Coherent capture and freshness

1. A bounded Repeatable Read Prisma transaction executes `SET TRANSACTION READ ONLY`, then reads the exact selected Movie/Project, transcript, scenes, translation/QC, character analysis and optional persisted recap. Existing `loadRecapSource` runs in that same database view to validate CURRENT character analysis and existing recap source identity. Queries are sequential. No file operation runs inside the transaction.
2. After closing it, inspect the original private movie file, stream its SHA-256 and probe video metadata. Verify the recorded byte size when present; measured duration takes precedence over rounded database duration. Never transform the source.
3. Apply M1-A validation/admission and compute immutable candidate hashes.
4. Re-read the dependencies in a second read-only Repeatable Read view. Compare canonical actual values/IDs as well as revisions, approval, QC and provenance; do not rely only on timestamps. A changed or deleted dependency fails with `STALE_STORYLINE_SOURCE`. Recheck file identity before returning.

These checks establish currentness at preparation, not a reservation against later edits. Long hashing cannot hold a database snapshot/lock open. Infrastructure failures remain controlled errors rather than being mistaken for missing records.

## Exact context and evidence

- Reuse M1-A **ALL_CURRENT** admission without an approval filter: valid aligned MODEL, REFINED, TRANSLATION_MEMORY and MANUAL rows are admitted with their exact Unicode text, IDs, languages, timing, revisions, provider/model, refinement/manual binding, approval/edit/review timestamps and complete QC findings/resolutions.
- Missing rows/translation, stale transcript/manual source binding and invalid timing/language/orphan rows remain explicit admission decisions. A wrong movie/parent binding fails capture. Excluded rows remain frozen for audit but must not be used as admitted generation context.
- `translationQcState` distinguishes `TRANSLATION_MISSING`, `UNSCANNED` and `SCAN_RECORDED`. A recorded scan is not a quality certification. Active and resolved findings remain separately represented by their original metadata. No findings are changed.
- Chinese transcript anchors remain primary evidence. Translation approval, manual origin, QC and advisory recap cannot expand character/relationship ownership or provide source-verification receipts.
- Capture each original character/relationship observation, exact evidence/inference, kind, confidence, historical scene/segment IDs, audit dates, aliases and relationship endpoints. Relationship conclusions come from this movie's evidence, not the mutable project-wide summary. If several observations share an owner/anchor, keep them all and project one M1-A allowance using the first ID-ordered observation and the lowest confidence at that anchor.
- Historical child IDs are plain immutable values, not new foreign keys. One scene can support multiple beats; preparation does not create beats or approve claims.
- A legacy recap is `ABSENT`, `EXCLUDED_STALE`, `EXCLUDED_INVALID` or `CURRENT_ADVISORY`. Current output is revalidated with the existing strict recap evidence validator and copied with exact original text and child IDs; its trimmed validator projection is not substituted. A recap never establishes narration approval or truth.

## Media inspection and safe output

Reuse `LocalStorageProvider`, `fingerprintSourceMedia`, `probeMedia` and existing CPU source-inspection limits. The checked private root and movie-key allowlist reject traversal, symlink files/ancestors and non-regular files. Open descriptors without following symlinks. Bound hashing by the initial size and compare device/inode/size/nanosecond modification/change times around hashing, probing and the final dependency check. Same-bytes atomic replacement is still detected. Memory does not hold a whole movie.

Candidate media contains actual SHA-256, bytes, duration, container name, selected video index/codec, dimensions, frame rate/time base and audio availability. Do not copy arbitrary probe tags, absolute paths, storage keys, usage records or secrets into the candidate or error messages. `sourceBindingHash` binds the internal storage key to the exact project/movie; it is not a download token.

Inspection currently inherits conservative CPU profile limits: one video, at most one audio, supported geometry/frame rate/rotation/color/start-time characteristics and recognized MP4/MOV/Matroska/WebM containers. Unsupported media fails explicitly. Successful metadata inspection does not certify complete decoding or browser compatibility. Errors contain static safe messages/codes and no raw database, source or FFprobe output.

## Canonical identities

M1-A canonical serialization preserves exact Unicode and rejects non-JSON/unbounded payloads. Numeric sequences and ID-ordered collections have deterministic ordering. Preparation adds an optional versioned `preparation` section to `story-source-v1`; M1-A fixtures without it retain their existing identities.

- `sourceContentHash`: actual media/transcript/scenes/evidence, admitted target text/timing, captured video metadata, exact observations, aliases and included advisory recap.
- Row-context hashes: exact translation metadata, row/QC and aligned Chinese row; approval/QC/provenance changes invalidate context even without a text/revision change.
- `sourceContextHash`: the complete safety context and admission decisions, including excluded rows, dependency identity, analysis provenance and hashed private source binding.
- Dependency hash: canonical values read from existing source relations, including record identities and audit metadata; cost/usage is omitted. Conservative invalidation is intentional.
- Candidate ID: deterministic dependency/media identity. The capture operation's `capturedAt` does not affect content/context hashes or candidate ID. Domain edit/review timestamps remain meaningful frozen metadata.

## Verification and M1-C prerequisites

### Recap Studio integration boundary

The implemented UI-v2.0-01 route and query navigation are preserved. M1-B must not edit `app/projects/[id]/recap/page.tsx`, `components/storyline/recap-studio-shell.tsx` or `components/storyline/navigation.ts`, or attach preparation to page rendering, navigation, GET, a Server Action or a new Storyline route. The shell continues to say **No persisted source snapshot**; preparing a provisional candidate does not change that state.

`projectPreparedEvidence` in `lib/storyline/evidence-dto.ts` is a server-only, side-effect-free projection for a future UI-02 Evidence Inspector. It operates only on an already server-owned M1-B candidate, revalidates its hashes/admissions and exact expected database project/movie scope, and checks the selected scene/segment anchor. It does not load or persist anything. Never reconstruct a trusted candidate from a client/provider payload; structural revalidation is not proof of server origin, currentness or human verification.

The versioned DTO exposes one exact Chinese segment, the aligned/current or explicitly excluded Myanmar row, original timing, translation revision/provenance/review/edit metadata, separate active/resolved/unscanned QC, anchor-specific character/relationship allowances and observations. Excluded text is inspection-only, never draft context. Subtitle approval and manual origin do not establish semantic verification. It is explicitly `PREPARED_CONTEXT`, `persisted: false`, `approved: false`, with `RECHECKED_AT_PREPARATION_ONLY` freshness and `NOT_PERFORMED` semantic verification.

Owner lists identify only that owner's allowance at the selected anchor; they do not authorize a combined claim. Relationship/character claims still require the existing script validator's exact owner and endpoint restrictions, and trusted server-owned human verification receipts before approval.

Selection requires `sceneSequence`, `segmentSequence`, `qcOffset`, `observationOffset` and `limit` (1–8). QC and observation pages return total/offset/nextOffset; omitted items are explicit, not silently treated as absent. Chinese/Myanmar text and selected findings/observations are exact and never truncated. A 256 KiB canonical UTF-8 output ceiling rejects an oversized view; the caller can explicitly request a smaller page. No automatic retry or data repair occurs.

The projection excludes the full snapshot/manifest, storage/media identities, private source binding/dependency hash, refinement job IDs, manual binding hashes, aliases and legacy recap payloads. Only the bounded DTO may cross a future client boundary. No current component consumes it, and no API is added. UI-02 still requires separately approved scoped transport/currentness design; GET must not hash/probe media or prepare a candidate. M1-C persistence and trusted verification receipts remain separate prerequisites.

Run the existing UI-v2.0-01 navigation component/browser regressions alongside preparation, DTO and integration-boundary tests. Browser fixtures remain synthetic and do not connect to application databases, queues or paid providers.

Synthetic database fixtures prohibit unexpected operations and assert read-only isolation, exact movie selection, no writes, concurrent determinism, multiple beats in one scene, character/relationship restrictions and mid-preparation dependency changes. Filesystem tests use disposable storage: real missing/corrupt/unsafe-file failures, private-directory enforcement and replacement detection. Positive probe metadata is mocked; no media is encoded or existing source inspected. Tests prohibit network/provider requests.

Before M1-C can persist anything, separately approve additive Studio/snapshot/version/verification schema and immutable-payload constraints. Recheck current dependency values and the authoritative private source binding in a fenced commit strategy; store any required server-only key outside the public candidate. Do not rely on a previously prepared candidate's freshness indefinitely. Preserve replaceable live child references as historical values. Implement server-owned human verification receipt persistence/trust separately; neither this preparation service nor structural M1-A validation supplies trusted receipts. No migration or persistence API is part of M1-B.
