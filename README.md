# TrueCast Observatory 4.2

An installable, dark weather app served from GitHub Pages. No framework build or API keys are required for this personal, noncommercial edition.

**Live:** https://qemmhd.github.io/TrueCast/
**Repository:** https://github.com/QemmHD/TrueCast

## In this release

- A dedicated lightning view with 10/20/30-mile or kilometer reference rings, actual local density samples, observed history and source age. Density cannot provide an exact closest-strike distance.
- A searchable grouped map-layer picker, dark/standard basemap, saved-place pins, NIFC reported fire incidents and NOAA/SPC day-one storm-outlook polygons.
- Organized conditions with a wind compass, air/pollen, precipitation, fire reports, UV, calculated moon phase, sun times and modeled conditions beside an independent station link.
- Daily Summary/Details rows with condition descriptions, rain, wind and UV. Sticky sheet controls and independently scrolling layer lists keep the expanded app usable on phones.

- One radar timeline defaults to **Both**: six hours of NOAA MRMS history and up to six hours of HRRR simulated future reflectivity in US coverage. Past/Future controls filter the bar; NOW marks the boundary.
- Buffered, bounded frame caching and smooth opacity blending. Zoom/pan keeps playback enabled and resumes frame advancement when the view settles. This blends native frames, not optical-flow storm motion.
- Forecast chart scrubbing moves the hourly weather strip proportionally; swiping the strip updates the chart selection.
- Weather, air quality and supported local US alert checks about every ten seconds while visible, with coalescing, cancellation and rate-limit backoff. Source publication times remain independent.

- Future global ICON maps for precipitation, temperature, wind and pressure, with published forecast/run times and a timeline up to 72 hours.
- Public NOAA lightning-density and infrared satellite maps with observed timelines, source age and coverage labels.
- A 16-day outlook and hourly exploration, directly accessible from Today.
- A 48-hour air-quality outlook, pollutant details and regional pollen forecasts that preserve zero versus unavailable values.
- Atmospheric weather artwork, a richer dark visual system and locally bundled map code. Daylight is grouped with outdoor planning and conditions details.

- Quiet, independent source refreshes with visible checked/valid times, offline recovery, cancellation and rate-limit backoff. Updates preserve the selected forecast hour, scroll, open sheets, searches and map position.
- Sources & freshness panel, official NWS forecast narratives and nearby US station observations with temperature QC/age/distance checks. Station readings remain separate from model forecasts.
- Complete versioned app-shell updates: download first, apply on the next startup or from More without interrupting an active search.

- Compact Today screen, next-change summary, 12-hour preview and weather detail sheets.
- Fahrenheit and dark appearance by default; persistent temperature, measurement and theme preferences.
- 16-day daily/hourly forecasts, temperature/rain/wind charts, scrubbing and daily details.
- Same-hour ECMWF IFS / GFS / ICON comparison on demand for the next 72 hours. This shows model disagreement; it does not establish a universal accuracy winner.
- Full-screen observed radar with loaded-frame swapping, timestamps/age, playback speed, history length, opacity, coverage mask, zoom and map-point forecasts.
- Official US warnings, polygon rendering, readable alert lists and selected affected-zone lookup for alerts without polygons.
- Official NHC tropical forecast points, tracks and cones for its Atlantic/eastern/central Pacific products.
- Daylight progress, UV, AQI/pollutants, humidity, dew point, gusts, pressure and visibility.
- Outdoor planning with activity, duration and multiple non-overlapping windows across 72 hours.
- Search, optional device location, saved places, cross-platform installation guidance and a cached app shell.
- Safe-area spacing for iPhone notches/Dynamic Island and the Home indicator, including landscape layouts. This is a web app, not a native Dynamic Island Live Activity.

## Install

On iPhone/iPad: open the live site in Safari → Share → Add to Home Screen → Add. Keep Open as Web App enabled if shown. On supported Android/desktop browsers, choose Install TrueCast in More or use the browser's installation menu. Other browsers can use it as a website. No App Store or Google Play listing is included.

