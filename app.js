const $ = id => document.getElementById(id);
const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browsing without persistence is supported. */ } } };
let unit = storage.get('truecast-unit', 'C');
let saved = storage.get('truecast-places', []);
let place = storage.get('truecast-last', {name:'London', country:'United Kingdom', latitude:51.5072, longitude:-0.1276});
let measurements = storage.get('truecast-measurements', 'metric');
let retrievedAt = 0;
let data, generation = 0, map, marker, radarLayer, coverageLayer, frames = [], timer, radarHost;
const fmtTemp = n => Number.isFinite(n) ? `${Math.round(unit === 'F' ? n * 9 / 5 + 32 : n)}°` : '—';
const fmtWind = n => Number.isFinite(n) ? `${Math.round(measurements === 'imperial' ? n / 1.609344 : n)} ${measurements === 'imperial' ? 'mph' : 'km/h'}` : '—';
const fmtRain = n => Number.isFinite(n) ? `${(measurements === 'imperial' ? n / 25.4 : n).toFixed(measurements === 'imperial' ? 2 : 1)} ${measurements === 'imperial' ? 'in' : 'mm'}` : '—';
const nfmt = (n, suffix = '') => Number.isFinite(n) ? `${Math.round(n)}${suffix}` : '—';
const tzTime = t => new Intl.DateTimeFormat('en', {hour:'numeric', minute:'2-digit', timeZone:data?.timezone || 'UTC'}).format(new Date(t));
const description = code => !Number.isFinite(code) ? 'Conditions unavailable' : code === 0 ? 'Clear skies' : code <= 3 ? 'Clouds and clear spells' : code <= 48 ? 'Foggy conditions' : code <= 67 ? 'Rain and drizzle' : code <= 77 ? 'Snow' : code <= 82 ? 'Rain showers' : code <= 86 ? 'Snow showers' : 'Thunderstorms';
const icon = (code, day = 1) => !Number.isFinite(code) ? '—' : code === 0 ? (day ? '☀' : '☾') : code <= 3 ? (day ? '⛅' : '☁') : code <= 48 ? '≋' : code <= 67 ? '☂' : code <= 77 ? '❄' : code <= 82 ? '☂' : code <= 86 ? '❄' : 'ϟ';
function el(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
async function getJSON(url) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
  try { const response = await fetch(url, {signal:controller.signal}); if (!response.ok) { const error = new Error(`Provider returned ${response.status}`); error.status = response.status; throw error; } return await response.json(); }
  finally { clearTimeout(timeout); }
}
function setLoading(loading) { $('refresh-weather').disabled = loading; document.querySelectorAll('.app-screen[data-screen]').forEach(n => n.setAttribute('aria-busy', String(loading))); }

