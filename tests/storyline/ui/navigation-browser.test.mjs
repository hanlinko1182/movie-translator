// Uses the existing external Playwright runtime; no dependency installation.
// Run the webpack build first for the actual application's CSS.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

test("Recap experiences, keyboard tabs, history, movie identity and responsive shell", { skip: !process.env.PLAYWRIGHT_MODULE, timeout: 90000 }, async () => {
  const require = createRequire(import.meta.url);
  const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const compiled = await build({ entryPoints: ["tests/storyline/ui/navigation-browser.fixture.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, tsconfig: "tsconfig.json" });
  const cssDirectory = ".next/static/css";
  const css = (await Promise.all((await readdir(cssDirectory)).filter((name) => name.endsWith(".css")).map((name) => readFile(join(cssDirectory, name), "utf8")))).join("\n");
  assert.ok(css.length, "Build first to verify the real application styles");
  const requests = [];
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/")) { requests.push({ method: req.method, url: req.url }); res.writeHead(500); res.end("Unexpected API request"); return; }
    res.setHeader("Content-Type", req.url === "/qa.js" ? "text/javascript" : req.url === "/style.css" ? "text/css" : "text/html");
    res.end(req.url === "/qa.js" ? compiled.outputFiles[0].text : req.url === "/style.css" ? css : '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  const artifacts = await mkdtemp("/tmp/recap-studio-navigation-");
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => {
      requests.push({ method: route.request().method(), url: route.request().url() });
      return route.fulfill({ status: 500, json: { error: { code: "UNEXPECTED_TEST_REQUEST" } } });
    });
    const url = `http://127.0.0.1:${server.address().port}/projects/synthetic/recap?movieId=older-selected-movie&view=review#recap-tab-evidence`;
    const workspaces = ["Script", "AI Review", "Voice", "Highlights", "Export"];
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(url);
      await page.getByRole("heading", { name: "Recap", exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Saved Recap", exact: true }).getAttribute("aria-current"), "page");
      for (const label of ["Recap Script", "Characters", "Relationships", "Evidence", "Scene List"]) {
        const tab = page.getByRole("tab", { name: label, exact: true }); await tab.click();
        assert.equal(await tab.getAttribute("aria-selected"), "true");
      }
      const retry = page.getByRole("button", { name: "Retry Generation", exact: true });
      assert.equal(await retry.isDisabled(), true);
      await page.getByRole("link", { name: "Storyline Studio", exact: true }).click();
      await page.getByRole("heading", { name: "Storyline Studio", exact: true }).waitFor();
      for (const label of workspaces) {
        await page.getByRole("tab", { name: label, exact: true }).click();
        const selected = page.getByRole("tab", { name: label, exact: true });
        await selected.waitFor(); assert.equal(await selected.getAttribute("aria-selected"), "true");
        assert.equal(await page.locator(`#${await selected.getAttribute("aria-controls")}`).count(), 1);
        assert.ok((await page.textContent("body")).includes("Movie ID: older-selected-movie"));
        const current = new URL(page.url());
        assert.equal(current.searchParams.get("movieId"), "older-selected-movie");
        assert.equal(current.searchParams.get("view"), "review"); assert.equal(current.hash, "#recap-tab-evidence");
        assert.equal(await page.getByText("Unavailable · Read-only shell", { exact: true }).isVisible(), true);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${label} overflow`);
        await page.screenshot({ path: join(artifacts, `${label.replaceAll(" ", "-")}-${width}.png`), fullPage: true });
      }
    }
    await page.getByRole("tab", { name: "Script", exact: true }).click();
    const script = page.getByRole("tab", { name: "Script", exact: true }); await script.focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: "AI Review", exact: true }).evaluate((el) => el === document.activeElement), true);
    assert.equal(await script.getAttribute("aria-selected"), "true", "manual activation does not navigate on arrow alone");
    await page.keyboard.press("Enter"); await page.getByRole("heading", { name: "No AI review receipt", exact: true }).waitFor();
    await page.getByRole("tab", { name: "AI Review", exact: true }).focus(); await page.keyboard.press("End");
    assert.equal(await page.getByRole("tab", { name: "Export", exact: true }).evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press("Home"); assert.equal(await script.evaluate((el) => el === document.activeElement), true);
    await page.keyboard.press(" "); await page.getByRole("heading", { name: "No Storyline script version", exact: true }).waitFor();
    await page.getByRole("tab", { name: "AI Review", exact: true }).click();
    await page.getByRole("link", { name: "Saved Recap", exact: true }).click();
    await page.getByRole("heading", { name: "Recap", exact: true }).waitFor(); assert.equal(new URL(page.url()).searchParams.has("studio"), false);
    await page.goBack(); await page.getByRole("heading", { name: "No AI review receipt", exact: true }).waitFor();
    await page.goForward(); await page.getByRole("heading", { name: "Recap", exact: true }).waitFor();
    // Refresh status is the only API request in this test, and remains GET.
    assert.deepEqual(requests, []);
    await page.getByRole("button", { name: "Refresh Status", exact: true }).click();
    await page.waitForFunction(() => !document.body.textContent.includes("Refreshing…"));
    assert.ok(requests.length); assert.ok(requests.every(({ method }) => method === "GET"));
    const before = requests.length;
    await page.goto(`${url.split("#")[0]}&studio=highlights&empty=1`);
    await page.getByRole("heading", { name: "No highlight plan", exact: true }).waitFor();
    assert.equal(await page.getByText("Source playback unavailable", { exact: true }).isVisible(), true);
    assert.equal(await page.getByText("No movie selected", { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole("link", { name: "Open Project Overview", exact: true }).isVisible(), true);
    assert.equal(requests.length, before); assert.deepEqual(errors, []);
    // A completed Saved Recap still exposes real legacy content in all five views.
    await page.goto(`${url.split("#")[0]}&completed=1`);
    await page.getByRole("button", { name: "Show recap section 1: စမ်းသပ် အပိုင်း", exact: true }).click();
    await page.getByRole("tab", { name: "Characters", exact: true }).click();
    await page.getByRole("heading", { name: "Fixture character", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Relationships", exact: true }).click();
    await page.getByRole("heading", { name: "Fixture character ↔ Fixture partner", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Evidence", exact: true }).click();
    const anchor = page.locator("#recap-context-panel summary").first(); await anchor.click();
    assert.equal(await page.locator("#recap-context-panel details[open]").count(), 1);
    await page.getByRole("tab", { name: "Scene List", exact: true }).click();
    assert.equal(await page.locator("#recap-context-panel").getByText("Scene 01", { exact: true }).isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "completed Myanmar content wraps at 390px");
    assert.equal(requests.length, before); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ responsive: [1440, 1024, 390], studioWorkspaces: workspaces, navigationApiRequests: 0, paidRequests: 0, artifacts }));
  } finally {
    await browser?.close(); await new Promise((resolve) => server.close(resolve));
  }
});
