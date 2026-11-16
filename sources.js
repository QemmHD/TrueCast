import { $, store, node, json } from "./api.js";
export async function nwsPoint(place, { signal } = {}) {
  if (place.country_code && place.country_code !== "US")
    return { supported: false };
  const key = `truecast-nws-point-${place.latitude.toFixed(4)}-${place.longitude.toFixed(4)}`,
    cached = store.get(key, null);
  if (
    cached &&
    Date.now() - cached.at <
      Math.min(
        21600000,
        cached.expiresAt ? Math.max(0, cached.expiresAt - cached.at) : 21600000,
      )
  )
    return cached.body;
  try {
    const result = await json(
      `https://api.weather.gov/points/${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`,
      { signal, metadata: true },
    );
    const body = { supported: true, ...result.body.properties };
    store.set(key, { at: Date.now(), expiresAt: result.expiresAt, body });
    return body;
  } catch (e) {
    if (e.status === 404) {
      const body = { supported: false };
      store.set(key, { at: Date.now(), body });
      return body;
    }
    throw e;
  }
}
const official = (url) =>
  typeof url === "string" && url.startsWith("https://api.weather.gov/");
function distance(a, b) {
  const radians = (x) => (x * Math.PI) / 180,
    dlat = radians(b[1] - a.latitude),
    dlon = radians(b[0] - a.longitude);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b[1])) *
      Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
