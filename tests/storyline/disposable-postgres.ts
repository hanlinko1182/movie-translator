import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { Client, type ClientConfig } from "pg";

const exec = promisify(execFile);
const bin = "/usr/lib/postgresql/18/bin";
const prefix = "movie-translator-storyline-m1e15-";
const markerName = "OWNED_BY_STORYLINE_M1E15_TEST.json";
const timeoutMs = 30_000;

async function command(name: "initdb" | "pg_ctl", args: string[]) {
  try {
    await exec(join(bin, name), args, {
      timeout: timeoutMs, maxBuffer: 512 * 1024,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8", NODE_ENV: "test" },
    });
  } catch (error) {
    const result = error as { code?: string | number; stderr?: string };
    // Do not print credentials, source files, application paths or raw logs.
    const diagnostic = result.stderr?.split("\n").find(line => /error|fatal|permission denied/i.test(line))?.replace(/\/tmp\/\S+/g, "<scratch>").slice(0, 240) ?? "no diagnostic";
    throw new Error(`${name} failed (${String(result.code ?? "unknown")}): ${diagnostic}`);
  }
}

export class DisposableStorylinePostgres {
  private started = false;
  private constructor(
    readonly root: string,
    readonly data: string,
    readonly socket: string,
    readonly name: string,
    readonly user: string,
    private readonly password: string,
    private readonly admin: string,
    private readonly adminPassword: string,
    readonly port: number,
    private readonly nonce: string,
  ) {}

  static async start() {
    const nonce = randomBytes(10).toString("hex");
    const root = await mkdtemp(join(tmpdir(), prefix));
    const data = join(root, "data"), socket = join(root, "socket");
    const admin = `m1e15_admin_${nonce}`, user = `m1e15_runner_${nonce}`;
    const name = `m1e15_db_${nonce}`;
    const password = randomBytes(32).toString("hex"), adminPassword = randomBytes(32).toString("hex");
    const port = randomInt(32000, 60000);
    const owned = new DisposableStorylinePostgres(root, data, socket, name, user, password, admin, adminPassword, port, nonce);
    try {
      await writeFile(join(root, markerName), JSON.stringify({ nonce, pid: process.pid, purpose: "storyline-m1e15" }), { mode: 0o600 });
      await mkdir(socket, { mode: 0o700 });
      const passwordFile = join(root, "initdb-password");
      await writeFile(passwordFile, `${adminPassword}\n`, { mode: 0o600 });
      try {
        await command("initdb", ["-D", data, "--encoding=UTF8", "--no-locale", `--username=${admin}`, `--pwfile=${passwordFile}`, "--auth-local=scram-sha-256", "--auth-host=scram-sha-256", "--no-instructions"]);
      } finally {
        await rm(passwordFile, { force: true });
      }
      // No TCP listener. The socket directory is inside an owned mode-0700 root.
      await chmod(socket, 0o700);
      await writeFile(join(data, "postgresql.conf"), `\nlisten_addresses = ''\nunix_socket_directories = '${socket}'\nunix_socket_permissions = 0700\nport = ${port}\nmax_connections = 32\nshared_buffers = '16MB'\n`, { flag: "a" });
      try {
        await command("pg_ctl", ["-D", data, "-l", join(root, "postgres.log"), "-w", "-t", "20", "start"]);
      } catch (error) {
        const log = await readFile(join(root, "postgres.log"), "utf8").catch(() => "");
        const line = log.split("\n").find(value => /FATAL:|ERROR:|could not|permission denied/i.test(value));
        const safeLine = line?.replace(/\/tmp\/\S+/g, "<scratch>").slice(0, 240);
        throw new Error(safeLine ? `${String(error)}; postgres: ${safeLine}` : String(error));
      }
      owned.started = true;
      const control = new Client(owned.config("postgres", admin, adminPassword));
      await control.connect();
      try {
        await owned.assertTarget(control, "postgres", admin);
        await control.query(`CREATE ROLE "${user}" LOGIN PASSWORD '${password}'`);
        await control.query(`CREATE DATABASE "${name}" OWNER "${user}" TEMPLATE template0 ENCODING 'UTF8'`);
      } finally {
        await control.end();
      }
      const runner = await owned.client();
      await runner.end();
      return owned;
    } catch (error) {
      await owned.stop();
      throw error;
    }
  }

  private config(database: string, user: string, password: string): ClientConfig {
    return { host: this.socket, port: this.port, database, user, password,
      connectionTimeoutMillis: 5_000, query_timeout: 10_000, statement_timeout: 10_000,
      application_name: "storyline-m1e15-disposable-test" };
  }

