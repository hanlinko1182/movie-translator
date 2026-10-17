// Uses bundled Playwright and installed Chromium; installs no packages.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

test("R1–R3 synthetic presentation, evidence, local edits, identity isolation and responsive Studio", { timeout: 120000 }, async () => {
  assert.ok(process.env.PLAYWRIGHT_MODULE, "Set PLAYWRIGHT_MODULE to the existing external runtime; do not silently skip browser acceptance");
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const require = createRequire(import.meta.url);
  const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
  const artifact = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/storyline/ui/script-preview.fixture.ts"], { encoding: "utf8" }));
  const compiled = await build({ entryPoints: ["tests/storyline/ui/script-preview-browser.fixture.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", tsconfig: "tsconfig.json",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", __M9_FIXTURE__: JSON.stringify(artifact) } });
  const cssDir = ".next/static/css";
  const css = (await Promise.all((await readdir(cssDir)).filter(name => name.endsWith(".css")).map(name => readFile(join(cssDir, name), "utf8")))).join("\n");
  assert.ok(css.length, "Build first for the actual application CSS");
  const rejected = [];
  const path = `/projects/${artifact.source.payload.projectId}/recap`;
  const server = createServer((req, res) => {
    if (!["/qa.js", "/style.css", "/favicon.ico", path].includes(req.url?.split("?")[0])) { rejected.push(req.url); res.writeHead(500); res.end("Unexpected request"); return; }
    res.setHeader("Content-Type", req.url === "/qa.js" ? "text/javascript" : req.url === "/style.css" ? "text/css" : "text/html");
    res.end(req.url === "/qa.js" ? compiled.outputFiles[0].text : req.url === "/style.css" ? css : req.url === "/favicon.ico" ? "" : '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="icon" href="data:,"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const artifacts = await mkdtemp("/tmp/storyline-m9-recovery-browser-");
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/brave.com/brave/brave", headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", req => requests.push({ url: req.url(), method: req.method() }));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin === `http://127.0.0.1:${server.address().port}`) return route.continue();
      rejected.push(route.request().url()); return route.abort();
    });
    const url = `http://127.0.0.1:${server.address().port}${path}?movieId=${artifact.source.payload.movieId}&studio=script`;
    const editor = () => page.getByRole("textbox", { name: "Myanmar paragraph 1", exact: true });
    const section = number => page.getByRole("button", { name: new RegExp(`^Select section ${number}:`) });
    const tab = label => page.getByRole("tab", { name: label, exact: true });
    const selectFixture = value => page.getByRole("combobox", { name: "Fixture state" }).selectOption(value);
    const localText = "မြန်မာစာကို ပြင်ဆင်ကြည့်ရှုထားသည်။ မူရင်းအထောက်အထားကို မပြောင်းလဲပါ။";
    const checks = [];
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(url); await page.waitForLoadState("networkidle");
      const requestCount = requests.length;
      assert.equal(await page.getByText("Synthetic test only · Provisional", { exact: true }).isVisible(), true);
      await page.getByText("Exact source and candidate provenance", { exact: true }).click();
      assert.equal(await page.getByText(artifact.draft.draftHash, { exact: true }).isVisible(), true);
      assert.equal(await page.getByText(artifact.candidate.candidateHash, { exact: true }).isVisible(), true);
      const original = await editor().inputValue();
      await editor().fill(localText);
      assert.ok((await page.textContent("body")).includes("Unsaved local changes · 1 section"));
      assert.equal(await page.locator("p").filter({ hasText: localText }).count(), 2, "section preview and local preview use edited text");
      await page.getByRole("button", { name: "Collapse section 1", exact: true }).click();
      assert.equal(await section(1).getAttribute("aria-pressed"), "true");
      await page.getByRole("button", { name: "Expand section 1", exact: true }).click();
      await section(2).click();
      assert.equal(await section(2).getAttribute("aria-pressed"), "true");
      assert.ok((await page.textContent("body")).includes("Inferred claim"));
      assert.ok((await page.textContent("body")).includes("Observed basis"));
      assert.ok((await page.textContent("body")).includes("Uncertainty: COMPETING"));
      await tab("AI Review").click();
      assert.equal(await section(2).getAttribute("aria-pressed"), "true");
      assert.equal(await editor().count(), 0);
      await page.getByRole("button", { name: "competing-interpretation · Inferred", exact: true }).click();
      assert.ok((await page.getByRole("region", { name: "Selected finding" }).textContent()).includes("မိမိကိုယ်ကို ကာကွယ်လိုခြင်း"));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px evidence overflow`);
      await page.screenshot({ path: join(artifacts, `evidence-${width}.png`), fullPage: true });
      for (const label of ["Voice", "Highlights", "Export"]) {
        await tab(label).click(); assert.equal(await page.getByText("Unavailable · Read-only shell", { exact: true }).isVisible(), true);
      }
      await page.getByRole("link", { name: "Saved Recap", exact: true }).click();
      for (const label of ["Recap Script", "Characters", "Relationships", "Evidence", "Scene List"]) assert.equal(await tab(label).count(), 1);
      await page.getByRole("link", { name: "Storyline Studio", exact: true }).click();
      await section(1).click(); assert.equal(await editor().inputValue(), localText, "all destination switches preserve memory buffers");
      await page.getByRole("button", { name: "Reset selected section", exact: true }).click();
      await page.getByRole("button", { name: "Keep editing", exact: true }).click(); assert.equal(await editor().inputValue(), localText);
      await page.getByRole("button", { name: "Reset selected section", exact: true }).click();
      await page.getByRole("button", { name: "Discard local edits", exact: true }).click(); assert.equal(await editor().inputValue(), original);
      assert.equal(await page.getByText("No local changes", { exact: true }).isVisible(), true);
      await editor().fill("က".repeat(1200)); assert.equal((await editor().inputValue()).length, 1200);
      await editor().fill("က".repeat(1201)); assert.equal((await editor().inputValue()).length, 1200);
      assert.ok((await page.getByRole("alert").textContent()).includes("Section limit"));
      for (const name of ["Narration section 1 text", "Local preview text"]) {
        const region = page.getByRole("region", { name, exact: true });
        assert.equal(await region.getAttribute("tabindex"), "0", "long previews are keyboard focusable");
        assert.equal(await region.evaluate(el => el.scrollHeight > el.clientHeight), true, "full long text remains available in a scrollable preview");
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px script overflow`);
      await page.screenshot({ path: join(artifacts, `editor-${width}.png`), fullPage: true });
      assert.equal(requests.length, requestCount, "local editor, evidence, resets and destination switches make zero requests");
      checks.push({ width, localRequests: requests.length - requestCount });
    }
    // Each identity transition must discard old edits, selections, inspections and reset confirmations.
    const identityRequestCount = requests.length;
    await selectFixture("ready");
    for (const probe of ["source", "draft", "candidate", "movie"]) {
      await section(2).click(); await editor().fill(localText);
      await page.getByRole("button", { name: "Reset selected section", exact: true }).click();
      if (probe === "source") await page.getByRole("button", { name: "Change source revision", exact: true }).click();
      else if (probe === "movie") {
        await page.getByRole("button", { name: "Switch selected movie", exact: true }).click();
        assert.equal(await editor().count(), 0); assert.ok((await page.textContent("body")).includes("preview unavailable"));
        await page.getByRole("button", { name: "Switch selected movie", exact: true }).click();
      } else await selectFixture(probe);
      assert.equal(await section(1).getAttribute("aria-pressed"), "true");
      assert.equal(await page.getByText("No local changes", { exact: true }).isVisible(), true);
      assert.equal(await page.getByRole("group", { name: "Confirm local reset" }).count(), 0);
      assert.notEqual(await editor().inputValue(), localText);
      await selectFixture("ready");
    }
    await selectFixture("missing"); assert.ok((await page.textContent("body")).includes("Evidence reference unavailable"));
    assert.ok((await page.textContent("body")).includes("Character reference unavailable"));
    await section(2).click(); assert.ok((await page.textContent("body")).includes("Finding reference unavailable: competing-interpretation"));
    for (const [probe, text] of [["loading", "Loading synthetic preview"], ["empty", "No narration sections"], ["error", "could not be loaded"], ["unavailable", "preview unavailable"], ["stale", "Stale dependencies"]]) {
      await selectFixture(probe); assert.ok((await page.textContent("body")).includes(text));
    }
    await selectFixture("ready");
    // Keyboard activation and real accordion controls stay usable.
    await tab("Script").focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await tab("AI Review").evaluate(el => el === document.activeElement), true);
    await page.keyboard.press("Enter"); await page.getByRole("heading", { name: "Evidence review", exact: true }).waitFor();
    await section(2).focus(); await page.keyboard.press("Space"); assert.equal(await section(2).getAttribute("aria-pressed"), "true");
    await tab("Script").click(); await editor().fill(localText);
    assert.equal(requests.length, identityRequestCount, "identity changes, error states and keyboard review are also network-free");
    await page.reload(); assert.equal(await page.getByText("No local changes", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("Original fixture unchanged", { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: /Save|Approve|Publish|Generate Voice/i }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(rejected, []);
    assert.ok(requests.every(req => req.method === "GET" && !req.url.includes("/api/")));
    const result = { checks, originalImmutable: true, identityIsolation: ["movie", "source", "draft", "candidate"], localNetworkCalls: 0, apiCalls: 0, errors, artifacts };
    await writeFile(join(artifacts, "results.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
