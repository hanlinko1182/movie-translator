import { MEDIA_PROBE, fixedProbeExecutable, linuxHintNames, sandboxRequirements, type LinuxHintState } from "../../../lib/storyline/media-probe-offline";

export const seconds = (numerator: number, denominator = 1) => ({ numerator, denominator });
export const sourceFixture = () => ({ sha256: "a".repeat(64), byteCount: 4096 });

export function videoFixture() {
  return {
    index: 0, mediaType: "VIDEO", codec: "H264_AVC", width: 640, height: 360,
    timebase: seconds(1, 1000), start: seconds(0), duration: seconds(3, 25),
    frameRate: seconds(25) as ReturnType<typeof seconds> | null, frameRateMode: "CONSTANT",
    frames: [
      { pts: 0, dts: 0, durationTicks: 40 },
      { pts: 40, dts: 40, durationTicks: 40 },
      { pts: 80, dts: 80, durationTicks: 40 },
    ] as { pts: number; dts: number; durationTicks: number }[] | null,
  };
}

export function audioFixture() {
  return {
    index: 1, mediaType: "AUDIO", codec: "AAC", sampleRate: 48000, channels: 2,
    timebase: seconds(1, 48000), start: seconds(0), duration: seconds(3, 25),
  };
}

export function probeFixture() {
  return {
    schemaVersion: MEDIA_PROBE.result, trust: "PROBE_RESULT_SYNTHETIC", completeness: "SYNTHETIC_METADATA_COMPLETE",
    source: sourceFixture(), container: "MP4", duration: seconds(3, 25), timestampProvenance: "SYNTHETIC_DECLARATIONS",
    negativeTimestampPolicy: "REJECT", streams: [videoFixture()] as (ReturnType<typeof videoFixture> | ReturnType<typeof audioFixture>)[],
  };
}

export function profileFixture() {
  return {
    schemaVersion: MEDIA_PROBE.profile,
    executable: { path: fixedProbeExecutable, version: "7.1.1", sha256: "b".repeat(64) },
    requirements: sandboxRequirements,
  };
}

export function hostFixture(state: LinuxHintState = "VISIBLE") {
  return {
    schemaVersion: MEDIA_PROBE.hostHints, platform: "LINUX", identity: "NON_ROOT",
    interfaces: Object.fromEntries(linuxHintNames.map(name => [name, state])),
  };
}
