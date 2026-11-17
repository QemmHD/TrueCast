const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const { forecast, epoch } = require("./fixtures.cjs");
const base = process.env.TRUECAST_URL || "http://127.0.0.1:8766/";
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const reference = Date.parse("2026-11-16T12:00Z");
const iso = (t) => new Date(t).toISOString();
function capabilities(layer, observed) {
  return `<?xml version="1.0"?><WMS_Capabilities xmlns="http://www.opengis.net/wms" version="1.3.0"><Capability><Layer><Layer><Name>${layer}</Name><Dimension name="time">${observed ? `${iso(reference - 6 * 3600000)}/${iso(reference)}/PT15M` : `${iso(reference)}/${iso(reference + 96 * 3600000)}/PT1H`}</Dimension>${observed ? "" : `<Dimension name="REFERENCE_TIME" default="${iso(reference)}">${iso(reference - 6 * 3600000)},${iso(reference)}</Dimension>`}</Layer></Layer></Capability></WMS_Capabilities>`;
}
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
    p.on("pageerror", (e) => errors.push(e.message));
    await p.clock.install({ time: new Date(epoch) });
    let imageMode = "normal",
      held = [],
      requests = [],
      pollenAvailable = true;
    await p.route("https://api.open-meteo.com/v1/forecast?*", (r) =>
      r.fulfill({ json: { ...forecast(), timezone: "Europe/London" } }),
    );
    await p.route("https://air-quality-api.open-meteo.com/**", (r) => {
      if (!r.request().url().includes("hourly="))
        return r.fulfill({
          json: { current: { time: epoch / 1000, us_aqi: 20 } },
        });
      const times = Array.from(
          { length: 72 },
          (_, i) => reference / 1000 + i * 3600,
        ),
        hourly = {
          time: times,
          us_aqi: times.map((_, i) => (i === 0 ? 0 : 20 + i)),
          pm2_5: times.map(() => 3.5),
          pm10: times.map(() => 7),
          ozone: times.map(() => 30),
          nitrogen_dioxide: times.map(() => 2),
          dust: times.map(() => 0),
        };
      for (const key of [
        "grass",
        "birch",
        "alder",
        "mugwort",
        "olive",
        "ragweed",
      ])
        hourly[key + "_pollen"] = times.map(() => (pollenAvailable ? 0 : null));
      return r.fulfill({ json: { timezone: "Europe/London", hourly } });
    });
    await p.route("https://api.weather.gov/points/**", (r) =>
      r.fulfill({ status: 404, json: {} }),
    );
    await p.route("https://api.rainviewer.com/**", (r) =>
      r.fulfill({
        json: {
          host: "https://test-radar.invalid",
          radar: {
            past: [
              { time: Math.floor(epoch / 1000) - 600, path: "/test-only" },
            ],
          },
        },
      }),
    );
    await p.route("https://test-radar.invalid/**", (r) =>
      r.fulfill({ contentType: "image/png", body: tiny }),
    );
    await p.route("https://tile.openstreetmap.org/**", (r) =>
      r.fulfill({ contentType: "image/png", body: tiny }),
    );
    async function mapRoute(route) {
      const url = new URL(route.request().url()),
        params = url.searchParams,
        request = params.get("request");
      if (request === "GetCapabilities") {
        const observed = url.hostname === "nowcoast.noaa.gov";
        const layer = observed
          ? url.pathname.includes("lightning")
            ? "lightning_detection:ldn_lightning_strike_density"
            : "satellite:global_longwave_imagery_mosaic"
          : url.pathname.split("/").at(-2);
        return route.fulfill({
          contentType: "application/xml",
          body: capabilities(layer, observed),
        });
      }
      if (request === "GetMap") {
        requests.push({
          layer: params.get("layers"),
          time: Date.parse(params.get("time")),
          run: Date.parse(params.get("dim_reference_time")),
        });
        // DWD advertises 3h slots for this product but only serves native 6h images.
        if (
          params.get("layers").endsWith("TOTPREC06H") &&
          (Date.parse(params.get("time")) - reference) % 21600000 !== 0
        )
          return route.fulfill({
            contentType: "application/xml",
            body: '<ServiceExceptionReport><ServiceException code="InvalidDimensionValue" locator="time">No matching time</ServiceException></ServiceExceptionReport>',
          });
        if (imageMode === "pending") {
          held.push(route);
          return;
        }
        if (imageMode === "failure")
          return route.fulfill({
            contentType: "application/xml",
            body: "<ServiceExceptionReport><ServiceException>Test unavailable</ServiceException></ServiceExceptionReport>",
          });
        return route.fulfill({ contentType: "image/png", body: tiny });
      }
      return route.fulfill({ contentType: "image/png", body: tiny });
    }
    await p.route("https://maps.dwd.de/**", mapRoute);
    await p.route("https://nowcoast.noaa.gov/**", mapRoute);
    await p.goto(base, { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      () => document.querySelectorAll(".day").length === 16,
    );
    await p.addStyleTag({
      content: ":root{--safe-top:59px;--safe-bottom:34px}",
    });
    await p.locator("#hero-outlook").click();
    await p.waitForFunction(() => document.body.dataset.screen === "forecast");
    assert.equal(await p.locator("#daily-view").isVisible(), true);
    assert.equal(await p.locator(".day").count(), 16);
    await p.locator("[data-nav=today]").click();
    await p.locator(".preview-hour").nth(2).click();
    await p.waitForFunction(() => document.body.dataset.screen === "forecast");
    assert.equal(await p.locator("#hourly-view").isVisible(), true);
    console.log(
      "PASS 16-day outlook is directly discoverable and hourly preview returns to the correct forecast view",
    );
    await p.locator("[data-nav=today]").click();
    await p.locator("#hero-future-map").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#weather-time").dataset.validAt &&
        !document.querySelector("#weather-refresh").disabled,
    );
    assert.equal(
      await p.locator("[data-layer=forecast]").getAttribute("aria-pressed"),
      "true",
    );
    let displayed = Number(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
    );
    assert.ok(displayed > epoch);
    assert.ok(
      requests.some(
        (r) =>
          r.layer.endsWith("TOTPREC06H") &&
          r.time === displayed &&
          r.run === reference,
      ),
    );
    assert.match(await p.locator("#weather-time-kind").innerText(), /FUTURE/);
    assert.match(
      await p.locator("#weather-legend").innerText(),
      /6H TOTAL · IN/,
    );
    await p.clock.fastForward(500);
    await p.locator("#weather-frame").evaluate((n) => {
      n.value = 3;
      n.dispatchEvent(new Event("input"));
    });
    await p.waitForFunction(
      (t) =>
        Number(document.querySelector("#weather-time").dataset.validAt) > t,
      displayed,
    );
    displayed = Number(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
    );
    console.log(
      "PASS future map requests use a future valid time and explicit model run; timeline loads another real image",
    );
    // Exercise actual playback, including wraparound and movement, rather than only scrubbing.
    await p.locator("#weather-frame").evaluate((n) => {
      n.value = n.max;
      n.dispatchEvent(new Event("input"));
    });
    await p.waitForFunction(
      (t) =>
        Number(document.querySelector("#weather-time").dataset.validAt) > t,
      displayed,
    );
    const finalFrame = Number(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
    );
    await p.locator("#weather-play").click();
    await p.waitForFunction(
      (t) =>
        Number(document.querySelector("#weather-time").dataset.validAt) < t,
      finalFrame,
    );
    const loopedFrame = Number(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
    );
    await p.locator("#map-zoom-in").click();
    assert.equal(
      await p.locator("#weather-play").getAttribute("aria-label"),
      "Pause weather map timeline",
    );
    await p.waitForFunction(
      (t) =>
        Number(document.querySelector("#weather-time").dataset.validAt) > t,
      loopedFrame,
    );
    await p.locator("#weather-play").click();
    await p.waitForTimeout(500);
    const pausedFrame = await p
      .locator("#weather-time")
      .getAttribute("data-valid-at");
    await p.waitForTimeout(1200);
    assert.equal(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
      pausedFrame,
    );
    assert.ok(
      requests
        .filter((r) => r.layer.endsWith("TOTPREC06H"))
        .every((r) => (r.time - r.run) % 21600000 === 0),
    );
    console.log(
      "PASS future precipitation play advances, loops, survives zoom and pauses using only valid six-hour frames",
    );
    imageMode = "pending";
    await p.locator("[data-map-product=temperature]").click();
    await p.waitForFunction(
      () => document.querySelector("#weather-refresh").disabled,
    );
    for (let wait = 0; !held.length && wait < 100; wait++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(held.length, "pending map request was started");
    assert.match(
      await p.locator("#weather-time-kind").innerText(),
      /PRECIPITATION/,
    );
    assert.match(await p.locator("#weather-legend").innerText(), /6H TOTAL/);
    imageMode = "normal";
    await held.shift().fulfill({ contentType: "image/png", body: tiny });
    await p.waitForFunction(
      () =>
        document
          .querySelector("#weather-time-kind")
          .textContent.includes("TEMPERATURE") &&
        !document.querySelector("#weather-refresh").disabled,
    );
    assert.match(await p.locator("#weather-legend").innerText(), /°F/);
    await p.locator("#weather-map-info").click();
    assert.match(await p.locator("#detail-content").innerText(), /-76 °F/);
    assert.equal(await p.locator(".map-palette > div").count(), 22);
    await p.locator("#close-detail").click();
    const temperatureTime = await p
      .locator("#weather-time")
      .getAttribute("data-valid-at");
    imageMode = "failure";
    await p.locator("[data-map-product=pressure]").click();
    await p.waitForFunction(() =>
      document
        .querySelector("#map-data-status")
        .textContent.includes("still showing"),
    );
    assert.match(
      await p.locator("#weather-time-kind").innerText(),
      /TEMPERATURE/,
    );
    assert.equal(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
      temperatureTime,
    );
    assert.equal(
      await p
        .locator("[data-map-product=temperature]")
        .getAttribute("aria-pressed"),
      "true",
    );
    console.log(
      "PASS pending/failed product switches keep the prior image, product legend and timestamp truthful",
    );
    imageMode = "normal";
    await p.clock.fastForward(61000);
    await p.locator("[data-map-product=wind]").click();
    await p.waitForFunction(
      () =>
        document
          .querySelector("#weather-time-kind")
          .textContent.includes("SURFACE WIND") &&
        !document.querySelector("#weather-refresh").disabled,
    );
    await p.locator("[data-map-product=pressure]").click();
    await p.waitForFunction(
      () =>
        document
          .querySelector("#weather-time-kind")
          .textContent.includes("PRESSURE") &&
        !document.querySelector("#weather-refresh").disabled,
    );
    const beforePan = requests.length;
    const movedRequest = p.waitForRequest(
      (request) => request.url().includes("request=GetMap"),
      { timeout: 10000 },
    );
    await p.locator("#map-zoom-in").click();
    await p.clock.fastForward(1000);
    await movedRequest;
    await p.waitForFunction(() =>
      [...document.querySelectorAll(".leaflet-image-layer")].some(
        (img) => img.complete && img.naturalWidth > 0,
      ),
    );
    assert.ok(
      requests.length > beforePan,
      "zooming should request the same time for the new viewport",
    );
    await p.locator("#weather-map-info").click();
    assert.match(await p.locator("#detail-content").innerText(), /0.25°/);
    await p.locator("#close-detail").click();
    await p.locator("#weather-frame").evaluate((n) => {
      n.value = n.max;
      n.dispatchEvent(new Event("input"));
    });
    await p.waitForFunction(
      (t) =>
        Number(document.querySelector("#weather-time").dataset.validAt) > t,
      Number(temperatureTime),
    );
    const pointTime = Number(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
    );
    await p.locator("#map").click({ position: { x: 110, y: 200 } });
    await p.locator("#point-forecast").click();
    await p.waitForFunction(() => document.body.dataset.screen === "forecast");
    assert.equal(
      await p.locator("#selected-date").getAttribute("data-valid-at"),
      String(pointTime / 1000),
    );
    assert.equal(await p.locator("#horizon").inputValue(), "144");
    assert.equal(await p.locator("#hourly-view").isVisible(), true);
    console.log(
      "PASS map-pin forecast keeps the farthest map time, including the 72-hour boundary",
    );
    await p.locator("[data-nav=map]").click();
    await p.locator("[data-layer=lightning]").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#weather-time").dataset.validAt &&
        !document.querySelector("#weather-refresh").disabled,
    );
    assert.match(await p.locator("#weather-time-kind").innerText(), /OBSERVED/);
    assert.ok(
      Number(await p.locator("#weather-time").getAttribute("data-valid-at")) <=
        epoch,
    );
    assert.match(
      await p.locator("#map-data-status").innerText(),
      /not an all-clear/,
    );
    await p.locator("#weather-map-info").click();
    assert.match(
      await p.locator("#detail-content").innerText(),
      /not individual strike locations/,
    );
    await p.locator("#close-detail").click();
    await p.locator("[data-layer=satellite]").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#weather-time").dataset.validAt &&
        !document.querySelector("#weather-refresh").disabled,
    );
    assert.ok(
      requests.some(
        (r) => r.layer === "satellite:global_longwave_imagery_mosaic",
      ),
    );
    assert.match(await p.locator("#weather-time-kind").innerText(), /OBSERVED/);
    await p.locator("#weather-play").click();
    await p.locator("[data-nav=today]").click();
    await p.waitForFunction(() => document.body.dataset.screen === "today");
    assert.equal(
      await p.locator("#weather-play").getAttribute("aria-label"),
      "Play weather map timeline",
    );
    console.log(
      "PASS all four future products, viewport refresh, observed lightning/satellite identity, coverage info and pause on route exit",
    );
    await p.locator("[data-detail=aqi]").click();
    await p.locator("#open-air-forecast").click();
    await p.waitForFunction(() => document.querySelector(".air-hero"));
    assert.equal(await p.locator(".air-hero strong").innerText(), "0");
    assert.match(await p.locator(".air-hero p").innerText(), /Good/);
    assert.equal(await p.locator(".air-bars i").count(), 48);
    assert.match(await p.locator(".pollen-list").innerText(), /0.0 grains/);
    await p.locator("#air-hour").evaluate((n) => {
      n.value = 12;
      n.dispatchEvent(new Event("input"));
    });
    assert.equal(await p.locator(".air-hero strong").innerText(), "32");
    await p.locator("#close-detail").click();
    await p.evaluate(() => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith("truecast-environment-"))
          localStorage.removeItem(key);
    });
    pollenAvailable = false;
    await p.locator("[data-detail=aqi]").click();
    await p.locator("#open-air-forecast").click();
    await p.waitForFunction(() => document.querySelector(".pollen-list"));
    assert.match(
      await p.locator(".pollen-list").innerText(),
      /unavailable.*missing reading does not mean no pollen/is,
    );
    console.log(
      "PASS 48-hour AQI, exact-hour scrubbing, pollutant values and zero-versus-missing pollen handling",
    );
    assert.deepEqual(errors, []);
    console.log("PASS zero uncaught errors across new atmosphere features");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
