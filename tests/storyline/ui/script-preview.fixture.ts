// Executed in a separate react-server process. Never imported by application UI.
import { narrationFixture } from "../narration.fixture";
import { composeSyntheticNarration } from "@/lib/storyline/narration/synthetic-composer";
import type { StudioPreviewArtifact } from "@/components/storyline/local-script-model";

const fixture = narrationFixture(true);
const inferred = fixture.candidate.findings.find(row => row.classification === "INFERRED")!;
inferred.uncertainty = "COMPETING";
fixture.candidate.findings.push({ ...structuredClone(inferred), id: "competing-interpretation", statement: "မိမိကိုယ်ကို ကာကွယ်လိုခြင်း ရှိနိုင်သည်။" });
const pair = [inferred.id, "competing-interpretation"].sort();
fixture.candidate.contradictions.push({ firstFindingId: pair[0], secondFindingId: pair[1], explanation: "ဖြစ်နိုင်သော အဓိပ္ပာယ်ဖွင့်ဆိုချက် နှစ်မျိုး ဖြစ်သည်။" });
fixture.refresh();
const { source, context } = fixture;
const { id, projectId, movieId, transcript, scenes, characters, relationships } = source.payload;
const artifact: StudioPreviewArtifact = {
  purpose: "SYNTHETIC_TEST_ONLY", currentness: "CURRENT_AT_READ",
  draft: composeSyntheticNarration(context), candidate: context.candidate,
  source: { sourceContentHash: source.sourceContentHash, sourceContextHash: source.sourceContextHash,
    payload: { id, projectId, movieId, transcript, scenes, characters, relationships },
    dependencyHash: source.payload.preparation!.dependencyHash, bindingHash: source.payload.preparation!.sourceBindingHash,
    mediaSha256: source.payload.media.sha256,
    observations: source.payload.preparation!.observations.map(({ id, evidenceText, anchor, sceneId, transcriptSegmentId, ownerKind, ownerId }) => ({ id, evidenceText, anchor, sceneId, transcriptSegmentId, ownerKind, ownerId })),
  },
};
process.stdout.write(JSON.stringify(artifact));
