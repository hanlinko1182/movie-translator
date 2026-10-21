# M10-02A — Myanmar TTS provider readiness and offline security gate

Research date: **2026-10-21, Asia/Bangkok**. **OFFLINE READINESS PASS; live M10-02B BLOCKED / NO-GO.** This is public-document research plus mock contract/security testing. No account was accessed, speech synthesized, audio downloaded/decoded, money spent or approval issued. It is not a Myanmar voice-quality PASS or production certification.

## 1. Executive decision and evidence vocabulary

Retain OpenRouter → full Gemini 3.8 Flash TTS as the primary research candidate. Direct Azure's two named Myanmar voices remain comparison candidates. Direct ElevenLabs v3 is documented for Burmese, but its exact current stock voice remains unselected. Do not substitute Flash-Lite, another Eleven model, a legacy voice alias or another upstream provider to bypass missing evidence.

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

Entry was clean `main` at **`3c9680227840e3238958d6655e4b94cbc3014f12`**, upstream `origin/main`. Cached `origin/main` is `518bc953c33a54138c133013835267d0c1319db8`; this is local metadata, not a newly fetched remote state. Verified accepted M8, M8-05 and Phase 0 ancestry through Phase 1A. Index, unstaged work and nonignored untracked inventory were empty. No fetch, branch change, pull, reset, merge, rebase, cherry-pick or push. All **685 baseline tracked file hashes** are preserved, including previous reports and M4 controls. The repository is public; no credential, account identifier or private fixture identifier belongs in this change.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), installed Next testing guidance, [real-media/TTS feasibility](STORYLINE_REAL_MEDIA_TTS_FEASIBILITY_SECURITY_DESIGN.md), [Phase 1A](STORYLINE_M8_06_PHASE1A_MAINTENANCE_FOUNDATION.md), [Phase 0](STORYLINE_M8_06_PHASE0_EXCLUSION_FEASIBILITY.md), [M8-05](STORYLINE_M8_05_FAKE_OPERATIONAL_HARDENING_DESIGN.md) and [M8 final](STORYLINE_M8_FINAL_ACCEPTANCE.md). Historical results are not current test evidence.

Actual inspected exports: `OpenRouterTranslationProvider` calls `client.chat.send`; `OpenRouterTranscriptionProvider` calls `client.stt.createTranscriptionMultipart`. Both disable SDK retries and debug logging. [Provider configuration](../lib/env.ts) pins the OpenRouter HTTPS API base and has no TTS runtime role. [Logger](../lib/logger.ts) allowlists metadata, but the new harness imports no application logger. The installed SDK declaration `esm/sdk/tts.d.ts` exposes `TTS.createSpeech` returning a raw `ReadableStream<Uint8Array>`; this does not establish application integration or entitlement. Its `SpeechRequest` declaration accepts only string input and lacks the currently documented `instructions` field: schema drift requires a later adapter review, not a cast or SDK upgrade here.

Inspected M5 `productionVoiceCapabilities` (empty), `planMyanmarVoice`, `validateVoicePlan`, `reconstructVoiceSections`, `parseVoiceRequestProposal` and `assessNarrationVoiceHandoff`. These remain synthetic/disabled. Their lineage, silence, approval-shaped data and hashes are not live TTS authority. New fixtures import only generic canonical/validation helpers and Node crypto; no M5/M8 execution, database, storage, maintenance or recovery code is reused.

## 3. Current official provider findings

All citations in sections 3–5 were checked publicly on the research date. No API catalog, voice-list endpoint, pricing account, sample player or authenticated explorer was called. Inaccessible guessed documentation URLs were replaced using official navigation; they supply no evidence. The following request shapes are documentary specifications only, not implemented network adapters.

### A. OpenRouter → full Gemini 3.8 Flash TTS

