import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { actions, parseContext, same, reject, type Context, type Action } from "./contracts";
export type Session = Context & { id: string; principalId: string; token: string; csrf: string; origin: string; expiresAtMs: number; actions: Action[]; rootIds: string[] };
export type Authentication = Readonly<{ mode: "M806_PHASE1A_DISPOSABLE_ONLY" }>;
const authorities = new WeakMap<Authentication, (request: unknown, c: Context, a: Action) => Session>();
export const csrfHash = (v: string) => createHash("sha256").update(v).digest("hex");
export function newMaintenanceSessionForTest(context: Context, principalId: string, grants: Action[], rootIds: string[] = []): Session {
  return { ...parseContext(context), id: `session-${principalId}`, principalId, token: randomBytes(32).toString("hex"), csrf: randomBytes(32).toString("hex"),
    origin: "https://maintenance.m806.invalid", expiresAtMs: Date.now() + 3600000, actions: [...grants], rootIds: [...rootIds] };
}
export function createMaintenanceAuthenticationForTest(input: Session[]) {
  const sessions = structuredClone(input), revoked = new Set<string>(), authentication = Object.freeze({ mode: "M806_PHASE1A_DISPOSABLE_ONLY" as const });
  authorities.set(authentication, (r, context, action) => {
    if (!(r instanceof Request) || !actions.includes(action)) reject("AUTH_REQUIRED");
    const cookies = (r.headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith("maintenance_m806_session="));
    const session = cookies.length === 1 ? sessions.find(s => cookies[0] === `maintenance_m806_session=${s.token}`) : undefined;
    if (!session || revoked.has(session.id) || Date.now() >= session.expiresAtMs) reject("SESSION_INVALID");
    const read = action === "read" || action === "health";
    if (r.url !== `${session.origin}/isolated-maintenance` || r.method !== (read ? "GET" : "POST") || r.headers.get("origin") !== session.origin
      || r.headers.get("sec-fetch-site") !== "same-origin") reject("ORIGIN_REJECTED");
    if (!read && r.headers.get("x-maintenance-csrf") !== session.csrf) reject("CSRF_REJECTED");
    if (!same(parseContext(context), { namespace: session.namespace, scope: session.scope }) || !session.actions.includes(action)) reject("FORBIDDEN");
    return structuredClone(session);
  });
  return { authentication, revokeForTest: (id: string) => revoked.add(id) };
}
export function authenticate(auth: Authentication, r: unknown, c: Context, action: Action) {
  const verify = authorities.get(auth); if (!verify) reject("AUTH_REQUIRED"); return verify(r, c, action);
}
