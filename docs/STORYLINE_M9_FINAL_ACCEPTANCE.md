# M9 final acceptance and M5-01 handoff

## Scope, baseline and verdict

Acceptance date: 2026-10-18 (Asia/Bangkok). **M9 Final Acceptance PASS — recovered R0–R4 and M9-05 together, synthetic/disposable only.** All required checks completed successfully in this milestone. Production authentication/read/write/provider/approval activation remains disabled.

Entry state is clean on `recovery/m9-studio`, HEAD `6597edf910db352fcfa78b3ec826e2b8e30773c8`. The audited chain is `b8780ee` (M4/M5 handoff), `0218854` (R0–R3 recovery), `6db849c` (R4 foundation), `6597edf` (M9-05 integration). Commit inventories agree with the files described in the recovery reports. Earlier statements about unstaged recovery files describe those milestones' entry snapshots, not the current committed tree. Historical PASS counts are not used as current evidence.

Read AGENTS/CLAUDE, the frozen UI baseline, all three recovery reports, M5 voice handoff, actual preview/editor/session/panel/shell, R4 contracts/parsers/auth/service/database/SQL, M4 narration contracts/context and the current M5 proposal/adapter/artifact contracts and disabled assessor. Existing production Recap composition and disabled Storyline task routes were inspected. No new UI, authentication, migration, endpoint, provider or M5 implementation is part of this milestone.

This verdict covers **synthetic/disposable Studio recovery**, not production readiness, Chinese semantic truth, Myanmar editorial approval or voice eligibility. No real narration artifact currently qualifies for provider submission. Completed recovery features are presentation (M9-01), local evidence review (M9-02), memory-only editing (M9-03), authenticated disposable foundation (R4/M9-04) and synthetic immutable save integration (M9-05). Voice/Highlights/Export destinations retain honest unavailable states; accepting their navigation does not claim those later processing features exist.

## Functional acceptance map

| Requirement | Executable evidence and audited behavior |
| --- | --- |
| Six destinations | Navigation/component/Chromium suites retain Saved Recap, Script, AI Review, Voice, Highlights and Export, the frozen responsive shell and legacy Recap functionality. |
| Narration and evidence | Ordered Myanmar sections, exact draft/source/candidate provenance, Chinese transcript/quotes/captured observations, character/relationship ownership, missing-reference states, source intervals and unknown voice duration. |
| Psychological analysis | Character-linked original claims retain observed/inferred classification, qualifications, observed basis, uncertainty and contradictory interpretations. An edit does not approve or rewrite that evidence lineage. |
| Local editor | Exact Unicode, bounded inputs, live local preview, dirty text, explicit reset confirmation/cancellation, and immutable original draft. No autosave/storage/provider action occurs. |
| Persistent synthetic flow | Explicit authorized parent read → captured full text/key → immutable save → independently authorized exact read-back → independently authorized history summary verification. |
| Saved history | Scoped immutable IDs/hashes/version/previous pointer/editor/time, bounded pages and independently read selected preview. Loading saved text requires explicit discard confirmation when dirty; cancellation preserves text. |
| Failure recovery | Duplicate click coalescing; same-key/bytes idempotency; changed payload/key rejection; real independent writer race; explicit conflict/refresh/head acceptance; rollback; lost-response reconciliation; no silent overwrite or automatic provider retry. |
| Isolation | Project/movie/source/draft/candidate/target/session-key changes reset memory. Late disposed responses do not update a new editor. An already dispatched save may finish in its original authorized scope; unmount is not transaction cancellation. |
| Accessibility/layout | Native controls and labels, focusable long text, manual keyboard tab activation, keyboard Save, error/status feedback, wrapping and no page overflow at 1440/1024/390 px. Browser tests plus screenshot review establish the covered interactions; this is not a comprehensive assistive-technology certification. |

Dirty state is relative to the verified saved or explicitly loaded editor baseline. Differences from the immutable AI draft remain labeled separately. Reset to original can legitimately be dirty relative to a saved version. Same-scope destination switches preserve buffers; identity/source changes deliberately clear memory rather than carrying text across scopes. Native unload feedback and saved-version replacement confirmation do not imply recoverable autosave or a universal Next.js route-blocking system. These memory limits remain visible.

