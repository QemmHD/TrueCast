const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { epoch, forecast } = require("./fixtures.cjs");
const base = process.env.TRUECAST_URL || "http://127.0.0.1:8766/";
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const iso = (t) => new Date(t).toISOString(),
  reference = Date.parse("2026-11-16T12:00Z");
(async () => {
  const b = await chromium.launch({
    headless: true,
    ...(process.env.TRUECAST_BROWSER_PATH
      ? { executablePath: process.env.TRUECAST_BROWSER_PATH }
      : {}),
  });
  try {
    const c = await b.newContext({
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
        serviceWorkers: "block",
      }),
      p = await c.newPage(),
      errors = [],
      maps = [];
    let weatherCalls = 0,
      imageMode = "normal";
    p.on("pageerror", (e) => errors.push(e.stack));
    await p.clock.install({ time: new Date(epoch) });
    await p.addInitScript(() =>
      localStorage.setItem(
        "truecast-last",
        JSON.stringify({
          name: "Gatlinburg",
          latitude: 35.714,
          longitude: -83.51,
          country_code: "US",
        }),
      ),
    );
    function data() {
      const d = forecast(18);
      Object.assign(d.current, {
        wind_direction_10m: 260,
        dew_point_2m: 12,
        pressure_msl: 1013,
      });
      d.hourly.precipitation.fill(0);
      d.hourly.precipitation_probability.fill(5);
      d.hourly.wind_speed_10m.fill(8);
      d.hourly.temperature_2m[18] = 23;
      return d;
    }
    await p.route("https://api.open-meteo.com/**", (r) => {
      const u = new URL(r.request().url());
      if (u.searchParams.has("models")) {
        const h = data().hourly;
        for (const [id, value] of [
          ["ecmwf_ifs025", 0],
          ["gfs_seamless", 5],
          ["icon_seamless", 3],
        ])
          for (const [key, val] of [
            ["temperature_2m", value],
            ["wind_speed_10m", 10],
            ["precipitation", 0.1],
          ])
            h[`${key}_${id}`] = h.time.map(() => val);
        return r.fulfill({ json: { hourly: h } });
      }
      weatherCalls++;
      return r.fulfill({ json: data() });
    });
    await p.route("https://air-quality-api.open-meteo.com/**", (r) =>
      r.fulfill({
        json: {
          current: { time: epoch / 1000, us_aqi: 23, pm2_5: 3, pm10: 4 },
        },
      }),
    );
    await p.route("https://api.weather.gov/**", (r) =>
      r.fulfill({ status: 404, json: {} }),
    );
    await p.route("https://tile.openstreetmap.org/**", (r) =>
      r.fulfill({ contentType: "image/png", body: tiny }),
    );
    await p.route("https://mesonet.agron.iastate.edu/**", (r) =>
      r.fulfill({ status: 503, json: {} }),
    );
    await p.route("https://nowcoast.noaa.gov/**", (r) => {
      const u = new URL(r.request().url());
      if (u.searchParams.get("request") === "GetCapabilities")
        return r.fulfill({
          contentType: "application/xml",
          body: `<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>conus_base_reflectivity_mosaic</Name><Dimension name="time">${iso(epoch - 6 * 3600000)}/${iso(epoch - 300000)}/PT5M</Dimension></Layer></Layer></Capability></WMS_Capabilities>`,
        });
      return r.fulfill({ contentType: "image/png", body: tiny });
    });
    await p.route("https://maps.dwd.de/**", async (r) => {
      const u = new URL(r.request().url()),
        q = u.searchParams;
      if (q.get("request") === "GetCapabilities") {
        await new Promise((resolve) => setTimeout(resolve, 450));
        const layer = u.pathname.split("/").at(-2);
        return r.fulfill({
          contentType: "application/xml",
          body: `<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>${layer}</Name><Dimension name="time">${iso(reference)}/${iso(reference + 96 * 3600000)}/PT1H</Dimension><Dimension name="REFERENCE_TIME">${iso(reference)}</Dimension></Layer></Layer></Capability></WMS_Capabilities>`,
        });
      }
      maps.push(u.href);
      return r.fulfill(
        imageMode === "failure"
          ? {
              contentType: "application/xml",
              body: "<ServiceExceptionReport>Unavailable</ServiceExceptionReport>",
            }
          : { contentType: "image/png", body: tiny },
      );
    });
    await p.goto(base);
    await p.waitForFunction(
      () => document.querySelectorAll(".day").length === 16,
    );
    await p.addStyleTag({
      content: ":root{--safe-top:59px;--safe-bottom:34px}",
    });
    const home = await p
      .locator("#main")
      .evaluate((n) => ({ scroll: n.scrollHeight, height: n.clientHeight }));
    assert.ok(home.scroll <= home.height + 2, JSON.stringify(home));
    await p.locator("[data-nav=forecast]").click();
    await p.locator(".weather-chart").waitFor({ state: "visible" });
    const svg = p.locator(".weather-chart"),
      box = await svg.boundingBox();
    await p.mouse.click(box.x + box.width * 0.65, box.y + box.height * 0.5);
    assert.ok(Number(await p.locator("#forecast-scrub").inputValue()) > 10);
    assert.equal(await p.locator("#chart-cursor").count(), 1);
    assert.ok(
      (await p.locator(".chart-night").count()) === 0,
      "fixture daytime must not be shaded as night",
    );
    const touchBox = await svg.boundingBox();
    await p.touchscreen.tap(
      touchBox.x + touchBox.width * 0.3,
      touchBox.y + touchBox.height * 0.5,
    );
    const touched = await p.locator("#forecast-scrub").inputValue();
    const session = await c.newCDPSession(p),
      x = touchBox.x + touchBox.width * 0.8,
      y = touchBox.y + touchBox.height * 0.5;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let i = 1; i <= 4; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - i * 12 }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await p.waitForTimeout(150);
    assert.equal(
      await p.locator("#forecast-scrub").inputValue(),
      touched,
      "vertical scrolling over the chart must not scrub to another hour",
    );
    await session.detach();
    await svg.focus();
    await p.keyboard.press("End");
    assert.equal(await p.locator("#forecast-scrub").inputValue(), "23");
    await p.keyboard.press("ArrowLeft");
    assert.equal(await p.locator("#forecast-scrub").inputValue(), "22");
    await p.locator("[data-metric=wind]").click();
    assert.equal(await p.locator(".chart-gusts").count(), 1);
    assert.equal(
      await p.locator(".hour[aria-pressed=true] strong").innerText(),
      "64°",
    );
    await p.locator("#horizon").selectOption("144");
    await p.locator("#forecast-scrub").evaluate((n) => {
      n.value = 80;
      n.dispatchEvent(new Event("input"));
    });
    const rail = await p
      .locator("#hours")
      .evaluate((n) => n.scrollLeft / (n.scrollWidth - n.clientWidth));
    assert.ok(Math.abs(rail - 80 / 143) < 0.01);
    await p.locator("#horizon").selectOption("24");
    await p.locator("#compare-models").click();
    await p.waitForFunction(
      () => document.querySelectorAll(".model-table tbody tr").length === 3,
    );
    assert.match(await p.locator(".model-spread").innerText(), /32° to 41°/);
    assert.match(
      await p.locator(".model-spread").innerText(),
      /not a calibrated confidence interval/,
    );
    await p.locator("#close-detail").click();
    assert.equal(await p.locator(".weather-signal").count(), 4);
    await p.locator("[data-signal=temperature]").click();
    assert.equal(
      await p.locator("[data-metric=temperature]").getAttribute("aria-pressed"),
      "true",
    );
    const retained = await p
      .locator("#selected-date")
      .getAttribute("data-valid-at");
    const calls = weatherCalls;
    await p.waitForTimeout(11200);
    assert.ok(weatherCalls > calls);
    assert.equal(
      await p.locator("#selected-date").getAttribute("data-valid-at"),
      retained,
    );
    console.log(
      "PASS direct chart/pointer/keyboard scrubbing, gust overlay, temperature cards across metrics, synchronized strip, truthful model spread, day signals and quiet refresh",
    );
    await p.locator("[data-nav=plan]").click();
    await p.locator("#plan-priority").selectOption("earliest");
    await p.locator("#duration").selectOption("2");
    assert.match(await p.locator("#window").innerText(), /YOUR NEXT WINDOW/);
    const eventPromise = p.waitForEvent("download");
    await p
      .locator("#window")
      .getByRole("button", { name: "Add to calendar" })
      .click();
    const event = await eventPromise,
      text = await readFile(await event.path(), "utf8");
    assert.match(event.suggestedFilename(), /\.ics$/);
    assert.match(text, /BEGIN:VCALENDAR/);
    const stamp = /DTSTART:(\d{8}T\d{6}Z)/.exec(text)[1];
    assert.equal(stamp, "20261116T130000Z");
    await p
      .locator("#window")
      .getByRole("button", { name: "Explore these hours" })
      .click();
    await p.waitForFunction(() => document.body.dataset.screen === "forecast");
    assert.equal(
      Number(await p.locator("#selected-date").getAttribute("data-valid-at")),
      Date.parse("2026-11-16T13:00Z") / 1000,
    );
    console.log(
      "PASS complete future planning windows, persisted preference, real UTC calendar download and direct forecast exploration",
    );
    await p.locator("[data-nav=map]").click();
    await p.locator("[data-layer=forecast]").click();
    await p.waitForFunction(
      () =>
        document.querySelector("#weather-time").dataset.validAt &&
        !document.querySelector("#weather-refresh").disabled,
    );
    await p.waitForTimeout(900);
    assert.equal(
      await p.locator(".leaflet-image-layer").count(),
      1,
      "identical viewport refresh must retain the displayed image",
    );
    assert.equal(
      await p.locator("#weather-context").getAttribute("open"),
      null,
    );
    await p.locator("#weather-play").click();
    let before = await p.locator("#weather-time").getAttribute("data-valid-at");
    for (let i = 0; i < 3; i++) {
      await p.waitForFunction(
        (t) => document.querySelector("#weather-time").dataset.validAt !== t,
        before,
      );
      before = await p.locator("#weather-time").getAttribute("data-valid-at");
    }
    const loadedRequests = maps.filter(
      (u) => Date.parse(new URL(u).searchParams.get("time")) === Number(before),
    );
    assert.equal(
      loadedRequests.length,
      1,
      "prefetched frame should not download again when displayed",
    );
    await p.locator("#map-zoom-in").click();
    assert.equal(
      await p.locator("#weather-play").getAttribute("aria-label"),
      "Pause weather map timeline",
    );
    await p.waitForTimeout(1200);
    await p.locator("#weather-play").click();
    await p.waitForTimeout(400);
    const last = await p.locator("#weather-time").getAttribute("data-valid-at");
    imageMode = "failure";
    await p.locator("#weather-frame").evaluate((n) => {
      n.value = n.max;
      n.dispatchEvent(new Event("input"));
    });
    await p.waitForFunction(() =>
      document
        .querySelector("#map-data-status")
        .textContent.includes("Frame unavailable"),
    );
    assert.equal(
      await p.locator("#weather-time").getAttribute("data-valid-at"),
      last,
    );
    assert.ok((await p.locator(".leaflet-image-layer").count()) <= 2);
    console.log(
      "PASS decoded future-frame prefetch/reuse, zoom playback, compact source disclosure, bounded visible layers and failed-image retention",
    );
    await p.locator("[data-nav=settings]").click();
    await p.locator("#home-focus").selectOption("storm");
    await p.locator("[data-nav=today]").click();
    assert.match(
      await p.locator("#hero-outlook").innerText(),
      /Observed radar/,
    );
    assert.match(
      await p.locator("#hero-future-map").innerText(),
      /Open lightning/,
    );
    await p.locator("[data-nav=settings]").click();
    await p.locator("#motion-mode").selectOption("reduced");
    await p.locator("#type-size").selectOption("larger");
    assert.equal(
      await p.locator("body").getAttribute("data-motion"),
      "reduced",
    );
    assert.equal(
      await p.locator("body").getAttribute("data-reading-size"),
      "larger",
    );
    await p.reload();
    assert.equal(await p.locator("#motion-mode").inputValue(), "reduced");
    assert.equal(await p.locator("#type-size").inputValue(), "larger");
    assert.deepEqual(errors, []);
    console.log(
      "PASS persisted reading/motion preferences and no uncaught errors",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
