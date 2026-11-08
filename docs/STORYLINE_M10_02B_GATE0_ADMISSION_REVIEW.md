# M10-02B Gate 0 — OpenRouter live-evaluation admission review

Review date: **2026-10-21, Asia/Bangkok**. Scope: **DOCUMENTATION_ONLY / OPENROUTER_ONLY**.

**Live-evaluation admission: BLOCKED.** Gate 0 prepares evidence requirements; it grants no account access, spending approval, speech submission, audio capture, decoding or listening session. No real budget is set. Public model support and successful offline tests do not establish live entitlement, bounded charges, accepted privacy or Myanmar speech quality.

## 1. Repository and evidence baseline

Verified clean `main` at the required HEAD **`1a56ea13038aea20380697642facf70924dbb6a3`**, upstream `origin/main`. Initial index, worktree and nonignored untracked inventory were empty; 695 tracked files. The accepted M10-02A original commit `1e1b96199d229ec448906156532ffa8bc22a0c00` and M8 Phase 1A commit `3c9680227840e3238958d6655e4b94cbc3014f12` are ancestors. Remote-tracking metadata is cached; no remote state was refreshed.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md) and the [latest M10-02A report](STORYLINE_M10_02A_MYANMAR_TTS_PROVIDER_READINESS.md). Inspected the existing test-only [capability catalog](../tests/storyline/tts-evaluation/capabilities.fixture.ts), [corpus](../tests/storyline/tts-evaluation/corpus.fixture.ts), [canonical contracts](../tests/storyline/tts-evaluation/contracts.fixture.ts), [mock spending validator](../tests/storyline/tts-evaluation/spending.fixture.ts), [mock harness](../tests/storyline/tts-evaluation/harness.fixture.ts) and [canonical serializer](../lib/storyline/canonical.ts), without importing or executing them. The mock assessor has process-local WeakMap reservations, synthetic account references and unissued proposals. Its UNKNOWN handling is useful offline evidence, **not durable billing authorization or a live sender**.

This report is the sole new repository file. All existing files, reports and logs are preserved. No branch change, fetch, reset, merge, rebase, push, deployment, credential/environment-file inspection or runtime service operation occurred.

## 2. Evidence vocabulary

| Classification | Meaning |
| --- | --- |
| DOCUMENTED | Current public official statement, checked on the review date; not an account receipt or empirical audio result. |
| UNKNOWN | Required behavior or applicable terms have not been established. It cannot be promoted by inference, catalog marketing, a hash or mock result. |
| ACCOUNT_VERIFICATION_REQUIRED | An UNKNOWN requiring separately authorized, private account-owner evidence or authenticated read-only inspection. **None performed here.** |
| EVALUATED_WITH_REAL_AUDIO | Native byte integrity, independent decoding and human listening evidence from a separately approved trial. **No candidate has this status.** |

The absence of real-audio evaluation is expected before a first trial. It prevents any voice-quality or production claim; it does not justify bypassing the account, privacy, billing and ownership admission gates.

## 3. Current public evidence matrix

All external links below are public documentation/model pages, not authenticated account observations. No model API, voice API, speech endpoint or audio sample was called. Upstream documentation supplies capability/terms context only; direct-provider endpoints remain excluded.

