import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { array, id, integer, literal, record, text } from "../validation";
import { parseStoreScope, rejectStore, storeCapture, storeSame, type TimelineStoreScope } from "./contracts";
export type StoreAction = "read" | "create";
export type TimelineSessionFixture = { id: string; token: string; csrf: string; tenantId: string; principalId: string; expiresAtMs: number;
  grants: { scope: TimelineStoreScope; canRead: boolean; canCreate: boolean }[] };
export type VerifiedTimelineSession = { sessionId: string; tenantId: string; principalId: string; origin: string; csrfHash: string };
export type SyntheticTimelineAuthentication = Readonly<{ mode: "M702_DISPOSABLE_ONLY"; revokeForTest(id: string): void }>;
type Entry = { verify(request: unknown, scope: TimelineStoreScope, action: StoreAction): VerifiedTimelineSession };
const authorities = new WeakMap<SyntheticTimelineAuthentication, Entry>();
export const timelineCsrfHash = (s: string) => createHash("sha256").update(s).digest("hex");
/** Explicit server-owned test registry. It cannot authenticate any production route. */
export function createSyntheticTimelineAuthenticationForTest(value: { mode: "M702_DISPOSABLE_ONLY"; origin: string; sessions: TimelineSessionFixture[] }) {
  const r = record(storeCapture(value, 128 * 1024), ["mode", "origin", "sessions"], "timelineAuth");
  literal(r.mode, "M702_DISPOSABLE_ONLY", "timelineAuth.mode");
  const origin = text(r.origin, 256, "timelineAuth.origin"), url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) rejectStore("ORIGIN_REJECTED");
  const sessions = new Map<string, TimelineSessionFixture>(), ids = new Set<string>(), revoked = new Set<string>();
  for (const raw of array(r.sessions, 100, "timelineAuth.sessions", 1)) {
    const s = record(raw, ["id", "token", "csrf", "tenantId", "principalId", "expiresAtMs", "grants"], "timelineAuth.session");
    const token = text(s.token, 64, "timelineAuth.token"), csrf = text(s.csrf, 64, "timelineAuth.csrf");
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(csrf)) rejectStore("SESSION_INVALID");
    const session: TimelineSessionFixture = { id: id(s.id, "timelineAuth.id"), tenantId: id(s.tenantId, "timelineAuth.tenant"), principalId: id(s.principalId, "timelineAuth.principal"),
      token, csrf, expiresAtMs: integer(s.expiresAtMs, "timelineAuth.expiry", Number.MAX_SAFE_INTEGER), grants: array(s.grants, 100, "timelineAuth.grants").map(v => {
        const g = record(v, ["scope", "canRead", "canCreate"], "timelineAuth.grant"), scope = parseStoreScope(g.scope);
        if (typeof g.canRead !== "boolean" || typeof g.canCreate !== "boolean" || g.canCreate && !g.canRead || scope.tenantId !== s.tenantId) rejectStore("FORBIDDEN");
        return { scope, canRead: g.canRead, canCreate: g.canCreate };
      }) };
    if (sessions.has(token) || ids.has(session.id)) rejectStore("SESSION_INVALID");
    sessions.set(token, session); ids.add(session.id);
  }
  const authority = Object.freeze({ mode: "M702_DISPOSABLE_ONLY" as const, revokeForTest(id: string) { revoked.add(id); } });
  authorities.set(authority, { verify(request, scope, action) {
    if (!(request instanceof Request)) rejectStore("AUTH_REQUIRED");
    if (request.method !== (action === "create" ? "POST" : "GET") || request.url !== `${origin}/isolated-fixture` || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") !== "same-origin") rejectStore("ORIGIN_REJECTED");
    const cookies = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith("timeline_m702_session="));
    if (cookies.length !== 1) rejectStore("AUTH_REQUIRED");
    const session = sessions.get(cookies[0].slice("timeline_m702_session=".length));
    if (!session || revoked.has(session.id) || Date.now() >= session.expiresAtMs) rejectStore("SESSION_INVALID");
    const csrf = request.headers.get("x-timeline-m702-csrf") ?? "";
    if (action === "create" && (!/^[a-f0-9]{64}$/.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf)))) rejectStore("CSRF_REJECTED");
    if (session.tenantId !== scope.tenantId || !session.grants.some(g => storeSame(g.scope, scope) && g.canRead && (action === "read" || g.canCreate))) rejectStore("FORBIDDEN");
    return { sessionId: session.id, tenantId: session.tenantId, principalId: session.principalId, origin, csrfHash: timelineCsrfHash(session.csrf) };
  } });
  return authority;
}
export function verifyTimelineRequest(authentication: unknown, request: unknown, scope: TimelineStoreScope, action: StoreAction) {
  if (action !== "read" && action !== "create") rejectStore("FORBIDDEN");
  const entry = authentication && typeof authentication === "object" ? authorities.get(authentication as SyntheticTimelineAuthentication) : undefined;
  if (!entry) rejectStore("AUTH_REQUIRED"); return entry.verify(request, scope, action);
}
