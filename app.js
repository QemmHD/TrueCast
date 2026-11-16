import { $, store, node, json, condition, weatherIcon } from "./api.js";
import { initUI, sheet } from "./ui.js";
import { createRadar } from "./radar.js";
import { RefreshResource, freshnessText } from "./refresh.js";
import {
  activeHourIndex,
  selectionAfterRefresh,
  validForecast,
} from "./forecast-time.js";
import { nwsPoint, sourceTools } from "./sources.js";
initUI();
let unit = store.get("truecast-unit", "F"),
  measurements = store.get("truecast-measurements", "imperial");
if (!store.get("truecast-fahrenheit-v3", false)) {
  unit = "F";
  store.set("truecast-unit", "F");
  store.set("truecast-fahrenheit-v3", true);
}
let place = store.get("truecast-last", {
  name: "London",
  country: "United Kingdom",
  country_code: "GB",
  latitude: 51.5072,
  longitude: -0.1276,
});
let saved = store.get("truecast-places", []);
if (!Array.isArray(saved)) saved = [];
let data,
  air,
  airStatus = "loading",
  alerts = { status: "loading", features: [] },
  generation = 0,
  resources = {},
  sourceStates = {},
  renderedStart = null,
  renderedDay = null,
  selectedTime = null,
  metric = "temperature",
  selected = 0,
  detailType = "",
  alertViewSignature = "";
const temp = (n) =>
  Number.isFinite(n) ? `${Math.round(unit === "F" ? n * 1.8 + 32 : n)}°` : "—";
const wind = (n) =>
  Number.isFinite(n)
    ? `${Math.round(measurements === "imperial" ? n / 1.609344 : n)} ${measurements === "imperial" ? "mph" : "km/h"}`
    : "—";
const rain = (n) =>
  Number.isFinite(n)
    ? `${(measurements === "imperial" ? n / 25.4 : n).toFixed(measurements === "imperial" ? 2 : 1)} ${measurements === "imperial" ? "in" : "mm"}`
    : "—";
const number = (n, s = "") =>
  Number.isFinite(n) ? `${Math.round(n)}${s}` : "—";
const time = (t) =>
  Number.isFinite(t)
    ? new Intl.DateTimeFormat("en", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: data?.timezone || "UTC",
      }).format(new Date(t * 1000))
    : "—";
const day = (t) =>
  new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: data?.timezone || "UTC",
  }).format(new Date(t * 1000));
const pressure = (n) =>
  Number.isFinite(n)
    ? measurements === "imperial"
      ? `${(n / 33.86389).toFixed(2)} inHg`
      : `${Math.round(n)} hPa`
    : "—";
const compass = (n) =>
  Number.isFinite(n)
    ? ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(n / 45) % 8]
    : "";
