import "server-only";

// Application issuance stays disabled after M1-E2B. The uninstalled server
// service requires authenticated authority, restricted roles and a pinned signer.
// A persisted row, valid hash or local audit label never proves human comparison.
export const STORYLINE_VERIFICATION_ISSUANCE_ENABLED = false as const;
