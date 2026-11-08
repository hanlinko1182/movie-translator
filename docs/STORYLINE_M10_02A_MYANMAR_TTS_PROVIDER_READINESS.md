# M10-02A — Myanmar TTS provider readiness and offline security gate

Research date: **2026-10-21, Asia/Bangkok**. **OFFLINE READINESS PASS; live M10-02B BLOCKED / NO-GO.** This is public-document research plus mock contract/security testing. No account was accessed, speech synthesized, audio downloaded/decoded, money spent or approval issued. It is not a Myanmar voice-quality PASS or production certification.

## 1. Executive decision and evidence vocabulary

**OpenRouter is the exclusive AI gateway** for STT, translation, character analysis, recap generation and future Myanmar TTS. Research order is OpenRouter → ElevenLabs TTS, then OpenRouter → Burmese-capable Gemini TTS, then other independently documented Myanmar-capable OpenRouter routes. Direct Azure Speech, ElevenLabs and Google API clients are **UNSUPPORTED by project policy**, including emergency fallbacks. Earlier direct-provider comparisons are superseded by this user instruction.

Keep application interfaces independent of upstream vendors. Exact OpenRouter model IDs and stock voice/options belong in reviewed server-side configuration. One server-side OpenRouter credential boundary must serve AI requests; no direct-provider credentials, SDKs, host switches or automatic alternate model/provider dispatch. This milestone updates only the test-only server catalog and report, without adding production configuration, credentials or senders. All unverified route/model/language/voice/billing/privacy claims remain UNKNOWN.

| Classification | Meaning in this report |
| --- | --- |
| DOCUMENTED | Located in dated public official documentation; vendor claim, not empirical verification. |
| IMPLEMENTED_LOCALLY | Only the new offline parsing, mock responses, reservations and negative controls described below. |
| VERIFIED_IN_ACCOUNT | Requires future separately authorized entitlement/configuration receipts. **None.** |
| EVALUATED_WITH_REAL_AUDIO | Requires future byte/decode/listening evidence. **None.** |
| UNKNOWN | Account eligibility, effective billing ceilings, exact active voice/revision, privacy configuration or actual audio behavior not established. |
| UNSUPPORTED | Rejected by this evaluation's explicit configuration/policy; not a claim that every vendor endpoint lacks the feature. |

The current harness always returns `liveEligible:false`, `audioVerified:false`, `actualDurationMs:null`. No documentation claim, mocked response, hash or unissued spending proposal can change those values.

## 2. Repository and source baseline

Original M10-02A entry was clean `main` at **`3c9680227840e3238958d6655e4b94cbc3014f12`**, upstream `origin/main`. The OpenRouter-only amendment starts from clean `main` at **`1e1b96199d229ec448906156532ffa8bc22a0c00`**, the local M10-02A commit descending from that baseline; index, worktree and nonignored untracked inventory are empty at entry (695 tracked files). Cached `origin/main` is `518bc953c33a54138c133013835267d0c1319db8`; this is local metadata, not a newly fetched remote state. Verified accepted M8, M8-05 and Phase 0 ancestry through Phase 1A. Index, unstaged work and nonignored untracked inventory were empty. No fetch, branch change, pull, reset, merge, rebase, cherry-pick or push. The original 685 pre-M10 files remain preserved, including previous reports and M4 controls. Amendment preservation checks compare all 695 entry files and permit changes only to the six explicit paths listed below. The repository is public; no credential, account identifier or private fixture identifier belongs in this change.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), installed Next testing guidance, [real-media/TTS feasibility](STORYLINE_REAL_MEDIA_TTS_FEASIBILITY_SECURITY_DESIGN.md), [Phase 1A](STORYLINE_M8_06_PHASE1A_MAINTENANCE_FOUNDATION.md), [Phase 0](STORYLINE_M8_06_PHASE0_EXCLUSION_FEASIBILITY.md), [M8-05](STORYLINE_M8_05_FAKE_OPERATIONAL_HARDENING_DESIGN.md) and [M8 final](STORYLINE_M8_FINAL_ACCEPTANCE.md). Historical results are not current test evidence.

Actual inspected exports: `OpenRouterTranslationProvider` calls `client.chat.send`; `OpenRouterTranscriptionProvider` calls `client.stt.createTranscriptionMultipart`. Both disable SDK retries and debug logging. [Provider configuration](../lib/env.ts) pins the OpenRouter HTTPS API base and has no TTS runtime role. [Logger](../lib/logger.ts) allowlists metadata, but the new harness imports no application logger. The installed SDK declaration `esm/sdk/tts.d.ts` exposes `TTS.createSpeech` returning a raw `ReadableStream<Uint8Array>`; this does not establish application integration or entitlement. Its `SpeechRequest` declaration accepts only string input and lacks the currently documented `instructions` field: schema drift requires a later adapter review, not a cast or SDK upgrade here.

