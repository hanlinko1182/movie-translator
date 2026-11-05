import "server-only";
import fs from "node:fs/promises";
import { constants as C } from "node:fs";
import path from "node:path";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { canonicalJson } from "../canonical";
import { freeze } from "../validation";
import { authorizePrivateWavInspection, measureNarrationWav, createOfflineNarrationRegistry, buildNarrationTimingPreview,
  INTAKE, type PrivateFileAuthorization, type NarrationCandidate } from "../narration-intake";
import { PRIVATE_NARRATION as P, artifactId, deny, exact, safe, type Owner, type StoredNarrationMetadata, type StoreConfiguration } from "./contracts";
import { config, directory, entries, inside, noLinks, readPrivate, same, syncDirectory, writeExclusive } from "./files";

const json = (v: unknown) => Buffer.from(canonicalJson(v, P.maxJsonBytes), "utf8");
const sha = (v: Buffer) => createHash("sha256").update(v).digest("hex");
const mac = (o: Owner, domain: string, body: unknown) => createHmac("sha256", Buffer.from(o.sealKey, "hex")).update(domain + "\n").update(json(body)).digest("hex");
function checkMac(o: Owner, domain: string, body: unknown, supplied: unknown) {
  if (typeof supplied !== "string" || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(mac(o, domain, body), "hex"))) deny("SEAL_MISMATCH");
}
function parseJson(b: Buffer): unknown { const value = JSON.parse(b.toString("utf8")); if (!json(value).equals(b)) deny("NONCANONICAL_MANIFEST"); return value; }
function metadata(c: NarrationCandidate, id: string, createdAt: string): StoredNarrationMetadata {
  const { candidateId: _candidateId, schemaVersion: _schemaVersion, ...rest } = c.metadata; void _candidateId; void _schemaVersion;
  return freeze({ ...rest, schemaVersion: P.artifact, artifactId: id, createdAt });
}
function date(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) deny("INVALID_CREATION_TIME");
  return value;
}
async function readOwner(c: StoreConfiguration): Promise<Owner> {
  const s = await directory(c.root); await directory(path.join(c.root, "objects"));
  const names = await entries(c.root, 3);
  if (!names.includes(".owner.json") || !names.includes("objects") || names.some(n => ![".owner.json", ".import.lock", "objects"].includes(n))) deny("ROOT_LAYOUT");
  const r = exact(parseJson(await readPrivate(path.join(c.root, ".owner.json"), P.maxJsonBytes)), ["schemaVersion", "storeId", "device", "inode", "sealKey"]);
  if (r.schemaVersion !== P.owner || typeof r.storeId !== "string" || !/^[a-f0-9]{32}$/.test(r.storeId) ||
    r.device !== String(s.dev) || r.inode !== String(s.ino) || typeof r.sealKey !== "string" || !/^[a-f0-9]{64}$/.test(r.sealKey)) deny("ROOT_IDENTITY");
  return r as Owner;
}
function compose(c: StoreConfiguration, owner: Owner, writable: boolean) {
  const objectRoot = path.join(c.root, "objects");
  async function fence() {
    const now = await readOwner(c); if (canonicalJson(now) !== canonicalJson(owner)) deny("ROOT_CHANGED");
  }
  async function inspect(id: string): Promise<{ metadata: StoredNarrationMetadata; candidate: NarrationCandidate }> {
    await fence(); const dir = path.join(objectRoot, artifactId(id)); await directory(dir);
    const names = await entries(dir, 3);
    if (!names.includes("commit.json")) deny("UNCOMMITTED_ARTIFACT");
    if (canonicalJson(names) !== canonicalJson(["audio.wav", "commit.json", "manifest.json"])) deny("ARTIFACT_LAYOUT");
    const raw = await readPrivate(path.join(dir, "manifest.json"), P.maxJsonBytes);
    const m = exact(parseJson(raw), ["schemaVersion", "storeId", "metadata", "mac"]);
    const { mac: supplied, ...body } = m; checkMac(owner, P.manifestMac, body, supplied);
    if (m.schemaVersion !== P.manifest || m.storeId !== owner.storeId) deny("MANIFEST_SCOPE");
    const stored = exact(m.metadata, ["schemaVersion", "artifactId", "createdAt", "measured", "provenance", "evidence", "providerReceipt",
      "nativeGatewayResponseIdentity", "scriptCoverage", "missingEvidence", "admissionBlockers", "restrictions"]);
    if (stored.artifactId !== id || stored.schemaVersion !== P.artifact) deny("ARTIFACT_IDENTITY");
    const commitRaw = await readPrivate(path.join(dir, "commit.json"), P.maxJsonBytes);
    const cm = exact(parseJson(commitRaw), ["schemaVersion", "storeId", "artifactId", "manifestSha256", "mac"]);
    const { mac: cmac, ...commitBody } = cm; checkMac(owner, P.commitMac, commitBody, cmac);
    if (cm.schemaVersion !== P.commit || cm.storeId !== owner.storeId || cm.artifactId !== id || cm.manifestSha256 !== sha(raw)) deny("COMMIT_IDENTITY");
    const audioBytes = await readPrivate(path.join(dir, "audio.wav"), INTAKE.maxFileBytes);
    const measured = measureNarrationWav(audioBytes);
    const candidate = createOfflineNarrationRegistry().register(measured, stored.provenance);
    const result = metadata(candidate, id, date(stored.createdAt));
    if (canonicalJson(result) !== canonicalJson(stored)) deny("MEASUREMENT_OR_EVIDENCE_MISMATCH");
    // Final fence: a replaced manifest/commit or root cannot yield a partial/successful response.
    if (!(await readPrivate(path.join(dir, "manifest.json"), P.maxJsonBytes)).equals(raw) ||
      !(await readPrivate(path.join(dir, "commit.json"), P.maxJsonBytes)).equals(commitRaw)) deny("MANIFEST_CHANGED");
    if (!(await readPrivate(path.join(dir, "audio.wav"), INTAKE.maxFileBytes)).equals(audioBytes)) deny("AUDIO_CHANGED");
    await fence(); return { metadata: result, candidate };
  }
  async function listing() {
    await fence(); const artifacts: StoredNarrationMetadata[] = [], unresolved: { artifactId: string; status: "UNCOMMITTED" }[] = [];
    for (const name of await entries(objectRoot, P.maxArtifacts)) {
      const id = artifactId(name), dir = path.join(objectRoot, id); await directory(dir);
      const names = await entries(dir, 3);
      if (!names.includes("commit.json")) { unresolved.push({ artifactId: id, status: "UNCOMMITTED" }); continue; }
      artifacts.push((await inspect(id)).metadata);
    }
    await fence(); return freeze({ artifacts, unresolved });
  }
  async function lock() {
    await fence(); const file = path.join(c.root, ".import.lock"), token = randomBytes(32), h = await fs.open(file, C.O_WRONLY | C.O_CREAT | C.O_EXCL | C.O_NOFOLLOW, 0o600).catch(() => deny("IMPORT_BUSY_OR_UNRESOLVED"));
    try { await h.writeFile(token); await h.sync(); } finally { await h.close(); }
    await syncDirectory(c.root); const identity = await fs.lstat(file, { bigint: true });
    return async () => {
      await fence(); const current = await fs.lstat(file, { bigint: true });
      if (!same(identity, current) || !(await readPrivate(file, 32, [0o600])).equals(token)) deny("LOCK_CHANGED");
      await fs.unlink(file); await syncDirectory(c.root);
    };
  }
  const reader = {
    lookup: (id: string) => safe(async () => (await inspect(artifactId(id))).metadata),
    list: () => safe(listing),
    preview: (id: string, claimedDuration?: unknown) => safe(async () => {
      const found = await inspect(artifactId(id));
      return freeze({ artifactId: id, timing: buildNarrationTimingPreview(found.candidate, claimedDuration) });
    }),
  };
  if (!writable) return Object.freeze(reader);
  return Object.freeze({ ...reader, importWav: (source: PrivateFileAuthorization, evidence: unknown) => safe(async () => {
    // M10-03A validates and captures the explicit local path authorization without widening its public contract.
    const s = exact(source, ["authorization", "authorizedPath", "privateRoot", "repositoryRoot"]);
    const capturedEvidence = JSON.parse(canonicalJson(evidence, INTAKE.maxMetadataBytes));
    if (s.repositoryRoot !== c.repositoryRoot || inside(c.root, s.authorizedPath as string)) deny("SOURCE_OVERLAP");
    const first = await authorizePrivateWavInspection(s as PrivateFileAuthorization).inspect();
    const bytes = await readPrivate(s.authorizedPath as string, INTAKE.maxFileBytes, [0o400, 0o600]);
    const measured = measureNarrationWav(bytes);
    if (canonicalJson(measured) !== canonicalJson(first)) deny("SOURCE_CHANGED");
    const candidate = createOfflineNarrationRegistry().register(measured, capturedEvidence), unlock = await lock();
    try {
      const existing = await listing(); if (existing.unresolved.length) deny("UNRESOLVED_ARTIFACT");
      const duplicate = existing.artifacts.find(m => m.measured.sha256 === measured.sha256);
      if (duplicate) {
        if (canonicalJson(duplicate.provenance) !== canonicalJson(candidate.metadata.provenance)) deny("DUPLICATE_EVIDENCE_CONFLICT");
        return duplicate;
      }
      if (existing.artifacts.length >= P.maxArtifacts) deny("ARTIFACT_LIMIT");
      const id = `na-${randomUUID()}`, dir = path.join(objectRoot, id); await fence();
      await fs.mkdir(dir, { mode: 0o700 }); await syncDirectory(objectRoot);
      await writeExclusive(path.join(dir, "audio.wav"), bytes);
      const copied = measureNarrationWav(await readPrivate(path.join(dir, "audio.wav"), INTAKE.maxFileBytes));
      if (canonicalJson(copied) !== canonicalJson(first)) deny("COPY_INTEGRITY");
      const result = metadata(createOfflineNarrationRegistry().register(copied, capturedEvidence), id, new Date().toISOString());
      const body = { schemaVersion: P.manifest, storeId: owner.storeId, metadata: result };
      const manifest = json({ ...body, mac: mac(owner, P.manifestMac, body) });
      await writeExclusive(path.join(dir, "manifest.json"), manifest); await syncDirectory(dir);
      if (!(await readPrivate(path.join(dir, "manifest.json"), P.maxJsonBytes)).equals(manifest)) deny("MANIFEST_CHANGED");
      await fence(); const commitBody = { schemaVersion: P.commit, storeId: owner.storeId, artifactId: id, manifestSha256: sha(manifest) };
      await writeExclusive(path.join(dir, "commit.json"), json({ ...commitBody, mac: mac(owner, P.commitMac, commitBody) }));
      await syncDirectory(dir); await syncDirectory(objectRoot);
      return (await inspect(id)).metadata;
    } finally { await unlock(); }
  }) });
}
/** No default root. Existing directories are never initialized/adopted, even after an interrupted create. */
export function createPrivateNarrationStore(configuration: StoreConfiguration) {
  return safe(async () => {
    const c = config(configuration); await noLinks(path.dirname(c.root)); await noLinks(c.repositoryRoot);
    await fs.mkdir(c.root, { mode: 0o700 }); const s = await directory(c.root);
    const owner: Owner = { schemaVersion: P.owner, storeId: randomBytes(16).toString("hex"), device: String(s.dev), inode: String(s.ino), sealKey: randomBytes(32).toString("hex") };
    await fs.mkdir(path.join(c.root, "objects"), { mode: 0o700 }); await syncDirectory(path.join(c.root, "objects"));
    await writeExclusive(path.join(c.root, ".owner.json"), json(owner));
    await syncDirectory(c.root); await syncDirectory(path.dirname(c.root)); await readOwner(c);
    return compose(c, owner, true) as ReturnType<typeof compose> & { importWav: (source: PrivateFileAuthorization, evidence: unknown) => Promise<StoredNarrationMetadata> };
  });
}
/** READ_ONLY by default; LOCAL_IMPORT is an explicit trusted-operator capability, never application authentication. */
export function openPrivateNarrationStore(configuration: StoreConfiguration, access: "LOCAL_IMPORT"): ReturnType<typeof createPrivateNarrationStore>;
export function openPrivateNarrationStore(configuration: StoreConfiguration, access?: "READ_ONLY"): Promise<Pick<Awaited<ReturnType<typeof createPrivateNarrationStore>>, "lookup" | "list" | "preview">>;
export function openPrivateNarrationStore(configuration: StoreConfiguration, access: "READ_ONLY" | "LOCAL_IMPORT" = "READ_ONLY") {
  return safe(async () => {
    if (!["READ_ONLY", "LOCAL_IMPORT"].includes(access)) deny("INVALID_ACCESS");
    const c = config(configuration), owner = await readOwner(c); return compose(c, owner, access === "LOCAL_IMPORT");
  });
}
