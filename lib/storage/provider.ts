import type { Readable } from "node:stream";
export interface StorageProvider {
  put(key: string, input: Readable, options?: { replace?: boolean }): Promise<void>;
  exists(key: string): Promise<boolean>;
  stat(key: string): Promise<{ size: number }>;
  open(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  // A future object adapter stages a private temporary input and cleans it up.
  resolveInput(key: string): Promise<{ path: string; cleanup: () => Promise<void> }>;
}
