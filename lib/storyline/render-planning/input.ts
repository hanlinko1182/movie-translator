import "server-only";
import { canonicalJson, contractHash } from "../canonical";
import { StorylineContractError, freeze, hash, id, integer, literal, record } from "../validation";
import { parseRecordIdentity, parseStoreScope } from "../timeline-persistence/contracts";
import { RENDER_PLANNING as R, RenderPlanningError, renderPolicy, syntheticRenderProfile,
  type Rational, type ProfileReference, type RenderPlanningInput, type RenderRequestProposal, type SyntheticSourceObservation } from "./contracts";

export const renderSame = (a: unknown, b: unknown) => canonicalJson(a, R.resolutionBytes) === canonicalJson(b, R.resolutionBytes);
export function rejectRender(code: RenderPlanningError["code"]): never { throw new RenderPlanningError(code); }
export function renderGuard<T>(work: () => T, code: RenderPlanningError["code"] = "INVALID_INPUT"): T {
  try { return work(); } catch (e) {
    if (e instanceof RenderPlanningError) throw e;
    if (e instanceof StorylineContractError && e.rule === "SIZE_LIMIT") rejectRender("RESOURCE_LIMIT");
    rejectRender(code);
  }
}
export function renderCapture(value: unknown, max: number = R.recipeBytes): unknown {
  const bytes = canonicalJson(value, max); // Bounds/cycles/getters checked before traversing descriptors.
  function arrays(v: unknown) {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v) && Object.getPrototypeOf(v) !== Array.prototype) rejectRender("INVALID_INPUT");
    for (const d of Object.values(Object.getOwnPropertyDescriptors(v))) arrays(d.value);
  }
  arrays(value);
  return JSON.parse(bytes);
}
export function positive(value: unknown, max: number): number {
  const n = integer(value, "render.number", max); if (!n || Object.is(n, -0)) rejectRender("INVALID_INPUT"); return n;
}
export function parseRational(value: unknown): Rational {
  const r = record(value, ["numerator", "denominator"], "render.rational");
  const numerator = positive(r.numerator, R.maxRational), denominator = positive(r.denominator, R.maxRational);
  let a = numerator, b = denominator; while (b) { const next = a % b; a = b; b = next; }
  if (a !== 1) rejectRender("UNSUPPORTED_TIMEBASE");
  return { numerator, denominator };
}
export const syntheticRenderProfileReference = freeze({ id: syntheticRenderProfile.id,
  hash: contractHash(R.profile, syntheticRenderProfile), hashDomain: R.profile });
