import type { RecapStudioContext } from "@/components/storyline/recap-studio-shell";
import { recapProps } from "../../recap/recovery.fixture";

export const studioContext: RecapStudioContext = {
  projectId: recapProps.projectId, projectName: recapProps.projectName, movie: recapProps.movie,
  transcriptState: "READY", transcriptSegmentCount: 12, sceneCount: 1,
  characterState: "CURRENT", projectHref: recapProps.projectHref,
};
export const recapPath = "/projects/synthetic/recap";

// Completed legacy output is synthetic, never submitted to a database/provider.
const evidence = {
  id: "fixture-anchor", sceneSequence: 0, scene: { startMs: 0, endMs: 259000 },
  segment: { sequence: 0, startMs: 1000, endMs: 5000, excerpt: "这是测试对话。", truncated: false },
  note: "အထောက်အထား မှတ်ချက်",
};
export const completedRecapProps: typeof recapProps = {
  ...recapProps, initialJob: null,
  initial: { recap: {
    id: "fixture-recap", sourceHash: "a".repeat(64), sourceTranscriptId: "fixture-transcript", characterAnalysisRunId: "fixture-analysis",
    characterContext: "CURRENT", stale: false, provider: "fixture", model: "fixture", language: "my", strategy: "SINGLE_STAGE",
    runtimeMs: 1, modelCalls: 1, usage: null, title: "စမ်းသပ် ဇာတ်လမ်း", summary: "စမ်းသပ်ထားသော မြန်မာ ဇာတ်လမ်းအကျဉ်း ဖြစ်ပါသည်။",
    createdAt: "2026-10-11T00:00:00.000Z", updatedAt: "2026-10-11T00:00:00.000Z",
    sections: [{ id: "fixture-section", sequence: 0, sceneStartSequence: 0, sceneEndSequence: 0, heading: "စမ်းသပ် အပိုင်း", summary: "စမ်းသပ် အပိုင်း အကြောင်းအရာ", confidence: "HIGH", evidence: [evidence] }],
    characterInsights: [{ id: "fixture-insight", characterId: "fixture-character", displayName: "Fixture character", uncertain: true, observation: "စမ်းသပ် ဇာတ်ကောင် လေ့လာချက်", confidence: "MEDIUM", evidence: [{ ...evidence, id: "fixture-character-anchor" }] }],
    relationshipInsights: [{ id: "fixture-relationship-insight", relationshipId: "fixture-relationship", characterAId: "fixture-character", characterBId: "fixture-character-b", nameA: "Fixture character", nameB: "Fixture partner", uncertainA: true, uncertainB: true, observation: "စမ်းသပ် ဆက်ဆံရေး လေ့လာချက်", confidence: "LOW", evidence: [{ ...evidence, id: "fixture-relationship-anchor" }] }],
  } },
};
