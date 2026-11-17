import { reducedMotion } from "./api.js";
// Keep the selected hour visible without scrolling the page or chasing a drag.
export function createForecastStrip({ rail, onSelect, getSelected }) {
  let gesture = false,
    gestureTimer,
    frame = 0,
    programTarget = null;
  function sync(index, { smooth = false } = {}) {
    const button = rail.querySelector(`[data-index="${index}"]`);
    if (!button || !rail.clientWidth) return;
    const count = rail.querySelectorAll(".hour").length;
    const left =
      Math.max(0, Math.min(1, index / Math.max(1, count - 1))) *
      (rail.scrollWidth - rail.clientWidth);
    programTarget = left;
    rail.scrollTo({
      left,
      behavior: smooth && !reducedMotion() ? "smooth" : "auto",
    });
  }
  function userStart() {
    gesture = true;
    programTarget = null;
    clearTimeout(gestureTimer);
  }
  function userEnd() {
    clearTimeout(gestureTimer);
    gestureTimer = setTimeout(() => (gesture = false), 350);
  }
  rail.addEventListener("pointerdown", userStart, { passive: true });
  rail.addEventListener("touchstart", userStart, { passive: true });
  rail.addEventListener(
    "wheel",
    () => {
      userStart();
      userEnd();
    },
    { passive: true },
  );
  addEventListener("pointerup", userEnd, { passive: true });
  rail.addEventListener("touchend", userEnd, { passive: true });
  rail.addEventListener(
    "scroll",
    () => {
      if (programTarget !== null) {
        if (Math.abs(rail.scrollLeft - programTarget) < 2) programTarget = null;
        return;
      }
      if (!gesture) return;
      clearTimeout(gestureTimer);
      userEnd();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const buttons = rail.querySelectorAll(".hour");
        if (!buttons.length) return;
        const span = rail.scrollWidth - rail.clientWidth;
        const index = Math.max(
          0,
          Math.min(
            buttons.length - 1,
            Math.round(
              (span > 0 ? rail.scrollLeft / span : 0) * (buttons.length - 1),
            ),
          ),
        );
        if (index !== getSelected()) onSelect(index);
      });
    },
    { passive: true },
  );
  addEventListener("truecast:route", (e) => {
    if (e.detail.route === "forecast")
      requestAnimationFrame(() => sync(getSelected()));
  });
  new ResizeObserver(() => sync(getSelected())).observe(rail);
  return { sync };
}