export function parseProfileReference(value: unknown): ProfileReference {
  const r = record(value, ["id", "hash", "hashDomain"], "render.profileReference");
  if (!renderSame(r, syntheticRenderProfileReference)) rejectRender("UNSUPPORTED_CODEC_CONTAINER");
  return { ...syntheticRenderProfileReference };
}
export function parseSyntheticRenderProfile(value: unknown) {
  return renderGuard(() => {
    const v = renderCapture(value, R.inputBytes);
    if (!renderSame(v, syntheticRenderProfile)) rejectRender("UNSUPPORTED_CODEC_CONTAINER");
    return syntheticRenderProfile;
  });
}
export function parseRenderPlanningInput(value: unknown) {
  return renderGuard(() => {
    const r = record(renderCapture(value, R.inputBytes), ["schemaVersion", "execution", "scope", "timeline", "policy", "profileReference"], "render.input");
    if (!renderSame(r.policy, renderPolicy)) rejectRender("INVALID_INPUT");
    const input: RenderPlanningInput = { schemaVersion: literal(r.schemaVersion, R.input, "render.schema"),
      execution: literal(r.execution, "SYNTHETIC_ONLY", "render.execution"), scope: parseStoreScope(r.scope),
      timeline: parseRecordIdentity(r.timeline), policy: renderPolicy, profileReference: parseProfileReference(r.profileReference) };
    return freeze(input);
  });
}
/** Checked exact rational conversion; no float multiplication or silent rounding. */
export function exactUnits(ms: number, rate: Rational, failure: "FRAME_BOUNDARY_UNREPRESENTABLE" | "UNSUPPORTED_TIMEBASE") {
  integer(ms, "render.units.ms", Number.MAX_SAFE_INTEGER);
  if (Object.is(ms, -0)) rejectRender("INVALID_INPUT");
  rate = parseRational(rate);
  const n = BigInt(ms) * BigInt(rate.numerator), d = BigInt(1000) * BigInt(rate.denominator);
  if (n % d !== BigInt(0)) rejectRender(failure);
  const result = n / d;
  if (result < BigInt(0) || result > BigInt(Number.MAX_SAFE_INTEGER)) rejectRender("RESOURCE_LIMIT");
  return Number(result);
}
export function parseSyntheticSourceObservation(value: unknown) {
  return renderGuard(() => {
    const r = record(renderCapture(value, R.inputBytes), ["schemaVersion", "execution", "verification", "possession", "fingerprint", "container", "encrypted", "topology", "video"], "render.source");
    const f = record(r.fingerprint, ["sha256", "bytes", "durationMs"], "render.fingerprint");
    const fingerprint = { sha256: hash(f.sha256, "render.sha256"), bytes: positive(f.bytes, R.maxSourceBytes), durationMs: positive(f.durationMs, R.maxDurationMs) };
    const t = record(r.topology, ["video", "audio", "subtitle", "data", "attachment"], "render.topology");
    if (t.video !== 1 || ![0, 1].includes(t.audio as number) || t.subtitle !== 0 || t.data !== 0 || t.attachment !== 0 || r.encrypted !== false) rejectRender("UNSUPPORTED_SOURCE_METADATA");
    const v = record(r.video, ["streamIndex", "codec", "pixelFormat", "width", "height", "frameRate", "timebase", "startTick", "durationTicks", "frameCount", "rotation", "variableFrameRate", "timestamps"], "render.video");
    const frameRate = parseRational(v.frameRate), timebase = parseRational(v.timebase);
    if (!renderSame(frameRate, syntheticRenderProfile.frameRate)) rejectRender("UNSUPPORTED_CODEC_CONTAINER");
    if (!renderSame(timebase, syntheticRenderProfile.timebase)) rejectRender("UNSUPPORTED_TIMEBASE");
    if (r.container !== "MP4" || v.codec !== "H264_AVC" || v.pixelFormat !== "YUV420P" || v.width !== 640 || v.height !== 360) rejectRender("UNSUPPORTED_CODEC_CONTAINER");
    if (v.streamIndex !== 0 || v.rotation !== 0 || v.startTick !== 0 || v.variableFrameRate !== false || v.timestamps !== "ZERO_ORIGIN_CONTIGUOUS_CFR") rejectRender("UNSUPPORTED_SOURCE_METADATA");
    const frameCount = positive(v.frameCount, Number.MAX_SAFE_INTEGER), durationTicks = positive(v.durationTicks, Number.MAX_SAFE_INTEGER);
    const expectedFrames = exactUnits(fingerprint.durationMs, frameRate, "FRAME_BOUNDARY_UNREPRESENTABLE");
    const expectedTicks = exactUnits(fingerprint.durationMs, { numerator: timebase.denominator, denominator: timebase.numerator }, "UNSUPPORTED_TIMEBASE");
    if (frameCount !== expectedFrames || durationTicks !== expectedTicks) rejectRender("UNSUPPORTED_SOURCE_METADATA");
    const result: SyntheticSourceObservation = { schemaVersion: literal(r.schemaVersion, R.source, "render.source.schema"),
      execution: literal(r.execution, "SYNTHETIC_METADATA_ONLY", "render.source.execution"), verification: literal(r.verification, "NOT_PROBED", "render.source.verification"),
      possession: literal(r.possession, "POSSESSION_NOT_ESTABLISHED", "render.source.possession"), fingerprint, container: "MP4", encrypted: false,
      topology: { video: 1, audio: t.audio as number, subtitle: 0, data: 0, attachment: 0 }, video: { streamIndex: 0, codec: "H264_AVC", pixelFormat: "YUV420P", width: 640, height: 360,
        frameRate, timebase, startTick: 0, durationTicks, frameCount, rotation: 0, variableFrameRate: false, timestamps: "ZERO_ORIGIN_CONTIGUOUS_CFR" } };
    return freeze(result);
  }, "UNSUPPORTED_SOURCE_METADATA");
}
export function parseRenderRequestProposal(value: unknown) {
  return renderGuard(() => {
    const r = record(renderCapture(value), ["schemaVersion", "scope", "recipeReference", "dependencyReference", "idempotencyKey", "execution", "executable"], "render.request");
    function reference(v: unknown, domain: typeof R.recipe | typeof R.dependency, prefix: string) {
      const r = record(v, ["id", "hash", "hashDomain"], "render.request.reference"), digest = hash(r.hash, "render.request.hash");
      if (r.id !== `${prefix}-${digest}`) rejectRender("INVALID_INPUT");
      return { id: r.id as string, hash: digest, hashDomain: literal(r.hashDomain, domain, "render.request.domain") };
    }
    if (r.executable !== false) rejectRender("INVALID_INPUT");
    const result: RenderRequestProposal = { schemaVersion: literal(r.schemaVersion, R.request, "render.request.schema"), scope: parseStoreScope(r.scope),
      recipeReference: reference(r.recipeReference, R.recipe, "rr") as RenderRequestProposal["recipeReference"],
      dependencyReference: reference(r.dependencyReference, R.dependency, "rrdep") as RenderRequestProposal["dependencyReference"],
      idempotencyKey: id(r.idempotencyKey, "render.request.key"), execution: literal(r.execution, "DISABLED_HANDOFF_ONLY", "render.request.execution"), executable: false };
    return freeze(result);
  });
}
