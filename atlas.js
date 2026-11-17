import { $, node, store } from "./api.js";
import {
  densityLabel,
  lightningSample,
  lightningText,
  fireReports,
  stormOutlook,
} from "./hazard-data.js";
import { glyph } from "./conditions.js";
const CATALOG = [
  ["Storm tracking", "radar", "Radar", "Observed history + simulated future"],
  [
    "Storm tracking",
    "radar-past",
    "Past radar",
    "Observed precipitation history",
  ],
  [
    "Storm tracking",
    "radar-future",
    "Future radar",
    "HRRR simulated reflectivity in US coverage",
  ],
  [
    "Storm tracking",
    "lightning",
    "Lightning",
    "Local grid activity + distance rings",
  ],
  ["Storm tracking", "warnings", "Official warnings", "NWS active alerts · US"],
  [
    "Storm tracking",
    "storm",
    "Storm outlook",
    "SPC day-one forecast areas · US",
  ],
  [
    "Storm tracking",
    "fire",
    "Fire reports",
    "NIFC recent incident points · US",
  ],
  [
    "Storm tracking",
    "tropical",
    "Tropical tracks",
    "Official NHC forecast tracks & cones",
  ],
  [
    "Atmosphere",
    "forecast:precip",
    "Precipitation",
    "Six-hour forecast totals",
  ],
  [
    "Atmosphere",
    "forecast:temperature",
    "Temperature",
    "Global model temperature field",
  ],
  [
    "Atmosphere",
    "forecast:wind",
    "Wind speed",
    "Surface wind barbs · not storm motion",
  ],
  [
    "Atmosphere",
    "forecast:pressure",
    "Pressure",
    "Mean sea-level model contours",
  ],
  [
    "Atmosphere",
    "satellite",
    "Infrared satellite",
    "Observed cloud & surface patterns",
  ],
  [
    "Health & conditions",
    "air",
    "Air & pollen",
    "48-hour local forecast details",
  ],
  [
    "Health & conditions",
    "conditions",
    "All conditions",
    "Wind, UV, observations, sun & moon",
  ],
];
export function createAtlas({
  getMap,
  getPlace,
  getMeasurements,
  getTimezone,
  isVisible,
  status,
  showSheet,
  selectLayer,
  getLayer,
}) {
  let vectors,
    savedPins,
    basemapPane,
    generation = 0,
    controller,
    lastLoad = 0,
    busy = false,
    retryAt = 0,
    lastSample = null;
  const panel = $("atlas-focus"),
    catalog = $("layer-catalog");
  const distance = (n) =>
    `${(n / (getMeasurements() === "imperial" ? 1.609344 : 1)).toFixed(n / (getMeasurements() === "imperial" ? 1.609344 : 1) < 10 ? 1 : 0)} ${getMeasurements() === "imperial" ? "mi" : "km"}`;
  const stamp = (t) =>
    new Date(t).toLocaleString("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: getTimezone(),
    });
  const clearVectors = () => {
    vectors?.remove();
    vectors = null;
  };
  function stop() {
    generation++;
    controller?.abort();
    busy = false;
  }
  function focus(icon, label, title, note) {
    panel.replaceChildren();
    const emblem = node("span", null, `atlas-emblem ${icon}-emblem`);
    emblem.append(glyph(icon));
    const body = node("div");
    body.append(node("small", label), node("strong", title), node("p", note));
    panel.append(emblem, body);
    panel.hidden = false;
    return body;
  }
  function navigate(key) {
    $("map-dialog").close();
    if (key === "air" || key === "conditions") {
      window.dispatchEvent(new CustomEvent(`truecast:${key}`));
      return;
    }
    const [layer, product] = key.split(":");
    if (layer === "radar-past" || layer === "radar-future") {
      void selectLayer("radar").then(() =>
        document
          .querySelector(
            `[data-radar-window=${layer === "radar-past" ? "past" : "future"}]`,
          )
          .click(),
      );
    } else void selectLayer(layer, false, product);
  }
  function renderCatalog() {
    const query = $("layer-search").value.toLowerCase().trim();
    catalog.replaceChildren();
    let group;
    for (const [category, key, title, desc] of CATALOG) {
      if (
        query &&
        !`${category} ${title} ${desc}`.toLowerCase().includes(query)
      )
        continue;
      if (category !== group) {
        catalog.append(node("p", category, "catalog-heading"));
        group = category;
      }
      const b = node("button", null, "catalog-layer"),
        icon = node(
          "span",
          key === "lightning"
            ? "ϟ"
            : key === "fire"
              ? "◈"
              : key === "storm"
                ? "◉"
                : "◌",
          "catalog-symbol",
        ),
        label = node("span"),
        check = node("span", "", "catalog-check");
      label.append(node("strong", title), node("small", desc));
      b.append(icon, label, check);
      b.dataset.catalogLayer = key;
      b.onclick = () => navigate(key);
      catalog.append(b);
    }
    if (!catalog.children.length)
      catalog.append(
        node("p", "No matching layers. Try “wind” or “lightning”.", "fine"),
      );
    updateSelected();
  }
  function updateSelected() {
    const layer = getLayer(),
      product = document.querySelector("[data-map-product][aria-pressed=true]")
        ?.dataset.mapProduct;
    document.querySelectorAll("[data-catalog-layer]").forEach((b) => {
      const k = b.dataset.catalogLayer;
      b.setAttribute(
        "aria-pressed",
        String(
          k === layer || (layer === "forecast" && k === `forecast:${product}`),
        ),
      );
    });
  }
  $("layer-search").oninput = renderCatalog;
  const style = $("map-style");
  style.value = store.get("truecast-map-style", "dark");
  function applyStyle() {
    basemapPane?.classList.toggle("dark-basemap", style.value !== "standard");
    store.set("truecast-map-style", style.value);
  }
  style.onchange = applyStyle;
  function savedLocations() {
    const map = getMap();
    if (!map) return;
    savedPins?.remove();
    savedPins = L.layerGroup().addTo(map);
    const p = getPlace(),
      rows = store.get("truecast-places", []);
    if (!Array.isArray(rows)) return;
    for (const place of rows.slice(0, 30)) {
      if (
        !Number.isFinite(place.latitude) ||
        !Number.isFinite(place.longitude) ||
        (place.latitude === p.latitude && place.longitude === p.longitude)
      )
        continue;
      const pin = L.marker([place.latitude, place.longitude], {
        icon: L.divIcon({
          className: "saved-map-pin",
          html: "<span></span>",
          iconSize: [18, 25],
          iconAnchor: [9, 25],
        }),
        keyboard: true,
        title: place.name || "Saved place",
      });
      pin.bindTooltip(node("span", place.name || "Saved place"));
      pin.on("click", () =>
        window.dispatchEvent(
          new CustomEvent("truecast:saved-place", { detail: place }),
        ),
      );
      pin.addTo(savedPins);
    }
  }
  function rings() {
    clearVectors();
    const p = getPlace(),
      map = getMap();
    vectors = L.layerGroup().addTo(map);
    const imperial = getMeasurements() === "imperial",
      scale = imperial ? 1.609344 : 1;
    [30, 20, 10].forEach((n, i) => {
      const km = n * scale,
        color = ["#c4afff", "#a9c5ff", "#8fe2eb"][i];
      L.circle([p.latitude, p.longitude], {
        radius: km * 1000,
        pane: "hazards",
        color,
        weight: 1.5,
        dashArray: "5 7",
        fillColor: color,
        fillOpacity: 0.025,
        interactive: false,
      }).addTo(vectors);
      L.marker([p.latitude + ((km / 6371) * 180) / Math.PI, p.longitude], {
        interactive: false,
        icon: L.divIcon({
          className: "distance-ring-label",
          html: `<span>${n} ${imperial ? "mi" : "km"}</span>`,
          iconSize: [58, 20],
          iconAnchor: [29, 10],
        }),
      }).addTo(vectors);
    });
  }
  function lightningInfo() {
    const content = node("div");
    content.append(
      node("p", "NOAA lightning density", "detail-summary"),
      node(
        "p",
        "The colored field is a 15-minute density grid, about 8 × 8 km (5 × 5 mi) per cell. It is a publicly distributable derived product based on NLDN / GLD360 inputs. A point sample describes the selected location’s cell, not every nearby storm.",
        "muted",
      ),
      node(
        "p",
        "Distance rings are geographic references, not measured strike locations. This feed cannot provide the closest strike, its distance, individual strike counts, or a guaranteed “no lightning nearby” signal. Zero/missing density does not establish safety. If you hear thunder, go indoors.",
        "muted",
      ),
      node(
        "p",
        "Map playback uses actual published observation times. The 30-minute window ends at the latest available frame; frame age is shown separately.",
        "fine",
      ),
    );
    showSheet("Lightning map guide", content);
  }
  function sampleDescription(value) {
    return value.available
      ? `${value.value === null ? "Sample unavailable" : densityLabel(value.value) + " strikes/km²/min"} · 15 min ending ${stamp(value.time)}`
      : "Outside the NOAA source coverage";
  }
  function updateLabels() {
    if (
      lastSample &&
      getLayer() === "lightning" &&
      lastSample.body.isConnected
    ) {
      const text = sampleDescription(lastSample.value),
        p = lastSample.body.querySelector("p");
      if (p && p.textContent !== text) p.textContent = text;
    }
  }
  async function sample(time) {
    lastSample = null;
    if (getLayer() !== "lightning" || !isVisible()) return;
    const own = ++generation;
    controller?.abort();
    controller = new AbortController();
    const body = focus(
      "lightning",
      "LOCAL LIGHTNING GRID",
      "Checking selected frame…",
      "Distance rings show 10 / 20 / 30 " +
        (getMeasurements() === "imperial" ? "mi" : "km"),
    );
    const info = node("button", "i", "atlas-info");
    info.setAttribute("aria-label", "Lightning map guide");
    info.onclick = lightningInfo;
    panel.append(info);
    try {
      const value = await lightningSample(getPlace(), {
        time,
        signal: controller.signal,
      });
      if (own !== generation || getLayer() !== "lightning") return;
      body.querySelector("strong").textContent = lightningText(value);
      body.querySelector("p").textContent = sampleDescription(value);
      lastSample = { value, body };
      body.append(
        node(
          "small",
          "Grid density · no closest-strike distance",
          "atlas-caveat",
        ),
      );
    } catch (e) {
      if (own === generation) {
        body.querySelector("strong").textContent = "Local sample unavailable";
        body.querySelector("p").textContent =
          "A missing sample is not an all-clear.";
      }
    }
  }
  function fireDetail(f) {
    const p = f.properties,
      content = node("div");
    content.append(
      node("p", p.IncidentName || "Reported fire", "detail-summary"),
    );
    const rows = [
      ["Distance to reported point", distance(f.distance)],
      ["Last report update", stamp(p.ModifiedOnDateTime_dt)],
      [
        "Reported size",
        Number.isFinite(p.IncidentSize)
          ? `${p.IncidentSize.toLocaleString()} acres`
          : "Unavailable",
      ],
      [
        "Reported containment",
        Number.isFinite(p.PercentContained)
          ? `${p.PercentContained}%`
          : "Unavailable",
      ],
    ];
    for (const [label, value] of rows) {
      const r = node("p");
      r.append(node("span", label + " · ", "muted"), node("strong", value));
      content.append(r);
    }
    content.append(
      node(
        "p",
        "NIFC / WFIGS. This is an incident report point, not a fire perimeter or live fire edge. Reports can be delayed or incomplete. Follow local emergency instructions.",
        "fine",
      ),
    );
    showSheet("Fire report", content);
  }
  async function refresh() {
    const kind = getLayer();
    if (kind === "storm" && vectors)
      vectors.eachLayer((layer) => {
        if (Date.parse(layer.feature?.properties?.EXPIRE_ISO) <= Date.now()) {
          vectors.removeLayer(layer);
          lastLoad = 0;
        }
      });
    if (
      !["fire", "storm"].includes(kind) ||
      !isVisible() ||
      document.hidden ||
      busy ||
      Date.now() < retryAt ||
      Date.now() - lastLoad < 300000
    )
      return;
    busy = true;
    controller = new AbortController();
    const own = ++generation;
    const body = focus(
      kind === "fire" ? "fire" : "lightning",
      kind === "fire" ? "REPORTED FIRES" : "SPC STORM OUTLOOK",
      "Checking official source…",
      kind === "fire"
        ? "Recent US incident points within 400 km"
        : "Day-one forecast areas · United States",
    );
    try {
      if (kind === "fire") {
        const r = await fireReports(getPlace(), { signal: controller.signal });
        if (own !== generation) return;
        clearVectors();
        vectors = L.layerGroup().addTo(getMap());
        r.features.forEach((f) => {
          const c = f.geometry.coordinates;
          L.circleMarker([c[1], c[0]], {
            pane: "hazards",
            radius: 6,
            color: "#ffdbb1",
            fillColor: "#ed995e",
            fillOpacity: 0.85,
            weight: 1.5,
          })
            .bindTooltip(
              node("span", f.properties.IncidentName || "Reported incident"),
            )
            .on("click", () => fireDetail(f))
            .addTo(vectors);
        });
        const first = r.features[0];
        body.querySelector("strong").textContent = !r.available
          ? "US incident reports only"
          : first
            ? `${distance(first.distance)} to nearest returned report`
            : "No recent reports returned";
        body.querySelector("p").textContent = first
          ? first.properties.IncidentName
          : "400 km search · updates within 7 days";
        body.append(
          node(
            "small",
            "Report point, not fire edge · not a risk rating",
            "atlas-caveat",
          ),
        );
        if (first) {
          const open = node("button", "View report ↗", "condition-link");
          open.onclick = () => fireDetail(first);
          body.append(open);
        }
        status(
          !r.available
            ? "Fire source covers US incidents"
            : `${r.features.length} recent incident report${r.features.length === 1 ? "" : "s"}${r.complete ? "" : " · results may be incomplete"} · missing reports are not an all-clear`,
        );
      } else {
        const r = await stormOutlook({ signal: controller.signal });
        if (own !== generation) return;
        clearVectors();
        const colors = {
          TSTM: "#80be9a",
          MRGL: "#78bb64",
          SLGT: "#ebd56b",
          ENH: "#efa269",
          MDT: "#df7e91",
          HIGH: "#ca8bec",
        };
        vectors = L.geoJSON(r.features, {
          pane: "hazards",
          style: (f) => ({
            color: colors[f.properties?.LABEL] || "#a6c6ea",
            weight: 2,
            fillOpacity: 0.2,
          }),
          onEachFeature: (f, l) =>
            l.bindPopup(
              node(
                "div",
                `${f.properties.LABEL2 || f.properties.LABEL} · valid until ${stamp(Date.parse(f.properties.EXPIRE_ISO))}`,
              ),
            ),
        }).addTo(getMap());
        body.querySelector("strong").textContent = r.features.length
          ? "Day-one thunderstorm areas"
          : "No current polygons returned";
        body.querySelector("p").textContent =
          "General · Marginal · Slight · Enhanced · Moderate · High";
        body.append(
          node(
            "small",
            "Forecast areas · not current warnings or an all-clear",
            "atlas-caveat",
          ),
        );
        if (r.features.length) {
          const view = node("button", "View outlook areas", "condition-link");
          view.onclick = () => {
            const bounds = vectors.getBounds();
            if (bounds.isValid())
              getMap().fitBounds(bounds, { padding: [45, 45], maxZoom: 6 });
          };
          body.append(view);
        }
        status("NOAA / SPC day-one outlook · US forecast polygons");
      }
      lastLoad = Date.now();
      retryAt = 0;
    } catch (e) {
      if (own === generation) {
        retryAt = Math.max(Date.now() + 60000, e.retryAt || 0);
        body.querySelector("strong").textContent = "Source unavailable";
        body.querySelector("p").textContent =
          "Previous shapes may be unverified. Missing data does not mean low risk.";
        status("Hazard source unavailable · no all-clear can be inferred");
      }
    } finally {
      if (own === generation) busy = false;
    }
  }
  function activate(kind) {
    stop();
    lastSample = null;
    clearVectors();
    panel.hidden = true;
    lastLoad = 0;
    retryAt = 0;
    updateSelected();
    if (kind === "lightning") {
      const p = getPlace();
      if (getMap().getZoom() < 8)
        getMap().setView([p.latitude, p.longitude], 8);
      rings();
      const body = focus(
        "lightning",
        "LOCAL LIGHTNING GRID",
        "Loading observed lightning…",
        "10 / 20 / 30 " +
          (getMeasurements() === "imperial" ? "mi" : "km") +
          " distance reference rings",
      );
      body.append(
        node(
          "small",
          "Density, not individual strike locations",
          "atlas-caveat",
        ),
      );
    } else if (["fire", "storm"].includes(kind)) void refresh();
    $("lightning-history").hidden = kind !== "lightning";
  }
  addEventListener("truecast:map-frame", (e) => {
    if (e.detail.mode === "lightning") void sample(e.detail.time);
    updateSelected();
  });
  addEventListener("truecast:saved", savedLocations);
  addEventListener("truecast:measurements", () => {
    if (getLayer() === "lightning") activate("lightning");
  });
  renderCatalog();
  return {
    activate,
    refresh,
    stop,
    updateSelected,
    updateLabels,
    savedLocations,
    mount(pane) {
      basemapPane = pane;
      applyStyle();
      savedLocations();
    },
    setPlace() {
      savedLocations();
      if (getLayer() === "lightning") activate("lightning");
      else if (["fire", "storm"].includes(getLayer())) activate(getLayer());
    },
  };
}
