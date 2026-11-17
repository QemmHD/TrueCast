import test from "node:test";
import assert from "node:assert/strict";
import {
  hrrrFrames,
  windowFrames,
  nearestFrame,
  inHrrrRegion,
} from "../radar-timeline.js";
const now = Date.parse("2026-11-16T12:31Z");
const run = Date.parse("2026-11-16T11:00Z");
const metadata = {
  model_init_utc: new Date(run).toISOString(),
  model_forecast_utc: new Date(run + 18 * 3600000).toISOString(),
  forecast_minute: 1080,
};
test("HRRR uses an explicit fresh run and quarter-hour leads within six hours", () => {
  const f = hrrrFrames(metadata, now);
  assert.equal(f.length, 24);
  assert.ok(
    f.every(
      (x) =>
        x.time > now &&
        x.time <= now + 6 * 3600000 &&
        (x.time - run) % 900000 === 0,
    ),
  );
  assert.match(f[0].url, /REFD-F0105-202611161100/);
  assert.ok(f.every((x) => x.type === "forecast" && x.reference === run));
  for (const body of [
    {},
    { ...metadata, model_init_utc: new Date(now + 60000).toISOString() },
    { ...metadata, model_init_utc: new Date(now - 7 * 3600000).toISOString() },
    { ...metadata, model_forecast_utc: new Date(now + 3600000).toISOString() },
  ])
    assert.deepEqual(hrrrFrames(body, now), []);
});
test("radar windows retain native timestamps and reject future-dated observations", () => {
  const frames = [
    { time: now - 7 * 3600000, type: "observed" },
    { time: now - 3600000, type: "observed" },
    { time: now + 60000, type: "observed" },
    { time: now + 3600000, type: "forecast" },
    { time: now + 7 * 3600000, type: "forecast" },
  ];
  assert.deepEqual(
    windowFrames(frames, "both", now).map((f) => f.time),
    [now - 3600000, now + 3600000],
  );
  assert.equal(windowFrames(frames, "past", now).length, 1);
  assert.equal(windowFrames(frames, "future", now).length, 1);
  assert.equal(nearestFrame(frames, now + 59000), 2);
  assert.equal(nearestFrame([], now), -1);
  assert.equal(inHrrrRegion({ latitude: 40.7, longitude: -74 }), true);
  assert.equal(inHrrrRegion({ latitude: 51.5, longitude: -0.1 }), false);
});
