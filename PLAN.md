> Current release: TrueCast 3.0 is implemented and deployed through the existing Pages workflow. README.md and COMPETITOR-RESEARCH.md describe current behavior; this original plan remains as historical research and roadmap context.

# TrueCast: build a weather observatory

**Scope update:** WeatherBug is now the feature baseline. The user confirmed all tracker categories: rain arrival/movement, storms/nearby lightning, and hurricanes/severe weather. Plan worldwide coverage with explicit regional limitations. See [WEATHERBUG-PARITY.md](WEATHERBUG-PARITY.md) for the researched parity contract and tracker design. The starter now offers 10 daily days and 24/72/144-hour selection; descriptions of its original 7-day/24-hour baseline below are historical. Full parity is not yet implemented.

Research checked 16 November 2026. Scope: a global, free-to-start, personal weather app hosted on GitHub Pages. Repository URL and primary country have not yet been supplied. Prices, entitlements and coverage must be rechecked at signup. Recommendations below are engineering judgments for this brief, not a measured worldwide accuracy ranking.

## Decision

Use **Open-Meteo as the primary forecast engine**, **RainViewer for observed past radar**, **Open-Meteo/CAMS for air quality**, and **NWS for official US alerts**. Use Open-Meteo geocoding for city search. This gives the personal prototype a $0 API bill, no embedded API secrets and a static hosting architecture. No single researched provider supplies all premium features, unrestricted worldwide coverage and a sustainable free allowance.

Open-Meteo wins this brief because its free endpoint needs no key, offers global regional/model coverage, hourly/daily forecasts, model selection and ensemble APIs, and has compatible air-quality, geocoding and marine endpoints. Its commercial hosted service requires a subscription. Its “best match” selects high-resolution available guidance, not a model proven most accurate for every user. Its current conditions are modeled estimates, not necessarily local station observations.

If “free” must also mean commercial use, WeatherAPI.com and Visual Crossing deserve a new shortlist: their official pricing pages explicitly allow commercial use on the free tier. Their respective limitations and exposed-key architecture still matter. A commercial SaaS also needs hosting appropriate to GitHub Pages' terms.

## The provider comparison

I reviewed 13 forecast providers plus two specialist public services. Core facts below come from provider documentation; provider-written comparison articles were treated as leads, not independent accuracy evidence.

