# M10-02B — Full Gemini 3.8 Flash TTS primary amendment

Review date: **2026-11-05, Asia/Bangkok**. **OFFLINE model-selection amendment PASS; M10-02B live evaluation BLOCKED.** This is configuration, public-document research and non-audio mock testing only. No account authentication, credential inspection, synthesis, paid request, media operation or production TTS activation is authorized or performed.

## 1. Selected configuration and historical evidence

The sole selectable mock configuration is:

| Field | Selection |
| --- | --- |
| Gateway | `OPENROUTER` / OPENROUTER_ONLY |
| Model | `google/gemini-3.8-flash-tts` — full model |
| Research stock voice | `Kore` |
| Language / locale | Burmese / Myanmar, `my` / `my-MM` |
| Proposed gateway response format | `pcm` |
| Billing components | `INPUT_TEXT_TOKEN` and `OUTPUT_AUDIO_TOKEN` |
| Actual output | Arbitrary NON_AUDIO_MOCK_RESULT fixture bytes only |
| Live/audio eligibility | `liveEligible:false`, `audioVerified:false`, actual duration `null` |

There is no alternate selectable configuration. ElevenLabs v3, its `george` voice, Flash-Lite, other models/voices/formats and all direct-provider configurations deny. No automatic fallback, retry or dispatch is added. Model/voice configuration stays in the server-only test catalog, outside production code and browser bundles. A future sender must use the existing single server-side OpenRouter credential boundary and independently reviewed server configuration; this amendment creates neither sender nor credentials.

The unchanged [M10-02A report](STORYLINE_M10_02A_MYANMAR_TTS_PROVIDER_READINESS.md), [Gate 0](STORYLINE_M10_02B_GATE0_ADMISSION_REVIEW.md) and [Gate 1](STORYLINE_M10_02B_GATE1_ACCOUNT_VERIFICATION.md) retain the dated ElevenLabs evidence and earlier selection history. **This amendment supersedes their active-selection statements**, not their recorded observations. Historical ElevenLabs evidence is not fallback authority or active entitlement. Gate 1's ACCOUNT_ACCESS_BLOCKED outcome remains unresolved; no new owner/account evidence was supplied or sought here.

## 2. Repository baseline and scope

Verified clean `main` at required HEAD **`a45d28dba2d9cc490de16b39291f449fce5e06a5`**, with 697 tracked files and empty initial index/worktree/nonignored untracked inventory. Verified accepted Gate 0, OpenRouter-only amendment and M8 Phase 1A ancestry with `git merge-base --is-ancestor`. No fetch, pull, reset, rebase, merge, branch switch or push.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), all three reports above and installed Next testing guidance before editing. Inspected actual catalog, request, quote, corpus, serializer, lifecycle and production-audit exports. Changes are limited to six existing test-only files and this new report. All **691 other baseline files remain byte-identical**, including the earlier reports, corpus, M5–M8 contracts, production source and original M4 controls. No application runtime, route, UI, worker, environment file or dependency changes.

## 3. Dated public evidence and limits

PUBLIC_DOCUMENTED means vendor documentation, not account entitlement or empirical voice quality. UNKNOWN means evidence remains missing. AUTHENTICATED_READ_ONLY_VERIFIED, OWNER_ATTESTED and EVALUATED_WITH_REAL_AUDIO each have **no new evidence** here. No model-list API, account API, speech endpoint, sample player or provider runtime was called; only public documentation/search pages were read.

