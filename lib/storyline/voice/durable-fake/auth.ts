import "server-only";
import { randomBytes, createHash } from "node:crypto";
import type { Context } from "./contracts";
export const FAKE_ACTIONS = ["create", "observe", "validate", "finalize", "replay", "recovery", "gc"] as const;
export type Action = typeof FAKE_ACTIONS[number];
export type SessionFixture = Context & { id: string; principalId: string; csrf: string; origin: string; actions: Action[]; expiresAtMs: number };
export type SessionCapability = Readonly<{ kind: "M505_SYNTHETIC_SESSION"; toJSON(): never }>;
const owned = new WeakMap<SessionCapability, SessionFixture>();
export function createSyntheticDurableSessionForTest(fixture: SessionFixture) {
  if (fixture.expiresAtMs <= Date.now() || !fixture.actions.length || fixture.actions.some(a => !FAKE_ACTIONS.includes(a))) throw new Error("M505_SESSION");
  const captured = structuredClone(fixture);
  const capability: SessionCapability = Object.freeze({ kind: "M505_SYNTHETIC_SESSION", toJSON(): never { throw new Error("M505_NON_SERIALIZABLE"); } });
  owned.set(capability, captured); return capability;
}
export function newSyntheticSessionFixture(context: Context, principalId: string, actions: Action[] = [...FAKE_ACTIONS]): SessionFixture {
  return { ...context, id: `session-${randomBytes(16).toString("hex")}`, principalId, csrf: randomBytes(32).toString("hex"), origin: "http://m505.invalid", actions, expiresAtMs: Date.now()+120000 };
}
export const csrfHash = (value: string) => createHash("sha256").update(value).digest("hex");
export function resolveSyntheticSession(cap: SessionCapability, action: Action, request: Request) {
  const s = owned.get(cap);
  if (!s || !s.actions.includes(action) || Date.now()>=s.expiresAtMs || request.method!=="POST" || request.headers.get("origin")!==s.origin || request.headers.get("sec-fetch-site")!=="same-origin" || request.headers.get("x-csrf-token")!==s.csrf) throw new Error("M505_AUTH");
  return structuredClone(s);
}
