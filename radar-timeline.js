import { reducedMotion } from "./api.js";
import { $, node, json, store } from "./api.js";
import {
  parseMapMetadata,
  MAP_PRODUCTS,
  usableMapTimes,
} from "./weather-maps.js";
const MRMS = "https://nowcoast.noaa.gov/geoserver/weather_radar/wms";
const HRRR =
  "https://mesonet.agron.iastate.edu/data/gis/images/4326/hrrr/refd_1080.json";
const RV = "https://api.rainviewer.com/public/weather-maps.json";
export const inHrrrRegion = (p) =>
  p.latitude >= 24 &&
  p.latitude <= 50 &&
  p.longitude >= -126 &&
  p.longitude <= -66;
export function hrrrFrames(body, now = Date.now()) {
  const run = Date.parse(body?.model_init_utc),
    end = Date.parse(body?.model_forecast_utc);
  if (
    !Number.isFinite(run) ||
    run > now ||
    now - run > 6 * 3600000 ||
    !Number.isFinite(end) ||
    end < now + 6 * 3600000 ||
    Number(body.forecast_minute) !== 1080
  )
    return [];
  const stamp = new Date(run)
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 12),
    frames = [];
  for (let lead = 0; lead <= 1080; lead += 15) {
    const time = run + lead * 60000;
    if (time > now && time <= now + 6 * 3600000)
      frames.push({
        id: `hrrr-${run}-${lead}`,
        time,
        type: "forecast",
        source: "hrrr",
        reference: run,
        url: `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-F${String(lead).padStart(4, "0")}-${stamp}/{z}/{x}/{y}.png`,
        variable: "reflectivity",
      });
  }
  return frames;
}
export function nearestFrame(frames, time) {
  if (!frames.length) return -1;
  let best = 0;
  for (let i = 1; i < frames.length; i++)
    if (Math.abs(frames[i].time - time) < Math.abs(frames[best].time - time))
      best = i;
  return best;
}
export function windowFrames(
  frames,
  mode,
  now = Date.now(),
  pastMinutes = 360,
) {
  return frames
    .filter(
      (f) =>
        f.time >= now - pastMinutes * 60000 &&
        f.time <= now + 6 * 3600000 &&
        (f.type === "observed" ? f.time <= now : f.time > now) &&
        (mode === "both" ||
          (mode === "past" ? f.type === "observed" : f.type === "forecast")),
    )
    .sort((a, b) => a.time - b.time);
}

