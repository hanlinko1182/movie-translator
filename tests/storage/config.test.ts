import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { ConfigurationError, storageConfig, validateRuntime, type Environment } from "@/lib/env";
import { LocalStorageProvider, StorageError } from "@/lib/storage/local";

// Explicit synthetic environments only; never load the application's secrets,
// initialize its storage, access PostgreSQL/Redis, or start workers.
const privateRoot = join(tmpdir(), "movie-translator-config-fixture", "private-media");
const production: Environment = { NODE_ENV: "production", STORAGE_DRIVER: "local", LOCAL_STORAGE_ROOT: privateRoot };
function invalid(env: Environment, field: string) {
  assert.throws(() => storageConfig(env), error => {
    assert.ok(error instanceof ConfigurationError);
    assert.equal(error.field, field);
    assert.equal(error.message, `Invalid or missing configuration: ${field}`);
    return true;
  });
}

test("absolute private roots resolve identically in development and production", () => {
  assert.deepEqual(storageConfig(production), { driver: "local", root: privateRoot });
  assert.deepEqual(storageConfig({ ...production, NODE_ENV: "development" }), storageConfig(production));
  assert.deepEqual(storageConfig({ ...production, STORAGE_DRIVER: " local ", LOCAL_STORAGE_ROOT: ` ${privateRoot} ` }), storageConfig(production));
});

test("production requires explicit nonempty local driver and storage root", () => {
  for (const value of [undefined, "", " "]) {
    invalid({ ...production, STORAGE_DRIVER: value }, "STORAGE_DRIVER");
    invalid({ ...production, LOCAL_STORAGE_ROOT: value }, "LOCAL_STORAGE_ROOT");
  }
  for (const driver of ["s3", "LOCAL", "file"]) invalid({ ...production, STORAGE_DRIVER: driver }, "STORAGE_DRIVER");
});

test("relative development paths remain compatible but cannot become implicit production roots", () => {
  assert.deepEqual(storageConfig({ NODE_ENV: "development" }), { driver: "local", root: resolve("storage") });
  for (const path of ["storage", "./storage", "../private-media", "storage/../../private-media", "."]) {
    assert.equal(storageConfig({ NODE_ENV: "development", LOCAL_STORAGE_ROOT: path }).root, resolve(path));
    invalid({ ...production, LOCAL_STORAGE_ROOT: path }, "LOCAL_STORAGE_ROOT");
  }
  assert.equal(storageConfig({ ...production, LOCAL_STORAGE_ROOT: resolve("storage") }).root,
    storageConfig({ NODE_ENV: "development", LOCAL_STORAGE_ROOT: "storage" }).root);
});

test("public, build and dependency roots, including normalized traversal into them, stay forbidden", () => {
  invalid({ ...production, LOCAL_STORAGE_ROOT: resolve("/") }, "LOCAL_STORAGE_ROOT");
  for (const directory of ["public", ".next", "node_modules"]) {
    for (const path of [directory, `${directory}/private`, `storage/../${directory}/private`]) {
      invalid({ ...production, LOCAL_STORAGE_ROOT: resolve(path) }, "LOCAL_STORAGE_ROOT");
      invalid({ NODE_ENV: "development", LOCAL_STORAGE_ROOT: path }, "LOCAL_STORAGE_ROOT");
    }
    // Containment uses directory boundaries, not a matching string prefix.
    assert.equal(storageConfig({ ...production, LOCAL_STORAGE_ROOT: resolve(`${directory}-private`) }).root, resolve(`${directory}-private`));
  }
});

test("valid configuration never authorizes traversal or arbitrary absolute storage keys", () => {
  const storage = new LocalStorageProvider(storageConfig(production).root);
  for (const key of ["../secret", "/etc/passwd", "movies/../../secret.mp4", "movies/%2e%2e/secret.mp4", "movies/..\\secret.mp4"]) {
    assert.throws(() => storage.path(key), error => error instanceof StorageError && error.code === "INVALID_STORAGE_KEY");
  }
  assert.equal(storage.path("movies/00000000-0000-4000-8000-000000000001.mp4"), join(privateRoot, "movies", "00000000-0000-4000-8000-000000000001.mp4"));
});

test("production web/media/render runtime validation retains storage requirements without AI credentials", () => {
  const env = { ...production, DATABASE_URL: "postgresql://localhost/fixture", REDIS_URL: "redis://localhost:6379" };
  for (const role of ["web", "media", "render"] as const) {
    assert.doesNotThrow(() => validateRuntime(role, env));
    assert.throws(() => validateRuntime(role, { ...env, LOCAL_STORAGE_ROOT: "storage" }), error => error instanceof ConfigurationError && error.field === "LOCAL_STORAGE_ROOT");
    assert.throws(() => validateRuntime(role, { ...env, STORAGE_DRIVER: undefined }), error => error instanceof ConfigurationError && error.field === "STORAGE_DRIVER");
  }
});

test("configuration validation is separate from filesystem readiness and creates no directories", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "storage-config-"));
  try {
    const root = join(fixture, "not-created");
    assert.equal(storageConfig({ ...production, LOCAL_STORAGE_ROOT: root }).root, root);
    await assert.rejects(new LocalStorageProvider(root).check(), { code: "ENOENT" });
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test("Next production/development load order preserves exported overrides and local-file precedence", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "storage-env-loading-"));
  try {
    const require = createRequire(resolve("package.json"));
    const nextRequire = createRequire(require.resolve("next/package.json"));
    const loader = nextRequire.resolve("@next/env"); // Already bundled with the installed Next.js.
    const read = (mode: "production" | "development", exportedRoot?: string): { root: string; driver: string } => JSON.parse(execFileSync(process.execPath, ["-e", `
      const {loadEnvConfig}=require(process.argv[1]);
      loadEnvConfig(process.argv[2],process.env.NODE_ENV==="development",{info(){},error(){}});
      console.log(JSON.stringify({root:process.env.LOCAL_STORAGE_ROOT,driver:process.env.STORAGE_DRIVER}));
    `, loader, fixture], { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: mode, ...(exportedRoot ? { LOCAL_STORAGE_ROOT: exportedRoot } : {}) } }));
    await writeFile(join(fixture, ".env"), `STORAGE_DRIVER=local\nLOCAL_STORAGE_ROOT=${privateRoot}\n`);
    assert.deepEqual(read("production"), { driver: "local", root: privateRoot });
    assert.deepEqual(read("development"), { driver: "local", root: privateRoot });
    await writeFile(join(fixture, ".env.local"), "LOCAL_STORAGE_ROOT=storage\n");
    const overridden = read("production");
    assert.equal(overridden.root, "storage");
    invalid({ NODE_ENV: "production", LOCAL_STORAGE_ROOT: overridden.root, STORAGE_DRIVER: overridden.driver }, "LOCAL_STORAGE_ROOT");
    await writeFile(join(fixture, ".env.production.local"), `LOCAL_STORAGE_ROOT=${privateRoot}\n`);
    assert.equal(read("production").root, privateRoot);
    assert.equal(read("development").root, "storage");
    assert.equal(read("production", "/private/exported-fixture").root, "/private/exported-fixture");
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
