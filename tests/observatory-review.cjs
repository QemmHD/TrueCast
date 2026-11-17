const { chromium, webkit, devices } = require("playwright");
const assert = require("node:assert/strict");
const { epoch, forecast } = require("./fixtures.cjs");
const base = process.env.TRUECAST_URL || "http://127.0.0.1:8766/";
const tiny = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const iso = (t) => new Date(t).toISOString(),
  reference = epoch - 30 * 60000;
const fire = (name, lat, lon, time) => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: {
    IncidentName: name,
    ModifiedOnDateTime_dt: time,
    IncidentSize: 0,
    PercentContained: 0,
  },
});
(async () => {
  const browser = await (
    process.env.TRUECAST_ENGINE === "webkit" ? webkit : chromium
  ).launch({
    headless: true,
    ...(process.env.TRUECAST_BROWSER_PATH
      ? { executablePath: process.env.TRUECAST_BROWSER_PATH }
      : {}),
  });
  try {
    const c = await browser.newContext({
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 1,
        serviceWorkers: "block",
      }),
      p = await c.newPage(),
      errors = [],
      samples = [];
    p.on("pageerror", (e) => errors.push(e.stack));
    await p.clock.install({ time: new Date(epoch) });
    await p.addInitScript(() => {
      localStorage.setItem(
        "truecast-last",
        JSON.stringify({
          name: "Gatlinburg",
          latitude: 35.714,
          longitude: -83.51,
          country_code: "US",
        }),
      );
      localStorage.setItem(
        "truecast-places",
        JSON.stringify([
          {
            name: "Knoxville",
            latitude: 35.96,
            longitude: -83.92,
            country_code: "US",
          },
          {
            name: "Sevierville",
            latitude: 35.87,
            longitude: -83.56,
            country_code: "US",
          },
        ]),
      );
    });
    await p.route("https://api.open-meteo.com/**", (r) => {
      const d = forecast();
      Object.assign(d.current, {
        wind_direction_10m: 270,
        dew_point_2m: 6,
        pressure_msl: 1012,
      });
      return r.fulfill({ json: d });
    });
    await p.route("https://air-quality-api.open-meteo.com/**", (r) =>
      r.fulfill({
        json: {
          current: { time: epoch / 1000, us_aqi: 23, pm2_5: 3, pm10: 5 },
        },
      }),
    );
    await p.route("https://api.weather.gov/**", (r) =>
      r.fulfill({ status: 404, json: {} }),
    );
    await p.route("https://tile.openstreetmap.org/**", (r) =>
      r.fulfill({ contentType: "image/png", body: tiny }),
    );
    await p.route("https://api.rainviewer.com/**", (r) =>
      r.fulfill({
        json: {
          host: "https://test-radar.invalid",
          radar: { past: [{ time: epoch / 1000 - 600, path: "/test" }] },
        },
      }),
    );
    await p.route("https://test-radar.invalid/**", (r) =>
      r.fulfill({ contentType: "image/png", body: tiny }),
    );
    await p.route("https://mesonet.agron.iastate.edu/**", (r) =>
      r.fulfill({ status: 503, json: {} }),
    );
    let fireFailure = false;
    await p.route("https://services3.arcgis.com/**", (r) =>
      fireFailure
        ? r.fulfill({ status: 503, json: {} })
        : r.fulfill({
            json: {
              type: "FeatureCollection",
              properties: { exceededTransferLimit: true },
              features: [
                fire("TEST Nearby Fire", 35.72, -83.52, epoch - 3600000),
                fire("TEST Old Report", 35.72, -83.52, epoch - 8 * 86400000),
                fire("TEST Distant", 34, -118, epoch - 3600000),
              ],
            },
          }),
    );
    await p.route("https://www.spc.noaa.gov/**", (r) =>
      r.fulfill({
        json: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [-85, 34],
                    [-82, 34],
                    [-82, 37],
                    [-85, 37],
                    [-85, 34],
                  ],
                ],
              },
              properties: {
                LABEL: "TSTM",
                LABEL2: "General thunderstorms",
                VALID_ISO: iso(epoch - 3600000),
                EXPIRE_ISO: iso(epoch + 6 * 3600000),
                ISSUE_ISO: iso(epoch - 3600000),
              },
            },
          ],
        },
      }),
    );
    await p.route("https://nowcoast.noaa.gov/**", (r) => {
      const u = new URL(r.request().url()),
        q = u.searchParams,
        request = q.get("request")?.toLowerCase();
      if (request === "getfeatureinfo") {
        const t = Date.parse(q.get("time"));
        samples.push(t);
        return r.fulfill({
          json: {
            type: "FeatureCollection",
            features: [
              { properties: { Band1: t === epoch - 15 * 60000 ? 20 : 0 } },
            ],
          },
        });
      }
      if (request === "getcapabilities") {
        const lightning = u.pathname.includes("lightning"),
          layer = lightning
            ? "lightning_detection:ldn_lightning_strike_density"
            : "conus_base_reflectivity_mosaic";
        return r.fulfill({
          contentType: "application/xml",
          body: `<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>${layer}</Name><Dimension name="time">${iso(epoch - 6 * 3600000)}/${iso(epoch - 15 * 60000)}/PT15M</Dimension></Layer></Layer></Capability></WMS_Capabilities>`,
        });
      }
      return r.fulfill({ contentType: "image/png", body: tiny });
    });
    await p.route("https://maps.dwd.de/**", (r) => {
      const u = new URL(r.request().url());
      if (u.searchParams.get("request") === "GetCapabilities") {
        const layer = u.pathname.split("/").at(-2);
        return r.fulfill({
          contentType: "application/xml",
          body: `<WMS_Capabilities xmlns="http://www.opengis.net/wms"><Capability><Layer><Layer><Name>${layer}</Name><Dimension name="time">${iso(reference)}/${iso(reference + 96 * 3600000)}/PT1H</Dimension><Dimension name="REFERENCE_TIME">${iso(reference)}</Dimension></Layer></Layer></Capability></WMS_Capabilities>`,
        });
      }
      return r.fulfill({ contentType: "image/png", body: tiny });
    });
    await p.goto(base);
    await p.waitForFunction(
      () => document.querySelectorAll(".day").length === 16,
    );
    await p.addStyleTag({
      content: ":root{--safe-top:59px;--safe-bottom:34px}",
    });
    await p.locator("#all-conditions").click();
    await p.waitForFunction(() =>
      document
        .querySelector(".conditions-overview")
        ?.textContent.includes("Lightning detected in local grid"),
    );
    assert.match(
      await p.locator("#detail-content").innerText(),
      /0.02 strikes\/km²\/min/,
    );
    assert.match(await p.locator("#detail-content").innerText(), /Dew point/);
    assert.match(await p.locator("#detail-content").innerText(), /Sun & moon/i);
    assert.equal(await p.locator(".wind-compass").count(), 1);
    assert.match(await p.locator(".condition-wind").innerText(), /W 7 mph/);
    await p.screenshot({
      path: "/workspace/TrueCast-review/4.2-conditions.png",
    });
    const lightning = p
      .locator(".condition-section")
      .filter({ has: p.locator("h3", { hasText: "Lightning" }) });
    await lightning.locator("button").click();
    await p.waitForFunction(
      () =>
        document.body.dataset.mapLayer === "lightning" &&
        document
          .querySelector("#atlas-focus")
          .textContent.includes("Lightning detected in local grid"),
    );
    assert.equal(await p.locator(".distance-ring-label").count(), 3);
    assert.match(
      await p.locator("#atlas-focus").innerText(),
      /0.02 strikes\/km²\/min/,
    );
    assert.equal(await p.locator("#weather-frame").getAttribute("max"), "2");
    assert.equal(await p.locator(".saved-map-pin").count(), 2);
    await p.screenshot({
      path: "/workspace/TrueCast-review/4.2-lightning.png",
    });
    await p.locator("#weather-play").click();
    await p.waitForFunction(() =>
      document
        .querySelector("#atlas-focus")
        .textContent.includes("Zero density in this grid cell"),
    );
    assert.equal(
      await p.locator("#weather-play").getAttribute("aria-label"),
      "Pause weather map timeline",
    );
    await p.locator("#weather-play").click();
    assert.equal(
      await p
        .locator("#atlas-focus")
        .getByText("No Lightning Nearby", { exact: true })
        .count(),
      0,
    );
    await p.locator(".atlas-info").click();
    assert.match(
      await p.locator("#detail-content").innerText(),
      /cannot provide the closest strike/,
    );
    await p.locator("#close-detail").click();
    await p.locator('[data-lightning-history="120"]').click();
    await p.waitForFunction(
      () => document.querySelector("#weather-frame").max === "8",
    );
    console.log(
      "PASS lightning rings, true local density units, observed history/playback, zero-versus-missing language, source guide and saved pins",
    );
    await p.locator("#map-options").click();
    await p.locator("#layer-search").fill("wind");
    assert.equal(await p.locator("[data-catalog-layer]").count(), 2);
    await p.locator('[data-catalog-layer="forecast:wind"]').click();
    await p.waitForFunction(
      () =>
        document
          .querySelector("[data-map-product=wind]")
          .getAttribute("aria-pressed") === "true" &&
        !document.querySelector("#weather-refresh").disabled,
    );
    await p.locator("#map-options").click();
    await p.locator("#layer-search").fill("");
    await p.locator("#map-style").selectOption("standard");
    assert.equal(
      await p
        .locator(".leaflet-basemap-pane")
        .evaluate((n) => n.classList.contains("dark-basemap")),
      false,
    );
    await p.screenshot({
      path: "/workspace/TrueCast-review/4.2-layer-picker.png",
    });
    await p.locator("[data-catalog-layer=fire]").click();
    await p.waitForFunction(() =>
      document
        .querySelector("#map-data-status")
        .textContent.includes("1 recent incident report"),
    );
    assert.match(await p.locator("#map-data-status").innerText(), /incomplete/);
    assert.match(
      await p.locator("#atlas-focus").innerText(),
      /TEST Nearby Fire/,
    );
    await p
      .locator("#atlas-focus")
      .getByRole("button", { name: "View report" })
      .click();
    assert.match(await p.locator("#detail-content").innerText(), /0%/);
    assert.match(await p.locator("#detail-content").innerText(), /0 acres/);
    await p.locator("#close-detail").click();
    fireFailure = true;
    await p.clock.fastForward(301000);
    await p.waitForFunction(() =>
      document
        .querySelector("#atlas-focus")
        .textContent.includes("Source unavailable"),
    );
    assert.match(
      await p.locator("#map-data-status").innerText(),
      /no all-clear/,
    );
    fireFailure = false;
    await p.locator("#map-options").click();
    await p.locator("[data-catalog-layer=storm]").click();
    await p.waitForFunction(() =>
      document
        .querySelector("#map-data-status")
        .textContent.includes("NOAA / SPC"),
    );
    assert.equal(await p.locator("#weather-console").isVisible(), false);
    assert.equal(await p.locator("#radar-console").isVisible(), false);
    assert.match(
      await p.locator("#atlas-focus").innerText(),
      /not current warnings/,
    );
    console.log(
      "PASS searchable layer catalog, direct wind selection, standard basemap, honest recent-fire distance/zero values, incomplete reports and separate SPC outlook",
    );
    await p.locator("[data-nav=forecast]").click();
    await p.locator("[data-forecast-view=daily]").click();
    await p.locator("[data-daily-mode=details]").click();
    assert.equal(await p.locator(".day-expanded:visible").count(), 16);
    await p.locator("[data-daily-mode=summary]").click();
    assert.equal(await p.locator(".day-expanded:visible").count(), 0);
    await p.locator("[data-nav=today]").click();
    await p.locator("#all-conditions").click();
    const solar = await p.locator(".sun-moon-grid").boundingBox();
    assert.ok(solar.width < 393);
    await p.locator("#close-detail").click();
    await p.locator("[data-nav=settings]").click();
    await p.locator("#measurements").selectOption("metric");
    await p.locator("[data-nav=map]").click();
    await p.locator("[data-layer=lightning]").click();
    await p.waitForFunction(() =>
      document.querySelector(".distance-ring-label").textContent.includes("km"),
    );
    await p.setViewportSize({ width: 852, height: 393 });
    await p.addStyleTag({
      content:
        ":root{--safe-top:0px;--safe-bottom:21px;--safe-left:59px;--safe-right:59px}",
    });
    await p.waitForTimeout(500);
    const boxes = await p.evaluate(() => {
      const r = (s) => {
        const b = document.querySelector(s).getBoundingClientRect();
        return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      };
      return { focus: r("#atlas-focus"), console: r("#weather-console") };
    });
    assert.ok(boxes.focus.left >= 59);
    assert.ok(
      boxes.focus.right <= boxes.console.left,
      "landscape lightning card overlaps playback",
    );
    await p.screenshot({
      path: "/workspace/TrueCast-review/4.2-lightning-landscape.png",
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS daily summary/details, grouped conditions, metric rings, landscape safe areas and zero uncaught errors",
    );
    await c.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
