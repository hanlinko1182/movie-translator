import { createSyntheticVideoCatalog, OFFLINE_VIDEO as V, type SyntheticVideoDescriptor } from "../../../lib/storyline/video-highlights-offline";
import { createOfflineNarrationRegistry, measureNarrationWav, noOwnerClaims } from "../../../lib/storyline/narration-intake";
import { wav } from "../narration-intake/fixture";
export const seconds = (numerator: number, denominator = 1) => ({ numerator, denominator });
export function sourceInput() {
  return { schemaVersion: V.source, sourceId: "vs-" + "1".repeat(32), version: 1, origin: "SYNTHETIC_METADATA_ONLY",
    duration: seconds(120), timebase: null, rightsClaim: "NONE" };
}
export function fixture() {
  const catalog = createSyntheticVideoCatalog(), input = sourceInput(), source = catalog.register(input);
  return { catalog, input, source, request: selection(source) };
}
export function segment(order: number, start: ReturnType<typeof seconds>, end: ReturnType<typeof seconds>) {
  return { segmentId: "seg-" + (order + 1).toString(16).padStart(32, "0"), order, start, end, label: null as string | null };
}
export function selection(source: SyntheticVideoDescriptor) {
  return { schemaVersion: V.selection, source: { sourceId: source.metadata.sourceId, version: source.metadata.version, metadataHash: source.metadataHash },
    overlap: "REJECT", segments: [segment(0, seconds(10), seconds(18)), segment(1, seconds(35), seconds(47)), segment(2, seconds(80), seconds(92))] };
}
export function narration(frames: number, rate = 8000) {
  return createOfflineNarrationRegistry().register(measureNarrationWav(wav(frames, rate)), noOwnerClaims);
}
