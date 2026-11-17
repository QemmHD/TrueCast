import { createAtlas } from "./atlas.js";
import { createRadarTimeline } from "./radar-timeline.js";
import { createWeatherMaps } from "./weather-maps.js";
import { $, json, node } from "./api.js";
const NHC =
  "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";
export function createRadar({
  getPlace,
  onSelect,
  showSheet,
  getTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  getUnit = () => "F",
  getMeasurements = () => "imperial",
}) {
  let map,
    marker,
    trackingLayer,
    zoneLayer,
    kind = "radar",
    layerToken = 0,
    pin,
    refreshBusy = false,
    retryAt = 0,
    warningFailed = false,
    tropicalFailed = false,
    futureViewSet = false;
  let warningData,
    tropicalData,
    trackingFeatures = [],
    trackingItems = [];
  document.body.dataset.mapLayer = kind;
  const status = (text) => ($("map-data-status").textContent = text);
  const fieldLayer = (k) => ["forecast", "satellite", "lightning"].includes(k);
  const weatherMaps = createWeatherMaps({
    getMap: () => map,
    getPlace,
    getTimezone,
    getUnit,
    getMeasurements,
    getOpacity: () => Number($("radar-opacity").value) / 100,
    isActive: () => fieldLayer(kind) && document.body.dataset.screen === "map",
    status,
    showSheet,
  });
  const timeline = createRadarTimeline({
    getMap: () => map,
    getPlace,
    getTimezone,
    getOpacity: () => Number($("radar-opacity").value) / 100,
    isActive: () => kind === "radar" && document.body.dataset.screen === "map",
    status,
  });
  const atlas = createAtlas({
    getMap: () => map,
    getPlace,
    getMeasurements,
    getTimezone,
    isVisible: () => document.body.dataset.screen === "map",
    getLayer: () => kind,
    status,
    showSheet,
    selectLayer,
  });
  const remove = (layer) => {
    if (layer && map?.hasLayer(layer)) map.removeLayer(layer);
  };
  function stop() {
    timeline.stop();
  }
  function init() {
    if (map) return true;
    if (!window.L) {
      status("Map library unavailable. Reconnect and refresh.");
      return false;
    }
    $("map").replaceChildren();
    map = L.map("map", {
      zoomControl: false,
      attributionControl: false,
      maxZoom: 14,
      minZoom: 2,
      preferCanvas: true,
      worldCopyJump: true,
    }).setView([getPlace().latitude, getPlace().longitude], 7);
    const pane = map.createPane("basemap");
    pane.style.zIndex = 200;
    pane.classList.add("dark-basemap");
    map.createPane("weather").style.zIndex = 400;
    map.createPane("hazards").style.zIndex = 450;
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      pane: "basemap",
      maxZoom: 14,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);
    const p = getPlace();
    marker = L.circleMarker([p.latitude, p.longitude], {
      pane: "markerPane",
      radius: 6,
      color: "#ecf7ff",
      weight: 2,
      fillColor: "#62cfff",
      fillOpacity: 1,
    }).addTo(map);
    map.on("click", (e) => {
      const point = e.latlng.wrap();
      pin = {
        name: "Map pin",
        latitude: Number(point.lat.toFixed(4)),
        longitude: Number(point.lng.toFixed(4)),
      };
      $("map-point-name").textContent =
        `${pin.latitude.toFixed(2)}°, ${pin.longitude.toFixed(2)}°`;
      $("map-point").hidden = false;
      marker.setLatLng(e.latlng);
    });
    map.on("movestart", () => {
      timeline.moving(true);
      weatherMaps.beginMove();
    });
    map.on("moveend resize", () => {
      timeline.moving(false);
      weatherMaps.requestView();
    });
    atlas.mount(pane);
    return true;
  }
  const color = (p) =>
    p.severity === "Extreme"
      ? "#ff5267"
      : p.severity === "Severe"
        ? "#ff9c50"
        : p.severity === "Moderate"
          ? "#ffd17b"
          : "#91a9ff";
  function alertBody(f) {
    const p = f.properties,
      d = node("div", null, "warning-detail");
    d.append(
      node("p", `${p.severity} · ${p.senderName || "NWS"}`, "eyebrow"),
      node("h3", p.headline || p.event),
      node("p", p.description),
      node("p", p.instruction || "Follow the issuing authority."),
      node("small", `Expires ${new Date(p.expires).toLocaleString()}`),
    );
    const zones = (p.affectedZones || []).filter(
      (url) =>
        typeof url === "string" &&
        url.startsWith("https://api.weather.gov/zones/"),
    );
    if (f.geometry || zones.length) {
      const button = node("button", "Show affected area"),
        note = node("p", null, "fine");
      button.style.marginTop = "15px";
      button.onclick = async () => {
        const token = layerToken;
        button.disabled = true;
        note.textContent = "Loading official boundaries…";
        try {
          let geometries = f.geometry ? [f] : [];
          let incomplete = false;
          if (!geometries.length) {
            const results = await pool(zones.slice(0, 20), (url) => json(url));
            geometries = results
              .filter((r) => r.ok && r.data?.geometry)
              .map((r) => r.data);
            incomplete = geometries.length < zones.length;
          }
          if (token !== layerToken || kind !== "warnings") return;
          if (!geometries.length) throw new Error("No boundaries");
          remove(zoneLayer);
          zoneLayer = L.geoJSON(geometries, {
            pane: "hazards",
            style: {
              color: color(p),
              weight: 2,
              fillColor: color(p),
              fillOpacity: 0.18,
            },
          }).addTo(map);
          if (zoneLayer.getBounds().isValid())
            map.fitBounds(zoneLayer.getBounds(), {
              padding: [35, 35],
              maxZoom: 9,
            });
          status(
            incomplete
              ? "Some affected zones only. Consult the full official alert."
              : `Official affected area · ${p.event}`,
          );
          $("detail-dialog").close();
        } catch {
          note.textContent =
            "Area boundaries unavailable. Read the affected place names and official instructions.";
        } finally {
          button.disabled = false;
        }
      };
      d.append(button, note);
    }
    return d;
  }

  async function loadWarnings(token, force = false) {
    status("Loading official US warnings…");
    try {
      if (force || !warningData || Date.now() - warningData.at > 120000) {
        const r = await json(
          "https://api.weather.gov/alerts/active?status=actual",
          25000,
        );
        if (!Array.isArray(r.features)) throw new Error("Invalid alerts");
        warningData = { at: Date.now(), features: r.features };
        warningFailed = false;
      }
      if (token !== layerToken || kind !== "warnings") return;
      trackingFeatures = warningData.features.filter(
        (f) => Date.parse(f.properties?.expires) > Date.now(),
      );
      trackingItems = trackingFeatures;
      const geometries = trackingFeatures.filter((f) => f.geometry);
      const previousLayer = trackingLayer;
      trackingLayer = L.geoJSON(geometries, {
        pane: "hazards",
        style: (f) => ({
          color: color(f.properties),
          weight: 1.5,
          fillColor: color(f.properties),
          fillOpacity: 0.13,
        }),
        onEachFeature: (f, l) => {
          l.bindTooltip(f.properties.event);
          l.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            showSheet(f.properties.event, alertBody(f));
          });
        },
      }).addTo(map);
      remove(previousLayer);
      $("tracking-text").textContent =
        `${trackingFeatures.length} active US alerts. ${trackingFeatures.length - geometries.length} have no polygon and appear in the list only.`;
      $("radar-time").textContent =
        `${trackingFeatures.length} active US alerts`;
      $("map-data-status").textContent =
        `NWS · checked ${new Date(warningData.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      $("tracking-list").disabled = false;
      $("tracking-fit").disabled = !geometries.length;
    } catch {
      if (token !== layerToken) return;
      warningFailed = true;
      retryAt = Date.now() + 60000;
      status(
        trackingLayer
          ? "Warning check failed · saved overlay is unverified"
          : "Official warning data unavailable. Try refresh.",
      );
      $("tracking-text").textContent =
        "Alerts could not be checked. This is not an all-clear.";
      $("radar-time").textContent = "Warning source unavailable";
    }
  }
  async function pool(items, fn) {
    let next = 0;
    const results = new Array(items.length);
    const workers = Array.from(
      { length: Math.min(3, items.length) },
      async () => {
        while (next < items.length) {
          const i = next++;
          try {
            results[i] = { ok: true, data: await fn(items[i]) };
          } catch {
            results[i] = { ok: false };
          }
        }
      },
    );
    await Promise.all(workers);
    return results;
  }

  async function loadTropical(token, force = false) {
    status("Loading official tropical forecasts…");
    try {
      if (force || !tropicalData || Date.now() - tropicalData.at > 600000) {
        const meta = await json(`${NHC}?f=json`);
        const layers = meta.layers.filter((l) =>
          /Forecast Points$/.test(l.name),
        );
        if (!layers.length) throw new Error("No forecast layers");
        const results = await pool(layers, (l) =>
          json(
            `${NHC}/${l.id}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`,
            20000,
          ),
        );
        const systems = [];
        let missing = 0;
        for (let i = 0; i < layers.length; i++) {
          if (!results[i].ok || !Array.isArray(results[i].data.features)) {
            missing++;
            continue;
          }
          const points = results[i].data.features.filter((f) => f.geometry);
          if (!points.length) continue;
          points.sort(
            (a, b) =>
              (Number(a.properties.tau) || Number(a.properties.fcstprd) || 0) -
              (Number(b.properties.tau) || Number(b.properties.fcstprd) || 0),
          );
          const prefix = layers[i].name.replace(" Forecast Points", "");
          systems.push({
            name: points[0].properties.stormname || prefix,
            points,
            first: points[0],
            prefix,
            track: meta.layers.find(
              (l) => l.name === `${prefix} Forecast Track`,
            ),
            cone: meta.layers.find((l) => l.name === `${prefix} Forecast Cone`),
          });
        }
        if (missing === layers.length)
          throw new Error("All tropical storm slots unavailable");
        await pool(systems, async (s) => {
          for (const key of ["track", "cone"]) {
            const layer = s[key];
            if (layer) {
              try {
                const r = await json(
                  `${NHC}/${layer.id}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`,
                );
                s[`${key}Data`] = r.features;
              } catch {
                s.partial = true;
              }
            }
          }
          return s;
        });
        tropicalData = { at: Date.now(), systems, missing };
        tropicalFailed = false;
      }
      if (token !== layerToken || kind !== "tropical") return;
      trackingItems = tropicalData.systems;
      const group = L.featureGroup();
      trackingFeatures = [];
      for (const s of trackingItems) {
        if (s.coneData)
          L.geoJSON(s.coneData, {
            pane: "hazards",
            style: {
              color: "#b4a0ff",
              weight: 1,
              fillColor: "#9f86ff",
              fillOpacity: 0.15,
            },
          }).addTo(group);
        if (s.trackData)
          L.geoJSON(s.trackData, {
            pane: "hazards",
            style: { color: "#d3c5ff", weight: 2, dashArray: "5 6" },
          }).addTo(group);
        L.geoJSON(s.points, {
          pane: "hazards",
          pointToLayer: (f, ll) =>
            L.circleMarker(ll, {
              radius: 4,
              color: "#ede5ff",
              fillColor: "#9e80ff",
              fillOpacity: 1,
              weight: 1,
            }),
          onEachFeature: (f, l) => {
            l.bindTooltip(
              `${s.name} · ${f.properties.fldatelbl || f.properties.validtime || "Advisory forecast point"}`,
            );
          },
        }).addTo(group);
        trackingFeatures.push(...s.points);
      }
      const previousLayer = trackingLayer;
      trackingLayer = group.addTo(map);
      remove(previousLayer);
      const n = trackingItems.length;
      $("radar-time").textContent =
        `${n} NHC forecast system${n === 1 ? "" : "s"}`;
      $("tracking-text").textContent =
        `${n ? "Tap a track point or view system details." : "No active forecast systems returned."} NHC coverage: Atlantic, eastern & central Pacific.${tropicalData.missing ? ` ${tropicalData.missing} storm slots unavailable; coverage is incomplete.` : ""}${trackingItems.some((s) => s.partial) ? " Some track or cone data could not load." : ""}`;
      $("map-data-status").textContent =
        `NHC · checked ${new Date(tropicalData.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      $("tracking-list").disabled = false;
      $("tracking-fit").disabled = !n;
    } catch {
      if (token !== layerToken) return;
      tropicalFailed = true;
      retryAt = Date.now() + 60000;
      status(
        trackingLayer
          ? "Tropical check failed · saved overlay is unverified"
          : "Tropical data unavailable. Try refresh.",
      );
      $("radar-time").textContent = "Tropical source unavailable";
      $("tracking-text").textContent =
        "Active systems could not be checked. Consult nhc.noaa.gov.";
    }
  }
  async function selectLayer(next, force = false, nextProduct) {
    if (force && next === kind && map) {
      if (Date.now() < retryAt) {
        status("Source retry is delayed. Saved map data is unverified.");
        return;
      }
      if (fieldLayer(kind)) return weatherMaps.activate(kind, { force: true });
      if (kind === "warnings") return loadWarnings(layerToken, true);
      if (kind === "tropical") return loadTropical(layerToken, true);
    }
    timeline.deactivate();
    weatherMaps.hide();
    kind = next;
    retryAt = 0;
    const token = ++layerToken;
    stop();

    remove(trackingLayer);
    trackingLayer = null;
    remove(zoneLayer);
    zoneLayer = null;

    trackingItems = [];
    trackingFeatures = [];
    document
      .querySelectorAll("[data-layer]")
      .forEach((n) =>
        n.setAttribute("aria-pressed", String(n.dataset.layer === kind)),
      );
    $("map-point").hidden = true;
    $("radar-console").hidden = fieldLayer(kind);
    $("weather-console").hidden = !fieldLayer(kind);
    document.body.dataset.mapLayer = kind;
    if (!init()) return;
    atlas.activate(kind);
    if (["fire", "storm"].includes(kind)) {
      $("radar-console").hidden = true;
      $("weather-console").hidden = true;
      $("map-layer-label").textContent =
        kind === "fire"
          ? "NIFC REPORTED FIRE INCIDENTS"
          : "SPC DAY-ONE STORM OUTLOOK";
      return;
    }
    if (fieldLayer(kind)) {
      if (kind === "forecast" && !futureViewSet) {
        futureViewSet = true;
        if (map.getZoom() > 5) map.setZoom(5);
      }
      if (document.body.dataset.screen === "map")
        await weatherMaps.activate(kind, { force, product: nextProduct });
      return;
    }
    $("radar-playback").hidden = kind !== "radar";
    for (const id of ["radar-window", "radar-availability", "radar-blend-note"])
      $(id).hidden = kind !== "radar";
    $("tracking-summary").hidden = kind === "radar";
    $("radar-time-kind").textContent =
      kind === "radar"
        ? "OBSERVED RADAR"
        : kind === "warnings"
          ? "OFFICIAL WARNINGS · US"
          : "OFFICIAL TROPICAL FORECAST";
    $("map-layer-label").textContent =
      kind === "radar"
        ? "PAST PRECIPITATION"
        : kind === "warnings"
          ? "US WEATHER ALERTS"
          : "NHC TRACKS & CONES";
    $("map-source").textContent =
      kind === "radar"
        ? "NOAA MRMS / HRRR in US coverage · RainViewer / DWD elsewhere"
        : kind === "warnings"
          ? "National Weather Service · Some alerts have no polygon"
          : "NOAA / NHC · Cone ≠ complete impact area";
    $("radar-time").textContent = "Loading…";
    $("tracking-text").textContent = "Loading official data…";
    $("tracking-list").disabled = true;
    $("tracking-fit").disabled = true;
    if (kind === "radar") await timeline.refresh({ force });
    else if (kind === "warnings") await loadWarnings(token, force);
    else await loadTropical(token, force);
  }
  document
    .querySelectorAll("[data-layer]")
    .forEach((b) => (b.onclick = () => selectLayer(b.dataset.layer)));
  $("radar-latest").onclick = () => {
    if (kind === "radar") timeline.latest();
    else selectLayer(kind, true);
  };
  $("radar-opacity").oninput = () => {
    const v = Number($("radar-opacity").value);
    $("opacity-value").textContent = `${v}%`;
    timeline.setOpacity();
    weatherMaps.setOpacity(v / 100);
    trackingLayer?.setStyle?.({
      opacity: v / 100,
      fillOpacity: (v / 100) * 0.2,
    });
  };
  $("coverage").onchange = () => timeline.setCoverage();
  $("map-options").onclick = () => $("map-dialog").showModal();
  $("map-zoom-in").onclick = () => map?.zoomIn();
  $("map-zoom-out").onclick = () => map?.zoomOut();
  $("recenter-map").onclick = () => {
    if (map) {
      const p = getPlace();
      map.setView([p.latitude, p.longitude], 7);
      marker.setLatLng([p.latitude, p.longitude]);
      $("map-point").hidden = true;
    }
  };
  $("point-forecast").onclick = () => {
    if (pin)
      onSelect(pin, {
        validTime:
          kind === "radar"
            ? timeline.selectedTime()
            : fieldLayer(kind)
              ? weatherMaps.selectedTime()
              : null,
      });
    $("map-point").hidden = true;
  };
  $("tracking-fit").onclick = () => {
    if (trackingLayer && trackingLayer.getBounds().isValid())
      map.fitBounds(trackingLayer.getBounds(), {
        padding: [35, 35],
        maxZoom: 6,
      });
  };
  $("tracking-list").onclick = () => {
    const content = node("div");
    if (kind === "warnings") {
      content.append(
        node(
          "p",
          `${trackingItems.length} non-expired alert records from NWS. Last checked ${warningData ? new Date(warningData.at).toLocaleTimeString() : "unknown"}. ${warningFailed || !navigator.onLine || Date.now() - (warningData?.at || 0) >= 120000 ? "Saved records are unverified; check weather.gov. " : ""}Listed by severity; tap a warning on the map for its area.`,
          "fine",
        ),
      );
      const order = {
        Extreme: 0,
        Severe: 1,
        Moderate: 2,
        Minor: 3,
        Unknown: 4,
      };
      trackingItems
        .slice()
        .sort(
          (a, b) =>
            (order[a.properties.severity] ?? 4) -
            (order[b.properties.severity] ?? 4),
        )
        .slice(0, 100)
        .forEach((f) => {
          const d = node("details", null, "warning-list-item");
          d.append(
            node("summary", `${f.properties.event} · ${f.properties.areaDesc}`),
            alertBody(f),
          );
          content.append(d);
        });
      if (trackingItems.length > 100)
        content.append(
          node(
            "p",
            "Showing the 100 most severe records. All returned polygons remain on the map.",
            "fine",
          ),
        );
    } else {
      content.append(node("p", $("tracking-text").textContent, "fine"));
      trackingItems.forEach((s) => {
        const p = s.first.properties,
          card = node("article", null, "warning-detail");
        card.append(
          node("h3", s.name),
          node(
            "p",
            `${p.stormtype || "Tropical cyclone"} · Advisory ${p.advisnum || "—"}`,
          ),
          node(
            "p",
            `Maximum wind: ${p.maxwind ?? "—"} kt · Gusts: ${p.gust ?? "—"} kt`,
          ),
          node(
            "p",
            `Advisory/forecast time: ${p.advdate || p.fldatelbl || p.validtime || "See official advisory"}`,
          ),
        );
        const b = node("button", "View track");
        b.onclick = () => {
          const g = L.geoJSON(s.points);
          if (g.getBounds().isValid())
            map.fitBounds(g.getBounds(), { padding: [40, 40], maxZoom: 7 });
          $("detail-dialog").close();
        };
        card.append(b);
        content.append(card);
      });
    }
    showSheet(
      kind === "warnings" ? "Official US warnings" : "Tropical systems",
      content,
    );
  };
  async function refreshActive() {
    if (!document.hidden && document.body.dataset.screen === "map") {
      if (fieldLayer(kind)) weatherMaps.updateLabels();
      if (!navigator.onLine) status("Offline · displayed map data is saved");
      if (kind === "warnings") {
        trackingFeatures = trackingFeatures.filter(
          (f) => Date.parse(f.properties?.expires) > Date.now(),
        );
        trackingItems = trackingFeatures;
        trackingLayer?.eachLayer((layer) => {
          if (Date.parse(layer.feature?.properties?.expires) <= Date.now())
            trackingLayer.removeLayer(layer);
        });
      }
    }

    if (
      refreshBusy ||
      document.hidden ||
      document.body.dataset.screen !== "map" ||
      !navigator.onLine ||
      Date.now() < retryAt
    )
      return;
    refreshBusy = true;
    try {
      if (["fire", "storm"].includes(kind)) {
        await atlas.refresh();
        return;
      }
      if (fieldLayer(kind)) {
        await weatherMaps.refresh();
        return;
      }
      if (kind === "radar") {
        await timeline.refresh();
      } else if (
        kind === "warnings" &&
        (warningFailed ||
          !warningData ||
          Date.now() - (warningData?.at || 0) >= 120000)
      )
        await loadWarnings(layerToken, warningFailed);
      else if (
        kind === "tropical" &&
        (tropicalFailed ||
          !tropicalData ||
          Date.now() - tropicalData.at >= 600000)
      )
        await loadTropical(layerToken, tropicalFailed);
    } finally {
      refreshBusy = false;
    }
  }
  function enter() {
    if (!init()) return;
    requestAnimationFrame(() => map.invalidateSize());
    if (fieldLayer(kind)) void weatherMaps.activate(kind);
    else void refreshActive();
  }
  setInterval(refreshActive, 1000);
  addEventListener("online", () => {
    if (document.body.dataset.screen === "map") enter();
  });
  addEventListener("truecast:route", (e) => {
    if (e.detail.route === "map") enter();
    else {
      stop();
      weatherMaps.stop();
      atlas.stop();
    }
  });
  addEventListener(
    "truecast:map-layer",
    (e) => void selectLayer(e.detail.layer, false, e.detail.product),
  );
  addEventListener("truecast:future-map", () => selectLayer("forecast"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
      weatherMaps.stop();
    } else if (document.body.dataset.screen === "map") enter();
  });
  return {
    enter,
    setPlace() {
      timeline.deactivate();
      if (kind === "radar") {
        $("radar-time").textContent = "Checking source times…";
        delete $("radar-time").dataset.validAt;
        delete $("radar-time").dataset.frameType;
      }
      if (map) {
        const p = getPlace();
        marker.setLatLng([p.latitude, p.longitude]);
        map.setView(
          [p.latitude, p.longitude],
          fieldLayer(kind) ? Math.min(map.getZoom(), 5) : 7,
        );
      }
      if (map) atlas.setPlace();
      if (map && kind === "radar" && document.body.dataset.screen === "map")
        void timeline.refresh();
    },
  };
}