## Security findings and trust boundaries

1. **Production defaults remain unavailable.** The production Recap page passes neither `previewForTest` nor `versionAdapterForTest`. `STORYLINE_STUDIO_VERSION_PRODUCTION_ENABLED` is false. No R4 route/Server Action/bootstrap exists. Existing Storyline task routes call `createScopedStoryTaskApi()` without dependencies and return unavailable for reads/mutations. Legacy Recap/source/subtitle/export behavior is preserved, not newly activated by acceptance.
2. **UI injection is not authority.** Synthetic mode, `identityKey`, selected movie, supplied hashes and presentation consistency checks cannot authenticate a caller. Test composition lives under `tests/`. Browser test RPC/session/fault controls run only in a dedicated localhost fixture process with new disposable PostgreSQL; they are absent from application routes.
3. **R4 independently authorizes every operation.** Native Request method/URL, pinned Origin, same-origin Fetch Metadata, a server-owned unexpired/nonrevoked session, save CSRF, exact Project/Movie/Studio read/save grants and unchanged actor are checked on the server. Tenant/ownership/session/permission/expiry mappings are checked again by PostgreSQL. Forged roles, broad process grants or copied authority objects do not bypass that boundary.
4. **Source and ancestry are reacquired.** The original durable M4 row ID/hash is distinct from payload ID. Complete M1 source and M2/M3 task/result/candidate lineage is compared with independently reconstructed, currently fenced source/media. Source revisions and edit-history revisions are distinct. Browser JSON cannot prove persistence/currentness or replace the authoritative parent.
5. **Restricted immutable persistence is enforced.** Separate reader/writer logins have no owner/DDL/issuer/checkpoint/spending powers, no direct private R4 DML/SELECT, and pinned SECURITY DEFINER gateways. Transaction/backend/operation/target/proposal-bound HMAC, a private short-lived fence, scope/source locks, revision CAS, scoped idempotency, canonical hashes, parent/self FKs and UPDATE/DELETE/TRUNCATE guards protect saved history. Post-insert or final source/session failures roll back the transaction.
6. **Source-table access remains a production blocker.** R4 inherits trusted-server source SELECT privileges for M1 reconstruction; it does not implement complete per-user RLS over every source table. R4's public gateway/service methods enforce exact scope. A compromised trusted server/bootstrap/key or privileged schema administrator is outside this disposable acceptance boundary. This is not full production tenant-isolation certification.
7. **Approval and spending remain separate.** Every R4 edit is `SYNTHETIC_TEST_EDIT` with `humanApproval: NONE`, `sourceVerified: false`, `semanticReview: NOT_REVIEWED`, `eligibleForTts: false`, `readyForPublication: false`. An immutable successful save is not human approval, source verification, a voice lease or spending authority. R4 operations leave approval, original, candidate, event and submission counters unchanged.
8. **Unknown outcomes do not authorize replay.** The UI retries an explicit identical version-save proposal/key to reconcile database identity; this never invokes a provider. Existing M2 UNKNOWN/checkpoint controls prohibit speculative paid resend or refreshed authority. Neither missing read-back nor a generic transaction error proves rollback or permits a second paid generation.
9. **Client/server separation is verified at two layers.** Existing static contract tests permit only erased type-only R4 DTO imports in the UI. Synthetic Chromium examines its actual bundle graph for absent R4 service/auth/database/Prisma/bootstrap modules. Final acceptance additionally audits newly built production client chunks and application import/route/action boundaries; exact command/results are recorded below.

All PostgreSQL work uses the existing `DisposableStorylinePostgres` ownership guard: a fresh random database/credentials in an owned marked temporary directory, private UNIX socket and no TCP listener. The application datasource is overridden with an unreachable dummy. Draft SQL is installed only in those owned fixtures; no application database or live migration is accessed. No Redis worker startup or real media processing occurs. Existing foundational regression fixtures may exercise ephemeral synthetic verification ledgers; these are not production human receipts or M9 edit-save approval issuance. No M9 acceptance action issues a real SOURCE_VERIFIED receipt.