| Provider | What the official sources establish | Fit for TrueCast |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com/en/pricing) | No-key noncommercial hosted API; 10,000 daily / 300,000 monthly calls, plus hourly/minutely limits. 30+ models; commercial and reserved-capacity plans. Ensemble/history require Professional or above on the commercial service. | **Best primary engine for the free personal edition.** Broad data and transparent modeling; no radar tile service or worldwide official alert feed established in the reviewed forecast docs. |
| [WeatherAPI.com](https://www.weatherapi.com/pricing.aspx) | Free: 100,000 calls/month, three forecast days; commercial use allowed. Starter: $7/month, seven days, 3M calls/month. Paid rows advertise much longer “future weather” horizons. | **Best straightforward free commercial alternative** if three days is enough. Do not present a 300-day product as reliable day-specific weather. Protect/restrict the account key through an appropriate architecture. |
| [Visual Crossing](https://www.visualcrossing.com/weather-data-editions) | Free: 1,000 records/day, 15-day forecast, commercial use allowed, attribution required. The page says a single 15-day forecast query counts as one query result; history counts differently. | Strong alternative for history and forecast comparison. A “record” is not always an HTTP request; budget using its actual query accounting. Not selected as the radar/ensemble foundation. |
| [OpenWeather](https://openweathermap.org/price) | Basic free plan lists 5-day forecasts in 3-hour steps, air pollution and map layers. One Call is a separate pay-per-call product with first 1,000 calls/day free; current page lists both v3.0 and v4.0. | Broad all-round alternative. Do not mistake basic-free features for One Call entitlements, or model precipitation maps for observed radar. Potential overages and a shared client key add operational work. |
| [Pirate Weather](https://pirateweather.net/) | Current homepage lists 10,000 free monthly calls, global model coverage, Dark Sky-style current/minutely/hourly/daily responses and alerts. | Worth testing for a rain-focused experience. Lower free allowance than Open-Meteo; actual minutely skill, local coverage, commercial rights and credentials must be checked for the intended deployment. |
| [MET Norway](https://api.met.no/doc/locationforecast/HowTO) | Global forecast up to nine days. [Terms](https://docs.api.met.no/doc/TermsOfService.html) require identification, caching and limited coordinate precision; low-volume simple browser requests are allowed, while higher traffic needs a caching gateway. | Good independent forecast source or regional alternative, particularly worth evaluating in Nordic markets. Less convenient for an expanding, entirely static public app. |
| [Weatherbit](https://www.weatherbit.io/pricing) | Free: current conditions and seven-day daily forecasts, noncommercial, 50 requests/day. Paid packages add hourly/minutely, commercial rights and specialist products. | Useful agricultural/environmental datasets, but its free plan is too constrained for TrueCast's interactive hourly experience. Paid prices did not render on the extracted pricing table, so no exact quote is asserted. |
| [Tomorrow.io](https://www.tomorrow.io/weather-api/) | Offers a free developer tier; advertises paid/enterprise minutely data, maps, route weather and premium AQ/pollen/lightning layers. Paid pricing is quote-based on the reviewed page. | Strong paid candidate for route and event intelligence. Reviewed materials do not establish a dependable numerical free allowance; verify the actual account entitlements rather than repeat old 500/day claims. |
| [Vaisala Xweather](https://www.xweather.com/pricing/weather-api-pay-as-you-go) | Official page advertises 15,000 free monthly accesses and MapsGL access; regional subscription terms differ. [Its own worked example](https://www.xweather.com/blog/xweather-agent-skills) counts a five-minute interactive visit at 301 accesses, about 49 such visits from the free allowance. | **First paid map/hazard platform to trial**, especially lightning, map layers and severe weather. “Accesses” are not the same as page views or ordinary forecast requests. Excellent feature fit does not make it the cheapest. |
| [Apple WeatherKit](https://developer.apple.com/weatherkit/) | 500,000 monthly calls included with Apple Developer Program membership; 1M is listed at $49.99/month. REST works for websites. [Authentication documentation](https://developer.apple.com/documentation/weatherkitrestapi/request-authentication-for-weatherkit-rest-api) requires ES256 signing and keeping private keys secret. | Attractive if already in Apple's developer ecosystem. Not a zero-membership-cost choice, and private signing belongs in a service outside GitHub Pages. No general radar tile entitlement established. |
| [AccuWeather](https://developer.accuweather.com/documentation/overview) | Core free offering is a 14-day trial, 500 calls/day. Starter lists $2/month for 15,000 monthly core calls. MinuteCast is packaged separately; the page lists a $25/month Lite package. | Trial for branded precipitation guidance if it performs well in the target market. Not a permanent free full-featured app backend. Do not assume MinuteCast is bundled with core weather. |
| [Meteomatics](https://www.meteomatics.com/en/weather-api/) | Enterprise API with 110+ models, 1,800+ parameters, ensembles, radar/satellite and downscaling. Pricing varies by requirements. | Strong research/enterprise candidate. More data engineering and procurement than this free static app needs. Downscaled resolution is not itself proof of superior forecast skill. |
| [The Weather Company](https://www.weathercompany.com/weather-data-apis/) | Enterprise forecasts/observations; free trial of 30 days, up to 50,000 calls/day for eligible enterprise users. Production access requires commercial arrangements. | Serious paid forecast-quality benchmark. Not a permanent free launch engine. Marketing accuracy claims do not replace local validation. |
| [RainViewer](https://www.rainviewer.com/api/weather-maps-api.html) | Technical docs: two hours of past radar in ten-minute frames, maximum native tile zoom 7, coverage mask. [API FAQ](https://www.rainviewer.com/api.html): free personal/educational/small community use; commercial terms by arrangement, visible credit required. | **Free personal radar choice.** FAQ mentions nowcast frames, but detailed schema documents only past frames. Live endpoint check returned 13 past frames and zero nowcast frames. Plan only past radar. |
| [US National Weather Service](https://www.weather.gov/documentation/services-web-api) | Free public forecasts, observations and alerts; reasonable unpublished rate limits. Seven-day forecast products in supported US areas. | **Authoritative US alert source.** Not a worldwide alert solution, and unavailable/failed checks must be shown as unknown. |

Open-Meteo [pricing](https://open-meteo.com/en/pricing) extraction did not expose subscription currency amounts, so the plan deliberately avoids copying an old €29/€99 figure. Exact current paid prices need checking at checkout. Likewise, map dataset entitlements and redistribution rights must be verified for a paid map trial before committing.

## What makes TrueCast distinctive

**Promise: “Weather, in perspective.”** Help users decide when to leave, what to prepare for and how much uncertainty remains. Visual polish should support those decisions.

### A visual observatory

- Deep forest/ink sky (#142B30), warm limestone surfaces (#F3F2EC), pale sage (#D8E5C8) and solar amber (#E9B66E). Reserve warning colors for actual severity.
- Large quiet temperature typography; thin scientific annotations; generous space; custom horizon artwork. Use a small number of purposeful surfaces rather than a dashboard of identical boxes.
- Desktop: large atmospheric overview; hourly timeline; week and outside planner; wide map; environmental details. Mobile: overview → next change → timeline → map → week, with thumb-accessible navigation in the expanded release.
- A restrained sky treatment that follows day/night and conditions in the expanded release. The starter's horizon is explicitly decorative; do not imply the sun position is measured.
- High-contrast labels, keyboard time selection, text equivalents for every chart, reduced motion, readable map legends and a light theme that works outdoors.

### Signature interaction: the time lens

One shared selected time drives the hour chart, point forecast, map forecast layer and activity planner. Desktop uses a scrubber; mobile uses large discrete hour targets. A persistent “Now” action returns to the present.

Historical radar and future model layers occupy separate labeled portions of the timeline. The observed side ends at the latest available frame, not necessarily the present moment. Future precipitation is labeled **model forecast**, not radar. A data gap stays a gap. A forecast point API cannot efficiently paint a whole weather map: future field layers need a licensed tile/field provider, or a separate tiling pipeline.

### Signature feature: golden windows

Ask “When can I get outside?” Choose a walk, run, cycle, photography session or outdoor meal. Find contiguous forecast intervals matching visible comfort thresholds. Explain “Lower rain chance, lighter winds, daylight.” Let users adjust thresholds and duration in the expanded version. Display whether the match is tomorrow, in the destination timezone. A matching comfort window never suppresses official warnings.

The starter finds the first matching two-hour daylight interval for walking/running/cycling from hourly samples. It is a simple comfort heuristic, not a health or safety prediction and not an optimization across multiple weather providers.

### Signature feature: forecast honesty

For later release, show ensemble spread around temperature and precipitation, allow model comparisons, and explain disagreement in ordinary language. “Models disagree on when rain begins” is more useful than an invented 92% confidence badge. Ensemble spread is not automatically a calibrated probability. Verify calibration before labeling confidence. Never make a minute-specific rain-start claim from interpolated hourly data.

### Signature feature: what changed

Compare stored forecast snapshots at matching valid times and model/source metadata. Show “Saturday's rain chance increased since yesterday's forecast.” This requires timestamped forecast snapshots, not substituting today's observations or reanalysis for yesterday's prediction. Browser-only history is device-specific; a shared archive requires storage outside Pages or a licensed historical-forecast API.

## Premium feature roadmap and dependencies

| Area | Planned experience | Free edition / dependency |
| --- | --- | --- |
| Now | Conditions, feels-like, next meaningful change, gusts, dew point, pressure trend, visibility, humidity | Forecast fields available from Open-Meteo; clearly label model estimates. Starter includes a subset. |
| Forecast | 24–72 hour interactive curves, 7–16 day daily view, precipitation amount/type/chance, snow, wind/gusts | Point data generally available; show uncertainty increasing with lead time. Starter: 24 hours + 7 days. |
| Short-term rain | Rain intensity timeline and start/stop guidance with coverage badge | Open-Meteo native 15-minute data in supported regions; elsewhere interpolation. True radar nowcast or minute guidance requires a specialist product. |
| Map | Past radar playback, frame timestamps, legend, opacity, coverage mask, click forecast, saved places | Starter includes past radar and coverage. Opacity UI, timeline synchronization and advanced controls follow. |
| Future maps | Temperature, wind particles, pressure, cloud, rain/snow, AQ overlays; comparison split view | Needs field/tile source, licensing and performance budget. Open-Meteo point calls alone are not a scalable global tile service. |
| Alerts | Authority, severity, polygon/zone, onset, expiry, instructions; alerts take visual priority | NWS in US first; add national CAP feeds or a licensed aggregator by region. Starter supports searched US cities, not automatic country lookup for GPS/map pins. |
| Air and pollen | US/EU AQI selection, pollutant detail, smoke/dust, pollen cards with coverage | Open-Meteo/CAMS; [pollen is Europe-only](https://open-meteo.com/en/docs/air-quality-api). Global model resolution differs from Europe; no implication of neighborhood sensors. Starter US AQI only. |
| Sun and moon | Sunrise/sunset arc, golden/blue hours, moon phase, daylight change | Compute astronomical times accurately with a tested library; account for polar day/night. Starter sunrise/sunset only. |
| Marine | Waves, swell, sea temperature, beach mode | Open-Meteo marine for supported fields. Tides need an independent tide model/service; waves are not tides. Not in starter. |
| Severe weather | Lightning, storm cells, hail, tropical tracks, specialist satellite views | Licensed hazard feeds and regional coverage checks; Xweather is the first paid trial candidate. Not in starter. |
| Travel | Compare cities, weather along a route at estimated arrival times, elevation | Waypoint forecast budgeting plus routing/geocoding services; store location privately by default. Not in starter. |
| Personalization | Units, favorites, thresholds, installable app, shareable location/time links | Browser storage and PWA shell can be static; device widgets and cloud sync are separate projects. Starter saves places and temperature units. |
| Notifications | Forecast briefings, rain and official alert push | Foreground alerts can be static. Reliable background delivery requires an external scheduler/push backend. Pages and a service worker alone cannot continuously monitor weather while the app is closed. |
| Offline | Cached last forecast with unmistakable age and limited offline shell | Starter has forecast cache only, no offline installation shell. Never show stale warnings as live; no bulk offline map tiles. |

Open-Meteo's [forecast docs](https://open-meteo.com/en/docs) explicitly distinguish native 15-minute regional outputs from interpolation elsewhere. Its [ensemble API](https://open-meteo.com/en/docs/ensemble-api) exposes model members; the commercial Standard plan does not include ensemble access. These details affect both product promises and future costs.

## Architecture that works on GitHub Pages

The starter is plain HTML/CSS/ES modules with Leaflet loaded from a CDN. This intentionally keeps deployment simple and needs no package install or build server. All asset URLs are relative, so repository subpaths work. A GitHub Actions deployment workflow is included. No repo writes or publication have been performed because no repository URL was supplied.

For the expanded app, use TypeScript with Vite, a component UI layer, MapLibre GL JS for custom vector maps, and a chart library or well-tested SVG chart components. Treat the basemap, forecast point data, radar, model fields and alerts as independent adapters. Preserve `source`, `validAt`, `retrievedAt`, `modelRunAt` when available, `units`, `timezone`, `coverage` and `status` in normalized responses. Include source attribution at the data surface.

Suggested boundaries: `providers/` for fetch/normalization, `forecast/` for point data and charts, `map/` for layers/timelines, `planning/` for user thresholds, `alerts/` for authority data, and `storage/` for cache and preferences. This makes a later API change possible without rewriting the interface.

Keyed commercial providers need special treatment: any key shipped in JavaScript or injected at build time is public. GitHub Actions secrets do not remain secret once compiled into a static bundle. Use deliberately public, domain-restricted browser credentials where supported, otherwise an external gateway (for example a Cloudflare Worker) with server-side keys, request validation, caching, rate limits and abuse controls. CORS alone is not authorization. Apple signing keys must never be in the frontend.

GitHub Pages cannot run that gateway or a notification scheduler. The free personal frontend can remain on Pages; the optional service would live elsewhere. [GitHub's Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) also prohibit using Pages primarily for commercial SaaS, so reassess hosting before selling subscriptions. “Premium” here describes the intended experience, not a paid checkout in the starter.

## Cost controls

- Prototype: $0 API subscriptions for the proposed personal/noncommercial stack within provider limits; no API key required. Free does not imply SLA or indefinite entitlement.
- Cache point forecasts for ten minutes, deduplicate concurrent requests and only fetch visible/saved locations when needed. Use provider expiry headers where supported. Stop animation in hidden tabs. Load maps on demand. Do not prefetch entire regions or offline map tiles.
- Open-Meteo counts extensive queries fractionally/multiply: more than ten variables or more than two weeks can count as multiple calls. Model and ensemble queries also affect usage; do not equate one network request with one billable unit.
- Illustrative budget only: 1,000 visits × two forecast locations × two weighted forecast calls ≈ 4,000 forecast units/day, before separate AQ, geocoding, radar and alert traffic. Measure the actual API request accounting rather than using visit counts as a quota guarantee.
- Radar can dominate traffic: 12 tiles × 13 animation frames = 156 tile loads per viewport before cache savings, panning or zooming. Avoid eagerly loading every frame at every zoom. Xweather's MapsGL session accounting is different again.
- Commercial upgrade: request current Open-Meteo paid pricing and verify whether ensemble/history justify Professional. Trial Xweather and an alternative map provider on actual target locations, then quote forecast and map costs separately. Set provider quotas/billing alerts wherever available.
- Use a basemap provider suitable for real public traffic. For the starter, follow [OpenStreetMap's tile usage policy](https://operations.osmfoundation.org/policies/tiles/): attribution, normal browser caching, no bulk downloading/prefetching/offline maps, and best-effort availability.

## Release sequence

1. **Working personal edition:** deploy the supplied starter to the intended repo, then validate its actual Pages origin, city search, timezone display, mobile use, errors and attribution. This is already implemented locally, but is not published.
2. **Distinctive TrueCast release:** synchronized time lens, richer hourly/daily charts, adjustable activity windows, day/night atmosphere, accessible data tables, deep links, complete units and PWA shell. Add country resolution so GPS and map pins can request the right alerts.
3. **Forecast transparency:** ensemble bands, model comparison and forecast-change snapshots. Add automated checks for calibration, stale models and date alignment. Verify paid plan entitlements if commercial.
4. **Advanced maps and regional breadth:** licensed forecast tiles, particles and layer comparison; official alert sources for chosen launch regions; pollen/marine with explicit geographic availability.
5. **Connected services:** authenticated sync and push monitoring in an external backend, only once demand and costs justify them. Run separate product planning for native widgets or a mobile app.

Release gates: no horizontal overflow at 360 px; keyboard-accessible controls; visible source/time/units; correct DST and opposite-hemisphere day boundaries; null/polar handling; no stale/failed alert feed shown as “all clear”; no future timestamps on observed radar; no false minutely precision; third-party errors don't break the rest of the app; tested repository subpath; exact plan/license compatibility.

## How to choose the most accurate provider honestly

Documentation research can identify the best architectural fit; it cannot establish a universal accuracy winner. Run a 30-day pilot in the target market, longer if seasonality matters, before switching primary provider based on accuracy claims.

Sample cities, rural areas, coastlines and higher elevations. Save forecasts when issued and compare matching valid times against quality-controlled station observations at 1h, 6h, 24h and 72h horizons. Measure temperature MAE, wind/gust error, precipitation Brier score and reliability, rain onset timing where appropriate, missing-data rate and p50/p95 latency. Account for station/grid elevation, accumulation intervals, publication latency and precipitation thresholds. Do not use a provider's own reanalysis as independent truth. Present errors by location and lead time rather than one impressive aggregate. Add a second season before claiming year-round superiority.

For a free personal launch, Open-Meteo is the evidence-supported choice on breadth, deployment simplicity and access model. For paid radar and hazards, Xweather is a feature-fit trial recommendation pending coverage, usage economics and local quality checks. There is no basis in this research to call either the world's most accurate weather API.

## Validation notes

Live network checks from this workspace returned HTTP 200 and `Access-Control-Allow-Origin: *` for Open-Meteo forecast, air quality, geocoding and RainViewer metadata. RainViewer returned 13 past radar frames and an empty nowcast array. This confirms the free starter's core connection design, not future service availability or permission for commercial usage. Browser and further functional results are recorded separately in VALIDATION.md.
