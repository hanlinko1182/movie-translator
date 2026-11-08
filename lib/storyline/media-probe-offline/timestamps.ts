import "server-only";
import { add, compare, parseSeconds } from "../video-highlights-offline/rational";
import { boundedInteger, capture, deny, fields, MEDIA_PROBE, type ProbeRational } from "./contracts";

export type SyntheticFrame = Readonly<{ pts: number; dts: number; durationTicks: number }>;
export type FrameRateMode = "CONSTANT" | "VARIABLE" | "UNKNOWN";

export function parseProbeSeconds(value: unknown): ProbeRational {
  try {
    return parseSeconds(capture(value));
  } catch {
    return deny("INVALID_RATIONAL_SECONDS");
  }
}

export function positiveRational(value: unknown): ProbeRational {
  const seconds = parseProbeSeconds(value);
  if (seconds.numerator === 0) deny("NON_POSITIVE_RATIONAL");
  return seconds;
}

export function parseProbeTimebase(value: unknown): ProbeRational {
  const timebase = positiveRational(value);
  if (timebase.numerator > timebase.denominator) deny("UNSUPPORTED_TIMEBASE");
  return timebase;
}

export function parseFrameRate(value: unknown, mode: FrameRateMode) {
  if (value === null && mode !== "CONSTANT") return null;
  const rate = positiveRational(value);
  if (compare(rate, { numerator: 240, denominator: 1 }) > 0) deny("UNSUPPORTED_FRAME_RATE");
  return rate;
}

export function addProbeSeconds(left: ProbeRational, right: ProbeRational): ProbeRational {
  try {
    return add(left, right);
  } catch {
    return deny("RATIONAL_OVERFLOW");
  }
}

function exactTicks(seconds: ProbeRational, timebase: ProbeRational): number {
  const numerator = BigInt(seconds.numerator) * BigInt(timebase.denominator);
  const denominator = BigInt(seconds.denominator) * BigInt(timebase.numerator);
  const quotient = numerator / denominator;
  if (numerator % denominator !== BigInt(0) || quotient > BigInt(Number.MAX_SAFE_INTEGER)) {
    deny("TIMESTAMP_NOT_REPRESENTABLE");
  }
  return Number(quotient);
}

export function streamWindow(start: ProbeRational, duration: ProbeRational, timebase: ProbeRational) {
  const end = addProbeSeconds(start, duration);
  return { firstTick: exactTicks(start, timebase), endTick: exactTicks(end, timebase), end };
}

export function inspectSyntheticFrames(
  value: unknown,
  window: ReturnType<typeof streamWindow>,
  timebase: ProbeRational,
  mode: FrameRateMode,
  rate: ProbeRational | null,
) {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > MEDIA_PROBE.maxFrames) deny("INVALID_FRAME_COUNT");

  let previousDts = -1;
  const frames: SyntheticFrame[] = [];
  for (const entry of value) {
    const frame = fields(entry, ["pts", "dts", "durationTicks"]);
    const pts = boundedInteger(frame.pts, 0, Number.MAX_SAFE_INTEGER);
    const dts = boundedInteger(frame.dts, 0, Number.MAX_SAFE_INTEGER);
    const durationTicks = boundedInteger(frame.durationTicks, 1, Number.MAX_SAFE_INTEGER);
    if (dts <= previousDts || dts > pts) deny("CONFLICTING_DECODE_TIMESTAMPS");
    if (pts < window.firstTick || durationTicks > window.endTick - pts) deny("FRAME_OUTSIDE_STREAM");
    if (mode === "CONSTANT" && rate &&
      BigInt(durationTicks) * BigInt(timebase.numerator) * BigInt(rate.numerator) !==
      BigInt(timebase.denominator) * BigInt(rate.denominator)) {
      deny("FRAME_DURATION_RATE_MISMATCH");
    }
    previousDts = dts;
    frames.push({ pts, dts, durationTicks });
  }

  let nextPts = window.firstTick;
  for (const frame of [...frames].sort((left, right) => left.pts - right.pts)) {
    if (frame.pts !== nextPts) deny("PRESENTATION_GAP_OR_OVERLAP");
    nextPts += frame.durationTicks;
  }
  if (nextPts !== window.endTick) deny("INCOMPLETE_PRESENTATION_COVERAGE");
  return frames;
}

export function validateSyntheticInterval(
  value: unknown,
  start: ProbeRational,
  duration: ProbeRational,
  timebase: ProbeRational,
  frames: readonly SyntheticFrame[] | null,
) {
  const interval = fields(capture(value), ["start", "end"]);
  const from = parseProbeSeconds(interval.start);
  const to = parseProbeSeconds(interval.end);
  const window = streamWindow(start, duration, timebase);
  if (compare(from, start) < 0 ||
    compare(from, to) >= 0 || compare(to, window.end) > 0) deny("INVALID_SEGMENT_INTERVAL");
  if (!frames) deny("TIMESTAMP_EVIDENCE_MISSING");

  const fromTick = exactTicks(from, timebase);
  const toTick = exactTicks(to, timebase);
  const boundaries = new Set(frames.map(frame => frame.pts));
  boundaries.add(window.endTick);
  if (!boundaries.has(fromTick) || !boundaries.has(toTick)) deny("SEGMENT_NOT_ON_SYNTHETIC_BOUNDARIES");
  return Object.freeze({ start: from, end: to, startTick: fromTick, endTick: toTick });
}

export { compare as compareProbeSeconds };
