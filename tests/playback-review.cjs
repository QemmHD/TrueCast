const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const { epoch, forecast } = require("./fixtures.cjs");
const base = process.env.TRUECAST_URL || "http://127.0.0.1:8766/";
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const iso = (t) => new Date(t).toISOString();
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.TRUECAST_BROWSER_PATH
      ? { executablePath: process.env.TRUECAST_BROWSER_PATH }
      : {}),
  });
  try {
    const c = await browser.newContext({
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
        serviceWorkers: "block",
      }),
      p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => {
      console.error(e.stack);
      errors.push(e.message);
    });
    // Advance real animation time from the fixed source-fixture date.
    await p.clock.install({ time: new Date(epoch) });
    await p.addInitScript(() =>
      localStorage.setItem(
        "truecast-last",
        JSON.stringify({
          name: "New York",
          latitude: 40.7128,
          longitude: -74.006,
          country_code: "US",
        }),
      ),
    );
    let weatherCalls = 0,
      failed = false;
    const tileRequests = [];
    await p.route("https://api.open-meteo.com/**", (r) => {
      weatherCalls++;
      return r.fulfill({ json: forecast() });
    });
    await p.route("https://air-quality-api.open-meteo.com/**", (r) =>
      r.fulfill({ json: { current: { time: epoch / 1000, us_aqi: 22 } } }),
    );
    await p.route("https://api.weather.gov/**", (r) =>
      r.fulfill({ status: 404, json: {} }),
    );
    await p.route("https://tile.openstreetmap.org/**", (r) =>
      r.fulfill({ contentType: "image/png", body: tiny }),
    );
    await p.route("https://nowcoast.noaa.gov/**", (r) => {
      const u = new URL(r.request().url());
      if (u.searchParams.get("request") === "GetCapabilities")
        return r.fulfill({
          contentType: "application/xml",
          body: `<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>conus_base_reflectivity_mosaic</Name><Dimension name="time">${iso(epoch - 8 * 3600000)}/${iso(epoch - 300000)}/PT5M</Dimension></Layer></Layer></Capability></WMS_Capabilities>`,
        });
      return r.fulfill({ contentType: "image/png", body: tiny });
    });
    await p.route("https://mesonet.agron.iastate.edu/**", (r) => {
      if (r.request().url().endsWith(".json"))
        return r.fulfill({
          json: {
            model_init_utc: iso(epoch - 90 * 60000),
            model_forecast_utc: iso(epoch - 90 * 60000 + 18 * 3600000),
            forecast_minute: 1080,
          },
        });
      tileRequests.push(r.request().url());
      return r.fulfill(
        failed
          ? { status: 503, body: "unavailable" }
          : { contentType: "image/png", body: tiny },
      );
    });
    await p.goto(base);
    await p.waitForFunction(
      () => document.querySelectorAll(".hour").length > 10,
    );
    await p.locator("[data-nav=forecast]").click();
    await p.locator("#horizon").selectOption("144");
    await p.locator("#forecast-scrub").evaluate((n) => {
      n.value = 80;
      n.dispatchEvent(new Event("input"));
    });
    await p.waitForTimeout(100);
    const strip = await p.locator("#hours").evaluate((n) => ({
      ratio: n.scrollLeft / (n.scrollWidth - n.clientWidth),
      selected: n.querySelector("[aria-pressed=true]").dataset.index,
    }));
    assert.equal(strip.selected, "80");
    assert.ok(Math.abs(strip.ratio - 80 / 143) < 0.01, JSON.stringify(strip));
    await p.locator("#hours").evaluate((n) => {
      n.dispatchEvent(new WheelEvent("wheel", { deltaX: 100 }));
      n.scrollLeft = (n.scrollWidth - n.clientWidth) * 0.75;
    });
    await p.waitForFunction(
      () => Number(document.querySelector("#forecast-scrub").value) === 107,
    );
    const calls = weatherCalls;
    await p.evaluate(
      () => (window.originalHour = document.querySelector(".hour")),
    );
    await p.waitForFunction(
      (n) => window.originalHour === document.querySelector(".hour"),
      null,
    );
    await p.waitForTimeout(11200);
    assert.ok(weatherCalls > calls, "10-second checks did not run");
    assert.equal(
      await p.evaluate(
        () => window.originalHour === document.querySelector(".hour"),
      ),
      true,
      "identical refresh rebuilt hourly cards",
    );
    assert.equal(await p.locator("#forecast-scrub").inputValue(), "107");
    console.log(
      "PASS proportional forecast strip, reverse strip scrolling, 10-second polling and unchanged DOM/selection",
    );
    await p.locator("[data-nav=map]").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#radar-time").dataset.frameType === "observed",
    );
    assert.equal(
      await p.locator("[data-radar-window=both]").getAttribute("aria-pressed"),
      "true",
    );
    const range = await p.locator("#frame").evaluate((n) => ({
      min: +n.min,
      max: +n.max,
      count: +n.dataset.frameCount,
    }));
    assert.ok(
      range.min >= epoch - 6 * 3600000 && range.min <= epoch - 355 * 60000,
    );
    assert.equal(range.max, epoch + 6 * 3600000);
    assert.ok(range.count >= 94 && range.count <= 96);
    assert.equal(await p.locator("#radar-now-marker").isVisible(), true);
    await p.locator("[data-radar-window=future]").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#radar-time").dataset.frameType === "forecast",
    );
    assert.match(await p.locator("#map-source").innerText(), /HRRR.*Iowa/);
    assert.ok(tileRequests.some((u) => u.includes("REFD-F0105-202611161100")));
    await p.locator("#play").click();
    await p.waitForFunction(
      () =>
        [
          ...document.querySelectorAll(
            ".leaflet-weather-pane > .leaflet-layer",
          ),
        ].filter((n) => +n.style.opacity > 0 && +n.style.opacity < 0.75)
          .length >= 2,
    );
    await p.locator("#map-zoom-in").click();
    await p.waitForTimeout(500);
    assert.equal(
      await p.locator("#play").getAttribute("aria-label"),
      "Pause radar animation",
    );
    const before = await p.locator("#radar-time").getAttribute("data-valid-at");
    await p.waitForFunction(
      (t) => document.querySelector("#radar-time").dataset.validAt !== t,
      before,
      { timeout: 15000 },
    );
    await p.locator("#map-zoom-out").click();
    assert.equal(
      await p.locator("#play").getAttribute("aria-label"),
      "Pause radar animation",
    );
    await p.waitForTimeout(1000);
    assert.ok(
      (await p.locator(".leaflet-weather-pane > .leaflet-layer").count()) <= 4,
      "unbounded frame cache",
    );
    await p.locator("#play").click();
    console.log(
      "PASS default 6h+6h bar, explicit HRRR run, time advancement through zoom and bounded buffering",
    );
    // Frame failures must retain the displayed timestamp rather than report unseen imagery.
    const retained = await p
      .locator("#radar-time")
      .getAttribute("data-valid-at");
    failed = true;
    await p.locator("#frame").evaluate((n) => {
      n.value = n.max;
      n.dispatchEvent(new Event("input"));
    });
    await p.waitForFunction(() =>
      document
        .querySelector("#map-data-status")
        .textContent.includes("previous frame retained"),
    );
    assert.equal(
      await p.locator("#radar-time").getAttribute("data-valid-at"),
      retained,
    );
    console.log(
      "PASS missing future tiles keep the last verified image and timestamp",
    );
    await p.locator("[data-radar-window=both]").click();
    await p.route("https://geocoding-api.open-meteo.com/**", (r) =>
      r.fulfill({
        json: {
          results: [
            {
              name: "London",
              latitude: 51.5,
              longitude: -0.12,
              country_code: "GB",
              country: "United Kingdom",
            },
          ],
        },
      }),
    );
    await p.route("https://api.rainviewer.com/**", (r) =>
      r.fulfill({
        json: {
          host: "https://test-radar.invalid",
          radar: {
            past: Array.from({ length: 13 }, (_, i) => ({
              time: epoch / 1000 - 120 * 60 + i * 600,
              path: `/test-${i}`,
            })),
          },
        },
      }),
    );
    await p.route("https://test-radar.invalid/**", (r) =>
      r.fulfill({ contentType: "image/png", body: tiny }),
    );
    await p.route("https://maps.dwd.de/**", (r) =>
      r.fulfill({
        contentType: "application/xml",
        body: "<ServiceExceptionReport><ServiceException>Fixture unavailable</ServiceException></ServiceExceptionReport>",
      }),
    );
    await p.locator("[data-nav=today]").click();
    await p.locator("#open-places").click();
    await p.locator("#city").fill("London");
    await p.locator("#search button[type=submit]").click();
    await p.locator("#results button").first().click();
    await p.locator("[data-nav=map]").click();
    await p.waitForFunction(() =>
      document.querySelector("#map-source").textContent.includes("RainViewer"),
    );
    assert.match(
      await p.locator("#radar-availability").innerText(),
      /Global history is limited by RainViewer/,
    );
    assert.equal(
      await p.locator("#radar-time").getAttribute("data-frame-type"),
      "observed",
    );
    assert.equal(await p.locator("#coverage").isEnabled(), true);
    assert.ok(
      Number(await p.locator("#frame").getAttribute("max")) <= epoch,
      "US forecast leaked into global source fallback",
    );
    console.log(
      "PASS location switch discards US frames and labels limited global history and unavailable future source",
    );
    await p.screenshot({
      path: "/workspace/TrueCast-review/4.1-timeline-reviewed.png",
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS zero uncaught errors in playback and synchronization flows",
    );
    await c.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
