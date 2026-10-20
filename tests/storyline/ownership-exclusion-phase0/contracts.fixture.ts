// Test-only Phase 0 records. No operational release, SQL gateway or execution permit.
import { canonicalJson, contractHash } from "../../../lib/storyline/canonical";
import { freeze } from "../../../lib/storyline/validation";

export const phase0Restrictions = Object.freeze({ environment: "DISPOSABLE_FAKE_ONLY", execution: "SYNTHETIC_ONLY", media: "SIMULATED_NOT_MEDIA",
  verification: "MEDIA_VERIFICATION_NOT_PERFORMED", rendering: "NOT_RENDERED", sourceVerified: false,
  humanApproval: "NONE", spendingAuthority: "NONE", publicationEligibility: false, operationalRecovery: false,
  originalMovieAudio: "EXCLUDED", synthesizedNarration: "NONE", speech: "NOT_VERIFIED", voiceSynchronization: "UNSUPPORTED" } as const);
export const ceilings = Object.freeze({ envelope: 16384, children: 4, commands: 64, commandBytes: 4096,
  blobBytes: 4096, diagnosticBytes: 65536, lifetimeMs: 15000, activeRoots: 1 });
const identifier = (v: unknown) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown) => Number.isSafeInteger(v) && !Object.is(v, -0) && Number(v) >= 0 && Number(v) <= 1000000;
const positive = (v: unknown) => integer(v) && Number(v) > 0;
const decimal = (v: unknown) => typeof v === "string" && /^[0-9]{1,24}$/.test(v);
const yes = (v: unknown) => v === true;
const choices = (...values: string[]) => (v: unknown) => typeof v === "string" && values.includes(v);
const hashes = (v: unknown) => Array.isArray(v) && v.length > 0 && v.length <= 16 && v.every(hash);
export const permissions = ["OBSERVE", "REGISTER_WRITER", "REGISTER_READER", "QUALIFY_SUCCESSOR", "REPORT_INCIDENT", "OBSERVE_HEALTH"] as const;
const grants = (v: unknown) => Array.isArray(v) && v.length <= permissions.length && new Set(v).size === v.length
  && v.every(a => permissions.includes(a));
const schemas = {
  root: { id: identifier, incarnation: identifier, supervisor: identifier, bootHash: hash, device: decimal, inode: decimal },
  owner: { id: identifier, incarnation: identifier, rootHash: hash, supervisor: identifier, bootHash: hash,
    processStart: decimal, pid: decimal, generation: positive, descriptorPolicy: choices("NO_TRANSFER_CLOEXEC") },
  guard: { rootHash: hash, device: decimal, inode: decimal, registered: yes },
  mutation: { id: identifier, ownerHash: hash, version: identifier, intentHash: hash, generation: positive, revision: integer,
    state: choices("REGISTERED", "IO_ACTIVE", "CLOSED", "UNKNOWN") },
  "writer-closure": { mutationHash: hash, ownerHash: hash, guardHash: hash, allDescriptorsClosed: yes, noFutureIO: yes, quiescent: yes },
  reader: { id: identifier, ownerHash: hash, version: identifier, ticketHash: hash, generation: positive,
    state: choices("REGISTERED", "IO_ACTIVE", "CLOSED", "UNKNOWN") },
  "reader-closure": { readerHash: hash, ownerHash: hash, allDescriptorsClosed: yes, noFutureOpen: yes, quiescent: yes },
  decision: { id: identifier, action: choices("OBSERVE", "QUALIFY_SUCCESSOR"), expectedGeneration: positive,
    expectedRevision: integer, evidence: hashes, outcome: choices("BLOCKED", "ELIGIBLE_FOR_FUTURE_PHASE1_ONLY") },
  incident: { id: identifier, targetHash: hash, code: choices("BUSY", "IDENTITY", "UNKNOWN", "REVOKED", "CLOSURE") },
  health: { state: choices("READY", "BLOCKED", "UNKNOWN"), registeredOwners: integer, closedOwners: integer, pending: integer },
  authority: { principal: identifier, grants, generation: positive },
  audit: { decisionHash: hash, previousHash: hash, sequence: integer, actor: identifier },
} as const;
export type Kind = keyof typeof schemas;
export const phase0Domains = Object.freeze(Object.fromEntries(Object.keys(schemas).map(k => [k, `story-recap-fake-ownership-phase0-${k}-v1`])) as Record<Kind, string>);
export const scope = Object.freeze({ namespace: "phase0", tenantId: "synthetic-tenant", projectId: "synthetic-project", movieId: "synthetic-movie", studioId: "synthetic-studio" });
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("|") !== keys.sort().join("|")) throw Error("STRICT_RECORD");
}
export function parsePhase0(kind: Kind, value: unknown) {
  if (!Object.hasOwn(schemas, kind)) throw Error("DOMAIN");
  const parsed = JSON.parse(canonicalJson(value, ceilings.envelope));
  exact(parsed, ["schemaVersion", "scope", "restrictions", "body"]);
  if (parsed.schemaVersion !== phase0Domains[kind] || canonicalJson(parsed.scope) !== canonicalJson(scope)
    || canonicalJson(parsed.restrictions) !== canonicalJson(phase0Restrictions)) throw Error("BOUNDARY");
  const schema: Record<string, (v: unknown) => boolean> = schemas[kind];
  exact(parsed.body, Object.keys(schema));
  for (const [key, validate] of Object.entries(schema)) if (!validate(parsed.body[key])) throw Error(`FIELD_${key}`);
  return freeze(parsed);
}
export function phase0Record(kind: Kind, body: unknown) {
  return parsePhase0(kind, { schemaVersion: phase0Domains[kind], scope, restrictions: phase0Restrictions, body });
}
export const phase0Hash = (kind: Kind, value: unknown) => contractHash(phase0Domains[kind], parsePhase0(kind, value));
