const byId = id => document.getElementById(id);
const routes = {today:['Today','YOUR LOCAL OUTLOOK'], forecast:['Forecast','A LITTLE PERSPECTIVE'], map:['Weather map','WATCH THE ATMOSPHERE'], plan:['Go outside','MAKE TIME FOR YOURSELF'], settings:['Settings','MAKE YOURSELF AT HOME']};
const positions = {};
let activeRoute;
function navigate(focus = false) {
  const requested = location.hash.slice(1), aliases = {radar:'map', outside:'plan'};
  const route = aliases[requested] || (routes[requested] ? requested : 'today');
  if (activeRoute) positions[activeRoute] = window.scrollY;
  document.querySelectorAll('.app-screen[data-screen]').forEach(screen => { screen.hidden = screen.dataset.screen !== route; });
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  byId('screen-title').textContent = routes[route][0];
  byId('screen-kicker').textContent = routes[route][1];
  document.title = `${routes[route][0]} · TrueCast`;
  document.body.dataset.screen = route;
  activeRoute = route;
  window.scrollTo({top:positions[route] || 0, behavior:'instant'});
  if (focus) byId('screen-title').focus({preventScroll:true});
  window.dispatchEvent(new CustomEvent('truecast:route', {detail:{route}}));
}
window.addEventListener('hashchange', () => navigate(true));
navigate();
const places = byId('places-dialog');
byId('open-places').addEventListener('click', () => { places.showModal(); byId('city').focus(); });
byId('close-places').addEventListener('click', () => places.close());
places.addEventListener('click', event => { if (event.target === places) places.close(); });
window.addEventListener('truecast:place', event => { byId('header-place').textContent = event.detail.name; if (places.open) places.close(); });
byId('open-warnings').addEventListener('click', () => { byId('alerts').open = true; });
const theme = byId('theme');
try { theme.value = localStorage.getItem('truecast-theme') || 'system'; } catch {}
function applyTheme() {
  document.documentElement.dataset.theme = theme.value;
  const dark = theme.value === 'dark' || (theme.value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]').content = dark ? '#101b1c' : '#f3f2ec';
}
theme.addEventListener('change', () => { try { localStorage.setItem('truecast-theme', theme.value); } catch {} applyTheme(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
applyTheme();
function connection() { byId('offline-banner').hidden = navigator.onLine; byId('connection-state').textContent = navigator.onLine ? 'Online' : 'Offline'; }
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
connection();