The existing installation receives web updates. Deployment automatically fingerprints the published files, so app changes trigger an update without a manual cache-version edit. Reopen while online, or use More → Check for updates. A complete downloaded update applies on the next startup; it does not reload an active session automatically. The app shell, a forecast no more than 24 hours old and air quality no more than one hour old can reopen offline with saved-data labels. Fresh maps, searches and verified alerts need a connection.

Weather, air quality and supported local US alerts are checked about every ten seconds while the app is visible. US radar metadata is checked on the same cadence; other map products retain source-specific caches. Polling does not make providers publish new observations every ten seconds. Returning to the app rechecks aged sources and reconnecting requests fresh data. iPhone can suspend closed/background web apps; scheduled silent closed-app refresh and continuous storm monitoring are not promised.

## Local development and review

Run `python3 -m http.server 8766` in this folder and open http://127.0.0.1:8766/.

For browser review: `npm ci`, `npx playwright install chromium`, then `npm test` while the server is running. `TRUECAST_URL` overrides the test target; `TRUECAST_BROWSER_PATH` optionally selects a browser executable. Tests include deterministic freshness/clock/DST and refresh-flow checks, actual service-worker upgrade/offline tests, live weather/radar checks and clearly separated synthetic warning/cyclone fixtures for states absent in the live feed. Synthetic data is never included in the published app.

The deployment workflow uploads only app files, icons and licensed vendor assets to Pages; development tools, research and tests remain in the repository. Relative assets and hash routes support the `/TrueCast/` repository subpath.

## Data and limits

Forecast, models and air quality: Open-Meteo/CAMS. Observed radar: NOAA MRMS in US coverage, RainViewer elsewhere. US future reflectivity: NOAA HRRR via Iowa Environmental Mesonet. Global future fields: DWD ICON. Observed lightning density and infrared satellite: NOAA nowCOAST. Warnings, independent official forecast/observations and zone boundaries: NWS. Tropical products: NOAA/NHC. Basemap: OpenStreetMap. Keep visible attribution. See [OBSERVATORY-RELEASE.md](OBSERVATORY-RELEASE.md) for 4.2 sources, screenshot-inspired features and limitations, [RADAR-TIMELINE-RELEASE.md](RADAR-TIMELINE-RELEASE.md) for 4.1 radar sources, playback and refresh behavior, [ATMOSPHERE-RELEASE.md](ATMOSPHERE-RELEASE.md) for 4.0 sources, screenshot checks and validation, [SOURCE-REFRESH-RESEARCH.md](SOURCE-REFRESH-RESEARCH.md) for the expanded provider/refresh review, [COMPETITOR-RESEARCH.md](COMPETITOR-RESEARCH.md) for app comparisons and [REVIEW.md](REVIEW.md) for validation.

Open-Meteo's hosted free tier is noncommercial; queries are weighted by variables/models and have rate limits. RainViewer's public service targets personal/educational/small community use. OpenStreetMap public tiles require normal browser caching, visible attribution and no bulk/offline tile downloading. An expanding commercial product needs suitable provider licensing and hosting.

There is no individual-strike lightning feed, minute-specific rain nowcast, raw Doppler/velocity product, global tropical feed, native widgets or background push service. NOAA-derived lightning density is a regional gridded product, not a nearest-strike distance. Surface wind is not storm-cell motion. Outside US coverage, RainViewer history is generally around two hours, and future precipitation uses coarse DWD six-hour totals rather than simulated reflectivity. No global six-hour radar-history claim is made. The future field maps use DWD spatial fields; model point forecasts alone do not paint them. No forecast superiority claim is made without regional measurement. National warnings remain authoritative; map coverage gaps, failed sources and incomplete geometry must not be shown as safe conditions.

Saved locations/preferences remain on this device. Selected coordinates go to the requested weather providers; map tiles go to OpenStreetMap, NOAA, Iowa Environmental Mesonet, RainViewer and DWD. No analytics, user account or API secrets are included. See the in-app coverage/privacy section for details.

Moon illumination uses SunCalc's BSD-2-Clause algorithm; its license is retained in the source and vendor directory. Fire reports use NIFC / WFIGS via public ArcGIS queries, and day-one storm outlooks use NOAA / SPC. These are reports and forecast areas, not exact fire edges, fire-risk ratings or replacements for current official warnings.
