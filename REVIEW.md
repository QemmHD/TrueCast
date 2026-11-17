# TrueCast 4.1.1 future-playback fix

The actual DWD feed rejected advertised intermediate precipitation times with `InvalidDimensionValue`. Native six-hour frame selection fixes the future map's initial load and Play button. Eighteen unit scenarios include the failed-time reproduction; browser checks now explicitly exercise future playback, loop wraparound, zoom continuation and pause. Live playback also completed the 72-hour window and looped. See [RADAR-TIMELINE-RELEASE.md](RADAR-TIMELINE-RELEASE.md).

---

# TrueCast Atmosphere 4.1 review

17 November 2026. Current source details and behavior: [RADAR-TIMELINE-RELEASE.md](RADAR-TIMELINE-RELEASE.md). Earlier release records below are historical.

- Seventeen unit scenarios cover native radar timestamps, explicit/fresh HRRR runs, observed/future window boundaries, ten-second foreground revalidation, cache expiry, backoff, DST and missing data.
- The new playback browser suite checks the default six-hour history/future bar, explicit run tile URLs, intermediate blended opacity, four-layer cache bounds, continued playback/time advancement through zoom, failed tiles retaining the verified image/time, proportional chart/strip scrolling in both directions and unchanged cards after repeated weather checks.
- Switching US to global coverage discards US frames, labels limited RainViewer history and reports unavailable future data. Review caught and fixed removed Leaflet layers retaining map listeners; subsequent zoom and location changes pass without uncaught errors.
- Existing suites exercise fresh/offline/hidden recovery, independent official sources, alerts and storm tracks, future map products, air/pollen, five viewport widths, saved preferences and actual 21-file service-worker upgrades.
- Live NOAA MRMS and explicitly pinned IEM HRRR tiles loaded. Phone screenshots and an 852×393 landscape layout were inspected, including safe-area placement and non-overlap of the layer controls and timeline.
- Ten-second checks run while visible and obey retry delays. Source valid times remain distinct from fetch times. Frame blending smooths native imagery without claiming optical-flow storm predictions. Six-hour history/future coverage is US-focused; global history is shorter.

---

# TrueCast Atmosphere 4.0 review

16 November 2026. Current release details and primary sources: [ATMOSPHERE-RELEASE.md](ATMOSPHERE-RELEASE.md). Earlier reviews below are historical.

- Fourteen unit scenarios include the prior refresh checks plus WMS source-time parsing/cadence, fresh run validation, bounded future horizons, observed-only imagery and missing versus zero air quality.
- New browser scenarios cover direct 16-day navigation, returning from daily to a selected hourly forecast, exact future/run parameters, truthful labels while images load/fail, all four future products, viewport requests, NOAA observed layers and playback pause.
- Air/pollen review covers 48 plotted hours, exact-hour values, pollutant units, modeled zero pollen and an explicit unavailable state.
- Existing suites cover quiet source refresh, offline recovery, city-switch races, station quality/freshness, official warning/tropical geometry, five viewport sizes and actual service-worker upgrades. The complete shell now includes 19 required files and locally bundled Leaflet.
- Live DWD PNGs were checked for precipitation, temperature, wind and pressure. Live NOAA imagery and live CAMS air/pollen were exercised. A deliberately invalid DWD model-run parameter returned a source exception, confirming run selection is honored.
- Current phone screenshots were reviewed for Today, future maps, lightning and air quality. Missing arrow/play glyphs were replaced with SVG/CSS. The daylight block was moved into the planner to keep Today compact. Dark defaults, Fahrenheit and simulated iPhone safe areas remain.

These are browser/endpoint and simulated-device checks; they do not certify physical iPhone/Safari behavior or a worldwide forecast-accuracy advantage.

---

# TrueCast 3.1 refresh and source review

16 November 2026. This section describes the current release; the 3.0 review below remains historical context.

- Ten deterministic unit scenarios: immediate cached data, coalesced requests, invalid responses, failure/Retry-After retention, offline expiry, hidden polling, cancellation/late responses, delayed model timestamps, HTTP expiry, epoch selection repeated DST hours, and HTTP Retry-After/cache-header/cancellation handling.
- Browser refresh scenarios: slow same-place refresh keeps current conditions and all ten daily entries visible; selected absolute hour and horizontal scroll survive; an unfinished location search stays open. Bad payloads preserve good data and manual retries obey cooldowns.
- Simulated phone suspension: hidden pages issue no source polls over ten minutes; return rechecks forecast/AQ/alerts independently. The selected future hour remains the same epoch.
- Alert failure scenarios: non-expired warnings stay visible as unverified, a failed request never means no alerts, and an already open warning sheet removes expired records. Offline weather retains explicit saved labels.
- Official-source fixtures: independent NWS narrative, correct Fahrenheit display, nearest recent verified station temperature, m/s to mph conversion, and rejection of old or unverified stations. Station readings never replace the main model conditions.
- Location race: switch cities during a slow request; a late response for the old city cannot populate the new city's header/weather.
- Real service-worker lifecycle across three local versions: complete 14-file cache; update waits without interrupting a search; next-start activation; manual activation; old-cache cleanup; offline reopen. This uses actual browser worker registration and activation, rather than mocking worker methods.
- Existing live browser review continues to cover real weather/model/radar endpoints, forecast/planner/saved locations, synthetic warning geometry and NHC tracks/cones, source failures, five viewport sizes, Fahrenheit/theme persistence, installation help and cached-shell offline behavior.

Tests use Chromium with an iPhone viewport/profile and simulated safe areas. They do not certify physical iPhone/Safari behavior, native background execution or forecast superiority. Research and timestamp semantics are documented in [SOURCE-REFRESH-RESEARCH.md](SOURCE-REFRESH-RESEARCH.md).

---

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
