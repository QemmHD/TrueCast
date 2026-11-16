# TrueCast validation — 16 November 2026

Performed against live providers from this workspace and headless Chromium with Playwright.

- JavaScript syntax check passed; all JavaScript DOM IDs exist in index.html.
- Open-Meteo forecast, AQ and geocoding, and RainViewer metadata returned HTTP 200 with wildcard CORS headers.
- RainViewer metadata returned 13 past frames and zero nowcast frames. UI uses only past frames.
- Browser loaded live London forecast with 24 hourly entries and seven daily entries.
- Celsius/Fahrenheit conversion changed the displayed temperature correctly.
- Search returned New York and selecting it updated location and forecast. NWS alert endpoint returned successfully; UI displayed a dated no-active-alerts response.
- Leaflet map loaded; radar controls became available and a past frame timestamp was shown. Final version explicitly labels radar time UTC.
- Saved place persisted after reload; hourly selection maintained exactly one active hour.
- Intercepting/aborting the forecast endpoint after expiring the cache produced the saved-forecast state with retrieval age visible.
- Intercepting/aborting the forecast endpoint with no cache produced the unavailable state and cleared hourly/current data.
- No page overflow at 390px and 360px viewports.
- Final smoke test loaded the app from `/TrueCast/`, verified 24 hours, seven days, UTC radar labeling and mobile width with zero uncaught JavaScript errors.
- Desktop and mobile full-page screenshots are included.

Not yet verified: the user's actual GitHub Pages deployment/origin, iOS/Safari, assistive technology audit, polar conditions, every timezone/DST transition, official alert polygon rendering, paid-provider entitlements or long-term forecast accuracy. GPS permissions were not exercised in this environment. Core providers and map metadata were live-tested; radar accuracy and every individual tile were not independently verified.

This is a working personal starter, not the completed premium roadmap. Free API terms, attribution and provider usage policies still apply. Cached forecasts older than 24 hours are not reused as a failure fallback. There is no background push notification service or complete offline application shell.

## WeatherBug baseline update

The updated live-browser checks passed: 10 daily forecasts; range selection from 24 to 144 hourly entries; selected-hour details include the date; live dew point, gusts, pressure and visibility; 360px layout without horizontal overflow; zero uncaught browser errors. Forecast cache namespace was updated to avoid reusing earlier 7-day responses. Screenshots were regenerated. WeatherBug feature parity and superior forecast accuracy remain unimplemented/unproven; WEATHERBUG-PARITY.md records the requirements and missing integrations.


## iPhone / Pages launch preparation

Local Chromium checks using the iPhone 13 device profile passed: ten-day live forecast, 144-hour range, 16px mobile inputs, no horizontal overflow, installation dialog, registered controlling service worker, and offline app-shell reload with a visibly saved forecast. No uncaught page errors were observed. Icons and web manifest were generated and validated. This is device emulation, not a physical iPhone test. WebKit testing could not run because the environment lacks required system libraries.

A cached app shell is now implemented; earlier statements about no offline shell describe the previous release. Network providers and map tiles are intentionally excluded from the service worker cache. Full WeatherBug parity, lightning/forecast storm tracking, native widgets and background notifications remain future work.


## App interface release

Passed live-provider browser checks in an iPhone 13 Chromium profile: location dialog focus and Escape; New York city search; saved-place removal; 144-hour outlook, data chart and daily expansion; persisted dark theme, Fahrenheit and US units; cross-platform install guide; radar playback, opacity and pause-on-navigation; outdoor planner and warning shortcut. All five screens were checked at 360, 390, 768 and 1440 pixels without horizontal overflow. Offline service-worker reload, cached forecast, offline tab navigation and update-check feedback passed. Zero uncaught browser errors were observed. Screenshots were inspected during implementation. These are browser/device-emulation results, not physical iPhone or Android hardware certification, App Store review or a full assistive-technology audit.
