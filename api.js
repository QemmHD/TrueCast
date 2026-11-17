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
let iconSequence = 0;
export function weatherIcon(code, day = true) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
    id = `wx${++iconSequence}`;
  svg.setAttribute("viewBox", "0 0 100 90");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `<defs>
    <radialGradient id="${id}s" cx=".35" cy=".25" r=".8"><stop stop-color="#fff4ca"/><stop offset=".48" stop-color="#ffcd71"/><stop offset="1" stop-color="#df7739"/></radialGradient>
    <linearGradient id="${id}c" x1=".25" y1="0" x2=".7" y2="1"><stop stop-color="#f8fbff"/><stop offset=".4" stop-color="#c0d3ec"/><stop offset="1" stop-color="#657a9f"/></linearGradient>
    <linearGradient id="${id}m" x1="0" x2="1" y2="1"><stop stop-color="#f3f0ff"/><stop offset=".5" stop-color="#d2d5ff"/><stop offset="1" stop-color="#7c8bbf"/></linearGradient>
    <filter id="${id}b" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="5"/></filter>
  </defs>`;
  const sun = `<circle cx="43" cy="35" r="28" fill="#ffbc58" opacity=".13" filter="url(#${id}b)"/><circle cx="43" cy="35" r="21" fill="url(#${id}s)"/><circle cx="43" cy="35" r="26" fill="none" stroke="#ffd792" stroke-opacity=".17"/><path d="M43 3v3m0 58v3M11 35h3m58 0h3M20 12l2 2m42 42 2 2M20 58l2-2m42-42 2-2" stroke="#ffce85" stroke-width="2" stroke-linecap="round"/>`;
  const moon = `<path d="M56 12a29 29 0 1 0 23 44A30 30 0 0 1 56 12Z" fill="url(#${id}m)"/><path d="M54 15a27 27 0 1 0 23 41" fill="none" stroke="#e7e7ff" stroke-width=".7" opacity=".7"/><circle cx="81" cy="18" r="1.4" fill="#cfd7ff"/><circle cx="22" cy="13" r=".9" fill="#cfd7ff"/>`;
  const cloud = `<path d="M24 67a15 15 0 0 1-1-30 22 22 0 0 1 41-7 19 19 0 1 1 6 37Z" fill="url(#${id}c)"/><path d="M25 39a20 20 0 0 1 37-7" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/><path d="M26 64h43" stroke="#7792b7" stroke-opacity=".35" stroke-width="1.3" stroke-linecap="round"/>`;
  let art = !Number.isFinite(code)
    ? '<path d="M30 45h40" stroke="#98acc5" stroke-width="3"/>'
    : code < 3
      ? (day ? sun : moon) + (code > 0 ? cloud : "")
      : cloud;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95)
    art +=
      '<path d="m32 74-3 7m17-7-3 7m17-7-3 7" stroke="#62d5fb" stroke-width="3" stroke-linecap="round"/>';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))
    art +=
      '<g stroke="#def3ff" stroke-width="1.5"><path d="M31 73v10m-4-5h8m11-5v10m-4-5h8m11-5v10m-4-5h8"/></g>';
  if (code >= 45 && code <= 48)
    art +=
      '<path d="M20 71h57M28 78h45" stroke="#c9d7ea" stroke-opacity=".65" stroke-width="3" stroke-linecap="round"/>';
  if (code >= 95)
    art += '<path d="m54 48-13 20h10l-5 17 21-25H56l6-12Z" fill="#ffcb69"/>';
  svg.innerHTML += art;
  return svg;
}

export function reducedMotion() {
  return (
    document.body?.dataset.motion === "reduced" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
