import type { StudioPreviewArtifact } from "@/components/storyline/local-script-model";
import type { SyntheticHighlightCapture } from "@/lib/storyline/highlights/contracts";
import { highlightsFixture } from "../highlights/fixture";
import { generateHighlightPlan } from "@/lib/storyline/highlights/planner";
export function safePreview(c: SyntheticHighlightCapture): StudioPreviewArtifact {
  const source = c.context.source, draft = c.original;
  const { id, projectId, movieId, transcript, scenes, characters, relationships } = source.payload;
  return { purpose: "SYNTHETIC_TEST_ONLY", currentness: "CURRENT_AT_READ", draft, candidate: c.context.candidate,
    source: { sourceContentHash: source.sourceContentHash, sourceContextHash: source.sourceContextHash,
      payload: { id, projectId, movieId, transcript, scenes, characters, relationships }, dependencyHash: draft.payload.source.dependencyHash,
      bindingHash: draft.payload.source.bindingHash, mediaSha256: draft.payload.source.mediaSha256,
      observations: source.payload.preparation!.observations.map(({ id, evidenceText, anchor, sceneId, transcriptSegmentId, ownerKind, ownerId }) => ({ id, evidenceText, anchor, sceneId, transcriptSegmentId, ownerKind, ownerId })) } };
}
if (process.argv[2] === "print") {
  const f = highlightsFixture(); const plan = generateHighlightPlan(f.input, f.resolver);
  process.stdout.write(JSON.stringify({ plan, artifact: safePreview(f.capture), target: { scope: { tenantId: "tenant-one", ...f.input.source.narration.scope }, source: f.capture.current, policy: f.input.policy, audio: null } }));
}
