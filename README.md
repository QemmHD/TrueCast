# TrueCast

A static weather observatory for GitHub Pages. No build step, API keys, or backend required for this personal, noncommercial edition.

## Run locally

From this folder: `python -m http.server 8000`, then open http://localhost:8000.

## Publish to your repository

Copy this folder's contents (including `.github` and `.nojekyll`) into your repository. In Settings → Pages, choose **GitHub Actions** as the source. Push to `main` or run the workflow manually. If your branch has another name, update `.github/workflows/pages.yml`.

All application paths are relative, so both `username.github.io/TrueCast/` and a custom domain work. Alternatively, select Deploy from a branch → main → / (root) in Pages settings to publish without the workflow.

## Included

- Live 10-day and up to 144-hour forecasts, city search, explicit opt-in location lookup, saved places, Celsius/Fahrenheit.
- A daylight activity window with transparent rain, wind and temperature thresholds.
- On-demand interactive map, past radar animation, coverage mask and click-to-forecast.
- US AQI estimates, UV maximum, sunrise/sunset, humidity, dew point, gusts, pressure and visibility.
- NWS alerts for searched US locations. GPS/map pins check NWS point coverage first; unsupported locations and failed checks remain explicit.
- Ten-minute browser forecast cache with dated stale fallback and independent provider failure states.
- Responsive layout, keyboard controls, screen-reader status, reduced-motion support.

## Limits

This starter does not implement the entire roadmap. Read PLAN.md for researched API choices, design specifications, premium roadmap and release gates. This release uses Leaflet, not the planned MapLibre renderer. It has no account sync, push service, future radar, lightning, pollen, ensemble bands, or true minute-level rain prediction. The horizon is decorative, not an astronomical chart. Temperature and metric/US measurement preferences are available in Settings.

Open-Meteo's hosted free tier is noncommercial. RainViewer's public service targets personal, educational and small community projects. Keep attribution visible. OpenStreetMap public tiles must follow their usage policy (https://operations.osmfoundation.org/policies/tiles/): no offline tile downloading or prefetching, visible attribution and cache headers respected. Use a suitable basemap provider as traffic grows.

Forecast values and air quality are model estimates. A failed alert request must never be presented as “no alerts.” Cached forecasts can be old; their retrieval date remains visible. No background severe-weather notification delivery is provided.

Third-party assets: Leaflet from unpkg, optional fonts from Google Fonts, map tiles from OpenStreetMap and RainViewer. All need network access. Saved places and preferences remain in localStorage; providers receive requested coordinates. No analytics are included.

## Validation

See validation notes in PLAN.md. Before public release, verify API CORS behavior from the actual Pages origin, provider terms, local-time behavior, radar coverage, keyboard/mobile rendering and provider outages.

WeatherBug parity is now the product target. See WEATHERBUG-PARITY.md for researched feature coverage and dependencies. It is a roadmap, not a claim that the starter replaces all WeatherBug features.


## iPhone Home Screen installation

Open the published site in Safari → Share → Add to Home Screen → Add. Keep “Open as Web App” enabled if that option appears. The app has a standalone manifest, Apple touch icon, safe-area support, touch-sized controls and an in-app installation guide. No App Store download or account is needed.

After the first successful online visit, the app shell is cached. A saved forecast up to 24 hours old can be shown with its retrieval timestamp when offline; search, fresh alerts and radar still need a connection. Third-party fonts/map libraries are not cached, and map tiles are never bulk-downloaded. Background notifications and native widgets are not implemented.

Repository: https://github.com/QemmHD/TrueCast
Expected Pages address after activation: https://qemmhd.github.io/TrueCast/


## App interface

TrueCast now uses five hash-based screens: Today, Forecast, Map, Plan and Settings. Phones have a fixed bottom navigation bar with safe-area support; tablets and desktop have a navigation rail. Hash routes work on GitHub Pages without server rewrites. A location dialog provides search, optional geolocation and saved-place management.

Settings include light/dark/system appearance, Celsius/Fahrenheit, metric/US measurements, cross-platform installation help and an update check. Android/desktop browsers supporting `beforeinstallprompt` can offer a native installation prompt; iPhone/iPad use Safari's Add to Home Screen. Unsupported browsers retain website access. No App Store or Google Play listing has been submitted.

Forecast includes a data-backed temperature chart and expandable daily details. The map has opacity and recenter controls and pauses playback when leaving the screen. Foreground weather is refreshed on request, reconnection or return after the cache expires; background monitoring is not provided.
