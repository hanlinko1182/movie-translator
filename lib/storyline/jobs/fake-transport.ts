import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { record, literal, id, integer, hash } from "../validation";
import { taskFail } from "./errors";

const wireBrand: unique symbol = Symbol("story-fake-wire");
export type StoryFakeWire = { readonly [wireBrand]: true };
export type FakeWireScenario = "SUCCESS" | "FAILURE" | "LOST_RESPONSE" | "TIMEOUT" | "MALFORMED" | "OVERSIZE" | "HELD_SUCCESS";
type State = { scenario: FakeWireScenario; calls: number; release: (() => void) | null };
const wires = new WeakMap<object, State>();
export function createStoryFakeWire(scenario: FakeWireScenario) {
  if (!["SUCCESS", "FAILURE", "LOST_RESPONSE", "TIMEOUT", "MALFORMED", "OVERSIZE", "HELD_SUCCESS"].includes(scenario))
    taskFail("STORY_TASK_INVALID", "fakeWire.scenario");
  const state: State = { scenario, calls: 0, release: null };
  const wire = Object.freeze({ toJSON() { taskFail("STORY_TASK_INVALID", "fakeWire.serialization"); } });
  wires.set(wire, state);
  return Object.freeze({ wire: wire as unknown as StoryFakeWire, calls: () => state.calls, release: () => state.release?.() });
}
export type FakeWireRequest = Readonly<{ submissionId: string; taskId: string; generation: number; requestHash: string }>;
/** Only registered in-process fake adapters; no arbitrary HTTP callback/URL/SDK. */
export async function invokeStoryFakeWire(wire: unknown, request: FakeWireRequest, signal: AbortSignal): Promise<string> {
  const state = wire && typeof wire === "object" ? wires.get(wire) : undefined;
  if (!state) taskFail("STORY_TASK_INVALID", "fakeWire.port");
  if (signal.aborted) throw new Error("Synthetic transport aborted");
  state.calls++;
  if (state.scenario === "LOST_RESPONSE") throw new Error("Synthetic response lost");
  if (state.scenario === "TIMEOUT" || state.scenario === "HELD_SUCCESS") await new Promise<void>((resolve, reject) => {
    const stop = () => { state.release = null; reject(new Error("Synthetic transport aborted")); };
    signal.addEventListener("abort", stop, { once: true });
    if (state.scenario === "HELD_SUCCESS") state.release = () => { signal.removeEventListener("abort", stop); state.release = null; resolve(); };
  });
  if (state.scenario === "MALFORMED") return "{";
  if (state.scenario === "OVERSIZE") return "x".repeat(50001);
  return canonicalJson({ schemaVersion: "story-fake-result-v1", synthetic: true, ...request,
    outcome: state.scenario === "FAILURE" ? "FAILURE" : "SUCCESS" });
}
export function parseStoryFakeResult(bytes: string, request: FakeWireRequest, maxBytes: number) {
  if (Buffer.byteLength(bytes, "utf8") > maxBytes) taskFail("STORY_TASK_INVALID_RESPONSE", "fakeWire.response");
  const r = record(JSON.parse(bytes), ["schemaVersion", "synthetic", "submissionId", "taskId", "generation", "requestHash", "outcome"], "fakeWire.result");
  literal(r.schemaVersion, "story-fake-result-v1", "fakeWire.schemaVersion");
  if (r.synthetic !== true || !["SUCCESS", "FAILURE"].includes(r.outcome as string) || id(r.submissionId, "fakeWire.submissionId") !== request.submissionId ||
    id(r.taskId, "fakeWire.taskId") !== request.taskId || integer(r.generation, "fakeWire.generation") !== request.generation ||
    hash(r.requestHash, "fakeWire.requestHash") !== request.requestHash) taskFail("STORY_TASK_INVALID_RESPONSE", "fakeWire.result");
  const canonical = canonicalJson(r, maxBytes);
  return Object.freeze({ canonical, hash: contractHash("story-fake-result-v1", r), outcome: r.outcome as "SUCCESS" | "FAILURE" });
}
