import { activeHourIndex } from "./forecast-time.js";
export const ACTIVITY_LIMITS = {
  walk: [8, 28, 28],
  run: [5, 23, 24],
  cycle: [8, 28, 20],
  picnic: [16, 29, 18],
};
export function localDayIndex(data, now = Date.now()) {
  const f = new Intl.DateTimeFormat("en-CA", {
      timeZone: data.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    key = f.format(new Date(now));
  return Math.max(
    0,
    data.daily.time.findIndex((t) => f.format(new Date(t * 1000)) === key),
  );
}
export function rankWindows(
  data,
  {
    now = Date.now(),
    activity = "walk",
    duration = 2,
    priority = "balanced",
    horizon = 72,
  } = {},
) {
  const h = data.hourly,
    limits = ACTIVITY_LIMITS[activity] || ACTIVITY_LIMITS.walk,
    count = Math.max(1, Math.min(3, Math.floor(duration))),
    start = activeHourIndex(h.time, now),
    candidates = [];
  for (let i = start; i <= h.time.length - count; i++) {
    if (
      h.time[i] < now / 1000 ||
      h.time[i] + count * 3600 > now / 1000 + horizon * 3600
    )
      continue;
    let ok = true,
      temps = [],
      winds = [],
      gusts = [],
      rain = [];
    for (let j = i; j < i + count; j++) {
      if (
        h.time[j] !== h.time[i] + (j - i) * 3600 ||
        h.is_day[j] !== 1 ||
        !Number.isFinite(h.temperature_2m[j]) ||
        h.temperature_2m[j] < limits[0] ||
        h.temperature_2m[j] > limits[1] ||
        !Number.isFinite(h.wind_speed_10m[j]) ||
        h.wind_speed_10m[j] > limits[2] ||
        !Number.isFinite(h.wind_gusts_10m[j]) ||
        h.wind_gusts_10m[j] > limits[2] * 1.7 ||
        !Number.isFinite(h.precipitation_probability[j]) ||
        h.precipitation_probability[j] > 25 ||
        !Number.isFinite(h.precipitation[j]) ||
        h.precipitation[j] > 0.1 ||
        !Number.isFinite(h.weather_code[j]) ||
        h.weather_code[j] >= 95
      ) {
        ok = false;
        break;
      }
      temps.push(h.temperature_2m[j]);
      winds.push(h.wind_speed_10m[j]);
      gusts.push(h.wind_gusts_10m[j]);
      rain.push(h.precipitation_probability[j]);
    }
    if (!ok) continue;
    const meanTemp = temps.reduce((a, b) => a + b, 0) / count,
      maxWind = Math.max(...winds),
      maxGust = Math.max(...gusts),
      maxRain = Math.max(...rain),
      thermal =
        Math.abs(meanTemp - (limits[0] + limits[1]) / 2) /
        (limits[1] - limits[0]);
    const score =
      priority === "earliest"
        ? (h.time[i] - now / 1000) / 3600
        : priority === "calm"
          ? (maxWind / limits[2]) * 2 +
            (maxGust / (limits[2] * 1.7)) * 1.5 +
            maxRain / 25 +
            thermal
          : thermal + maxWind / limits[2] + maxRain / 25;
    candidates.push({
      index: i,
      start: h.time[i],
      end: h.time[i] + count * 3600,
      meanTemp,
      maxWind,
      maxGust,
      maxRain,
      score,
      duration: count,
      activity,
    });
  }
  candidates.sort((a, b) => a.score - b.score || a.start - b.start);
  const chosen = [];
  for (const candidate of candidates) {
    if (
      chosen.every((x) => candidate.end <= x.start || candidate.start >= x.end)
    )
      chosen.push(candidate);
    if (chosen.length === 3) break;
  }
  return chosen;
}
export function forecastSignals(data, now = Date.now()) {
  const h = data.hourly,
    current = activeHourIndex(h.time, now),
    begin =
      current < h.time.length && h.time[current] < now / 1000
        ? current + 1
        : current,
    end = Math.min(begin + 24, h.time.length),
    items = [];
  const indexes = Array.from(
    { length: Math.max(0, end - begin) },
    (_, i) => begin + i,
  );
  const wet = indexes.find(
    (i) =>
      Number.isFinite(h.precipitation_probability[i]) &&
      h.precipitation_probability[i] >= 40 &&
      Number.isFinite(h.precipitation[i]),
  );
  const probabilities = indexes
    .map((i) => h.precipitation_probability[i])
    .filter(Number.isFinite);
  if (wet !== undefined)
    items.push({
      kind: "rain",
      label: "Rain watch",
      time: h.time[wet],
      value: h.precipitation_probability[wet],
      detail: "Hourly model rain chance",
    });
  else if (probabilities.length === indexes.length && indexes.length) {
    const peak = Math.max(...probabilities),
      at = indexes.find((i) => h.precipitation_probability[i] === peak);
    items.push({
      kind: "rain",
      label: "Rain outlook",
      time: h.time[at],
      value: peak,
      detail: "Highest chance in the next 24h",
    });
  }
  const gusts = indexes.filter((i) => Number.isFinite(h.wind_gusts_10m[i]));
  if (gusts.length) {
    const i = gusts.reduce((a, b) =>
      h.wind_gusts_10m[a] >= h.wind_gusts_10m[b] ? a : b,
    );
    items.push({
      kind: "wind",
      label: "Peak gust",
      time: h.time[i],
      value: h.wind_gusts_10m[i],
      detail: "Next 24 hours",
    });
  }
  const temperatures = indexes.filter((i) =>
    Number.isFinite(h.temperature_2m[i]),
  );
  if (temperatures.length) {
    const i = temperatures.reduce((a, b) =>
      h.temperature_2m[a] >= h.temperature_2m[b] ? a : b,
    );
    items.push({
      kind: "temperature",
      label: "Warmest hour",
      time: h.time[i],
      value: h.temperature_2m[i],
      detail: "Next 24 hours",
    });
  }
  const suns = data.daily.time
    .flatMap((_, i) => [
      {
        kind: "sun",
        label: "Sunrise",
        time: data.daily.sunrise[i],
        detail: "Local sunrise",
      },
      {
        kind: "sun",
        label: "Sunset",
        time: data.daily.sunset[i],
        detail: "Local sunset",
      },
    ])
    .filter((x) => Number.isFinite(x.time) && x.time > now / 1000)
    .sort((a, b) => a.time - b.time);
  if (suns[0]) items.push(suns[0]);
  return items;
}
export function modelTemperatureSpread(
  hourly,
  index,
  ids = ["ecmwf_ifs025", "gfs_seamless", "icon_seamless"],
) {
  const values = ids
    .map((id) => hourly[`temperature_2m_${id}`]?.[index])
    .filter(Number.isFinite);
  return values.length < 2
    ? null
    : {
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      };
}
const escapeICS = (text) =>
  String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const stamp = (seconds) =>
  new Date(seconds * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
function fold(line) {
  let result = "",
    size = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (size + bytes > 74) {
      result += "\r\n ";
      size = 1;
    }
    result += char;
    size += bytes;
  }
  return result;
}
export function windowCalendar(
  window,
  place,
  description = "",
  now = Date.now(),
) {
  if (
    !Number.isFinite(window.start) ||
    !Number.isFinite(window.end) ||
    window.end <= window.start
  )
    throw new Error("Invalid calendar window");
  const event = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TrueCast//Weather Windows//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:truecast-${window.start}-${place.latitude}-${place.longitude}@truecast.local`,
    `DTSTAMP:${stamp(now / 1000)}`,
    `DTSTART:${stamp(window.start)}`,
    `DTEND:${stamp(window.end)}`,
    `SUMMARY:${escapeICS("TrueCast · " + window.activity + " in " + place.name)}`,
    `LOCATION:${escapeICS(place.name)}`,
    `DESCRIPTION:${escapeICS(description + "\nModel-based comfort window. Review current official warnings before heading out.")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return event.map(fold).join("\r\n") + "\r\n";
}