  /** For a Prisma adapter in this process only. Never serialize or log this value. */
  prismaAdapterConfig(): ClientConfig {
    return this.config(this.name, this.user, this.password);
  }

  /** Privileged access ONLY to this workflow's verified scratch database. */
  async securityAdministrator() {
    const client = new Client(this.config(this.name, this.admin, this.adminPassword));
    await client.connect();
    try { await this.assertTarget(client, this.name, this.admin, this.user); return client; }
    catch (error) { await client.end(); throw error; }
  }

  /** Credentials are generated in memory and never use the app datasource. */
  async restrictedLogin(group: "storyline_runtime" | "storyline_verification_issuer" | "storyline_admission_writer" | "storyline_checkpoint_worker" | "storyline_synthetic_issuer" | "storyline_outbox" | "storyline_m2_reader" | "storyline_fake_worker" | "storyline_m3_candidate_writer" | "storyline_m4_narration_reader" | "storyline_m4_narration_writer") {
    const prefix = { storyline_runtime: "m1_runtime", storyline_verification_issuer: "m1_issuer",
      storyline_admission_writer: "m2_admission", storyline_checkpoint_worker: "m2_checkpoint",
      storyline_synthetic_issuer: "m2_synthetic_issuer", storyline_outbox: "m2_outbox", storyline_m2_reader: "m2_reader",
      storyline_fake_worker: "m2_fake_worker", storyline_m3_candidate_writer: "m3_candidate", storyline_m4_narration_reader: "m4_narration", storyline_m4_narration_writer: "m4_writer" }[group];
    const user = `${prefix}_${randomBytes(10).toString("hex")}`;
    const password = randomBytes(32).toString("hex");
    const admin = await this.securityAdministrator();
    try { await admin.query(`CREATE ROLE "${user}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE "${group}" PASSWORD '${password}'`); }
    finally { await admin.end(); }
    return this.config(this.name, user, password);
  }

  async client() {
    const client = new Client(this.config(this.name, this.user, this.password));
    await client.connect();
    try {
      await this.assertTarget(client, this.name, this.user);
      await client.query("SET lock_timeout = '2s'; SET statement_timeout = '10s'");
      return client;
    } catch (error) {
      await client.end();
      throw error;
    }
  }

  private async assertTarget(client: Client, database: string, user: string, expectedOwner = user) {
    const result = await client.query<{
      database: string; user: string; data: string; socket: string; address: string | null;
      encoding: string; version: string; owner: string;
    }>(`SELECT current_database() AS database, current_user AS "user",
        ${database === "postgres" ? "current_setting('data_directory')" : "NULL::text"} AS data,
        ${database === "postgres" ? "current_setting('unix_socket_directories')" : "NULL::text"} AS socket,
        inet_server_addr()::text AS address,
        pg_encoding_to_char(d.encoding) AS encoding,
        current_setting('server_version') AS version,
        pg_get_userbyid(d.datdba) AS owner
      FROM pg_database d WHERE d.datname = current_database()`);
    const row = result.rows[0];
    assert.equal(row?.database, database);
    assert.equal(row.user, user);
    if (database === "postgres") {
      assert.equal(row.data, this.data);
      assert.equal(row.socket, this.socket);
    }
    assert.equal(row.address, null, "Test must connect through the private Unix socket");
    assert.equal(row.encoding, "UTF8");
    assert.equal(row.owner, expectedOwner);
    assert.match(row.version, /^18\./);
    assert.ok(database.startsWith("m1e15_db_") || database === "postgres");
  }

  async stop() {
    // Never remove a directory unless the exact current-process marker and
    // scratch prefix prove that this workflow created it.
    if (!basename(this.root).startsWith(prefix) || resolve(this.root) !== this.root || !this.root.startsWith(`${tmpdir()}/`)) return;
    let marker: { nonce?: string; pid?: number; purpose?: string };
    try { marker = JSON.parse(await readFile(join(this.root, markerName), "utf8")); }
    catch { return; }
    if (marker.nonce !== this.nonce || marker.pid !== process.pid || marker.purpose !== "storyline-m1e15" || await realpath(this.root) !== this.root) return;
    let running = this.started;
    try {
      await exec(join(bin, "pg_ctl"), ["-D", this.data, "status"], { timeout: 5_000, env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test" } });
      running = true;
    } catch { /* pg_ctl reports nonzero if no server owns this newly made data dir. */ }
    if (running) {
      await command("pg_ctl", ["-D", this.data, "-w", "-t", "20", "-m", "immediate", "stop"]);
      this.started = false;
    }
    await rm(this.root, { recursive: true, force: true });
  }
}