function start() {
  if (!data) return 0;
  return activeHourIndex(data.hourly.time);
}
function todayIndex() {
  const key = (t) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: data.timezone,
    }).format(new Date(t));
  const i = data.daily.time.findIndex((t) => key(t * 1000) === key(Date.now()));
  return Math.max(0, i);
}
function metricValue(i) {
  const h = data.hourly;
  return metric === "rain"
    ? h.precipitation[i]
    : metric === "wind"
      ? h.wind_speed_10m[i]
      : h.temperature_2m[i];
}
function formatMetric(n) {
  return metric === "rain" ? rain(n) : metric === "wind" ? wind(n) : temp(n);
}
function savedPlaces() {
  $("favorites").replaceChildren();
  $("favorites-empty").hidden = saved.length > 0;
  saved.forEach((p) => {
    const row = node("div", null, "saved-place"),
      b = node("button", p.name),
      remove = node("button", "✕", "icon-button");
    b.onclick = () => load(p);
    remove.setAttribute("aria-label", `Remove ${p.name}`);
    remove.onclick = () => {
      saved = saved.filter((x) => x !== p);
      store.set("truecast-places", saved);
      savedPlaces();
    };
    row.append(b, remove);
    $("favorites").append(row);
  });
  const isSaved = saved.some(
    (p) => p.latitude === place.latitude && p.longitude === place.longitude,
  );
  $("save").textContent = isSaved ? "★" : "☆";
  $("save").setAttribute(
    "aria-label",
    isSaved ? "Remove current place from favorites" : "Save current place",
  );
  $("save").setAttribute("aria-pressed", String(isSaved));
}
function render() {
  if (!data) return;
  const c = data.current,
    d = data.daily,
    h = data.hourly,
    k = todayIndex(),
    begin = start();
  document.body.dataset.night = String(c.is_day === 0);
  document.body.dataset.weather =
    c.weather_code >= 51 ? "wet" : c.weather_code >= 3 ? "cloudy" : "clear";
  $("units").textContent = unit === "F" ? "°F / °C" : "°C / °F";
  $("measurements").value = measurements;
  $("place").textContent = place.name;
  $("date").textContent =
    `${day(Date.now() / 1000)} · ${data.timezone.replaceAll("_", " ")}`;
  $("temperature").textContent = temp(c.temperature_2m);
  $("condition").textContent = condition(c.weather_code);
  $("feels").textContent = temp(c.apparent_temperature);
  $("range").textContent =
    `H:${temp(d.temperature_2m_max[k])}  L:${temp(d.temperature_2m_min[k])}`;
  $("weather-art").replaceChildren(weatherIcon(c.weather_code, c.is_day === 1));
  $("today-rain").textContent = number(d.precipitation_probability_max[k], "%");
  $("rain-caption").textContent =
    `${rain(d.precipitation_sum[k])} expected today`;
  $("wind").textContent = wind(c.wind_speed_10m);
  $("wind-caption").textContent =
    `${compass(c.wind_direction_10m)} · Gusts ${wind(c.wind_gusts_10m)}`;
  $("uv").textContent = Number.isFinite(d.uv_index_max[k])
    ? d.uv_index_max[k].toFixed(1)
    : "—";
  $("uv-caption").textContent = uvLabel(d.uv_index_max[k]);
  $("preview-hours").replaceChildren();
  for (let i = begin; i < Math.min(begin + 12, h.time.length); i++) {
    const b = node("button", null, "preview-hour");
    b.append(
      node("small", time(h.time[i]).replace(":00", "")),
      weatherIcon(h.weather_code[i], h.is_day[i] === 1),
      node("strong", temp(h.temperature_2m[i])),
      node("small", number(h.precipitation_probability[i], "%"), "rain-chance"),
    );
    b.setAttribute(
      "aria-label",
      `${day(h.time[i])}, ${time(h.time[i])}, ${temp(h.temperature_2m[i])}, ${number(h.precipitation_probability[i], "% rain chance")}`,
    );
    b.onclick = () => {
      selected = i - begin;
      metric = "temperature";
      renderForecast();
      location.hash = "forecast";
    };
    $("preview-hours").append(b);
  }
  let change = "No upcoming hours in this saved forecast.";
  if (begin < h.time.length) {
    const next = h.precipitation_probability.findIndex(
      (p, i) =>
        i > begin &&
        i < begin + 18 &&
        p >= 40 &&
        p >= (h.precipitation_probability[begin] || 0) + 20,
    );
    if (next >= 0)
      change = `Rain chance rises to ${number(h.precipitation_probability[next], "%")} around ${time(h.time[next])}.`;
    else {
      const next = h.weather_code.findIndex(
        (code, i) =>
          i > begin &&
          i < begin + 12 &&
          condition(code) !== condition(h.weather_code[begin]),
      );
      change =
        next >= 0
          ? `${condition(h.weather_code[next])} expected around ${time(h.time[next])}.`
          : `${condition(h.weather_code[begin])} through ${time(h.time[Math.min(begin + 6, h.time.length - 1)])}.`;
    }
  }
  $("change-brief").textContent = change;
  const sunrise = d.sunrise[k],
    sunset = d.sunset[k],
    now = Date.now() / 1000;
  const nextSun =
    now < sunrise ? sunrise : now < sunset ? sunset : d.sunrise[k + 1];
  $("today-sunset").textContent = time(nextSun);
  document.querySelector(".sun-strip small").textContent =
    now < sunrise || now >= sunset ? "SUNRISE" : "SUNSET";
  const progress =
    Number.isFinite(sunrise) && Number.isFinite(sunset) && sunset > sunrise
      ? Math.min(1, Math.max(0, (now - sunrise) / (sunset - sunrise)))
      : 0;
  $("daylight-progress").style.width = `${progress * 100}%`;
  $("daylight-label").textContent =
    now >= sunrise && now < sunset
      ? `${Math.floor((sunset - now) / 3600)}h ${Math.floor(((sunset - now) % 3600) / 60)}m left`
      : "Night";
  renderForecast();
  renderDays();
  renderPlan();
  renderAir();
  if ($("detail-dialog").open && detailType && detailType !== "alerts") {
    const scroll = $("detail-dialog").scrollTop;
    showDetail(detailType);
    $("detail-dialog").scrollTop = scroll;
  }
  // Open sheets keep their scroll position during background updates.
  renderedStart = start();
  renderedDay = todayIndex();
}
function uvLabel(n) {
  return !Number.isFinite(n)
    ? "Unavailable"
    : n < 3
      ? "Low · Daily maximum"
      : n < 6
        ? "Moderate · Daily maximum"
        : n < 8
          ? "High · Daily maximum"
          : n < 11
            ? "Very high · Daily maximum"
            : "Extreme · Daily maximum";
}
function renderForecast() {
  if (!data) return;
  const h = data.hourly,
    begin = start(),
    count = Math.max(
      0,
      Math.min(Number($("horizon").value), h.time.length - begin),
    );
  selected = Math.min(Math.max(0, selected), Math.max(0, count - 1));
  document
    .querySelectorAll("[data-metric]")
    .forEach((n) =>
      n.setAttribute("aria-pressed", String(n.dataset.metric === metric)),
    );
  $("forecast-scrub").max = Math.max(0, count - 1);
  $("forecast-scrub").value = selected;
  $("forecast-scrub").disabled = count === 0;
  const chart = $("forecast-chart");
  chart.replaceChildren();
  const values = Array.from({ length: count }, (_, i) =>
      metricValue(begin + i),
    ),
    valid = values.filter(Number.isFinite);
  if (valid.length) {
    const low = metric === "temperature" ? Math.min(...valid) - 1 : 0,
      high = Math.max(...valid) + 0.1,
      span = Math.max(1, high - low),
      ns = "http://www.w3.org/2000/svg",
      svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 600 180");
    svg.setAttribute("role", "img");
    svg.setAttribute(
      "aria-label",
      `${metric} forecast. Select an hourly entry for exact values.`,
    );
    svg.classList.add(`chart-${metric}`);
    for (let j = 0; j < 4; j++) {
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", "6");
      line.setAttribute("x2", "594");
      line.setAttribute("y1", 20 + j * 42);
      line.setAttribute("y2", 20 + j * 42);
      line.setAttribute("class", "chart-grid");
      svg.append(line);
    }
    let path = "",
      gap = true;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        gap = true;
        return;
      }
      const x = 8 + (i / Math.max(1, count - 1)) * 584,
        y = 151 - ((v - low) / span) * 125;
      path += `${gap ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)} `;
      gap = false;
    });
    const line = document.createElementNS(ns, "path");
    line.setAttribute("d", path);
    line.setAttribute("class", "chart-line");
    svg.append(line);
    const cursor = document.createElementNS(ns, "line");
    cursor.id = "chart-cursor";
    cursor.setAttribute("y1", "10");
    cursor.setAttribute("y2", "165");
    cursor.setAttribute("class", "chart-cursor");
    svg.append(cursor);
    chart.prepend(
      node(
        "div",
        `${metric === "temperature" ? "Temperature" : metric === "rain" ? "Hourly precipitation (hour ending at time shown)" : "Wind speed"} · ${metric === "temperature" ? (unit === "F" ? "°F" : "°C") : metric === "rain" ? (measurements === "imperial" ? "in" : "mm") : measurements === "imperial" ? "mph" : "km/h"}`,
        "chart-unit",
      ),
    );
    chart.append(svg);
    const axis = node("div", null, "chart-axis");
    [0, Math.floor((count - 1) / 2), count - 1].forEach((i) =>
      axis.append(
        node(
          "span",
          Number($("horizon").value) > 24
            ? `${day(h.time[begin + i])} ${time(h.time[begin + i])}`
            : time(h.time[begin + i]),
        ),
      ),
    );
    chart.append(axis);
  } else chart.append(node("p", "No hourly forecast available.", "fine"));
  $("hours").replaceChildren();
  for (let j = 0; j < count; j++) {
    const i = begin + j,
      b = node("button", null, "hour");
    b.dataset.index = j;
    b.append(
      node("small", time(h.time[i]).replace(":00", "")),
      weatherIcon(h.weather_code[i], h.is_day[i] === 1),
      node("strong", formatMetric(metricValue(i))),
      node("small", number(h.precipitation_probability[i], "%"), "rain-chance"),
    );
    b.setAttribute(
      "aria-label",
      `${day(h.time[i])} ${time(h.time[i])}, ${formatMetric(metricValue(i))}`,
    );
    b.onclick = () => selectHour(j);
    $("hours").append(b);
  }
  selectHour(selected);
}
function selectHour(index) {
  if (!data) return;
  selected = index;
  const h = data.hourly,
    begin = start(),
    i = begin + selected;
  if (i >= h.time.length) {
    $("selected-value").textContent = "—";
    $("selected-condition").textContent = "No upcoming forecast";
    $("hour-detail").replaceChildren();
    return;
  }
  selectedTime = h.time[i];
  $("selected-date").textContent =
    `${day(h.time[i])} · ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: data.timezone, timeZoneName: "short" }).format(new Date(h.time[i] * 1000))}`;
  $("selected-date").dataset.validAt = String(h.time[i]);
  $("selected-date").title = new Intl.DateTimeFormat("en", {
    timeZone: data.timezone,
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(h.time[i] * 1000));
  $("selected-value").textContent = formatMetric(metricValue(i));
  $("selected-condition").textContent = condition(h.weather_code[i]);
  $("forecast-scrub").value = selected;
  const cursor = $("chart-cursor");
  if (cursor) {
    const x =
      8 + (selected / Math.max(1, Number($("forecast-scrub").max))) * 584;
    cursor.setAttribute("x1", x);
    cursor.setAttribute("x2", x);
  }
  document
    .querySelectorAll(".hour")
    .forEach((n) =>
      n.setAttribute(
        "aria-pressed",
        String(Number(n.dataset.index) === selected),
      ),
    );
  const detail = $("hour-detail");
  detail.replaceChildren();
  [
    ["Feels like", temp(h.apparent_temperature[i])],
    ["Rain chance", number(h.precipitation_probability[i], "%")],
    ["Wind gusts", wind(h.wind_gusts_10m[i])],
    ["Humidity", number(h.relative_humidity_2m[i], "%")],
  ].forEach(([label, value]) => {
    const n = node("div");
    n.append(node("small", label), node("strong", value));
    detail.append(n);
  });
}
function renderDays() {
  const d = data.daily;
  $("days").replaceChildren();
  const valid = [...d.temperature_2m_min, ...d.temperature_2m_max].filter(
      Number.isFinite,
    ),
    low = Math.min(...valid),
    span = Math.max(1, Math.max(...valid) - low);
  d.time.forEach((t, i) => {
    const b = node("button", null, "day"),
      bar = node("span", null, "temperature-bar"),
      fill = node("i");
    b.append(
      node(
        "span",
        i === todayIndex()
          ? "Today"
          : new Intl.DateTimeFormat("en", {
              weekday: "short",
              day: "numeric",
              timeZone: data.timezone,
            }).format(new Date(t * 1000)),
      ),
      weatherIcon(d.weather_code[i]),
      node("span", temp(d.temperature_2m_min[i]), "day-low"),
    );
    if (
      Number.isFinite(d.temperature_2m_min[i]) &&
      Number.isFinite(d.temperature_2m_max[i])
    ) {
      fill.style.left = `${((d.temperature_2m_min[i] - low) / span) * 100}%`;
      fill.style.width = `${Math.max(3, ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100)}%`;
      bar.append(fill);
    }
    b.append(
      bar,
      node("strong", temp(d.temperature_2m_max[i])),
      node(
        "small",
        number(d.precipitation_probability_max[i], "%"),
        "rain-chance",
      ),
    );
    b.onclick = () => {
      detailType = "";
      const content = node("div");
      content.append(
        node("p", condition(d.weather_code[i]), "detail-summary"),
        facts([
          [
            "High / low",
            `${temp(d.temperature_2m_max[i])} / ${temp(d.temperature_2m_min[i])}`,
          ],
          ["Rain chance", number(d.precipitation_probability_max[i], "%")],
          ["Precipitation", rain(d.precipitation_sum[i])],
          ["Maximum wind", wind(d.wind_speed_10m_max[i])],
          ["Maximum UV", number(d.uv_index_max[i])],
          ["Sunrise / sunset", `${time(d.sunrise[i])} / ${time(d.sunset[i])}`],
        ]),
      );
      sheet(day(t), content, "DAILY FORECAST");
    };
    $("days").append(b);
  });
}
function facts(items) {
  const g = node("div", null, "detail-facts");
  items.forEach(([label, value]) => {
    const row = node("div");
    row.append(node("span", label), node("strong", value));
    g.append(row);
  });
  return g;
}
function showDetail(type) {
  detailType = type;
  const c = data?.current,
    d = data?.daily,
    k = data ? todayIndex() : 0,
    content = node("div");
  if (type === "alerts") {
    renderAlertsInto(content);
    sheet("Official warnings", content, "LOCAL ALERTS");
    return;
  }
  if (!data) {
    content.append(
      node(
        "p",
        "Weather data is unavailable. Refresh when you have a connection.",
        "muted",
      ),
    );
    sheet("Weather details", content);
    return;
  }
  let title = "All conditions",
    items = [];
  if (type === "rain") {
    title = "Precipitation";
    content.append(
      node(
        "p",
        `${number(d.precipitation_probability_max[k], "%")} chance today`,
        "detail-summary",
      ),
    );
    items = [
      ["Expected total", rain(d.precipitation_sum[k])],
      ["Maximum chance", number(d.precipitation_probability_max[k], "%")],
    ];
    content.append(
      node(
        "p",
        "Hourly rain chance and accumulation are model forecasts. These do not provide minute-specific arrival times.",
        "fine",
      ),
    );
  } else if (type === "wind") {
    title = "Wind";
    content.append(
      node(
        "div",
        `${compass(c.wind_direction_10m)} ${wind(c.wind_speed_10m)}`,
        "detail-summary",
      ),
    );
    items = [
      [
        "Direction",
        `${compass(c.wind_direction_10m)} ${number(c.wind_direction_10m, "°")}`,
      ],
      ["Gusts", wind(c.wind_gusts_10m)],
      ["Daily maximum", wind(d.wind_speed_10m_max[k])],
    ];
  } else if (type === "uv") {
    title = "UV index";
    content.append(node("p", uvLabel(d.uv_index_max[k]), "detail-summary"));
    items = [["Daily maximum", number(d.uv_index_max[k])]];
    content.append(node("div", null, "uv-spectrum"));
    content.append(
      node(
        "p",
        "Check local sun-protection guidance. UV index here is the forecast daily maximum, not your current exposure or a personalized burn time.",
        "fine",
      ),
    );
  } else if (type === "aqi") {
    title = "Air quality";
    content.append(node("p", $("aq-note").textContent, "detail-summary"));
    items = [
      ["US AQI", number(air?.current?.us_aqi)],
      [
        "PM2.5",
        Number.isFinite(air?.current?.pm2_5)
          ? `${air.current.pm2_5.toFixed(1)} μg/m³`
          : "—",
      ],
      [
        "PM10",
        Number.isFinite(air?.current?.pm10)
          ? `${air.current.pm10.toFixed(1)} μg/m³`
          : "—",
      ],
      [
        "Ozone",
        Number.isFinite(air?.current?.ozone)
          ? `${air.current.ozone.toFixed(1)} μg/m³`
          : "—",
      ],
    ];
    content.append(
      node(
        "p",
        "CAMS model via Open-Meteo. Regional resolution varies; this is not a neighborhood sensor reading.",
        "fine",
      ),
    );
  } else if (type === "sun") {
    title = "Daylight";
    items = [
      ["Sunrise", time(d.sunrise[k])],
      ["Sunset", time(d.sunset[k])],
      [
        "Day length",
        Number.isFinite(d.sunrise[k]) && Number.isFinite(d.sunset[k])
          ? `${Math.floor((d.sunset[k] - d.sunrise[k]) / 3600)}h ${Math.round(((d.sunset[k] - d.sunrise[k]) % 3600) / 60)}m`
          : "Unavailable",
      ],
    ];
  } else
    items = [
      ["Feels like", temp(c.apparent_temperature)],
      ["Humidity", number(c.relative_humidity_2m, "%")],
      ["Dew point", temp(c.dew_point_2m)],
      ["Pressure (sea level)", pressure(c.pressure_msl)],
      ["Wind", wind(c.wind_speed_10m)],
      ["Gusts", wind(c.wind_gusts_10m)],
      [
        "Visibility",
        Number.isFinite(data.hourly.visibility[start()])
          ? `${(data.hourly.visibility[start()] / (measurements === "imperial" ? 1609.344 : 1000)).toFixed(1)} ${measurements === "imperial" ? "mi" : "km"}`
          : "Unavailable",
      ],
      ["Source", "Open-Meteo · Model estimate"],
    ];
  content.append(facts(items));
  content.append(
    node(
      "p",
      `${type === "aqi" ? "CAMS air quality" : "Open-Meteo model forecast"} · ${sourceStates[type === "aqi" ? "air" : "forecast"] ? freshnessText(sourceStates[type === "aqi" ? "air" : "forecast"], { time: (at) => new Date(at).toLocaleString("en", { timeZone: data.timezone, timeZoneName: "short" }) }) : "Unavailable"}`,
      "fine",
    ),
  );
  sheet(title, content);
}
function renderPlan() {
  if (!data) return;
  const limits = {
      walk: [8, 28, 28],
      run: [5, 23, 24],
      cycle: [8, 28, 20],
      picnic: [16, 29, 18],
    }[$("activity").value],
    duration = Number($("duration").value),
    h = data.hourly,
    matches = [];
  let lastEnd = -1;
  for (
    let i = start();
    i < Math.min(start() + 72, h.time.length - duration + 1);
    i++
  ) {
    if (i < lastEnd) continue;
    let ok = true;
    for (let j = i; j < i + duration; j++)
      if (!(
        h.is_day[j] === 1 &&
        Number.isFinite(h.temperature_2m[j]) &&
        h.temperature_2m[j] >= limits[0] &&
        h.temperature_2m[j] <= limits[1] &&
        Number.isFinite(h.precipitation_probability[j]) &&
        h.precipitation_probability[j] <= 25 &&
        Number.isFinite(h.precipitation[j]) &&
        h.precipitation[j] <= 0.1 &&
        Number.isFinite(h.wind_speed_10m[j]) &&
        h.wind_speed_10m[j] <= limits[2] &&
        h.weather_code[j] < 95
      ))
        ok = false;
    if (ok) {
      matches.push(i);
      lastEnd = i + duration + 1;
      if (matches.length === 3) break;
    }
  }
  $("window").replaceChildren();
  $("other-windows").replaceChildren();
  $("plan-criteria").textContent =
    `${duration} consecutive daylight hour${duration === 1 ? "" : "s"}; temperature ${temp(limits[0])}–${temp(limits[1])}; wind no more than ${wind(limits[2])}; rain chance at most 25%; accumulation at most ${rain(0.1)} per hour. We search the next 72 hours and show the first non-overlapping matches.`;
  if (!matches.length) {
    $("window").append(
      node("span", "NO MATCHING WINDOW", "eyebrow"),
      node("h2", "Keep an eye on the forecast."),
      node(
        "p",
        "No interval matches all your comfort thresholds in the next 72 hours. Try a shorter duration or a different activity.",
        "muted",
      ),
    );
    return;
  }
  matches.forEach((i, j) => {
    const card =
      j === 0 ? $("window") : node("div", null, "alternative-window surface");
    card.append(
      node("small", j === 0 ? "YOUR NEXT WINDOW" : day(h.time[i]), "eyebrow"),
      node("h2", `${time(h.time[i])} – ${time(h.time[i] + duration * 3600)}`),
      node(
        "p",
        `${day(h.time[i])} · ${temp(h.temperature_2m[i])} · ${number(h.precipitation_probability[i], "% rain")} · ${wind(h.wind_speed_10m[i])}`,
        "muted",
      ),
    );
    if (j > 0) $("other-windows").append(card);
  });
}
function renderAir() {
  const n = air?.current?.us_aqi;
  $("aqi").textContent = number(n);
  $("aq-note").textContent = !Number.isFinite(n)
    ? airStatus === "loading"
      ? "Loading…"
      : "Unavailable"
    : n <= 50
      ? "Good · US AQI"
      : n <= 100
        ? "Moderate · US AQI"
        : n <= 150
          ? "Sensitive groups · US AQI"
          : n <= 200
            ? "Unhealthy · US AQI"
            : n <= 300
              ? "Very unhealthy · US AQI"
              : "Hazardous · US AQI";
  if (Number.isFinite(n) && airStatus === "saved")
    $("aq-note").textContent = "Saved · " + $("aq-note").textContent;
}
function renderAlertsInto(content) {
  if (alerts.status === "loading") {
    content.append(node("p", "Checking official alerts…", "muted"));
    return;
  }
  if (alerts.status !== "ok" && alerts.status !== "unverified") {
    content.append(node("p", alerts.message, "muted"));
    return;
  }
  if (alerts.status === "unverified")
    content.append(node("p", alerts.message, "source-warning"));
  if (!alerts.features.length && alerts.status === "ok")
    content.append(
      node(
        "p",
        `No active NWS alerts returned for this point. Checked ${new Date(alerts.at).toLocaleTimeString()}.`,
        "muted",
      ),
    );
  alerts.features.forEach((f) => {
    const p = f.properties,
      card = node("article", null, "warning-detail");
    card.append(
      node("span", `${p.severity} · ${p.event}`, "eyebrow"),
      node("h3", p.headline || p.event),
      node("p", p.description),
      node(
        "p",
        p.instruction || "Follow instructions from the issuing authority.",
      ),
      node("small", `Expires ${new Date(p.expires).toLocaleString()}`),
    );
    content.append(card);
  });
  content.append(
    node("p", "NWS · US coverage. Follow the issuing authority.", "fine"),
  );
}
function updateAlertBadge() {
  $("alert-count").textContent =
    alerts.status === "ok"
      ? String(alerts.features.length)
      : alerts.status === "loading"
        ? "…"
        : alerts.status === "unsupported"
          ? "US"
          : "!";
  $("show-alerts").dataset.hasAlerts = String(alerts.features.length > 0);
  const signature = JSON.stringify(alerts);
  if (
    $("detail-dialog").open &&
    detailType === "alerts" &&
    signature !== alertViewSignature
  ) {
    const scroll = $("detail-dialog").scrollTop;
    showDetail("alerts");
    $("detail-dialog").scrollTop = scroll;
  }
  alertViewSignature = signature;
}
function keepView(renderContent) {
  const elements = [
    document.querySelector("main"),
    $("hours"),
    $("preview-hours"),
  ];
  const positions = elements.map((el) => [el.scrollLeft, el.scrollTop]);
  const focused = document.activeElement;
  const focusedHour = focused?.matches?.(".hour")
    ? Number(focused.dataset.index)
    : null;
  renderContent();
  if (focusedHour !== null)
    $("hours").children[focusedHour]?.focus({ preventScroll: true });
  elements.forEach((el, i) => {
    el.scrollLeft = positions[i][0];
    el.scrollTop = positions[i][1];
  });
}
function currentAlerts(state) {
  const body = state.data;
  if (body?.unsupported)
    return {
      status: "unsupported",
      features: [],
      message:
        "Official alerts currently cover the US. Alerts have not been checked here; consult your national weather service.",
    };
  const features = (body?.features || []).filter(
    (f) => Date.parse(f.properties?.expires) > Date.now(),
  );
  if (!body)
    return {
      status: state.refreshing ? "loading" : "error",
      features: [],
      message:
        "Official alerts could not be checked. This is not an all-clear. Check weather.gov or your local authority.",
    };
  return {
    status: state.fresh ? "ok" : "unverified",
    features,
    at: state.checkedAt,
    message: `${state.offline ? "Offline" : state.error ? "Alert refresh failed" : "Awaiting a fresh check"}. Last checked ${new Date(state.checkedAt).toLocaleTimeString()}. Listed warnings are saved and unverified; expired warnings are excluded. Check weather.gov for current instructions.`,
  };
}
function refreshLabels() {
  const state = sourceStates.forecast;
  if (!state) return;
  $("status").textContent =
    `${freshnessText(state, { label: "Forecast", time: (at) => time(at / 1000) })} · Open-Meteo`;
  $("status").title = state.checkedAt
    ? `Retrieved ${new Date(state.checkedAt).toLocaleString()}. Model conditions valid ${new Date(state.validAt).toLocaleString()}. This is not a station measurement or model issue time.`
    : "No usable forecast";
  $("freshness").textContent = !state.data
    ? "UNAVAILABLE"
    : state.offline
      ? "OFFLINE · SAVED"
      : state.error
        ? "SAVED · RETRYING"
        : state.delayed
          ? "MODEL DATA DELAYED"
          : state.fresh
            ? "MODEL ESTIMATE"
            : "SAVED · CHECK DUE";
  $("refresh-weather").disabled = state.refreshing;
  $("refresh-weather").title =
    state.retryAt > Date.now()
      ? `Source retry after ${new Date(state.retryAt).toLocaleTimeString()}`
      : "Refresh weather";
  document.body.dataset.loading = String(!state.data && state.refreshing);
  for (const [name, snapshot] of Object.entries(sourceStates)) {
    const field = document.getElementById(`source-state-${name}`);
    if (field)
      field.textContent = freshnessText(snapshot, {
        label: name,
        time: (at) => time(at / 1000),
      });
  }
}
function acceptForecast(state) {
  sourceStates.forecast = state;
  if (state.data && state.data !== data) {
    const previous = selectedTime;
    data = state.data;
    selected = selectionAfterRefresh(
      previous,
      data.hourly.time,
      Date.now(),
      Number($("horizon").value),
    );
    keepView(render);
  } else if (!state.data && data) {
    data = null;
    clearWeather();
  }
  if (!state.data && !state.refreshing) {
    $("condition").textContent = "Weather unavailable";
    $("change-brief").textContent = "Reconnect or try another place.";
  }
  refreshLabels();
}
function clearWeather() {
  ["range", "feels", "wind", "today-rain", "today-sunset", "uv", "aqi"].forEach(
    (id) => ($(id).textContent = "—"),
  );
  $("temperature").textContent = "—°";
  $("condition").textContent = "Updating forecast";
  $("rain-caption").textContent = "Updating…";
  $("wind-caption").textContent = "Updating…";
  $("date").textContent = "Updating local forecast";
  $("uv-caption").textContent = "Daily maximum";
  $("daylight-label").textContent = "—";
  $("selected-date").textContent = "—";
  delete $("selected-date").dataset.validAt;
  $("change-brief").textContent = "Checking the next change…";
  $("weather-art").replaceChildren();
  $("daylight-progress").style.width = "0%";
  for (const id of [
    "preview-hours",
    "hours",
    "days",
    "forecast-chart",
    "hour-detail",
    "other-windows",
  ])
    $(id).replaceChildren();
  $("selected-value").textContent = "—";
  $("selected-condition").textContent = "Forecast unavailable";
  $("window").replaceChildren(
    node("p", "Forecast unavailable. Refresh when online."),
  );
}
function load(p, force = false) {
  if (
    resources.forecast &&
    p.latitude === place.latitude &&
    p.longitude === place.longitude
  ) {
    return Promise.all(
      Object.values(resources).map((r) => r.refresh({ force })),
    );
  }
  const g = ++generation;
  Object.values(resources).forEach((r) => r.dispose());
  resources = {};
  sourceStates = {};
  place = p;
  data = null;
  air = null;
  airStatus = "loading";
  selected = 0;
  selectedTime = null;
  alerts = { status: "loading", features: [] };
  clearWeather();
  updateAlertBadge();
  renderAir();
  $("place").textContent = p.name;
  store.set("truecast-last", p);
  savedPlaces();
  window.dispatchEvent(
    new CustomEvent("truecast:place", { detail: { name: p.name } }),
  );
  radar.setPlace();
  const id = `${p.latitude}-${p.longitude}`;
  const add = (name, options) => {
    const callback = options.onState;
    resources[name] = new RefreshResource({
      ...options,
      storage: store,
      onState: (state) => {
        if (g !== generation) return;
        sourceStates[name] = state;
        callback(state);
        refreshLabels();
      },
    });
    resources[name].emit();
  };
  const params = new URLSearchParams({
    latitude: p.latitude,
    longitude: p.longitude,
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m,dew_point_2m,pressure_msl,wind_gusts_10m",
    hourly:
      "temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day,visibility,relative_humidity_2m,apparent_temperature,wind_gusts_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,snowfall_sum",
    timezone: "auto",
    timeformat: "unixtime",
    forecast_days: 10,
  });
  add("forecast", {
    key: `truecast-forecast-v3-${id}`,
    ttl: 600000,
    maxAge: 86400000,
    loader: ({ signal }) =>
      json(`https://api.open-meteo.com/v1/forecast?${params}`, {
        signal,
        metadata: true,
        cache: "no-cache",
      }),
    validate: validForecast,
    validAt: (d) => d.current.time * 1000,
    sourceMaxAge: 2700000,
    onState: acceptForecast,
  });
  add("air", {
    key: `truecast-air-v4-${id}`,
    ttl: 900000,
    maxAge: 3600000,
    loader: ({ signal }) =>
      json(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.latitude}&longitude=${p.longitude}&current=us_aqi,pm2_5,pm10,ozone&timeformat=unixtime&timezone=auto`,
        { signal, metadata: true, cache: "no-cache" },
      ),
    validate: (d) => d?.current && Number.isFinite(d.current.time),
    validAt: (d) => d.current.time * 1000,
    sourceMaxAge: 10800000,
    onState: (state) => {
      air = state.data;
      airStatus = state.data
        ? state.fresh
          ? "ok"
          : "saved"
        : state.refreshing
          ? "loading"
          : "error";
      renderAir();
    },
  });
  add("alerts", {
    key: `truecast-alerts-v4-${id}`,
    ttl: (d) =>
      d?.unsupported ? 21600000 : d?.features?.length ? 60000 : 120000,
    maxAge: 1800000,
    loader: async ({ signal }) => {
      const point = await nwsPoint(p, { signal });
      if (!point.supported) return { unsupported: true, features: [] };
      return json(
        `https://api.weather.gov/alerts/active?point=${p.latitude.toFixed(4)},${p.longitude.toFixed(4)}`,
        { signal, cache: "no-cache" },
      );
    },
    validate: (d) => d?.unsupported === true || Array.isArray(d?.features),
    onState: (state) => {
      alerts = currentAlerts(state);
      updateAlertBadge();
    },
  });
  return Promise.all(Object.values(resources).map((r) => r.refresh({ force })));
}
function showFreshness() {
  detailType = "";
  const content = node("div");
  for (const [name, label] of [
    ["forecast", "Forecast · Open-Meteo best match"],
    ["air", "Air quality · CAMS via Open-Meteo"],
    ["alerts", "Official local alerts · NWS (US)"],
  ]) {
    const card = node("article", null, "official-period");
    const value = node(
      "p",
      sourceStates[name]
        ? freshnessText(sourceStates[name], {
            label: name,
            time: (at) => time(at / 1000),
          })
        : "Not checked",
      "muted",
    );
    value.id = `source-state-${name}`;
    card.append(node("h3", label), value);
    content.append(card);
  }
  content.append(
    node(
      "p",
      "Valid time is when model conditions apply. Checked time is when TrueCast retrieved them; neither is a model run’s issue time. Radar timestamps describe observed frames. Model agreement is not an accuracy score.",
      "fine",
    ),
  );
  content.append(
    node(
      "p",
      "While open: forecasts check every 10 minutes, air quality every 15, and US alerts every 1–2. Returning after two minutes prompts a forecast check; reconnecting checks all sources. Failures retain labeled saved data with retry delays. Forecasts older than 24 hours and air quality older than one hour are not shown.",
      "fine",
    ),
  );
  content.append(
    node(
      "p",
      "iPhone pauses web apps in the background. TrueCast checks when you return; it cannot promise scheduled updates while closed, silent storm monitoring, or Dynamic Island Live Activities.",
      "fine",
    ),
  );
  sheet("Sources & freshness", content, "DATA TRANSPARENCY");
}
const radar = createRadar({
  getPlace: () => place,
  onSelect: (p) => {
    load(p);
    location.hash = "today";
  },
  showSheet: (title, content) => {
    detailType = "";
    sheet(title, content, "OFFICIAL TRACKING");
  },
});
$("refresh-weather").onclick = () => load(place, true);
$("save").onclick = () => {
  const i = saved.findIndex(
    (p) => p.latitude === place.latitude && p.longitude === place.longitude,
  );
  if (i >= 0) saved.splice(i, 1);
  else saved = [...saved, place].slice(-12);
  store.set("truecast-places", saved);
  savedPlaces();
};
$("units").onclick = () => {
  unit = unit === "F" ? "C" : "F";
  store.set("truecast-unit", unit);
  render();
};
$("measurements").value = measurements;
$("measurements").onchange = () => {
  measurements = $("measurements").value;
  store.set("truecast-measurements", measurements);
  render();
};
$("horizon").onchange = () => {
  selected = 0;
  renderForecast();
};
$("forecast-scrub").oninput = () =>
  selectHour(Number($("forecast-scrub").value));
