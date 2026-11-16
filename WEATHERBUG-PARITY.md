> Release update: TrueCast 3.0 adds official NHC regional tracks/cones, official US warning geometry/affected-zone lookup, model comparison and the redesigned dark interface. See README.md for the current feature list; unimplemented/parity labels below describe the earlier roadmap unless explicitly updated.

# TrueCast's WeatherBug replacement target

Updated 16 November 2026. This supplements PLAN.md and supersedes its original 7-day/24-hour starter baseline. WeatherBug feature parity is now a product requirement, not a statement that the existing starter already meets it. Free-to-start remains the budget constraint.

## What was checked

WeatherBug's [current US App Store description](https://apps.apple.com/us/app/weatherbug-weather-forecast/id281940292) advertises 10-day forecasts, over 140 hours of hourly forecasts, over 20 weather maps, precipitation outlook, Spark lightning proximity alerts, tropical tracking, fire information, winter alerts, air quality, pollen, UV, lifestyle forecasts, widgets and weather videos. Its [current website](https://www.weatherbug.com/weather-forecast/now/new-york-ny-10001) also shows dew point, daily/monthly rain, wind/gusts, pressure, sun/moon details, traffic cameras, cold/flu content and outdoor sports guidance.

These are developer-published feature claims, not independent measurements of accuracy. Platforms, regions and subscriptions can differ. The complete current list of 20+ layer names was not established by these pages; a layer-by-layer inventory of the user's actual WeatherBug version is still required before declaring full parity. Do not fill that gap with twenty redundant TrueCast toggles.

## Feature contract

| WeatherBug capability | TrueCast target | Current delivery / missing dependency |
| --- | --- | --- |
| Current, hourly, 10-day forecasts | At least 10 days and 144 hourly hours; clear units, local dates and meaningful charts | Updated starter implements 10 days with 24/72/144-hour range selection. Longer range is not proof of better accuracy. |
| Detailed conditions | Feels-like, dew point, humidity, wind direction/speed/gusts, sea-level pressure/trend, precipitation, visibility | Starter adds dew point, gusts, pressure and hourly visibility; direction, trend and expanded precipitation totals remain. Model estimates must not be called station measurements. |
| Daily/monthly rain and history | Clearly distinguish measured station totals, modeled totals and climatology | Need station/history integration and quality controls; not implemented. |
| Precipitation outlook | Intensity/type timeline, probability, approximate start/stop windows with confidence | Hourly chance/amount exists. Minute-specific arrival requires suitable nowcast data, not interpolation of hourly output. |
| Radar and 20+ map layers | Observed radar, licensed forecast precipitation, snow/ice, wind/gusts, temperature/feels-like, pressure, clouds/satellite, AQ/pollen, warnings, lightning, tropical and fire views as data permits | Starter has observed past radar and coverage mask. Remaining map fields/imagery require suitable tiled products, regional sources and licensing. Match useful capability, not arbitrary toggle counts. |
| Spark lightning | Strike location/time/age, nearest recent strike distance, trend and proximity alerts | Not implemented. A licensed lightning detection feed is needed; modeled thunderstorm potential is not detected lightning. WeatherBug's Spark brand/data are not automatically available for reuse. |
| Tropical Center | Active systems, official positions, track/advisory history, forecast cone, intensity/wind probabilities and local context | Not implemented. Integrate authoritative regional advisories and GIS products; audit delivery formats, timestamps, CORS and update cadence. A cone represents track uncertainty, not the storm's complete hazard footprint. |
| Fire Center | Active detections, incident/perimeter context, smoke, timestamps and provenance | Not implemented. Evaluate satellite fire products and regional incident feeds. A thermal detection is not a confirmed fire perimeter. |
| Severe/winter alerts | Official warnings with geometry or affected zones, instructions, onset/expiry and push | Foreground NWS alert text exists for searched US cities. Map polygons, non-US alerts, country resolution and background push remain. |
| Pollen/allergies | Species, level/trend, coverage and local forecast | Not implemented. Existing Open-Meteo/CAMS option covers European pollen; US parity needs another suitable source. |
| UV/air quality | Hourly outlook, pollutants, source resolution and understandable guidance | Starter has daily max UV and modeled current US AQI. Hourly UV, pollutant breakdown and more guidance remain. Avoid invented personalized burn-time guarantees. |
| Lifestyle forecasts | Transparent outdoor sport, commute, gardening, photography and comfort windows | Starter has walking/running/cycling thresholds. Do not invent chronic-pain or illness predictions from weather fields; clinically oriented products need a justified source/method. |
| Cold/flu content | Licensed public-health context distinguished from weather | Not implemented; requires appropriate health-data sources/content rights, not a temperature-to-illness score. |
| Sun/moon | Sunrise/sunset, moon phase, illumination, twilight and daylight changes | Starter has sunrise/sunset. Remaining astronomy can be calculated with a validated library. |
| Cameras/traffic | Nearby cameras and traffic context where lawful and useful | Not implemented. Requires geographically suitable feeds, embedding rights and often separate traffic licensing. |
| Weather news/video | Relevant, sourced summaries and licensed media | Not implemented. Linking to a source is different from acquiring reuse rights to its articles/videos. |
| Saved locations/settings | Fast search, favorites, comprehensive units, themes, customization | Starter has search, favorites and temperature units. Full wind/rain/pressure units, theme controls and customizable order remain. |
| Widgets | Useful home-screen weather surfaces | Home Screen web-app installation and a cached app shell are implemented. Native iOS/Android widgets still require platform-specific development. |
| Notification delivery | Reliable official alert and rain notifications while closed | Not implemented. Requires external monitoring and push delivery; GitHub Pages alone cannot supply it. |

