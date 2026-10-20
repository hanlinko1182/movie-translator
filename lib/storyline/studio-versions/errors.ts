import "server-only";
import { StorylineContractError } from "../validation";
export type StudioVersionErrorCode = "R4_AUTH_REQUIRED" | "R4_SESSION_INVALID" | "R4_ORIGIN_REJECTED" | "R4_CSRF_REJECTED" |
  "R4_FORBIDDEN" | "R4_INVALID_INPUT" | "R4_DATABASE_UNSAFE" | "R4_NOT_FOUND" | "R4_PARENT_MISMATCH" |
  "R4_SOURCE_STALE" | "R4_REVISION_CONFLICT" | "R4_IDEMPOTENCY_CONFLICT" | "R4_TRANSACTION_FAILED";
export class StudioVersionError extends Error {
  constructor(readonly code: StudioVersionErrorCode) { super("Studio version request rejected"); this.name = "StudioVersionError"; }
  toJSON() { return { code: this.code, message: this.message }; }
}
export function rejectVersion(code: StudioVersionErrorCode): never { throw new StudioVersionError(code); }
export function sqlCode(error: unknown, depth = 0): string | undefined {
  if (!error || typeof error !== "object" || depth > 5) return;
  const value = error as Record<string, unknown>;
  for (const key of ["originalCode", "code"]) if (typeof value[key] === "string" && /^[0-9A-Z]{5}$/.test(value[key] as string) && value[key] !== "P2010") return value[key] as string;
  for (const key of ["meta", "cause", "driverAdapterError"]) { const code = sqlCode(value[key], depth + 1); if (code) return code; }
}
/** Static codes only: no SQL, paths, field values, tokens or driver details. */
export async function versionCall<T>(run: () => Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof StudioVersionError) throw error;
    if (error instanceof StorylineContractError) rejectVersion("R4_INVALID_INPUT");
    if (sqlCode(error) === "42501") rejectVersion("R4_FORBIDDEN");
    rejectVersion("R4_TRANSACTION_FAILED");
  }
}
