import { reducedMotion } from "./api.js";
import { createImageBuffer } from "./image-buffer.js";
import { $, node, store } from "./api.js";

export const MAP_PRODUCTS = {
  precip: {
    layer: "Icon_reg025_fd_sl_TOTPREC06H",
    title: "Precipitation",
    description:
      "Six-hour precipitation total ending at the selected time. Includes liquid-water equivalent of rain and snow.",
    // The advertised WMS interval is 3h, but this product has native 6h frames.
    step: 21600,
    window: 21600,
  },
  temperature: {
    layer: "Icon_reg025_fd_sl_T2M",
    title: "Temperature",
    description: "Model air temperature two metres above the surface.",
    step: 3600,
  },
  wind: {
    layer: "Icon_reg025_fd_sl_UV10M",
    title: "Surface wind",
    description:
      "DWD wind barbs show model wind at 10 metres. Open a point forecast for local speed values. Surface wind is not storm-cell motion.",
    step: 3600,
  },
  pressure: {
    layer: "Icon_reg025_fd_sl_PMSL",
    title: "Pressure",
    description:
      "Model mean sea-level pressure contours. Contour labels are hPa.",
    step: 3600,
  },
  satellite: {
    url: "https://nowcoast.noaa.gov/geoserver/satellite/wms",
    layer: "satellite:global_longwave_imagery_mosaic",
    title: "Satellite infrared",
    description:
      "Observed thermal-infrared cloud and surface patterns, including at night. Global mosaic coverage is approximately 60°S–60°N; data can lag by hours. Bright clouds are not a direct rainfall measurement.",
    observed: true,
    ttl: 900000,
  },
  lightning: {
    url: "https://nowcoast.noaa.gov/geoserver/lightning_detection/wms",
    layer: "lightning_detection:ldn_lightning_strike_density",
    title: "Lightning density",
    description:
      "Observed lightning density over a 15-minute period, on an approximately 8 × 8 km grid. This is a public NOAA-derived product using NLDN/GLD360 inputs, not individual strike locations or a nearest-strike distance. Main coverage: Americas and adjacent oceans, 25°S–80°N; absence of plotted data is not an all-clear.",
    observed: true,
    ttl: 300000,
  },
};

export function expandTimes(text, limit = 1200) {
  const result = [];
  for (const part of (text || "").trim().split(",")) {
    if (!part) continue;
    const bits = part.trim().split("/");
    if (bits.length === 1) {
      const t = Date.parse(bits[0]);
      if (Number.isFinite(t)) result.push(t);
      continue;
    }
    if (bits.length !== 3) continue;
    const from = Date.parse(bits[0]),
      to = Date.parse(bits[1]);
    const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
      bits[2],
    );
    const step = m
      ? ((Number(m[1] || 0) * 24 + Number(m[2] || 0)) * 3600 +
          Number(m[3] || 0) * 60 +
          Number(m[4] || 0)) *
        1000
      : 0;
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      step <= 0 ||
      to < from
    )
      continue;
    for (let t = from; t <= to && result.length < limit; t += step)
      result.push(t);
  }
  return [...new Set(result)].sort((a, b) => a - b).slice(0, limit);
}
export function usableMapTimes(
  metadata,
  { observed = false, now = Date.now(), step = 3600 } = {},
) {
  if (observed)
    return metadata.times.filter(
      (t) => t <= now + 60000 && t >= now - 8 * 3600000,
    );
  if (
    !Number.isFinite(metadata.reference) ||
    metadata.reference > now + 60000 ||
    now - metadata.reference > 18 * 3600000
  )
    return [];
  return metadata.times.filter(
    (t) =>
      t > now &&
      t <= now + 72 * 3600000 &&
      t >= metadata.reference &&
      t <= metadata.reference + 180 * 3600000 &&
      (t - metadata.reference) % (step * 1000) === 0,
  );
}
export function parseMapMetadata(xml, product) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror, ServiceException, ExceptionText"))
    throw new Error("The map service returned an error");
  const bare = product.layer.split(":").at(-1);
  const layer = [...doc.getElementsByTagNameNS("*", "Layer")].find((l) =>
    [...l.children].some(
      (c) =>
        c.localName === "Name" &&
        (c.textContent === product.layer || c.textContent === bare),
    ),
  );
  if (!layer) throw new Error("Map product is missing");
  const dimensions = [...layer.children].filter(
    (c) => c.localName === "Dimension",
  );
  const times = expandTimes(
    dimensions.find((d) => d.getAttribute("name")?.toLowerCase() === "time")
      ?.textContent,
  );
  const referenceDimension = dimensions.find(
    (d) => d.getAttribute("name")?.toUpperCase() === "REFERENCE_TIME",
  );
  const reference = Math.max(...expandTimes(referenceDimension?.textContent));
  const legend = layer
    .getElementsByTagNameNS("*", "LegendURL")[0]
    ?.getElementsByTagNameNS("*", "OnlineResource")[0]
    ?.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  if (!times.length) throw new Error("No source map times");
  return {
    times,
    reference: Number.isFinite(reference) ? reference : null,
    legend: legend?.startsWith("https://") ? legend : null,
  };
}