export function createRadarTimeline({
  getMap,
  getPlace,
  getTimezone,
  getOpacity,
  isActive,
  status,
}) {
  let all = [],
    frames = [],
    displayed = null,
    playing = false,
    moving = false,
    speed = 1,
    timer,
    operation = 0,
    loadGeneration = 0,
    request,
    lastCheck = 0,
    retryAt = 0,
    abort,
    coverageLayer,
    rvHost,
    rendering = false,
    tileError = false,
    failedFrame = null,
    tileRetryAt = 0;
  let mode = store.get("truecast-radar-window", "both");
  if (!["both", "past", "future"].includes(mode)) mode = "both";
  const cache = new Map(),
    errors = new Map();
  const format = (t) =>
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: getTimezone(),
      timeZoneName: "short",
    }).format(new Date(t));
  const remove = (l) => {
    if (l) getMap()?.removeLayer(l);
  };
  function playButton() {
    $("play").replaceChildren(
      node("span", null, playing ? "pause-icon" : "play-icon"),
    );
    $("play").setAttribute(
      "aria-label",
      playing ? "Pause radar animation" : "Play radar animation",
    );
  }
  function stop() {
    playing = false;
    clearTimeout(timer);
    playButton();
  }
  function disposeEntry(entry) {
    entry.resolve?.(false);
    remove(entry.layer);
    entry.layer.off();
    cache.delete(entry.frame.id);
  }
  function clear() {
    ++operation;
    for (const e of [...cache.values()]) disposeEntry(e);
    displayed = null;
    rendering = false;
    tileError = false;
    failedFrame = null;
    tileRetryAt = 0;
  }
  function deactivate() {
    stop();
    ++loadGeneration;
    abort?.abort();
    request = null;
    clear();
    remove(coverageLayer);
    coverageLayer = null;
    all = [];
    frames = [];
    lastCheck = 0;
    retryAt = 0;
    errors.clear();
  }
  function controls() {
    const available = windowFrames(all, "both");
    const past = available.filter((f) => f.type === "observed"),
      future = available.filter((f) => f.type === "forecast");
    document
      .querySelectorAll("[data-radar-window]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.radarWindow === mode)),
      );
    $("frame").min = frames[0]?.time || 0;
    $("frame").max = frames.at(-1)?.time || 0;
    $("frame").step = 1000;
    $("frame").disabled = !frames.length;
    $("play").disabled = frames.length < 2;
    if (displayed && !playing) $("frame").value = displayed.frame.time;
    $("radar-start").textContent = frames.length ? format(frames[0].time) : "—";
    $("radar-end").textContent = frames.length
      ? format(frames.at(-1).time)
      : "—";
    const span = frames.length ? frames.at(-1).time - frames[0].time : 0,
      percent = span ? (100 * (Date.now() - frames[0].time)) / span : 0;
    $("radar-now-marker").hidden = !(
      mode === "both" &&
      percent > 0 &&
      percent < 100
    );
    $("radar-now-marker").style.left = `${percent}%`;
    $("radar-availability").textContent =
      `${past.length ? `${Math.round((Date.now() - past[0].time) / 60000)} min past available` : "Past unavailable"} · ${future.length ? "up to 6h forecast" : "Forecast unavailable"}${inHrrrRegion(getPlace()) ? " · US composite / HRRR" : " · Global history is limited by RainViewer"}`;
    $("frame").dataset.frameCount = String(frames.length);
  }
  function caption(frame) {
    // The location timezone can arrive after the first map frame.
    $("radar-start").textContent = frames.length ? format(frames[0].time) : "—";
    $("radar-end").textContent = frames.length
      ? format(frames.at(-1).time)
      : "—";
    $("radar-time").textContent = `${format(frame.time)} local`;
    $("radar-time").dataset.validAt = String(frame.time);
    $("radar-time").dataset.frameType = frame.type;
    $("radar-time-kind").textContent =
      frame.type === "observed"
        ? "OBSERVED RADAR"
        : frame.source === "hrrr"
          ? "HRRR MODEL FORECAST"
          : "ICON PRECIPITATION FORECAST";
    $("radar-console").dataset.frameType = frame.type;
    $("frame").setAttribute(
      "aria-valuetext",
      `${frame.type === "observed" ? "Observed radar" : "Model forecast"}, ${format(frame.time)}`,
    );
    $("radar-age").textContent =
      frame.type === "observed"
        ? `${Math.max(0, Math.round((Date.now() - frame.time) / 60000))} min old`
        : `+${Math.max(0, Math.round((frame.time - Date.now()) / 60000))} min`;
    $("map-layer-label").textContent =
      frame.type === "observed"
        ? "OBSERVED PRECIPITATION"
        : "FORECAST PRECIPITATION";
    $("map-source").textContent =
      frame.source === "mrms"
        ? "NOAA / NWS MRMS · observed reflectivity · coverage varies"
        : frame.source === "hrrr"
          ? `NOAA HRRR via Iowa Environmental Mesonet · simulated reflectivity · run ${format(frame.reference)}`
          : frame.source === "icon"
            ? `© DWD ICON · 6h precipitation total ending ${format(frame.time)} · not radar reflectivity`
            : "RainViewer · observed radar · native zoom 7";
    $("radar-variable").textContent =
      frame.variable === "reflectivity" ? "REFLECTIVITY" : "6H PRECIP TOTAL";
    $("radar-blend-note").textContent =
      "Buffered frame blending · observation / forecast boundary is marked";
    status(
      !navigator.onLine
        ? "Offline · displayed frame is saved"
        : tileError
          ? "Frame tiles unavailable · previous frame retained"
          : errors.size
            ? `Some source checks failed · ${[...errors.keys()].join(", ")} unverified`
            : frame.type === "observed"
              ? "Observed radar · gaps are not an all-clear"
              : frame.source === "hrrr"
                ? "Model-simulated future radar · US coverage"
                : "Model precipitation total · different product from radar",
    );
  }
  function evict() {
    const protectedIds = new Set([displayed?.frame.id]);
    for (const entry of [...cache.values()].sort((a, b) => a.used - b.used))
      if (cache.size > 4 && !protectedIds.has(entry.frame.id) && !entry.pinned)
        disposeEntry(entry);
  }
  function entryFor(frame) {
    let e = cache.get(frame.id);
    if (e) {
      e.used = performance.now();
      return e;
    }
    const options = {
      pane: "weather",
      opacity: 0,
      maxZoom: 14,
      updateWhenIdle: true,
      keepBuffer: 1,
      crossOrigin: true,
    };
    let layer;
    if (frame.source === "mrms")
      layer = L.tileLayer.wms(MRMS, {
        ...options,
        layers: "conus_base_reflectivity_mosaic",
        format: "image/png",
        transparent: true,
        version: "1.1.1",
        time: new Date(frame.time).toISOString(),
        maxNativeZoom: 8,
      });
    else if (frame.source === "icon")
      layer = L.tileLayer.wms("https://maps.dwd.de/geoserver/wms", {
        ...options,
        layers: "dwd:Icon_reg025_fd_sl_TOTPREC06H",
        format: "image/png",
        transparent: true,
        version: "1.1.1",
        time: new Date(frame.time).toISOString(),
        dim_reference_time: new Date(frame.reference).toISOString(),
        maxNativeZoom: 6,
      });
    else layer = L.tileLayer(frame.url, { ...options, maxNativeZoom: 7 });
    e = {
      frame,
      layer,
      used: performance.now(),
      ready: false,
      bad: false,
      pinned: false,
      resolve: null,
      waiting: null,
    };
    cache.set(frame.id, e);
    function loading() {
      e.resolve?.(false);
      e.ready = false;
      e.bad = false;
      e.waiting = new Promise((resolve) => {
        e.resolve = resolve;
      });
    }
    loading();
    layer.on("loading", loading);
    layer.on("tileerror", () => {
      e.bad = true;
    });
    layer.on("load", () => {
      e.ready = !e.bad;
      e.resolve?.(e.ready);
    });
    layer.addTo(getMap());
    evict();
    return e;
  }
  async function ready(entry) {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (cache.get(entry.frame.id) !== entry) return false;
      if (entry.ready && !entry.layer.isLoading()) return true;
      const waiting = entry.waiting;
      let deadline;
      const ok = await Promise.race([
        waiting,
        new Promise((resolve) => {
          deadline = setTimeout(() => resolve(false), 12000);
        }),
      ]);
      clearTimeout(deadline);
      if (ok) return true;
      if (entry.waiting === waiting) return false;
    }
    return false;
  }
  function preload() {
    if (!displayed || !isActive() || document.hidden) return;
    const index = frames.findIndex((f) => f.id === displayed.frame.id);
    for (let j = 1; j <= 2; j++) {
      const frame = frames[(index + j + frames.length) % frames.length];
      if (frame && frame.id !== displayed.frame.id) entryFor(frame);
    }
  }
  async function show(index, { animate = false } = {}) {
    if (!isActive() || document.hidden || !frames[index]) return false;
    const frame = frames[index];
    if (frame.id === failedFrame && Date.now() < tileRetryAt) return false;
    const own = ++operation;
    rendering = true;
    if (displayed?.frame.id === frame.id) {
      caption(frame);
      $("frame").value = frame.time;
      rendering = false;
      preload();
      return true;
    }
    let e;
    try {
      e = entryFor(frame);
      e.pinned = true;
      const ok = await ready(e);
      if (own !== operation || !isActive()) return false;
      if (!ok) {
        tileError = true;
        failedFrame = frame.id;
        tileRetryAt = Date.now() + 10000;
        if (e !== displayed) disposeEntry(e);
        status("Frame tiles unavailable · previous frame retained");
        return false;
      }
      const old = displayed;
      for (const entry of cache.values())
        if (entry !== old && entry !== e) entry.layer.setOpacity(0);
      if (
        animate &&
        old &&
        old.frame.variable === frame.variable &&
        !reducedMotion()
      ) {
        const duration = 400 / speed,
          start = performance.now();
        $("radar-blend-note").textContent =
          `Blending ${format(old.frame.time)} → ${format(frame.time)}`;
        await new Promise((resolve) => {
          const draw = (now) => {
            if (own !== operation || !isActive() || document.hidden) {
              resolve();
              return;
            }
            const progress = Math.min(1, (now - start) / duration);
            e.layer.setOpacity(getOpacity() * progress);
            old.layer.setOpacity(getOpacity() * (1 - progress));
            $("frame").value =
              old.frame.time + (frame.time - old.frame.time) * progress;
            if (progress < 1) requestAnimationFrame(draw);
            else resolve();
          };
          requestAnimationFrame(draw);
        });
      }
      if (own !== operation || !isActive()) return false;
      if (old && old !== e) old.layer.setOpacity(0);
      e.layer.setOpacity(getOpacity());
      displayed = e;
      tileError = false;
      failedFrame = null;
      tileRetryAt = 0;
      $("frame").value = frame.time;
      caption(frame);
      preload();
      return true;
    } finally {
      if (e) e.pinned = false;
      if (own === operation) rendering = false;
      evict();
    }
  }
  async function step() {
    if (!playing || !isActive() || document.hidden) return;
    if (moving || rendering) {
      timer = setTimeout(step, 120);
      return;
    }
    let next = frames.findIndex((f) => f.time > (displayed?.frame.time || 0));
    if (next < 0) next = 0;
    const previous = displayed?.frame.time,
      ok = await show(next, { animate: true });
    if (!playing) return;
    if (!ok) {
      timer = setTimeout(step, 800);
      return;
    }
    const delta =
      previous && frames[next]
        ? Math.abs(frames[next].time - previous)
        : 300000;
    timer = setTimeout(
      step,
      Math.min(900, Math.max(80, (delta / 600000) * 250)) / speed,
    );
  }
  function rebuild() {
    const time = displayed?.frame.time || Date.now();
    frames = windowFrames(
      all,
      mode,
      Date.now(),
      Number($("loop-length").value),
    );
    controls();
    return nearestFrame(frames, time);
  }
  async function text(url, signal) {
    const r = await fetch(url, { signal, cache: "no-cache" });
    if (!r.ok) {
      const e = new Error(`Source ${r.status}`),
        retry = r.headers.get("retry-after");
      e.retryAt = retry
        ? Number.isFinite(Number(retry))
          ? Date.now() + Number(retry) * 1000
          : Date.parse(retry) || 0
        : 0;
      throw e;
    }
    return r.text();
  }
  async function collect() {
    const own = ++loadGeneration,
      us = inHrrrRegion(getPlace()),
      old = all,
      controller = new AbortController();
    abort = controller;
    const deadline = setTimeout(() => controller.abort(), 18000);
    const source = async (name, loader) => {
      try {
        const rows = await loader();
        if (own === loadGeneration) errors.delete(name);
        return rows;
      } catch (e) {
        if (own !== loadGeneration) return [];
        errors.set(name, e.message);
        retryAt = Math.max(retryAt, e.retryAt || Date.now() + 30000);
        return old.filter((f) => f.group === name);
      }
    };
    try {
      const rows = await Promise.all([
        source("past", async () => {
          if (us) {
            const m = parseMapMetadata(
              await text(
                `${MRMS}?service=WMS&version=1.3.0&request=GetCapabilities`,
                controller.signal,
              ),
              { layer: "conus_base_reflectivity_mosaic" },
            );
            return m.times
              .filter(
                (t) =>
                  t <= Date.now() + 60000 &&
                  t >= Date.now() - 6 * 3600000 - 300000,
              )
              .map((time) => ({
                id: `mrms-${time}`,
                time,
                type: "observed",
                source: "mrms",
                variable: "reflectivity",
                group: "past",
              }));
          }
          const r = await json(RV, {
            signal: controller.signal,
            cache: "no-cache",
          });
          if (!r.host?.startsWith("https://") || !Array.isArray(r.radar?.past))
            throw new Error("Missing radar");
          rvHost = r.host;
          return r.radar.past
            .filter((f) => f.time * 1000 <= Date.now() + 60000)
            .map((f) => ({
              id: `rv-${f.time}`,
              time: f.time * 1000,
              type: "observed",
              source: "rainviewer",
              group: "past",
              variable: "reflectivity",
              url: `${r.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
            }));
        }),
        source("future", async () => {
          if (us) {
            const r = await json(HRRR, {
                signal: controller.signal,
                cache: "no-cache",
              }),
              rows = hrrrFrames(r);
            if (!rows.length)
              throw new Error("No fresh HRRR run covering six hours");
            return rows.map((f) => ({ ...f, group: "future" }));
          }
          const product = MAP_PRODUCTS.precip,
            m = parseMapMetadata(
              await text(
                `https://maps.dwd.de/geoserver/dwd/${product.layer}/wms?service=WMS&version=1.3.0&request=GetCapabilities`,
                controller.signal,
              ),
              product,
            );
          return usableMapTimes(m, { step: product.step })
            .filter((t) => t <= Date.now() + 6 * 3600000 + product.step * 1000)
            .slice(0, 3)
            .map((time) => ({
              id: `icon-${m.reference}-${time}`,
              time,
              reference: m.reference,
              type: "forecast",
              source: "icon",
              group: "future",
              variable: "amount",
            }));
        }),
      ]);
      if (own !== loadGeneration || !isActive()) return;
      all = rows.flat().sort((a, b) => a.time - b.time);
      lastCheck = Date.now();
      if (!errors.size) retryAt = 0;
      const wasLatest =
        displayed?.frame.type === "observed" &&
        old.filter((f) => f.type === "observed").at(-1)?.id ===
          displayed.frame.id;
      const index = rebuild();
      if (!frames.length) {
        status(
          "Radar and forecast sources are unavailable. No all-clear can be inferred.",
        );
        return;
      }
      if (!displayed) {
        const live =
          frames.filter((f) => f.type === "observed").at(-1) || frames[0];
        await show(frames.indexOf(live));
      } else if (!playing && wasLatest && mode !== "future") {
        const latest = frames.filter((f) => f.type === "observed").at(-1);
        if (latest && latest.id !== displayed.frame.id)
          await show(frames.indexOf(latest));
        else caption(displayed.frame);
      } else {
        caption(displayed.frame);
        if (!frames.some((f) => f.id === displayed.frame.id) && !playing)
          await show(index);
      }
      $("coverage").disabled = us;
      if (us)
        $("coverage").title =
          "RainViewer coverage mask is available in global radar mode";
    } finally {
      clearTimeout(deadline);
    }
  }
  function refresh({ force = false } = {}) {
    if (!isActive() || document.hidden) return Promise.resolve();
    if (displayed) caption(displayed.frame);
    if (
      !navigator.onLine ||
      Date.now() < retryAt ||
      (!force && Date.now() - lastCheck < 10000)
    )
      return Promise.resolve();
    if (request) return request;
    const task = collect()
      .catch(() => {
        status("Timeline source unavailable · previous data retained");
        retryAt = Date.now() + 30000;
      })
      .finally(() => {
        if (request === task) request = null;
      });
    request = task;
    return task;
  }
  $("play").onclick = () => {
    if (playing) stop();
    else if (frames.length) {
      playing = true;
      playButton();
      preload();
      step();
    }
  };
  $("speed").onclick = () => {
    speed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1;
    $("speed").textContent = `${speed}×`;
    $("speed").setAttribute(
      "aria-label",
      `Radar speed ${speed} times. Change speed`,
    );
  };
  let scrubTimer;
  $("frame").oninput = () => {
    stop();
    clearTimeout(scrubTimer);
    const value = Number($("frame").value);
    scrubTimer = setTimeout(() => show(nearestFrame(frames, value)), 60);
  };
  document.querySelectorAll("[data-radar-window]").forEach(
    (b) =>
      (b.onclick = () => {
        stop();
        mode = b.dataset.radarWindow;
        store.set("truecast-radar-window", mode);
        const index = rebuild();
        if (index >= 0) show(index);
      }),
  );
  $("loop-length").onchange = () => {
    stop();
    const index = rebuild();
    if (index >= 0) show(index);
  };
  return {
    refresh,
    stop,
    deactivate,
    moving: (value) => {
      moving = value;
    },
    setOpacity: () => {
      if (displayed) displayed.layer.setOpacity(getOpacity());
    },
    setCoverage: () => {
      remove(coverageLayer);
      coverageLayer = null;
      if ($("coverage").checked && rvHost && !inHrrrRegion(getPlace())) {
        coverageLayer = L.tileLayer(
          `${rvHost}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`,
          { pane: "weather", maxNativeZoom: 7, maxZoom: 14, opacity: 0.6 },
        ).addTo(getMap());
      }
    },
    latest: async () => {
      await refresh({ force: true });
      const target =
        frames.filter((f) => f.type === "observed").at(-1) || frames[0];
      if (target) await show(frames.indexOf(target));
    },
    selectedTime: () =>
      displayed?.frame.type === "forecast" ? displayed.frame.time : null,
  };
}
