// Epoch-based indexing keeps repeated local DST hours distinct.
export function activeHourIndex(times, now = Date.now()) {
  if (!times?.length) return 0;
  const seconds = now / 1000;
  for (let i = 0; i < times.length; i++)
    if (times[i] <= seconds && seconds < (times[i + 1] ?? times[i] + 3600))
      return i;
  const future = times.findIndex((t) => t > seconds);
  return future < 0 ? times.length : future;
}
export function selectionAfterRefresh(
  previousTime,
  times,
  now = Date.now(),
  horizon = 24,
) {
  const begin = activeHourIndex(times, now),
    index = Number.isFinite(previousTime) ? times.indexOf(previousTime) : -1;
  return Math.min(
    Math.max(0, index - begin),
    Math.max(0, Math.min(horizon, times.length - begin) - 1),
  );
}
export function validForecast(d) {
  if (
    !d?.current ||
    !Array.isArray(d.hourly?.time) ||
    !Array.isArray(d.daily?.time) ||
    !Number.isFinite(d.current.time)
  )
    return false;
  const increasing = (a) =>
    a.length > 0 &&
    a.every((t, i) => Number.isFinite(t) && (i === 0 || t > a[i - 1]));
  if (!increasing(d.hourly.time) || !increasing(d.daily.time)) return false;
  for (const k of [
    "temperature_2m",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "is_day",
    "visibility",
    "relative_humidity_2m",
    "apparent_temperature",
    "wind_gusts_10m",
  ])
    if (
      !Array.isArray(d.hourly[k]) ||
      d.hourly[k].length !== d.hourly.time.length
    )
      return false;
  for (const k of [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "sunrise",
    "sunset",
    "uv_index_max",
    "precipitation_probability_max",
    "precipitation_sum",
    "wind_speed_10m_max",
  ])
    if (!Array.isArray(d.daily[k]) || d.daily[k].length !== d.daily.time.length)
      return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: d.timezone }).format();
  } catch {
    return false;
  }
  return true;
}
