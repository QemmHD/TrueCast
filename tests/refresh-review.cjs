const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const base = process.env.TRUECAST_URL || "http://127.0.0.1:8766/";
const launch = {
  headless: true,
  ...(process.env.TRUECAST_BROWSER_PATH
    ? { executablePath: process.env.TRUECAST_BROWSER_PATH }
    : {}),
};
const { epoch, forecast } = require("./fixtures.cjs");
(async () => {
  const browser = await chromium.launch(launch);
  try {
    const context = await browser.newContext({
        ...devices["iPhone 14 Pro"],
        viewport: { width: 393, height: 852 },
        serviceWorkers: "block",
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date(epoch) });
    await page.addInitScript(() =>
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
      airCalls = 0,
      alertCalls = 0,
      mode = "normal",
      pending = [],
      stationMode = "normal";
    let alertFeatures = [
      {
        properties: {
          event: "Test warning",
          severity: "Severe",
          headline: "TEST FIXTURE ONLY",
          description: "Test data",
          expires: new Date(epoch + 90000).toISOString(),
        },
      },
    ];
    await page.route(
      "https://api.open-meteo.com/v1/forecast?*",
      async (route) => {
        weatherCalls++;
        if (mode === "pending") return pending.push(route);
        if (mode === "failure") return route.fulfill({ status: 503, json: {} });
        if (mode === "bad")
          return route.fulfill({
            json: {
              current: { time: 1 },
              hourly: { time: [] },
              daily: { time: [] },
            },
          });
        return route.fulfill({ json: forecast(mode === "warmer" ? 20 : 10) });
      },
    );
    await page.route("https://air-quality-api.open-meteo.com/**", (route) => {
      airCalls++;
      return route.fulfill({
        json: {
          current: {
            time: epoch / 1000,
            us_aqi: 22,
            pm2_5: 3,
            pm10: 5,
            ozone: 80,
          },
        },
      });
    });
    await page.route("https://api.weather.gov/points/**", (r) =>
      r.fulfill({
        json: {
          properties: {
            timeZone: "America/New_York",
            forecast: "https://api.weather.gov/gridpoints/OKX/33,42/forecast",
            observationStations:
              "https://api.weather.gov/gridpoints/OKX/33,42/stations",
          },
        },
      }),
    );
    await page.route("https://api.weather.gov/alerts/active?point=*", (r) => {
      alertCalls++;
      return mode === "alertfailure"
        ? r.fulfill({ status: 503, json: {} })
        : r.fulfill({ json: { features: alertFeatures } });
    });
    await page.route(
      "https://api.weather.gov/gridpoints/OKX/33,42/forecast",
      (r) =>
        r.fulfill({
          json: {
            properties: {
              updateTime: new Date(epoch).toISOString(),
              periods: [
                {
                  name: "Expired period",
                  temperature: 99,
                  temperatureUnit: "F",
                  startTime: new Date(epoch - 7200000).toISOString(),
                  endTime: new Date(epoch - 3600000).toISOString(),
                  detailedForecast: "PAST PERIOD MUST BE FILTERED",
                },
                {
                  name: "This Afternoon",
                  temperature: 55,
                  temperatureUnit: "F",
                  startTime: new Date(epoch).toISOString(),
                  endTime: new Date(epoch + 21600000).toISOString(),
                  detailedForecast:
                    "Independent official narrative for the test.",
                },
              ],
            },
          },
        }),
    );
    const station = (name, lon) => ({
      id: `https://api.weather.gov/stations/${name}`,
      geometry: { type: "Point", coordinates: [lon, 40.71] },
      properties: { name },
    });
    await page.route(
      "https://api.weather.gov/gridpoints/OKX/33,42/stations",
      (r) =>
        r.fulfill({
          json: {
            features: [
              station("OLD", -74.005),
              station("VALID", -74.01),
              station("UNCHECKED", -74.02),
            ],
          },
        }),
    );
    await page.route(
      "https://api.weather.gov/stations/*/observations/latest?require_qc=true",
      (r) => {
        const valid = r.request().url().includes("/VALID/");
        return r.fulfill({
          json: {
            properties: {
              stationName: valid ? "Verified Nearby Station" : "Other station",
              timestamp: new Date(
                epoch -
                  (r.request().url().includes("/OLD/") || stationMode === "old"
                    ? 7200000
                    : 600000),
              ).toISOString(),
              temperature: {
                value: 12,
                unitCode: "wmoUnit:degC",
                qualityControl: valid ? "V" : "Z",
              },
              windSpeed: { value: 5, unitCode: "wmoUnit:m_s-1" },
            },
          },
        });
      },
    );
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelectorAll(".day").length === 16,
    );
    await page.waitForFunction(
      () => document.querySelector("#alert-count").textContent === "1",
    );
    const original = await page.locator("#temperature").innerText();
    await page.locator("[data-nav=forecast]").click();
    await page.locator("#horizon").selectOption("144");
    await page.locator("#forecast-scrub").evaluate((n) => {
      n.value = 18;
      n.dispatchEvent(new Event("input"));
    });
    await page.locator("#hours").evaluate((n) => (n.scrollLeft = 240));
    const view = await page.evaluate(() => ({
      selected: document.querySelector("#selected-date").dataset.validAt,
      left: document.querySelector("#hours").scrollLeft,
    }));
    mode = "pending";
    await page.locator("#refresh-weather").click();
    await page.waitForFunction(
      () => document.querySelector("#refresh-weather").disabled,
    );
    assert.equal(await page.locator("#temperature").innerText(), original);
    assert.equal(await page.locator(".day").count(), 16);
    assert.equal(
      await page.locator("#selected-date").getAttribute("data-valid-at"),
      view.selected,
    );
    await page.locator("#open-places").click();
    await page.locator("#city").fill("Unsaved search");
    const resolve = pending.splice(0);
    assert.equal(resolve.length, 1);
    mode = "warmer";
    await resolve[0].fulfill({ json: forecast(20) });
    await page.waitForFunction(
      () => !document.querySelector("#refresh-weather").disabled,
    );
    assert.equal(
      await page.locator("#places-dialog").evaluate((n) => n.open),
      true,
    );
    assert.equal(await page.locator("#city").inputValue(), "Unsaved search");
    assert.equal(
      await page.locator("#selected-date").getAttribute("data-valid-at"),
      view.selected,
    );
    assert.equal(
      await page.locator("#hours").evaluate((n) => n.scrollLeft),
      view.left,
    );
    await page.locator("#close-places").click();
    assert.notEqual(await page.locator("#temperature").innerText(), original);
    console.log(
      "PASS quiet refresh retains forecast, selected valid hour, horizontal scroll and unfinished location search",
    );
    mode = "alertfailure";
    await page.locator("#refresh-weather").click();
    await page.waitForFunction(
      () => document.querySelector("#alert-count").textContent === "!",
    );
    await page.locator("[data-nav=today]").click();
    await page.locator("#show-alerts").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /TEST FIXTURE ONLY/,
    );
    assert.match(
      await page.locator("#detail-content").innerText(),
      /unverified/i,
    );
    await page.clock.fastForward(91000);
    await page.waitForFunction(
      () =>
        !document
          .querySelector("#detail-content")
          .textContent.includes("TEST FIXTURE ONLY"),
    );
    assert.doesNotMatch(
      await page.locator("#detail-content").innerText(),
      /No active NWS/,
    );
    await page.locator("#close-detail").click();
    await page.locator("[data-nav=forecast]").click();
    console.log(
      "PASS failed alert refresh retains unexpired warnings and removes expired warnings from an already open sheet",
    );
    mode = "bad";
    await page.locator("#refresh-weather").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#freshness").textContent === "SAVED · RETRYING",
    );
    assert.equal(await page.locator(".day").count(), 16);
    assert.match(await page.locator("#status").innerText(), /Refresh failed/);
    const badCalls = weatherCalls;
    await page.locator("#refresh-weather").click();
    assert.equal(weatherCalls, badCalls);
    console.log(
      "PASS invalid response retains good forecast and a manual tap cannot bypass source cooldown",
    );
    mode = "normal";
    await page.clock.fastForward(31000);
    // Hide/resume after a source becomes due. No requests begin while hidden.
    await page.evaluate(() =>
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      }),
    );
    const counts = [weatherCalls, airCalls, alertCalls];
    await page.clock.fastForward(600000);
    assert.deepEqual([weatherCalls, airCalls, alertCalls], counts);
    mode = "pending";
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForFunction(
      () => document.querySelector("#refresh-weather").disabled,
    );
    assert.equal(
      await page.locator("#selected-date").getAttribute("data-valid-at"),
      view.selected,
    );
    await page.locator("[data-nav=settings]").click();
    await page.locator("#source-freshness").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /iPhone pauses web apps/,
    );
    const pendingResume = pending.splice(0);
    assert.equal(pendingResume.length, 1);
    mode = "normal";
    await pendingResume[0].fulfill({ json: forecast(10) });
    await page.waitForFunction(
      () => !document.querySelector("#refresh-weather").disabled,
    );
    await page.locator("#close-detail").click();
    assert.ok(alertCalls > counts[2]);
    assert.equal(airCalls, counts[1] + 1);
    console.log(
      "PASS hidden phone stops source polling; resume rechecks independently and preserves absolute forecast selection",
    );
    await page.locator("#official-outlook").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#detail-content")
        .textContent.includes("Independent official narrative"),
    );
    assert.match(await page.locator("#detail-content").innerText(), /55°/);
    assert.match(await page.locator("#detail-content").innerText(), /EST/);
    assert.doesNotMatch(
      await page.locator("#detail-content").innerText(),
      /PAST PERIOD|Expired period/,
    );
    await page.locator("#close-detail").click();
    await page.locator("#station-observation").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#detail-content")
        .textContent.includes("Verified Nearby Station"),
    );
    assert.match(await page.locator("#detail-content").innerText(), /11 mph/);
    assert.equal(await page.locator("#temperature").innerText(), original);
    await page.locator("#close-detail").click();
    await page.evaluate(() => {
      for (const k of Object.keys(localStorage))
        if (k.startsWith("truecast-observation-")) localStorage.removeItem(k);
    });
    stationMode = "old";
    await page.locator("#station-observation").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#detail-content")
        .textContent.includes("No recent, quality-verified"),
    );
    await page.locator("#close-detail").click();
    console.log(
      "PASS official narrative plus verified recent station, wind conversion and stale/unverified station rejection",
    );
    // A failed alert request must never produce an all-clear, and expired warnings must disappear.
    mode = "alertfailure";
    await page.locator("#refresh-weather").click();
    await page.waitForFunction(
      () => document.querySelector("#alert-count").textContent === "!",
    );
    await page.locator("[data-nav=today]").click();
    await page.locator("#show-alerts").click();
    assert.match(
      await page.locator("#detail-content").innerText(),
      /unverified|could not be checked/i,
    );
    assert.doesNotMatch(
      await page.locator("#detail-content").innerText(),
      /No active NWS/,
    );
    assert.doesNotMatch(
      await page.locator("#detail-content").innerText(),
      /TEST FIXTURE ONLY/,
    );
    await page.locator("#close-detail").click();
    await context.setOffline(true);
    await page.waitForFunction(
      () =>
        document.querySelector("#freshness").textContent === "OFFLINE · SAVED",
    );
    assert.equal(await page.locator(".day").count(), 16);
    console.log(
      "PASS failed alerts never imply all-clear, expired warnings removed, offline forecast kept with explicit label",
    );
    mode = "normal";
    await context.setOffline(false);
    await page.clock.fastForward(2000);
    await page.waitForFunction(
      () => !document.querySelector("#refresh-weather").disabled,
    );
    mode = "pending";
    await page.locator("#refresh-weather").click();
    await page.waitForFunction(
      () => document.querySelector("#refresh-weather").disabled,
    );
    await page.route("https://geocoding-api.open-meteo.com/**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              name: "Los Angeles",
              latitude: 34.05,
              longitude: -118.24,
              country_code: "US",
              country: "United States",
            },
          ],
        },
      }),
    );
    await page.locator("#open-places").click();
    await page.locator("#city").fill("Los Angeles");
    await page.locator("#search button[type=submit]").click();
    await page.locator("#results button").first().click();
    await page.waitForFunction(
      () => document.querySelector("#place").textContent === "Los Angeles",
    );
    assert.equal(await page.locator("#temperature").innerText(), "—°");
    const oldPlace = pending.find(
      (r) =>
        new URL(r.request().url()).searchParams.get("latitude") === "40.7128",
    );
    const newPlace = pending.find(
      (r) =>
        new URL(r.request().url()).searchParams.get("latitude") === "34.05",
    );
    assert.ok(oldPlace && newPlace);
    await oldPlace.fulfill({ json: forecast(35) }).catch(() => {});
    assert.equal(await page.locator("#temperature").innerText(), "—°");
    mode = "normal";
    await newPlace.fulfill({ json: forecast(20) });
    await page.waitForFunction(
      () => document.querySelector("#temperature").textContent === "68°",
    );
    assert.equal(
      await page.locator("#header-place").innerText(),
      "Los Angeles",
    );
    console.log(
      "PASS switching locations rejects a late old-city response and never mixes the new place with old-city weather",
    );
    assert.deepEqual(errors, []);
    console.log("PASS zero uncaught errors in refresh and source flows");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
