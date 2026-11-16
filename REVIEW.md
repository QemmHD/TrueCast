# TrueCast 3.0 review

16 November 2026. This is the review record for the dark weather-app release. Reproducible browser checks are in `tests/review.cjs`; competitor sources and applied findings are in `COMPETITOR-RESEARCH.md`.

## Review pass 1: information and interaction

The previous app spread a large current-condition card and repeated metrics down a long page. Today is now a compact summary, with all conditions available in sheets. Hourly and daily forecasts are separate views; radar uses the full available app screen. Settings/source text no longer competes with current weather.

Visual review found missing/emoji glyphs, an ambiguous AQ loading state and unnecessary spacing. Interface metric/playback glyphs were replaced with SVG/CSS shapes, loading was separated from unavailable data, and the compact layout was checked again. Fahrenheit and dark appearance are defaults; later user changes persist.

## Review pass 2: data and map behavior

- Live Open-Meteo forecast and AQ data were checked. Temperature/rain/wind charts and same-hour ECMWF/GFS/ICON comparison use actual source values.
- Live RainViewer metadata and tiles loaded. Playback, scrubbing, opacity, history length, speed and coverage mask were exercised. Frames are shown only after tile loading succeeds; incomplete source/tile states remain explicit. Playback stops on screen exit/backgrounding.
- Live NWS data returned hundreds of US alerts, most without inline geometry. Selected affected-zone lookup was added so those records can display official area boundaries. A cap/partial-result condition remains labeled.
- Live NHC service discovery and all storm slots were checked. No active forecast systems were returned at the time of review. Active forecast-point/track/cone rendering and navigation were therefore tested using synthetic intercepted source fixtures, never included in app assets.
- Race protection was added so an older radar response cannot overwrite a newly selected warning/tropical layer. Forecast stale state is request-local to prevent older requests changing newer location status.
- A failed warning source was tested and does not display an all-clear or a successful zero-alert count.

## Review pass 3: screens, safe areas and offline behavior

All five screens passed at 360, 393, 430, 768 and 1440 pixels. Both document and inner app overflow were checked; horizontal scrolling is confined to the intentional hourly strips.

The compact Today screen fits a 393×852 viewport with simulated 59px top and 34px bottom insets. Header controls and tabs stay outside those simulated Dynamic Island/Home indicator areas. A separate 852×393 landscape review with 59px left/right and 21px bottom insets found a map-control collision; landscape playback was moved to a side dock and rechecked for non-overlap. These are emulation/layout checks, not a physical iPhone test or native Dynamic Island Live Activity integration.

Location search, favorites removal, keyboard Escape, condition sheets, 144-hour range, hourly scrubber, daily detail sheets, unit persistence, install guidance, activity/duration planning and official-warning sheets passed. Cached offline navigation and a dated forecast passed; offline with no cache shows unavailable data and an enabled retry control. No uncaught browser errors were observed in the review suite.

## Remaining product boundaries

This is an installable web app. There is no native widget or background notification service. Lightning detection, minute-specific rain nowcasts, raw Doppler/velocity products, global cyclone coverage and paid satellite/forecast-map products require additional appropriate integrations. Surface wind is not storm motion. Model agreement is not a calibrated confidence or accuracy score.

NWS warning coverage is US-only; NHC tropical coverage is regional and current feeds can legitimately contain zero systems. Actual severe-weather accuracy, provider uptime, all seasonal/terrain conditions, physical-device software-keyboard behavior and a full assistive-technology audit are not certified by these checks. Official advisories remain authoritative.
