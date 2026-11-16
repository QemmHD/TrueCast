import { $ } from "./api.js";
const routes = {
  today: "Today",
  forecast: "Forecast",
  map: "Radar",
  plan: "Plan",
  settings: "More",
};
let route,
  positions = {};
export function sheet(title, content, kicker = "WEATHER DETAILS") {
  $("detail-title").textContent = title;
  $("detail-kicker").textContent = kicker;
  $("detail-content").replaceChildren(content);
  if (!$("detail-dialog").open) $("detail-dialog").showModal();
}
export function initUI() {
  function navigate(focus = false) {
    const key = location.hash.slice(1),
      aliases = { radar: "map", outside: "plan" };
    const next = aliases[key] || (routes[key] ? key : "today");
    if (route) positions[route] = $("main").scrollTop;
    document
      .querySelectorAll(".app-screen")
      .forEach((n) => (n.hidden = n.dataset.screen !== next));
    document
      .querySelectorAll("[data-nav]")
      .forEach((n) =>
        n.dataset.nav === next
          ? n.setAttribute("aria-current", "page")
          : n.removeAttribute("aria-current"),
      );
    document.body.dataset.screen = next;
    $("screen-title").textContent = routes[next];
    document.title = `${routes[next]} · TrueCast`;
    route = next;
    $("main").scrollTop = positions[next] || 0;
    if (focus) $("screen-title").focus({ preventScroll: true });
    window.dispatchEvent(
      new CustomEvent("truecast:route", { detail: { route: next } }),
    );
  }
  addEventListener("hashchange", () => navigate(true));
  navigate();
  for (const [dialog, close] of [
    ["places-dialog", "close-places"],
    ["detail-dialog", "close-detail"],
    ["map-dialog", "close-map-dialog"],
  ]) {
    $(close).onclick = () => $(dialog).close();
    $(dialog).addEventListener("click", (e) => {
      if (e.target === $(dialog)) {
        const r = e.target.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          e.target.close();
      }
    });
  }
  $("open-places").onclick = () => {
    $("places-dialog").showModal();
    $("city").focus();
  };
  addEventListener("truecast:place", (e) => {
    $("header-place").textContent = e.detail.name;
    if ($("places-dialog").open) $("places-dialog").close();
  });
  const theme = $("theme");
  try {
    if (localStorage.getItem("truecast-design-release") !== "3") {
      localStorage.setItem("truecast-theme", "dark");
      localStorage.setItem("truecast-design-release", "3");
    }
    theme.value = localStorage.getItem("truecast-theme") || "dark";
  } catch {
    theme.value = "dark";
  }
  function apply() {
    document.documentElement.dataset.theme = theme.value;
    const dark =
      theme.value === "dark" ||
      (theme.value === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.querySelector("meta[name=theme-color]").content = dark
      ? "#080e1a"
      : "#eef2f8";
  }
  theme.onchange = () => {
    try {
      localStorage.setItem("truecast-theme", theme.value);
    } catch {}
    apply();
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", apply);
  apply();
  function network() {
    $("connection-state").textContent = navigator.onLine ? "Online" : "Offline";
    $("offline-banner").hidden = navigator.onLine;
    document.body.dataset.offline = String(!navigator.onLine);
  }
  addEventListener("online", network);
  addEventListener("offline", network);
  network();
  document.querySelectorAll("[data-forecast-view]").forEach(
    (b) =>
      (b.onclick = () => {
        const hourly = b.dataset.forecastView === "hourly";
        $("hourly-view").hidden = !hourly;
        $("daily-view").hidden = hourly;
        document
          .querySelectorAll("[data-forecast-view]")
          .forEach((n) => n.setAttribute("aria-pressed", String(n === b)));
      }),
  );
}
