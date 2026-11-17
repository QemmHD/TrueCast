# TrueCast Observatory 4.2

17 November 2026. Feature and interface work guided by the supplied WeatherBug screenshots. TrueCast retains its dark visual identity and compact Today screen; expanded information lives in a grouped conditions sheet and map tools. No advertising, sponsored articles, provider accounts, paid subscriptions or API keys were added.

## Applied screenshot ideas

- **Lightning map:** a location-centered view with 10/20/30-mile reference rings by default, kilometer rings in metric mode, a local grid sample, explicit frame age, source guide, and a 30-minute / two-hour observed timeline. The history window ends at the latest published frame, so source latency does not silently remove the frames needed for playback. Actual published images drive the play bar. Playback stays enabled through zooming.
- **Layers & map:** searchable, grouped catalog for radar, past/future radar, lightning, official warnings, SPC storm outlook, fire reports, tropical tracks, four forecast fields and infrared satellite. Air/pollen and all-conditions entries explicitly open local details rather than pretend to be spatial maps. The layer list scrolls separately from its settings. Dark/standard OpenStreetMap styling, opacity and history controls remain available.
- **Conditions:** lightning, air quality, wind compass/speed/gusts, forecast precipitation, fire reports, UV, sun/moon and a striped conditions table. Nearby NWS observations remain separate from modeled conditions and now include verified dew point, humidity and sea-level pressure when supplied. Missing fields stay unavailable.
- **Forecast:** condition descriptions on daily rows and a persistent Summary/Details switch for precipitation, wind and UV. The available 16-day outlook remains.
- **Places:** active saved-location state, coordinate subtitles and clickable saved-place map pins. A screenshot's city is used for testing, not imposed on the user's selected location.
- **Phone polish:** safe-area spacing, readable action icons, sticky sheet headings/close controls, landscape separation of the lightning card and play console, and preserved foreground refresh behavior.

## Verified data sources

### NOAA lightning density

[Service capabilities](https://nowcoast.noaa.gov/geoserver/lightning_detection/wms?service=WMS&request=GetCapabilities&version=1.3.0), [NOAA/OPC product description](https://ocean.weather.gov/lightning/lightning_pdd.php).

The existing publicly distributable NOAA-derived NLDN/GLD360 density layer represents 15-minute periods on an approximately 8 × 8 km grid. The WMS describes map values as strikes/km²/min multiplied by 1,000. A live GetFeatureInfo request returned JSON `Band1` samples with CORS support. TrueCast divides by 1,000, preserves zero versus null, and does not round tiny positive activity to zero. Sampling follows the selected, actually loaded map frame, and local times follow the forecast location's timezone. Point samples are cached for five minutes per location/frame; source metadata is checked on demand with a one-minute cache. Live Gatlinburg samples and image playback succeeded during review.

**Distance rings are geographic references, not strike locations.** The density feed cannot provide WeatherBug's exact closest-strike distance, individual strike locations or a guaranteed “no lightning nearby” signal. Zero density in one cell, missing data and empty imagery are not safety clearances. Broader coverage is the Americas and adjacent oceans; source gaps remain possible. The UI states these limits.

### NIFC / WFIGS reported US fire incidents

[NIFC official map directory](https://www.nifc.gov/fire-information/maps), [NIFC Open Data](https://data-nifc.opendata.arcgis.com/), [public incident layer metadata](https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0?f=pjson).

The public query service supports distance queries and CORS without a key. TrueCast requests active-candidate wildfire reports within 400 km, excludes reported-out/fully-contained incidents through the source query, and validates point coordinates, reported containment, distance, and updates within seven days. Partial/transfer-limited results remain labeled. Values of zero acres or zero containment are displayed as zero when supplied. Checks are on demand with a five-minute cache; no hidden-page continuous fire service is added.

The distance is to the nearest **returned incident report point**, not the fire perimeter or active fire edge. It is not a complete incident inventory, evacuation boundary or fire-risk classification. Reports can be delayed or incomplete. No returned reports and a failed source do not mean low risk.

### NOAA/SPC day-one storm outlook

[SPC outlooks](https://www.spc.noaa.gov/products/outlook/), [live day-one categorical GeoJSON](https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson).

Live polygons provide issue, start and expiry times and categorical thunderstorm/severe-storm labels. Future-issued, not-yet-valid and expired polygons are rejected. Cached metadata expires at the earlier of its five-minute refresh interval or polygon expiry; displayed expired polygons are removed and rechecked. A View outlook areas action fits the source geometry. Forecast outlook areas remain separate from current NWS warning polygons; an empty feed never implies an all-clear.

### Moon phase

Lunar phase and illuminated fraction are computed locally using the SunCalc v1.9.0 illumination algorithm. The phase illustration does not claim the moon's local viewing orientation or provide moonrise/moonset times. Sun times continue to use the location forecast. SunCalc's BSD-2-Clause notice is retained in `celestial.js` and `vendor/suncalc-LICENSE.txt`.

## Validation

Twenty-two unit scenarios cover existing forecast/radar behavior plus lightning units/zero/missing values, stale/distant/contained fire reports, expiry of storm polygons and known new/full-moon dates. Browser checks exercise the new sheet, wind compass, lightning rings/point samples/history/playback, saved pins, searchable layer selection, standard basemap, recent-fire distances and failed-source labels, storm overlays, Summary/Details, metric conversion and landscape safe areas. Synthetic fixtures remain test-only and are excluded from the public app artifact.

The existing quiet-refresh, timestamp/DST, future playback, alert/tracking, five viewport-size, offline and worker-upgrade suites passed. The complete cache now contains 26 required app files. Live Open-Meteo, NOAA lightning samples/images, NIFC reports and SPC polygons were also checked, with phone screenshots reviewed.

These are endpoint checks and iPhone-size Chromium browser tests. A separate Linux WebKit attempt could not launch because its environment lacks `libharfbuzz-icu.so.0`; physical iPhone/Safari certification is not claimed. The tests verify integration and data handling, not that a model outperforms every weather provider.