## Verification commands and actual results

Fresh acceptance logs: `/tmp/movie-translator-m9-final-FqiXa7/`. Commands run from the project root. Timed server checks run serially without concurrent builds, browser suites or competing PostgreSQL test commands. No deadline, timer, lease, permit, expiry assertion or safety gate is relaxed.

```sh
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 --test-reporter=spec \
  tests/storyline/editor-saving/acceptance.test.ts \
  tests/storyline/studio-versions/contracts.test.ts tests/storyline/studio-versions/postgres.test.ts
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  node --conditions=react-server --import tsx --test --test-concurrency=1 \
  tests/storyline/*.test.ts tests/storyline/jobs/*.test.ts \
  tests/recap/recovery.test.ts tests/recap/response-diagnostics.test.ts \
  tests/video-render/queue-contract.test.ts tests/video-render/snapshot.test.ts
node --import tsx --test --test-reporter=spec \
  tests/storyline/editor-saving/component.test.tsx tests/storyline/ui/script-preview.test.tsx \
  tests/storyline/ui/navigation.test.tsx tests/recap/recovery-ui.test.tsx \
  tests/source-video/preview.test.tsx tests/video-render/export-ui.test.tsx
pnpm lint
DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable \
  pnpm exec next build --webpack
pnpm exec tsc --noEmit
PLAYWRIGHT_MODULE=/home/hanlinko/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs \
  CHROME_PATH=/opt/brave.com/brave/brave node --test --test-concurrency=1 \
  tests/recap/recovery-browser.test.mjs tests/storyline/ui/navigation-browser.test.mjs \
  tests/storyline/ui/script-preview-browser.test.mjs tests/storyline/editor-saving/browser.test.mjs
python3 /tmp/movie-translator-m9-final-FqiXa7/audit-production.py
git diff --check
git diff --cached --check
```

| Required check | This milestone's completed result |
| --- | --- |
| M9-05 focused + R4 contract/security/PostgreSQL | **119/119 PASS**, zero failures/skips; 66.904 s; `focused.log`. Includes 13 M9-05 and 106 R4 checks. |
| Applicable server regressions, including existing disabled voice-handoff contracts | **842/842 PASS**, zero failures/skips; 370.694 s; `server-regressions.log`. All 16 expiry controls passed within this run. |
| All six relevant component/model suites, including source playback and legacy Export | **43/43 PASS**, zero failures/skips; 1.195 s; `components.log`. |
| Four Chromium suites, including new owned PostgreSQL save flow and legacy Recap | **4/4 PASS**, zero failures/skips; 39.811 s; `browser.log`; all cover 1440/1024/390 px. |
| Lint / TypeScript / dummy Webpack build | **PASS / PASS / PASS**, exit 0 for each; `lint.log`, `typescript.log`, `build.log`. Build completed compilation, TypeScript, 12 static pages and traces with the dummy datasource. |
| Production client bundle, source import/route/action audit | **PASS**; 71 freshly built client JS chunks checked against 18 private/auth/bootstrap/database markers and credential patterns; 4 source roots audited; 3 Storyline routes have no injected dependencies; 0 registered Server Actions and 0 production Recap test adapters (`production-audit.log`). |
| Working/staged diff, explicit milestone file and secret-pattern checks | **PASS**; only `docs/STORYLINE_M9_FINAL_ACCEPTANCE.md` belongs to this milestone; no existing source/test changes. |

Fresh Chromium artifacts: `/tmp/storyline-m9-save-browser-ufAzjc/`, `/tmp/storyline-m9-recovery-browser-LJyslF/`, `/tmp/recap-studio-navigation-i5F4TH/`, `/tmp/recap-recovery-browser-nAQLI3/`. The fresh mobile version-history/editor and desktop inferred/contradictory evidence screenshots were visually reviewed. The new save suite reports exact Unicode round-trip and no overflow at each width, no browser errors, unchanged original and approval/job/submission counters, and zero production API/provider calls during editor operations. Local editor/review interaction tests report zero network/API calls at all three widths. The legacy Recap suite intercepts three explicit synthetic retry POSTs and reports zero paid requests; no real Recap retry is made.

