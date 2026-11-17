import test from "node:test";
import assert from "node:assert/strict";
import { RefreshResource, freshnessText } from "../refresh.js";
import {
  activeHourIndex,
  selectionAfterRefresh,
  validForecast,
} from "../forecast-time.js";
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function harness(options = {}) {
  let clock = 1000000,
    connected = true,
    shown = true;
  const memory = new Map(),
    states = [];
  if (options.cached) memory.set("x", options.cached);
  const r = new RefreshResource({
    key: "x",
    ttl: 1000,
    maxAge: 10000,
    loader: async () => ({ value: 2 }),
    validate: (d) => Number.isFinite(d?.value),
    storage: { get: (k) => memory.get(k), set: (k, v) => memory.set(k, v) },
    now: () => clock,
    online: () => connected,
    visible: () => shown,
    onState: (s) => states.push(s),
    ...options,
  });
  return {
    r,
    states,
    memory,
    advance: (n) => (clock += n),
    offline: () => (connected = false),
    online: () => (connected = true),
    hide: () => (shown = false),
  };
}
test("warm cache is visible while one coalesced refresh is pending", async () => {
  const d = deferred();
  let calls = 0;
  const h = harness({
    cached: { at: 999000, body: { value: 1 } },
    loader: () => {
      calls++;
      return d.promise;
    },
  });
  assert.equal(h.r.snapshot().data.value, 1);
  const a = h.r.refresh(),
    b = h.r.refresh({ force: true });
  assert.equal(a, b);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(h.r.snapshot().data.value, 1);
  assert.equal(h.r.snapshot().refreshing, true);
  d.resolve({ value: 2 });
  await a;
  assert.equal(h.r.snapshot().data.value, 2);
  assert.equal(h.r.snapshot().fresh, true);
  assert.equal(h.memory.get("x").body.value, 2);
});
test("failed refresh preserves data and checked time, obeying Retry-After even on manual refresh", async () => {
  let calls = 0;
  const h = harness({
    cached: { at: 999000, body: { value: 1 } },
    loader: () => {
      calls++;
      const e = new Error("rate limited");
      e.status = 429;
      e.retryAt = 1120000;
      throw e;
    },
  });
  await h.r.refresh();
  assert.equal(h.r.snapshot().checkedAt, 999000);
  assert.equal(h.r.snapshot().data.value, 1);
  assert.equal(h.r.snapshot().fresh, false);
  assert.match(freshnessText(h.r.snapshot()), /Refresh failed/);
  await h.r.refresh({ force: true });
  assert.equal(calls, 1);
  h.advance(120000);
  await h.r.refresh();
  assert.equal(calls, 2);
});
test("invalid response cannot overwrite good saved forecast", async () => {
  const h = harness({
    cached: { at: 999000, body: { value: 1 } },
    loader: async () => ({ garbage: true }),
  });
  await h.r.refresh();
  assert.equal(h.r.snapshot().data.value, 1);
  assert.match(h.r.snapshot().error.message, /invalid/);
  assert.equal(h.memory.get("x").body.value, 1);
});
test("offline never fetches, old cache expires and reconnect fetches", async () => {
  let calls = 0;
  const h = harness({
    cached: { at: 999000, body: { value: 1 } },
    loader: () => {
      calls++;
      return { value: 2 };
    },
  });
  h.offline();
  await h.r.tick();
  assert.equal(calls, 0);
  assert.match(freshnessText(h.r.snapshot()), /Offline/);
  h.advance(10000);
  assert.equal(h.r.snapshot().data, null);
  h.online();
  await h.r.tick();
  assert.equal(calls, 1);
  assert.equal(h.r.snapshot().data.value, 2);
});
test("hidden ticks do not start requests, disposed sources abort and reject late callbacks", async () => {
  let signal;
  const d = deferred();
  const h = harness({
    loader: ({ signal: s }) => {
      signal = s;
      return d.promise;
    },
  });
  h.hide();
  await h.r.tick();
  assert.equal(signal, undefined);
  const p = h.r.refresh();
  await Promise.resolve();
  assert.equal(signal.aborted, false);
  const count = h.states.length;
  h.r.dispose();
  assert.equal(signal.aborted, true);
  d.resolve({ value: 2 });
  await p;
  assert.equal(h.states.length, count);
  assert.equal(h.memory.has("x"), false);
});
test("recent fetch cannot disguise a delayed model valid time", async () => {
  const h = harness({
    loader: async () => ({ value: 2, time: 900000 }),
    validAt: (d) => d.time,
    sourceMaxAge: 10000,
  });
  await h.r.refresh();
  assert.equal(h.r.snapshot().delayed, true);
  assert.equal(h.r.snapshot().fresh, false);
  assert.match(freshnessText(h.r.snapshot()), /Source delayed/);
});
test("reject corrupted/future/over-age cache and respect source HTTP expiry", async () => {
  for (const cached of [
    { at: 1100000, body: { value: 1 } },
    { at: 0, body: { value: 1 } },
    { at: 999000, body: { no: 1 } },
  ])
    assert.equal(harness({ cached }).r.snapshot().data, null);
  let calls = 0;
  const h = harness({
    loader: () => {
      calls++;
      return { body: { value: 2 }, expiresAt: 1005000 };
    },
  });
  await h.r.refresh();
  h.advance(2000);
  await h.r.tick();
  assert.equal(calls, 1);
  h.advance(3000);
  await h.r.tick();
  assert.equal(calls, 2);
});
test("hour index includes the containing hour and distinguishes both DST 1 AMs", () => {
  const times = [
    "2026-11-01T04:00Z",
    "2026-11-01T05:00Z",
    "2026-11-01T06:00Z",
    "2026-11-01T07:00Z",
  ].map((t) => Date.parse(t) / 1000);
  assert.equal(activeHourIndex(times, Date.parse("2026-11-01T05:40Z")), 1);
  assert.equal(activeHourIndex(times, Date.parse("2026-11-01T06:15Z")), 2);
  assert.equal(
    selectionAfterRefresh(times[2], times, Date.parse("2026-11-01T05:40Z")),
    1,
  );
  assert.equal(
    selectionAfterRefresh(times[2], times, Date.parse("2026-11-01T06:15Z")),
    0,
  );
  assert.equal(
    activeHourIndex(times, Date.parse("2026-11-01T08:00Z")),
    times.length,
  );
});
test("forecast validator rejects empty, misaligned or invalid-zone data", () => {
  const hourly = { time: [1, 3601] },
    daily = { time: [1] };
  for (const k of [
    "temperature_2m",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "is_day",
    "visibility",
    "relative_humidity_2m",
    "apparent_temperature",
    "wind_gusts_10m",
  ])
    hourly[k] = [null, 3];
  for (const k of [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "sunrise",
    "sunset",
    "uv_index_max",
    "precipitation_probability_max",
    "precipitation_sum",
    "wind_speed_10m_max",
  ])
    daily[k] = [null];
  const d = {
    current: { time: 1 },
    timezone: "America/New_York",
    hourly,
    daily,
  };
  assert.equal(validForecast(d), true);
  assert.equal(validForecast({ ...d, timezone: "bad/zone" }), false);
  assert.equal(validForecast({ ...d, hourly: { ...hourly, time: [] } }), false);
  assert.equal(
    validForecast({ ...d, hourly: { ...hourly, time: [3601, 1] } }),
    false,
  );
  assert.equal(
    validForecast({ ...d, hourly: { ...hourly, temperature_2m: [4] } }),
    false,
  );
});

