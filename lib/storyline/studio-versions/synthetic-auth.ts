import "server-only";
import { timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../canonical";
import type { StoryTaskScope } from "../jobs/service-boundary";
import { taskScope } from "../jobs/service-boundary";
import { array, freeze, id, integer, literal, record, text } from "../validation";
import { rejectVersion } from "./errors";

export type SyntheticStudioSession = {
  sessionId: string; token: string; csrfToken: string; tenantId: string; principalId: string; expiresAt: number;
  grants: { scope: StoryTaskScope; canRead: boolean; canSave: boolean }[];
};
export type VerifiedStudioEditor = Readonly<{ sessionId: string; tenantId: string; principalId: string }>;
export type SyntheticStudioAuthentication = Readonly<{ mode: "DISPOSABLE_SYNTHETIC_ONLY"; revokeSessionForTest(sessionId: string): void }>;
type Entry = { verify(request: unknown, scope: StoryTaskScope | null, save: boolean): VerifiedStudioEditor };
const authorities = new WeakMap<object, Entry>();

/** Explicit synthetic session registry only. Not a cookie signer, production
 * login, fallback, request-supplied principal or trust in UI fixture props. */
export function createSyntheticStudioAuthenticationForTest(value: {
  mode: "DISPOSABLE_SYNTHETIC_ONLY"; allowedOrigin: string; sessions: SyntheticStudioSession[];
}): SyntheticStudioAuthentication {
  canonicalJson(value, 128 * 1024);
  const r = record(value, ["mode", "allowedOrigin", "sessions"], "authentication");
  literal(r.mode, "DISPOSABLE_SYNTHETIC_ONLY", "authentication.mode");
  const allowedOrigin = text(r.allowedOrigin, 256, "allowedOrigin"), url = new URL(allowedOrigin);
  if (url.origin !== allowedOrigin || !["http:", "https:"].includes(url.protocol)) rejectVersion("R4_ORIGIN_REJECTED");
  const sessions = new Map<string, SyntheticStudioSession>(), revoked = new Set<string>(), ids = new Set<string>();
  for (const raw of array(r.sessions, 100, "sessions", 1)) {
    const s = record(raw, ["sessionId", "token", "csrfToken", "tenantId", "principalId", "expiresAt", "grants"], "session");
    const token = text(s.token, 128, "session.token"), csrfToken = text(s.csrfToken, 128, "session.csrf");
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(csrfToken)) rejectVersion("R4_SESSION_INVALID");
    const session: SyntheticStudioSession = { sessionId: id(s.sessionId, "session.id"), token, csrfToken,
      principalId: id(s.principalId, "principalId"), tenantId: id(s.tenantId, "tenantId"), expiresAt: integer(s.expiresAt, "session.expiresAt", Number.MAX_SAFE_INTEGER),
      grants: array(s.grants, 100, "grants").map(raw => {
        const g = record(raw, ["scope", "canRead", "canSave"], "grant");
        if (typeof g.canRead !== "boolean" || typeof g.canSave !== "boolean" || g.canSave && !g.canRead) rejectVersion("R4_FORBIDDEN");
        return { scope: taskScope(g.scope), canRead: g.canRead, canSave: g.canSave };
      }) };
    if (sessions.has(token) || ids.has(session.sessionId)) rejectVersion("R4_SESSION_INVALID");
    ids.add(session.sessionId); sessions.set(token, structuredClone(session));
  }
  const authority = Object.freeze({ mode: "DISPOSABLE_SYNTHETIC_ONLY" as const,
    revokeSessionForTest(sessionId: string) { revoked.add(sessionId); } });
  authorities.set(authority, {
    verify(request, scope, save) {
      if (!(request instanceof Request)) rejectVersion("R4_AUTH_REQUIRED");
      if (request.method !== (save ? "POST" : "GET") || new URL(request.url).origin !== allowedOrigin ||
        request.headers.get("origin") !== allowedOrigin || request.headers.get("sec-fetch-site") !== "same-origin") rejectVersion("R4_ORIGIN_REJECTED");
      const cookies = (request.headers.get("cookie") ?? "").split(";").map(row => row.trim()).filter(row => row.startsWith("story_r4_test_session="));
      if (cookies.length !== 1) rejectVersion("R4_AUTH_REQUIRED");
      const token = cookies[0].slice("story_r4_test_session=".length), session = sessions.get(token);
      if (!session || revoked.has(session.sessionId) || session.expiresAt <= Date.now()) rejectVersion("R4_SESSION_INVALID");
      if (save) {
        const csrf = request.headers.get("x-story-r4-csrf") ?? "";
        if (!/^[a-f0-9]{64}$/.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrfToken))) rejectVersion("R4_CSRF_REJECTED");
      }
      if (scope && !session.grants.some(grant => canonicalJson(grant.scope) === canonicalJson(scope) && grant.canRead && (!save || grant.canSave))) rejectVersion("R4_FORBIDDEN");
      return freeze({ sessionId: session.sessionId, tenantId: session.tenantId, principalId: session.principalId });
    },
  });
  return authority;
}

export function verifyStudioRequest(authentication: unknown, request: unknown, scope: StoryTaskScope | null, save: boolean): VerifiedStudioEditor {
  const entry = authentication && typeof authentication === "object" ? authorities.get(authentication) : undefined;
  if (!entry) rejectVersion("R4_AUTH_REQUIRED");
  return entry.verify(request, scope, save);
}
export function assertSyntheticStudioAuthentication(authentication: unknown) {
  if (!authentication || typeof authentication !== "object" || !authorities.has(authentication)) rejectVersion("R4_AUTH_REQUIRED");
}