The production audit script is retained beside the logs as `audit-production.py`; it checks `app`, `components`, `workers`, `scripts`, the newly built `.next/static/chunks/**/*.js` and `.next/server/server-reference-manifest.json`. Its only source exception is an erased type-only R4 DTO import. It rejects R4 service/authentication/SQL references in application bootstrap, test adapter/fixture references outside the isolated client seam, private R4 table/gateway/session/CSRF/HMAC markers, fixture bootstrap markers, Prisma/database markers and credential patterns in client chunks. This is a concrete source/build inspection, not a general security or penetration-test certification.

### Expiry-control risk

R4 previously recorded one genuine failing positive control: `M4 expiry M1 last: actual wire before expiry 2 retains original definitive result after expiry`, expected fake-wire entries 1, observed 0. Its later isolated/full passes did not establish a root cause. It uses a 700 ms confirmation and separately bounded one-use permit; scheduling, confirmation/lease expiry and permit deadlines must remain distinguishable. Historical passes are not a repair. This final acceptance run passed all 16 unchanged expiry controls inside the 842/842 server run, including the previously failing M1-last repeat 2. No expiry recurrence or current test failure was observed; no targeted rerun was used to conceal a failure. This does not recover the historical incident's exact cause or certify production timing. Any recurrence requires investigation of observed state/timings and retained logs; no assertion weakening, automatic retry of a paid send or dismissal as “flaky” is allowed. Production deadline/clock/lock-load behavior remains an operational gate even after a passing disposable run.

## Implementation-ready M5-01 handoff

### Eligible artifact and identity boundary

**No existing M4 or R4 artifact is eligible for real voice processing.** `story-narration-draft-v1` originals are provisional and retain synthetic M3 ancestry. `story-edited-narration-v1` saves contain edited text but explicitly retain no approval and synthetic ancestry; their original evidence has not been reconciled against the new prose. Copying the text, applying a HUMAN_EDIT label, setting a Boolean, having subtitle approval, passing AI review or possessing a source-verification reference cannot remove that ancestry or authorize voice.

A future real eligible input must be the exact durable, immutable, non-synthetic narration artifact actually reviewed by an authenticated authorized human under a versioned policy, with current scope/source/M3 lineage and a separately resolved approval receipt. Approval must cover exact final paragraph text and revised/new claim/evidence interpretation, including non-waivable invalid-reference checks, uncertain character/relationship claims and Chinese source comparison. The server must resolve the receipt's canonical artifact hash, policy, source-verification dependency, approver authority, expiry/revocation/supersession and currentness. Source verification alone is insufficient. No approved narration record/issuer currently exists.

The canonical domains must not be conflated:

| Existing artifact | Exact current identity | Future voice disposition |
| --- | --- | --- |
| M4 original | Durable row ID + `draftHash`, domain `story-narration-draft-v1`; separate payload ID | Planning/fake fixture only; real submission blocked. |
| R4 saved edit | Saved immutable ID + `contentHash`, domain `story-edited-narration-v1`; exact original binding and previous ID/hash | Planning/fake fixture only; cannot substitute its content hash for an M4 draft hash. |
| Future approved narration | Server-resolved immutable ID/hash/domain + current approval/source/claim dependencies | Potentially eligible only after all separate approval, capability, spending and deployment checks succeed. |

The existing voice proposal's `narration.draftId/draftHash` and assessor understand M4 sections, not R4 edited records. **Do not cast an R4 DTO into NarrationDraft or put an edit ID/hash into the v1 M4 slots.** Before supporting edited narration, separately review a versioned, discriminated narration-artifact reference with explicit hash domain, approved exact text identity, original/edited parent lineage and approval binding. Use a new schema version for this incompatible change; leave v1 disabled. This is a specified future design task, not a schema/API implemented by final acceptance.

### Reuse current versioned contracts without enabling them

Actual exports reviewed in `lib/storyline/voice/contracts.ts` and `handoff.ts`:

