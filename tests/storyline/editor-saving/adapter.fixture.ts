// Test composition only. Never imported from app/, components/ or lib/.
import type { SyntheticScriptVersionAdapter } from "@/components/storyline/script-version-session";
import type { StudioPreviewArtifact } from "@/components/storyline/local-script-model";
import { createNarrationContextRunner } from "@/lib/storyline/narration-integration/context-access";
import { studioVersionFixture } from "../studio-versions/fixture";

export type Fixture = Awaited<ReturnType<typeof studioVersionFixture>>;
export function adapterForTest(x: Fixture, name = "editor-a", api = x.api, overrides: Parameters<Fixture["request"]>[2] = {}): SyntheticScriptVersionAdapter {
  return { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: `synthetic-${name}`,
    target: { scope: x.scope, original: x.original },
    readOriginal: input => api.readOriginal(x.request(name, false, overrides), input),
    saveVersion: input => api.saveVersion(x.request(name, true, overrides), input),
    readVersion: input => api.readVersion(x.request(name, false, overrides), input),
    listVersions: input => api.listVersions(x.request(name, false, overrides), input),
  };
}
export async function previewForTest(x: Fixture): Promise<StudioPreviewArtifact> {
  return createNarrationContextRunner({ database: x.readerDatabase, inspectMedia: x.f.media.inspect, profile: x.f.currentProfile() }).run({
    scope: x.scope, candidateId: x.originalView.binding.analysis.candidateId, candidateHash: x.originalView.binding.analysis.candidateHash,
  }, async (_tx, context, draft) => {
    const source = context.source;
    const { id, projectId, movieId, transcript, scenes, characters, relationships } = source.payload;
    return { purpose: "SYNTHETIC_TEST_ONLY", currentness: "CURRENT_AT_READ", draft, candidate: context.candidate,
      source: { sourceContentHash: source.sourceContentHash, sourceContextHash: source.sourceContextHash,
        payload: { id, projectId, movieId, transcript, scenes, characters, relationships },
        dependencyHash: draft.payload.source.dependencyHash, bindingHash: draft.payload.source.bindingHash, mediaSha256: draft.payload.source.mediaSha256,
        observations: source.payload.preparation!.observations.map(({ id, evidenceText, anchor, sceneId, transcriptSegmentId, ownerKind, ownerId }) => ({ id, evidenceText, anchor, sceneId, transcriptSegmentId, ownerKind, ownerId })),
      } };
  });
}
