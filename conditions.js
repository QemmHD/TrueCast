import { $, node } from "./api.js";
import { moonIllumination, moonPhaseName } from "./celestial.js";
import {
  densityLabel,
  lightningSample,
  lightningText,
  fireReports,
} from "./hazard-data.js";
const iconPaths = {
  lightning: "M14 2 5 13h6l-1 9 9-13h-6l1-7Z",
  fire: "M12 2c2 5-3 6 0 9 1-2 3-2 3-5 5 5 6 10 2 14-3 3-8 2-10-1-3-5 1-8 2-10-1 4 2 5 3 3 1-3-1-5 0-10Z",
  air: "M3 8c4-5 7 5 11 0s6 0 7 0M3 13c4-5 7 5 11 0s6 0 7 0M3 18c4-5 7 5 11 0s6 0 7 0",
  sun: "M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
};
export function glyph(name) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(s.namespaceURI, "path");
  p.setAttribute("d", iconPaths[name] || iconPaths.lightning);
  s.append(p);
  return s;
}
export function windCompass(speed, direction, format) {
  const box = node("div", null, "wind-compass");
  box.setAttribute("role", "img");
  box.setAttribute(
    "aria-label",
    `Wind from ${Number.isFinite(direction) ? Math.round(direction) + " degrees" : "an unavailable direction"}, ${format(speed)}`,
  );
  for (let i = 0; i < 24; i++) {
    const tick = node("i");
    tick.style.setProperty("--a", `${i * 15}deg`);
    tick.className = i % 6 === 0 ? "major" : "";
    box.append(tick);
  }
  ["N", "E", "S", "W"].forEach((text, i) => {
    const label = node("span", text, "compass-point");
    label.style.setProperty("--a", `${i * 90}deg`);
    box.append(label);
  });
  const needle = node("div", null, "compass-needle");
  needle.style.transform = `rotate(${direction || 0}deg)`;
  needle.hidden = !Number.isFinite(direction);
  box.append(needle);
  const text = node(
    "strong",
    Number.isFinite(speed) ? format(speed) : "—",
    "compass-speed",
  );
  box.append(text);
  return box;
}
function facts(items) {
  const box = node("div", null, "detail-facts observations-table");
  for (const [label, value] of items) {
    const row = node("div");
    row.append(node("span", label), node("strong", value));
    box.append(row);
  }
  return box;
}
export function createConditions({
  getData,
  getAir,
  getPlace,
  temp,
  wind,
  rain,
  pressure,
  time,
  todayIndex,
  start,
  present,
  openMap,
  openAir,
  openStation,
  getMeasurements,
}) {
  let generation = 0,
    controller;
  const cancel = () => {
    generation++;
    controller?.abort();
  };
  $("detail-dialog").addEventListener("close", cancel);
  addEventListener("truecast:place", cancel);
  const button = (text, fn) => {
    const b = node("button", text.replace(/ ↗$/, ""), "condition-link");
    if (text.endsWith("↗")) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", "M4 12 12 4M4 4h8v8");
      svg.append(path);
      b.append(svg);
    }
    b.onclick = fn;
    return b;
  };
  const section = (title, action) => {
    const s = node("section", null, "condition-section"),
      head = node("div", null, "condition-heading");
    head.append(node("h3", title));
    if (action) head.append(action);
    s.append(head);
    return s;
  };
  const mapButton = (layer, product) =>
    button("Map ↗", () => openMap(layer, product));
  const compassText = (n) =>
    Number.isFinite(n)
      ? [
          "N",
          "NNE",
          "NE",
          "ENE",
          "E",
          "ESE",
          "SE",
          "SSE",
          "S",
          "SSW",
          "SW",
          "WSW",
          "W",
          "WNW",
          "NW",
          "NNW",
        ][Math.round(n / 22.5) % 16]
      : "Direction unavailable";
  function windBlock() {
    const d = getData(),
      c = d.current,
      s = section("Wind", mapButton("forecast", "wind")),
      body = node("div", null, "condition-wind");
    const detail = node("div");
    detail.append(
      node(
        "strong",
        `${compassText(c.wind_direction_10m)} ${wind(c.wind_speed_10m)}`,
      ),
      node("p", `Gusts ${wind(c.wind_gusts_10m)}`, "muted"),
      node(
        "small",
        `Daily maximum ${wind(d.daily.wind_speed_10m_max[todayIndex()])}`,
        "fine",
      ),
    );
    body.append(
      windCompass(c.wind_speed_10m, c.wind_direction_10m, wind),
      detail,
    );
    s.append(body);
    const scale = node("div", null, "wind-spectrum"),
      marker = node("i");
    marker.style.left = `${Math.min(100, Math.max(0, ((c.wind_speed_10m || 0) / 90) * 100))}%`;
    marker.hidden = !Number.isFinite(c.wind_speed_10m);
    scale.append(marker);
    s.append(
      scale,
      node(
        "p",
        "Calm                                              Strong wind",
        "wind-scale-labels",
      ),
    );
    return s;
  }
  function sunBlock() {
    const d = getData(),
      k = todayIndex(),
      s = section("Sun & moon"),
      body = node("div", null, "sun-moon-grid"),
      solar = node("div", null, "solar-clock"),
      lunar = node("div", null, "lunar-clock");
    const arc = node("div", null, "solar-arc"),
      sun = node("i");
    const rise = d.daily.sunrise[k] * 1000,
      set = d.daily.sunset[k] * 1000;
    const progress = Math.min(
      1,
      Math.max(0, (Date.now() - rise) / (set - rise)),
    );
    sun.style.left = `${50 - 47 * Math.cos(progress * Math.PI)}%`;
    sun.style.bottom = `${47 * Math.sin(progress * Math.PI)}%`;
    sun.hidden = !Number.isFinite(progress);
    arc.append(sun);
    solar.append(
      arc,
      node("p", `${time(d.daily.sunrise[k])}  →  ${time(d.daily.sunset[k])}`),
      node("small", "Sunrise · Sunset", "fine"),
    );
    const moon = moonIllumination(),
      disc = node("div", null, "moon-disc"),
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("aria-hidden", "true");
    const circle = document.createElementNS(svg.namespaceURI, "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "44");
    circle.setAttribute("fill", "#18253d");
    svg.append(circle);
    const path = document.createElementNS(svg.namespaceURI, "path"),
      waxing = moon.phase < 0.5,
      rx = Math.abs(Math.cos(2 * Math.PI * moon.phase)) * 44;
    // Illuminated hemisphere and elliptical terminator follow the calculated phase.
    const outer = waxing ? 1 : 0,
      inner = moon.fraction > 0.5 ? (waxing ? 1 : 0) : waxing ? 0 : 1;
    path.setAttribute(
      "d",
      `M50 6 A44 44 0 0 ${outer} 50 94 A${Math.max(0.01, rx)} 44 0 0 ${inner} 50 6Z`,
    );
    path.setAttribute("fill", "#e3ecfb");
    svg.append(path);
    disc.append(svg);
    lunar.append(
      disc,
      node("p", moonPhaseName(moon.phase)),
      node(
        "small",
        `${Math.round(moon.fraction * 100)}% illuminated · calculated`,
        "fine",
      ),
    );
    body.append(solar, lunar);
    s.append(body);
    return s;
  }
  function sun() {
    cancel();
    const content = node("div");
    content.append(
      sunBlock(),
      node(
        "p",
        "Sun times use the location’s forecast timezone. Lunar illumination is calculated from SunCalc astronomy; the icon is a phase diagram, not the moon’s local orientation.",
        "fine",
      ),
    );
    present("Sun & moon", content, "CELESTIAL");
  }
  function windView() {
    cancel();
    const content = node("div");
    content.append(
      windBlock(),
      node(
        "p",
        "Near-surface model wind. The compass shows where wind comes from; it does not indicate storm motion.",
        "fine",
      ),
    );
    present("Wind", content, "LOCAL CONDITIONS");
  }
  function open() {
    cancel();
    controller = new AbortController();
    const own = generation,
      signal = controller.signal,
      d = getData(),
      c = d.current,
      k = todayIndex(),
      p = getPlace(),
      content = node("div", null, "conditions-overview");
    const active = () =>
      own === generation &&
      $("detail-dialog").open &&
      $("detail-title").textContent === "All conditions";
    const intro = node("div", null, "conditions-intro");
    intro.append(
      node("span", "YOUR LOCAL PICTURE", "eyebrow"),
      node("h3", p.name),
      node("p", `Model conditions valid ${time(c.time)} · Open-Meteo`, "fine"),
    );
    content.append(intro);
    const lightning = section("Lightning", mapButton("lightning")),
      lh = node("div", null, "hazard-row"),
      lb = node("div", null, "condition-emblem lightning-emblem"),
      lt = node("div");
    lb.append(glyph("lightning"));
    const headline = node("strong", "Checking local grid…"),
      ls = node("p", "15-minute lightning density · NOAA", "fine");
    lt.append(headline, ls);
    lh.append(lb, lt);
    lightning.append(
      lh,
      node(
        "p",
        "Density cannot provide a closest-strike distance. If you hear thunder, move indoors.",
        "fine",
      ),
    );
    content.append(lightning);
    const air = getAir()?.current,
      aq = section("Air you breathe", button("Air & pollen ↗", openAir));
    aq.append(
      facts([
        [
          "US AQI",
          Number.isFinite(air?.us_aqi) ? String(air.us_aqi) : "Unavailable",
        ],
        [
          "PM2.5",
          Number.isFinite(air?.pm2_5)
            ? `${air.pm2_5.toFixed(1)} μg/m³`
            : "Unavailable",
        ],
        [
          "PM10",
          Number.isFinite(air?.pm10)
            ? `${air.pm10.toFixed(1)} μg/m³`
            : "Unavailable",
        ],
      ]),
    );
    content.append(aq, windBlock());
    const precip = section("Precipitation", mapButton("forecast", "precip"));
    precip.append(
      facts([
        ["Today’s forecast total", rain(d.daily.precipitation_sum[k])],
        [
          "Maximum rain chance",
          Number.isFinite(d.daily.precipitation_probability_max[k])
            ? `${Math.round(d.daily.precipitation_probability_max[k])}%`
            : "Unavailable",
        ],
        ["Current hourly accumulation", rain(d.hourly.precipitation[start()])],
      ]),
      node(
        "p",
        "Model accumulations, not measured monthly/yearly totals.",
        "fine",
      ),
    );
    content.append(precip);
    const fire = section("Fire reports", mapButton("fire")),
      fh = node("div", null, "hazard-row"),
      fb = node("div", null, "condition-emblem fire-emblem"),
      ft = node("div");
    fb.append(glyph("fire"));
    const fs = node("strong", "Checking reported incidents…"),
      fn = node("p", "NIFC / WFIGS · US reports", "fine");
    ft.append(fs, fn);
    fh.append(fb, ft);
    fire.append(
      fh,
      node(
        "p",
        "Reported incident locations do not measure your fire risk or distance to a fire perimeter.",
        "fine",
      ),
    );
    content.append(fire);
    const uv = section("UV index");
    uv.append(
      facts([
        [
          "Forecast daily maximum",
          Number.isFinite(d.daily.uv_index_max[k])
            ? String(d.daily.uv_index_max[k])
            : "Unavailable",
        ],
      ]),
      node("div", null, "uv-spectrum"),
    );
    content.append(uv, sunBlock());
    const obs = section(
      "Conditions & observations",
      button("Nearby station ↗", openStation),
    );
    const humidity = d.hourly.relative_humidity_2m.filter(
      (value, i) =>
        Number.isFinite(value) &&
        d.hourly.time[i] >= d.daily.time[k] &&
        d.hourly.time[i] < (d.daily.time[k + 1] || d.daily.time[k] + 86400),
    );
    obs.append(
      facts([
        ["Temperature", temp(c.temperature_2m)],
        ["Feels like", temp(c.apparent_temperature)],
        [
          "High / low",
          `${temp(d.daily.temperature_2m_max[k])} / ${temp(d.daily.temperature_2m_min[k])}`,
        ],
        ["Dew point", temp(c.dew_point_2m)],
        [
          "Humidity",
          Number.isFinite(c.relative_humidity_2m)
            ? `${c.relative_humidity_2m}%`
            : "Unavailable",
        ],
        [
          "Humidity range (forecast)",
          humidity.length
            ? `${Math.min(...humidity)}–${Math.max(...humidity)}%`
            : "Unavailable",
        ],
        ["Pressure (sea level)", pressure(c.pressure_msl)],
        ["Source", "Model estimate · station readings are separate"],
      ]),
    );
    content.append(obs);
    present("All conditions", content, "YOUR WEATHER, ORGANIZED");
    lightningSample(p, { signal })
      .then((value) => {
        if (!active()) return;
        headline.textContent = lightningText(value);
        ls.textContent = value.available
          ? `${value.value === null ? "Unavailable value" : densityLabel(value.value) + " strikes/km²/min"} · 15 min ending ${time(value.time / 1000)}`
          : "This source covers the Americas and adjacent oceans.";
      })
      .catch(() => {
        if (active()) {
          headline.textContent = "Lightning check unavailable";
          ls.textContent =
            "Open the map for source status; no all-clear can be inferred.";
        }
      });
    fireReports(p, { signal })
      .then((value) => {
        if (!active()) return;
        const first = value.features[0];
        fs.textContent = !value.available
          ? "US incident reports only"
          : first
            ? `Nearest returned report: ${(first.distance / (getMeasurements() === "imperial" ? 1.609344 : 1)).toFixed(first.distance / (getMeasurements() === "imperial" ? 1.609344 : 1) < 10 ? 1 : 0)} ${getMeasurements() === "imperial" ? "mi" : "km"}`
            : "No recent reports returned";
        fn.textContent = first
          ? `${first.properties.IncidentName} · point location, not fire edge`
          : "Search within 400 km · reports updated in the last 7 days";
        if (!value.complete && value.available)
          fn.textContent += " · results may be incomplete";
      })
      .catch(() => {
        if (active()) {
          fs.textContent = "Fire reports unavailable";
          fn.textContent = "A missing feed does not mean low fire risk.";
        }
      });
  }
  return { open, sun, wind: windView };
}
