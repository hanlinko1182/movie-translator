import assert from "node:assert/strict";
import { after, before, mock, test } from "node:test";
import { UnrecoverableError } from "bullmq";
import { ResponseValidationError } from "@openrouter/sdk/models/errors";
import { RecapError, type RecapOutput, type RecapInput } from "@/lib/recap/types";
import { RecapResponseValidationError, recapValidationLog, safeRecapDiagnostic, type RecapValidationDiagnostic } from "@/lib/recap/diagnostics";
import { RECAP_LIMITS, recapResponseSchema } from "@/lib/recap/response-schema";
import { parseRecapOutput, validateRecapOutput } from "@/lib/recap/validate-output";
import { OpenRouterRecapProvider, type RecapChatClient } from "@/lib/recap/openrouter-provider";
import { generateRecapFromSource, synthesisGroups } from "@/lib/recap/generate-recap";
import { persistRecap, validatePersistedRecap } from "@/lib/recap/persist-recap";
import { recapInput } from "@/lib/recap/context";
import { recapSceneWindows, type RecapSource } from "@/lib/recap/source";
import { recapApiError } from "@/lib/recap/api-errors";
import { processRecapJob } from "@/workers/recap-worker";

// No database, Redis, environment credentials, network, or production records.
before(() => { mock.method(globalThis, "fetch", () => { assert.fail("Network calls are forbidden in recap fixture tests"); }); });
after(() => { mock.restoreAll(); });
const secret = "sk-SYNTHETIC_SECRET";
function fixture() {
  const source: RecapSource = {
    movieId: "fixture-movie", projectId: "fixture-project", transcriptId: "fixture-transcript", sourceHash: "a".repeat(64),
    characterContext: "CURRENT", characterAnalysisRunId: "fixture-analysis",
    scenes: [{ id: "fixture-scene", sequence: 0, startMs: 0, endMs: 259200 }],
    segments: Array.from({ length: 12 }, (_, sequence) => ({ id: `fixture-segment-${sequence}`, sequence, startMs: sequence * 21000, endMs: (sequence + 1) * 21000, text: `合成字幕 ${sequence}` })),
    characters: [{ ref: "fixture-character", name: "合成人物", uncertain: false, aliases: [], evidence: [{ sceneSequence: 0, segmentSequence: 0, evidence: "合成证据", inference: "合成推断", confidence: "LOW" }] }],
    relationships: [],
  };
  const output: RecapOutput = {
    title: "အကျဉ်းချုပ်", summary: "စမ်းသပ်ရန် ဖန်တီးထားသော အကျဉ်းချုပ်။",
    sections: [{ sequence: 0, sceneStartSequence: 0, sceneEndSequence: 0, heading: "အစပိုင်း", summary: "စမ်းသပ် အကြောင်းအရာ။", confidence: "LOW", evidence: [{ sceneSequence: 0, segmentSequences: [0, 1], note: "စမ်းသပ် အထောက်အထား။" }] }],
    characterInsights: [{ characterRef: "fixture-character", observation: "စမ်းသပ် သုံးသပ်ချက်။", confidence: "LOW", evidence: [{ sceneSequence: 0, segmentSequences: [0], note: "စမ်းသပ် အထောက်အထား။" }] }],
    relationshipInsights: [],
  };
  const input = recapInput(source, recapSceneWindows(source)[0]);
  return { source, output, input };
}
function check(error: unknown, expected: Partial<RecapValidationDiagnostic>): boolean {
  assert.ok(error instanceof RecapResponseValidationError);
  assert.ok(error instanceof RecapError);
  assert.equal(error.code, "RECAP_INVALID_RESPONSE");
  assert.equal(error.status, 502);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(error.diagnostic[key as keyof RecapValidationDiagnostic], value);
  assert.ok(!JSON.stringify(error).includes(secret));
  return true;
}
function envelope(output: RecapOutput, finishReason: unknown = "stop") {
  return { choices: [{ finishReason, message: { content: JSON.stringify(output) } }], usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46, cost: 0.001 } };
}
function provider(response: unknown, requests: Parameters<RecapChatClient["chat"]["send"]>[0][] = []) {
  return new OpenRouterRecapProvider("fixture-model", "unused", "https://unused.invalid", { chat: { send: async (request) => { requests.push(request); return response; } } });
}

