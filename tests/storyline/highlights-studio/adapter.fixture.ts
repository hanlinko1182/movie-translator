import type { SyntheticHighlightAdapter } from "@/components/storyline/highlight-version-session";
import type { highlightDatabaseFixture } from "../highlights-persistence/fixture";

type Fixture = Awaited<ReturnType<typeof highlightDatabaseFixture>>;
/** Server-only direct test composition. No authority is serialized to the UI. */
export function highlightAdapter(f: Fixture, name = "editor-a", api = f.api, overrides: Parameters<Fixture["request"]>[2] = {}): SyntheticHighlightAdapter {
  return { mode: "DISPOSABLE_SYNTHETIC_ONLY", identityKey: name,
    target: { scope: structuredClone(f.scope), source: structuredClone(f.initial.capture.current), policy: structuredClone(f.fixture.input.policy), audio: null },
    preparePlan: v => api.preparePlan(f.request(name, false, overrides), v),
    saveVersion: v => api.saveVersion(f.request(name, true, overrides), f.request(name, false, overrides), v),
    readHead: v => api.readHead(f.request(name, false, overrides), v),
    readVersion: v => api.readVersion(f.request(name, false, overrides), v),
    listHistory: v => api.listHistory(f.request(name, false, overrides), v),
    readOperation: v => api.readOperation(f.request(name, false, overrides), v),
  };
}
