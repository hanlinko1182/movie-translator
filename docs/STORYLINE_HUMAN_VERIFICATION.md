# Human source verification — Phase 23.2 M1-C

## Implementation boundary

`lib/storyline/human-verification.ts` supplies an IO-free, server-only reference foundation. It has no installed instance, API, Server Action, browser consumer, database adapter, migration, worker, provider or media operation. Only synthetic tests instantiate it. No real operator decisions or receipts are created by this milestone.

Each explicitly scoped instance owns a bounded ephemeral ledger. This is **not real receipt persistence**, an authenticated service or a replacement for source preparation. Restart/reconstruction loses all entries and authorization capabilities; JSON history cannot be imported to regain trust. The existing Recap page, Studio shell/navigation, M1-B preparation and DTO remain unchanged and still report no persisted Studio data.

## Trust and issuance flow

1. Trusted server bootstrap supplies exact database project/movie identity, a server clock and an operator-authority adapter, or `null`. No adapter means issuance/revocation is unavailable. Never construct these dependencies from client/provider parameters.
2. Trusted code supplies an already server-owned immutable source and script. Validation rechecks ownership, hashes, alignment, confidence, character/relationship evidence, inference basis and cautious qualification. It does not query current database/media state. The currentness label is explicitly `PROVIDED_IMMUTABLE_CONTEXT_ONLY` / `NOT_CHECKED` for live dependencies.
3. `propose` accepts only project/movie/claim identity and expected claim/context/script hashes. Its versioned, frozen proposal binds exact content and context, cited/allowed Chinese anchor hashes, exact Chinese segment content hash, translation row-context references/hash, inference basis content hashes, qualification, script hash, verification/rubric policy and ledger head. No text normalization or invented anchors occur.
4. A human explicitly compares original Chinese evidence, narration/claim, referenced translation and observed inference basis. `authorize` requires the exact proposal/comparison hashes, Chinese-comparison acknowledgement, every rubric disposition, an explicit outcome and bounded rationale. Operator identity/audit label comes solely from the authority adapter, review time solely from the injected server clock.
5. The adapter receives an opaque server session plus action (`VERIFY_SOURCE` / `REVOKE_VERIFICATION`). It must resolve authority independently of request labels. Its exceptions become static safe contract errors; sessions are never stored/logged. `TRUSTED_LOCAL_OPERATOR` explicitly records unauthenticated local operation. An audit label **is not authentication**. `AUTHENTICATED_OPERATOR` describes a future genuine authenticated adapter; this milestone supplies none.
6. Authorization returns a nonserializable-in-practice, instance-owned object capability. Runtime trust uses private WeakMaps: a cloned/forged proposal, token, external receipt or another instance's token cannot issue anything. No lookup callback or supplied receipt can influence this foundation's derived status. A token is single use, expires after five minutes, and fences the ledger head/context/script. Any intervening ledger append requires a fresh proposal/decision. This conservative synchronous reference fence does not claim cross-process concurrency protection.
7. `issue` revalidates the provided immutable context and appends a deeply frozen receipt. It binds original comparison/audit data and current observed-basis receipt hashes. It never accepts a desired trusted status field from providers or subtitles. Receipt identity and chained entry hash use canonical UTF-8 serialization. Identical fixture inputs/clock/decision/ledger produce identical identities.

`verification.ts` remains the M1-A structural parser/low-level eligibility contract. Its explicitly trusted callback is not a public trust boundary and must never echo request/provider receipts. M1-C does not expose that callback or use client-supplied references. Existing callers/tests and receipt schema remain compatible; the new human receipt wrapper has its own `story-human-verification-v1` identity. Persistence must not promote a structurally valid M1-A `SUPPORTED` object into a trusted M1-C decision.

## Explicit Chinese-source comparison rubric

| Check | Required comparison |
| --- | --- |
| Identity/attribution | Correct speaker, character and relationship identity; preserve uncertainty. Transcript without diarization cannot establish unknown speaker identity. |
| Chinese meaning | Original exact Chinese meaning versus the claim and its associated Myanmar narration. |
| Translation consistency | Referenced current Myanmar interpretation versus Chinese; include approval, MANUAL origin and active/resolved/unscanned QC context. Approval/provenance are not semantic proof. |
| Observed versus inferred | Observable behavior versus a supported, cautiously qualified interpretation. Cautious wording alone cannot justify psychology; no access to private thoughts is claimed. |
| Anchor relevance | The cited segment supports the particular clause, rather than merely sharing a scene. |
| Ownership | Exact permitted character anchors and relationship endpoints/anchors. Human disposition cannot expand them. |
| Chronology/causality | Correct ordering and supported causal qualification; adjacency is not causation. |
| Sufficiency | Explicitly recognize unknown, insufficient or contradictory evidence. |