test("one scene, 12 segments and one character anchor pass parsing, generation and persistence validation", async () => {
  const { source, input, output } = fixture();
  assert.equal(input.scenes.length, 1); assert.equal(input.scenes[0].segments.length, 12);
  assert.deepEqual(input.characters[0].evidence.map(e => e.segmentSequence), [0]);
  assert.deepEqual(parseRecapOutput(JSON.stringify(output), input), output);
  const requests: Parameters<RecapChatClient["chat"]["send"]>[0][] = [];
  const result = await generateRecapFromSource(source, provider(envelope(output), requests));
  assert.equal(requests.length, 1); assert.equal(result.modelCalls, 1); assert.equal(result.strategy, "SINGLE_STAGE");
  assert.deepEqual(validatePersistedRecap(result, source), output);
  assert.equal(requests[0].chatRequest.stream, false);
  assert.deepEqual(requests[0].chatRequest.responseFormat, { type: "json_schema", jsonSchema: { name: "character_driven_recap", strict: true, schema: recapResponseSchema } });
});

test("plot evidence can cite segment 1; character evidence is restricted to its supplied segment 0 anchor", () => {
  const { input, output } = fixture();
  assert.doesNotThrow(() => validateRecapOutput(output, input));
  output.characterInsights[0].evidence[0].segmentSequences = [1];
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "CHARACTER_EVIDENCE_NOT_ALLOWED", fieldPath: "output.characterInsights[0].evidence[0].segmentSequences" }));
});

test("unknown scene and segment references produce distinct rule codes and static paths", () => {
  const { input, output } = fixture();
  output.sections[0].evidence[0].sceneSequence = 1;
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "INVALID_SCENE_REFERENCE", fieldPath: "output.sections[0].evidence[0].sceneSequence" }));
  output.sections[0].evidence[0].sceneSequence = 0;
  output.sections[0].evidence[0].segmentSequences = [12];
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "INVALID_SEGMENT_REFERENCE", fieldPath: "output.sections[0].evidence[0].segmentSequences[0]" }));
  output.sections[0].sceneEndSequence = 1;
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "INVALID_SCENE_REFERENCE", fieldPath: "output.sections[0].sceneEndSequence" }));
});

test("missing required fields and unknown fields never log provider-controlled property names", () => {
  const { input, output } = fixture();
  const missing: Record<string, unknown> = { ...output }; delete missing.summary;
  assert.throws(() => validateRecapOutput(missing, input), e => check(e, { rule: "MISSING_FIELD", fieldPath: "output.summary" }));
  assert.throws(() => validateRecapOutput({ ...output, [secret]: "/private/provider/path" }, input), e => check(e, { rule: "UNKNOWN_FIELDS", fieldPath: "output", expectedLimit: 5, actualCount: 6 }));
  const section = output.sections[0] as unknown as Record<string, unknown>; delete section.evidence;
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "MISSING_FIELD", fieldPath: "output.sections[0].evidence" }));
});

test("malformed JSON reports syntax stage and length without retaining the parser message or content", () => {
  const { input } = fixture();
  const content = `{"title":"${secret}"`;
  assert.throws(() => parseRecapOutput(content, input), e => check(e, { stage: "JSON_PARSE", rule: "INVALID_JSON", actualLength: content.length }));
});

test("incomplete provider output is rejected before parsing; unknown finish reasons are sanitized", async () => {
  const { input, output } = fixture();
  for (const [raw, safe] of [["length", "length"], [null, "missing"], [secret, "unknown"]]) {
    await assert.rejects(provider(envelope(output, raw)).generate(input), e => check(e, { stage: "PROVIDER_RESPONSE", rule: "INCOMPLETE_OUTPUT", finishReason: safe as RecapValidationDiagnostic["finishReason"] }));
  }
});

test("provider preserves JSON/output diagnostic stage and safe stop reason", async () => {
  const { input, output } = fixture();
  const malformed = envelope(output); malformed.choices[0].message.content = secret;
  await assert.rejects(provider(malformed).generate(input), e => check(e, { stage: "JSON_PARSE", rule: "INVALID_JSON", finishReason: "stop" }));
  output.characterInsights[0].evidence[0].segmentSequences = [1];
  await assert.rejects(provider(envelope(output)).generate(input), e => check(e, { stage: "OUTPUT_VALIDATION", rule: "CHARACTER_EVIDENCE_NOT_ALLOWED", finishReason: "stop" }));
});

