const $ = id => document.getElementById(id);
const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browsing without persistence is supported. */ } } };
let unit = storage.get('truecast-unit', 'C');
let saved = storage.get('truecast-places', []);
let place = storage.get('truecast-last', {name:'London', country:'United Kingdom', latitude:51.5072, longitude:-0.1276});
let data, generation = 0, map, marker, radarLayer, coverageLayer, frames = [], timer, radarHost;
const fmtTemp = n => Number.isFinite(n) ? `${Math.round(unit === 'F' ? n * 9 / 5 + 32 : n)}°` : '—';
const nfmt = (n, suffix = '') => Number.isFinite(n) ? `${Math.round(n)}${suffix}` : '—';
const tzTime = t => new Intl.DateTimeFormat('en', {hour:'numeric', minute:'2-digit', timeZone:data?.timezone || 'UTC'}).format(new Date(t));
const description = code => !Number.isFinite(code) ? 'Conditions unavailable' : code === 0 ? 'Clear skies' : code <= 3 ? 'Clouds and clear spells' : code <= 48 ? 'Foggy conditions' : code <= 67 ? 'Rain and drizzle' : code <= 77 ? 'Snow' : code <= 82 ? 'Rain showers' : code <= 86 ? 'Snow showers' : 'Thunderstorms';
const icon = (code, day = 1) => !Number.isFinite(code) ? '—' : code === 0 ? (day ? '☀' : '☾') : code <= 3 ? (day ? '⛅' : '☁') : code <= 48 ? '≋' : code <= 67 ? '☂' : code <= 77 ? '❄' : code <= 82 ? '☂' : code <= 86 ? '❄' : 'ϟ';
function el(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
async function getJSON(url) { const response = await fetch(url, {signal:AbortSignal.timeout(15000)}); if (!response.ok) throw new Error(`Provider returned ${response.status}`); return response.json(); }
function startHour() { const i = data.hourly.time.findIndex(t => t * 1000 >= Date.now()); return i < 0 ? data.hourly.time.length : i; }
function renderSaved() {
  $('favorites').replaceChildren();
  for (const p of saved) { const b = el('button', `${p.name} ↗`); b.addEventListener('click', () => loadPlace(p)); $('favorites').append(b); }
  $('save').textContent = saved.some(p => p.latitude === place.latitude && p.longitude === place.longitude) ? '✓ Saved · click to remove' : '＋ Save this place';
}
function render() {
  if (!data) return;
  const c = data.current, d = data.daily;
  $('units').textContent = unit === 'C' ? '°C / °F' : '°F / °C';
  $('place').textContent = place.name;
  $('date').textContent = `${place.country || ''} · ${new Intl.DateTimeFormat('en', {weekday:'long', month:'long', day:'numeric', timeZone:data.timezone}).format(new Date())}`;
  $('temperature').textContent = fmtTemp(c.temperature_2m);
  $('condition').textContent = description(c.weather_code);
  $('feels').textContent = fmtTemp(c.apparent_temperature);
  $('wind').textContent = nfmt(c.wind_speed_10m, ' km/h');
  $('range').textContent = `${fmtTemp(d.temperature_2m_min[0])} / ${fmtTemp(d.temperature_2m_max[0])}`;
  $('humidity').textContent = nfmt(c.relative_humidity_2m, '%');
  $('dewpoint').textContent = fmtTemp(c.dew_point_2m);
  $('gusts').textContent = nfmt(c.wind_gusts_10m);
  $('pressure').textContent = nfmt(c.pressure_msl);
  const visibility = data.hourly.visibility?.[startHour()];
  $('visibility').textContent = Number.isFinite(visibility) ? (visibility / 1000).toFixed(1) : '—';
  $('uv').textContent = Number.isFinite(d.uv_index_max[0]) ? d.uv_index_max[0].toFixed(1) : '—';
  $('sunset').textContent = d.sunset[0] ? tzTime(d.sunset[0] * 1000) : '—';
  $('sunrise').textContent = d.sunrise[0] ? `Sunrise ${tzTime(d.sunrise[0] * 1000)} · sunset above` : 'Sunrise unavailable';
  $('summary').textContent = `Today's rain chance: ${nfmt(d.precipitation_probability_max[0], '%')}. ${description(c.weather_code)} with a high of ${fmtTemp(d.temperature_2m_max[0])}.`;
  $('hours').replaceChildren();
  const begin = startHour();
  for (let i = begin; i < Math.min(begin + Number($('horizon').value), data.hourly.time.length); i++) {
    const h = data.hourly, b = el('button', null, 'hour');
    b.setAttribute('aria-pressed', String(i === begin));
    b.setAttribute('aria-label', `${new Intl.DateTimeFormat('en', {weekday:'long',month:'short',day:'numeric',timeZone:data.timezone}).format(new Date(data.hourly.time[i] * 1000))} ${tzTime(data.hourly.time[i] * 1000)}, ${fmtTemp(data.hourly.temperature_2m[i])}`);
    b.append(el('small', tzTime(h.time[i] * 1000)), el('span', icon(h.weather_code[i], h.is_day[i]), 'weather-icon'), el('strong', fmtTemp(h.temperature_2m[i])), el('small', nfmt(h.precipitation_probability[i], '% rain')));
    b.onclick = () => { document.querySelectorAll('.hour').forEach(n => n.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); showHour(i); };
    $('hours').append(b);
  }
  showHour(begin);
  $('days').replaceChildren();
  const low = Math.min(...d.temperature_2m_min), high = Math.max(...d.temperature_2m_max), span = Math.max(1, high - low);
  d.time.forEach((time, i) => {
    const row = el('div', null, 'day'), bar = el('span', null, 'bar'), fill = el('i');
    fill.style.left = `${(d.temperature_2m_min[i] - low) / span * 100}%`;
    fill.style.width = `${Math.max(5, (d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span * 100)}%`;
    bar.append(fill);
    row.append(el('span', new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:data.timezone}).format(new Date(time * 1000)) === new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:data.timezone}).format(new Date()) ? 'Today' : new Intl.DateTimeFormat('en', {weekday:'short',day:'numeric',timeZone:data.timezone}).format(new Date(time * 1000))), el('span', icon(d.weather_code[i])), el('span', fmtTemp(d.temperature_2m_min[i])), bar, el('span', fmtTemp(d.temperature_2m_max[i])));
    row.title = `${description(d.weather_code[i])} · ${nfmt(d.precipitation_probability_max[i], '% rain chance')}`;
    $('days').append(row);
  });
  renderWindow(); renderSaved();
}
function showHour(i) { const h = data.hourly; if (i >= h.time.length) { $('hour-detail').textContent = 'No upcoming hours in this saved forecast.'; return; } $('hour-detail').textContent = `${new Intl.DateTimeFormat('en', {weekday:'short',month:'short',day:'numeric',timeZone:data.timezone}).format(new Date(h.time[i] * 1000))}, ${tzTime(h.time[i] * 1000)} · ${description(h.weather_code[i])} · ${fmtTemp(h.temperature_2m[i])} · Rain ${nfmt(h.precipitation_probability[i], '%')} / ${h.precipitation[i] ?? '—'} mm · Wind ${nfmt(h.wind_speed_10m[i], ' km/h')} · Times in ${data.timezone}`; }
function renderWindow() {
  if (!data) return;
  const limits = {walk:{min:8,max:26,wind:25},run:{min:5,max:22,wind:22},cycle:{min:8,max:26,wind:18}}[$('activity').value];
  const h = data.hourly, start = startHour(); let best;
  for (let i = start; i < Math.min(start + 24, h.time.length - 1); i++) {
    const suitable = [i, i + 1].every(j => h.is_day[j] === 1 && Number.isFinite(h.temperature_2m[j]) && h.temperature_2m[j] >= limits.min && h.temperature_2m[j] <= limits.max && Number.isFinite(h.wind_speed_10m[j]) && h.wind_speed_10m[j] <= limits.wind && Number.isFinite(h.precipitation_probability[j]) && h.precipitation_probability[j] <= 25 && h.precipitation[j] <= 0.1 && h.weather_code[j] < 95);
    if (suitable) { best = i; break; }
  }
  $('window').replaceChildren();
  if (best == null) { $('window').append(el('span', 'No ideal window in the next 24 hours.'), el('small', 'Try another activity or check the hourly forecast.')); return; }
  $('window').append(el('span', `${tzTime(h.time[best] * 1000)} – ${tzTime((h.time[best] + 7200) * 1000)}`), el('small', `${new Intl.DateTimeFormat('en', {weekday:'long',timeZone:data.timezone}).format(new Date(h.time[best] * 1000))} · ${fmtTemp(h.temperature_2m[best])} · ${nfmt(h.precipitation_probability[best], '% rain chance')}`), el('small', `First matching 2-hour daylight window. Rain chance ≤25%; temperature ${fmtTemp(limits.min)}–${fmtTemp(limits.max)}; wind ≤${limits.wind} km/h. Hourly estimates, not a safety score.`));
}
async function loadPlace(p) {
  const request = ++generation; place = p; data = null;
  $('status').textContent = `Loading ${p.name}…`; $('freshness').textContent = 'UPDATING';
  const key = `truecast-forecast-v2-${p.latitude}-${p.longitude}`, cached = storage.get(key, null);
  const params = new URLSearchParams({latitude:p.latitude,longitude:p.longitude,current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,dew_point_2m,pressure_msl,wind_gusts_10m',hourly:'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day,visibility',daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',timezone:'auto',timeformat:'unixtime',forecast_days:'10'});
  let stale = !navigator.onLine, result;
  try { result = cached && Date.now() - cached.at < 600000 ? cached : {at:Date.now(),body:await getJSON(`https://api.open-meteo.com/v1/forecast?${params}`)}; }
  catch { if (!cached || Date.now() - cached.at > 86400000) { if (request === generation) { $('status').textContent = 'Forecast unavailable. Check your connection and search again to retry.'; $('freshness').textContent = 'UNAVAILABLE'; $('place').textContent = p.name; document.querySelectorAll('#temperature,#feels,#wind,#range,#uv,#sunset,#humidity,#dewpoint,#gusts,#pressure,#visibility').forEach(n => n.textContent = '—'); $('condition').textContent = 'Unable to load forecast'; $('summary').textContent = 'No current forecast available.'; $('hours').replaceChildren(); $('days').replaceChildren(); $('hour-detail').textContent = 'Unavailable'; $('window').textContent = 'Forecast unavailable.'; $('alert-content').textContent = 'No alert check completed for this location.'; $('aqi').textContent = '—'; $('aq-note').textContent = 'Unavailable'; } return; } result = cached; stale = true; }
  if (request !== generation) return;
  data = result.body; storage.set(key, result); storage.set('truecast-last', p);
  $('freshness').textContent = stale ? 'SAVED FORECAST' : 'FORECAST UPDATED';
  $('status').textContent = `${stale ? 'Offline or provider unavailable · saved forecast' : 'Forecast retrieved'} ${new Date(result.at).toLocaleString()} · Default place can be changed above.`;
  render();
  $('aqi').textContent = '—'; $('aq-note').textContent = 'Loading air quality…';
  $('alert-content').textContent = 'Checking official alert availability…';
  if (map) { map.setView([p.latitude,p.longitude],7); marker.setLatLng([p.latitude,p.longitude]); }
  void loadAir(p, request); void loadAlerts(p, request);
}
async function loadAir(p, request) {
  try { const a = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.latitude}&longitude=${p.longitude}&current=us_aqi&timezone=auto`); if (request !== generation) return; const value = a.current?.us_aqi; $('aqi').textContent = nfmt(value); $('aq-note').textContent = `${!Number.isFinite(value) ? 'Unavailable' : value <= 50 ? 'Good' : value <= 100 ? 'Moderate' : value <= 150 ? 'Unhealthy for sensitive groups' : value <= 200 ? 'Unhealthy' : value <= 300 ? 'Very unhealthy' : 'Hazardous'} · US AQI model estimate`; }
  catch { if (request === generation) $('aq-note').textContent = 'Air quality unavailable'; }
}
async function loadAlerts(p, request) {
  if (p.country_code !== 'US') { $('alert-content').textContent = 'Official alert integration is currently US-only. Alerts have not been checked here. Consult your national weather service.'; return; }
  try { const a = await getJSON(`https://api.weather.gov/alerts/active?point=${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`); if (request !== generation) return; $('alert-content').replaceChildren(); if (!a.features.length) $('alert-content').textContent = `No active NWS alerts returned · checked ${new Date().toLocaleTimeString()}.`;
    for (const f of a.features) { const d = el('details'), v = f.properties; d.append(el('summary', v.headline || v.event), el('p', v.description), el('p', v.instruction || 'Refer to the issuing authority for instructions.')); $('alert-content').append(d); }
  } catch { if (request === generation) $('alert-content').textContent = 'NWS alerts could not be checked. Consult weather.gov for current warnings.'; }
}
let searchGeneration = 0;
$('search').onsubmit = async e => { e.preventDefault(); const request = ++searchGeneration; $('results').replaceChildren(el('p', 'Searching…')); try { const r = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent($('city').value.trim())}&count=7&language=en&format=json`); if (request !== searchGeneration) return; $('results').replaceChildren(); if (!r.results?.length) $('results').append(el('p', 'No cities found. Try a nearby city.')); for (const p of r.results || []) { const b = el('button', [p.name,p.admin1,p.country].filter(Boolean).join(', ')); b.type = 'button'; b.onclick = () => { $('results').replaceChildren(); $('city').value = ''; loadPlace(p); }; $('results').append(b); } } catch { if (request === searchGeneration) $('results').replaceChildren(el('p', 'Search unavailable. Please retry.')); } };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('results').replaceChildren(); });
$('locate').onclick = () => { if (!navigator.geolocation) { $('status').textContent = 'Location is unavailable in this browser. Search for your city.'; return; } $('status').textContent = 'Waiting for location permission…'; navigator.geolocation.getCurrentPosition(pos => loadPlace({name:'Your location',latitude:Number(pos.coords.latitude.toFixed(4)),longitude:Number(pos.coords.longitude.toFixed(4))}), () => { $('status').textContent = 'Location unavailable or permission declined. Search for your city instead.'; }, {timeout:15000,maximumAge:300000}); };
$('save').onclick = () => { const i = saved.findIndex(p => p.latitude === place.latitude && p.longitude === place.longitude); if (i >= 0) saved.splice(i,1); else saved = [...saved,place].slice(-8); storage.set('truecast-places',saved); renderSaved(); };
$('units').onclick = () => { unit = unit === 'C' ? 'F' : 'C'; storage.set('truecast-unit',unit); render(); };
$('activity').onchange = renderWindow;
$('horizon').onchange = render;
function stopRadar() { clearInterval(timer); timer = null; $('play').textContent = '▶ Play'; }
function showFrame() { if (!frames.length) return; const f = frames[Number($('frame').value)]; const url = `${radarHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`; if (!radarLayer) radarLayer = L.tileLayer(url,{opacity:.7,maxNativeZoom:7,maxZoom:12,attribution:'<a href="https://rainviewer.com">RainViewer</a>'}).addTo(map); else radarLayer.setUrl(url); $('radar-time').textContent = `${new Date(f.time * 1000).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} UTC · observed radar frame`; }
$('load-map').onclick = async () => {
  if (!window.L) { $('radar-note').textContent = 'The map library could not load. Check your connection and retry.'; return; }
  $('load-map').disabled = true;
  try {
    if (!map) { $('map').replaceChildren(); map = L.map('map').setView([place.latitude,place.longitude],7); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:12,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map); marker = L.circleMarker([place.latitude,place.longitude],{radius:6,color:'#142b30',fillColor:'#efc581',fillOpacity:1}).addTo(map); map.on('click', e => loadPlace({name:'Map pin',latitude:Number(e.latlng.lat.toFixed(4)),longitude:Number(e.latlng.lng.toFixed(4))})); }
    stopRadar(); const r = await getJSON('https://api.rainviewer.com/public/weather-maps.json');
    frames = r.radar?.past || []; radarHost = r.host;
    if (!frames.length || !radarHost?.startsWith('https://')) throw new Error('No radar frames');
    $('frame').max = frames.length - 1; $('frame').value = frames.length - 1; $('frame').disabled = false; $('play').disabled = false; $('coverage').disabled = false;
    if (coverageLayer) map.removeLayer(coverageLayer);
    coverageLayer = L.tileLayer(`${radarHost}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`,{maxNativeZoom:7,maxZoom:12,opacity:.5}); if ($('coverage').checked) coverageLayer.addTo(map);
    showFrame(); $('radar-note').textContent = 'Observed radar, not future rain prediction. Coverage varies; no radar coverage does not mean clear weather. Source resolution is limited to zoom 7.'; $('load-map').textContent = 'Refresh radar ↻';
  } catch { $('radar-note').textContent = 'Radar unavailable. Retry with Refresh radar; no forecast rain is substituted.'; $('load-map').textContent = 'Retry radar ↻'; }
  finally { $('load-map').disabled = false; }
};
$('frame').oninput = () => { stopRadar(); showFrame(); };
$('play').onclick = () => { if (timer) stopRadar(); else { $('play').textContent = 'Ⅱ Pause'; timer = setInterval(() => { $('frame').value = (Number($('frame').value) + 1) % frames.length; showFrame(); },900); } };
$('coverage').onchange = () => { if (coverageLayer) $('coverage').checked ? coverageLayer.addTo(map) : map.removeLayer(coverageLayer); };
document.addEventListener('visibilitychange', () => { if (document.hidden) stopRadar(); });
renderSaved(); loadPlace(place);