- `VOICE_HANDOFF`: `story-voice-request-proposal-v1`, domain-separated proposal hash, 16 KiB bound, up to 720 planned chunks, `my`/`my-MM`.
- `VoiceRequestProposal` / `parseVoiceRequestProposal`: strict `execution: DISABLED_HANDOFF_ONLY`, exact scope, M4 durable draft/section/chunk/text hash, source snapshot/content/context/dependency/binding/media/revision, M3/M2 lineage, optional approval/quote/spending references, bounded registry voice/profile/capability evidence and normalized audio target. Parser returns `executable: false` regardless of shape-valid references.
- `assessNarrationVoiceHandoff`: binds captured M4 draft/receipt/source/analysis/whole-section text and always returns BLOCKED, real eligibility false, measured duration null and `NOT_ESTABLISHED_BY_PURE_CONTRACT` currentness. Only one whole section (`chunkIndex: 0`, `chunkCount: 1`) is assessed; parser acceptance of a count is not an implemented chunk plan.
- `VoiceCapabilityManifest`: exact provider/model/voice/profile/hash, Myanmar locale, supported deliveries/formats, support evidence/date, byte/concurrency ceilings and quote policy. There are zero verified live registry entries. No provider recommendation or current Burmese support claim is made by this acceptance.
- `FutureVoiceAdapter.synthesize`: provider-neutral input `{requestHash, submissionId, exactMyanmarText, voice, audio}`, opaque future `VoiceSendPermit`, AbortSignal; response union `DEFINITIVE_AUDIO {bytes, providerRequestId|null, reportedUsdMicros|null}`, `DEFINITIVE_FAILURE {safeCode}`, or `UNKNOWN {TIMEOUT|CONNECTION_LOST|AMBIGUOUS_RESPONSE}`. The type has no implementation, runtime permit issuer or network path. A unique-symbol type is not authentication.
- `VoiceAudioArtifact`: proposed `story-voice-audio-artifact-v1`, exact draft/section/chunk/text/request/submission/provider/profile/approval/source context, native/published SHA-256, bytes, actual format and measured duration/probe time, original movie audio EXCLUDED and clonedVoice false. It is metadata-only; no artifact exists.

The v1 proposal/artifact types intentionally do not constitute a complete durable audio protocol. Before persistence, versioned immutable plan/recipe/artifact envelopes must bind the full selected narration kind/domain and complete source/analysis/approval/profile/chunk-plan provenance. Do not add fields silently to v1 or infer database existence/currentness from a parser/hash.

### Fake-only M5-01 work package for separate authorization

