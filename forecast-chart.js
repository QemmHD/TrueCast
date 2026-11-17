import { node } from "./api.js";
export const CHART = {
  left: 44,
  right: 624,
  top: 18,
  bottom: 174,
  width: 640,
  height: 218,
};
export function chartHourAt(clientX, rect, count) {
  const x = ((clientX - rect.left) / rect.width) * CHART.width;
  return Math.max(
    0,
    Math.min(
      count - 1,
      Math.round(((x - CHART.left) / (CHART.right - CHART.left)) * (count - 1)),
    ),
  );
}
export function drawForecastChart({
  target,
  values,
  times,
  isDay,
  metric,
  secondary = [],
  format,
  formatTime,
  unit,
  onSelect,
}) {
  target.replaceChildren();
  const count = values.length,
    finite = [...values, ...secondary].filter(Number.isFinite);
  if (!finite.length) {
    target.append(node("p", "No hourly forecast available.", "fine"));
    return { setSelected() {} };
  }
  const low =
      metric === "temperature" ? Math.floor(Math.min(...finite) - 1) : 0,
    high = Math.max(
      low + 1,
      Math.max(...finite) +
        (metric === "temperature" ? 1 : Math.max(...finite) * 0.08),
    ),
    span = high - low;
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  const el = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  svg.setAttribute("viewBox", `0 0 ${CHART.width} ${CHART.height}`);
  svg.setAttribute("class", `weather-chart chart-${metric}`);
  svg.setAttribute("role", "slider");
  svg.setAttribute("tabindex", "0");
  svg.setAttribute(
    "aria-label",
    `${metric} forecast. Drag to select an hour or use arrow keys.`,
  );
  svg.setAttribute("aria-valuemin", "0");
  svg.setAttribute("aria-valuemax", String(count - 1));
  const x = (i) =>
      CHART.left + (i / Math.max(1, count - 1)) * (CHART.right - CHART.left),
    y = (v) => CHART.bottom - ((v - low) / span) * (CHART.bottom - CHART.top);
  const color = "var(--chart-color)";
  const defs = el("defs", {}),
    gradient = el("linearGradient", {
      id: "forecast-fill",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 1,
    });
  gradient.append(
    el("stop", { offset: "0%", "stop-color": color, "stop-opacity": ".28" }),
    el("stop", { offset: "100%", "stop-color": color, "stop-opacity": ".01" }),
  );
  defs.append(gradient);
  svg.append(defs);
  for (let i = 0; i < count; i++) {
    if (isDay[i] === 0)
      svg.append(
        el("rect", {
          x: Math.max(
            CHART.left,
            x(i) - (CHART.right - CHART.left) / Math.max(1, count - 1) / 2,
          ),
          y: CHART.top,
          width: (CHART.right - CHART.left) / Math.max(1, count - 1),
          height: CHART.bottom - CHART.top,
          class: "chart-night",
        }),
      );
  }
  for (let j = 0; j < 4; j++) {
    const value = high - (j / 3) * span,
      at = y(value),
      label = el("text", {
        x: CHART.left - 9,
        y: at + 3,
        "text-anchor": "end",
        class: "chart-tick",
      });
    label.textContent = format(value).replace(/\s(?:in|mm|km\/h|mph)$/, "");
    svg.append(
      el("line", {
        x1: CHART.left,
        x2: CHART.right,
        y1: at,
        y2: at,
        class: "chart-grid",
      }),
      label,
    );
  }
  let segments = [],
    current = [];
  values.forEach((v, i) => {
    if (Number.isFinite(v)) current.push([x(i), y(v)]);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  });
  if (current.length) segments.push(current);
  if (metric === "rain")
    values.forEach((value, i) => {
      if (Number.isFinite(value) && value > 0)
        svg.append(
          el("rect", {
            x:
              x(i) -
              Math.max(1, ((CHART.right - CHART.left) / count) * 0.64) / 2,
            y: y(value),
            width: Math.max(1, ((CHART.right - CHART.left) / count) * 0.64),
            height: CHART.bottom - y(value),
            rx: 1.5,
            fill: color,
            opacity: 0.78,
          }),
        );
    });
  else
    for (const segment of segments) {
      const path = segment
        .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
        .join(" ");
      svg.append(
        el("path", {
          d: `${path} L${segment.at(-1)[0]},${CHART.bottom} L${segment[0][0]},${CHART.bottom} Z`,
          fill: "url(#forecast-fill)",
          class: "chart-area",
        }),
        el("path", {
          d: path,
          fill: "none",
          stroke: color,
          "stroke-width": 2.6,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          class: "chart-line",
        }),
      );
    }
  if (metric === "wind" && secondary.some(Number.isFinite)) {
    let path = "",
      gap = true;
    secondary.forEach((value, index) => {
      if (!Number.isFinite(value)) {
        gap = true;
        return;
      }
      path += `${gap ? "M" : "L"}${x(index)},${y(value)} `;
      gap = false;
    });
    svg.append(
      el("path", {
        d: path,
        fill: "none",
        stroke: color,
        "stroke-width": 1.7,
        "stroke-dasharray": "5 5",
        opacity: 0.6,
        class: "chart-gusts",
      }),
    );
  }
  const cursor = el("line", {
      id: "chart-cursor",
      x1: CHART.left,
      x2: CHART.left,
      y1: CHART.top - 4,
      y2: CHART.bottom + 4,
      class: "chart-cursor",
    }),
    dot = el("circle", {
      r: 4.5,
      fill: color,
      stroke: "#111c2c",
      "stroke-width": 2,
      class: "chart-selected-dot",
    });
  svg.append(cursor, dot);
  [0, Math.floor((count - 1) / 2), count - 1].forEach((i) => {
    const label = el("text", {
      x: x(i),
      y: CHART.bottom + 25,
      "text-anchor": i === 0 ? "start" : i === count - 1 ? "end" : "middle",
      class: "chart-tick chart-time",
    });
    label.textContent = formatTime(times[i]);
    svg.append(label);
  });
  let selected = 0,
    pointer = null,
    origin = null,
    dragged = false,
    vertical = false;
  const choose = (event) =>
    onSelect(chartHourAt(event.clientX, svg.getBoundingClientRect(), count));
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    pointer = e.pointerId;
    origin = { x: e.clientX, y: e.clientY, touch: e.pointerType === "touch" };
    dragged = false;
    vertical = false;
    try {
      svg.setPointerCapture(e.pointerId);
    } catch {}
    if (!origin.touch) choose(e);
  });
  svg.addEventListener("pointermove", (e) => {
    if (pointer !== e.pointerId || !origin) return;
    if (origin.touch && !dragged) {
      const dx = Math.abs(e.clientX - origin.x),
        dy = Math.abs(e.clientY - origin.y);
      if (dy > dx && dy > 6) {
        vertical = true;
        return;
      }
      if (dx < 6 || vertical) return;
      dragged = true;
    }
    if (!vertical) choose(e);
  });
  const end = (e) => {
    if (e.pointerId !== pointer) return;
    if (e.type === "pointerup" && origin?.touch && !dragged && !vertical)
      choose(e);
    pointer = null;
    origin = null;
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("keydown", (e) => {
    const next =
      e.key === "ArrowRight"
        ? selected + 1
        : e.key === "ArrowLeft"
          ? selected - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? count - 1
              : null;
    if (next !== null) {
      e.preventDefault();
      onSelect(Math.max(0, Math.min(count - 1, next)));
    }
  });
  const header = node("div", null, "chart-header");
  header.append(
    node("span", unit, "chart-unit"),
    node(
      "small",
      metric === "wind"
        ? "Dashed = gusts · shaded = night"
        : "Shaded = night · drag to explore",
      "chart-hint",
    ),
  );
  target.append(header, svg);
  return {
    setSelected(index) {
      selected = index;
      cursor.setAttribute("x1", x(index));
      cursor.setAttribute("x2", x(index));
      dot.style.display = Number.isFinite(values[index]) ? "" : "none";
      dot.setAttribute("cx", x(index));
      dot.setAttribute(
        "cy",
        Number.isFinite(values[index]) ? y(values[index]) : CHART.bottom,
      );
      svg.setAttribute("aria-valuenow", String(index));
      svg.setAttribute(
        "aria-valuetext",
        `${formatTime(times[index])}, ${Number.isFinite(values[index]) ? format(values[index]) : "unavailable"}`,
      );
    },
  };
}
