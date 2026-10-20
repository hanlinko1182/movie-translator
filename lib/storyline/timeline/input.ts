import "server-only";
import { canonicalJson } from "../canonical";
import { freeze, literal, record } from "../validation";
import { HIGHLIGHTS } from "../highlights/contracts";
import { HIGHLIGHT_STORE, parseRecordIdentity, parseStoreScope } from "../highlights-persistence/contracts";
import { TIMELINE as T, TimelineError, timelinePolicy } from "./contracts";

export function parseRecapTimelineInput(value: unknown) {
  try {
    const r = record(JSON.parse(canonicalJson(value, T.maxBytes)), ["schemaVersion", "execution", "scope", "selected", "policy"], "timeline.input");
    const s = record(r.selected, ["id", "version", "recordHash", "recordHashDomain", "planHash", "planHashDomain"], "timeline.selected");
    const selected = parseRecordIdentity({ id: s.id, version: s.version, recordHash: s.recordHash, planHash: s.planHash });
    // Fixed v1 policy: even extra keys and allegedly harmless timing options fail.
    if (canonicalJson(r.policy) !== canonicalJson(timelinePolicy)) throw new TimelineError("INVALID_INPUT");
    return freeze({ schemaVersion: literal(r.schemaVersion, T.input, "timeline.schema"),
      execution: literal(r.execution, "SYNTHETIC_ONLY", "timeline.execution"), scope: parseStoreScope(r.scope),
      selected: { ...selected, recordHashDomain: literal(s.recordHashDomain, HIGHLIGHT_STORE.record, "timeline.recordDomain"),
        planHashDomain: literal(s.planHashDomain, HIGHLIGHTS.plan, "timeline.planDomain") }, policy: timelinePolicy });
  } catch { throw new TimelineError("INVALID_INPUT"); }
}