1. **Pure immutable chunk plan.** Design a bounded versioned plan from exact captured Myanmar paragraph/section text with stable section order, chunk index/count, exact UTF-8 bytes and domain-separated text/plan hashes. Prefer whole paragraphs; split only at validated Myanmar grapheme/linguistic boundaries within confirmed byte limits. Define separator ownership explicitly and prove ordered reconstruction equals the exact input with no normalization, omission, repetition, rewrite or truncation. Reject an indivisible unit exceeding bounds. Current v1 whole-section text hash uses paragraphs joined with `\n\n`; preserve its semantics or version the change. Estimates remain null/unavailable; do not infer speech duration from English word counts.
2. **Fake capability/adapter isolation.** Build only an explicitly injected fake adapter and separately labeled unverified synthetic capability manifests. Real registry remains empty; fake manifests never claim official support or become production capabilities. Fake permits must be process-owned, non-serializable and nontransferable; no Boolean/symbol cast supplies runtime authority. Permit only deterministic local fixture bytes or pre-owned synthetic audio, with global network-fail assertions and no SDK/env-key fallback. Synthetic test execution must remain permanently incapable of real send, approval or provider spending.
3. **Independent artifact verification.** For any future fake audio path, enforce bounded nonempty bytes, actual parse/decode/probe, mono PCM16 WAV at the explicitly planned 24/48 kHz rate, measured finite positive duration and exact sample/container agreement. Store native bytes/hash separately from any explicitly reviewed derived representation. A container's header claim or a script estimate alone is not measured audio. Return private artifact IDs, not storage paths/provider URLs. Fake signals are labeled synthetic test audio, not verified Burmese speech or a completed real voice take. No original movie audio or cloning.
4. **Canonical identity and provenance.** Hash actual audio bytes with SHA-256; hash metadata/plan/recipe with separate versioned canonical JSON domains. The current canonical serializer accepts only safe integer numbers: pin integer units and a versioned duration-rounding policy, retain the underlying measured sample/probe provenance in the future envelope, and reject fractional/NaN/infinite/unsafe metadata rather than silently coercing it. Bind artifact ID/native+published hashes/byte counts/format/measured metadata to immutable request, fake submission, selected narration identity/hash domain, original and edited lineage if applicable, full source/M3/M2 dependencies, section/chunk plan and profile. Never reuse a text/content hash as an audio hash. Arrival order must not affect assembly. Unique complete coverage is required before final track publication; missing/duplicate/UNKNOWN chunks block it.
5. **Idempotency, authorization and UNKNOWN planning.** Separate stable content/voice/profile/plan/approval recipe identity from expiring quote/confirmation admission identity, following M2. Same scoped key/recipe returns the same fake submission/artifact; changed bytes/voice/source/approval/plan cause conflict or a separately explicit new proposal. Do not refresh a grant, generation, permit or spend cap as recovery. For future real send, use separately approved authenticated canRead/canCreate/canSpend scope, positive current human cost consent, atomic per-request/script/operator/global budget reservation, acknowledged immutable checkpoint commit and a process-owned single-use permit. UNKNOWN or uncertain checkpoint/send preserves unresolved slot/budget and blocks speculative resend; only audited resolution or safe proven non-submission recovery applies. A definitive failure may still cost money. None of these real admission/permit/budget services is implemented or authorized here.
6. **Fake acceptance matrix.** Reject forged/expired/revoked/cross-scope approval or spending references, synthetic-to-real promotion, wrong hash domain, changed text/source/candidate/voice/profile/plan, unsupported locale/style/rate, malformed Unicode/over-limit indivisible units, invalid/broken/empty/oversized audio and forged duration. Test exact Myanmar reconstruction, reordered/duplicate/missing chunks, stable duplicate result, changed-key conflict, simultaneous reservations (when separately authorized disposable schemas exist), cancel-before-send, UNKNOWN no-resend, late result ownership, post-validation rollback, download/metadata integrity and zero provider/network traffic. Preserve current blocked v1 tests as negative controls. An approval-shaped fixture is never issued as a human receipt.

M5-01 may implement pure/fake contracts/planning first after a new explicit request. Durable audio schemas/outbox/private storage publication, probing/transcoding tools, new task kinds, provider support evaluation and live execution each need their own scoped authorization/review. This handoff does not authorize adding packages, installing schemas, executing FFmpeg, deploying sessions, issuing approvals, starting workers, selecting a real provider or spending money.

## Remaining risks, completion and Git disposition

Production remains blocked by real authenticated sessions and resource membership, reviewed tenant/source RLS and least-privilege deployment/key custody, approved schema deployment, real read/write transport, exact narration human approval/claim reconciliation, live capability/format/locale evidence, spending/budget/permit ownership, audio validation/private storage and operational expiry/lock/clock testing. Synthetic success cannot waive any blocker. Source-currentness labels are point-in-time observations, not future voice/publication leases.

**M9 recovery is complete for the authorized synthetic/disposable acceptance scope. M5-01 pure/fake-only implementation is READY for a separately authorized next task; real TTS is BLOCKED.** No implementation defect or failing acceptance check was identified, so no runtime fix or new implementation was introduced. The exact future edited-artifact/approval/voice protocol gaps above are handoff requirements, not silently implemented capabilities.

Only `docs/STORYLINE_M9_FINAL_ACCEPTANCE.md` is created by this milestone. No existing source, test, contract, schema, dependency, environment or prior report is modified. Prior staged work was absent at entry; existing files and all prior/new logs are preserved. After PASS, the authorized local commit uses this explicit path only and message `docs(storyline): complete M9 final acceptance and M5 handoff`; its resulting hash is reported in the final response. No M5 implementation, real provider/TTS, real approval/SOURCE_VERIFIED issuance, production activation, push or destructive Git operation occurred. Stop after M9 final acceptance.