**DOCUMENTED:** model identifier `google/gemini-3.8-flash-tts`; listed price **USD 0.50 / million input text tokens and USD 9 / million output audio tokens**. The model page lists Google AI Studio and Google Vertex serving paths, a 33K context indication, and no EU in-region routing currently. These are catalog claims, not account availability or a worst-charge quote. [Model listing](https://openrouter.ai/google/gemini-3.8-flash-tts).

Google specifically lists Burmese for full `gemini-3.8-flash-tts`, with automatic language detection. Its direct Gemini API limits show 8,192 input and 16,384 output tokens; they are **not** an evidenced OpenRouter speech-route output ceiling. [Full model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts). Stock candidate **Kore** is documented in Google's speech guide; its active gateway voice entitlement remains unverified. Direct Gemini unary output defaults to WAV; that says nothing about gateway PCM headers, rate or channels. [Google speech guide](https://ai.google.dev/gemini-api/docs/speech-generation). Flash-Lite is excluded from the local allowlist; no Burmese support is inferred from its family name.

**DOCUMENTED wire:** POST `https://openrouter.ai/api/v1/audio/speech`, bearer authentication, JSON with required `model` and `input`, explicit `voice`, and selected `response_format` (`pcm` or `mp3`). Optional `instructions` and `speed` require exact reviewed settings. Response is a raw byte stream, with `Content-Type` and `X-Generation-Id`; no decoded duration is thereby measured. Crucially, speech ignores `provider.order`, `only` and `ignore`; `provider.zdr`/`data_collection` are described. No chat `messages`, chat completion audio deltas, cloning references, provider options or arbitrary fields enter this harness. Strict upstream selection/no-failover cannot be claimed from chat controls. [Speech endpoint guide](https://openrouter.ai/docs/guides/overview/multimodal/tts). Chat routing documents describe a different request contract. [Chat routing](https://openrouter.ai/docs/guides/routing/provider-selection).

**UNKNOWN / ACCOUNT_VERIFICATION_REQUIRED:** key/workspace entitlement, actual serving path, speech-specific quotas, hard output/billing ceiling, version attestation, exact PCM encoding and complete result/cost retrieval after lost ACK. Model-specific token rates take precedence over generic per-character speech descriptions. If the approved privacy/routing policy requires one upstream and speech cannot enforce it, this configuration is **NO-GO**; selecting direct Google would require separate authorization, not automatic fallback. Google project/model limits vary by tier. [Limits](https://ai.google.dev/gemini-api/docs/rate-limits).

### B. Direct Azure Speech

**DOCUMENTED:** `my-MM-NilarNeural` and `my-MM-ThihaNeural` are Burmese stock voices. Neither is an OpenRouter Microsoft MAI model selection. [Voice table](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=text-to-speech).

**DOCUMENTED wire:** authenticated regional/resource Speech REST synthesis, POST `/cognitiveservices/v1`, `Content-Type: application/ssml+xml`, required output-format header; proposed `X-Microsoft-OutputFormat: riff-24khz-16bit-mono-pcm`. Use a fixed `speak` envelope with `xml:lang="my-MM"`, an allowlisted exact voice name and escaped exact corpus text. No caller SSML, styles, lexicons or source URLs. Response is audio bytes; REST can truncate output beyond ten minutes, so status 200 is insufficient coverage evidence. Account and Speech resource/key/endpoint are prerequisites. [REST reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech).

`AZURE_PREBUILT_NEURAL_VOICE` in the mock is a **local discriminator**, not a vendor model ID; Azure selects these voices by SSML name. `southeastasia` is listed for neural synthesis, but exact voice/resource availability must be checked independently. [Regions](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions?tabs=tts). Current quota table lists F0 20 transactions/60 seconds, S0 default 30 TPS and ten-minute maximum output. Quotas/capacity are not spending authority. [Quotas](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits).

**Pricing:** official page specifies per-million-character units but returned `$-` for numeric region-dependent amounts during this public review. No unofficial USD 15 estimate is promoted to a quote. **Numeric effective price UNKNOWN.** [Pricing](https://azure.microsoft.com/en-us/pricing/details/speech/). Region, exact voices, credentials, billing character definition for Myanmar, subscription entitlements and enforceable spend bound remain ACCOUNT_VERIFICATION_REQUIRED.

### C. Direct ElevenLabs

**DOCUMENTED:** exact model `eleven_v3` lists Burmese (`my`), supports TTS and has a 5,000-character limit. `eleven_v3_conversational`, v4 and Multilingual v2 are not interchangeable selections. [Models](https://elevenlabs.io/docs/overview/models). Public API pricing lists v3 at **USD 0.08 / 1,000 characters**; actual subscription credits, additional fees and final charge bounds are unverified. [Pricing](https://elevenlabs.io/pricing/api).

**DOCUMENTED wire:** POST `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, `xi-api-key`, explicit JSON `text`, `model_id:"eleven_v3"`, `language_code:"my"`, and reviewed normalization/settings. Pin query output format, proposed `mp3_44100_128`; the response is audio bytes. The API defaults to a different model if model selection is omitted. Language enforcement is not sufficient by itself because unsupported codes may be ignored. PCM/WAV 44.1-kHz and MP3 192-kbps entitlement restrictions are documented. [Convert reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).

The separate `/with-timestamps` route returns `audio_base64`, `alignment`, `normalized_alignment`; character arrays/times are vendor claims, not proof of Myanmar syllable coverage or independently decoded duration. It must be separately selected/quoted, not called as an extra automatic request. [Timing reference](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).

**Stock voice UNKNOWN:** no account voice lookup was allowed. The mock deliberately accepts only `MOCK_STOCK_PENDING`, which is not a real voice ID and cannot be sent to the provider. Official support documents legacy-ID automatic remapping, so copying Rachel/Sarah/example IDs cannot establish a fixed current voice. [Voice changes](https://help.elevenlabs.io/hc/en-us/articles/20939463028881-How-are-voices-updated-changed). Future account inspection must select a current stock voice, verify license/entitlement and revision/substitution policy, and obtain human acceptance. No cloned/designed/uploaded voice is eligible.

## 4. Privacy acceptance matrix

These are DOCUMENTED policy claims plus required reviews. **All actual account configurations remain UNKNOWN.** Human approval of the exact final provider, upstream, region, retention and logging configuration is mandatory before any live disclosure.

| Configuration | Text/transmission and training | Retention, residency and deletion | Acceptance gap |
| --- | --- | --- | --- |
| OpenRouter + Google upstream | Gateway and selected upstream both receive text. OpenRouter describes its own prompt non-retention unless logging is opted in; endpoint policy can differ from provider defaults. | ZDR routing exists, but actual speech endpoint eligibility/account settings must be checked. Disable content logging, trace/broadcast destinations and tools; do not infer regional processing from the host name. | Accept both gateway and exact upstream terms; inability to constrain approved routing remains blocking. [ZDR](https://openrouter.ai/docs/guides/features/zdr). |
| Google AI Studio / Gemini upstream terms | Paid-service terms restrict product-improvement training, but paid status is not ZDR. Upstream gateway agreements may differ. | Abuse-monitoring prompt/response retention is separately described; direct Interactions state storage defaults need explicit control. No universal retention period or regional guarantee is inferred here. | Verify the contract applying to the exact OpenRouter serving endpoint, not merely a direct Gemini plan. [Terms](https://ai.google.dev/gemini-api/terms), [retention](https://ai.google.dev/gemini-api/docs/zdr). |
| Direct Azure prebuilt realtime synthesis | Text is disclosed directly to Azure. Do not infer a broad training prohibition solely from a non-storage claim. | Microsoft documents no storage of realtime input text/output audio. Batch/long-audio storage differs; those APIs are excluded. Application logs, billing metadata and resource geography still require review. | Exact resource, region, DPA/terms, monitoring and local retention remain unverified. [Privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/text-to-speech/data-privacy-security). |
| Direct ElevenLabs v3 | Direct disclosure; own training opt-out must be checked before new submissions, not assumed from a paid plan or third-party LLM terms. | History retention is enabled by default; deletion can leave moderation/debug information and backups up to 30 days. ZRM is enterprise-specific and endpoint-dependent. | Choose explicit accepted logging mode; unavailable required ZRM means BLOCKED. Confirm opt-out, deletion scope and exact data residency/model compatibility. [ZRM](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode), [terms](https://elevenlabs.io/terms-of-use), [privacy](https://elevenlabs.io/privacy-policy). |

Eleven's residency documentation describes enterprise isolated environments and requires checking model availability for the chosen region/ZRM. This does not verify a particular account or TTS model deployment. [Residency](https://elevenlabs.io/docs/overview/administration/data-residency). No original dialogue, copyrighted transcript, uploaded reference, real-person data or confidential project material is used. Demonstration-content acceptability and generated-output rights still need human terms review. Private future generated audio must have an explicit retention/deletion owner; this phase stores no audio.

Audit logs must omit keys, headers, URLs containing account information, account IDs, text, raw responses and provider error messages. Hashes are binding identifiers, not anonymization. Future provider request IDs/cost receipts belong in access-controlled evidence; public reports may contain only redacted references.

## 5. Future account and secret checklist — not performed

Every unchecked item is **ACCOUNT_VERIFICATION_REQUIRED**. No API key is requested from the user.

1. An authorized account owner accepts applicable geography/eligibility, service terms, demonstration text/output rights and the exact model/voice configuration. Confirm workspace/organization/resource identity privately, without public account IDs.
2. Confirm model/stock voice entitlement and allowed formats. For Azure, confirm resource and matching region/endpoint/voice availability. For Eleven, verify a current stock voice rather than a remapping legacy alias. For OpenRouter, establish an acceptable speech routing policy and upstream terms.
3. Provision a separate future server-side credential broker with minimum synthesis scope. Separately authorize read-only model/voice/account discovery if needed. No credential in browser bundles, corpus, requests, receipts, committed configuration or terminal output. No environment files change in M10-02A.
4. Establish key scope, organization/workspace binding, issuance/expiration, rotation, revocation procedure and tested emergency stop. Eleven documents endpoint scopes, credit quotas, optional user-key expiration and service-account restrictions; availability depends on the account. [Key controls](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys). Azure requires its own supported resource/token authority; no common cross-provider key is assumed.
5. Obtain current model-specific request/byte/output limits, rate and concurrency quotas, format entitlement and outage behavior. Set evaluation concurrency one and request ceiling six even if provider quotas are larger.
6. Capture quote units/rates, effective date, currency, billing/reset interval, tax/fees/credit conversion and maximum possible charge, plus provider-enforced limit evidence. OpenRouter documents workspace/key/guardrail budgets and reset attribution; none has been verified in account, and BYOK accounting is not necessarily the provider invoice. [Spending controls](https://openrouter.ai/docs/guides/best-practices/spend-controls).
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

Mock arithmetic is exact: sum each component's `ceil(maximumUnitsPerRequest × priceMicros / perUnits)`, add bounded overhead, then reserve the whole worst case for all approved originals. Full Gemini requires both input-text and output-audio token components; Azure uses billable characters; Eleven's reviewed quote may use characters or credits with an independently established conversion. Mock prices/ceilings are deliberately synthetic: each original reserves 205 micro-units, six reserve 1,230; this is **not a real price estimate or approved USD budget**. BigInt arithmetic prevents overflow/rounding under safe-integer input ceilings.

A nonserializable mock assessment references a trusted fixture-owned frozen proposal/quote and shared in-memory reservations; changed/rehashed proposals, copied handles, missing bounds, wrong units, cross-account/model/voice/corpus requests, expiry/revocation and over-budget requests deny. Shared assessment handles/harness objects cannot reset that reservation ledger. Unknowns retain the full reservation and block new originals; no refund, replacement key, alternative model or fallback. Creating a completely new trusted fixture authority or restarting the process is outside its memory-only guarantee, which is another reason it is never live authority. Fixture time is explicitly injected; no production clock/session authority is certified. A future live approval must resolve an immutable account configuration reference/hash and independently authenticated limit evidence under a separate real schema; these mock references cannot be relabeled as approval.

## 8. Offline contracts and exact inventory

Only these **ten new files** are created. No existing tracked file is modified.

| Path | Responsibility |
| --- | --- |
| `docs/STORYLINE_M10_02A_MYANMAR_TTS_PROVIDER_READINESS.md` | This dated research, gates, results and handoff. |
| `tests/storyline/tts-evaluation/contracts.fixture.ts` | Strict bounded values, safe hashes, exact Myanmar text policy and immutable no-retry/no-live policy. |
| `tests/storyline/tts-evaluation/corpus.fixture.ts` | Six original passages, semantic expectations, conservative grapheme chunks and corpus hashes. |
| `tests/storyline/tts-evaluation/capabilities.fixture.ts` | Fixed documented candidate metadata; explicit mock-only Eleven voice placeholder. |
| `tests/storyline/tts-evaluation/spending.fixture.ts` | Unissued proposal validation and private mock assessment/reservation ledger. |
| `tests/storyline/tts-evaluation/harness.fixture.ts` | Exact requests, fixed in-memory response ports, original identity, UNKNOWN and redacted observations. |
| `tests/storyline/tts-evaluation/contracts.test.ts` | Corpus, Unicode, chunks, hashes and bounded quote tests. |
| `tests/storyline/tts-evaluation/security.test.ts` | Adversarial request, policy, response, secret, egress and promotion cases. |
| `tests/storyline/tts-evaluation/lifecycle.test.ts` | Four mock configurations, duplicates, concurrency, revocation and no-resend cases. |
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

Fresh results and retained failure accounting follow in section 11. No live quality outcome follows from these assertions.

## 10. Proposed M10-02B protocol and listening rubric — NOT AUTHORIZED

Future trial authorization must name **one exact provider/account/model/current stock voice/configuration**, accepted upstream/region/privacy/retention terms, approved corpus/hash and pronunciation expectations, six specific original request identities, maximum actual currency spend and count, evidenced provider-enforced limit plus per-request upper bounds, expiration/revocation and a separately reviewed server-side credential broker. A comparison provider or second Azure voice consumes another separately authorized set; it is not fallback. Current hash/normalization are proposals until human review.

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

## 11. Verification, preservation and remaining blockers

Final offline acceptance **PASS**. All prior logs remain in the ignored `coverage/m10-02a-08428e50/` directory. No credentials or private account data are recorded.

| Executed check | Actual final result | Evidence |
| --- | --- | --- |
| New offline contracts/security/lifecycle, three files | **69/69 PASS**, 0.381 s; zero failures/skips/cancellations/TODO | `focused-acceptance.log` |
| Unchanged M5 pure boundary/planner/reference, three files | **51/51 Node-reported nodes PASS**, 0.835 s; **47 leaf cases + 4 parent groups** | `m5-pure-regression.log` |
| Lint | **PASS**, zero diagnostics | `lint-final.log` |
| Standalone TypeScript | **PASS**, zero diagnostics | `typescript-acceptance.log` |
| Dummy-datasource Webpack build | **PASS** after scoped compiler subprocess permission retry | `webpack-retry.log` |
| New TTS and existing M6/M7/M8/Phase 1A production audits | **8/8 scripts PASS** | `*-production.json` |
| Exact inventory, baseline hashes, new-domain collision, links, secrets and whitespace | **PASS**; 685 files unchanged, ten new paths, seven new domains | `source-audit.json`; staged receipt |

The final selection contains **120 distinct passing Node-reported nodes / 116 distinct leaf cases** (69 new + 47 unchanged M5 cases, plus four disclosed M5 parent groups). Earlier successful overlapping development executions are 2 + 62 + 66 = **130 repeats**. Across successful runs this is **250 passing node executions / 246 leaf executions**, representing those same 120 nodes / 116 leaf cases. Loops over six passages/four mock configurations, assertions, fake starts, eight audit scripts and historical reports add no independent test cases.

Retained failures: the initial default-isolated runner reported three failed file wrappers before any case-level evidence; a separate compiler-child diagnostic reproduced sandbox `EPERM`. The next in-process run executed 61 cases: **2 passed / 59 failed**, because the initial orphan-mark check rejected legitimate corpus spacing signs. That check was corrected, not the passages; dependent-sign chunk preservation and a specific regression were added. Subsequent development runs passed 62 and 66 cases, and final acceptance passes 69. The initial TypeScript run also failed on fixture readonly/narrowing types and ES2017 BigInt literal syntax; these were corrected only in new files. A default-sandbox build failed parsing its `tsc --showConfig` child output; direct child diagnostics returned EPERM, and the authorized compiler-permission retry passed without application changes. No existing test, quota, deadline or assertion was weakened. Failure logs were not overwritten.

Production source/bundle audit covers **364 source files** (including existing libraries), **217 built JavaScript files**, five test-only fixture modules, **38 unchanged API routes** and **zero Server Actions**. It finds zero new TTS markers in production, no fixture network/SDK/M5/M8-execution/maintenance imports, and no environment activation path. The seven unchanged audits independently preserve the earlier authority boundaries. The new egress tripwires are mocked negative controls plus reviewed transitive import restrictions, not a hostile-code OS network sandbox.

**NOT RUN:** PostgreSQL/M4/M6/M7/M8 runtime suites, Redis/queues, workers, M5 fake audio generation/parsing, media tools/decoders, browser/component suites, authenticated discovery/account APIs, provider synthesis, audio downloads, real listeners or paid inference. No application runtime/UI files changed; the pure M5 regressions, static preservation and fresh production build/import audits are the applicable broader checks. Database/media/provider operations are explicitly forbidden. No historical PASS count substitutes for an omitted suite.

### Exact fresh commands

All Node test/build commands used an explicitly unreachable application datasource. No application environment file changed. Compiler subprocess permission was expanded only for the failed build retry; this did not authorize a database, provider, worker or media operation.

```sh
export DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable
export NEXT_TELEMETRY_DISABLED=1
node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 tests/storyline/tts-evaluation/contracts.test.ts tests/storyline/tts-evaluation/security.test.ts tests/storyline/tts-evaluation/lifecycle.test.ts
node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 tests/storyline/voice-foundation/boundary.test.ts tests/storyline/voice-foundation/planner.test.ts tests/storyline/voice-foundation/reference.test.ts
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm exec next build --webpack
node tests/storyline/tts-evaluation/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/tts-evaluation-production.json"
node tests/storyline/render-execution-fake/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/render-execution-fake-production.json"
node tests/storyline/maintenance-fake/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/maintenance-fake-production.json"
node tests/storyline/render-planning/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/render-planning-production.json"
node tests/storyline/highlights-studio/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/highlights-studio-production.json"
node tests/storyline/timeline/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/timeline-production.json"
node tests/storyline/timeline-persistence/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/timeline-persistence-production.json"
node tests/storyline/timeline-studio/production-audit.mjs "$PWD/coverage/m10-02a-08428e50/timeline-studio-production.json"
python3 coverage/m10-02a-08428e50/audit.py
git diff --check
git diff --cached --check
```

### New source SHA-256 inventory

The following hashes pin all nine new executable/test source files. The report's own staged byte hash is recorded separately in `staged.json` to avoid a self-referential digest.

| New source | Raw file SHA-256 |
| --- | --- |
| `tests/storyline/tts-evaluation/capabilities.fixture.ts` | `7b06f5641612d9b18938ddc493b37b93fb563451627bc17045c7f83277584476` |
| `tests/storyline/tts-evaluation/contracts.fixture.ts` | `587020cc14196dc322171c408bc9fea4513104e80bf1692f7f2ce5746a8dc9ba` |
| `tests/storyline/tts-evaluation/contracts.test.ts` | `93a6e9ec037eb7a5e8c6fba6244a00ce3a850cdfc488d09b39fa4d8ecc12bd2c` |
| `tests/storyline/tts-evaluation/corpus.fixture.ts` | `ceb12a838da4f44f34d9ec487e09a661c156b9a5d4fcd284f01a5ba3b08bab39` |
| `tests/storyline/tts-evaluation/harness.fixture.ts` | `8ada1abc407aacd791dcaef459150d57b83b4f63499503e90450c57ef33d1f12` |
| `tests/storyline/tts-evaluation/lifecycle.test.ts` | `4c4e43bcb48395fce233e5d718e5e9d39edace466852e23387aa8d9520ac9de8` |
| `tests/storyline/tts-evaluation/production-audit.mjs` | `f8b143ec9cd997bd138dc89d19dd72605b1fd02a0be5fb95c61cc976c6a2d4ec` |
| `tests/storyline/tts-evaluation/security.test.ts` | `f51ed9152f284fd4026de6d385b46b804b44745d62ef22c6eed983c13977aadb` |
| `tests/storyline/tts-evaluation/spending.fixture.ts` | `a3a804490f6dbb96b68a7514832791a69ecc87b2c3d83ff53c0a02163f3ab2ea` |


The original sixteen M4 expiry controls and original 700-ms positive deadline remain unchanged at file SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`. **NOT RERUN here** because PostgreSQL is forbidden. The historical positive-control timing incident remains **UNRESOLVED**; no deadline/assertion changes or retry inference. M8 fake execution, Phase 0 and Phase 1A contracts/authority remain unchanged and unimported by this harness.

**M10-02B remains BLOCKED** by unverified account entitlement/key authority, current Eleven stock voice, accepted provider/upstream privacy/region/logging configuration, speech-route constraint enforcement, exact effective quote/max-charge/provider limit evidence, provider version/result retrieval semantics, separately reviewed live original-request ownership and an independently approved audio-decode/listening environment. Questions requiring authentication stop at ACCOUNT_VERIFICATION_REQUIRED; no account access is attempted to close them. No amount, account configuration, privacy decision, provider request, audio generation or future milestone is approved by this report.
