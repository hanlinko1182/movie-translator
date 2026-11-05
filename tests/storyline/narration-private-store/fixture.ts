import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import type { TestContext } from "node:test";
import { canonicalJson } from "../../../lib/storyline/canonical";
import { createPrivateNarrationStore, PRIVATE_NARRATION as P } from "../../../lib/storyline/narration-private-store";
import { noOwnerClaims } from "../../../lib/storyline/narration-intake";
export { wav } from "../narration-intake/fixture";
import { wav } from "../narration-intake/fixture";

export async function fixture(t: TestContext) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "story-narration-store-owned-"));
  await fs.writeFile(path.join(parent, "ownership-marker"), "M10-03B synthetic fixtures only", { mode: 0o600, flag: "wx" });
  t.after(async () => {
    assert.equal(await fs.readFile(path.join(parent, "ownership-marker"), "utf8"), "M10-03B synthetic fixtures only");
    await fs.rm(parent, { recursive: true });
  });
  const sourcePath = path.join(parent, "synthetic.wav"); await fs.writeFile(sourcePath, wav(), { mode: 0o600, flag: "wx" });
  const config = { root: path.join(parent, "store"), repositoryRoot: process.cwd(), trust: "TRUSTED_LOCAL_OPERATOR" as const };
  const source = { authorization: "EXPLICIT_LOCAL_READ_ONLY" as const, authorizedPath: sourcePath, privateRoot: parent, repositoryRoot: process.cwd() };
  const store = await createPrivateNarrationStore(config);
  return { parent, sourcePath, source, config, store, import: () => store.importWav(source, noOwnerClaims),
    dir: (id: string) => path.join(config.root, "objects", id) };
}
export async function overwrite(file: string, bytes: Buffer | string) {
  await fs.chmod(file, 0o600); await fs.writeFile(file, bytes); await fs.chmod(file, 0o400);
}
/** Adversarial fixture-only resealing proves semantic validation survives a valid local MAC.
 * Reads only the newly owned fixture's generated LOCAL seal, never a provider credential. */
export async function reseal(root: string, id: string, edit: (m: Record<string, unknown>) => void) {
  const owner = JSON.parse(await fs.readFile(path.join(root, ".owner.json"), "utf8"));
  const dir = path.join(root, "objects", id), manifest = JSON.parse(await fs.readFile(path.join(dir, "manifest.json"), "utf8"));
  edit(manifest.metadata);
  const { mac: _mac, ...body } = manifest; void _mac;
  const sign = (domain: string, body: unknown) => createHmac("sha256", Buffer.from(owner.sealKey, "hex")).update(domain + "\n").update(canonicalJson(body)).digest("hex");
  const raw = canonicalJson({ ...body, mac: sign(P.manifestMac, body) });
  await overwrite(path.join(dir, "manifest.json"), raw);
  const cm = { schemaVersion: P.commit, storeId: owner.storeId, artifactId: id, manifestSha256: createHash("sha256").update(raw).digest("hex") };
  await overwrite(path.join(dir, "commit.json"), canonicalJson({ ...cm, mac: sign(P.commitMac, cm) }));
}
