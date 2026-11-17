const { chromium, devices } = require("playwright");
const { createServer } = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
let version = 1;
const root = path.resolve(__dirname, "..");
const server = createServer(async (req, res) => {
  try {
    let url = new URL(req.url, "http://localhost");
    const filename = path.resolve(
      root,
      "." + (url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!filename.startsWith(root + path.sep)) throw Error("path");
    let body = await readFile(filename);
    if (filename.endsWith("sw.js"))
      body = Buffer.from(
        body
          .toString()
          .replace("truecast-shell-v4", `truecast-shell-review-${version}`),
      );
    if (filename.endsWith("index.html"))
      body = Buffer.from(
        body.toString().replace(">4.1.1</span>", `>review-${version}</span>`),
      );
    const ext = path.extname(filename),
      types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
      };
    res.writeHead(200, {
      "Content-Type": types[ext] || "text/plain",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.TRUECAST_BROWSER_PATH
      ? { executablePath: process.env.TRUECAST_BROWSER_PATH }
      : {}),
  });
  try {
    const context = await browser.newContext({
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(await page.locator(".version-pill").innerText(), "review-1");
    await page.locator("#open-places").click();
    await page.locator("#city").fill("Keep this unfinished search");
    version = 2;
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r.update();
    });
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
    );
    assert.equal(await page.locator(".version-pill").innerText(), "review-1");
    assert.equal(
      await page.locator("#places-dialog").evaluate((n) => n.open),
      true,
    );
    assert.equal(
      await page.locator("#city").inputValue(),
      "Keep this unfinished search",
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    // A downloaded waiting update applies on the next startup, without requiring reinstallation.
    await page.waitForFunction(
      () => document.querySelector(".version-pill").textContent === "review-2",
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    assert.deepEqual(await page.evaluate(() => caches.keys()), [
      "truecast-shell-review-2",
    ]);
    assert.equal(
      await page.evaluate(async () => {
        const c = await caches.open("truecast-shell-review-2");
        return (await c.keys()).length;
      }),
      21,
    );
    version = 3;
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r.update();
    });
    await page.waitForFunction(
      async () => !!(await navigator.serviceWorker.getRegistration()).waiting,
    );
    await page.locator("[data-nav=settings]").click();
    await page.locator("#check-updates").click();
    await page.waitForFunction(
      () => document.querySelector(".version-pill").textContent === "review-3",
    );
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await page.locator(".version-pill").innerText(), "review-3");
    assert.equal(
      await page.evaluate(() => caches.keys().then((x) => x.length)),
      1,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS real service-worker upgrade: complete 21-file shell, no interrupted search, automatic next-launch update, manual apply and offline reopen",
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