test("provider envelope, refusal, content and usage failures do not retain raw values", async () => {
  const { input } = fixture();
  const cases: [unknown, RecapValidationDiagnostic["rule"]][] = [
    [{}, "MISSING_CHOICES"], [{ choices: [] }, "CHOICE_COUNT"],
    [{ choices: [{ finishReason: "stop", message: { refusal: secret } }] }, "PROVIDER_REFUSAL"],
    [{ choices: [{ finishReason: "stop", message: { content: { text: secret } } }] }, "INVALID_CONTENT"],
    [{ choices: [{ finishReason: "stop", message: { content: secret } }], usage: { promptTokens: secret } }, "INVALID_USAGE"],
  ];
  for (const [response, rule] of cases) await assert.rejects(provider(response).generate(input), e => check(e, { stage: "PROVIDER_RESPONSE", rule }));
});

test("SDK response-validation errors lose raw bodies/messages/causes and retain only a safe rule", async () => {
  const { input } = fixture();
  const sdkError = new ResponseValidationError(secret, { response: new Response(secret), request: new Request("https://unused.invalid", { headers: { Authorization: secret } }), body: secret, cause: new Error(secret), rawValue: { text: secret }, rawMessage: secret });
  const fake = new OpenRouterRecapProvider("fixture", "unused", "https://unused.invalid", { chat: { send: async () => { throw sdkError; } } });
  await assert.rejects(fake.generate(input), e => check(e, { stage: "PROVIDER_RESPONSE", rule: "SDK_RESPONSE_INVALID", fieldPath: "response" }));
});

const textCases: [string, number, (output: RecapOutput, value: string) => void][] = [
  ["output.title", RECAP_LIMITS.title, (o, v) => { o.title = v; }],
  ["output.summary", RECAP_LIMITS.summary, (o, v) => { o.summary = v; }],
  ["output.sections[0].heading", RECAP_LIMITS.heading, (o, v) => { o.sections[0].heading = v; }],
  ["output.sections[0].summary", RECAP_LIMITS.sectionSummary, (o, v) => { o.sections[0].summary = v; }],
  ["output.sections[0].evidence[0].note", RECAP_LIMITS.evidenceNote, (o, v) => { o.sections[0].evidence[0].note = v; }],
  ["output.characterInsights[0].observation", RECAP_LIMITS.observation, (o, v) => { o.characterInsights[0].observation = v; }],
];
for (const [path, limit, set] of textCases) test(`${path}: Myanmar text at limit passes; limit + 1 fails without repair`, () => {
  const { input, output } = fixture();
  set(output, "က".repeat(limit)); assert.doesNotThrow(() => validateRecapOutput(output, input));
  set(output, "က".repeat(limit + 1));
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "TEXT_TOO_LONG", fieldPath: path, expectedLimit: limit, actualLength: limit + 1 }));
});

test("required counts, upper counts, duplicates, sequencing and uncertainty remain strict", () => {
  const run = (mutate: (o: RecapOutput, i: RecapInput) => void, expected: Partial<RecapValidationDiagnostic>) => {
    const { input, output } = fixture(); mutate(output, input);
    assert.throws(() => validateRecapOutput(output, input), e => check(e, expected));
  };
  run(o => { o.sections = []; }, { rule: "TOO_FEW_ITEMS", expectedLimit: 1, actualCount: 0 });
  run(o => { o.sections = Array(9).fill(o.sections[0]); }, { rule: "TOO_MANY_ITEMS", expectedLimit: 8, actualCount: 9 });
  run(o => { o.sections[0].evidence[0].segmentSequences = Array.from({ length: 9 }, (_, i) => i); }, { rule: "TOO_MANY_ITEMS", expectedLimit: 8, actualCount: 9 });
  run(o => { o.sections[0].evidence = Array(5).fill(o.sections[0].evidence[0]); }, { rule: "TOO_MANY_ITEMS", expectedLimit: 4, actualCount: 5 });
  run(o => { o.sections[0].sequence = 1; }, { rule: "INVALID_SEQUENCE" });
  run(o => { o.sections[0].evidence[0].segmentSequences = [0, 0]; }, { rule: "DUPLICATE_SEGMENT_REFERENCE" });
  run(o => { o.sections[0].evidence.push(structuredClone(o.sections[0].evidence[0])); }, { rule: "DUPLICATE_EVIDENCE" });
  run((o, i) => { i.characters[0].uncertain = true; o.characterInsights[0].confidence = "HIGH"; }, { rule: "UNCERTAIN_CONFIDENCE" });
});

