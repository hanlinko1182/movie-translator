import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { test } from "node:test";

test("M9-05 Chromium: real disposable save/read/history, conflicts, recovery, session isolation at 1440/1024/390", { timeout: 180000 }, async () => {
  assert.ok(process.env.PLAYWRIGHT_MODULE, "Use installed Playwright; no skipped acceptance");
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const artifacts = await mkdtemp("/tmp/storyline-m9-save-browser-");
  const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/storyline/editor-saving/browser-server.fixture.ts", artifacts], {
    stdio: ["ignore", "pipe", "pipe", "ipc"], env: { ...process.env, DATABASE_URL: "postgresql://storyline_dummy:unused@127.0.0.1:1/storyline_unreachable" },
  });
  let diagnostic = "", browser; child.stderr.on("data", chunk => { diagnostic += chunk; });
  const lines = createInterface({ input: child.stdout });
  try {
    const boot = await Promise.race([once(lines, "line").then(([line]) => JSON.parse(line)), once(child, "exit").then(([code]) => { throw new Error(`Server exited ${code}: ${diagnostic}`); })]);
    const require = createRequire(import.meta.url), { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
    const compiled = await build({ entryPoints: ["tests/storyline/editor-saving/browser.fixture.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json", metafile: true,
      define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", __SAVE_BOOT__: JSON.stringify({ artifact: boot.artifact, target: boot.target, csrf: boot.csrf }) } });
    assert.ok(!Object.keys(compiled.metafile.inputs).some(p => /studio-versions\/(service|database|synthetic-auth)|generated\/prisma|adapter\.fixture/.test(p)), "No server authorities or fixture bootstrap in browser bundle");
    const css = (await Promise.all((await readdir(".next/static/css")).filter(n => n.endsWith(".css")).map(n => readFile(join(".next/static/css", n), "utf8")))).join("\n");
    assert.ok(css.length); await writeFile(join(artifacts, "style.css"), css); await writeFile(join(artifacts, "qa.js"), compiled.outputFiles[0].text);
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/brave.com/brave/brave", headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage(), errors = [], rejected = [], requests = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("request", r => requests.push({ url: r.url(), method: r.method() }));
    await page.route("**/*", route => new URL(route.request().url()).origin === boot.origin ? route.continue() : (rejected.push(route.request().url()), route.abort()));
    const url = `${boot.origin}/projects/${boot.target.scope.projectId}/recap?movieId=${boot.target.scope.movieId}&studio=script`;
    const editor = () => page.getByRole("textbox", { name: "Myanmar paragraph 1", exact: true });
    const button = name => page.getByRole("button", { name, exact: true });
    const panel = () => page.getByRole("region", { name: "Synthetic immutable version saving", exact: true });
    const savedText = () => page.getByRole("region", { name: "Saved version text", exact: true });
    const click = async name => { await button(name).click(); };
    const waitMessage = text => panel().getByText(text, { exact: true }).waitFor();
    const savedMessage = "Saved Version · Read-back verified. Human Approved: No.";
    const load = async () => { await click("Load saved versions"); await waitMessage("History refreshed. Local text is unchanged."); };
    const fault = async value => { await page.getByRole("combobox", { name: "Test fault" }).selectOption(value); await page.waitForFunction(value => document.querySelector('select[aria-label="Test fault"]').value === value, value); await page.waitForLoadState("networkidle"); };
    const text = "  မြန်မာစာကို ပြင်ဆင်ထားသည်။\nမူရင်းအထောက်အထားကို မပြောင်းလဲပါ။  ";
    const checks = [];
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(url); await load();
      const beforeLocal = requests.length; await editor().fill(text + width);
      for (const name of ["AI Review", "Voice", "Highlights", "Export", "Script"]) await page.getByRole("tab", { name, exact: true }).click();
      assert.equal(await editor().inputValue(), text + width);
      await page.getByRole("link", { name: "Saved Recap", exact: true }).click();
      await page.getByRole("link", { name: "Storyline Studio", exact: true }).click();
      assert.equal(await editor().inputValue(), text + width); assert.equal(requests.length, beforeLocal, "local edits and destination switches make zero requests");
      if (width === 390) { await button("Save New Version").focus(); await page.keyboard.press("Enter"); }
      else await click("Save New Version");
      await waitMessage(savedMessage);
      assert.ok((await savedText().textContent()).includes(text + width));
      assert.ok((await panel().textContent()).includes("Unsaved Draft: No"));
      assert.equal(await button("Save New Version").isDisabled(), true);
      assert.ok((await panel().textContent()).includes("Canonical content hash:"));
      assert.ok((await panel().textContent()).includes("Human Approved: No"));
      const versionButtons = panel().getByRole("button", { name: /^Preview saved version/ });
      await versionButtons.first().click(); await waitMessage("Saved version preview loaded. Editor text is unchanged.");
      const localEdit = "သိမ်းဆည်းမထားသော စာသား ဖြစ်သည်။"; await editor().fill(localEdit);
      const unchanged = requests.length; await click("Load selected version into editor");
      await click("Keep unsaved text"); assert.equal(await editor().inputValue(), localEdit);
      await click("Load selected version into editor"); await click("Discard unsaved text and load version");
      assert.notEqual(await editor().inputValue(), localEdit); assert.equal(requests.length, unchanged, "version confirmation uses an already authorized read; no writes");
      await click("Reset selected section"); await click("Discard local edits");
      assert.equal(await editor().inputValue(), boot.artifact.draft.payload.beats[0].narration[0].text);
      assert.ok((await panel().textContent()).includes("Unsaved Draft: Yes"), "reset to original differs from saved baseline");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflow`);
      await page.screenshot({ path: join(artifacts, `versions-${width}.png`), fullPage: true });
      checks.push({ width, exactRoundTrip: true, noOverflow: true });
    }
    // A rollback must retain the text and stable retry snapshot, with no version inserted.
    await page.goto(url); await load(); await editor().fill(text); await fault("rollback");
    await click("Save New Version"); await panel().getByRole("alert").waitFor();
    assert.equal(await editor().inputValue(), text); await fault("none");
    await click("Retry same save request"); await waitMessage(savedMessage);
    // A committed but lost response resolves to the same immutable version via retry.
    await editor().fill(text + " ထပ်မံပြင်ဆင်ထားသည်။"); await fault("lost-response");
    await click("Save New Version"); await panel().getByRole("alert").waitFor();
    await click("Retry same save request"); await waitMessage(savedMessage);
    // Competing actual PostgreSQL save after this editor's base revision.
    await editor().fill(text); await click("Save competing version");
    await page.getByText("Competing version saved", { exact: true }).waitFor();
    await click("Save New Version"); await panel().getByText(/Another version was saved/).waitFor();
    assert.equal(await editor().inputValue(), text); assert.equal(await button("Use refreshed history head").isDisabled(), true);
    await click("Refresh version history"); await waitMessage("History refreshed. Local text is unchanged.");
    await click("Use refreshed history head"); assert.equal(await editor().inputValue(), text);
    await click("Save New Version"); await waitMessage(savedMessage);
    // Origin rejection keeps the editor buffer and can be retried explicitly.
    await editor().fill(text + " မူရင်းရင်းမြစ်ကို စစ်ဆေးရန်လိုသည်။"); await fault("origin");
    await click("Save New Version"); await panel().getByText(/Request origin rejected/).waitFor(); assert.equal(await editor().inputValue(), text + " မူရင်းရင်းမြစ်ကို စစ်ဆေးရန်လိုသည်။");
    await fault("none"); await click("Retry same save request"); await waitMessage(savedMessage);
    // Session identity transitions remount all local/version state; read-only actor cannot save.
    await editor().fill(text); await page.getByRole("combobox", { name: "Test session" }).selectOption("reader");
    await button("Load saved versions").waitFor(); assert.notEqual(await editor().inputValue(), text); assert.equal(await savedText().count(), 0);
    await load(); await editor().fill(text); await click("Save New Version"); await panel().getByText(/permission denied/).waitFor(); assert.equal(await editor().inputValue(), text);
    await page.getByRole("combobox", { name: "Test session" }).selectOption("editor-b"); await button("Load saved versions").waitFor(); await load();
    await editor().fill(text); await fault("stale"); await click("Save New Version"); await panel().getByText(/authoritative source changed/).waitFor();
    assert.equal(await editor().inputValue(), text); await fault("none");
    // Scope/artifact transitions remove both local text and saved history.
    await click("Switch selected movie"); assert.equal(await editor().count(), 0); assert.equal(await panel().count(), 0);
    await click("Switch selected movie"); await button("Load saved versions").waitFor();
    await editor().fill(text); await click("Change artifact identity"); assert.notEqual(await editor().inputValue(), text); assert.equal(await savedText().count(), 0);
    const audit = await page.evaluate(async () => (await fetch("/test-control", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "audit" }) })).json());
    assert.equal(audit.originalImmutable, true); assert.equal(audit.noApprovalOrProviderSideEffects, true);
    assert.ok(audit.requests.some(r => r.code === "R4_REVISION_CONFLICT")); assert.ok(audit.requests.some(r => r.code === "R4_ORIGIN_REJECTED"));
    assert.ok(audit.requests.some(r => r.code === "R4_FORBIDDEN")); assert.ok(audit.requests.some(r => r.code === "R4_SOURCE_STALE"));
    assert.equal(await page.getByRole("button", { name: /Approve|Publish|Generate Voice/ }).count(), 0);
    assert.ok(requests.every(r => !r.url.includes("/api/"))); assert.deepEqual(errors, []); assert.deepEqual(rejected, []);
    const result = { checks, audit, errors, rejected, productionApiCalls: 0, providerCallsDuringEditing: 0, artifacts };
    await writeFile(join(artifacts, "results.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } finally {
    await browser?.close(); lines.close(); if (child.connected) child.send("close"); if (child.exitCode === null) await once(child, "exit");
    await writeFile(join(artifacts, "server-diagnostics.log"), diagnostic);
  }
});
