import "server-only";
import { contractHash } from "../canonical";
import { freeze } from "../validation";
import { boundedInteger, capture, choice, deny, fields, MEDIA_PROBE, pendingEvidence, restrictions, sourceBinding } from "./contracts";
import { addProbeSeconds, compareProbeSeconds, inspectSyntheticFrames, parseFrameRate, parseProbeSeconds, parseProbeTimebase, positiveRational,
  streamWindow, validateSyntheticInterval } from "./timestamps";

const commonStreamFields = ["index", "mediaType", "codec", "timebase", "start", "duration"];
const issued = new WeakSet<object>();

function parseStream(value: unknown, container: "MP4" | "MATROSKA") {
  const mediaType = choice((value as Record<string, unknown> | null)?.mediaType, ["VIDEO", "AUDIO"] as const);
  const stream = fields(value, [...commonStreamFields, ...(mediaType === "VIDEO" ?
    ["width", "height", "frameRate", "frameRateMode", "frames"] : ["sampleRate", "channels"])]);
  const index = boundedInteger(stream.index, 0, 255);
  const timebase = parseProbeTimebase(stream.timebase);
  const start = parseProbeSeconds(stream.start);
  const duration = positiveRational(stream.duration);
  const window = streamWindow(start, duration, timebase);
  const common = { index, timebase, start, duration };

  if (mediaType === "AUDIO") {
    const codec = choice(stream.codec, container === "MP4" ? ["AAC"] as const : ["AAC", "OPUS"] as const);
    return { ...common, mediaType, codec, sampleRate: boundedInteger(stream.sampleRate, 8000, 192000),
      channels: boundedInteger(stream.channels, 1, 8) };
  }

  const codec = choice(stream.codec, container === "MP4" ? ["H264_AVC"] as const : ["H264_AVC", "VP9"] as const);
  const width = boundedInteger(stream.width, 1, 8192);
  const height = boundedInteger(stream.height, 1, 8192);
  if (width * height > 33554432) deny("PIXEL_LIMIT");
  const frameRateMode = choice(stream.frameRateMode, ["CONSTANT", "VARIABLE", "UNKNOWN"] as const);
  const frameRate = parseFrameRate(stream.frameRate, frameRateMode);
  const frames = inspectSyntheticFrames(stream.frames, window, timebase, frameRateMode, frameRate);
  return { ...common, mediaType, codec, width, height, frameRateMode, frameRate, frames };
}

export function validateSyntheticProbeResult(expectedSource: unknown, value: unknown) {
  const expected = sourceBinding(capture(expectedSource));
  const result = fields(capture(value), ["schemaVersion", "trust", "completeness", "source", "container", "duration",
    "timestampProvenance", "negativeTimestampPolicy", "streams"]);
  if (result.schemaVersion !== MEDIA_PROBE.result || result.trust !== "PROBE_RESULT_SYNTHETIC" ||
    result.completeness !== "SYNTHETIC_METADATA_COMPLETE" || result.timestampProvenance !== "SYNTHETIC_DECLARATIONS" ||
    result.negativeTimestampPolicy !== "REJECT") deny("UNSUPPORTED_PROBE_RESULT");

  const source = sourceBinding(result.source);
  if (source.sha256 !== expected.sha256 || source.byteCount !== expected.byteCount) deny("SOURCE_BINDING_MISMATCH");
  const container = choice(result.container, ["MP4", "MATROSKA"] as const);
  const duration = positiveRational(result.duration);
  if (compareProbeSeconds(duration, { numerator: 86400, denominator: 1 }) > 0) deny("DURATION_LIMIT");
  if (!Array.isArray(result.streams) || result.streams.length < 1 || result.streams.length > 2) deny("UNSUPPORTED_TOPOLOGY");
  const streams = result.streams.map(stream => parseStream(stream, container));
  if (new Set(streams.map(stream => stream.index)).size !== streams.length) deny("DUPLICATE_STREAM_INDEX");
  const videos = streams.filter(stream => stream.mediaType === "VIDEO");
  if (videos.length !== 1) deny("UNSUPPORTED_TOPOLOGY");
  const ends = streams.map(stream => addProbeSeconds(stream.start, stream.duration));
  const lastEnd = ends.reduce((latest, end) => compareProbeSeconds(end, latest) > 0 ? end : latest);
  if (compareProbeSeconds(lastEnd, duration) !== 0) deny("CONTAINER_DURATION_MISMATCH");

  const video = videos[0];
  const presentationReordered = video.frames?.some((frame, index, frames) => index > 0 && frame.pts < frames[index - 1].pts);
  const metadata = freeze({
    schemaVersion: MEDIA_PROBE.result, trust: "PROBE_RESULT_SYNTHETIC", completeness: "SYNTHETIC_METADATA_COMPLETE",
    timestampProvenance: "SYNTHETIC_DECLARATIONS", negativeTimestampPolicy: "REJECT",
    source, container, duration, streams,
  } as const);
  const validated = freeze({
    metadata,
    resultHash: contractHash(MEDIA_PROBE.result, metadata),
    sourceEvidence: "SYNTHETIC_BYTE_BINDING_ONLY",
    timingUncertainty: [
      ...(video.frames === null ? ["PRESENTATION_TIMESTAMPS_MISSING"] : []),
      ...(video.frameRateMode !== "CONSTANT" ? ["CONSTANT_RATE_NOT_ESTABLISHED"] : []),
      ...(presentationReordered ? ["PRESENTATION_REORDERED"] : []),
      "REAL_FRAME_AND_KEYFRAME_BOUNDARIES_UNVERIFIED",
    ],
    blockers: pendingEvidence,
    restrictions,
  } as const);
  issued.add(validated);
  return validated;
}

export type SyntheticProbeResult = ReturnType<typeof validateSyntheticProbeResult>;

export function validateProbeSegmentBoundaries(result: SyntheticProbeResult, streamIndex: number, interval: unknown) {
  if (!issued.has(result)) deny("UNTRUSTED_SYNTHETIC_RESULT");
  const stream = result.metadata.streams.find(candidate => candidate.index === streamIndex);
  if (!stream || stream.mediaType !== "VIDEO") deny("VIDEO_STREAM_REQUIRED");
  const boundaries = validateSyntheticInterval(interval, stream.start, stream.duration, stream.timebase, stream.frames);
  return freeze({ ...boundaries, streamIndex, resultHash: result.resultHash,
    status: "SYNTHETIC_INTERVAL_ONLY", restrictions } as const);
}
