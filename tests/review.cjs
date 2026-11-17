const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.TRUECAST_URL || "http://127.0.0.1:8766/";
const launch = { headless: true };
if (process.env.TRUECAST_BROWSER_PATH)
  launch.executablePath = process.env.TRUECAST_BROWSER_PATH;
(async () => {
  const browser = await chromium.launch(launch);
  try {
    const context = await browser.newContext({
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelectorAll(".day").length === 16,
    );
    const go = async (route) => {
      await page.locator(`[data-nav=${route}]`).click();
      await page.waitForFunction(
        (n) => document.body.dataset.screen === n,
        route,
      );
      assert.equal(await page.locator(".app-screen:visible").count(), 1);
    };
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    assert.equal(await page.locator("#units").innerText(), "°F / °C");
    await page.addStyleTag({
      content: ":root{--safe-top:59px;--safe-bottom:34px}",
    });
    const safe = await page.evaluate(() => ({
      location: document.querySelector("#open-places").getBoundingClientRect()
        .top,
      nav: document.querySelector("[data-nav=today]").getBoundingClientRect()
        .bottom,
      scroll: document.querySelector("main").scrollHeight,
      height: document.querySelector("main").clientHeight,
    }));
    assert.ok(
      safe.location >= 59,
      "location control overlaps simulated Dynamic Island",
    );
    assert.ok(safe.nav <= 852 - 34, "tabs overlap simulated Home indicator");
    assert.ok(
      safe.scroll <= safe.height + 2,
      `Today unnecessarily scrolls: ${JSON.stringify(safe)}`,
    );
    console.log(
      "PASS dark/Fahrenheit default, compact Today, simulated 59px top + 34px bottom safe areas",
    );
    await page.locator("#all-conditions").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /Dew point/,
    );
    await page.keyboard.press("Escape");
    await page.locator("[data-detail=uv]").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /daily maximum/i,
    );
    await page.locator("#close-detail").click();
    await go("forecast");
    await page.locator("#horizon").selectOption("144");
    assert.equal(await page.locator(".hour").count(), 144);
    await page.locator("[data-metric=rain]").click();
    assert.match(
      await page.locator(".chart-unit").innerText(),
      /precipitation/i,
    );
    await page.locator("#forecast-scrub").evaluate((n) => {
      n.value = 11;
      n.dispatchEvent(new Event("input"));
    });
    assert.equal(
      await page.locator(".hour[aria-pressed=true]").getAttribute("data-index"),
      "11",
    );
    await page.locator("#compare-models").click();
    await page.waitForFunction(
      () => document.querySelectorAll(".model-table tbody tr").length === 3,
    );
    assert.match(
      await page.locator("#detail-content").innerText(),
      /ECMWF IFS/,
    );
    await page.locator("#close-detail").click();
    await page.locator("[data-forecast-view=daily]").click();
    await page.locator(".day").first().click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /Precipitation/,
    );
    await page.locator("#close-detail").click();
    console.log(
      "PASS conditions sheets, metric charts, 144 hours, scrubber and daily details",
    );
    await go("plan");
    await page.locator("#duration").selectOption("3");
    await page.locator("#activity").selectOption("picnic");
    assert.match(
      await page.locator("#plan-criteria").textContent(),
      /3 consecutive daylight/,
    );
    await page.locator("#open-warnings").click();
    assert.match(
      await page.locator("#detail-kicker").innerText(),
      /LOCAL ALERTS/,
    );
    await page.locator("#close-detail").click();
    await page.locator("#open-places").click();
    await page.locator("#city").fill("New York");
    await page.locator("#search button[type=submit]").click();
    await page.locator("#results button").first().waitFor();
    await page.locator("#results button").first().click();
    await page.waitForFunction(
      () =>
        document.querySelector("#place").textContent === "New York" &&
        document.querySelectorAll(".day").length === 16,
    );
    await go("today");
    await page.locator("#save").click();
    await page.locator("#open-places").click();
    assert.match(await page.locator("#favorites").innerText(), /New York/);
    await page
      .getByRole("button", { name: "Remove New York", exact: true })
      .click();
    assert.equal(await page.locator(".saved-place").count(), 0);
    await page.locator("#close-places").click();
    console.log(
      "PASS duration/activity planning, official alert sheet, city search and favorites",
    );
    await go("map");
    await page.waitForFunction(
      () => document.querySelector("#radar-time").textContent.includes("local"),
      null,
      { timeout: 25000 },
    );
    await page.locator("#map-options").click();
    await page.locator("#loop-length").selectOption("30");
    await page.locator("#radar-opacity").evaluate((n) => {
      n.value = 40;
      n.dispatchEvent(new Event("input"));
    });
    assert.equal(await page.locator("#opacity-value").innerText(), "40%");
    assert.equal(await page.locator("#coverage").isDisabled(), true);
    await page.locator("#close-map-dialog").click();
    await page.locator("[data-radar-window=past]").click();
    const pastWindow = await page
      .locator("#frame")
      .evaluate((n) => Number(n.max) - Number(n.min));
    assert.ok(pastWindow <= 30 * 60000, "selected history exceeds 30 minutes");
    await page.locator("#speed").click();
    assert.equal(await page.locator("#speed").innerText(), "2×");
    await page.locator("#play").click();
    assert.equal(
      await page.locator("#play").getAttribute("aria-label"),
      "Pause radar animation",
    );
    await go("today");
    assert.equal(
      await page.locator("#play").getAttribute("aria-label"),
      "Play radar animation",
    );
    console.log(
      "PASS real past radar, shortened history, opacity, coverage availability, speed and pause on exit",
    );
    // Synthetic source fixtures are used only in tests. Nothing is shipped as sample weather.
    const warning = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-75, 40],
            [-73, 40],
            [-73, 42],
            [-75, 42],
            [-75, 40],
          ],
        ],
      },
      properties: {
        event: "Test flood warning",
        severity: "Severe",
        headline: "TEST ONLY",
        areaDesc: "Test area",
        description: "Synthetic test geometry",
        instruction: "Test instructions",
        senderName: "Test source",
        expires: "2030-01-01T00:00:00Z",
      },
    };
    const zoneURL = "https://api.weather.gov/zones/forecast/NYZ001";
    const zonalWarning = {
      ...warning,
      geometry: null,
      properties: {
        ...warning.properties,
        event: "Test zone warning",
        affectedZones: [zoneURL],
      },
    };
    await page.route(zoneURL, (r) => r.fulfill({ json: warning }));
    await page.route(
      "https://api.weather.gov/alerts/active?status=actual",
      (r) =>
        r.fulfill({
          json: {
            type: "FeatureCollection",
            features: [warning, zonalWarning],
          },
        }),
    );
    await go("map");
    await page.locator("[data-layer=warnings]").click();
    await page.waitForFunction(
      () => !document.querySelector("#tracking-list").disabled,
    );
    assert.match(
      await page.locator("#tracking-text").innerText(),
      /2 active US alerts/,
    );
    await page.locator("#tracking-list").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /Test flood warning/,
    );
    await page.locator(".warning-list-item").nth(1).locator("summary").click();
    await page
      .locator(".warning-list-item")
      .nth(1)
      .getByRole("button", { name: "Show affected area", exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector("#detail-dialog").open,
    );
    assert.match(
      await page.locator("#map-data-status").innerText(),
      /Official affected area/,
    );
    const nhc =
      "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";
    await page.route(nhc + "**", (r) => {
      const url = r.request().url();
      if (!url.includes("/query"))
        return r.fulfill({
          json: {
            layers: [
              { id: 6, name: "AT1 Forecast Points" },
              { id: 7, name: "AT1 Forecast Track" },
              { id: 8, name: "AT1 Forecast Cone" },
            ],
          },
        });
      const point = {
        type: "Feature",
        properties: {
          stormname: "TEST CYCLONE",
          stormtype: "Test storm",
          tau: 0,
          maxwind: 55,
          gust: 65,
          advisnum: "1",
          advdate: "TEST ONLY",
        },
        geometry: { type: "Point", coordinates: [-70, 25] },
      };
      const line = {
        ...point,
        geometry: {
          type: "LineString",
          coordinates: [
            [-70, 25],
            [-68, 27],
          ],
        },
      };
      const cone = {
        ...point,
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-71, 24],
              [-67, 27],
              [-69, 28],
              [-71, 24],
            ],
          ],
        },
      };
      return r.fulfill({
        json: {
          type: "FeatureCollection",
          features: [
            url.includes("/6/") ? point : url.includes("/7/") ? line : cone,
          ],
        },
      });
    });
    await page.locator("[data-layer=tropical]").click();
    await page.waitForFunction(
      () => !document.querySelector("#tracking-list").disabled,
    );
    assert.match(
      await page.locator("#radar-time").innerText(),
      /1 NHC forecast system/,
    );
    await page.locator("#tracking-list").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /TEST CYCLONE/,
    );
    await page.getByRole("button", { name: "View track", exact: true }).click();
    assert.equal(
      await page.locator("#detail-dialog").evaluate((n) => n.open),
      false,
    );
    console.log(
      "PASS synthetic active warning polygon and NHC track/cone rendering + detail flow",
    );
    await page.unroute("https://api.weather.gov/alerts/active?status=actual");
    await page.route(
      "https://api.weather.gov/alerts/active?status=actual",
      (r) => r.fulfill({ status: 503, body: "Unavailable" }),
    );
    await page.locator("[data-layer=warnings]").click();
    await page.locator("#radar-latest").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#tracking-text")
        .textContent.includes("not an all-clear"),
    );
    assert.equal(await page.locator("#tracking-list").isDisabled(), false);
    assert.match(
      await page.locator("#map-data-status").innerText(),
      /saved.*unverified/i,
    );
    await page.locator("#tracking-list").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /saved records are unverified/i,
    );
    await page.locator("#close-detail").click();
    console.log("PASS failed warning source never shown as no alerts");
    for (const [width, height] of [
      [360, 780],
      [393, 852],
      [430, 932],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      for (const route of ["today", "forecast", "map", "plan", "settings"]) {
        await go(route);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          `${width}/${route} horizontal overflow`,
        );
        assert.ok(
          await page
            .locator("#main")
            .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
          `${width}/${route} inner overflow`,
        );
      }
    }
    console.log("PASS all screens at five phone/tablet/desktop widths");
    await page.setViewportSize({ width: 393, height: 852 });
    await go("settings");
    await page.locator("#units").click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelectorAll(".day").length === 16,
    );
    assert.equal(await page.locator("#units").innerText(), "°C / °F");
    await page.locator("#units").click();
    await page.locator("#install-app").click();
    assert.match(
      await page.locator("#install-instructions").innerText(),
      /Android/,
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        document.querySelector("#freshness").textContent === "OFFLINE · SAVED",
    );
    await go("today");
    assert.equal(await page.locator("#offline-banner").isVisible(), true);
    assert.equal(await page.locator(".day").count(), 16);
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#freshness").textContent === "UNAVAILABLE",
    );
    assert.equal(await page.locator(".day").count(), 0);
    assert.equal(await page.locator("#refresh-weather").isEnabled(), true);
    console.log(
      "PASS unit persistence, install help, offline shell, saved forecast and empty-cache failure",
    );
    assert.deepEqual(errors, []);
    console.log("PASS zero uncaught browser errors");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
