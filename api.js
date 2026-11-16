export const $ = (id) => document.getElementById(id);
export const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
export function node(tag, text, cls) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
export async function json(url, options = 18000) {
  const settings =
    typeof options === "number" ? { timeoutMs: options } : options;
  const controller = new AbortController(),
    abort = () => controller.abort();
  if (settings.signal?.aborted) controller.abort();
  else settings.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, settings.timeoutMs || 18000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      cache: settings.cache || "default",
    });
    if (!r.ok) {
      const e = new Error(`Source returned ${r.status}`);
      e.status = r.status;
      const retry = r.headers.get("retry-after");
      if (retry) {
        const seconds = Number(retry);
        e.retryAt = Number.isFinite(seconds)
          ? Date.now() + seconds * 1000
          : Date.parse(retry) || 0;
      }
      throw e;
    }
    const d = await r.json();
    if (d.error)
      throw new Error(d.reason || d.error.message || "Source unavailable");
    const maxAge = Number(
      /(?:^|,)\s*max-age=(\d+)/i.exec(
        r.headers.get("cache-control") || "",
      )?.[1],
    );
    const age = Number(r.headers.get("age") || 0),
      expires = Date.parse(r.headers.get("expires") || "");
    const expiresAt = Number.isFinite(expires)
      ? expires
      : maxAge > 0
        ? Date.now() + Math.max(0, maxAge - age) * 1000
        : null;
    return settings.metadata ? { body: d, expiresAt } : d;
  } finally {
    clearTimeout(timer);
    settings.signal?.removeEventListener("abort", abort);
  }
}
export const condition = (code) =>
  !Number.isFinite(code)
    ? "Unavailable"
    : code === 0
      ? "Clear"
      : code < 3
        ? "Mostly clear"
        : code === 3
          ? "Cloudy"
          : code <= 48
            ? "Fog"
            : code <= 57
              ? "Drizzle"
              : code <= 67
                ? "Rain"
                : code <= 77
                  ? "Snow"
                  : code <= 82
                    ? "Rain showers"
                    : code <= 86
                      ? "Snow showers"
                      : "Thunderstorms";
export function weatherIcon(code, day = true) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 80 64");
  svg.setAttribute("aria-hidden", "true");
  const sun =
    '<circle cx="33" cy="27" r="13" fill="#ffd180"/><path d="M33 5v4m0 36v4M11 27h4m36 0h4M18 12l3 3m24 24 3 3M18 42l3-3m24-24 3-3" stroke="#eebd71" stroke-width="2" stroke-linecap="round"/>';
  const moon =
    '<path d="M42 6a22 22 0 1 0 19 33A22 22 0 0 1 42 6Z" fill="#dce6ff"/><circle cx="64" cy="12" r="1.7" fill="#dce6ff"/>';
  const cloud =
    '<path d="M19 48a11 11 0 0 1 0-22 17 17 0 0 1 32-4 13 13 0 0 1 5 26Z" fill="#a8bbd1"/><path d="M16 48h41" stroke="#d4e0ee" stroke-opacity=".4" stroke-width="2"/>';
  let html = !Number.isFinite(code)
    ? '<path d="M22 32h30" stroke="#a8bbd1" stroke-width="3"/>'
    : code < 3
      ? (day ? sun : moon) + (code > 0 ? cloud : "")
      : cloud;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    html +=
      '<path d="m25 53-3 7m14-7-3 7m14-7-3 7" stroke="#67cbff" stroke-width="3" stroke-linecap="round"/>';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))
    html +=
      '<g fill="#def0ff"><circle cx="24" cy="57" r="2"/><circle cx="36" cy="59" r="2"/><circle cx="48" cy="55" r="2"/></g>';
  if (code >= 95)
    html += '<path d="m38 44-8 12h8l-3 8 15-15h-9l4-5Z" fill="#ffd180"/>';
  svg.innerHTML = html;
  return svg;
}
