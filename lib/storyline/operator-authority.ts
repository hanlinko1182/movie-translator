import "server-only";
import { canonicalJson, contractHash } from "./canonical";
import type { Identity } from "./contracts";
import { HUMAN_VERIFICATION } from "./human-verification-contracts";
import { date, freeze, hash, id, record, text } from "./validation";
import { VerificationSecurityError } from "./verification-errors";

export type OperatorScope = Identity & { studioId: string };
export type OperatorAction = "VERIFY_SOURCE" | "REVOKE_VERIFICATION";
export type OperatorBinding = { scope: OperatorScope; action: OperatorAction; decisionHash: string };
export type OperatorAuditGrant = OperatorBinding & {
  providerId: string; subjectId: string; auditLabel: string;
  authenticatedAt: string; authorizedAt: string; expiresAt: string;
};
/** Installed by trusted server bootstrap only. The provider authenticates the opaque
 * server session and independently authorizes the exact scope/action/decision.
 * A display name, env flag, client body or AI assertion cannot implement this port.
 */
export type AuthenticatedOperatorProvider = {
  providerId: string;
  resolve(serverSession: unknown, binding: Readonly<OperatorBinding>): Promise<{
    subjectId: string; auditLabel: string; authenticatedAt: string; expiresAt: string;
  } | null>;
};
declare const authorityBrand: unique symbol;
declare const decisionBrand: unique symbol;
export type TrustedOperatorAuthority = { readonly [authorityBrand]: true };
export type ServerOperatorDecision = { readonly [decisionBrand]: true };
type State = { provider: AuthenticatedOperatorProvider | null; now: () => string; decisions: WeakMap<object, OperatorAuditGrant> };
const authorities = new WeakMap<object, State>();

/** No adapter is installed in the application. This is a server bootstrap port,
 * not an authorization factory for request handlers or caller-supplied providers. */
export function createStorylineOperatorAuthority(provider: AuthenticatedOperatorProvider | null, now: () => string): TrustedOperatorAuthority {
  const handle = Object.freeze({}) as TrustedOperatorAuthority;
  const installed = provider ? Object.freeze({ providerId: id(provider.providerId, "providerId"), resolve: provider.resolve.bind(provider) }) : null;
  authorities.set(handle, { provider: installed, now, decisions: new WeakMap() });
  return handle;
}
export function hasStorylineOperatorAuthority(authority: TrustedOperatorAuthority | null): boolean {
  return !!authority && !!authorities.get(authority)?.provider;
}
export async function authorizeStorylineOperator(authority: TrustedOperatorAuthority | null, session: unknown, value: OperatorBinding): Promise<ServerOperatorDecision> {
  try {
    const state = authority && authorities.get(authority);
    if (!state?.provider) throw new Error();
    const binding = freeze({ scope: { projectId: id(value.scope.projectId, "scope.projectId"), movieId: id(value.scope.movieId, "scope.movieId"),
      studioId: id(value.scope.studioId, "scope.studioId") }, action: value.action, decisionHash: hash(value.decisionHash, "decisionHash") });
    if (!["VERIFY_SOURCE", "REVOKE_VERIFICATION"].includes(binding.action)) throw new Error();
    const identity = await state.provider.resolve(session, binding);
    const row = record(identity, ["subjectId", "auditLabel", "authenticatedAt", "expiresAt"], "authenticatedOperator");
    const authorizedAt = date(state.now(), "authorizedAt"), authenticatedAt = date(row.authenticatedAt, "authenticatedAt");
    const sessionExpiry = date(row.expiresAt, "expiresAt");
    if (authenticatedAt > authorizedAt || sessionExpiry <= authorizedAt) throw new Error();
    const expiresAt = new Date(Math.min(Date.parse(sessionExpiry), Date.parse(authorizedAt) + HUMAN_VERIFICATION.decisionTtlMs)).toISOString();
    const grant = freeze({ ...binding, providerId: id(state.provider.providerId, "providerId"), subjectId: id(row.subjectId, "subjectId"),
      auditLabel: text(row.auditLabel, 160, "auditLabel"), authenticatedAt, authorizedAt, expiresAt });
    const token = Object.freeze({}) as ServerOperatorDecision;
    state.decisions.set(token, grant);
    return token;
  } catch { throw new VerificationSecurityError("OPERATOR_UNAUTHORIZED"); }
}
/** Single-use identity capability; cloned/deserialized objects cannot be consumed. */
export function consumeStorylineOperator(authority: TrustedOperatorAuthority, token: ServerOperatorDecision, expected: OperatorBinding): OperatorAuditGrant {
  const state = authorities.get(authority), grant = state?.decisions.get(token);
  if (state) state.decisions.delete(token);
  if (!state || !grant || canonicalJson(expected) !== canonicalJson({ scope: grant.scope, action: grant.action, decisionHash: grant.decisionHash })) {
    throw new VerificationSecurityError("VERIFICATION_AUTHORIZATION_INVALID");
  }
  const now = date(state.now(), "server.now");
  if (now < grant.authorizedAt || now > grant.expiresAt) throw new VerificationSecurityError("VERIFICATION_AUTHORIZATION_INVALID");
  return grant;
}
export const operatorDecisionHash = (value: unknown) => contractHash("story-operator-decision-v1", value);
