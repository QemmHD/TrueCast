import { $, node, json, store } from "./api.js";
import { activeHourIndex } from "./forecast-time.js";
const POLLEN = [
  ["grass_pollen", "Grass"],
  ["birch_pollen", "Birch"],
  ["alder_pollen", "Alder"],
  ["mugwort_pollen", "Mugwort"],
  ["olive_pollen", "Olive"],
  ["ragweed_pollen", "Ragweed"],
];
export function aqiCategory(n) {
  return !Number.isFinite(n)
    ? "Unavailable"
    : n <= 50
      ? "Good"
      : n <= 100
        ? "Moderate"
        : n <= 150
          ? "Sensitive groups"
          : n <= 200
            ? "Unhealthy"
            : n <= 300
              ? "Very unhealthy"
              : "Hazardous";
}
const aqiColor = (n) =>
  !Number.isFinite(n)
    ? "#63748d"
    : n <= 50
      ? "#8bceb5"
      : n <= 100
        ? "#e6cb86"
        : n <= 150
          ? "#efa978"
          : n <= 200
            ? "#eb8590"
            : n <= 300
              ? "#bc99dc"
              : "#d496b0";
export function createEnvironment({ getPlace, present }) {
  let controller,
    request = 0;
  const cancel = () => {
    request++;
    controller?.abort();
  };
  $("detail-dialog").addEventListener("close", cancel);
  addEventListener("truecast:place", cancel);
  async function open() {
    cancel();
    controller = new AbortController();
    const own = request,
      p = getPlace(),
      content = node("div"),
      title = "Air & allergens";
    content.append(node("p", "Checking the air ahead…", "muted"));
    present(title, content);
    const active = () =>
      own === request &&
      $("detail-dialog").open &&
      $("detail-title").textContent === title;
    const key = `truecast-environment-v4-${p.latitude}-${p.longitude}`,
      cached = store.get(key, null);
    let result,
      saved = false;
    try {
      if (cached && Date.now() - cached.at < 900000) result = cached;
      else {
        const params = new URLSearchParams({
          latitude: p.latitude,
          longitude: p.longitude,
          hourly:
            "us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,dust," +
            POLLEN.map((x) => x[0]).join(","),
          timezone: "auto",
          timeformat: "unixtime",
          forecast_days: 3,
        });
        result = {
          at: Date.now(),
          body: await json(
            `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
            { signal: controller.signal },
          ),
        };
        if (
          !Array.isArray(result.body.hourly?.time) ||
          !Array.isArray(result.body.hourly.us_aqi)
        )
          throw new Error("Missing air forecast");
        store.set(key, result);
      }
    } catch (e) {
      if (cached && Date.now() - cached.at < 3600000) {
        result = cached;
        saved = true;
      } else {
        if (active())
          content.replaceChildren(
            node(
              "p",
              "The air forecast could not be checked. Try again when connected.",
              "muted",
            ),
          );
        return;
      }
    }
    if (!active()) return;
    const d = result.body,
      h = d.hourly,
      begin = activeHourIndex(h.time),
      count = Math.min(48, h.time.length - begin);
    if (count <= 0) {
      content.replaceChildren(
        node("p", "No upcoming air forecast hours are available.", "muted"),
      );
      return;
    }
    const stamp = (t) =>
      new Intl.DateTimeFormat("en", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: d.timezone,
        timeZoneName: "short",
      }).format(new Date(t * 1000));
    content.replaceChildren();
    const hero = node("div", null, "air-hero"),
      intro = node("div"),
      value = node("strong", "—"),
      category = node("p", "Checking…"),
      valid = node("small", "—"),
      mark = node("div", null, "air-orbit");
    intro.append(
      node("span", "US AIR QUALITY INDEX", "eyebrow"),
      value,
      category,
      valid,
    );
    hero.append(intro, mark);
    content.append(hero);
    const chart = node("div", null, "air-bars");
    chart.setAttribute("role", "img");
    chart.setAttribute(
      "aria-label",
      "Hourly US AQI forecast for the next 48 hours. Use the slider to read exact values.",
    );
    const values = h.us_aqi.slice(begin, begin + count),
      finite = values.filter(Number.isFinite),
      max = Math.max(50, ...finite);
    values.forEach((n, i) => {
      const bar = node("i");
      bar.style.height = Number.isFinite(n)
        ? `${Math.max(0, (n / max) * 100)}%`
        : "0%";
      bar.style.background = aqiColor(n);
      bar.title = `${stamp(h.time[begin + i])}: ${Number.isFinite(n) ? Math.round(n) : "Unavailable"}`;
      chart.append(bar);
    });
    const axis = node("div", null, "air-axis");
    axis.append(
      node("span", stamp(h.time[begin])),
      node("span", stamp(h.time[begin + count - 1])),
    );
    content.append(node("h3", "Your next 48 hours"), chart, axis);
    const label = node("label", "Explore an hour", "fine"),
      slider = node("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(count - 1);
    slider.value = "0";
    slider.id = "air-hour";
    label.htmlFor = "air-hour";
    content.append(label, slider);
    const pollutants = node("div", null, "environment-grid"),
      pollenTitle = node("h3", "Pollen forecast"),
      pollen = node("div", null, "pollen-list");
    content.append(node("h3", "In the air"), pollutants, pollenTitle, pollen);
    const extra = node(
      "p",
      `${saved || !navigator.onLine ? "Saved" : "Retrieved"} ${new Date(result.at).toLocaleString()}. CAMS model via Open-Meteo. Regional model resolution varies, approximately 11 km in Europe and 45 km globally. Pollen is available only where the European model supplies values. These are model estimates, not neighborhood sensor readings or personal medical advice.`,
      "fine",
    );
    content.append(extra);
    function select(offset) {
      const i = begin + offset,
        n = h.us_aqi[i];
      value.textContent = Number.isFinite(n) ? Math.round(n) : "—";
      category.textContent = aqiCategory(n);
      category.style.color = aqiColor(n);
      valid.textContent = stamp(h.time[i]);
      mark.style.setProperty("--aq-color", aqiColor(n));
      mark.textContent = Number.isFinite(n) ? "AQ" : "—";
      [...chart.children].forEach(
        (bar, j) => (bar.dataset.selected = String(j === offset)),
      );
      pollutants.replaceChildren();
      for (const [key, name] of [
        ["pm2_5", "PM₂.₅"],
        ["pm10", "PM₁₀"],
        ["ozone", "Ozone"],
        ["nitrogen_dioxide", "NO₂"],
        ["dust", "Dust"],
      ]) {
        const cell = node("div"),
          v = h[key]?.[i];
        cell.append(
          node("small", name),
          node("strong", Number.isFinite(v) ? `${v.toFixed(1)}` : "—"),
          node("small", "μg/m³"),
        );
        pollutants.append(cell);
      }
      pollen.replaceChildren();
      const available = POLLEN.some(([key]) => Number.isFinite(h[key]?.[i]));
      if (!available)
        pollen.append(
          node(
            "p",
            "Pollen data is unavailable for this location and hour. A missing reading does not mean no pollen.",
            "muted",
          ),
        );
      else
        for (const [key, name] of POLLEN) {
          const row = node("div"),
            v = h[key]?.[i];
          row.append(
            node("span", name),
            node(
              "strong",
              Number.isFinite(v) ? `${v.toFixed(1)} grains/m³` : "Unavailable",
            ),
          );
          pollen.append(row);
        }
    }
    slider.oninput = () => select(Number(slider.value));
    select(0);
  }
  return { open, cancel };
}
