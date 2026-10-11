# Recap response validation diagnostics

The public API code/message remain `RECAP_INVALID_RESPONSE` / “Recap provider
returned unsupported or ungrounded output”. Invalid results remain terminal;
this change does not repair output, retry jobs, or change evidence acceptance.

## Internal diagnostic contract

`RecapResponseValidationError` carries a sanitized diagnostic through provider,
JSON parsing, output validation, generation, synthesis and persistence. Fields:

- `stage` and `rule`: application-owned enums.
- `fieldPath`: application-owned field names and numeric array indexes only.
- `expectedLimit`, `actualLength`, `actualCount`: nonnegative safe integers when
  applicable. Text limits retain the existing JavaScript string-length semantics.
- `finishReason`: a small allowlist; other values become `unknown`.

The recap worker adds the validated job correlation ID and writes one structured
`recap_response_validation_failed` event to stderr and the failing job's BullMQ
log before throwing the existing `UnrecoverableError(RECAP_INVALID_RESPONSE)`.
Its retained stack is reduced to the safe error code, without private code paths.
BullMQ logs follow existing job retention. If that log write fails, stderr still
contains the diagnostic; a separate safe event reports persistence failure.
No database columns, Redis job payload fields, queue retry policy or API response
fields are added. Previously failed jobs cannot acquire missing diagnostics
retroactively.

Diagnostics never retain raw responses, transcript/recap text, provider-controlled
property names, SDK error messages/causes, credentials, URLs or filesystem paths.
For example, an unknown property reports the parent field and key count, not
the unknown property's name. SDK response errors report `SDK_RESPONSE_INVALID`
without retaining their raw body or validation message.

## Schema alignment

`lib/recap/response-schema.ts` shares existing limits with local validation:
string `minLength`/`maxLength`, array `minItems`/`maxItems`, strict required fields,
confidence enums and nonnegative sequence integers. Strict output mode and
`requireParameters` remain enabled. No schema downgrade or retry fallback exists.

Local checks remain authoritative for whitespace-only text, total serialized
size, chronological section ordering, reference existence, candidate-specific
evidence, relationship endpoints and uncertainty/confidence restrictions. JSON
Schema string length does not replace the existing local string-length check.

Endpoint support varies; no paid compatibility request was made for this change.
References: [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs),
[OpenAI supported structured-output schema constraints](https://developers.openai.com/api/docs/guides/structured-outputs).

## Offline verification and controlled rollout

Run the synthetic fixture suite (no PostgreSQL, Redis or provider requests):

```sh
node --conditions=react-server --import tsx --test tests/recap/response-diagnostics.test.ts
```

Fixtures include one scene, 12 transcript segments and one character whose only
anchor is segment 0. Fake transports/providers exercise incomplete output,
malformed JSON, limits, reference restrictions and the actual worker processor.
Network fetch is blocked by the test harness.

Deploy/restart the recap worker through the normal operator workflow to load
this code. No worker is restarted by the fix. Only after separate explicit
authorization should an operator run a controlled real generation and inspect
its safe diagnostic if rejected. Existing retained failed jobs still follow the
current failed-job submission policy; no retry/reset endpoint is added here.
