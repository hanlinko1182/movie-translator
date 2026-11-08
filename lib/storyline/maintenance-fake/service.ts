import "server-only";
import { id, hash } from "../validation";
import { parseContext, parseEnvelope, envelopeHash, same, type Context, type DecisionView } from "./contracts";
import type { MaintenanceGateway } from "./database";
import { consumeMaintenanceEvidence, type EvidenceHandle } from "./evidence";
export function createMaintenanceServiceForTest(options: { mode: "M806_PHASE1A_DISPOSABLE_ONLY"; context: Context; gateway: MaintenanceGateway }) {
  if (options.mode !== "M806_PHASE1A_DISPOSABLE_ONLY") throw Error("DISPOSABLE_ONLY");
  const context = parseContext(options.context), db = options.gateway;
  function binding(rootId: string, decisionId: string) { return { rootId: id(rootId, "maintenance.rootId"), id: id(decisionId, "maintenance.decisionId") }; }
  async function submit(request: unknown, input: unknown): Promise<DecisionView> {
    const decision = parseEnvelope("decision", input);
    if (!same(context, { namespace: decision.namespace, scope: decision.scope })) throw Error("SCOPE_BINDING");
    return db.transaction("submit", request, context, tx => tx.call({ op: "submit", ...binding(String(decision.body.rootId), String(decision.body.decisionId)), decision })) as Promise<DecisionView>;
  }
  const read = (request: unknown, rootId: string, decisionId: string, decisionHash: string) => db.transaction("read", request, context,
    tx => tx.call({ op: "read", ...binding(rootId, decisionId), decisionHash: hash(decisionHash, "maintenance.decisionHash") })) as Promise<DecisionView>;
  const reconcile = (request: unknown, rootId: string, decisionId: string, decisionHash: string) => db.transaction("reconcile", request, context,
    tx => tx.call({ op: "reconcile", ...binding(rootId, decisionId), decisionHash: hash(decisionHash, "maintenance.decisionHash") })) as Promise<DecisionView>;
  async function registerEvidence(request: unknown, rootId: string, decisionId: string, revision: number, handle: EvidenceHandle) {
    const actor = db.authenticate("evidence", request, context);
    if (!actor.rootIds.includes(rootId)) throw Error("ROOT_BINDING");
    binding(rootId, decisionId);
    const original = consumeMaintenanceEvidence(handle, context);
    if (original.fact.body.rootId !== rootId) throw Error("ROOT_BINDING");
    return db.transaction("evidence", request, context, tx => tx.call({ op: "evidence", ...binding(rootId, decisionId), revision, kind: original.kind, fact: original.fact })) as Promise<DecisionView>;
  }
  const qualify = (request: unknown, rootId: string, decisionId: string, revision: number) => db.transaction("qualify", request, context,
    tx => tx.call({ op: "qualify", ...binding(rootId, decisionId), revision })) as Promise<DecisionView>;
  const health = async (request: unknown) => parseEnvelope("health", await db.transaction("health", request, context, tx => tx.call({ op: "health" })));
  return Object.freeze({ submit, read, reconcile, registerEvidence, qualify, health, decisionHash: (value: unknown) => envelopeHash("decision", value) });
}
