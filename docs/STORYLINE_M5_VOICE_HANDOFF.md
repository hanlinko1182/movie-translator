# M5 Myanmar voice/TTS handoff — M4-05

## Implementation boundary and readiness

M4 produces durable, grounded **synthetic provisional narration**. There is no human-approved M4 narration record, review/approval issuer, production spending authority, approved TTS provider/voice registry, audio job/result schema, real transport or audio artifact today. M1 source verification and subtitle approval cannot supply those missing M4/M5 approvals.

M5-01 is ready for **pure/fake-only voice contract, capability and chunk-plan integration**. Real TTS is BLOCKED until the deployment, authentication, human approval, provider support and spending gates below are implemented and separately authorized. No synthetic ancestry or provisional text may be submitted to a real provider, including after a HUMAN_EDIT origin is attached to its descendant.

## Executable handoff delivered

- `lib/storyline/voice/contracts.ts`: versioned request proposal, capability manifest, future adapter/permit and verified-artifact metadata types.
- `lib/storyline/voice/handoff.ts`: bounded pure planning parser/hash and fail-closed current M4 handoff assessment.
- `tests/storyline/voice-handoff.test.ts`: executable schema, identity, Unicode, cost, cloning, authority-forgery and disabled-execution tests.
- Final disposable M4 acceptance tests construct the proposal from actual restricted narration read/receipt and prove that it remains blocked without writing any voice/approval record.

`parseVoiceRequestProposal` accepts `story-voice-request-proposal-v1`, with mandatory `execution: DISABLED_HANDOFF_ONLY`, and returns `executable: false`. `assessNarrationVoiceHandoff` binds exact captured draft/hash/section/source/analysis and a separately supplied stored receipt ID/hash, but always returns `eligibleForProviderSubmission: false`. It performs no authoritative lookup, approval, spending, provider selection or audio operation. Its `NOT_ESTABLISHED_BY_PURE_CONTRACT` source-currentness label is intentional.

Even shape-valid approval, cost or spending references do not change this outcome. Server-supplied receipt identity is a structural comparison dependency here; JSON shape/hashes do not prove database existence or authenticated authority. Future context acquisition must load the actual approved immutable record and independently resolve all references under restricted access.

## Versioned request proposal

| Contract field | Meaning and required future validation |
| --- | --- |
| `scope` | Exact Project/Movie/Studio, including an older selected movie; no newest-movie fallback. |
| `narration.draftId/draftHash` | M4 durable record ID and canonical hash, not payload logical ID, M3 hash or M2 marker hash. |
| `narration.sectionId/sectionOrder` | Exact immutable narration section/beat, preserving editorial order. |
| `chunkIndex/chunkCount/textHash` | Exact ordered text unit. Current handoff assessment supports one whole section only; future chunking needs an immutable validated plan. |
| `source` | Exact snapshot/content/context/dependency/binding/media hashes and Studio revision. |
| `analysis` | Exact M3 candidate ID/hash and original M2 task/generation/result/recipe lineage. |
| `approval` | Future approval ID/hash, policy version and current source-verification dependency hash, or null. Shape is not approval. |
| `language/locale` | `my` / `my-MM`; a locale label is not proof of model/voice support. |
| `voice` | Server-allowlisted provider/model/voice/profile IDs and hashes, support-evidence reference, delivery preset; `cloning: NONE`. |
| `audio` | Proposed normalized target `WAV_PCM16`, mono, 24 kHz or 48 kHz. Native support must be verified per provider; no implicit conversion is installed. |
| `cost` | Null while unavailable, otherwise a server-verified USD quote/policy/expiry, integer estimated micro-USD and a positive hard cap. The parser's numeric ceiling is not an approved budget. |
| `spending` | Future exact-recipe decision/confirmation references, scope hash and expiry, or null. Neither reference nor an HTTP header is authentication. |

The parser rejects unknown fields, getters, invalid Unicode, bad hashes, cross-format rate assumptions, invalid ordering, zero/excess chunk counts, estimates above caps, raw text/SSML, arbitrary prompts, URLs/paths and cloning claims. Opaque provider/model/voice IDs are bounded registry keys. MEASURED/REFLECTIVE/TENSE are proposed delivery intents, not claims that a particular provider implements them.

