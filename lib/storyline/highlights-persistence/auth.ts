import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { array, id, integer, literal, record, text } from "../validation";
import { parseStoreScope, rejectStore, storeCapture, storeSame, type HighlightStoreScope } from "./contracts";
export type StoreAction = "read" | "create";
export type HighlightSessionFixture = { id: string; token: string; csrf: string; tenantId: string; principalId: string; expiresAtMs: number;
  grants: { scope: HighlightStoreScope; canRead: boolean; canCreate: boolean }[] };
export type VerifiedHighlightSession = { sessionId: string; tenantId: string; principalId: string; origin: string; csrfHash: string };
export type SyntheticHighlightAuthentication = Readonly<{ mode: "M602_DISPOSABLE_ONLY"; revokeForTest(id: string): void }>;
type Entry = { verify(request: unknown, scope: HighlightStoreScope, action: StoreAction): VerifiedHighlightSession };
const authorities = new WeakMap<SyntheticHighlightAuthentication, Entry>();
export const highlightCsrfHash = (s: string) => createHash("sha256").update(s).digest("hex");
/** Explicit server-owned test registry. It cannot authenticate any production route. */
export function createSyntheticHighlightAuthenticationForTest(value: { mode: "M602_DISPOSABLE_ONLY"; origin: string; sessions: HighlightSessionFixture[] }) {
  const r = record(storeCapture(value, 128 * 1024), ["mode", "origin", "sessions"], "highlightAuth");
  literal(r.mode, "M602_DISPOSABLE_ONLY", "highlightAuth.mode");
  const origin = text(r.origin, 256, "highlightAuth.origin"), url = new URL(origin);
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) rejectStore("ORIGIN_REJECTED");
  const sessions = new Map<string, HighlightSessionFixture>(), ids = new Set<string>(), revoked = new Set<string>();
  for (const raw of array(r.sessions, 100, "highlightAuth.sessions", 1)) {
    const s = record(raw, ["id", "token", "csrf", "tenantId", "principalId", "expiresAtMs", "grants"], "highlightAuth.session");
    const token = text(s.token, 64, "highlightAuth.token"), csrf = text(s.csrf, 64, "highlightAuth.csrf");
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(csrf)) rejectStore("SESSION_INVALID");
    const session: HighlightSessionFixture = { id: id(s.id, "highlightAuth.id"), tenantId: id(s.tenantId, "highlightAuth.tenant"), principalId: id(s.principalId, "highlightAuth.principal"),
      token, csrf, expiresAtMs: integer(s.expiresAtMs, "highlightAuth.expiry", Number.MAX_SAFE_INTEGER), grants: array(s.grants, 100, "highlightAuth.grants").map(v => {
        const g = record(v, ["scope", "canRead", "canCreate"], "highlightAuth.grant"), scope = parseStoreScope(g.scope);
        if (typeof g.canRead !== "boolean" || typeof g.canCreate !== "boolean" || g.canCreate && !g.canRead || scope.tenantId !== s.tenantId) rejectStore("FORBIDDEN");
        return { scope, canRead: g.canRead, canCreate: g.canCreate };
      }) };
    if (sessions.has(token) || ids.has(session.id)) rejectStore("SESSION_INVALID");
    sessions.set(token, session); ids.add(session.id);
  }
  const authority = Object.freeze({ mode: "M602_DISPOSABLE_ONLY" as const, revokeForTest(id: string) { revoked.add(id); } });
  authorities.set(authority, { verify(request, scope, action) {
    if (!(request instanceof Request)) rejectStore("AUTH_REQUIRED");
    if (request.method !== (action === "create" ? "POST" : "GET") || new URL(request.url).origin !== origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") !== "same-origin") rejectStore("ORIGIN_REJECTED");
    const cookies = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith("highlight_m602_session="));
    if (cookies.length !== 1) rejectStore("AUTH_REQUIRED");
    const session = sessions.get(cookies[0].slice("highlight_m602_session=".length));
    if (!session || revoked.has(session.id) || Date.now() >= session.expiresAtMs) rejectStore("SESSION_INVALID");
    const csrf = request.headers.get("x-highlight-m602-csrf") ?? "";
    if (action === "create" && (!/^[a-f0-9]{64}$/.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf)))) rejectStore("CSRF_REJECTED");
    if (session.tenantId !== scope.tenantId || !session.grants.some(g => storeSame(g.scope, scope) && g.canRead && (action === "read" || g.canCreate))) rejectStore("FORBIDDEN");
    return { sessionId: session.id, tenantId: session.tenantId, principalId: session.principalId, origin, csrfHash: highlightCsrfHash(session.csrf) };
  } });
  return authority;
}
export function verifyHighlightRequest(authentication: unknown, request: unknown, scope: HighlightStoreScope, action: StoreAction) {
  if (action !== "read" && action !== "create") rejectStore("FORBIDDEN");
  const entry = authentication && typeof authentication === "object" ? authorities.get(authentication as SyntheticHighlightAuthentication) : undefined;
  if (!entry) rejectStore("AUTH_REQUIRED"); return entry.verify(request, scope, action);
}
