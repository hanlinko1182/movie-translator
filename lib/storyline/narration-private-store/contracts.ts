import "server-only";
import { canonicalJson } from "../canonical";
import { record } from "../validation";
import type { NarrationMetadata } from "../narration-intake";

export const PRIVATE_NARRATION = Object.freeze({ owner: "story-private-narration-owner-v1",
  manifest: "story-private-narration-manifest-v1", artifact: "story-private-narration-artifact-v1",
  commit: "story-private-narration-commit-v1", manifestMac: "story-private-narration-manifest-mac-v1",
  commitMac: "story-private-narration-commit-mac-v1", maxJsonBytes: 16384, maxArtifacts: 16 });
export type StoreConfiguration = Readonly<{ root: string; repositoryRoot: string; trust: "TRUSTED_LOCAL_OPERATOR" }>;
export type StoredNarrationMetadata = Readonly<Omit<NarrationMetadata, "candidateId" | "schemaVersion"> & {
  schemaVersion: typeof PRIVATE_NARRATION.artifact; artifactId: string; createdAt: string;
}>;
export type Owner = { schemaVersion: typeof PRIVATE_NARRATION.owner; storeId: string; device: string; inode: string; sealKey: string };
export class PrivateNarrationStoreError extends Error {
  constructor(readonly code: string) { super("Private offline narration store rejected"); this.name = "PrivateNarrationStoreError"; }
}
export function deny(code: string): never { throw new PrivateNarrationStoreError(code); }
export function exact(value: unknown, fields: readonly string[]): Record<string, unknown> {
  try { return record(JSON.parse(canonicalJson(value, PRIVATE_NARRATION.maxJsonBytes)), fields, "privateNarration"); }
  catch { return deny("INVALID_CONTRACT"); }
}
export function artifactId(value: unknown): string {
  if (typeof value !== "string" || !/^na-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) deny("INVALID_ARTIFACT_ID");
  return value;
}
export async function safe<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error instanceof PrivateNarrationStoreError) throw error;
    return deny("PRIVATE_STORE_IO_OR_VALIDATION_FAILED");
  }
}
