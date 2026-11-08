# M10-02B Gate 1 — OpenRouter account and billing verification

Review date: **2026-10-21, Asia/Bangkok**. Policy: **OPENROUTER_ONLY**.

**Account verification: ACCOUNT_ACCESS_BLOCKED. Live trial: BLOCKED.** Separate account-owner authorization and a suitably restricted inspection method have not been established. No redacted owner evidence has been supplied for reliability review. Authenticated inspection was not attempted; public documentation was reviewed without account access. This report is the requested blocked-path deliverable, not a successful account verification, spending approval or synthesis authorization.

## 1. Baseline and authority decision

Verified clean `main` at required HEAD **`ca98daa3e5335b43d3ec57a1ff76a249cfabce47`**: initial index, worktree and nonignored untracked inventory empty; **696 tracked files**. Verified accepted ancestry through `1a56ea13038aea20380697642facf70924dbb6a3`, `1e1b96199d229ec448906156532ffa8bc22a0c00` and `3c9680227840e3238958d6655e4b94cbc3014f12`. No remote state was refreshed; no existing Git history was rewritten.

Read [AGENTS](../AGENTS.md), [CLAUDE](../CLAUDE.md), [Gate 0](STORYLINE_M10_02B_GATE0_ADMISSION_REVIEW.md) and [M10-02A](STORYLINE_M10_02A_MYANMAR_TTS_PROVIDER_READINESS.md). Earlier reports and mock tests do not establish current account behavior.

| Account-access prerequisite | Evidence available in this review | Decision |
| --- | --- | --- |
| Explicit authorization from the account owner | Requested separately in this conversation; owner status and scope-specific consent not established. A project task instruction alone does not identify the account owner. | BLOCKED |
| Exact permitted scope | Proposed below; not accepted as an owner-authorized access grant. | UNKNOWN |
| Appropriately restricted method | No approved read-only connector/broker or supervised owner inspection has been identified. No browser account/session, local secret or environment file was inspected to discover one. | BLOCKED |
| Owner-supplied redacted evidence | None received; no account claim is classified OWNER_ATTESTED. | UNKNOWN |

Authenticated inspection stops at this boundary. No credential was requested, printed, stored or used. No API key, application environment file, private account URL or account screen was accessed. There was no attempt to use an unrestricted credential, a management key or an already logged-in browser as a workaround.

The proposed scope, requiring separate owner acceptance, is limited to reading model/voice/format entitlement and licensing, speech quotas, key restriction/revocation metadata, current privacy/routing policies, effective billing rates/fees and spend controls, outstanding/shared liabilities, and already existing original-request usage receipts. It excludes account settings changes, key creation/rotation/revocation, budget changes, previews, synthesis, test charges, unrelated account history, stored prompt/completion content, audio downloads and direct-provider access. Reading an endpoint's public specification is not calling that endpoint.

## 2. Evidence classifications and safe references

| Classification | Meaning and actual coverage |
| --- | --- |
| PUBLIC_DOCUMENTED | Official public specification/claim checked on the review date, with direct public links below. Not evidence of this account's entitlement or configuration. |
| OWNER_ATTESTED | A specific account-owner statement supported by a safe evidence reference, independently reviewed for reliability. **None supplied or accepted.** |
| AUTHENTICATED_READ_ONLY_VERIFIED | Metadata independently observed through an explicitly owner-authorized, appropriately restricted method. **Zero observations and zero requests.** |
| UNKNOWN | Account state, actual contract or behavior not established; no silent inference or fallback. |
| BLOCKED | Missing authority/evidence prevents inspection or live admission. ACCOUNT_ACCESS_BLOCKED is the specific account-access outcome. |

The evidence references in this report are public official documentation or repository paths/commits only. No private receipt, account identifier, credential, confidential screenshot or private URL is included. Documentation examples are not owner evidence. A public schema's example amounts, IDs and flags must never be copied as actual account settings.

## 3. Entitlement review

The primary remains **`elevenlabs/eleven-v3` / `george` / `mp3` / Myanmar (Burmese)**. The secondary `google/gemini-3.8-flash-tts` / `Kore` requires separate future approval; it is not a fallback. There is no direct ElevenLabs, Google or Azure integration, model substitution, retry or gateway alternative.