| Item | Evidence as reviewed November 5 | Consequence |
| --- | --- | --- |
| Exact gateway model and rates | OpenRouter lists `google/gemini-3.8-flash-tts`, **USD 0.50/M input text tokens and USD 9/M output audio tokens**, 30 voices, AI Studio/Vertex serving paths and no current EU in-region route. [Model listing](https://openrouter.ai/google/gemini-3.8-flash-tts). | PUBLIC_DOCUMENTED; not an effective account quote, maximum output charge or current voice entitlement. Generic per-character TTS pricing language does not replace this model's token units. |
| Speech endpoint and format | Dedicated POST `/api/v1/audio/speech`, explicit model/input/voice; current guide says **Gemini TTS returns PCM only**, rejecting the other format. Raw bytes use `audio/pcm`; `X-Generation-Id` is metadata. [Speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts). | Select `pcm`; mock tests deny MP3/WAV/MP4. No actual PCM or verified audio is produced. |
| Kore through the gateway | OpenRouter's cookbook uses `Kore`/PCM with Flash-Lite and explicitly says full Flash TTS takes the same request. [Cookbook](https://openrouter.ai/docs/cookbook/audio/two-voice-podcast). | Public request-compatibility evidence supports Kore as a research candidate. The example's Lite model is never selected. This is not a fresh exact-full-model supported-voice-list or account receipt. |
| Full-model language / stock voice | Google's indexed official speech guide explicitly lists Burmese for full 3.8 Flash TTS and Kore as a prebuilt voice; the same language table excludes Burmese for Lite. [Official speech guide](https://ai.google.dev/gemini-api/docs/speech-generation). | DOCUMENTED_UPSTREAM; exact OpenRouter full-model/Kore/Myanmar combination, stock-voice revision/licensing and actual pronunciation remain UNKNOWN. |
| Speech routing | Guide says `order`, `only`, `ignore` do not apply to speech; `provider.zdr` / `data_collection` are described. [Speech contract](https://openrouter.ai/docs/guides/overview/multimodal/tts). | No claim of chat-style upstream pinning. Required routing/privacy enforcement and internal failover/retry semantics must be separately verified. |

Some direct Google page fetches now redirect or return a Markdown content type unsupported by the documentation reader. Official indexed text supplied the limited upstream schema/language/voice evidence; those fetch failures do not establish fresh direct API limits. The public OpenRouter model page does not enumerate Kore in its readable text. Its model-discovery API was not queried because provider-endpoint access is outside this task. **Exact current full-model voice/endpoint confirmation remains a live-trial prerequisite**, even though the candidate has public supporting evidence. No third-party gateway, model mirror or forum claim is used to close it.

### Direct Google TTS and OpenRouter are different contracts

| Aspect | Google's documented direct contract | Selected OpenRouter contract |
| --- | --- | --- |
| Model/configuration | Direct `gemini-3.8-flash-tts`; native speech configuration/annotations and `generation_config.speech_config`. | Namespaced gateway model, explicit top-level `voice:"Kore"`, exact string `input`, `response_format:"pcm"`. |
| Styling | Native `speech_metadata` annotations. | Gateway documents translating `instructions` into upstream style metadata. No instruction, style, provider option or text rewrite is enabled in this mock. |
| Response | Direct guide shows native response objects with audio data and default unary WAV; direct streaming format differs. | Gateway returns raw PCM bytes. Never copy the direct WAV default or response parser into the gateway adapter. |
| Credentials/limits | Direct account, native endpoint limits and retention controls would apply to a different service contract. | Only OpenRouter is eligible. Direct limits, `store:false` or a direct model entitlement do not prove gateway output bounds, privacy or entitlement. |

The direct-column details come from the official indexed guide cited above; they are schema comparisons only. No Google client, native endpoint request, WAV wrapper or direct fallback is implemented. PCM byte length alone cannot certify encoding, channels, duration or spoken coverage.

## 4. Corpus identity is unchanged

The [corpus fixture](../tests/storyline/tts-evaluation/corpus.fixture.ts) remains byte-for-byte unchanged: six original fictional Myanmar passages, **2,586 UTF-8 text bytes, 910 code points and 13 review chunks**. No movie dialogue, personal data or confidential text. Normalization remains `EXACT_UTF8_NO_NORMALIZATION_V1`; no trim, NFC/NFD, transliteration or substitution. The segmentation algorithm remains `INTL_MY_GRAPHEME_PLUS_DEPENDENT_SIGNS_V1`, ICU 78.3 / Unicode 17.0.

- Corpus domain hash: `940ab42793a4316ade9103382bbb31357eff66c55fc8388c2f383c4b96079efa`.
- Canonical corpus payload raw UTF-8 SHA-256: `fb48bc51b92dee832113223b2483416fb46d74215c907d423a4373ee679c74db`.
- Corpus source raw SHA-256: `ceb12a838da4f44f34d9ec487e09a661c156b9a5d4fcd284f01a5ba3b08bab39`.

The focused suite now pins the exact corpus hash. Freshly generated text/chunk metadata and both payload hashes matched the entire preserved M10-02A `corpus-hashes.json` receipt, including every one of the six text hashes and 13 chunk hashes/offsets. The ignored receipt contains hashes/counts rather than new text copies. Model selection changes request hashes; it does not change corpus identity. Editorial/pronunciation approval remains NOT_ISSUED. Six complete passages would mean at most six separately approved original requests; review chunks must not expand dispatch count.

## 5. Gemini billing validation and spending blockers

The unissued mock proposal requires exactly the input-text-token and output-audio-token components, each with a bounded positive maximum unit count, bounded rate and unit divisor, plus required bounded `overheadMicros`. Integer-ceiling BigInt arithmetic reserves all approved originals against the mock cap. Mock prices/limits remain synthetic (205 micro-units per original, 1,230 for six); **these are not actual Gemini prices, an approved USD budget or a real charge guarantee**. A zero mock overhead is not evidence that real fees are zero.

Added negative cases deny missing output components, absent/zero/unknown/infinite output maxima, missing/unknown audio-token rates, unknown/negative/infinite fee overhead, character/credit billing substitutions and caller reductions of the frozen mock audio/fee quote. Required fields and exact canonical parsing are preserved. The independent authority is only the trusted in-memory fixture composition; it is not an authenticated quote issuer. No new approval schema, signature, budget or live spending record is created.

`liveReadiness()` remains NO_GO and now explicitly exposes three unclosed requirements: an independent maximum output-audio-token charge, all applicable fee evidence, and reviewed durable request ownership. It cannot become GO after successful mocked observations. `liveEligible:false` and `audioVerified:false` remain permanent.

A future live authorization must independently establish, and bind to the exact model/voice/account/corpus/wire configuration:

1. Maximum billable input text tokens **and maximum billable output audio tokens per original**, with trustworthy enforcement/quote evidence and valid effective rates/rounding. A short input, character count, context-window label, predicted speech duration or direct Google output limit is insufficient. An advertised price is not a maximum output charge.
2. All applicable gateway/upstream fees, taxes, currency/credit conversion and any internal retry/failover liabilities. An UNKNOWN fee cannot be replaced by zero.
3. Provider-enforced limits for the actual account/key/workspace and a separate defensible total maximum covering in-flight overshoot, delayed accounting, shared traffic and outstanding liabilities. Current public budget docs say budgets are available on every plan, superseding the earlier report's Enterprise-only public statement; account controls are still uninspected. Already-dispatched requests can exceed thresholds. [Current budget documentation](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets).
4. A closed list of at most six original request identities, concurrency one, immutable request hashes, durable count/charge reservations, expiration/revocation and owner approval of the exact total actual spend. Resets cannot replenish the trial's original-request authority.

No numeric real budget, output-token ceiling or fee amount is chosen here. If the maximum total liability cannot be independently bounded, the trial remains BLOCKED. The mock validator is memory-only and cannot be promoted to durable billing authorization.

## 6. Privacy, routing, account and recovery gaps

Current OpenRouter ZDR documentation has changed since Gate 1: it distinguishes ZDR, Safety Retention, and Retention and Training. It describes account/guardrail choices that can allow Safety Retention with ZDR enforcement, and an October 27 notice concerning in-flight CSAM screening and exceptional retention. A `zdr:true` flag therefore does not establish an absolute no-retention guarantee. Applicability, current terms and exact endpoint enforcement need independent review. [Current ZDR policy](https://openrouter.ai/docs/guides/features/zdr).

The chosen Google serving path must have explicitly accepted gateway/upstream training, safety/abuse logging, retention/deletion and regional terms. AI Studio versus Vertex may matter; direct Google privacy flags or paid status do not settle the gateway agreement. Required route constraints that speech cannot enforce are blockers, not permission to call Google directly. No account setting, API key, balance, invoice or private policy was inspected; ACCOUNT_ACCESS_BLOCKED remains.

The existing lifecycle rules remain: reserve the original before the one mock invocation; return retained original state for safe duplicates; deny changed identity/configuration; retain the full liability and stop new dispatch on UNKNOWN; no fresh key, different model, expired lease, timeout, missing ACK or NOT_FOUND can authorize another start. Recovery-like observations have no resend method. No automatic dispatch occurs during composition. Same trusted-assessor reservations are shared across handles/harness objects, but this is not restart-durable paid-request ownership.

No M8 fake execution, maintenance, private storage or recovery authority is imported. No M5 fake audio or media receipt can prove real speech. All returned fixture bytes remain arbitrary non-audio data; PCM is selected configuration metadata only.

## 7. Exact changed/new file inventory

| Path | Disposition / purpose |
| --- | --- |
| `tests/storyline/tts-evaluation/capabilities.fixture.ts` | Modified: sole Gemini/Kore/PCM server-only selection; former Eleven entry removed from active catalog. |
| `tests/storyline/tts-evaluation/spending.fixture.ts` | Modified: proposal generator validates selection and produces only two-component Gemini token quotes with explicit synthetic fee-overhead comment. |
| `tests/storyline/tts-evaluation/harness.fixture.ts` | Modified: live-readiness blockers explicitly include output-audio charge, fees and durable ownership. No sender or retry logic added. |
| `tests/storyline/tts-evaluation/contracts.test.ts` | Modified: exact corpus hash pin, sole configuration assertions and Gemini quote default. |
| `tests/storyline/tts-evaluation/security.test.ts` | Modified: retired-model/format rejection, Gemini output-charge and fee-bound adversarial cases. |
| `tests/storyline/tts-evaluation/lifecycle.test.ts` | Modified: sole primary flow, unchanged concurrency/UNKNOWN safeguards exercised under Gemini, explicit no-dispatch/readiness case. |
| `docs/STORYLINE_M10_02B_GEMINI_PRIMARY_AMENDMENT.md` | New: this decision, evidence, results, preserved history and live blockers. |

Earlier reports, corpus/contracts fixture, M5–M8 sources and the production-audit script are unchanged. No package installation or production module is needed.

The following SHA-256 values pin all nine test-only source files, including the three unchanged files. The report hash is recorded separately in the staged receipt.

| File under `tests/storyline/tts-evaluation/` | Raw SHA-256 |
| --- | --- |
| `capabilities.fixture.ts` | `ca7510a0efab87a9762cdaf31f27e8625d500a24e6f538fb666b621c4e6e8e5b` |
| `contracts.fixture.ts` | `587020cc14196dc322171c408bc9fea4513104e80bf1692f7f2ce5746a8dc9ba` |
| `contracts.test.ts` | `d477b1c1dd209ec6d4f208b9c3ffd53a21f0f1352363096b17ed7240777e8af0` |
| `corpus.fixture.ts` | `ceb12a838da4f44f34d9ec487e09a661c156b9a5d4fcd284f01a5ba3b08bab39` |
| `harness.fixture.ts` | `3ff776c953092f2a85e561f882c126f113a468d5df70df84b8d185e3332572e3` |
| `lifecycle.test.ts` | `e77129f50ace1c5c876c91508cfcae9c9ea732138380b831e4dc582381e28dc1` |
| `production-audit.mjs` | `f8b143ec9cd997bd138dc89d19dd72605b1fd02a0be5fb95c61cc976c6a2d4ec` |
| `security.test.ts` | `331df13b902c1fc850987c60c742f7250b521ca61896dfa2ac6048111bc0f4fb` |
| `spending.fixture.ts` | `e29cb4daaec83e1ed5286ff3231ea83d1e225db341da259f3e2b3e9b928bf5a0` |

## 8. Actual verification

Receipts are retained in ignored `coverage/m10-02b-gemini-primary-20261105/`; prior logs remain intact. Commands use an empty inherited environment (`env -i PATH="$PATH"`) and the unreachable application datasource `postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable`. A verification-only Node preload excludes dotenv/npmrc reads and blocks reviewed network APIs; the successful build lists no loaded environment file. The preload is outside the repository after the lint correction described below. These are verification safeguards, not an OS sandbox certification or application changes.

| Check | Actual result / receipt |
| --- | --- |
| Offline TTS contracts/security/lifecycle, three files | **93/93 PASS**, 0.480 s; zero failed/skipped/cancelled/TODO. `focused.log` |
| M5 pure boundary/planner/reference, three unchanged files | **51/51 Node nodes PASS**, 1.271 s; **47 leaf cases + four parent groups**. `m5-pure.log` |
| Lint | **PASS**, zero diagnostics on final run. `lint-final.log` |
| TypeScript | **PASS**, zero diagnostics. `typescript.log` |
| Dummy-datasource Webpack build | **PASS**, compiler subprocess permission; no loaded dotenv or network calls. `webpack.log` |
| TTS + existing M6/M7/M8/Phase 1A production audits | **8/8 scripts PASS**. `*-production.json` |
| Corpus receipt / baseline source preservation / scope / secrets / whitespace | PASS; exact inventory and staged checks recorded before commit. `corpus-hashes.json`, `source-audit.json`, `staged.json` |

There are **144 distinct passing Node-reported nodes / 140 distinct leaf cases**, each executed once in this amendment: 93 TTS leaves + 47 M5 leaves + four disclosed M5 parents. **Zero overlapping test reruns.** Compared with historical 78 TTS cases, one retired Eleven positive case was removed, 16 cases were added and relevant existing cases were updated. Prior runs, loops/assertions, eight audit scripts, hash calculations and verification-helper smoke checks do not add Node test cases.

Retained non-suite failures: the first lint run reported six CommonJS-import style errors in the newly created verification preload under the otherwise ignored coverage directory. The helper was moved outside the repository; lint rules and application code were not weakened. A preload smoke check initially used the synthetic basename `.env-synthetic-never-open`, outside the loader's `.env`/`.env.*` pattern, and received ordinary ENOENT; correcting it to `.env.synthetic-never-open` verified interception. Neither attempt read an application environment file or contacted an endpoint. Initial failure logs remain `lint.log` and `guard-check-initial.log`; the corrected smoke check passes in `guard-check.log`. These were tooling diagnostics, not hidden runtime test failures. Public Google document fetch failures are also disclosed above. No scoped test case failed.

The TTS audit covers **364 production source files, 217 built JavaScript files, five server-only fixture modules, 38 unchanged API routes and zero Server Actions**. It finds zero new TTS fixture markers or network/SDK/M5/M8 authority imports. Seven unchanged audits preserve the prior production boundaries. Neither build nor static scans certify account entitlement, provider behavior, real audio or a production TTS adapter.

### Commands

For guarded commands, `VERIFY_GUARD` denotes the verification-only preload path retained in ignored `guard-location.txt`; it is never a production setting. The build/M5/TypeScript originally used the same preload bytes in the receipt directory before its relocation; final lint/audits used the outside-repository path. The first focused test run used the clean environment and its existing in-test egress tripwires. No application environment file was read or edited. Guarded commands used `env -i PATH="$PATH" NODE_OPTIONS="--require=$VERIFY_GUARD" DATABASE_URL=postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable NEXT_TELEMETRY_DISABLED=1` before the command below.

```sh
node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 tests/storyline/tts-evaluation/contracts.test.ts tests/storyline/tts-evaluation/security.test.ts tests/storyline/tts-evaluation/lifecycle.test.ts
node --conditions=react-server --import tsx --test --test-isolation=none --test-reporter=tap --test-concurrency=1 tests/storyline/voice-foundation/boundary.test.ts tests/storyline/voice-foundation/planner.test.ts tests/storyline/voice-foundation/reference.test.ts
pnpm lint
pnpm exec tsc --noEmit --incremental false
pnpm exec next build --webpack
node tests/storyline/tts-evaluation/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/tts-evaluation-production.json
node tests/storyline/render-execution-fake/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/render-execution-fake-production.json
node tests/storyline/maintenance-fake/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/maintenance-fake-production.json
node tests/storyline/render-planning/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/render-planning-production.json
node tests/storyline/highlights-studio/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/highlights-studio-production.json
node tests/storyline/timeline/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/timeline-production.json
node tests/storyline/timeline-persistence/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/timeline-persistence-production.json
node tests/storyline/timeline-studio/production-audit.mjs coverage/m10-02b-gemini-primary-20261105/timeline-studio-production.json
python3 coverage/m10-02b-gemini-primary-20261105/audit.py
git diff --check
git diff --cached --check
```

The corpus metadata calculation additionally imports only the existing pure corpus/canonical/hash fixtures under the offline verification guard. No provider or media implementation is imported.

**NOT RUN:** PostgreSQL/database-dependent M4–M8 suites, Redis/workers, M5 audio-generation/verification lifecycles, browser/component suites, authenticated account discovery, live provider endpoints, real speech/audio download/decode/listening, media binaries, deployment or push. The user forbids database/media/provider operations; no application/UI source changed. No historical PASS counts stand in for those suites.

## 9. Future live gate and remaining risks

A separately authorized review must establish exact full-model/Kore/PCM speech entitlement and voice revision, account-owner scope and restricted inspection method, accepted current gateway/upstream privacy and routing terms, enforceable provider controls, an independent maximum output-audio-token charge plus all fees, and a bounded total liability. A separately reviewed durable original-request journal must preserve UNKNOWN without retry/fallback across crashes; the in-memory mock is insufficient.

Only then may an explicit new user approval bind the exact unchanged corpus, at most six originals, concurrency one, maximum actual spend, expiry/revocation and no retry/substitution. Native PCM capture must remain private with exact byte hash/count and independently established encoding parameters; separate bounded decoding and two independent qualified Myanmar listeners must assess complete script coverage, names, numbers/date, negation/uncertainty and naturalness. MIME type, returned bytes or a claimed duration are not audio verification. None of those operations is authorized here.

The original sixteen M4 expiry controls and 700-ms positive deadline remain byte-identical at SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`; the historical timing incident remains **UNRESOLVED**, not rerun or weakened. M8 fake-only ownership/maintenance boundaries and all prior security contracts remain unchanged and isolated.

**Final decision: offline amendment PASS; live M10-02B BLOCKED. Stop after this amendment.** No account, budget, approval, synthesis, decoder, provider request or next milestone is activated by this report or its local commit.
