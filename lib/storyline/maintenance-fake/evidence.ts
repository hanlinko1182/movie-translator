import "server-only";
import { parseContext, parseEnvelope, envelopeHash, same, reject, type Context, type Envelope } from "./contracts";
export type OriginalObservation = { root: Envelope; owners: Envelope[]; evidence: { kind: "writer" | "reader" | "successor"; fact: Envelope }[] };
export type EvidenceHandle = Readonly<{ toJSON(): never }>;
const handles = new WeakMap<EvidenceHandle, { context: Context; kind: "writer" | "reader" | "successor"; fact: Envelope }>();
/** Trusted fixture-owner composition only. captureOriginal is not a request adapter. */
export async function createMaintenanceEvidenceOriginForTest(context: Context, captureOriginal: () => Promise<OriginalObservation>) {
  const c = parseContext(context), raw = await captureOriginal(), root = parseEnvelope("root", raw.root);
  if (!same(c, { namespace: root.namespace, scope: root.scope }) || raw.owners.length !== 2 || raw.evidence.length !== 3) reject("ORIGINAL_BINDING");
  const owners = raw.owners.map(v => parseEnvelope("owner", v));
  const evidence = raw.evidence.map(v => ({ kind: v.kind, fact: parseEnvelope(v.kind, v.fact) }));
  for (const value of [...owners, ...evidence.map(e => e.fact)]) if (!same(c, { namespace: value.namespace, scope: value.scope }) || value.body.rootId !== root.body.rootId) reject("ORIGINAL_BINDING");
  if (new Set(evidence.map(e => e.kind)).size !== 3 || new Set(owners.map(o => o.body.kind)).size !== 2) reject("ORIGINAL_BINDING");
  const tickets = evidence.map(e => {
    const cap = Object.freeze({ toJSON(): never { return reject("NON_SERIALIZABLE_EVIDENCE"); } });
    handles.set(cap, { context: c, ...e }); return cap;
  });
  return Object.freeze({ original: Object.freeze({ root, owners, evidence }), handles: Object.freeze(tickets),
    hashes: Object.freeze(evidence.map(e => envelopeHash(e.kind, e.fact))) });
}
export function consumeMaintenanceEvidence(handle: EvidenceHandle, context: Context) {
  const original = handles.get(handle); handles.delete(handle);
  if (!original || !same(original.context, parseContext(context))) reject("ORIGINAL_EVIDENCE_REQUIRED");
  return original;
}