Canonical UTF-8 hashing uses the existing domain-separated serializer without normalization. Proposal identity changes when the draft/approval/source/candidate, chunk text/order, provider/model/voice/style/profile, output format, quote or spending reference changes. Future durable recipe identity should bind content/profile/approval dependencies separately from short-lived quote/confirmation admission identity, following M2's established separation; do not make a new task solely because a quote timestamp refreshed.

Example construction from a trusted restricted M4 read (currently blocked):

```ts
const parsed = parseVoiceRequestProposal(serverBuiltProposal);
const eligibility = assessNarrationVoiceHandoff(
  parsed.proposal,
  { payload: storedNarration.payload, draftHash: storedNarration.draftHash },
  { id: storedNarration.id, draftHash: storedNarration.draftHash },
);
// executable === false; eligibleForProviderSubmission === false
```

Clients must never construct trusted narration, approval, source-currentness, cost or spending capability objects. No serializer result is a send permit.

## Provider-neutral adapter and capability verification

`FutureVoiceAdapter` is a TypeScript interface only. There is no implementation, permit issuer, SDK import or provider request. A unique-symbol permit type is not runtime authentication; the future send service must enforce process-owned, single-use capabilities with exact checkpoint/owner/generation and acknowledged commit, as M2 does.

The registry currently has **zero verified entries**. Future candidates include Google Gemini TTS, ElevenLabs and Microsoft Azure Neural TTS, without claiming verified Burmese support for any model/voice. Before adding each entry:

1. Verify official language/model/voice/region and format documentation for the exact version.
2. Separately authorize a bounded support evaluation and Myanmar native-language listening review; record Unicode pronunciation, names, numbers, punctuation and cautious psychological wording.
3. Pin allowed model/voice/style, text/byte limits, rate/channel/native format, license/consent conditions and support-evidence hash/date.
4. Establish a quote/cost policy and supported idempotency/status-query behavior. Do not assume exactly-once provider billing.
5. Reject unsupported styles/locales/formats; never silently substitute another model or voice.

Provider-specific parameters stay behind allowlisted adapters. No arbitrary provider option map, URL, SSML or shell arguments reaches an execution boundary. Providers returning only files/URLs require a separately reviewed bounded download/SSRF policy; client/provider paths must never become storage keys.

## Human approval and currentness gates

Before real TTS, implement and resolve a current immutable M4 approval that binds:

- Exact durable narration version/hash, all essential factual and psychological claims, source/context and M3 lineage.
- Current Chinese source-comparison receipts, strict character/relationship ownership and non-waivable invalid-reference checks.
- Myanmar narrative/language disposition and explicit authenticated human approval.
- No synthetic ancestry, pending blocking claims, revoked/superseded/stale receipts or provisional status.

AI reviewer acceptance, subtitle APPROVED, MANUAL translation origin, no QC findings or an operator label cannot satisfy these gates. Source verification alone does not approve narration or authorize voice spending. M1 currently reports voice eligibility false pending approved script/voice authorization, and all current M4 drafts remain provisional.

Recheck Project → Movie → Studio → task/source/candidate/narration/approval dependencies in a reviewed lock order at admission, before send and before audio publication. Changes to Chinese text/alignment, Myanmar context/review/QC, media checksum, script/Studio revision, narration text or approval/verification invalidate currentness while retaining immutable history. Point-in-time M4 read status is not a future send/publication lease.

## Durable paid execution and recovery plan

Reuse M2's architecture and restricted-role discipline, not its current text-only fake response as an audio transport. Audio task kind/profile/result schema and binary storage need separately authorized additive design/disposable validation before live installation.

```text
Proposal → blocked or server-verified eligible request
→ explicit human cost/spending confirmation
→ durable admission + bounded outbox
→ scoped lease + dependency revalidation
→ immutable submission checkpoint COMMIT ACK
→ process-owned one-use send permit
→ definitive audio/failure OR UNKNOWN
→ independent audio validation + atomic private publication
```