| Review item | DOCUMENTED evidence | Admission gap / classification |
| --- | --- | --- |
| Primary model identity | `elevenlabs/eleven-v3` is a gateway TTS model with a 5,000-character request ceiling and 21 voices. [OpenRouter model](https://openrouter.ai/elevenlabs/eleven-v3). | Exact account entitlement, voice revision and live route: ACCOUNT_VERIFICATION_REQUIRED. Bare upstream `eleven_v3` is not the gateway ID. |
| Speech request | POST `https://openrouter.ai/api/v1/audio/speech`, JSON `model`, exact `input`, explicit `voice`, explicit `response_format`. This is a speech contract, not chat completion. [TTS guide](https://openrouter.ai/docs/guides/overview/multimodal/tts). | Future reviewed sender/SDK schema, retry controls and original-result ownership are absent; UNKNOWN until separately implemented/reviewed. |
| Stock voices and Myanmar | The gateway announcement names `george`, `sarah`, `adam`, `alice`, `bella`, `brian`, `charlie`, `daniel`, `jessica`, `roger`, `will` among premade voices. [Gateway announcement](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). Upstream v3 explicitly lists Burmese (`my`). [Language table](https://elevenlabs.io/docs/overview/models). | Propose only `george`. Exact gateway/model/stock-voice/Myanmar combination, licensing and substitution policy: ACCOUNT_VERIFICATION_REQUIRED. Pronunciation/quality: not EVALUATED_WITH_REAL_AUDIO. |
| Native output | Gateway documents `mp3`/`pcm`, raw response bytes, `Content-Type` and `X-Generation-Id`. [Response contract](https://openrouter.ai/docs/guides/overview/multimodal/tts). The Eleven announcement describes MP3 at 44.1 kHz/128 kbps and default PCM at 24 kHz, mono, signed 16-bit little-endian. [Format claims](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). | Actual encoding, completeness, decoded samples and duration: UNKNOWN; headers and claimed format are not independent verification. Exact speech timing/alignment availability also UNKNOWN; no direct timing API is proposed. |
| Routing | Speech accepts `provider.zdr`/`data_collection`; `order`, `only` and `ignore` are not applied. [Speech-specific routing](https://openrouter.ai/docs/guides/overview/multimodal/tts). | Chat pinning cannot establish a fixed speech upstream. Guardrail effect on this route, internal failover/retries and serving-path receipts: UNKNOWN / ACCOUNT_VERIFICATION_REQUIRED. |
| Privacy | OpenRouter describes opt-in prompt/response retention and separate provider policies; endpoint-specific agreements can differ. [Gateway data](https://openrouter.ai/docs/guides/privacy/data-collection), [provider policies](https://openrouter.ai/docs/guides/privacy/provider-logging), [ZDR](https://openrouter.ai/docs/guides/features/zdr). | Applicable gateway/upstream training, abuse logs, retention, deletion, processing region and accepted settings: ACCOUNT_VERIFICATION_REQUIRED; human acceptance absent. |
| Primary price | Model page displays **USD 80 / million characters**, alongside a launch banner ending October 19, 2026. [Dated displayed price](https://openrouter.ai/elevenlabs/eleven-v3). Gateway announcement defines characters as Unicode code points. [Unit definition](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). | Expired-promotion display is not an effective quote. Current rates, fees/taxes, charged units and a maximum original-request charge: UNKNOWN. No budget inferred or set. |
| Account eligibility | Gateway announcement says a separate ElevenLabs plan is unnecessary for its models. [Gateway access claim](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). | Actual OpenRouter account/plan, geography, model/voice/format entitlement, quotas and key restrictions: ACCOUNT_VERIFICATION_REQUIRED. |
| Spending limits | OpenRouter describes workspace and per-key/member guardrail budgets. [Spend controls](https://openrouter.ai/docs/guides/best-practices/spend-controls). Workspace budgets are Enterprise features and may be exceeded by already-dispatched requests. [Workspace limits and FAQ](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets). | Available controls, exact assignment, remaining allowance, reset/overrun semantics and speech enforcement: ACCOUNT_VERIFICATION_REQUIRED. A displayed threshold alone does not prove a maximum total charge. |
| Secondary model | `google/gemini-3.8-flash-tts` lists USD 0.50/M input text tokens and USD 9/M output audio tokens, AI Studio/Vertex serving paths, and no current EU in-region routing. [Gateway model](https://openrouter.ai/google/gemini-3.8-flash-tts). Full model documents Burmese; `Kore` is an upstream stock voice. [Full language table](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts), [stock voices](https://ai.google.dev/gemini-api/docs/speech-generation). | **Separate evaluation only**, not fallback. Account, exact voice/route, output-token upper bound and privacy remain UNKNOWN. Flash-Lite or direct Google is not a substitute. |
| Original result and private capture | Gateway documents a generation-ID response header. [TTS response](https://openrouter.ai/docs/guides/overview/multimodal/tts). Existing local harness is mock-only. | Provider-supported idempotency, speech-result retrieval after lost ACK, exact cost receipt and native-byte retention/retrieval semantics: UNKNOWN. A header received only on success cannot recover an ID lost before acknowledgement. |

The primary model page also states no current EU in-region routing. A regional privacy requirement that it cannot satisfy blocks that route; it does not authorize another gateway. Generic model-page failover/pinning descriptions cannot override the speech-specific limitations.

## 4. Proposed first trial — unapproved

| Bound item | Proposal, not authorization |
| --- | --- |
| Gateway/model/voice | OPENROUTER_ONLY; exactly `elevenlabs/eleven-v3`; stock voice exactly `george`, subject to fresh entitlement/revision evidence and explicit acceptance. |
| Input/output | Each complete approved passage as exact `input`; proposed native `response_format:"mp3"`. No text prefix, delivery tag, neighbouring context, SSML, cloning, uploaded reference or pronunciation rewrite. Any required language/normalization/provider option must be explicitly reviewed and included in the future configuration hash before approval. |
| Count/concurrency | At most **six original requests**, one full passage per original; concurrency **one**. The 13 review chunks do not become 13 paid requests. Stop on the first unresolved result or failed admission check. |
| Dispatch policy | No automatic/manual resend of an ambiguous original, no SDK/HTTP/proxy retry, no alternate model, stock voice or gateway, no parallel/speculative dispatch, no automatic redirect to another endpoint. |
| Content | Only the unchanged six newly authored fictional Myanmar demonstration passages. No movie transcript, original dialogue, confidential text, real-person data or voice reference. |
| Consent | Explicit account-owner consent, exact model/voice/corpus acceptance, gateway/upstream privacy acceptance, spending and request-count authorization. **Not issued.** |
| Financial limits | Provider-enforced limit **and** independently defensible total maximum charge. Amount, real account configuration and authorization record: **UNSET / NOT ISSUED**. |
| Audio review | Separately authorized private native capture, bounded independent decoder, and two independent qualified Myanmar listeners. None authorized by Gate 0. |

The secondary Gemini route requires its own reviewed account/privacy/billing/model/voice configuration and separate authorization. No cross-model comparison budget, reserve requests or second trial are implicit here.

## 5. Unchanged corpus and exact hashes

Reuse the [existing corpus source](../tests/storyline/tts-evaluation/corpus.fixture.ts), without copying it into another fixture or changing its text. Six passages contain **2,586 UTF-8 bytes, 910 Unicode code points and 13 bounded review chunks**. Code-point counts are not a current charge quote.

- Corpus domain hash: `940ab42793a4316ade9103382bbb31357eff66c55fc8388c2f383c4b96079efa`.
- Raw SHA-256 of canonical corpus payload UTF-8: `fb48bc51b92dee832113223b2483416fb46d74215c907d423a4373ee679c74db`.
- Corpus source file SHA-256: `ceb12a838da4f44f34d9ec487e09a661c156b9a5d4fcd284f01a5ba3b08bab39`.
- Normalization: `EXACT_UTF8_NO_NORMALIZATION_V1`. Segmentation: `INTL_MY_GRAPHEME_PLUS_DEPENDENT_SIGNS_V1`, ICU `78.3`, Unicode `17.0`.

| Passage / review purpose | UTF-8 bytes / chunks | Exact domain text hash |
| --- | --- | --- |
| p1 / narrative | 388 / 2 | `fa0fb51cde9fedcf2e3f2f06b66cb3ccd790cc0fca23cf175b300250295ec737` |
| p2 / emotion and pacing | 397 / 2 | `5a7ca3bd38189647083e62e26aaaea649b522cdc2110c1d50f42649fcf174872` |
| p3 / uncertain psychology | 530 / 3 | `5793fc45db8bb34831b65d48edd8d54b5975ec9c1f79b625f398564c03ddbf4b` |
| p4 / fictional Chinese-style names in Myanmar | 404 / 2 | `5cfa83c10584a4f0730ecede26bb8b0c974da872723d54a7895aa355ecb1c86d` |
| p5 / numbers, dates and punctuation | 416 / 2 | `9de044267844943c5f8106362892a8ce061ff8d878077d17b644c422ea85da13` |
| p6 / negation and qualifiers | 451 / 2 | `59ffcd5ea9478b04001d0f2ab87ba7b59d48cd9cd41ad94db39373f45956430b` |

Hashes use the existing `SHA256(domain + newline + canonicalJson(value))` contract, distinct from raw-byte SHA-256. Static literal extraction and the preserved M10-02A receipt offsets reproduced all six text hashes, 13 chunk hashes and both whole-payload hashes. No fixture module, test runner or segmenter was executed; this does not independently re-certify grapheme segmentation. The previous offsets and segmentation version remain unchanged.

No trim, normalization, transliteration, Zawgyi conversion or content substitution is permitted. Human editorial/pronunciation approval is still absent, including the fictional names လီဝေ and ချန်မင် and intended spoken numbers/date/negation. A content or segmentation change requires a new separately reviewed identity; never relabel changed text with these hashes.

## 6. Privacy conditions before any live disclosure

| Layer | Required acceptance and evidence |
| --- | --- |
| OpenRouter | Account owner accepts applicable terms and the exact disclosure path. Confirm input/output logging, product-improvement opt-in, broadcast/tracing destinations, metadata retention and deletion. OpenRouter describes optional content logging/use, plus anonymous categorization; this is not an absence-of-all-processing guarantee. [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection). |
| Gateway endpoint policy | Capture the policy applying to the exact speech model/serving endpoint, not a provider-wide default. Establish training exclusion separately from retention. ZDR documentation describes endpoint-specific policies; the generic provider-logging page also contains broader retention-routing language. Do not resolve that tension by assuming chat filtering or a configured flag proves speech enforcement. [ZDR](https://openrouter.ai/docs/guides/features/zdr), [provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging). |
| ElevenLabs upstream | Default retention and eligible enterprise ZRM are documented, but direct-account ZRM settings do not establish OpenRouter's negotiated terms. [ZRM](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode). Its privacy policy distinguishes processing under business-customer contracts; identify the applicable gateway agreement, training, abuse-monitoring retention, deletion/backups and region. [Policy, updated October 9](https://elevenlabs.io/privacy-policy). |
| Secondary Google upstream | Paid-service training restrictions are not universal zero retention; abuse-monitoring storage is separately described. Verify the contract for the actual OpenRouter serving path if this separate trial is later proposed. [Terms](https://ai.google.dev/gemini-api/terms), [retention](https://ai.google.dev/gemini-api/docs/zdr). No direct Google account or endpoint is proposed. |
| Local evaluation evidence | Private access-controlled storage only; define owner, reader set, retention/deletion, encrypted handling and redacted audit metadata. No corpus text, native audio, raw errors, credentials, account identifiers or private provider receipts in public Git, browser bundles or public logs. Hashes bind evidence; they do not anonymize it. |

If required ZDR, training exclusion, region or deletion guarantees cannot be evidenced/enforced for the exact route, remain BLOCKED. Non-sensitive demonstration content reduces exposure but does not waive explicit privacy consent. No voice cloning, uploaded voice reference, BYOK or direct-provider credential is part of this proposal.

## 7. Future authenticated read-only review — separately authorized, not performed

A new user instruction must name the permitted account-review scope before any authentication. Prefer account-owner-supplied redacted evidence or supervised owner inspection. No secret is requested in this report; do not print an API key, inspect application environment files, export credentials or log authenticated headers.

| Proposed read-only check | Required private receipt / stopping condition |
| --- | --- |
| Account authority and eligibility | Owner consent, account/workspace reference without public identifiers, geography/terms eligibility, plan, permitted reviewer role and expiration of access. Missing authority: stop. |
| Exact speech entitlement | Current gateway `elevenlabs/eleven-v3`, stock `george`, allowed format, language documentation for that route and voice/version/substitution behavior. Read metadata only; no sample player, test synthesis or voice preview. Unsupported or unresolved entitlement: stop. |
| Serving/privacy configuration | Effective speech routing, model/provider restrictions, region, ZDR/training settings and gateway/upstream terms. Document speech-specific enforcement evidence and internal retry behavior. Unconstrainable required policy: stop. |
| Spend controls already present | Effective workspace/key/guardrail assignments, plan eligibility, limits, current usage/reservations, reset interval/time zone, remaining amount, overshoot/late-billing behavior and all other users of that allowance. No create/update/delete of limits or guardrails under read-only authorization. |
| Quote and quota evidence | Current applicable Unicode character units/rates, fees/taxes/credit conversion, request and response limits, rate/concurrency ceilings, maximum per-original charge and exact quote validity. A rate table without a charge bound is insufficient. |
| Key boundary metadata | Existing broker-controlled credential reference, model/key scope, expiration/revocation and emergency-stop owner. Never expose the key itself. All future AI access must use the single server-side OpenRouter credential boundary. |
| Original-result recovery support | Speech-specific generation/request-ID semantics, availability of original result/cost evidence after timeout or lost headers, supported idempotency if any, retention and recovery limitations. GET-like/read-only labels must be checked against actual documented semantics; no resubmission or synthesized diagnostic call. |

Some administrative metadata may require broad management privileges. Read-only intent does not make a broad credential least-privileged: prefer owner inspection/redacted attestations where a suitably restricted broker cannot be provided. Do not acquire management credentials as a shortcut. Creating resources, changing spend/privacy controls, issuing keys and probing enforcement with billable requests each require separate explicit authorization. A completed read-only review alone still grants no synthesis permission.

## 8. Spending admission requirements — no amount or approval issued

Newly accessible public guidance confirms layered workspace and guardrail budgets; it does not close the earlier account-evidence gap. [Spend controls](https://openrouter.ai/docs/guides/best-practices/spend-controls). Workspace budget documentation specifies Enterprise availability, periodic/lifetime intervals and pre-routing checks; already-dispatched work can finish above the threshold. [Workspace budgets](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets). Guardrails describe per-key/member limits, model/provider allowlists and privacy controls. Empty allowlists allow all; actual speech behavior and account entitlement need evidence. [Guardrails](https://openrouter.ai/docs/guides/features/guardrails).

A future authenticated spending approval must bind all of the following before it can authorize a live sender:

1. Exact OpenRouter gateway/model/stock voice/options/format and immutable account configuration reference/hash, without secrets.
2. This exact corpus/text/chunk identity, complete exact wire-request hashes, a closed list of at most six original-request identities and count ceiling; no replacement identities or implicit chunk dispatch.
3. Independently evidenced billable-unit definition, maximum units per original, effective rate/rounding, overhead/fees/taxes/conversion, quote validity and an independently defensible **maximum total actual charge** in a named currency.
4. Provider-enforced spend-control evidence bound to the same account/key/workspace, exact assignment, limit/remaining allowance, billing/reset interval and applicable plan. Establish in-flight overshoot, usage-report delay, outstanding liabilities and other traffic; an alert, client counter or prepaid balance alone is not proof.
5. Account-owner approval identity and timestamp, explicit maximum total spend and original count, validity/expiry, revocation and emergency-stop rules, privacy acceptance reference and immutable original-request manifest. **No such approval exists here.**
6. Separately reviewed durable request-count and worst-charge reservations across concurrent callers and restarts; no M8 execution/maintenance code reuse. Provider budget alone does not enforce six originals, and the mock WeakMap cannot enforce durable billing ownership.

The proposed accounting rule is to reserve every original's evidenced worst-case charge plus all applicable overhead against the approved total before dispatch, retaining full unresolved liabilities after UNKNOWN. A pre-routing spend threshold can overshoot: the independent bound must cover that behavior and possible outstanding charges, with enforced isolation from unaccounted traffic. Concurrency one reduces simultaneous work but does not prove zero overshoot, instantaneous accounting or a hard cap. Periodic resets must not replenish the trial's lifetime request/spend authority. No numerical budget, limit configuration or rounding convention for real invoices is chosen here.

If a defensible maximum cannot be established or provider-enforced limits are unavailable for the account, the trial is **NO-GO**. Do not silently replace a required control with mock arithmetic, a different plan/provider/model, dashboard estimates or willingness to tolerate an unknown charge.

## 9. Original requests and UNKNOWN — future review requirements

The future live design needs durable identities and a journal independent of M5/M8 fake domains. Existing `MOCK_ONLY` requests, `original-p1` through `original-p6`, unissued proposals and fake receipts cannot be cast into live authority. This report allocates no live request ID, permit or submission.

Before a separately approved first dispatch, bind each original to the consent/account/configuration/corpus/passage/wire hash, exact reserved liability and one-attempt policy. Record durable admission before network exposure; enforce one owner, concurrency one and duplicate rejection across processes/restarts. Ambiguous reservation or checkpoint acknowledgement is not permission to send. All middleware, HTTP/SDK retries and fallback behavior require explicit disabling and review. Do not claim exactly-once provider execution without a provider guarantee.

| Observation in a future trial | Required behavior |
| --- | --- |
| Duplicate original or conflicting request bytes | Return retained original status or deny; never send again. A new key must not bypass an unresolved original. |
| Complete response with matching original receipt | Retain exact native bytes and original cost/result evidence privately; proceed only to separately authorized verification, not automatic publication/production adoption. |
| Timeout, connection loss, HTTP 429/5xx, truncated response, missing generation ID or ambiguous charge | UNKNOWN; retain original identity, any partial evidence and full worst-case liability; stop further dispatch. Status alone does not prove no synthesis/charge. |
| Lost capture/result-journal/finalization acknowledgement | Inspect only original evidence and exact owned versions under separately authorized read access. No regenerate, resume-as-new or fresh request key. |
| NOT_FOUND, empty account read, expired lease or process restart | Not proof of rollback or non-execution. Keep UNKNOWN if original evidence cannot resolve it; no retry/fallback authority. |
| Permission/privacy/quote expiry or revocation | Deny new dispatch. Preserve original facts and restrict read/verification according to current authorization; no replacement trial to escape unresolved liabilities. |

A documented provider-supported recovery or idempotency mechanism would need separate review; do not invent a request header or assume chat semantics apply to speech. Resolving original billing/result evidence does not itself authorize another synthesis. No automatic retry exists even after a definitive failure in this proposed trial.

## 10. Private native capture and independent audio review prerequisites

These are future requirements, not implemented or performed at Gate 0:

- An explicitly authorized server-side sender through the reviewed OpenRouter credential boundary, with fixed request construction, no direct-provider fallback, no secret/content logging and no route/UI exposure.
- Independently owned private staging/storage with exclusive immutable versions, no public URLs/player, no caller-controlled paths, bounded capture size/time/storage and defined retention/access/deletion ownership. Specify numerical resource bounds before live admission; terminating capture does not cancel or bound an upstream bill.
- Preserve the complete **native response bytes**, SHA-256 and exact byte count, original request/configuration/corpus hashes, safe status/format metadata and private original generation/cost receipt. Keep partial/error evidence explicitly incomplete and unavailable for adoption. Never rewrite or wrap native bytes to make an invalid result look valid.
- A separately authorized decoder/parser plan: pinned tool/version, isolated no-network environment without credentials, bounded wall time/memory/disk/output/decoded samples, complete-file validation and no untrusted shell/path input. No decoder selected, invoked or installed here; no FFmpeg/FFprobe or other media operation is authorized.
- Independently measure codec/container, sample rate, channels, decoded sample count, complete stream coverage and duration as the rational `sampleCount / sampleRate`. Handle MP3 padding/delay explicitly in the measurement convention. Reject malformed/truncated/oversized or unexpected-stream output. Provider MIME, claimed duration, byte length, timestamps and byte hash alone do not prove speech validity. Headerless PCM would need independently established format parameters; this trial proposes native MP3 instead.
- Two independent qualified Myanmar listeners review every full passage against its exact script/native hash before reconciling findings. Check coverage, fictional names, all numbers/date, negation/uncertainty, intelligibility, naturalness/emotion/pacing and audio defects. No assumed acceptance score or quality PASS. Critical semantic errors or unresolved disagreement block usability; they do not authorize regeneration. Listening cannot replace byte/decode verification, and decoding cannot establish script correctness.

No M5 fake audio, M8 fake artifact, maintenance decision or SOURCE_VERIFIED/human-approved label may be promoted into this trial. A future successful evaluation still does not authorize Movie Translator production, TTS eligibility for saved scripts, media rendering, publication or spending beyond its own approval.

## 11. Blockers and exit evidence

| Blocker | Evidence needed before future live admission |
| --- | --- |
| Account/model/voice not established | Separately authorized owner/account review and exact current stock configuration receipt; accepted license/geography/quota. |
| Speech routing and privacy not accepted | Accepted gateway/upstream terms and enforceable exact-route privacy/region/training/retention policy; documented internal retry/failover behavior. |
| Effective price and maximum charge unbounded | Valid unit quote including all charges, independent worst-case bound, provider-enforced control evidence including overshoot/reset semantics and isolated liabilities. |
| No owner spending/corpus authorization | Authenticated explicit approval binding configuration, unchanged corpus, closed original list, at-most-six count, actual maximum spend, expiry/revocation and privacy acceptance. |
| No reviewed live original-request ownership | Separate durable admission/journal/count/reservation design and test evidence for duplicate/UNKNOWN/restart safety; no M8 reuse. |
| No approved capture/decoder/listener environment | Separately authorized bounded private capture/immutable storage, decoder plan and two qualified reviewers; no production/media permission implied. |

**Verdict: BLOCKED for live evaluation.** The safe next activity is to request a separately scoped account-owner read-only evidence review, if desired. Gate 0 does not start it. Only a new explicit authorization after all admission blockers are resolved can permit the defined single-model trial. Neither this report nor a local documentation commit issues approval or spending authority.

## 12. Static verification and preservation

**Documentation/static review: PASS. Live admission: BLOCKED.** Fresh checks:

| Static check | Actual result |
| --- | --- |
| Exact branch/HEAD, clean entry and accepted ancestry | PASS; `main`, required baseline, both named ancestors verified with `git merge-base --is-ancestor`. |
| Existing-source preservation | PASS; SHA-256 comparison of all **695 baseline tracked files** shows no changes. M10-02A corpus/contracts and all M8/M4 sources remain unchanged. |
| Corpus identity reconciliation | PASS; static extraction from unchanged text literals and preserved receipt offsets reproduces **six text hashes, 13 chunk hashes and both whole-payload hashes**. Not a runtime test or fresh segmentation test. |
| Link targets | PASS; **10 local references / nine distinct existing targets**, and **17 distinct official public URLs** resolved through the public documentation reader during this review. No authenticated or inference endpoint was invoked. |
| Content and secrets | PASS; new report contains no matches for reviewed private-key, API-token or credential-assignment patterns; no account identifiers/credentials or media payloads included. Pattern scanning is not a universal secret detector. |
| Whitespace and Markdown structure | PASS; report-specific trailing-whitespace/final-newline/table checks plus `git diff --check` and `git diff --cached --check`. The report-specific check covers the initially untracked file. |
| Exact Git inventory and staged content | PASS; only `docs/STORYLINE_M10_02B_GATE0_ADMISSION_REVIEW.md` is new/owned; explicit-path staging and byte-for-byte staged-content checks passed before the local commit. No existing tracked file is modified. |

Commands/checks used: `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1 --untracked-files=all`, ancestry-only `git log --format='%H %s'`, `git merge-base --is-ancestor`, `git ls-files -z`, `git ls-files --others --exclude-standard`, `git diff --name-only`, `git diff --cached --name-only`, `git show :docs/STORYLINE_M10_02B_GATE0_ADMISSION_REVIEW.md` after staging, both whitespace commands, and inline Python static hashing/literal/JSON/link/secret/inventory checks. No helper source file or runtime fixture was created or imported. Public documentation checks used only the listed official pages.

Only the report is staged/committed; no executable module, fixture, package, environment file, route, media artifact or additional repository file is created.

The original M4 expiry source remains SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`, with all sixteen controls and the unchanged 700-ms positive deadline. The historical M4 timing incident remains **UNRESOLVED**, not dismissed or retested. Existing M8 fake-only execution, Phase 0 and Phase 1A boundaries are preserved byte-for-byte; none is imported into TTS.

**NOT RUN:** runtime/offline test suites, lint, TypeScript, build/bundle execution, browser/component tests, PostgreSQL/Redis/workers, authenticated requests, account or credential access, speech synthesis, audio downloads/capture/decoding/listening, media binaries, deployment and push. This gate changes Markdown only and requires static checks; prior M10-02A PASS counts are historical and not fresh Gate 0 results.