export function sourceTools({ getPlace, present, temp, wind, measurements }) {
  let request = 0,
    controller;
  const cancel = () => {
    request++;
    controller?.abort();
  };
  $("detail-dialog").addEventListener("close", cancel);
  addEventListener("truecast:place", cancel);
  function begin(title) {
    cancel();
    controller = new AbortController();
    const token = request,
      content = node("div");
    content.append(node("p", "Checking the official source…", "muted"));
    present(title, content);
    return { token, content, signal: controller.signal };
  }
  function active(token, title) {
    return (
      token === request &&
      $("detail-dialog").open &&
      $("detail-title").textContent === title
    );
  }
  function facts(items) {
    const g = node("div", null, "detail-facts");
    for (const [label, value] of items) {
      const row = node("div");
      row.append(node("span", label), node("strong", value));
      g.append(row);
    }
    return g;
  }
  async function outlook() {
    const title = "Official US forecast",
      { token, content, signal } = begin(title),
      p = getPlace();
    try {
      const point = await nwsPoint(p, { signal });
      if (!active(token, title)) return;
      if (!point.supported || !official(point.forecast)) {
        content.replaceChildren(
          node(
            "p",
            "This location is outside the supported NWS point-forecast area. The global Open-Meteo forecast remains available.",
            "muted",
          ),
        );
        return;
      }
      const key = `truecast-nws-outlook-${p.latitude}-${p.longitude}`,
        cached = store.get(key, null);
      const result =
        cached && Date.now() - cached.at < 600000
          ? cached
          : { at: Date.now(), body: await json(point.forecast, { signal }) };
      if (!Array.isArray(result.body.properties?.periods))
        throw new Error("No forecast periods");
      store.set(key, result);
      if (!active(token, title)) return;
      content.replaceChildren();
      const props = result.body.properties;
      const stamp = (value) =>
        new Date(value).toLocaleString("en", {
          timeZone: point.timeZone || undefined,
          timeZoneName: "short",
        });
      const periods = props.periods
        .filter((period) => Date.parse(period.endTime) > Date.now())
        .slice(0, 8);
      if (!periods.length) throw new Error("No remaining forecast periods");
      content.append(
        node(
          "p",
          `National Weather Service · Updated ${props.updateTime || props.updated ? stamp(props.updateTime || props.updated) : "source issue time unavailable"}`,
          "fine",
        ),
      );
      for (const period of periods) {
        const card = node("article", null, "official-period");
        const c =
          period.temperatureUnit === "F"
            ? (period.temperature - 32) / 1.8
            : period.temperature;
        card.append(
          node(
            "h3",
            `${period.name} · ${Number.isFinite(period.temperature) ? temp(c) : "—"}`,
          ),
          node(
            "small",
            `${stamp(period.startTime)} – ${stamp(period.endTime)}`,
          ),
          node("p", period.detailedForecast || period.shortForecast),
        );
        content.append(card);
      }
      content.append(
        node(
          "p",
          `Retrieved ${stamp(result.at)}. This independent NWS narrative covers different periods from the global hourly forecast; values are not silently blended.`,
          "fine",
        ),
      );
    } catch (e) {
      if (active(token, title))
        content.replaceChildren(
          node(
            "p",
            "The official local forecast is unavailable. Your global forecast remains available.",
            "muted",
          ),
        );
    }
  }
  async function observation() {
    const title = "Nearby station observation",
      { token, content, signal } = begin(title),
      p = getPlace();
    try {
      const point = await nwsPoint(p, { signal });
      if (!active(token, title)) return;
      if (!point.supported || !official(point.observationStations)) {
        content.replaceChildren(
          node(
            "p",
            "Nearby-station integration currently covers supported US locations only. Model conditions remain available worldwide.",
            "muted",
          ),
        );
        return;
      }
      const key = `truecast-observation-${p.latitude}-${p.longitude}`,
        cached = store.get(key, null);
      let result = cached && Date.now() - cached.at < 600000 ? cached : null;
      if (!result) {
        const stations = await json(point.observationStations, { signal });
        if (!Array.isArray(stations.features))
          throw new Error("No station list");
        const candidates = stations.features
          .filter((s) => s.geometry?.type === "Point" && official(s.id))
          .map((s) => ({ ...s, distance: distance(p, s.geometry.coordinates) }))
          .filter((s) => s.distance <= 50)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);
        const values = await Promise.all(
          candidates.map(async (station) => {
            try {
              return {
                station,
                observation: await json(
                  `${station.id}/observations/latest?require_qc=true`,
                  { signal },
                ),
              };
            } catch (e) {
              if (e.name === "AbortError") throw e;
              return null;
            }
          }),
        );
        const chosen = values.filter(Boolean).find((v) => {
          const ob = v.observation.properties,
            t = Date.parse(ob?.timestamp),
            temperature = ob?.temperature;
          return (
            Number.isFinite(t) &&
            t <= Date.now() + 60000 &&
            Date.now() - t <= 5400000 &&
            Number.isFinite(temperature?.value) &&
            temperature.qualityControl === "V" &&
            ["wmoUnit:degC", "wmoUnit:degF"].includes(temperature.unitCode)
          );
        });
        if (chosen) {
          result = { at: Date.now(), body: chosen };
          store.set(key, result);
        }
      }
      if (!active(token, title)) return;
      if (
        !result ||
        Date.now() - Date.parse(result.body.observation.properties.timestamp) >
          5400000
      ) {
        content.replaceChildren(
          node(
            "p",
            "No recent, quality-verified temperature was returned from the three nearest stations within 50 km. We have not replaced your model forecast with an old or unverified reading.",
            "muted",
          ),
        );
        return;
      }
      const { station, observation } = result.body,
        ob = observation.properties,
        t = ob.temperature,
        temperature =
          t.unitCode === "wmoUnit:degF" ? (t.value - 32) / 1.8 : t.value;
      let speed = ob.windSpeed?.value;
      if (Number.isFinite(speed)) {
        if (ob.windSpeed.unitCode === "wmoUnit:m_s-1") speed *= 3.6;
        else if (ob.windSpeed.unitCode === "wmoUnit:kt") speed *= 1.852;
        else if (ob.windSpeed.unitCode !== "wmoUnit:km_h-1") speed = null;
      }
      content.replaceChildren();
      content.append(
        node("p", temp(temperature), "detail-summary"),
        node(
          "h3",
          ob.stationName ||
            station.properties?.name ||
            station.properties?.stationIdentifier ||
            "Weather station",
        ),
        facts([
          [
            "Observed",
            new Date(ob.timestamp).toLocaleString("en", {
              timeZone: point.timeZone || undefined,
              timeZoneName: "short",
            }),
          ],
          [
            "Distance",
            `${(measurements() === "imperial" ? station.distance / 1.609344 : station.distance).toFixed(1)} ${measurements() === "imperial" ? "mi" : "km"}`,
          ],
          ["Wind", wind(speed)],
          ["Temperature QC", "Passed source verification"],
          ["Retrieved", new Date(result.at).toLocaleString()],
        ]),
        node(
          "p",
          "NWS station observation. Station selection and availability vary, and these measurements can differ from conditions at your exact location. A nearby station is not proof that a forecast model is more or less accurate. The main forecast remains separately labeled as model data.",
          "fine",
        ),
      );
    } catch (e) {
      if (active(token, title))
        content.replaceChildren(
          node(
            "p",
            "Nearby observations could not be checked. No station measurement has been substituted for model conditions.",
            "muted",
          ),
        );
    }
  }
  return { outlook, observation, cancel };
}
