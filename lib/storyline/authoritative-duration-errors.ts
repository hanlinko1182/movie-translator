export type AuthoritativeDurationErrorCode = "DURATION_AUTHORITY_INVALID" | "DURATION_INPUT_INVALID" | "DURATION_POLICY_MISMATCH" |
  "DURATION_REVISION_STALE" | "DURATION_OBSERVATION_STALE";
export class AuthoritativeDurationError extends Error {
  constructor(readonly code: AuthoritativeDurationErrorCode) { super(code); this.name = "AuthoritativeDurationError"; }
}