Inspected M5 `productionVoiceCapabilities` (empty), `planMyanmarVoice`, `validateVoicePlan`, `reconstructVoiceSections`, `parseVoiceRequestProposal` and `assessNarrationVoiceHandoff`. These remain synthetic/disabled. Their lineage, silence, approval-shaped data and hashes are not live TTS authority. New fixtures import only generic canonical/validation helpers and Node crypto; no M5/M8 execution, database, storage, maintenance or recovery code is reused.

## 3. Current official provider findings

All citations in sections 3–5 were checked publicly on the research date. No API catalog, voice-list endpoint, pricing account, sample player or authenticated explorer was called. Inaccessible guessed documentation URLs were replaced using official navigation; they supply no evidence. The following request shapes are documentary specifications only, not implemented network adapters.

### A. First priority: OpenRouter → ElevenLabs Eleven v3

**DOCUMENTED:** gateway ID `elevenlabs/eleven-v3`, text-to-speech, 5,000-character request ceiling, 21 stock voices, ElevenLabs upstream, no current EU in-region route. The page displays **USD 80 / million characters**, while retaining an October 19 promotional banner that has already expired. Record this as a dated public display, **not a current account quote or defensible maximum charge**. [OpenRouter model page](https://openrouter.ai/elevenlabs/eleven-v3).

OpenRouter's October 7 announcement documents stock voice names including **`george`**, explicit `response_format:"mp3"` (claimed 44.1-kHz/128-kbps output), or default raw PCM (claimed signed 16-bit little-endian mono/24-kHz). Character billing counts Unicode code points, including delivery tags. It says a separate ElevenLabs plan is unnecessary for gateway access. Reviewed upstream-specific settings would use `provider.options.elevenlabs`, including `language_code`, normalization controls and codec-compatible output options. No tags, context additions, cloning, BYOK, normalization or vendor options are enabled in this mock. [Gateway announcement and parameter details](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/).

The **upstream** v3 language table explicitly includes Burmese (`my`). This is DOCUMENTED upstream capability; the exact gateway/stock-voice/Myanmar combination is **UNKNOWN**, not account verified or audio evaluated. Bare upstream ID `eleven_v3` is rejected. [Upstream language evidence](https://elevenlabs.io/docs/overview/models). `george` is a documented stock research candidate, not an approved or version-pinned voice.

**UNKNOWN / ACCOUNT_VERIFICATION_REQUIRED:** current exact voice/model entitlement and revision, allowed format/quotas, speech-route Myanmar behavior and normalization, effective price/fees, charge ceiling/reset enforcement, actual serving/retention policy, result/cost retrieval and internal retry behavior. No direct ElevenLabs endpoint, key or timing/alignment API is an eligible escape route. Measured duration and timing support through this exact gateway configuration remain UNKNOWN.

### B. Second priority: OpenRouter → full Gemini 3.8 Flash TTS

**DOCUMENTED:** `google/gemini-3.8-flash-tts`; displayed **USD 0.50 / million input text tokens and USD 9 / million output audio tokens**. Google AI Studio and Google Vertex are listed serving paths; EU in-region routing is unavailable. These are public catalog claims, not entitlement or bounded billing evidence. [Gateway model listing](https://openrouter.ai/google/gemini-3.8-flash-tts).

Full Gemini explicitly lists Burmese with automatic detection. Direct API token ceilings do not establish a gateway maximum charge. [Full model language table](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts). Stock research candidate **`Kore`** is documented upstream; gateway entitlement/version and Myanmar behavior are UNKNOWN. [Upstream stock voices](https://ai.google.dev/gemini-api/docs/speech-generation). Flash-Lite is excluded; family resemblance never establishes Burmese support. PCM format parameters and actual duration require independent evidence.

### Shared OpenRouter speech contract and routing blocker

**DOCUMENTED wire, not an implemented sender:** POST `https://openrouter.ai/api/v1/audio/speech`; required JSON `model` and exact `input`, explicit `voice`, selected `response_format` (`mp3`/`pcm`). The response is raw bytes, not chat JSON; response headers are not independent audio verification. Speech supports data-policy settings `provider.zdr` and `data_collection`, but **`order`, `only` and `ignore` are not applied**. No chat-completion contract or generic catalog failover claim proves speech routing enforcement. [Speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts).

Application retries/fallbacks are prohibited, including direct providers. Gateway-internal rerouting/retry and original charge semantics still need evidence. If accepted privacy or no-fallback policy cannot be enforced for the chosen speech route, **BLOCKED**; do not bypass OpenRouter. Account quotas, stock-voice licensing/revision, complete lost-ACK receipts, effective rates and enforced maximum charge remain UNKNOWN for both routes.

### C. Other OpenRouter routes

`elevenlabs/eleven-v4`, v4 Turbo and v3 Conversational are visible gateway candidates; they are **not added to the mock allowlist or approved as replacements**. The upstream v4 family also documents Burmese, but this does not establish its exact gateway voice/privacy/account/billing combination. The cited model/language documents above justify further research only. Other models, including Flash/Multilingual variants or arbitrary TTS IDs, require independent model-specific Burmese evidence. An unverified configuration stays UNKNOWN/denied; no silent search or fallback dispatch occurs.

## 4. Privacy acceptance matrix

These are DOCUMENTED policy claims plus required reviews. **All actual account configurations remain UNKNOWN.** Human approval of the exact final provider, upstream, region, retention and logging configuration is mandatory before any live disclosure.

| Configuration | Text/transmission and training | Retention, residency and deletion | Acceptance gap |
| --- | --- | --- | --- |
| OpenRouter gateway, both candidate upstreams | Gateway and selected upstream both receive text. OpenRouter describes its own prompt non-retention unless logging is opted in; endpoint policy can differ from provider defaults. | ZDR routing exists, but actual speech endpoint eligibility/account settings must be checked. Disable content logging, trace/broadcast destinations and tools; do not infer regional processing from the host name. | Accept both gateway and exact upstream terms; inability to constrain approved routing remains blocking. [ZDR](https://openrouter.ai/docs/guides/features/zdr). |
| Google AI Studio / Gemini upstream terms | Paid-service terms restrict product-improvement training, but paid status is not ZDR. Upstream gateway agreements may differ. | Abuse-monitoring prompt/response retention is separately described; direct Interactions state storage defaults need explicit control. No universal retention period or regional guarantee is inferred here. | Verify the contract applying to the exact OpenRouter serving endpoint, not merely a direct Gemini plan. [Terms](https://ai.google.dev/gemini-api/terms), [retention](https://ai.google.dev/gemini-api/docs/zdr). |
| OpenRouter → ElevenLabs v3 | Gateway and upstream receive the text. Upstream default retention and training terms do not establish the gateway's negotiated endpoint policy. | Upstream ZRM is restricted to eligible enterprise endpoints; paid status alone proves nothing about ZDR. No direct account setting or query parameter is assumed to apply through OpenRouter. | Obtain and accept exact gateway/upstream training, abuse-log, deletion and region terms; verify required ZDR availability. [Upstream ZRM](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode), [privacy](https://elevenlabs.io/privacy-policy). |
| Direct Azure/ElevenLabs/Google | Excluded by exclusive-gateway architecture. | No direct account, credential or endpoint is proposed. | UNSUPPORTED by project policy; never a fallback. |

Eleven's residency documentation describes enterprise isolated environments and requires checking model availability for the chosen region/ZRM. This does not verify a particular account or TTS model deployment. [Residency](https://elevenlabs.io/docs/overview/administration/data-residency). No original dialogue, copyrighted transcript, uploaded reference, real-person data or confidential project material is used. Demonstration-content acceptability and generated-output rights still need human terms review. Private future generated audio must have an explicit retention/deletion owner; this phase stores no audio.

Audit logs must omit keys, headers, URLs containing account information, account IDs, text, raw responses and provider error messages. Hashes are binding identifiers, not anonymization. Future provider request IDs/cost receipts belong in access-controlled evidence; public reports may contain only redacted references.

## 5. Future account and secret checklist — not performed

Every unchecked item is **ACCOUNT_VERIFICATION_REQUIRED**. No API key is requested from the user.

1. An authorized account owner accepts applicable geography/eligibility, service terms, demonstration text/output rights and the exact model/voice configuration. Confirm workspace/organization/resource identity privately, without public account IDs.
2. Confirm model/stock voice entitlement and allowed formats. For OpenRouter, verify exact gateway model/stock voice/format and acceptable upstream speech routing and terms. A direct-provider account or upstream model entitlement cannot substitute for gateway evidence.
3. Use one separately authorized future server-side OpenRouter credential broker with minimum necessary scope; do not provision direct-provider credentials or clients. Separately authorize read-only model/voice/account discovery if needed. No credential in browser bundles, corpus, requests, receipts, committed configuration or terminal output. No environment files change in M10-02A.
4. Establish key scope, organization/workspace binding, issuance/expiration, rotation, revocation procedure and tested emergency stop. Bind the OpenRouter account/workspace, permitted model/voice and key scope privately. Whether exact expiration, revocation, model restrictions and enforced budgets are available is ACCOUNT_VERIFICATION_REQUIRED. No upstream key is requested or configured.
5. Obtain current model-specific request/byte/output limits, rate and concurrency quotas, format entitlement and outage behavior. Set evaluation concurrency one and request ceiling six even if provider quotas are larger.
6. Capture quote units/rates, effective date, currency, billing/reset interval, tax/fees/credit conversion and maximum possible charge, plus provider-enforced limit evidence. Public spend-control documentation could not be retrieved during this amendment. No prior claim closes current hard-cap evidence: its enforcement, reset, late charges and currency/fees remain UNKNOWN. BYOK is not part of this trial proposal.
7. Verify accepted training, abuse retention, region, content logging/deletion and audio storage policies. Approve the exact configuration hash. Capture only safe opaque receipt references, never account screenshots or raw secrets in the public repository.
8. Require a new explicit authorization before using that broker. This checklist grants no account access, credential provisioning or synthesis permission.

## 6. Corpus, normalization and exact identity

[Corpus source](../tests/storyline/tts-evaluation/corpus.fixture.ts) contains six newly authored fictional Myanmar passages: narrative; emotion/pacing; cautious character psychology; fictional Chinese-style names rendered as **လီဝေ / ချန်မင်**; numbers/date/punctuation; negation and qualifiers. These are proposed test spellings, **not a claim of human pronunciation/editorial approval**. Review the spellings and every passage before the trial; any change creates a new corpus and requires new authorization. No Chinese/movie text was copied.

Policy **EXACT_UTF8_NO_NORMALIZATION_V1** preserves every approved byte, space and punctuation. No NFC/NFD, trim, transliteration, Zawgyi conversion, pronunciation rewrite or substitution. Conservative text validation accepts only the explicitly bounded Myanmar-script/demo punctuation/digit repertoire, rejects malformed Unicode, controls, markup/foreign script and orphan signs. It is not a full Myanmar spelling or Zawgyi detector; human review remains required.

Segmentation **INTL_MY_GRAPHEME_PLUS_DEPENDENT_SIGNS_V1**, ICU **78.3**, Unicode **17.0**, uses Intl extended graphemes plus conservative merging of Myanmar dependent spacing signs and virama joins. Every resulting boundary is also an Intl boundary; no dependent sign starts a chunk. It is not a full syllabifier. A 256-byte chunk ceiling and 2,048-byte passage ceiling reject an indivisible over-limit group, rather than truncate it. Six passages contain **2,586 UTF-8 text bytes and 13 chunks**. Reconstruction is byte-exact. The six full passages correspond to six original future requests; these 13 review chunks do not silently expand paid dispatch count.

Domain hashes use `SHA256(domain + newline + canonicalJson(value))`; raw-byte hashes use SHA-256 of actual UTF-8 or fixture bytes. Canonical serialization rejects getters, functions, cycles, invalid Unicode, unsafe/fractional integers and negative zero. Domain and raw byte hashes are distinct:

- Corpus domain hash: `940ab42793a4316ade9103382bbb31357eff66c55fc8388c2f383c4b96079efa`.
- Raw SHA-256 of canonical corpus payload UTF-8: `fb48bc51b92dee832113223b2483416fb46d74215c907d423a4373ee679c74db`.

| Passage | UTF-8 bytes / chunks | Domain text hash |
| --- | --- | --- |
| p1 | 388 / 2 | `fa0fb51cde9fedcf2e3f2f06b66cb3ccd790cc0fca23cf175b300250295ec737` |
| p2 | 397 / 2 | `5a7ca3bd38189647083e62e26aaaea649b522cdc2110c1d50f42649fcf174872` |
| p3 | 530 / 3 | `5793fc45db8bb34831b65d48edd8d54b5975ec9c1f79b625f398564c03ddbf4b` |
| p4 | 404 / 2 | `5cfa83c10584a4f0730ecede26bb8b0c974da872723d54a7895aa355ecb1c86d` |
| p5 | 416 / 2 | `9de044267844943c5f8106362892a8ce061ff8d878077d17b644c422ea85da13` |
| p6 | 451 / 2 | `59ffcd5ea9478b04001d0f2ab87ba7b59d48cd9cd41ad94db39373f45956430b` |

Individual chunk offsets/byte counts/hashes are replayed by tests and retained in ignored `corpus-hashes.json`. Runtime/ICU/policy changes produce a new corpus identity and require re-review, not normalization to an old hash.

## 7. Spending protocol — data validation, never approval

The separate `story-tts-unissued-spending-proposal-v1` record binds exact provider/model/stock voice/format/language/account configuration reference, corpus hash, count ceiling, original request IDs **and request hashes**, quote components and evidence hash, max total integer micro-USD, billing interval/reset, proposed approval identity/timestamp, expiration/revocation and provider limit evidence. Current account references are only `mock-account-a/b`; approval identity is only `UNISSUED_REVIEWER`, authority `UNISSUED_OFFLINE_PROPOSAL`, limit kind `MOCK_NOT_PROVIDER_ENFORCED`. No signature, human approval, real hard limit or spending permit is issued.

For a future live record, those references must instead resolve through separately authenticated approval/quote/account authorities. A hash, shape-valid record, client counter, timeout, billing alert, advertised free tier or chosen budget number is insufficient. Confirm the limit's actual enforced amount, reset, account isolation, ongoing/late billing behavior and all charges. **Without a defensible maximum total charge, the live evaluation is NO-GO.**

Mock arithmetic is exact: sum each component's `ceil(maximumUnitsPerRequest × priceMicros / perUnits)`, add bounded overhead, then reserve the whole worst case for all approved originals. The server-owned model metadata requires both input-text and output-audio token components for full Gemini, and billable characters for OpenRouter Eleven v3. Provider identity is always OPENROUTER; it cannot select a direct-provider pricing branch. Upstream credits and character-only Gemini quotes are rejected. Mock prices/ceilings are deliberately synthetic: each original reserves 205 micro-units, six reserve 1,230; this is **not a real price estimate or approved USD budget**. BigInt arithmetic prevents overflow/rounding under safe-integer input ceilings.

A nonserializable mock assessment references a trusted fixture-owned frozen proposal/quote and shared in-memory reservations; changed/rehashed proposals, copied handles, missing bounds, wrong units, cross-account/model/voice/corpus requests, expiry/revocation and over-budget requests deny. Shared assessment handles/harness objects cannot reset that reservation ledger. Unknowns retain the full reservation and block new originals; no refund, replacement key, alternative model or fallback. Creating a completely new trusted fixture authority or restarting the process is outside its memory-only guarantee, which is another reason it is never live authority. Fixture time is explicitly injected; no production clock/session authority is certified. A future live approval must resolve an immutable account configuration reference/hash and independently authenticated limit evidence under a separate real schema; these mock references cannot be relabeled as approval.

## 8. Offline contracts and exact inventory

The original M10-02A added the following ten files. This amendment modifies exactly six: this report, `capabilities.fixture.ts`, `spending.fixture.ts`, `contracts.test.ts`, `security.test.ts`, and `lifecycle.test.ts`. No new files or application changes are introduced.

| Path | Responsibility |
| --- | --- |
| `docs/STORYLINE_M10_02A_MYANMAR_TTS_PROVIDER_READINESS.md` | This dated research, gates, results and handoff. |
| `tests/storyline/tts-evaluation/contracts.fixture.ts` | Strict bounded values, safe hashes, exact Myanmar text policy and immutable no-retry/no-live policy. |
| `tests/storyline/tts-evaluation/corpus.fixture.ts` | Six original passages, semantic expectations, conservative grapheme chunks and corpus hashes. |
| `tests/storyline/tts-evaluation/capabilities.fixture.ts` | OpenRouter-only server-owned catalog; Eleven v3/george first, full Gemini/Kore second; model-specific billing units and explicit unknown account/gateway Myanmar evidence. |
| `tests/storyline/tts-evaluation/spending.fixture.ts` | Unissued proposal validation and private mock assessment/reservation ledger. |
| `tests/storyline/tts-evaluation/harness.fixture.ts` | Exact requests, fixed in-memory response ports, original identity, UNKNOWN and redacted observations. |
| `tests/storyline/tts-evaluation/contracts.test.ts` | Corpus, Unicode, chunks, hashes and bounded quote tests. |
| `tests/storyline/tts-evaluation/security.test.ts` | Adversarial request, policy, response, secret, egress and promotion cases. |
| `tests/storyline/tts-evaluation/lifecycle.test.ts` | Two OpenRouter-only mock configurations, duplicates, concurrency, revocation and no-resend cases. |
| `tests/storyline/tts-evaluation/production-audit.mjs` | Read-only source/import and fresh build-bundle audit. |

Seven new domains are `story-tts-{offline-corpus,offline-text,offline-chunk,offline-request,unissued-spending-proposal,nonaudio-mock-response,offline-observation}-v1`. No M5/M8 domain is extended, cast or modified. Generic canonical/validation helpers remain byte-identical.

Fixed request fields: schemaVersion, mode=MOCK_ONLY, accountRef, provider/model/voice/nativeFormat/language/locale, corpusHash, original requestId/passageId, exact text/textHash/chunks and policy `{attempts:1,retries:0,fallback:NONE,parallel:false,live:false}`. Strict replay rejects extra/missing fields, even a rehashed changed body. Exact chunk hashes/offsets/lengths reconstruct the text. No endpoint, SDK options, credential, SSML, uploaded reference, role or provider callback is accepted.

The mock port has only fixed enumerated scenarios and a process-private WeakMap identity, with inert credential label `OFFLINE_PLACEHOLDER_NOT_A_KEY`. An arbitrary object with a network callback cannot act as a port. Its bytes are the ASCII marker `M1002A_ARBITRARY_NON_AUDIO_FIXTURE`, with no audio headers or playable content. An independently parsed synthetic response must match the exact original request/account/model/voice and those fixture bytes. Claimed codec/decoded verification, extra fields, wrong bindings, fake M5/M8 receipts, oversized data and thrown diagnostic strings produce UNKNOWN without byte/hash adoption. The harness returns no byte body or raw diagnostic and logs nothing.

Reservations are made before the sole mock invocation. Duplicate same original returns its retained status; changed same identity conflicts. Pending/UNKNOWN cannot acquire another attempt. A module-local concurrency gate prevents parallel mock dispatch; all handles share their originating assessor's reservations. `inspect` reads only redacted local metadata; there is no launch/retry/recovery method. This is not durable paid-request ownership across a process crash. No production module, network sender, SDK adapter, environment activation flag, database, route or UI is created.

## 9. Independent negative acceptance

| Threat | Executable expected result |
| --- | --- |
| Wrong provider/model, Lite/substitute model, language, voice or format | DENY before mock dispatch. |
| Bad Unicode, orphan signs, split/rehashed chunk, missing/extra/empty/oversized data | DENY; no text rewrite or truncation. |
| Cross-account or changed corpus; rehashed quote or incomplete audio-token cost bound | DENY against frozen independent mock evidence. |
| Forged/expired/revoked approval-shaped proposal or copied assessment | DENY; no real approval exists. |
| Duplicate original, replacement key, changed configuration or concurrent call | Original retained or DENY; no second start. |
| Lost ACK, timeout, 429, malformed/conflicting response | UNKNOWN; full reservation retained; no retry/fallback. |
| Revocation/expiry before result fence | UNKNOWN; no fixture byte/hash release. |
| Claimed real audio verification or M5/M8 receipt promotion | UNKNOWN/DENY; audioVerified stays false. |
| Secret-shaped fields, diagnostic strings, arbitrary live callback | DENY/UNKNOWN; no raw logging or callback execution. |
| Attempted network operation | Test egress tripwire throws before network; valid harness has no network port. |
| Production import/bundle leakage | Fresh source/build audit finds zero markers or production activation. |

Fresh amendment results and prior failure accounting follow in section 11. No live quality outcome follows from these assertions.

## 10. Proposed M10-02B protocol and listening rubric — NOT AUTHORIZED

Future trial authorization must name **one exact OpenRouter account/gateway model/current stock voice/configuration**, accepted upstream/region/privacy/retention terms, approved corpus/hash and pronunciation expectations, six specific original request identities, maximum actual currency spend and count, evidenced provider-enforced limit plus per-request upper bounds, expiration/revocation and a separately reviewed server-side credential broker. Any additional OpenRouter model/voice requires separate approval and original request/spend limits. A direct-provider trial is outside the architecture; it cannot be approved as a fallback by this report. Current hash/normalization are proposals until human review.

Disable SDK/HTTP retries, redirects to unapproved hosts, alternative models/providers, request parallelism and implicit middleware/proxy retries. Maintain original request/cost identity and a separate durable admission/journal design before a paid sender can be authorized. After submission ambiguity, observe only original evidence/results/billing under separately approved account access; timeout, missing ACK or NOT_FOUND does not prove no charge. No speculative resend, new key or replacement original. Provider result receipt/cost retrieval and upstream retry behavior must be evidenced; if unavailable, retain UNKNOWN and stop. Do not import M8 fake recovery to solve this.

Capture exact native response bytes/hash/count, complete status and privately retained original provider request/result identifier, serving/model/voice observation and usage/cost receipt. MIME type, claimed duration and content length alone do not verify audio. Independently validate a complete bounded decode in a separately approved isolated environment: actual codec/container, sample rate, channels, decoded sample count, no unexpected tracks, no corruption/truncation, and rational duration `samples/sampleRate`. Headerless PCM needs independently established format parameters, not guesses from byte length. Hash native bytes separately from decoder measurements or any future derivative. No decoding tool is selected or invoked here.

Two independent qualified Myanmar listeners must review every full passage against the exact script and native byte hash. Record independent findings before reconciliation:

| Criterion | Required review |
| --- | --- |
| Coverage/intelligibility | Every intended word; no omission/addition, language substitution or unintelligible phrase. |
| Proper names | Both proposed Myanmar name spellings/pronunciations approved and consistently spoken. |
| Numbers/date | Every digit/quantity/date/time and their intended spoken form checked; no silent semantic rewrite. |
| Negation/psychology | Preserve every negative, limitation and uncertainty; inference must not become certainty. |
| Naturalness/pacing/emotion | Each listener records concrete awkward stress, pauses, cadence or inappropriate emotional performance. No marketing score substitutes for observations. |
| Completeness/audio defects | No cut ending, unexplained silence/non-speech, wrong speaker, clipping or corruption. |

Listener disagreement or any critical proper-name/number/negation/coverage error means BLOCKED pending explicit review; it does not authorize regeneration. Advisory ASR/alignment would need its own privacy/spending authorization and cannot replace listeners. Record honest model drift, pronunciation and format limitations. A successful trial remains evaluation-only; production voice artifacts, narration approval, source rights, private delivery/publication and Movie Translator integration need separate milestones.

## 11. OpenRouter-only amendment verification and remaining blockers

**OpenRouter-only offline readiness PASS; live/audio-quality acceptance remains BLOCKED.** Fresh receipts are in ignored `coverage/m10-02a-openrouter-policy/`; older logs are preserved.

| Fresh check | Result | Receipt |
| --- | --- | --- |
| Offline corpus/contracts, security and lifecycle | **78/78 PASS**, zero failures/skips/cancellations, 0.420 s | `focused.log` |
| Unchanged M5 pure boundary/planner/reference | **51/51 Node nodes PASS**, 47 leaf cases + 4 parent groups, 0.944 s | `m5-pure.log` |
| Lint | **PASS**, zero diagnostics | `lint.log` |
| TypeScript | **PASS**, zero diagnostics | `typescript.log` |
| Unreachable dummy-datasource Webpack build | **PASS** | `webpack.log` |
| TTS + M6/M7/M8/Phase 1A production boundary audits | **8/8 scripts PASS** | `*-production.json` |
| Baseline preservation, inventory, local links, secret patterns and whitespace | **PASS**: 695 entry files; six modified, 689 unchanged; no new tracked/untracked files | `source-audit.json` |

There are **129 distinct passing Node nodes / 125 distinct leaf cases** (78 + 47 leaves; four M5 parent groups disclosed), one execution each and **zero overlapping reruns in this amendment**. No failed command or case occurred in this amendment's acceptance runs. A nonexistent local testing-guide path and two inaccessible public spend-document URLs yielded no evidence; the installed guide was subsequently located and read. The 78-case suite replaces 69 prior cases: eleven policy, metadata and billing cases added, two Azure-positive configurations removed. The surviving Eleven positive case now uses the gateway model/stock candidate. Prior test runs do not add to these fresh counts. Assertion loops, six passages, mock invocations and eight audit scripts are not extra test cases.

The TTS production audit reviewed **364 source files, 217 built JavaScript files, five server-only fixture modules, 38 unchanged routes and zero Server Actions**. It found zero TTS fixture markers or network/SDK/M5/M8 authority imports. The other seven scripts passed unchanged. `openRouterConfig` still pins the HTTPS OpenRouter API origin; the existing translation, transcription, character and recap providers use the OpenRouter SDK/server configuration. No production code, environment file, credential or M5–M8 contract changed. This proves this test-only amendment adds no production adapter; it does not certify live account or provider behavior. Egress tripwires and reviewed imports are offline test controls, not an OS sandbox against hostile arbitrary code.

**NOT RUN:** application/database/PostgreSQL/M4 expiry/M6–M8 runtime suites, Redis/workers, browser/component suites, real media tools or files, synthesis or audio downloads/decoding/listening, authenticated account discovery, paid calls, deployment or push. No application runtime/UI change calls for rerunning those broader suites; database/media/account actions remain forbidden. The original corpus fixture and hash domains are byte-identical. No real TTS quality result is claimed.

### Exact amendment commands

Each test/build/audit command used `DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable` and builds/audits used `NEXT_TELEMETRY_DISABLED=1`. No environment file was edited. The compiler build used scoped subprocess permission; no runtime service was started.

```sh
node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 tests/storyline/tts-evaluation/contracts.test.ts tests/storyline/tts-evaluation/security.test.ts tests/storyline/tts-evaluation/lifecycle.test.ts
node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 tests/storyline/voice-foundation/boundary.test.ts tests/storyline/voice-foundation/planner.test.ts tests/storyline/voice-foundation/reference.test.ts
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm exec next build --webpack
node tests/storyline/tts-evaluation/production-audit.mjs coverage/m10-02a-openrouter-policy/tts-evaluation-production.json
node tests/storyline/render-execution-fake/production-audit.mjs coverage/m10-02a-openrouter-policy/render-execution-fake-production.json
node tests/storyline/maintenance-fake/production-audit.mjs coverage/m10-02a-openrouter-policy/maintenance-fake-production.json
node tests/storyline/render-planning/production-audit.mjs coverage/m10-02a-openrouter-policy/render-planning-production.json
node tests/storyline/highlights-studio/production-audit.mjs coverage/m10-02a-openrouter-policy/highlights-studio-production.json
node tests/storyline/timeline/production-audit.mjs coverage/m10-02a-openrouter-policy/timeline-production.json
node tests/storyline/timeline-persistence/production-audit.mjs coverage/m10-02a-openrouter-policy/timeline-persistence-production.json
node tests/storyline/timeline-studio/production-audit.mjs coverage/m10-02a-openrouter-policy/timeline-studio-production.json
python3 coverage/m10-02a-openrouter-policy/audit.py
git diff --check
git diff --cached --check
```

### Current test-only source SHA-256 inventory

These hashes bind all nine test-only source files, including four unchanged files. The report's own hash is recorded separately in the staged receipt to avoid self-reference.

| File under `tests/storyline/tts-evaluation/` | SHA-256 |
| --- | --- |
| `capabilities.fixture.ts` | `533e3ba899179c2123f810e2c25c6bff2c89234bed3f18d86c7cea8f686c9987` |
| `contracts.fixture.ts` | `587020cc14196dc322171c408bc9fea4513104e80bf1692f7f2ce5746a8dc9ba` |
| `contracts.test.ts` | `25c254459eded9453d3cda4556a9203829a53b6e2c37726e236d6e9f2a9b459c` |
| `corpus.fixture.ts` | `ceb12a838da4f44f34d9ec487e09a661c156b9a5d4fcd284f01a5ba3b08bab39` |
| `harness.fixture.ts` | `8ada1abc407aacd791dcaef459150d57b83b4f63499503e90450c57ef33d1f12` |
| `lifecycle.test.ts` | `6b5d0846bc96cc1f87960b19b8af9c75e2cdb61074e410f4bc2ee02b9c871293` |
| `production-audit.mjs` | `f8b143ec9cd997bd138dc89d19dd72605b1fd02a0be5fb95c61cc976c6a2d4ec` |
| `security.test.ts` | `0bee64f77a6d9d55ccb1047428f5feb78e8daaa4fa537aba6175ce5681263fd6` |
| `spending.fixture.ts` | `d91f05391910726add8934e300738675dea850c3eb73763eee274f818b096b24` |

Historical original M10-02A results and failures are retained in local commit `1e1b96199d229ec448906156532ffa8bc22a0c00` and ignored `coverage/m10-02a-08428e50/`; they are not fresh amendment evidence. The initial original milestone had a sandbox child-process failure, a Myanmar spacing-sign validation defect corrected with regression coverage, and TypeScript fixture issues; none is concealed by this amendment. Original 69-case acceptance is superseded by the OpenRouter-only suite.

The original sixteen M4 expiry controls and 700-ms positive deadline remain unchanged at source SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. PostgreSQL tests are NOT RERUN. The historical timing incident remains UNRESOLVED. All accepted M8 fake execution, Phase 0, Phase 1A and M5 contract/authority boundaries remain unchanged and unimported by this harness.

**M10-02B remains BLOCKED** until explicit approval binds OpenRouter account/model entitlement, exact stock voice/version, accepted gateway/upstream privacy/region/retention terms, enforceable maximum actual charge and original request limit, exact Myanmar corpus and no automatic retries after UNKNOWN. A separately reviewed live sender, original-request ownership/journal protocol and independent decode/two-listener environment are also required. Missing speech routing constraints or billing evidence are blockers, not permission to switch gateway. ACCOUNT_VERIFICATION_REQUIRED questions stop without account calls. No approval, credential use, real audio, spending, publication or next milestone is authorized here.
