import type { SyntheticTimelineAdapter } from "@/components/storyline/timeline-version-session";
import type { timelineDatabaseFixture } from "../timeline-persistence/fixture";
type Fixture = Awaited<ReturnType<typeof timelineDatabaseFixture>>;
/** Server-owned native request composition only. No serialized authority. */
export async function timelineAdapter(f: Fixture, name = "editor-a", api = f.api, overrides: Parameters<Fixture["request"]>[2] = {}): Promise<SyntheticTimelineAdapter> {
  const selected = await f.m6.api.readVersion(f.m6.request(), { scope: f.scope, id: f.input.selected.id });
  return { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: name,
    target: { input: structuredClone(f.input), source: structuredClone(selected.record.plan.plan.input.source), dependency: { id: selected.record.dependencyId, hash: selected.record.dependencyHash } },
    prepareTimeline: v => api.prepareTimeline(f.request(name, false, overrides), v),
    saveVersion: v => api.saveVersion(f.request(name, true, overrides), f.request(name, false, overrides), v),
    readHead: v => api.readHead(f.request(name, false, overrides), v),
    readVersion: v => api.readVersion(f.request(name, false, overrides), v),
    listHistory: v => api.listHistory(f.request(name, false, overrides), v),
    readOperation: v => api.readOperation(f.request(name, false, overrides), v),
  };
}
