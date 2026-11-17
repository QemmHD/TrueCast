import test from "node:test";
import assert from "node:assert/strict";
import { expandTimes, usableMapTimes, MAP_PRODUCTS } from "../weather-maps.js";
import { aqiCategory } from "../environment.js";
const now = Date.parse("2026-11-16T12:30Z"),
  reference = Date.parse("2026-11-16T12:00Z");
test("WMS advertised times expand with native cadence and reject invalid intervals", () => {
  const t = expandTimes(
    "2026-11-16T12:00Z/2026-11-16T15:00Z/PT1H,2026-11-16T15:00Z",
  );
  assert.equal(t.length, 4);
  assert.equal(t[1] - t[0], 3600000);
  assert.equal(
    expandTimes("2026-11-16T12:00Z/2026-11-17T12:00Z/PT15M").length,
    97,
  );
  assert.deepEqual(
    expandTimes("bad,nope/invalid/PT0H,2026-11-16/2026-11-15/P1D"),
    [],
  );
  assert.equal(expandTimes("2020-01-01/2030-01-01/PT1S", 20).length, 20);
});
test("future fields use published source times, same model run, and a bounded 72-hour horizon", () => {
  const times = expandTimes("2026-11-16T00:00Z/2026-11-21T00:00Z/PT1H");
  const usable = usableMapTimes({ times, reference }, { now, step: 10800 });
  assert.ok(usable.length >= 20);
  assert.ok(
    usable.every(
      (t) =>
        t > now && t <= now + 72 * 3600000 && (t - reference) % 10800000 === 0,
    ),
  );
  assert.equal(usable[0], Date.parse("2026-11-16T15:00Z"));
  assert.deepEqual(
    usableMapTimes({ times, reference: reference - 24 * 3600000 }, { now }),
    [],
  );
  assert.deepEqual(
    usableMapTimes({ times, reference: now + 120000 }, { now }),
    [],
  );
  assert.deepEqual(usableMapTimes({ times, reference: null }, { now }), []);
});
test("observed imagery cannot be shifted into the future or an old archive", () => {
  const times = [now - 9 * 3600000, now - 3600000, now - 900000, now + 120000];
  assert.deepEqual(usableMapTimes({ times }, { observed: true, now }), [
    now - 3600000,
    now - 900000,
  ]);
});
test("air quality zero is a measured model value, while missing data stays unavailable", () => {
  assert.equal(aqiCategory(0), "Good");
  assert.equal(aqiCategory(null), "Unavailable");
  assert.equal(aqiCategory(undefined), "Unavailable");
  assert.equal(aqiCategory(51), "Moderate");
  assert.equal(aqiCategory(151), "Unhealthy");
  assert.equal(aqiCategory(301), "Hazardous");
});

test("precipitation playback excludes the advertised three-hour gaps between real six-hour images", () => {
  const run = Date.parse("2026-11-16T18:00Z"),
    clock = Date.parse("2026-11-17T00:30Z");
  const times = expandTimes("2026-11-15T18:00Z/2026-11-24T00:00Z/PT3H");
  const frames = usableMapTimes(
    { times, reference: run },
    { now: clock, step: MAP_PRODUCTS.precip.step },
  );
  assert.equal(frames[0], Date.parse("2026-11-17T06:00Z"));
  assert.equal(frames[1], Date.parse("2026-11-17T12:00Z"));
  assert.ok(frames.every((t) => (t - run) % 21600000 === 0));
  assert.ok(!frames.includes(Date.parse("2026-11-17T03:00Z")));
  assert.ok(frames.length > 1);
});