test("generation and persistence annotate their own validation failures; invalid persistence never starts a transaction", async () => {
  const { source, output } = fixture();
  output.characterInsights[0].evidence[0].segmentSequences = [1];
  const fake = { generate: async () => ({ output, provider: "fixture", model: "fixture", runtimeMs: 1 }) };
  await assert.rejects(generateRecapFromSource(source, fake), e => check(e, { stage: "GENERATION", rule: "CHARACTER_EVIDENCE_NOT_ALLOWED" }));
  let transactions = 0;
  const database = { $transaction: async () => { transactions++; assert.fail("Invalid output must not reach DB"); } } as unknown as Parameters<typeof persistRecap>[2];
  await assert.rejects(persistRecap({ ...await fake.generate(), modelCalls: 1, strategy: "SINGLE_STAGE" }, source, database), e => check(e, { stage: "PERSISTENCE", rule: "CHARACTER_EVIDENCE_NOT_ALLOWED" }));
  assert.equal(transactions, 0);
  const good = fixture();
  await assert.rejects(generateRecapFromSource(good.source, { generate: async () => ({ output: good.output, provider: "fixture", model: "fixture", runtimeMs: -1 }) }), e => check(e, { stage: "GENERATION", rule: "INVALID_RESULT_METADATA", fieldPath: "result.runtimeMs" }));
  assert.throws(() => synthesisGroups([{ ...good.output, summary: "က".repeat(10001) }]), e => check(e, { stage: "SYNTHESIS", rule: "OUTPUT_TOO_LONG" }));
});

test("relationship evidence restrictions and UNKNOWN confidence remain strict", () => {
  const { input, output } = fixture();
  input.characters.push({ ...structuredClone(input.characters[0]), ref: "fixture-character-b" });
  input.relationships.push({ ref: "fixture-relationship", characterARef: "fixture-character", characterBRef: "fixture-character-b", type: "UNKNOWN", summary: "Synthetic relationship", confidence: "LOW", evidence: structuredClone(input.characters[0].evidence) });
  output.relationshipInsights.push({ relationshipRef: "fixture-relationship", characterARef: "fixture-character", characterBRef: "fixture-character-b", observation: "စမ်းသပ် သုံးသပ်ချက်။", confidence: "LOW", evidence: [{ sceneSequence: 0, segmentSequences: [0], note: "စမ်းသပ် အထောက်အထား။" }] });
  assert.doesNotThrow(() => validateRecapOutput(output, input));
  output.relationshipInsights[0].evidence[0].segmentSequences = [1];
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "RELATIONSHIP_EVIDENCE_NOT_ALLOWED" }));
  output.relationshipInsights[0].evidence[0].segmentSequences = [0];
  output.relationshipInsights[0].confidence = "HIGH";
  assert.throws(() => validateRecapOutput(output, input), e => check(e, { rule: "RELATIONSHIP_CONFIDENCE" }));
});

test("worker retains persistence diagnostics without changing the retry contract for other failures", async (t) => {
  const { source, output } = fixture();
  const entries: string[] = [];
  t.mock.method(console, "error", () => {});
  const job = { name: "generate-recap" as const, id: `recap-${source.movieId}-${source.sourceHash}`, data: { movieId: source.movieId, sourceHash: source.sourceHash }, log: async (value: string) => { entries.push(value); return entries.length; } };
  const result = { output, model: "fixture", provider: "fixture", runtimeMs: 1, modelCalls: 0, strategy: "SINGLE_STAGE" as const };
  const deps: Parameters<typeof processRecapJob>[1] = {
    recover: async () => null, model: () => "fixture", generate: async () => ({ source, result }),
    persist: async () => { validatePersistedRecap(result, source); assert.fail("Invalid metadata must not persist"); },
  };
  await assert.rejects(processRecapJob(job, deps), e => e instanceof UnrecoverableError && e.message === "RECAP_INVALID_RESPONSE");
  assert.equal(JSON.parse(entries[0]).stage, "PERSISTENCE");
  assert.equal(JSON.parse(entries[0]).fieldPath, "result.modelCalls");
  deps.generate = async () => { throw new RecapError("RECAP_PROVIDER_ERROR"); };
  await assert.rejects(processRecapJob(job, deps), e => e instanceof Error && !(e instanceof UnrecoverableError) && e.message === "RECAP_PROVIDER_ERROR");
  assert.equal(entries.length, 1);
});

