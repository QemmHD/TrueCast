import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  rankWindows,
  forecastSignals,
  modelTemperatureSpread,
  windowCalendar,
} from "../weather-intelligence.js";
import { chartHourAt, CHART } from "../forecast-chart.js";
import { createImageBuffer } from "../image-buffer.js";
const require = createRequire(import.meta.url),
  { forecast, epoch } = require("./fixtures.cjs");
function suitable() {
  const d = forecast(18);
  d.hourly.precipitation = d.hourly.time.map(() => 0);
  d.hourly.precipitation_probability = d.hourly.time.map(() => 5);
  d.hourly.wind_speed_10m = d.hourly.time.map(() => 8);
  return d;
}
test("outdoor windows start in the future, fit the whole horizon and never overlap", () => {
  const d = suitable(),
    r = rankWindows(d, { now: epoch, duration: 3 });
  assert.equal(r.length, 3);
  assert.ok(
    r.every(
      (w) =>
        w.start >= epoch / 1000 &&
        w.end <= epoch / 1000 + 72 * 3600 &&
        w.end - w.start === 10800,
    ),
  );
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++)
      assert.ok(r[i].end <= r[j].start || r[j].end <= r[i].start);
});
test("ranking can choose a calmer later window while Soonest keeps chronological priority", () => {
  const d = suitable();
  for (let i = 13; i < 17; i++) d.hourly.wind_speed_10m[i] = 24;
  const earliest = rankWindows(d, {
      now: epoch,
      duration: 2,
      priority: "earliest",
    }),
    calm = rankWindows(d, { now: epoch, duration: 2, priority: "calm" });
  assert.equal(earliest[0].start, d.hourly.time[13]);
  assert.ok(calm[0].start > earliest[0].start);
  assert.ok(calm[0].maxWind < earliest[0].maxWind);
});
test("missing rain data, nighttime, storms and gaps cannot produce a complete outdoor window", () => {
  for (const mutate of [
    (d) => d.hourly.precipitation.fill(null),
    (d) => d.hourly.wind_gusts_10m.fill(null),
    (d) => d.hourly.wind_gusts_10m.fill(80),
    (d) => d.hourly.is_day.fill(0),
    (d) => d.hourly.weather_code.fill(95),
  ]) {
    const d = suitable();
    mutate(d);
    assert.equal(rankWindows(d, { now: epoch }).length, 0);
  }
  const d = suitable();
  d.hourly.is_day.fill(0);
  d.hourly.is_day[13] = 1;
  d.hourly.is_day[14] = 1;
  d.hourly.time[14] += 3600;
  assert.equal(rankWindows(d, { now: epoch, duration: 2 }).length, 0);
});
test("forecast signals preserve unknown rain and do not turn missing values into a dry forecast", () => {
  const d = suitable();
  d.hourly.precipitation_probability.fill(null);
  assert.equal(
    forecastSignals(d, epoch).some((x) => x.kind === "rain"),
    false,
  );
  d.hourly.precipitation_probability.fill(0);
  const dry = forecastSignals(d, epoch).find((x) => x.kind === "rain");
  assert.equal(dry.value, 0);
  d.hourly.precipitation_probability[14] = 70;
  assert.equal(
    forecastSignals(d, epoch).find((x) => x.kind === "rain").time,
    d.hourly.time[14],
  );
});
test("model spread needs multiple available models and preserves a genuine zero temperature", () => {
  assert.equal(
    modelTemperatureSpread({ temperature_2m_gfs_seamless: [0] }, 0),
    null,
  );
  assert.deepEqual(
    modelTemperatureSpread(
      {
        temperature_2m_gfs_seamless: [0],
        temperature_2m_icon_seamless: [5],
        temperature_2m_ecmwf_ifs025: [null],
      },
      0,
    ),
    { min: 0, max: 5, count: 2 },
  );
});
test("calendar export uses UTC across DST, escapes text and folds UTF-8 lines", () => {
  const start = Date.parse("2026-11-01T06:00Z") / 1000,
    text = windowCalendar(
      { start, end: start + 7200, activity: "walk" },
      { name: "Gatlinburg, TN; Café\nPark", latitude: 35.7, longitude: -83.5 },
      "Forecast ".repeat(30),
      epoch,
    );
  const flat = text.replace(/\r\n /g, "");
  assert.match(flat, /DTSTART:20261101T060000Z/);
  assert.match(flat, /DTEND:20261101T080000Z/);
  assert.match(flat, /Gatlinburg\\, TN\\; Café\\nPark/);
  for (const line of text.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.throws(() => windowCalendar({ start, end: start - 1 }, { name: "X" }));
});
test("chart scrubbing maps the actual plot extent and clamps either edge", () => {
  const rect = { left: 100, width: 320 };
  const px = (x) => 100 + (x / CHART.width) * rect.width;
  assert.equal(chartHourAt(px(CHART.left), rect, 24), 0);
  assert.equal(chartHourAt(px(CHART.right), rect, 24), 23);
  assert.equal(chartHourAt(px((CHART.left + CHART.right) / 2), rect, 25), 12);
  assert.equal(chartHourAt(-20, rect, 24), 0);
  assert.equal(chartHourAt(1000, rect, 24), 23);
});
function images() {
  const made = [];
  return {
    made,
    makeImage() {
      const image = {
        naturalWidth: 0,
        complete: false,
        onload: null,
        onerror: null,
        crossOrigin: "",
        src: "",
      };
      made.push(image);
      return image;
    },
    finish(image) {
      image.complete = true;
      image.naturalWidth = 256;
      image.onload?.();
    },
  };
}
test("image buffering coalesces downloads and retains the protected verified frame under a bounded cache", async () => {
  const f = images(),
    b = createImageBuffer({ limit: 2, makeImage: () => f.makeImage() });
  const a = b.load("A"),
    same = b.load("A");
  assert.equal(a, same);
  f.finish(f.made[0]);
  await a;
  b.protect(["A"]);
  const second = b.load("B");
  f.finish(f.made[1]);
  await second;
  const third = b.load("C");
  f.finish(f.made[2]);
  await third;
  assert.equal(b.size, 2);
  assert.equal(await b.load("A"), f.made[0]);
  b.clear({ except: ["A"] });
  assert.equal(b.size, 1);
  b.clear();
  assert.equal(b.size, 0);
});
test("a failed or cancelled image does not become a verified cached frame or block a retry", async () => {
  const f = images(),
    b = createImageBuffer({ makeImage: () => f.makeImage() });
  const bad = b.load("bad");
  f.made[0].onerror();
  await assert.rejects(bad);
  assert.equal(b.size, 0);
  const retry = b.load("bad");
  f.finish(f.made[1]);
  assert.equal(await retry, f.made[1]);
  const pending = b.load("cancel");
  const check = assert.rejects(pending);
  b.clear();
  await check;
  assert.equal(b.size, 0);
});
