import { $, json, node } from "./api.js";
const NHC =
  "https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer";
export function createRadar({ getPlace, onSelect, showSheet }) {
  let map,
    marker,
    radarLayer,
    pendingLayer,
    coverageLayer,
    trackingLayer,
    zoneLayer,
    host,
    allFrames = [],
    frames = [],
    current = -1,
    frameToken = 0,
    kind = "radar",
    playing = false,
    timer,
    speed = 1,
    lastRadarFetch = 0,
    layerToken = 0,
    pin;
  let warningData,
    tropicalData,
    trackingFeatures = [],
    trackingItems = [];
  const status = (text) => ($("map-data-status").textContent = text);
  const shortTime = (t) =>
    new Date(t * 1000).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  const remove = (layer) => {
    if (layer && map?.hasLayer(layer)) map.removeLayer(layer);
  };
  function stop() {
    playing = false;
    clearTimeout(timer);
    $("play").replaceChildren(node("span", null, "play-icon"));
    $("play").setAttribute("aria-label", "Play radar animation");
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
      radius: 6,
      color: "#ecf7ff",
      weight: 2,
      fillColor: "#62cfff",
      fillOpacity: 1,
    }).addTo(map);
    map.on("click", (e) => {
      pin = {
        name: "Map pin",
        latitude: Number(e.latlng.lat.toFixed(4)),
        longitude: Number(e.latlng.lng.toFixed(4)),
      };
      $("map-point-name").textContent =
        `${pin.latitude.toFixed(2)}°, ${pin.longitude.toFixed(2)}°`;
      $("map-point").hidden = false;
      marker.setLatLng(e.latlng);
    });
    map.on("movestart", () => {
      if (playing) stop();
    });
    return true;
  }
  function frameCaption(f) {
    $("radar-time").textContent = `${shortTime(f.time)} local`;
    $("radar-age").textContent =
      `${Math.max(0, Math.round((Date.now() / 1000 - f.time) / 60))} min old`;
    $("map-data-status").textContent = "Past radar · not a future forecast";
  }
  async function showFrame(index) {
    if (kind !== "radar" || !frames.length || !map) return false;
    const f = frames[index];
    if (!f) return false;
    $("frame").value = index;
    if (current === f.time && radarLayer) {
      frameCaption(f);
      return true;
    }
    const token = ++frameToken;
    remove(pendingLayer);
    const candidate = L.tileLayer(
      `${host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`,
      {
        pane: "weather",
        opacity: 0,
        maxNativeZoom: 7,
        maxZoom: 14,
        attribution: '<a href="https://rainviewer.com">RainViewer</a>',
      },
    );
    pendingLayer = candidate;
    const loaded = await new Promise((resolve) => {
      let bad = false,
        done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        resolve(ok);
      };
      const timeout = setTimeout(() => finish(false), 10000);
      candidate.on("tileerror", () => {
        bad = true;
      });
      candidate.once("load", () => finish(!bad));
      candidate.addTo(map);
    });
    if (token !== frameToken || kind !== "radar") {
      remove(candidate);
      return false;
    }
    pendingLayer = null;
    if (!loaded) {
      remove(candidate);
      status("Some radar tiles could not load. Try Latest.");
      return false;
    }
    const old = radarLayer;
    radarLayer = candidate;
    radarLayer.setOpacity(Number($("radar-opacity").value) / 100);
    remove(old);
    current = f.time;
    frameCaption(f);
    return true;
  }
  function history() {
    const minutes = Number($("loop-length").value),
      last = allFrames.at(-1)?.time || 0;
    frames = allFrames.filter((f) => f.time >= last - minutes * 60);
    $("frame").max = Math.max(0, frames.length - 1);
    $("frame").value = Math.max(0, frames.length - 1);
    $("radar-start").textContent = frames.length
      ? shortTime(frames[0].time)
      : "—";
    $("radar-end").textContent = frames.length
      ? shortTime(frames.at(-1).time)
      : "—";
    $("frame").disabled = !frames.length;
    $("play").disabled = !frames.length;
  }
  async function fetchRadar(force = false) {
    if (!init()) return;
    if (!force && Date.now() - lastRadarFetch < 300000 && allFrames.length) {
      history();
      await showFrame(frames.length - 1);
      return;
    }
    const requestedLayer = layerToken;
    status("Loading observed radar…");
    $("radar-latest").disabled = true;
    try {
      const r = await json(
        "https://api.rainviewer.com/public/weather-maps.json",
      );
      if (kind !== "radar" || requestedLayer !== layerToken) return;
      if (
        !Array.isArray(r.radar?.past) ||
        !r.radar.past.length ||
        !r.host?.startsWith("https://")
      )
        throw new Error("No past radar");
      host = r.host;
      allFrames = r.radar.past.filter(
        (f) =>
          Number.isFinite(f.time) &&
          typeof f.path === "string" &&
          f.time <= Date.now() / 1000 + 60,
      );
      if (!allFrames.length) throw new Error("No valid frames");
      lastRadarFetch = Date.now();
      history();
      remove(coverageLayer);
      coverageLayer = L.tileLayer(
        `${host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`,
        { pane: "weather", maxNativeZoom: 7, maxZoom: 14, opacity: 0.6 },
      );
      if ($("coverage").checked && kind === "radar") coverageLayer.addTo(map);
      await showFrame(frames.length - 1);
    } catch {
      if (kind !== "radar" || requestedLayer !== layerToken) return;
      status("Radar unavailable. Tap Latest to retry.");
      if (!radarLayer) $("radar-time").textContent = "No observed frame loaded";
    } finally {
      $("radar-latest").disabled = false;
    }
  }
  async function tick() {
    if (!playing || kind !== "radar") return;
    const next = (Number($("frame").value) + 1) % frames.length;
    await showFrame(next);
    if (playing)
      timer = setTimeout(
        tick,
        (next === frames.length - 1 ? 1500 : 550) / speed,
      );
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

  async function loadWarnings(token) {
    status("Loading official US warnings…");
    try {
      if (!warningData || Date.now() - warningData.at > 300000) {
        const r = await json(
          "https://api.weather.gov/alerts/active?status=actual",
          25000,
        );
        if (!Array.isArray(r.features)) throw new Error("Invalid alerts");
        warningData = { at: Date.now(), features: r.features };
      }
      if (token !== layerToken || kind !== "warnings") return;
      trackingFeatures = warningData.features;
      trackingItems = trackingFeatures;
      const geometries = trackingFeatures.filter((f) => f.geometry);
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
      status("Official warning data unavailable. Try refresh.");
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

  async function loadTropical(token) {
    status("Loading official tropical forecasts…");
    try {
      if (!tropicalData || Date.now() - tropicalData.at > 600000) {
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
      trackingLayer = group.addTo(map);
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
      status("Tropical data unavailable. Try refresh.");
      $("radar-time").textContent = "Tropical source unavailable";
      $("tracking-text").textContent =
        "Active systems could not be checked. Consult nhc.noaa.gov.";
    }
  }
  async function selectLayer(next, force = false) {
    kind = next;
    const token = ++layerToken;
    stop();
    ++frameToken;
    remove(pendingLayer);
    pendingLayer = null;
    remove(trackingLayer);
    trackingLayer = null;
    remove(zoneLayer);
    zoneLayer = null;
    remove(coverageLayer);
    remove(radarLayer);
    current = -1;
    radarLayer = null;
    trackingItems = [];
    trackingFeatures = [];
    document
      .querySelectorAll("[data-layer]")
      .forEach((n) =>
        n.setAttribute("aria-pressed", String(n.dataset.layer === kind)),
      );
    $("map-point").hidden = true;
    $("radar-playback").hidden = kind !== "radar";
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
        ? "RainViewer · Composite frame time; coverage varies"
        : kind === "warnings"
          ? "National Weather Service · Some alerts have no polygon"
          : "NOAA / NHC · Cone ≠ complete impact area";
    $("radar-time").textContent = "Loading…";
    $("tracking-text").textContent = "Loading official data…";
    $("tracking-list").disabled = true;
    $("tracking-fit").disabled = true;
    if (!init()) return;
    if (kind === "radar") await fetchRadar(force);
    else if (kind === "warnings") {
      if (force) warningData = null;
      await loadWarnings(token);
    } else {
      if (force) tropicalData = null;
      await loadTropical(token);
    }
  }
  document
    .querySelectorAll("[data-layer]")
    .forEach((b) => (b.onclick = () => selectLayer(b.dataset.layer)));
  $("radar-latest").onclick = () => {
    if (kind === "radar") {
      stop();
      fetchRadar(true);
    } else selectLayer(kind, true);
  };
  $("frame").oninput = () => {
    stop();
    showFrame(Number($("frame").value));
  };
  $("play").onclick = () => {
    if (playing) stop();
    else if (frames.length) {
      playing = true;
      $("play").replaceChildren(node("span", null, "pause-icon"));
      $("play").setAttribute("aria-label", "Pause radar animation");
      tick();
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
  $("loop-length").onchange = () => {
    stop();
    history();
    showFrame(frames.length - 1);
  };
  $("radar-opacity").oninput = () => {
    const v = Number($("radar-opacity").value);
    $("opacity-value").textContent = `${v}%`;
    radarLayer?.setOpacity(v / 100);
  };
  $("coverage").onchange = () => {
    if (kind === "radar" && coverageLayer)
      $("coverage").checked ? coverageLayer.addTo(map) : remove(coverageLayer);
  };
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
    if (pin) onSelect(pin);
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
          `${trackingItems.length} active alerts from NWS. Listed by severity; tap a warning on the map for its area.`,
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
  function enter() {
    if (!init()) return;
    requestAnimationFrame(() => map.invalidateSize());
    if (
      kind === "radar" &&
      (!frames.length || Date.now() - lastRadarFetch > 300000)
    )
      fetchRadar();
  }
  addEventListener("truecast:route", (e) => {
    if (e.detail.route === "map") enter();
    else stop();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (document.body.dataset.screen === "map") enter();
  });
  return {
    enter,
    setPlace() {
      if (map) {
        const p = getPlace();
        marker.setLatLng([p.latitude, p.longitude]);
        map.setView([p.latitude, p.longitude], 7);
      }
    },
  };
}
