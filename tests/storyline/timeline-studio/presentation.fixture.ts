import { timelineFixture } from "../timeline/fixture";
import { generateRecapTimelinePlan } from "@/lib/storyline/timeline/planner";
import { safePreview } from "../highlights-studio/presentation.fixture";
export const inferredOptions: Parameters<typeof timelineFixture>[0] = { candidate: (c, source) => {
  const basis = c.findings.find(f => f.id === "behavior-6")!;
  basis.evidence = [5, 6, 7, 8, 9].map(seq => {
    const o = source.payload.preparation!.observations.find(o => o.id === `obs-character-a-${seq}`)!;
    return { kind: "CAPTURED_OBSERVATION", anchor: structuredClone(o.anchor), segmentId: o.transcriptSegmentId, sceneId: o.sceneId, observationId: o.id };
  });
  const inference = c.findings.find(f => f.id === "inference-6")!; inference.uncertainty = "COMPETING";
  c.findings.push({ ...structuredClone(inference), id: "inference-opposite", statement: "ယုံကြည်မှု ရှိနိုင်သည်။" });
  c.contradictions.push({ firstFindingId: inference.id, secondFindingId: "inference-opposite", explanation: "Competing interpretation" });
} };
export async function presentationFixture() {
  const f = timelineFixture({ ...inferredOptions, raw: r => { r.transcript.segments[0].endMs = 1000; } }, f => { f.input.policy.presentation = "SCORE_ORDER"; });
  const plan = await generateRecapTimelinePlan(f.input, f.resolver);
  return { plan, artifact: safePreview(f.f.capture), target: { input: f.input, source: f.f.input.source, dependency: { id: f.observation.dependency.id, hash: f.observation.dependency.hash } } };
}
if (process.argv[2] === "print-timeline") void presentationFixture().then(f => process.stdout.write(JSON.stringify(f)));