## A genuinely better tracker

Design a dedicated **Track** view with Rain, Storms, Lightning, Tropical and Fire modes. Keep observed positions, provider forecasts and TrueCast-derived estimates visually distinct.

1. A timeline presents the last observed frame time, retrieval time, age and geographic coverage. Unsupported areas have a visible coverage state rather than an empty reassuring map.
2. Selecting a supported storm shows source identity, observed motion and a forecast arrival **range** at a saved place. Do not calculate reliable storm identity, speed or hazards simply by eyeballing radar pixel colors.
3. Arrival guidance uses a provider-supplied nowcast or a separately validated tracking method. Uncertainty increases into the future; cells can grow, split or dissipate, so no fake exact countdown.
4. Lightning strike dots include detection time and age; nearest strike uses a stated observation interval and coverage. A quiet feed is not proof of no lightning if delayed or unavailable. The display does not issue an “all clear” solely from strike distance.
5. Alerts and storm details appear beside the map, with official instructions taking priority over a comfort score. Users can watch saved places without continuous background location collection.
6. Playback, coverage overlay, clear legends, opacity, zoom controls, reduced-motion behavior and one-tap return to present are acceptance requirements. Mobile controls must remain usable with one hand.

The existing RainViewer loop is only the first observed-radar component. It is not a cell tracker, strike detector or future radar product.

## A forecast that earns “better”

Open-Meteo remains the recommended free baseline. It is not yet demonstrated to outperform WeatherBug. Improve the experience immediately with clear sources, dates, forecast uncertainty and transparent activity windows. Improve accuracy through evidence:

- Select relevant regional models once the target country/city is known. Compare against an independent forecast, such as NWS in supported US locations, rather than assuming a worldwide blend is always best.
- Retain issued forecasts and compare them with quality-controlled observations at matching locations, elevations, accumulation periods and lead times.
- Benchmark temperature MAE, rain probability calibration/Brier score, precipitation occurrence, wind/gust error and rain-start timing. Report results by lead time and region. Thirty days is an initial pilot; seasonal claims require longer coverage.
- Include WeatherBug forecasts in side-by-side evaluation only through a permitted data route or manual personal records; its consumer interface does not establish API or automated-scraping rights.
- Model agreement is informative but not an accuracy percentage. Do not average several models blindly and advertise the average as superior.

## Consequence for the API recommendation

The earlier recommendation remains appropriate for a free personal forecast prototype. It is insufficient on its own for full WeatherBug parity. The expanded target is a **multi-source weather platform**:

- Open-Meteo: baseline forecast/environmental point data.
- RainViewer: personal-use observed radar, within current terms and limits.
- Official weather services: warnings and regional forecast/advisory products.
- A licensed map/nowcast/lightning platform: trial Xweather first; compare actual coverage, latency, redistribution terms and map access accounting before purchase. Do not assume every advertised layer is part of a free account.
- Additional appropriate pollen, camera/traffic, fire and health/content sources where required.
- An external service for credentials, shared caching, accounts and background push. The interface can remain on GitHub Pages for a personal project.

Full parity is therefore a staged goal with some paid/data-dependent features. WeatherBug's consumer app being free does not mean the underlying proprietary feeds are available free to third-party app builders. No paid subscriptions have been purchased or implied as authorized.

## Priorities

1. Forecast baseline: ten days, 144-hour selection, richer conditions — implemented locally in this update.
2. Tracker foundation: map usability, official warning overlays, location/country handling, coverage/freshness and a unified timeline.
3. Lightning and forecast precipitation: select and test a legitimate feed, then build source-backed arrival/proximity behavior.
4. Tropical/fire/pollen, astronomy and transparent lifestyle tools, prioritized for the launch country.
5. Notifications, native widgets, traffic/cameras and licensed content as separate delivery/integration work.

The user confirmed that all tracking categories are required: rain arrival and movement, storms and nearby lightning, and hurricanes/severe weather. None is an optional substitute for another. The nearest city/country has not been supplied, so plan for worldwide use with explicit regional availability. Regional model tuning and alert authorities remain location-dependent.


## Confirmed tracking scope: all categories

All three experiences are part of the requested product scope. This is a requirement update, not a claim that the live data integrations are implemented.

| Tracking view | Required behavior | Data/availability gate |
| --- | --- | --- |
| Rain | Observed playback, movement, future precipitation where supported, estimated arrival/ending ranges at saved locations, confidence and accumulation context | Current starter supports observed past radar only. Future timing requires a supported nowcast feed and validation. |
| Storms and lightning | Source-backed storm tracks, motion, nearby detected strikes with age/distance, warning areas and saved-location context | Requires appropriate licensed detections/tracks and official warnings. Do not substitute modeled thunderstorm probability for observed lightning. |
| Hurricanes and severe weather | Active tropical systems, advisory history, official forecast tracks/cones, intensity and relevant wind/rain/surge hazard products where available, plus non-tropical severe alerts | Use the responsible regional authority. Show product issue/valid times and geographic availability. A track cone does not describe the complete hazard area. |

Each view must distinguish observations from forecasts, expose update time and coverage, support a shared timeline where data permits, and show unavailable feeds explicitly. Absence of coverage or a failed request must never appear as an all-clear. Notifications remain a separate external-service requirement.

The free-to-start forecast/radar edition remains the first working stage. Full tracker parity is blocked on selecting legitimate specialist feeds and verifying entitlements, not on choosing between these three categories. No paid plan has been purchased.