test("HTTP adapter parses numeric/date Retry-After and cache metadata, and forwards cancellation", async (t) => {
  const { json } = await import("../api.js");
  const now = Date.parse("2026-11-16T12:00Z");
  t.mock.method(Date, "now", () => now);
  let response = new Response("{}", {
      status: 429,
      headers: { "Retry-After": "120" },
    }),
    capturedSignal;
  t.mock.method(globalThis, "fetch", async (url, { signal }) => {
    capturedSignal = signal;
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    return response;
  });
  await assert.rejects(
    json("https://test.invalid/"),
    (e) => e.status === 429 && e.retryAt === now + 120000,
  );
  response = new Response("{}", {
    status: 503,
    headers: { "Retry-After": "Mon, 16 Nov 2026 12:05:00 GMT" },
  });
  await assert.rejects(
    json("https://test.invalid/"),
    (e) => e.status === 503 && e.retryAt === now + 300000,
  );
  response = new Response('{"value":1}', {
    headers: { "Cache-Control": "public, max-age=300", Age: "60" },
  });
  const cached = await json("https://test.invalid/", { metadata: true });
  assert.equal(cached.expiresAt, now + 240000);
  assert.deepEqual(cached.body, { value: 1 });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    json("https://test.invalid/", { signal: controller.signal }),
    { name: "AbortError" },
  );
  assert.equal(capturedSignal.aborted, true);
});
test("foreground policy revalidates after ten seconds even with a later HTTP expiry", async () => {
  let calls = 0;
  const h = harness({
    ttl: 10000,
    maxAge: 100000,
    respectExpiry: false,
    loader: async () => {
      calls++;
      return { body: { value: 2 }, expiresAt: 2000000 };
    },
  });
  await h.r.refresh();
  h.advance(9999);
  await h.r.refresh();
  assert.equal(calls, 1);
  h.advance(1);
  await h.r.refresh();
  assert.equal(calls, 2);
});
