import "server-only";
import { constants, createWriteStream } from "node:fs";
import { access, chmod, lstat, mkdir, mkdtemp, realpath, link, rename, rm, unlink, open } from "node:fs/promises";
import { dirname, join, resolve, parse, relative } from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { StorageProvider } from "./provider";

export class StorageError extends Error {
  constructor(readonly code: "INVALID_STORAGE_KEY" | "STORAGE_UNAVAILABLE" | "STORAGE_FILE_MISSING") { super(code); this.name = "StorageError"; }
}
function missing(error: unknown) { return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT"; }
export class LocalStorageProvider implements StorageProvider {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  path(key: string) {
    if (!/^(?:movies\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:mp4|mkv|mov|webm)|renders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.mp4|audio\/[a-z0-9][a-z0-9_-]{0,127}\.wav)$/i.test(key)) throw new StorageError("INVALID_STORAGE_KEY");
    return resolve(this.root, key);
  }
  private async directories(path: string) {
    const parts: string[] = []; let current = resolve(path);
    while (current !== parse(current).root) { parts.push(current); current = dirname(current); }
    for (const part of parts.reverse()) { const item = await lstat(part); if (!item.isDirectory() || item.isSymbolicLink()) throw new StorageError("STORAGE_UNAVAILABLE"); }
  }
  async initialize() {
    // Check every existing ancestor before creating anything through it.
    let ancestor = this.root;
    while (true) { try { await lstat(ancestor); break; } catch (error) { if (!missing(error)) throw error; ancestor = dirname(ancestor); } }
    await this.directories(ancestor);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const directory of [this.root, join(this.root, "movies"), join(this.root, "audio")]) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await this.directories(directory); await chmod(directory, 0o700);
    }
    await this.check();
  }
  async check() {
    await this.directories(this.root);
    if (await realpath(this.root) !== this.root) throw new StorageError("STORAGE_UNAVAILABLE");
    for (const path of [this.root, join(this.root, "movies"), join(this.root, "audio")]) {
      await this.directories(path); const stat = await lstat(path);
      if ((stat.mode & 0o077) !== 0) throw new StorageError("STORAGE_UNAVAILABLE");
      await access(path, constants.R_OK | constants.W_OK | constants.X_OK);
    }
  }
  async localPath(key: string) {
    const path = this.path(key); await this.directories(dirname(path));
    let file; try { file = await lstat(path); } catch (error) { if (missing(error)) throw new StorageError("STORAGE_FILE_MISSING"); throw error; }
    if (!file.isFile() || file.isSymbolicLink() || await realpath(path) !== path) throw new StorageError("INVALID_STORAGE_KEY");
    return path;
  }
  async exists(key: string) { try { await this.localPath(key); return true; } catch (error) { if (error instanceof StorageError && error.code === "STORAGE_FILE_MISSING") return false; throw error; } }
  async stat(key: string) { const file = await lstat(await this.localPath(key)); return { size: file.size }; }
  // Keep the checked descriptor open so range metadata and bytes refer to the
  // same file even if a source is replaced after this request starts.
  async openFile(key: string) {
    await this.check();
    return this.openDescriptor(key);
  }
  private async openDescriptor(key: string) {
    const file = await open(await this.localPath(key), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await file.stat()).isFile()) throw new StorageError("INVALID_STORAGE_KEY");
      return file;
    } catch (error) { await file.close(); throw error; }
  }
  async open(key: string) {
    return (await this.openDescriptor(key)).createReadStream();
  }
  async resolveInput(key: string) { return { path: await this.localPath(key), cleanup: async () => {} }; }
  async put(key: string, input: Readable, options: { replace?: boolean } = {}) {
    const destination = this.path(key); await this.check();
    // Reject existing symlink/device targets even when replacement was requested.
    try { await this.localPath(key); if (!options.replace) throw new StorageError("INVALID_STORAGE_KEY"); }
    catch (error) { if (!(error instanceof StorageError && error.code === "STORAGE_FILE_MISSING")) throw error; }
    const temporary = await mkdtemp(join(dirname(destination), ".upload-"));
    const staged = join(temporary, "content");
    try {
      await pipeline(input, createWriteStream(staged, { flags: "wx", mode: 0o600 }));
      await this.directories(dirname(destination));
      if (options.replace) await rename(staged, destination);
      else await link(staged, destination); // exclusive, atomic publication on the same filesystem
    } finally { await rm(temporary, { recursive: true, force: true }); }
  }
  async delete(key: string) { try { await unlink(await this.localPath(key)); } catch (error) { if (!(error instanceof StorageError && error.code === "STORAGE_FILE_MISSING") && !missing(error)) throw error; } }
  // Render-only publication from an already verified same-volume scratch file.
  // The caller holds its job row lock and rechecks the live owner immediately
  // before this exclusive link. No large copy occurs inside that transaction.
  async publishRenderFile(key: string, source: string, beforePublish: () => Promise<boolean>) {
    if (!key.startsWith("renders/") || !/^render-attempts\/attempt-[a-zA-Z0-9]{6}\/output\.mp4$/.test(relative(this.root, source))) throw new StorageError("INVALID_STORAGE_KEY");
    const destination = this.path(key); await this.check();
    await this.directories(dirname(source)); await this.directories(dirname(destination));
    if (await realpath(source) !== source || !(await lstat(source)).isFile() || (await lstat(source)).isSymbolicLink()) throw new StorageError("INVALID_STORAGE_KEY");
    const file = await open(source, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await file.chmod(0o600); await file.sync(); } finally { await file.close(); }
    if (!await beforePublish()) throw new StorageError("STORAGE_UNAVAILABLE");
    await link(source, destination); // atomic/exclusive; output keys are never replaced
    const directory = await open(dirname(destination), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
}