- Spending scope includes exact operator/resource/draft/hash/voice/profile/chunk recipe, quote and expiration. Budget reservations must atomically cap each request, whole script and operator/global allowance; concurrent chunks cannot each spend the full script cap. UNKNOWN keeps the relevant unresolved budget/slot reserved.
- Refresh, GET, polling and navigation stay read-only. No key, missing authority, unavailable approval/support/quote or disabled deployment fails closed before paid admission.
- Dispatch/pre-send retries are bounded only when non-submission is proven. Use the original generation/grant and preserve expiration; never refresh authority as recovery.
- After checkpoint, lost acknowledgement, crash, timeout, ambiguous response or unknown commit prohibits speculative send/resend. UNKNOWN requires separately controlled auditable investigation/resolution; no automatic paid replay.
- A definitive failure may still be billable. Another paid attempt needs explicit policy and fresh human authorization; a definitive result is persisted idempotently, not regenerated for download/publication retry.
- Cancellation before send denies transport; cancellation after submission cannot claim the provider stopped or cost vanished. Late original results require exact owner/generation and reviewed lease semantics. Do not infer a new send permit from a stored checkpoint.

## Audio integrity, chunks and voice-first timing

Future immutable audio artifacts bind request/checkpoint/submission, exact narration/approval/context, section/chunk order and text hash, provider/model/voice/profile, native and published SHA-256, byte count, actual format and measured duration. `VoiceAudioArtifact` proposes this allowlisted metadata with `originalMovieAudio: EXCLUDED` and `clonedVoice: false`; no artifact exists today.

- Validate audio bytes independently: bounded nonempty media, actual codec/container/rate/channels, successful decode/probe, finite positive measured duration and content checksum. Publish atomically in existing private storage only after verification; secure downloads must verify disk existence and ownership. Return artifact IDs, never private paths.
- Preserve native bytes/hash. Any future explicitly approved normalization must record native/derived checksums and processing profile; no hidden conversion is authorized now.
- Chunk only through a versioned immutable plan constrained by confirmed provider limits. Prefer whole paragraphs/sections and valid Myanmar grapheme boundaries. Validate ordered concatenation against exact approved section text (including defined separators), with no omission, repetition, automatic rewrite or truncation. Bind per-chunk hashes to the draft and plan; reject unsupported split boundaries.
- Ordered chunk index/count plus section ID/order determine assembly; arrival order is irrelevant. Verify complete, unique coverage before measuring/assembling the voice track. Missing/UNKNOWN chunks block final publication.
- Script budget or calibrated voice estimate is planning metadata only. Actual measured audio supersedes estimates for the voice-first highlights timeline. Current M4 estimates are null. Do not infer Myanmar speech time from English word counts, repeat footage, add filler, speed audio or truncate narration to meet a target.
- Source movie audio is never mixed into the recap voice track. Voice cloning requires a separate consent/ownership, retention and revocation design with explicit authorization; `NONE` is the only current option.

## M5-01 implementation order and acceptance

1. Pure capability/chunk/quote contracts and fake-only adapters; default registry empty and real transport absent. Test exact draft/approval/text hashes, unsupported Burmese voice/format/style, forged approvals, grapheme boundaries and stable recipe identities.
2. Trusted read-only context composition over genuine persisted approved narration **only after the missing approval foundation exists**; reject synthetic/provisional/stale/revoked/cross-scope inputs.
3. Disposable-only audio task/outbox/checkpoint/result/storage drafts and restricted service tests; acknowledged commit, one-use send, UNKNOWN/cancellation, concurrent budget reservations and rollback. No live migration by inference.
4. Synthetic bounded audio fixture validation and private publication/download tests; measured duration, format, integrity, chunk ordering and currentness. No real TTS or original movie audio.
5. Separately approved deployment/authentication/provider-support/budget gate and at most explicitly authorized bounded real evaluation. Real activation remains blocked until all prerequisites are proven.

Acceptance requires no provider traffic from tests or GET, no provisional/synthetic real eligibility, no UNKNOWN resend, no currentness/ownership bypass, no fabricated duration/cost/support and no automatic approval. M4-05 does not start these phases.
