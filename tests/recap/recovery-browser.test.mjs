// Opt-in browser QA using an existing Playwright runtime, not a new dependency.
// All API responses are synthetic. No application server, DB, queue or AI calls.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

test("failed Recap recovery browser flow and locked responsive layout", { skip: !process.env.PLAYWRIGHT_MODULE, timeout: 60000 }, async () => {
  const require = createRequire(import.meta.url);
  const { build } = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] }));
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
  const compiled = await build({ entryPoints: ["tests/recap/recovery-browser.fixture.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, tsconfig: "tsconfig.json" });
  const cssDirectory = ".next/static/css";
  const css = (await Promise.all((await readdir(cssDirectory)).filter((name) => name.endsWith(".css")).map((name) => readFile(join(cssDirectory, name), "utf8")))).join("\n");
  assert.ok(css.length, "Run the webpack build first to use the real application stylesheet");
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/")) { res.writeHead(500); res.end("Unexpected non-intercepted API request"); return; }
    res.setHeader("Content-Type", req.url === "/qa.js" ? "text/javascript" : req.url === "/style.css" ? "text/css" : "text/html");
    res.end(req.url === "/qa.js" ? compiled.outputFiles[0].text : req.url === "/style.css" ? css : '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/qa.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  const artifacts = await mkdtemp("/tmp/recap-recovery-browser-");
  try {
    const movieId = "older-selected-movie";
    const jobId = `recap-${movieId}-${"a".repeat(64)}`;
    const token = "1791697200000:1:1";
    const requests = [];
    let status = { jobId, state: "failed", attemptsMade: 1, failureToken: token, errorCode: "RECAP_INVALID_RESPONSE" };
    let rejectPost = false;
    const page = await browser.newPage();
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", async (route) => {
      const req = route.request(); requests.push({ method: req.method(), url: req.url() });
      assert.ok(req.url().includes(`/api/movies/${movieId}/recap`));
      if (req.method() === "POST") {
        assert.ok(req.url().endsWith("/generate/retry"));
        assert.deepEqual(req.postDataJSON(), { jobId, failureToken: status.failureToken, acknowledged: true });
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (rejectPost) { await route.fulfill({ status: 409, json: { error: { code: "RECAP_RETRY_STALE", message: "/private/path sk-SECRET" } } }); return; }
        status = { jobId, state: "waiting", attemptsMade: 0 };
      }
      const data = req.url().includes("/generate") ? status : { recap: {
        id: "synthetic-recap", stale: false, title: "Synthetic completed recap", summary: "Synthetic summary for browser QA.",
        sections: [], characterInsights: [], relationshipInsights: [], provider: "fixture", model: "fixture",
        strategy: "SINGLE_STAGE", runtimeMs: 1, modelCalls: 1, usage: null, characterContext: "CURRENT", updatedAt: "2026-10-11T00:00:00.000Z",
      } };
      await route.fulfill({ status: 200, json: { data } });
    });
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/projects/synthetic/recap?movieId=${movieId}`;
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto(url);
      const retry = page.getByRole("button", { name: "Retry Generation", exact: true });
      await retry.waitFor(); assert.equal(await retry.isDisabled(), true);
      assert.equal(requests.filter((request) => request.method === "POST").length, 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px overflow`);
      for (const label of ["Recap Script", "Characters", "Relationships", "Evidence", "Scene List"]) assert.equal(await page.getByRole("tab", { name: label, exact: true }).isVisible(), true);
      await page.screenshot({ path: join(artifacts, `recap-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "Refresh Status", exact: true }).click();
    await page.waitForFunction(() => !document.body.textContent.includes("Refreshing…"));
    assert.ok(requests.length > 0); assert.ok(requests.every((request) => request.method === "GET"));
    await page.getByRole("tab", { name: "Recap Script", exact: true }).focus(); await page.keyboard.press("ArrowRight");
    assert.equal(await page.getByRole("tab", { name: "Characters", exact: true }).getAttribute("aria-selected"), "true");
    await page.getByRole("tab", { name: "Recap Script", exact: true }).click();
    // Another operator's failure changes the version. Refresh must invalidate
    // an acknowledgement for the earlier failure without submitting anything.
    await page.getByRole("checkbox").check();
    status = { ...status, failureToken: "1791697201000:2:1" };
    await page.getByRole("button", { name: "Refresh Status", exact: true }).click();
    await page.waitForFunction(() => !document.body.textContent.includes("Refreshing…"));
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    assert.equal(await page.getByRole("button", { name: "Retry Generation", exact: true }).isDisabled(), true);
    rejectPost = true;
    await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Retry Generation", exact: true }).click();
    await page.getByText("The failed attempt changed; refresh status and confirm again before retrying").waitFor();
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    assert.doesNotMatch(await page.textContent("body"), /private\/path|sk-SECRET/);
    rejectPost = false; const postsBefore = requests.filter((request) => request.method === "POST").length;
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Retry Generation", exact: true }).evaluate((button) => { button.click(); button.click(); });
    await page.waitForFunction(() => document.querySelector("h1")?.parentElement?.parentElement?.textContent.includes("Generating"));
    assert.equal(requests.filter((request) => request.method === "POST").length, postsBefore + 1);
    status = { jobId, state: "active", attemptsMade: 0 };
    await page.getByRole("button", { name: "Refresh Status", exact: true }).click();
    await page.waitForFunction(() => !document.body.textContent.includes("Refreshing…"));
    status = { jobId, state: "failed", attemptsMade: 1, failureToken: "1791697205000:2:1", errorCode: "RECAP_INVALID_RESPONSE" };
    await page.getByRole("button", { name: "Retry Generation", exact: true }).waitFor();
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    assert.equal(await page.getByRole("button", { name: "Retry Generation", exact: true }).isDisabled(), true);
    await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Retry Generation", exact: true }).click();
    await page.waitForFunction(() => document.querySelector("h1")?.parentElement?.parentElement?.textContent.includes("Generating"));
    status = { jobId, state: "completed", attemptsMade: 1 };
    await page.getByRole("heading", { name: "Synthetic completed recap", exact: true }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Open Export", exact: true }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Retry Generation", exact: true }).count(), 0);
    const count = requests.filter((request) => request.method === "POST").length;
    await page.goto(`${url}&missing=1`); await page.getByRole("link", { name: "Open Transcription", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Retry Generation", exact: true }).count(), 0);
    assert.equal(requests.filter((request) => request.method === "POST").length, count);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ responsive: [1440, 1024, 390], explicitRetryPosts: count, artifacts, paidRequests: 0 }));
  } finally {
    await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
});