document.querySelectorAll("[data-metric]").forEach(
  (b) =>
    (b.onclick = () => {
      metric = b.dataset.metric;
      renderForecast();
    }),
);
document
  .querySelectorAll("[data-detail]")
  .forEach((b) => (b.onclick = () => showDetail(b.dataset.detail)));
$("all-conditions").onclick = () => showDetail("all");
$("show-alerts").onclick = () => showDetail("alerts");
$("open-warnings").onclick = () => showDetail("alerts");
$("activity").onchange = renderPlan;
$("duration").onchange = renderPlan;
let searchGeneration = 0;
$("search").onsubmit = async (e) => {
  e.preventDefault();
  const g = ++searchGeneration;
  $("results").replaceChildren(node("p", "Searching…"));
  try {
    const r = await json(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent($("city").value.trim())}&count=6&language=en&format=json`,
    );
    if (g !== searchGeneration) return;
    $("results").replaceChildren();
    if (!r.results?.length)
      $("results").append(node("p", "No matches. Try a nearby city."));
    for (const p of r.results || []) {
      const b = node(
        "button",
        [p.name, p.admin1, p.country].filter(Boolean).join(", "),
      );
      b.type = "button";
      b.onclick = () => {
        $("results").replaceChildren();
        $("city").value = "";
        load(p);
      };
      $("results").append(b);
    }
  } catch {
    if (g === searchGeneration)
      $("results").replaceChildren(
        node("p", "Search unavailable. Please retry."),
      );
  }
};
$("locate").onclick = () => {
  if (!navigator.geolocation) {
    $("results").replaceChildren(
      node("p", "Location unavailable. Search for a city."),
    );
    return;
  }
  $("results").replaceChildren(node("p", "Waiting for location permission…"));
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      $("results").replaceChildren();
      load({
        name: "Your location",
        latitude: Number(pos.coords.latitude.toFixed(4)),
        longitude: Number(pos.coords.longitude.toFixed(4)),
      });
    },
    () => {
      $("results").replaceChildren(
        node(
          "p",
          "Location unavailable or declined. Search for a city instead.",
        ),
      );
    },
    { timeout: 15000, maximumAge: 300000 },
  );
};
let lastWake = 0;
function tickSources() {
  if (document.hidden) return;
  Object.values(resources).forEach((r) => r.tick());
  if (data && (start() !== renderedStart || todayIndex() !== renderedDay)) {
    selected = selectionAfterRefresh(
      selectedTime,
      data.hourly.time,
      Date.now(),
      Number($("horizon").value),
    );
    keepView(render);
  }
}
function wakeSources(reconnect = false) {
  if (document.hidden || Date.now() - lastWake < 1000) return;
  lastWake = Date.now();
  for (const [name, resource] of Object.entries(resources)) {
    const age = resource.snapshot().age;
    resource.refresh({
      force:
        reconnect ||
        age > { forecast: 120000, air: 600000, alerts: 30000 }[name],
    });
  }
  tickSources();
}
addEventListener("online", () => wakeSources(true));
addEventListener("offline", tickSources);
addEventListener("pageshow", () => wakeSources());
addEventListener("focus", () => wakeSources());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) wakeSources();
});
setInterval(tickSources, 15000);
const officialSources = sourceTools({
  getPlace: () => place,
  temp,
  wind,
  measurements: () => measurements,
  present: (title, content) => {
    detailType = "";
    sheet(title, content, "OFFICIAL LOCAL SOURCE");
  },
});
$("source-freshness").onclick = showFreshness;
$("official-outlook").onclick = officialSources.outlook;
$("station-observation").onclick = officialSources.observation;
savedPlaces();
load(place);
if (document.body.dataset.screen === "map") radar.enter();

// Compare model guidance at the same valid hour; never fabricate an accuracy score.
$("compare-models").onclick = async () => {
  detailType = "";
  const content = node("div");
  if (!data) {
    content.append(node("p", "Load a forecast first.", "muted"));
    sheet("Compare models", content);
    return;
  }
  const validAt = data.hourly.time[start() + selected];
  if (!validAt || validAt > Date.now() / 1000 + 71 * 3600) {
    content.append(
      node(
        "p",
        "Model comparison covers the next 72 hours. Select an earlier forecast hour.",
        "muted",
      ),
    );
    sheet("Compare models", content);
    return;
  }
  content.append(node("p", "Loading independent model guidance…", "muted"));
  sheet("Compare models", content, "SAME HOUR · DIFFERENT GUIDANCE");
  const request = generation;
  const key = `truecast-models-${place.latitude}-${place.longitude}`;
  try {
    const cached = store.get(key, null);
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      hourly: "temperature_2m,precipitation,wind_speed_10m",
      models: "ecmwf_ifs025,gfs_seamless,icon_seamless",
      forecast_hours: 72,
      timeformat: "unixtime",
      timezone: "auto",
    });
    const result =
      cached && Date.now() - cached.at < 900000
        ? cached
        : {
            at: Date.now(),
            body: await json(
              `https://api.open-meteo.com/v1/forecast?${params}`,
            ),
          };
    if (!Array.isArray(result.body.hourly?.time))
      throw new Error("Incomplete model guidance");
    store.set(key, result);
    if (
      request !== generation ||
      !$("detail-dialog").open ||
      $("detail-title").textContent !== "Compare models"
    )
      return;
    const h = result.body.hourly,
      index = h.time.indexOf(validAt);
    content.replaceChildren();
    if (index < 0) {
      content.append(
        node(
          "p",
          "This valid hour is outside the available model comparison. Select an earlier hour.",
          "muted",
        ),
      );
      return;
    }
    content.append(
      node("p", `${day(validAt)} · ${time(validAt)}`, "detail-summary"),
    );
    const table = node("table", null, "model-table"),
      head = node("thead"),
      row = node("tr");
    ["Model", "Temp", "Rain / hr", "Wind"].forEach((label) =>
      row.append(node("th", label)),
    );
    head.append(row);
    table.append(head);
    const body = node("tbody");
    [
      ["ECMWF IFS", "ecmwf_ifs025"],
      ["GFS", "gfs_seamless"],
      ["ICON", "icon_seamless"],
    ].forEach(([label, id]) => {
      const r = node("tr");
      r.append(
        node("th", label),
        node("td", temp(h[`temperature_2m_${id}`]?.[index])),
        node("td", rain(h[`precipitation_${id}`]?.[index])),
        node("td", wind(h[`wind_speed_10m_${id}`]?.[index])),
      );
      body.append(r);
    });
    table.append(body);
    content.append(
      table,
      node(
        "p",
        "Models can disagree because their grids, physics and update times differ. Agreement is not an accuracy guarantee. These values are independent model guidance, not observed conditions.",
        "fine",
      ),
      node(
        "p",
        `Open-Meteo · retrieved ${new Date(result.at).toLocaleString()}`,
        "fine",
      ),
    );
  } catch {
    if (
      $("detail-dialog").open &&
      $("detail-title").textContent === "Compare models"
    )
      content.replaceChildren(
        node(
          "p",
          "Model comparison is unavailable. Your main forecast is still available.",
          "muted",
        ),
      );
  }
};
