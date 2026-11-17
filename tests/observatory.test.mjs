import test from "node:test";
import assert from "node:assert/strict";
import {
  densityValue,
  densityLabel,
  lightningCoverage,
  lightningText,
  distanceKm,
  currentFireFeatures,
  outlookFeatures,
} from "../hazard-data.js";
import { moonIllumination, moonPhaseName } from "../celestial.js";
const now = Date.parse("2026-11-16T12:30Z"),
  place = { latitude: 35.714, longitude: -83.51 };
test("lightning density preserves zero and missing data and converts published scaled units", () => {
  const sample = (Band1) => ({ features: [{ properties: { Band1 } }] });
  assert.equal(densityValue(sample(0)), 0);
  assert.equal(densityValue(sample(20)), 0.02);
  assert.equal(densityLabel(0.00001), "<0.001");
  assert.equal(densityLabel(0), "0");
  for (const v of [null, undefined, -1, "0", NaN])
    assert.equal(densityValue(sample(v)), null);
  assert.equal(lightningCoverage(place), true);
  assert.equal(lightningCoverage({ latitude: 35, longitude: 80 }), false);
  assert.match(lightningText({ available: true, value: 0 }), /Zero density/);
  assert.match(
    lightningText({ available: true, value: null }),
    /No grid value/,
  );
});
test("reported fires reject old, distant, contained and malformed incident points and retain valid zero containment", () => {
  const fire = (coords, time, containment = 0) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: coords },
    properties: {
      ModifiedOnDateTime_dt: time,
      PercentContained: containment,
      IncidentSize: 0,
    },
  });
  const near = fire([-83.52, 35.72], now - 60000),
    old = fire([-83.52, 35.72], now - 8 * 86400000),
    far = fire([-118.2, 34], now),
    done = fire([-83.52, 35.72], now, 100),
    bad = fire([null, 35], now);
  const kept = currentFireFeatures(
    { features: [far, near, old, done, bad] },
    place,
    now,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].properties.PercentContained, 0);
  assert.ok(kept[0].distance < 2);
  assert.equal(distanceKm(place, [place.longitude, place.latitude]), 0);
});
test("storm outlooks reject expired and not-yet-valid polygons", () => {
  const f = (start, end, issued = now - 1000) => ({
    geometry: { type: "Polygon" },
    properties: {
      VALID_ISO: new Date(start).toISOString(),
      EXPIRE_ISO: new Date(end).toISOString(),
      ISSUE_ISO: new Date(issued).toISOString(),
    },
  });
  const valid = f(now - 10000, now + 10000);
  assert.deepEqual(
    outlookFeatures(
      {
        features: [
          valid,
          f(now - 20000, now - 1000),
          f(now + 120000, now + 240000),
          f(now - 10000, now + 10000, now + 120000),
        ],
      },
      now,
    ),
    [valid],
  );
});
test("calculated lunar illumination distinguishes known new and full moon dates", () => {
  const eclipse = moonIllumination(new Date("2017-08-21T18:26Z")),
    full = moonIllumination(new Date("2017-08-07T18:11Z"));
  assert.ok(eclipse.fraction < 0.01);
  assert.ok(full.fraction > 0.99);
  assert.equal(moonPhaseName(eclipse.phase), "New moon");
  assert.equal(moonPhaseName(full.phase), "Full moon");
});