test("worker preserves safe provider diagnostics in structured/BullMQ logs and keeps terminal public error", async (t) => {
  const { source, output } = fixture(); output.characterInsights[0].evidence[0].segmentSequences = [1];
  const entries: string[] = []; const consoleEntries: string[] = [];
  t.mock.method(console, "error", (value: string) => { consoleEntries.push(value); });
  const job = { name: "generate-recap" as const, id: `recap-${source.movieId}-${source.sourceHash}`, data: { movieId: source.movieId, sourceHash: source.sourceHash }, log: async (message: string) => { entries.push(message); return entries.length; } };
  let persists = 0; let calls = 0;
  const deps: Parameters<typeof processRecapJob>[1] = {
    recover: async () => null, model: () => "fixture",
    generate: async () => { calls++; return { source, result: await generateRecapFromSource(source, provider(envelope(output))) }; },
    persist: async () => { persists++; assert.fail("Invalid response must not persist"); },
  };
  await assert.rejects(processRecapJob(job, deps), error => {
    assert.ok(error instanceof UnrecoverableError); assert.equal(error.message, "RECAP_INVALID_RESPONSE");
    assert.equal(error.stack, "UnrecoverableError: RECAP_INVALID_RESPONSE");
    assert.deepEqual((error as UnrecoverableError & { diagnostic: unknown }).diagnostic, JSON.parse(entries[0])); return true;
  });
  assert.equal(calls, 1); assert.equal(persists, 0); assert.equal(entries.length, 1);
  const entry = JSON.parse(entries[0]);
  assert.equal(entry.jobId, job.id); assert.equal(entry.rule, "CHARACTER_EVIDENCE_NOT_ALLOWED"); assert.equal(entry.finishReason, "stop");
  assert.deepEqual(consoleEntries, entries);
  for (const value of [output.title, output.summary, source.segments[0].text, secret, "/private"]) assert.ok(!entries[0].includes(value));
  // A Redis log failure must not turn invalid output into a retryable failure.
  job.log = async () => { throw new Error(secret); };
  await assert.rejects(processRecapJob(job, deps), error => error instanceof UnrecoverableError && error.message === "RECAP_INVALID_RESPONSE");
  assert.ok(!consoleEntries.join().includes(secret));
});

test("diagnostic allowlist rejects hostile extra fields, paths, rule/stage names and finish reasons", () => {
  const hostile = { stage: secret, rule: secret, fieldPath: "output.privatePath", actualLength: -1, expectedLimit: Infinity, actualCount: 2, finishReason: secret, content: secret, cause: secret } as unknown as RecapValidationDiagnostic;
  assert.deepEqual(safeRecapDiagnostic(hostile), { stage: "WORKER", rule: "UNSPECIFIED_VALIDATION_FAILURE", actualCount: 2, finishReason: "unknown" });
  assert.equal("jobId" in recapValidationLog(hostile, "/private/file"), false);
  assert.ok(!JSON.stringify(recapValidationLog(hostile, secret)).includes(secret));
});

test("public API errors expose the unchanged code/message, never internal diagnostics", async () => {
  const error = new RecapResponseValidationError({ stage: "OUTPUT_VALIDATION", rule: "TEXT_TOO_LONG", fieldPath: "output.summary", expectedLimit: 1200, actualLength: 1201 });
  const response = recapApiError(error);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: { code: "RECAP_INVALID_RESPONSE", message: "Recap provider returned unsupported or ungrounded output" } });
});

test("provider schema mirrors local text/count bounds and retains strict required fields", () => {
  const root = recapResponseSchema;
  assert.equal(root.additionalProperties, false); assert.equal(root.required.length, 5);
  // Schema is deliberately a JSON value, so inspect it without SDK dependencies.
  const schema = JSON.parse(JSON.stringify(root));
  assert.equal(schema.properties.title.minLength, 1); assert.equal(schema.properties.title.maxLength, RECAP_LIMITS.title);
  assert.equal(schema.properties.summary.maxLength, RECAP_LIMITS.summary);
  const sections = schema.properties.sections;
  assert.equal(sections.minItems, 1); assert.equal(sections.maxItems, RECAP_LIMITS.sections);
  assert.equal(sections.items.properties.heading.maxLength, RECAP_LIMITS.heading);
  assert.equal(sections.items.properties.summary.maxLength, RECAP_LIMITS.sectionSummary);
  const refs = sections.items.properties.evidence;
  assert.equal(refs.minItems, 1); assert.equal(refs.maxItems, RECAP_LIMITS.evidence);
  assert.equal(refs.items.properties.note.maxLength, RECAP_LIMITS.evidenceNote);
  assert.equal(refs.items.properties.segmentSequences.minItems, 1); assert.equal(refs.items.properties.segmentSequences.maxItems, RECAP_LIMITS.segmentReferences);
  for (const kind of ["characterInsights", "relationshipInsights"]) {
    assert.equal(schema.properties[kind].minItems, 0); assert.equal(schema.properties[kind].maxItems, RECAP_LIMITS.insights);
    assert.equal(schema.properties[kind].items.properties.observation.maxLength, RECAP_LIMITS.observation);
  }
});