| Item | Safe public evidence | Account-specific disposition |
| --- | --- | --- |
| Account/workspace eligibility | OpenRouter says a separate ElevenLabs subscription is unnecessary for gateway access. [Gateway announcement](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). | UNKNOWN: actual account/plan, geography, workspace authority and terms eligibility. Inspection BLOCKED. |
| Exact model | Public listing identifies `elevenlabs/eleven-v3`, TTS, 5,000-character ceiling and 21 voices. [Model page](https://openrouter.ai/elevenlabs/eleven-v3). | UNKNOWN: account entitlement, current route availability and immutable/versioned model selection. |
| Stock voice / revision | Gateway announcement documents premade names including `george`. [Stock-voice documentation](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). | UNKNOWN: actual availability for this model/account, revision, licensing, withdrawal/remapping/substitution and change-notice guarantees. |
| Myanmar language | Upstream v3 explicitly lists Burmese (`my`). [Upstream language table](https://elevenlabs.io/docs/overview/models). | UNKNOWN: exact gateway/model/voice combination and any required language/normalization configuration; no voice-quality evaluation. |
| Audio formats | Speech guide documents `mp3`/`pcm`; the announcement describes MP3 44.1 kHz/128 kbps and default PCM 24 kHz, mono, 16-bit little-endian. [Speech guide](https://openrouter.ai/docs/guides/overview/multimodal/tts), [format claims](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). | UNKNOWN: account/voice format entitlement and actual native output. No audio response or decode exists. |
| Speech limits | The model page's input ceiling is public. | UNKNOWN: account-specific rate, request, concurrency, output and byte limits; generic/free-chat limits cannot fill this gap. |
| Key scope / expiry / revocation | Public current-key schema exposes limit/usage/reset/expiry and management-key metadata. [Current-key specification](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key). | UNKNOWN: actual permitted model/actions, assignment, expiry/revocation mechanism and emergency-stop owner. No key was inspected or revocation tested. |

A read-only API method does not itself prove the credential invoking it lacks synthesis or management authority. The generic current-key response also contains sensitive labels/identity metadata: a future restricted broker or owner must redact those before evidence release. Do not request the key to perform this review.

## 4. Privacy and speech-routing review

| Item | PUBLIC_DOCUMENTED | Account-specific disposition |
| --- | --- | --- |
| Gateway content logging/use | OpenRouter describes optional prompt/response retention and product-improvement use. [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection). | UNKNOWN: effective logging/opt-in, broadcast/tracing, metadata retention/deletion and owner acceptance. |
| Upstream retention/training | Endpoint-specific policies can differ from general provider policies. [OpenRouter ZDR](https://openrouter.ai/docs/guides/features/zdr). ElevenLabs documents default retention and eligible enterprise ZRM. [Upstream ZRM](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode). | UNKNOWN: contract actually governing the OpenRouter speech endpoint, training exclusions, abuse retention, backups and deletion obligations. Direct-account enterprise status is not transferable evidence. |
| Required ZDR | Speech supports `provider.zdr` and `data_collection`. [Speech-specific contract](https://openrouter.ai/docs/guides/overview/multimodal/tts). | UNKNOWN: whether ZDR is mandatory for this owner, exact route eligibility and effective enforcement. If mandatory and unenforceable: BLOCKED. |
| Routing / failover | Speech does **not** apply `order`, `only` or `ignore`; general guardrails describe model/provider restrictions. [Speech limits](https://openrouter.ai/docs/guides/overview/multimodal/tts), [guardrails](https://openrouter.ai/docs/guides/features/guardrails). | UNKNOWN: guardrail effect on this TTS route, actual serving upstream, substitution rules and internal retries. Chat-style pinning is not proof. |
| Processing location | Model page states no current EU in-region routing. [Model location limitation](https://openrouter.ai/elevenlabs/eleven-v3). | UNKNOWN: required geography and enforceable actual upstream location. Incompatible mandatory restrictions: BLOCKED. |

No privacy setting or policy was changed or accepted on the owner's behalf. Paid status, a public ZDR description or a configured-looking field cannot establish this account's privacy. Live disclosure remains BLOCKED without explicit acceptance of the applicable gateway/upstream terms, content handling, geography and deletion requirements.

## 5. Billing, limits and total-liability review

| Item | Public evidence / independent interpretation | Account-specific disposition |
| --- | --- | --- |
| Effective model rate | Model page displays **USD 80/M characters** while retaining an offer banner ending October 19, 2026. [Displayed rate](https://openrouter.ai/elevenlabs/eleven-v3). | UNKNOWN: effective account rate, valid quote, discounts and rounding. An expired promotion display is not a billing receipt. |
| Billable units | Announcement defines characters as Unicode code points, including audio tags. [Unit definition](https://openrouter.ai/blog/announcements/elevenlabs-on-openrouter/). | PUBLIC_DOCUMENTED unit claim; actual request metering and any additional billable components remain UNKNOWN. No tags or extra context are authorized. |
| Fees/taxes / currency | No account invoice/quote inspected. | UNKNOWN: fees, tax jurisdiction, currency conversion and final all-in charge. No zero-fee assumption. |
| Effective key/workspace controls | Current-key schema describes limit/remaining/reset and effective-budget fields. Workspace and guardrail documents describe layered controls. [Key metadata](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key), [workspace budgets](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets), [guardrails](https://openrouter.ai/docs/guides/features/guardrails). | UNKNOWN: actual plan eligibility, assigned controls, current usage, remaining allowance and whether restrictions bind the exact speech route. |
| Enforcement / overshoot | Workspace checks occur before dispatch; already-dispatched requests may complete above the threshold. Periodic limits reset; lifetime workspace budgets do not. [Budget behavior and FAQ](https://openrouter.ai/docs/guides/features/workspaces/workspace-budgets). | A threshold can reject later admissions without bounding all liability. Key/guardrail-specific overshoot, delayed accounting and exact reset remain UNKNOWN; do not generalize away these gaps. |
| Shared traffic / outstanding charges | No owner attestations or account observations. | UNKNOWN: other users/keys, in-flight work, reservations, unposted charges, top-ups and administrative changes. Do not assume an isolated account or zero liabilities. |
| Maximum per original | No effective all-in quote or independently evidenced upper bound. | **UNKNOWN / BLOCKED**. No charge maximum certified. |
| Maximum six-request evaluation | No verified per-original bounds, effective provider controls, isolated liabilities or owner approval. | **UNKNOWN / BLOCKED**. No numerical budget, liability maximum or spending authority issued. |

The unchanged corpus and hashes are recorded in [Gate 0](STORYLINE_M10_02B_GATE0_ADMISSION_REVIEW.md): six passages, 2,586 UTF-8 bytes, 910 code points and 13 review chunks. None was changed or submitted. Neither that small size nor multiplication by an advertised rate establishes a maximum actual charge. The proposed scope remains at most six original requests with concurrency one; review chunks must not expand paid request count.

Any future maximum-charge assessment must independently bind exact wire text/configuration, all billable units and their maxima, effective quote/fees/taxes/rounding, the provider-enforced threshold and its overrun/reset behavior, and shared/outstanding liabilities. The trial needs a durable original-count and worst-charge reservation protocol across restarts, plus owner approval of a named total maximum. The memory-only M10-02A spending validator supplies none of that live authority. If the required total cannot be bounded, live evaluation remains BLOCKED regardless of a displayed budget or account balance.

No budget was created, altered or approved; no key or guardrail was changed. No billable diagnostic or over-limit test was attempted.

## 6. Original generation / UNKNOWN review

The speech guide documents `X-Generation-Id` on raw-byte responses. A generic authenticated metadata lookup is publicly documented as `GET /api/v1/generation` with a required generation ID; its schema includes model/provider and cost metadata. [Speech response](https://openrouter.ai/docs/guides/overview/multimodal/tts), [generation metadata specification](https://openrouter.ai/docs/api/api-reference/generations/get-request-&-usage-metadata-for-a-generation).

This establishes a public lookup mechanism, **not** its successful availability for this account or exact TTS model. No real generation ID was supplied, sought or queried. The generic example is not a speech receipt. A prompt/completion-content retrieval function is not proof of native audio retrieval and is outside the proposed content-free inspection scope.

| Recovery question | Gate 1 finding |
| --- | --- |
| Original usage/billing receipt with a known ID | PUBLIC_DOCUMENTED generic metadata lookup; exact speech applicability, completeness, retention, latency and final-charge reconciliation UNKNOWN. No authenticated lookup performed. |
| Idempotency guarantee | UNKNOWN for the exact speech route; no assumed idempotency header, exactly-once guarantee or retry permit. |
| Internal OpenRouter retries/failover | UNKNOWN for the exact route/account and its charging behavior; SDK/client retry disabling alone would not settle this. |
| Lost response acknowledgement / missing ID | UNKNOWN; a header available on an acknowledged response does not prove recovery when the header itself is lost. No request was sent to investigate. |
| Timeout, 429/5xx, NOT_FOUND or empty lookup | Must not be treated as proof of no synthesis or charge. Retain original identity and full unresolved liability; no new key, model, gateway or replacement request. |
| UNKNOWN liability | Not resolved here; no outstanding-liability statement about the account is made. Future original evidence may be inspected only under separately authorized scope, never by resending speech. |

Recovery, decoding and listening remain separately gated. No M8 fake execution or maintenance system is imported or adopted as a live billing journal.

## 7. What would permit a later read-only review

Both of the following remain prerequisites, not approvals created by this report:

1. An explicit statement from the account owner authorizing the precise content-free scope, inspection period and evidence disclosure, without publishing identity/account identifiers.
2. A method demonstrably restricted to the authorized observations, or owner-supplied redacted evidence accepted after independent reliability review. No broad management credential, unrestricted inference key or unreviewed browser session is an acceptable shortcut.

Owner evidence, if later supplied, must identify which claim was observed, observation time, policy/quote validity, observation method and coverage, with a safe private evidence reference. Assess freshness, same-account/key/workspace binding privately, completeness, contradictory evidence, plan/route applicability, and redactions that may remove essential context. Preserve unresolved gaps as UNKNOWN. Do not promote a self-authored summary or cropped screenshot into AUTHENTICATED_READ_ONLY_VERIFIED. No actual evidence references are fabricated here.

A documented GET method is not automatically safe for this task. For example, listing all API keys requires management authority in the public specification. [Management boundary](https://openrouter.ai/docs/api/api-reference/api-keys/list-api-keys). It was not invoked; no management credential was acquired. Prefer supervised owner inspection or an independently reviewed least-privilege broker; none is provisioned by this gate. Read-only authorization never permits changing keys, privacy, budgets or resources to make a review pass.

A later successful metadata review would still not authorize speech, spending, decoding, listening, production integration or a secondary model trial. No follow-up account operation starts automatically.

## 8. Verification and preservation

**Documentation/static review: PASS. Account verification: ACCOUNT_ACCESS_BLOCKED.** These are separate outcomes.

| Fresh static check | Result |
| --- | --- |
| Baseline / ancestry / initial cleanliness | PASS; exact expected `main` HEAD, three named ancestors, empty initial index/worktree/nonignored untracked inventory. |
| Source/scope preservation | PASS; all **696 baseline tracked files** matched their entry SHA-256 values. No application or test source changed; report is the only new repository file. |
| Documentation links | PASS; **five local references / four distinct existing targets**, and **12 distinct public official targets** resolved through the documentation reader. A legacy public key-list documentation path returned 404; official navigation resolved its current public target. No authenticated endpoint was probed. |
| Secrets and private references | PASS; zero matches in the report for reviewed credential/private-key, private identifier and email patterns; no credentials, confidential screenshot or private URL included. Pattern scans are limited checks, not universal secret detection. |
| Classification/scope | PASS; all five required evidence classes are explicit, account authentication remains blocked, and no owner assertion/receipt or successful account verification is invented. |
| Markdown / whitespace | PASS; report-specific final-newline/trailing-whitespace/table checks plus `git diff --check` and `git diff --cached --check`. The custom check covers the initially untracked report. |
| Exact Git inventory | PASS; only this report is owned; explicit-path staging and exact staged/worktree byte comparison are checked before local commit. |

Checks used read-only Git status/branch/HEAD/ancestry/inventory commands, public documentation reads, inline Python source hashing/link/secret/scope checks and both Git whitespace checks. Staged verification uses `git diff --cached --name-only` and `git show :docs/STORYLINE_M10_02B_GATE1_ACCOUNT_VERIFICATION.md`. No helper file or executable fixture is created or imported. No prior test counts are counted as Gate 1 checks.

The only owned path is `docs/STORYLINE_M10_02B_GATE1_ACCOUNT_VERIFICATION.md`. No existing file, log, corpus or runtime source is modified; no helper module, receipt fixture, package or additional repository file is created.

The original M4 expiry-control file remains SHA-256 `8330f222f1d74bcd21a8aec20f0b7b4569bac9b557e478df8412063bb41c55d7`; the sixteen controls and original 700-ms positive deadline are preserved. The historical M4 timing incident remains **UNRESOLVED**. All accepted M8 fake-only execution, Phase 0 and Phase 1A boundaries remain unchanged; no runtime integration or new authority is introduced.

**NOT RUN:** runtime/offline tests, lint, TypeScript, build/bundle execution, browser tests, database/Redis/workers, authenticated metadata requests, credential access, voice previews, synthesis, paid calls, audio/media capture or decoding, listening, migrations, deployment and push. This gate produces Markdown and static review evidence only. Previous PASS test counts are not fresh Gate 1 evidence.

**Final disposition: ACCOUNT_ACCESS_BLOCKED; live evaluation BLOCKED.** Documentation/static-check success and a local documentation commit do not establish account verification or grant spending authority. Stop after Gate 1.
