// Read-only source/build inspection; no application or fixture runtime import.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const forbidden = /maintenance-fake|createMaintenance(?:Gateway|Service|Authentication|EvidenceOrigin)ForTest|maintenance_m806|M806_PHASE1A_DISPOSABLE_ONLY|maintenance_m806_session|story-recap-fake-maintenance-/;
async function files(root, suffixes) {
  const out = [];
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const p = `${root}/${e.name}`;
    if (e.isDirectory()) out.push(...await files(p, suffixes)); else if (suffixes.some(s => p.endsWith(s))) out.push(p);
  }
  return out;
}
const production = (await Promise.all(["app", "components", "workers", "scripts"].map(p => files(p, [".ts", ".tsx", ".js", ".mjs"])))).flat();
const library = (await files("lib", [".ts", ".tsx"])).filter(p => !p.startsWith("lib/storyline/maintenance-fake/"));
const bundles = [...await files(".next/server", [".js"]), ...await files(".next/static", [".js"])];
const violations = [];
for (const p of [...production, ...library, ...bundles]) if (forbidden.test(await readFile(p, "utf8"))) violations.push(p);
const runtime = await files("lib/storyline/maintenance-fake", [".ts"]);
for (const p of runtime) {
  const s = await readFile(p, "utf8");
  if (!s.includes('import "server-only";') || /from ["'][^"']*(?:tests\/|render-execution-fake|voice\/|video-render|child_process|node:fs|openrouter|bullmq)/.test(s)) violations.push(p);
}
const result = { status: violations.length ? "FAIL" : "PASS", productionFiles: production.length, otherLibraryFiles: library.length,
  bundleFiles: bundles.length, runtimeFiles: runtime.length, buildPresent: bundles.length > 0, violations };
const target = process.argv[2];
if (target) { if (!resolve(target).startsWith(resolve("coverage") + "/")) throw Error("OWNED_RECEIPT_REQUIRED"); await writeFile(target, JSON.stringify(result, null, 2) + "\n"); }
console.log(JSON.stringify(result)); if (violations.length) process.exitCode = 1;