const PRECIP_COLORS = [
  "#dcf7c3",
  "#00e601",
  "#008017",
  "#33b9ff",
  "#007dff",
  "#ffc040",
  "#ff0000",
  "#fe00ff",
];
// DWD default SLD color-map labels, verified 16 November 2026 against GetStyles.
const SOURCE_PALETTES = {
  temperature: [
    { color: "#fff7f3", label: " < -60 \u00b0C" },
    { color: "#fde0dd", label: " -60 ... -55" },
    { color: "#fcc5c0", label: " -55 ... -50" },
    { color: "#fa9fb5", label: " -50 ... -45" },
    { color: "#f768a1", label: " -45 ... -40" },
    { color: "#dd3497", label: " -40 ... -35" },
    { color: "#ae017e", label: " -35 ... -30" },
    { color: "#7a0177", label: " -30 ... -25" },
    { color: "#680099", label: " -25 ... -20" },
    { color: "#0570b0", label: " -20 ... -15" },
    { color: "#74a9cf", label: " -15 ... -10" },
    { color: "#bdc9e1", label: " -10 ... -5" },
    { color: "#edf8fb", label: " -5 ... 0" },
    { color: "#c7e9b4", label: " 0 ... 5" },
    { color: "#ffffb2", label: " 5 ... 10" },
    { color: "#fed976", label: " 10 ... 15" },
    { color: "#feb24c", label: " 15 ... 20" },
    { color: "#fd8d3c", label: " 20 ... 25" },
    { color: "#fc4e2a", label: " 25 ... 30" },
    { color: "#e31a1c", label: " 30 ... 35" },
    { color: "#b10026", label: " 35 ... 40" },
    { color: "#4D0000", label: " > 40" },
  ],
  precip: [
    { color: "#000000", label: " < 0.1 mm", opacity: "0.078431375" },
    { color: "#DCF7C3", label: " 0.1 - 0.5" },
    { color: "#B9F77C", label: " 0.5 - 1.0" },
    { color: "#00E601", label: " 1 - 2" },
    { color: "#00BF01", label: " 2 - 5" },
    { color: "#008017", label: " 5 - 10" },
    { color: "#33B9FF", label: " 10 - 15" },
    { color: "#007DFF", label: " 15 - 20" },
    { color: "#FFC040", label: " 20 - 25" },
    { color: "#E69900", label: " 25 - 30" },
    { color: "#B37700", label: " 30 - 35" },
    { color: "#FF0000", label: " 35 - 40" },
    { color: "#CC0000", label: " 40 - 50" },
    { color: "#A60000", label: " 50 - 60" },
    { color: "#FE00FF", label: " 60 - 70" },
    { color: "#D800D9", label: " 70 - 80" },
    { color: "#BC00BF", label: " 80 - 90" },
    { color: "#A500A6", label: " 90 - 100" },
    { color: "#C7B3FF", label: " 100 - 150" },
    { color: "#AA8CFF", label: " 150 - 200" },
    { color: "#8E66FF", label: " 200 - 300" },
    { color: "#FFFFFF", label: " > 300" },
  ],
};
export function createWeatherMaps({
  getMap,
  getPlace,
  getTimezone,
  getUnit,
  getMeasurements,
  isActive,
  status,
  showSheet,
  getOpacity = () => 0.75,
}) {
  let mode = "forecast",
    product = "precip",
    metadata,
    times = [],
    requestedIndex = 0,
    displayed,
    candidate,
    overlay,
    requestToken = 0,
    controller,
    timer,
    playing = false,
    moving = false,
    playingTask = false,
    playTimer,
    refreshing = false,
    retryAt = 0,
    activation = 0,
    viewQueued = false,
    lightningMinutes = 30;
  const metadataCache = new Map(),
    imageBuffer = createImageBuffer();
  const spec = () => MAP_PRODUCTS[mode === "forecast" ? product : mode];
  const short = (t) =>
    new Intl.DateTimeFormat("en", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: getTimezone(),
      timeZoneName: "short",
    }).format(new Date(t));
  function stop() {
    playing = false;
    clearTimeout(playTimer);
    $("weather-play").replaceChildren(node("span", null, "play-icon"));
    $("weather-play").setAttribute("aria-label", "Play weather map timeline");
  }
  function remove(layer) {
    if (layer) getMap()?.removeLayer(layer);
  }
  function cancel() {
    ++requestToken;
    controller?.abort();
    imageBuffer.clear({ except: [displayed?.url] });
    remove(candidate);
    candidate = null;
    clearTimeout(timer);
  }
  function hide() {
    ++activation;
    refreshing = false;
    viewQueued = false;
    stop();
    cancel();
    remove(overlay);
    overlay = null;
    displayed = null;
    imageBuffer.clear();
    metadata = null;
    times = [];
  }
  function renderLegend() {
    const visibleProduct =
      mode === "forecast" && displayed ? displayed.product : product;
    const legend = $("weather-legend");
    legend.replaceChildren();
    if (
      mode === "forecast" &&
      (visibleProduct === "temperature" || visibleProduct === "precip")
    ) {
      const colors =
        visibleProduct === "precip"
          ? PRECIP_COLORS
          : [
              "#0570b0",
              "#bdc9e1",
              "#c7e9b4",
              "#ffffb2",
              "#feb24c",
              "#fc4e2a",
              "#b10026",
            ];
      const gradient = node("i");
      gradient.style.background = `linear-gradient(90deg,${colors.join(",")})`;
      const labels =
        visibleProduct === "temperature"
          ? [-15, -5, 5, 10, 20, 30, 40].map(
              (n) => `${Math.round(getUnit() === "F" ? n * 1.8 + 32 : n)}°`,
            )
          : getMeasurements() === "imperial"
            ? ["0.02", "0.08", "0.39", "0.59", "0.79", "0.98", "1.57", "2.76+"]
            : ["0.5", "2", "10", "15", "20", "25", "40", "70+"];
      const row = node("div", null, "map-scale-labels");
      labels.forEach((t) => row.append(node("span", t)));
      legend.append(
        node(
          "small",
          visibleProduct === "temperature"
            ? `TEMPERATURE · °${getUnit()}`
            : `6H TOTAL · ${getMeasurements() === "imperial" ? "IN" : "MM"}`,
        ),
        gradient,
        row,
      );
    } else
      legend.append(
        node(
          "p",
          mode === "lightning"
            ? "15-minute density · 8 km grid"
            : mode === "satellite"
              ? "Thermal infrared · observed cloud patterns"
              : visibleProduct === "pressure"
                ? "Mean sea-level isobars · hPa"
                : "10 m wind · source wind barbs",
          "fine",
        ),
      );
  }
  function announceFrame() {
    if (displayed)
      window.dispatchEvent(
        new CustomEvent("truecast:map-frame", {
          detail: {
            mode,
            product: displayed.product,
            time: displayed.time,
            reference: displayed.reference,
          },
        }),
      );
  }
  function presentation() {
    const p =
      mode === "forecast" && displayed
        ? MAP_PRODUCTS[displayed.product]
        : spec();
    document
      .querySelectorAll("[data-map-product]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.mapProduct === product),
        ),
      );
    $("forecast-products").hidden = mode !== "forecast";
    $("lightning-history").hidden = mode !== "lightning";
    document
      .querySelectorAll("[data-lightning-history]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.lightningHistory) === lightningMinutes),
        ),
      );
    $("weather-frame").max = Math.max(0, times.length - 1);
    $("weather-frame").value = requestedIndex;
    $("weather-frame").disabled = !times.length || refreshing;
    $("weather-play").disabled = times.length < 2 || refreshing;
    $("weather-start").textContent = times.length ? short(times[0]) : "—";
    $("weather-end").textContent = times.length ? short(times.at(-1)) : "—";
    $("weather-time-kind").textContent =
      mode === "forecast"
        ? `${displayed && displayed.time <= Date.now() ? "SAVED MODEL" : "FUTURE"} · ${p.title.toUpperCase()}`
        : `OBSERVED · ${p.title.toUpperCase()}`;
    $("map-layer-label").textContent =
      mode === "forecast"
        ? `ICON MODEL · ${p.title.toUpperCase()}`
        : p.title.toUpperCase();
    $("weather-source").textContent =
      mode === "forecast"
        ? "© DWD · ICON 0.25° · model forecast, not radar"
        : mode === "satellite"
          ? "NOAA / NESDIS GMGSI · observed infrared mosaic"
          : "NOAA / OPC · derived NLDN / GLD360 lightning density";
    $("weather-time").textContent = displayed
      ? short(displayed.time)
      : "Choose a forecast time";
    if (displayed) $("weather-time").dataset.validAt = String(displayed.time);
    else delete $("weather-time").dataset.validAt;
    $("weather-run").textContent =
      mode === "forecast" && metadata
        ? `Run ${short(displayed?.reference || metadata.reference)}${p.window ? ` · 6h ending ${short(displayed?.time || times[requestedIndex])}` : ""}`
        : displayed
          ? `Frame ${Math.max(0, Math.round((Date.now() - displayed.time) / 60000))} min old`
          : "Checking source times…";
    renderLegend();
  }
  async function readMetadata(force = false) {
    const p = spec(),
      key = p.layer,
      ttl = p.ttl || 3600000;
    let cached =
      metadataCache.get(key) || store.get(`truecast-map-v4-${key}`, null);
    if (!force && cached && Date.now() - cached.at < ttl) {
      metadataCache.set(key, cached);
      return cached.body;
    }
    const url = p.url || `https://maps.dwd.de/geoserver/dwd/${p.layer}/wms`;
    const thisController = controller;
    const deadline = setTimeout(() => thisController.abort(), 18000);
    let response, body;
    try {
      response = await fetch(
        `${url}?service=WMS&version=1.3.0&request=GetCapabilities`,
        { signal: controller.signal, cache: "no-cache" },
      );
      if (!response.ok) {
        const e = new Error(`Map metadata ${response.status}`);
        const delay = Number(response.headers.get("retry-after"));
        e.retryAt =
          Number.isFinite(delay) && delay > 0 ? Date.now() + delay * 1000 : 0;
        throw e;
      }
      body = parseMapMetadata(await response.text(), p);
    } finally {
      clearTimeout(deadline);
    }
    cached = { at: Date.now(), body };
    metadataCache.set(key, cached);
    store.set(`truecast-map-v4-${key}`, cached);
    return body;
  }
  function frameRequest(time) {
    const p = spec(),
      map = getMap();
    const bounds = map.getBounds(),
      west = Math.max(-180, bounds.getWest()),
      east = Math.min(180, bounds.getEast()),
      south = Math.max(-85, bounds.getSouth()),
      north = Math.min(85, bounds.getNorth());
    if (east <= west || north <= south) {
      return null;
    }
    const sw = L.CRS.EPSG3857.project(L.latLng(south, west)),
      ne = L.CRS.EPSG3857.project(L.latLng(north, east)),
      size = map.getSize();
    const params = new URLSearchParams({
      service: "WMS",
      version: "1.1.1",
      request: "GetMap",
      layers: p.layer.startsWith("Icon") ? `dwd:${p.layer}` : p.layer,
      styles: "",
      srs: "EPSG:3857",
      bbox: [sw.x, sw.y, ne.x, ne.y].join(","),
      width: String(Math.min(1400, Math.max(512, Math.round(size.x * 1.5)))),
      height: String(Math.min(1600, Math.max(512, Math.round(size.y * 1.5)))),
      format: "image/png",
      transparent: "true",
      time: new Date(time).toISOString(),
    });
    if (!p.observed)
      params.set(
        "dim_reference_time",
        new Date(metadata.reference).toISOString(),
      );
    const url = `${p.url || "https://maps.dwd.de/geoserver/wms"}?${params}`;
    return {
      url,
      bounds: [
        [south, west],
        [north, east],
      ],
    };
  }
  async function show(index, forceView = false) {
    if (!isActive() || document.hidden || !times.length) return false;
    const time = times[index];
    if (!Number.isFinite(time)) return false;
    requestedIndex = index;
    const own = ++requestToken,
      p = spec(),
      map = getMap();
    remove(candidate);
    candidate = null;
    const currentProduct = mode === "forecast" ? product : mode;
    presentation();
    if (
      !forceView &&
      displayed?.time === time &&
      displayed.product === currentProduct
    ) {
      status(
        mode === "forecast"
          ? "Model forecast · not observed radar"
          : "Observed map · gaps are not an all-clear",
      );
      announceFrame();
      return true;
    }
    if (!navigator.onLine) {
      status("Offline · displayed weather map is saved");
      return false;
    }
    status(
      `Loading ${p.title.toLowerCase()} frame${displayed ? " · previous image remains labeled" : ""}…`,
    );
    const request = frameRequest(time);
    if (!request) {
      status("Move the map into a supported geographic view.");
      return false;
    }
    const { url, bounds } = request;
    if (displayed?.url === url && overlay?.getElement()?.isConnected) {
      overlay.setBounds(bounds);
      overlay.setOpacity(getOpacity());
      presentation();
      announceFrame();
      status(
        mode === "forecast"
          ? "Forecast field · not observed radar"
          : "Observed map · gaps are not an all-clear",
      );
      return true;
    }
    imageBuffer.protect([displayed?.url, url]);
    let element,
      success = false,
      image;
    try {
      element = await imageBuffer.load(url);
      success = element.complete && element.naturalWidth > 0;
    } catch {}
    if (own !== requestToken || !isActive()) return false;
    if (success) {
      image = L.imageOverlay(element, bounds, {
        pane: "weather",
        opacity: 0,
        interactive: false,
        crossOrigin: true,
      });
      candidate = image;
      image.addTo(map);
    }
    if (own !== requestToken || !isActive()) {
      remove(image);
      return false;
    }
    candidate = null;
    if (!success) {
      remove(image);
      retryAt = Date.now() + 60000;
      status(
        displayed
          ? `Frame unavailable · still showing ${short(displayed.time)}`
          : "Map image unavailable. Try Refresh.",
      );
      if (displayed) {
        if (mode === "forecast") product = displayed.product;
        metadata = displayed.metadata;
        times = displayed.times;
        requestedIndex = Math.max(0, times.indexOf(displayed.time));
        presentation();
      }
      stop();
      return false;
    }
    const previous = overlay;
    if (previous && !moving && !reducedMotion()) {
      const start = performance.now();
      await new Promise((resolve) => {
        const blend = (at) => {
          if (own !== requestToken || !isActive() || document.hidden) {
            resolve();
            return;
          }
          const progress = Math.min(1, (at - start) / 350);
          image.setOpacity(getOpacity() * progress);
          previous.setOpacity(getOpacity() * (1 - progress));
          if (progress < 1) requestAnimationFrame(blend);
          else resolve();
        };
        requestAnimationFrame(blend);
      });
    }
    if (own !== requestToken || !isActive()) {
      remove(image);
      return false;
    }
    overlay = image;
    overlay.setOpacity(getOpacity());
    remove(previous);
    displayed = {
      product: currentProduct,
      url,
      time,
      reference: metadata.reference,
      metadata,
      times: [...times],
    };
    retryAt = 0;
    imageBuffer.protect([url]);
    if (playing && !moving) {
      const urls = [1, 2].map(
        (offset) => frameRequest(times[(index + offset) % times.length])?.url,
      );
      imageBuffer.prefetch(urls);
    }
    presentation();
    announceFrame();
    const place = getPlace(),
      outside =
        mode === "lightning" &&
        (place.latitude < -25 ||
          place.latitude > 80 ||
          (place.longitude > 0 && place.longitude < 110));
    status(
      outside
        ? "Selected place is outside main lightning coverage. Gaps are not an all-clear."
        : mode === "forecast"
          ? "Forecast field · not observed radar"
          : mode === "satellite"
            ? "Observed satellite · cloud patterns, not rainfall"
            : "Lightning density · gaps are not an all-clear",
    );
    return true;
  }
  async function activate(
    nextMode,
    { force = false, product: nextProduct } = {},
  ) {
    if (
      nextProduct &&
      MAP_PRODUCTS[nextProduct] &&
      !MAP_PRODUCTS[nextProduct].observed
    )
      product = nextProduct;
    const activationId = ++activation;
    stop();
    cancel();
    if (nextMode !== mode) {
      remove(overlay);
      overlay = null;
      displayed = null;
      metadata = null;
      times = [];
    }
    mode = nextMode;
    controller = new AbortController();
    refreshing = true;
    const own = requestToken,
      oldTime = displayed?.time,
      wasLatest = spec().observed && displayed?.time === times.at(-1);
    $("weather-console").hidden = false;
    $("weather-refresh").disabled = true;
    presentation();
    status("Checking available map times…");
    try {
      const result = await readMetadata(force);
      if (own !== requestToken || !isActive()) return;
      metadata = result;
      times = usableMapTimes(metadata, {
        observed: spec().observed,
        step: spec().step,
      });
      if (mode === "lightning" && times.length)
        times = times.filter(
          (t) => t >= times.at(-1) - lightningMinutes * 60000,
        );
      if (!times.length) throw new Error("No current source frames");
      requestedIndex =
        spec().observed && wasLatest
          ? times.length - 1
          : oldTime && times.includes(oldTime)
            ? times.indexOf(oldTime)
            : spec().observed
              ? times.length - 1
              : 0;
      presentation();
      await show(requestedIndex);
    } catch (e) {
      if (own !== requestToken || !isActive()) return;
      retryAt = Math.max(Date.now() + 60000, e.retryAt || 0);
      status(
        displayed
          ? "Map check failed · displayed data is saved"
          : "No fresh map frames available. Try Refresh.",
      );
      $("weather-run").textContent = "Source unavailable or model run too old";
    } finally {
      if (activationId === activation) {
        refreshing = false;
        $("weather-refresh").disabled = false;
        if (displayed) presentation();
        if (viewQueued) {
          viewQueued = false;
          requestView();
        }
      }
    }
  }
  function requestView() {
    moving = false;
    clearTimeout(timer);
    if (playing) return;
    if (refreshing) {
      viewQueued = true;
      return;
    }
    if (isActive())
      timer = setTimeout(() => {
        if (!document.hidden) show(requestedIndex, true);
      }, 400);
  }
  async function play() {
    if (!playing || !isActive() || document.hidden || playingTask) return;
    if (moving || refreshing) {
      playTimer = setTimeout(play, 150);
      return;
    }
    playingTask = true;
    try {
      await show((requestedIndex + 1) % times.length);
    } finally {
      playingTask = false;
    }
    if (playing) playTimer = setTimeout(play, 850);
  }
  $("weather-frame").oninput = () => {
    stop();
    clearTimeout(timer);
    const index = Number($("weather-frame").value);
    timer = setTimeout(() => show(index), 160);
  };
  document.querySelectorAll("[data-lightning-history]").forEach(
    (b) =>
      (b.onclick = () => {
        lightningMinutes = Number(b.dataset.lightningHistory);
        if (mode === "lightning" && isActive()) void activate(mode);
      }),
  );
  $("weather-play").onclick = () => {
    if (playing) stop();
    else {
      clearTimeout(timer);
      playing = true;
      $("weather-play").replaceChildren(node("span", null, "pause-icon"));
      $("weather-play").setAttribute(
        "aria-label",
        "Pause weather map timeline",
      );
      play();
    }
  };
  $("weather-refresh").onclick = () => {
    if (Date.now() < retryAt) {
      status("Source retry is delayed. Displayed data remains saved.");
      return;
    }
    activate(mode, { force: true });
  };
  document.querySelectorAll("[data-map-product]").forEach(
    (button) =>
      (button.onclick = () => {
        if (refreshing) return;
        product = button.dataset.mapProduct;
        cancel();
        activate("forecast");
      }),
  );
  $("weather-map-info").onclick = () => {
    const visibleProduct =
      mode === "forecast" && displayed ? displayed.product : product;
    const p = mode === "forecast" ? MAP_PRODUCTS[visibleProduct] : spec(),
      content = node("div");
    content.append(node("p", p.description, "muted"));
    if (mode === "forecast") {
      content.append(
        node(
          "p",
          `Global ICON fields use approximately 0.25° grids. Zooming in does not create street-level precision. The point forecast uses Open-Meteo's regional best match; it may differ from the map model. Valid and model-run times are separate.`,
          "fine",
        ),
      );
      if (visibleProduct === "precip")
        content.append(
          node(
            "p",
            "Precipitation frames advance in six-hour steps. Each image is the six-hour total ending at its timestamp. This is not a minute-specific rain arrival prediction.",
            "fine",
          ),
        );
    }
    if (mode === "forecast" && SOURCE_PALETTES[visibleProduct]) {
      const list = node("div", null, "map-palette");
      for (const entry of SOURCE_PALETTES[visibleProduct]) {
        const row = node("div"),
          swatch = node("i");
        swatch.style.background = entry.color;
        if (entry.opacity) swatch.style.opacity = entry.opacity;
        let label = entry.label.trim();
        if (visibleProduct === "temperature") {
          label = label.replace(/°C/g, "");
          if (getUnit() === "F")
            label = label.replace(/-?\d+(?:\.\d+)?/g, (n) =>
              String(Math.round(Number(n) * 1.8 + 32)),
            );
          label = label.trim() + ` °${getUnit()}`;
        } else {
          label = label.replace(/mm/g, "");
          if (getMeasurements() === "imperial")
            label = label.replace(/\d+(?:\.\d+)?/g, (n) =>
              (Number(n) / 25.4).toFixed(3),
            );
          label =
            label.trim() + ` ${getMeasurements() === "imperial" ? "in" : "mm"}`;
        }
        row.append(swatch, node("span", label));
        list.append(row);
      }
      content.append(node("h3", "Full source color scale"), list);
    } else if (metadata?.legend && mode !== "forecast") {
      const img = node("img");
      img.src = metadata.legend;
      img.alt = "Official source map legend";
      img.className = "source-legend";
      content.append(img);
    }
    showSheet(spec().title, content);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  return {
    activate,
    beginMove: () => {
      moving = true;
    },
    hide,
    stop,
    requestView,
    updateLabels: () => {
      if (displayed) presentation();
    },
    setOpacity: (value) => overlay?.setOpacity(value),
    selectedTime: () => (mode === "forecast" ? displayed?.time : null),
    refresh: () => {
      if (
        !refreshing &&
        Date.now() >= retryAt &&
        (Date.now() - (metadataCache.get(spec().layer)?.at || 0) >=
          (spec().ttl || 3600000) ||
          (!spec().observed && displayed?.time <= Date.now()))
      )
        return activate(mode);
      else if (displayed) presentation();
    },
  };
}