All applicable checks must be `SUPPORTED` for `SOURCE_VERIFIED`. `NOT_APPLICABLE` is allowed only for translation consistency when the claim has no translation references, and is required in that case. `INCONCLUSIVE` requires an `INSUFFICIENT` finding with no contradiction; `UNSUPPORTED` requires a `CONTRADICTED` finding. No omission or contradictory check can be relabeled verified. These semantic judgements are human attestations, not automatic truth detection or a certificate of transcript accuracy. Invalid references, ownership, bounds, confidence or unsupported/cyclic structural inference fail before issuance and cannot be waived even for an unsupported/inconclusive receipt.

## Append-only lifecycle and currentness

- Explicit outcomes: `SOURCE_VERIFIED`, `INCONCLUSIVE`, `UNSUPPORTED`. Derived current states also include `PENDING`, `STALE`, `REVOKED`, `SUPERSEDED`.
- Every entry includes exact source/claim/context bindings, verification policy, audit label/authority kind, reviewed/issued times, previous same-claim entry ID and global ledger hash. Entries are never edited/deleted. Ceiling: 2,048 entries and 32 KiB canonical JSON per entry. Bounded fields/serialization reuse M1-A limits; limit failures append nothing.
- A later comparison for the same claim explicitly supersedes the previous entry. `lookup` can inspect historical entries but reports `SUPERSEDED`; no caller can select an old success to authorize the current claim.
- Revocation requires a separate authorized operation and append. It targets the current receipt, preserves its historical dependency bindings and records a reason/operator/timestamp. Stale evidence can still be revoked. Current review becomes `REVOKED`; a later explicit comparison may supersede that revocation. No implicit revival occurs.
- Changed Chinese/media/evidence, translation text/approval/provenance/QC/alignment, claim/narration, snapshot/context/script identity or policy makes old bindings ineligible. Invalid contracts are rejected; valid new contracts derive `STALE`. Snapshot/script invalidation is deliberately conservative. Historical artifacts remain immutable.
- A verified inference additionally binds exact currently verified observed-basis **receipt hashes**. Revocation, supersession or changed support of a basis makes the inference `STALE`, even if its statement is unchanged. A new basis receipt cannot silently revive an old inference.
- Lookup/evaluation is IO-free and appends nothing. It proves eligibility relative to the server-provided immutable context, not freshness against mutable live records. A future scoped storage adapter must authoritatively acquire/revalidate the current dependencies; supplying an old context again cannot establish live currentness.

## Eligibility, separate from product authorization

- **Draft continuation:** structurally valid material may continue as a provisional draft, including ALL_CURRENT unapproved or missing Myanmar context. An explicit unsupported finding still blocks the affected claim's downstream use; continuing draft editing does not approve it or call a provider.
- **Supported-event counting:** all event claims and causal predecessors must be currently source verified. Missing/inconclusive/unsupported/stale/revoked claims contribute zero supported events. Event membership/timing is independently validated. This produces eligible identities, not a numeric duration budget.
- **Script approval:** every material claim must be source eligible, including independently reviewed inference. The evaluator returns source eligibility only, `approved: false`; narrative/Myanmar review and explicit human script approval remain separate gates.
- **Voice:** source eligibility is exposed, but actual `eligible: false` remains until current approved script and separately authorized voice capabilities exist. Source verification never authorizes TTS expenditure.
- Subtitle approval, source/target text, QC, TM, script/narration and legacy recap are never modified. Subtitle approval does not issue verification; Studio verification does not approve subtitles.

## Prerequisites for real persistence

Separately authorize an additive schema and immutable snapshot/script persistence; an append-only receipt/revocation table with same-project/movie scope, policy versions and hash constraints; authoritative latest-head lookup and transactional compare-and-swap fencing; authenticated operator authority or explicitly approved trusted-local operator provisioning; server clock/session/CSRF controls for any future mutation endpoint; source/context revalidation at issuance and downstream approval; retention/audit permissions; explicit language/semantic-review and script/voice approval contracts. Do not deserialize the ephemeral ledger or import arbitrary receipt JSON as a shortcut. UI-02 safe DTO transport and browser comparison workflow require their own authorization.