function startHour() { const i = data.hourly.time.findIndex(t => t * 1000 >= Date.now()); return i < 0 ? data.hourly.time.length : i; }
function renderSaved() {
  $('favorites').replaceChildren();
  for (const p of saved) {
    const row = el('div', null, 'saved-place'), b = el('button', `${p.name} ↗`), remove = el('button', '✕', 'icon-button');
    b.addEventListener('click', () => loadPlace(p));
    remove.setAttribute('aria-label', `Remove ${p.name}`);
    remove.addEventListener('click', () => { saved = saved.filter(item => item !== p); storage.set('truecast-places', saved); renderSaved(); });
    row.append(b, remove); $('favorites').append(row);
  }
  $('favorites-empty').hidden = saved.length > 0;
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
  $('wind').textContent = fmtWind(c.wind_speed_10m);
  document.body.dataset.night = String(c.is_day === 0);
  $('today-rain').textContent = nfmt(d.precipitation_probability_max[0], '%');
  $('today-sunset').textContent = d.sunset[0] ? tzTime(d.sunset[0] * 1000) : '—';
  $('range').textContent = `${fmtTemp(d.temperature_2m_min[0])} / ${fmtTemp(d.temperature_2m_max[0])}`;
  $('humidity').textContent = nfmt(c.relative_humidity_2m, '%');
  $('dewpoint').textContent = fmtTemp(c.dew_point_2m);
  $('gusts').textContent = fmtWind(c.wind_gusts_10m);
  $('gusts-note').textContent = 'Model estimate';
  $('pressure').textContent = Number.isFinite(c.pressure_msl) ? (measurements === 'imperial' ? (c.pressure_msl / 33.86389).toFixed(2) : Math.round(c.pressure_msl)) : '—';
  $('pressure-note').textContent = `Sea-level pressure · ${measurements === 'imperial' ? 'inHg' : 'hPa'}`;
  const visibility = data.hourly.visibility?.[startHour()];
  $('visibility').textContent = Number.isFinite(visibility) ? (visibility / (measurements === 'imperial' ? 1609.344 : 1000)).toFixed(1) : '—';
  $('visibility-note').textContent = `Next forecast hour · ${measurements === 'imperial' ? 'mi' : 'km'}`;
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
  renderChart();
  showHour(begin);
  $('days').replaceChildren();
  const low = Math.min(...d.temperature_2m_min), high = Math.max(...d.temperature_2m_max), span = Math.max(1, high - low);
  d.time.forEach((time, i) => {
    const row = el('button', null, 'day'), bar = el('span', null, 'bar'), fill = el('i'), detail = el('div', null, 'day-detail');
    const date = new Intl.DateTimeFormat('en', {weekday:'short',day:'numeric',timeZone:data.timezone}).format(new Date(time * 1000));
    const isToday = new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:data.timezone}).format(new Date(time * 1000)) === new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:data.timezone}).format(new Date());
    fill.style.left = `${(d.temperature_2m_min[i] - low) / span * 100}%`;
    fill.style.width = `${Math.max(5, (d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span * 100)}%`;
    bar.append(fill);
    row.append(el('span', isToday ? 'Today' : date), el('span', icon(d.weather_code[i])), el('span', fmtTemp(d.temperature_2m_min[i])), bar, el('span', fmtTemp(d.temperature_2m_max[i])));
    row.setAttribute('aria-label', `${date}, ${description(d.weather_code[i])}, low ${fmtTemp(d.temperature_2m_min[i])}, high ${fmtTemp(d.temperature_2m_max[i])}. Show details`);
    detail.id = `day-detail-${i}`; detail.hidden = true;
    detail.textContent = `${description(d.weather_code[i])} · ${nfmt(d.precipitation_probability_max[i], '% rain chance')} · Sunrise ${d.sunrise[i] ? tzTime(d.sunrise[i] * 1000) : 'unavailable'} · Sunset ${d.sunset[i] ? tzTime(d.sunset[i] * 1000) : 'unavailable'}`;
    row.setAttribute('aria-expanded', 'false'); row.setAttribute('aria-controls', detail.id);
    row.onclick = () => { detail.hidden = !detail.hidden; row.setAttribute('aria-expanded', String(!detail.hidden)); };
    $('days').append(row, detail);
  });
  renderWindow(); renderSaved();
}
function renderChart() {
  const container = $('forecast-chart'), begin = startHour(), count = Math.min(Number($('horizon').value), data.hourly.time.length - begin);
  container.replaceChildren();
  const values = data.hourly.temperature_2m.slice(begin, begin + count), valid = values.filter(Number.isFinite);
  if (!valid.length) { container.textContent = 'Temperature chart unavailable.'; return; }
  const low = Math.min(...valid), high = Math.max(...valid), range = Math.max(1, high-low);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 640 150'); svg.setAttribute('role','img'); svg.setAttribute('aria-label', `Temperature outlook, low ${fmtTemp(low)}, high ${fmtTemp(high)}. Hourly values are available in the buttons above.`);
  let path = '', gap = true;
  values.forEach((v,i) => { if (!Number.isFinite(v)) { gap=true; return; } path += `${gap ? 'M' : 'L'}${20+i/Math.max(1,count-1)*600},${125-(v-low)/range*100} `; gap=false; });
  const line = document.createElementNS(svg.namespaceURI,'path'); line.setAttribute('d',path); line.setAttribute('fill','none'); line.setAttribute('stroke','currentColor'); line.setAttribute('stroke-width','3'); line.setAttribute('stroke-linecap','round');
  const cursor = document.createElementNS(svg.namespaceURI,'line'); cursor.id='chart-cursor'; cursor.setAttribute('y1','10'); cursor.setAttribute('y2','140'); cursor.setAttribute('stroke','currentColor'); cursor.setAttribute('stroke-opacity','.3'); cursor.setAttribute('stroke-dasharray','3 4');
  svg.append(line,cursor); container.append(el('p','TEMPERATURE OUTLOOK','eyebrow'),svg);
  const labels=el('div',null,'chart-labels'); labels.append(el('span',`Low ${fmtTemp(low)}`),el('span',`High ${fmtTemp(high)}`));container.append(labels);
  container.dataset.begin=begin;container.dataset.count=count;
}
function showHour(i) {
  const h = data.hourly;
  if (i >= h.time.length) { $('hour-detail').textContent = 'No upcoming hours in this saved forecast.'; return; }
  const cursor=$('chart-cursor'); if(cursor){const chart=$('forecast-chart');const x=20+(i-Number(chart.dataset.begin))/Math.max(1,Number(chart.dataset.count)-1)*600;cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
  $('hour-detail').textContent = `${new Intl.DateTimeFormat('en', {weekday:'short',month:'short',day:'numeric',timeZone:data.timezone}).format(new Date(h.time[i] * 1000))}, ${tzTime(h.time[i] * 1000)} · ${description(h.weather_code[i])} · ${fmtTemp(h.temperature_2m[i])} · Rain ${nfmt(h.precipitation_probability[i], '%')} / ${fmtRain(h.precipitation[i])} · Wind ${fmtWind(h.wind_speed_10m[i])} · Times in ${data.timezone}`;
}

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
  $('window').append(el('span', `${tzTime(h.time[best] * 1000)} – ${tzTime((h.time[best] + 7200) * 1000)}`), el('small', `${new Intl.DateTimeFormat('en', {weekday:'long',timeZone:data.timezone}).format(new Date(h.time[best] * 1000))} · ${fmtTemp(h.temperature_2m[best])} · ${nfmt(h.precipitation_probability[best], '% rain chance')}`), el('small', `First matching 2-hour daylight window. Rain chance ≤25%; temperature ${fmtTemp(limits.min)}–${fmtTemp(limits.max)}; wind ≤${fmtWind(limits.wind)}. Hourly estimates, not a safety score.`));
}
async function loadPlace(p, force = false) {
  const request = ++generation; place = p; data = null; setLoading(true);
  window.dispatchEvent(new CustomEvent('truecast:place',{detail:{name:p.name}}));
  $('status').textContent = `Loading ${p.name}…`; $('freshness').textContent = 'UPDATING';
  const key = `truecast-forecast-v2-${p.latitude}-${p.longitude}`, cached = storage.get(key, null);
  const params = new URLSearchParams({latitude:p.latitude,longitude:p.longitude,current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,dew_point_2m,pressure_msl,wind_gusts_10m',hourly:'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day,visibility',daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max',timezone:'auto',timeformat:'unixtime',forecast_days:'10'});
  let stale = !navigator.onLine, result;
  try { result = !force && cached && Date.now() - cached.at < 600000 ? cached : {at:Date.now(),body:await getJSON(`https://api.open-meteo.com/v1/forecast?${params}`)}; }
  catch { if (!cached || Date.now() - cached.at > 86400000) { if (request === generation) { $('status').textContent = 'Forecast unavailable. Check your connection and search again to retry.'; $('freshness').textContent = 'UNAVAILABLE'; $('place').textContent = p.name; document.querySelectorAll('#temperature,#feels,#wind,#range,#uv,#sunset,#humidity,#dewpoint,#gusts,#pressure,#visibility,#today-rain,#today-sunset').forEach(n => n.textContent = '—'); $('condition').textContent = 'Unable to load forecast'; $('summary').textContent = 'No current forecast available.'; $('hours').replaceChildren(); $('days').replaceChildren(); $('forecast-chart').replaceChildren(); $('hour-detail').textContent = 'Unavailable'; $('window').textContent = 'Forecast unavailable.'; $('alert-content').textContent = 'No alert check completed for this location.'; $('aqi').textContent = '—'; $('aq-note').textContent = 'Unavailable'; setLoading(false); } return; } result = cached; stale = true; }
  if (request !== generation) return;
  data = result.body; retrievedAt = result.at; setLoading(false); storage.set(key, result); storage.set('truecast-last', p);
  $('freshness').textContent = stale ? 'SAVED FORECAST' : 'FORECAST UPDATED';
  $('status').textContent = `${stale ? 'Offline or provider unavailable · saved forecast' : 'Forecast retrieved'} ${new Date(result.at).toLocaleString()} · Times below use the selected location.`;
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
  if (p.country_code && p.country_code !== 'US') { $('alert-content').textContent = 'Official alert integration is currently US-only. Alerts have not been checked here. Consult your national weather service.'; return; }
  try { if (!p.country_code) { await getJSON(`https://api.weather.gov/points/${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`); if(request !== generation) return; } const a = await getJSON(`https://api.weather.gov/alerts/active?point=${Number(p.latitude).toFixed(4)},${Number(p.longitude).toFixed(4)}`); if (request !== generation) return; $('alert-content').replaceChildren(); if (!a.features.length) $('alert-content').textContent = `No active NWS alerts returned · checked ${new Date().toLocaleTimeString()}.`;
    for (const f of a.features) { const d = el('details'), v = f.properties; d.append(el('summary', v.headline || v.event), el('p', v.description), el('p', v.instruction || 'Refer to the issuing authority for instructions.')); $('alert-content').append(d); }
  } catch (error) { if (request === generation) $('alert-content').textContent = error.status === 404 ? 'NWS alerts do not cover this location. Consult your national weather service.' : 'NWS alerts could not be checked. Consult weather.gov or your local weather service for current warnings.'; }
}
let searchGeneration = 0;
$('search').onsubmit = async e => { e.preventDefault(); const request = ++searchGeneration; $('results').replaceChildren(el('p', 'Searching…')); try { const r = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent($('city').value.trim())}&count=7&language=en&format=json`); if (request !== searchGeneration) return; $('results').replaceChildren(); if (!r.results?.length) $('results').append(el('p', 'No cities found. Try a nearby city.')); for (const p of r.results || []) { const b = el('button', [p.name,p.admin1,p.country].filter(Boolean).join(', ')); b.type = 'button'; b.onclick = () => { $('results').replaceChildren(); $('city').value = ''; loadPlace(p); }; $('results').append(b); } } catch { if (request === searchGeneration) $('results').replaceChildren(el('p', 'Search unavailable. Please retry.')); } };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('results').replaceChildren(); });
$('locate').onclick = () => { if (!navigator.geolocation) { $('status').textContent = 'Location is unavailable in this browser. Search for your city.'; return; } $('status').textContent = 'Waiting for location permission…'; navigator.geolocation.getCurrentPosition(pos => loadPlace({name:'Your location',latitude:Number(pos.coords.latitude.toFixed(4)),longitude:Number(pos.coords.longitude.toFixed(4))}), () => { $('status').textContent = 'Location unavailable or permission declined. Search for your city instead.'; }, {timeout:15000,maximumAge:300000}); };
$('save').onclick = () => { const i = saved.findIndex(p => p.latitude === place.latitude && p.longitude === place.longitude); if (i >= 0) saved.splice(i,1); else saved = [...saved,place].slice(-8); storage.set('truecast-places',saved); renderSaved(); };
$('units').onclick = () => { unit = unit === 'C' ? 'F' : 'C'; storage.set('truecast-unit',unit); render(); };
$('measurements').value = measurements;
$('measurements').onchange = () => { measurements = $('measurements').value; storage.set('truecast-measurements', measurements); render(); };
$('refresh-weather').onclick = () => loadPlace(place, true);
$('activity').onchange = renderWindow;
$('horizon').onchange = render;
function stopRadar() { clearInterval(timer); timer = null; $('play').textContent = '▶ Play'; $('play').setAttribute('aria-label','Play radar animation'); }
function showFrame() { if (!frames.length) return; const f = frames[Number($('frame').value)]; const url = `${radarHost}${f.path}/256/{z}/{x}/{y}/2/1_1.png`; if (!radarLayer) radarLayer = L.tileLayer(url,{opacity:Number($('radar-opacity').value)/100,maxNativeZoom:7,maxZoom:12,attribution:'<a href="https://rainviewer.com">RainViewer</a>'}).addTo(map); else radarLayer.setUrl(url); $('radar-time').textContent = `${new Date(f.time * 1000).toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} UTC · observed radar frame`; }
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
$('play').onclick = () => { if (timer) stopRadar(); else { $('play').textContent = 'Ⅱ Pause'; $('play').setAttribute('aria-label','Pause radar animation'); timer = setInterval(() => { $('frame').value = (Number($('frame').value) + 1) % frames.length; showFrame(); },900); } };
$('coverage').onchange = () => { if (coverageLayer) $('coverage').checked ? coverageLayer.addTo(map) : map.removeLayer(coverageLayer); };
document.addEventListener('visibilitychange', () => { if (document.hidden) stopRadar(); else if (Date.now()-retrievedAt > 600000) loadPlace(place); });
window.addEventListener('online', () => loadPlace(place, true));
setInterval(() => { if (!document.hidden && Date.now()-retrievedAt > 600000 && !$('refresh-weather').disabled) loadPlace(place); },60000);
function enterMap() { if (document.body.dataset.screen !== 'map') { stopRadar(); return; } if (map) requestAnimationFrame(() => map.invalidateSize()); else if (!$('load-map').disabled) $('load-map').click(); }
window.addEventListener('truecast:route', enterMap);
$('recenter-map').onclick = () => { if(map)map.setView([place.latitude,place.longitude],7);else $('load-map').click(); };
$('radar-opacity').oninput = () => { const opacity=Number($('radar-opacity').value);$('opacity-value').textContent=`${opacity}%`;if(radarLayer)radarLayer.setOpacity(opacity/100); };

renderSaved(); loadPlace(place); enterMap();
