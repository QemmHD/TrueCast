// Synthetic provider fixtures for browser tests; never included in the Pages artifact.
const epoch = Date.parse("2026-11-16T12:30:00Z");
function forecast(degrees = 10) {
  const start = Math.floor(epoch / 3600000) * 3600 - 12 * 3600,
    times = Array.from({ length: 240 }, (_, i) => start + i * 3600);
  const hourly = { time: times };
  for (const [k, value] of Object.entries({
    temperature_2m: degrees,
    precipitation_probability: 20,
    precipitation: 0.2,
    weather_code: 2,
    wind_speed_10m: 12,
    is_day: 1,
    visibility: 10000,
    relative_humidity_2m: 70,
    apparent_temperature: degrees - 1,
    wind_gusts_10m: 20,
  }))
    hourly[k] = times.map(() => value);
  const days = Array.from(
      { length: 16 },
      (_, i) => Date.parse("2026-11-16T05:00Z") / 1000 + i * 86400,
    ),
    daily = { time: days };
  for (const [k, value] of Object.entries({
    temperature_2m_max: degrees + 3,
    temperature_2m_min: degrees - 4,
    weather_code: 2,
    uv_index_max: 2,
    precipitation_probability_max: 20,
    precipitation_sum: 1,
    wind_speed_10m_max: 20,
    snowfall_sum: 0,
  }))
    daily[k] = days.map(() => value);
  daily.sunrise = days.map((t) => t + 7 * 3600);
  daily.sunset = days.map((t) => t + 17 * 3600);
  return {
    timezone: "America/New_York",
    current: {
      time: epoch / 1000,
      temperature_2m: degrees,
      apparent_temperature: degrees - 1,
      weather_code: 2,
      is_day: 1,
      wind_speed_10m: 12,
      wind_gusts_10m: 20,
      relative_humidity_2m: 70,
    },
    hourly,
    daily,
  };
}

module.exports = { epoch, forecast };
