# TrueCast Horizon 5.0

17 November 2026. A working, research-informed overhaul of the existing GitHub Pages app. See [HORIZON-RESEARCH.md](HORIZON-RESEARCH.md) for the product/source research and [REVIEW.md](REVIEW.md) for the validation history.

## What changed

- **A coherent visual system:** refined typography, atmospheric landscape artwork, consistent controls, surfaces, spacing and navigation across Today, Forecast, Maps, Plan and More. Today fits the standard phone safe areas without unnecessary scrolling; important warnings and larger reading preferences can require additional space.
- **An interactive forecast explorer:** drag or tap the chart, use arrow keys/Home/End, or use the existing slider/strip. Night shading follows the source's day/night values. Temperature charts show labeled axes, rain uses accumulation bars, and wind includes a separate dashed gust line. Missing samples stay gaps. Hourly weather cards retain temperatures and rain percentages across metrics.
- **Useful context:** a next-24-hour signal panel for rain chance, peak gust, warmest hour and the next available sun event. Model comparison shows a same-hour temperature range across available ECMWF/GFS/ICON guidance without presenting agreement as a probability of correctness.
- **A rebuilt outdoor planner:** complete future daylight windows, threshold checks including gusts, three non-overlapping recommendations, and Best fit/Soonest/Calmest priorities. Duration/activity/priority persist. Each result includes mean temperature, maximum rain chance, wind and gusts, a matching forecast jump and a real downloadable calendar event.
- **A smaller map control deck:** extra source/run/coverage detail is accessible through disclosures while time, observation-versus-model identity and playback remain visible. This gives the actual map more space. New bounded decoded-image buffering prepares nearby forecast/satellite/lightning frames during playback and avoids downloading a warmed frame twice. Same-view refreshes preserve the existing image node.
- **Personal preferences:** optional Stormwatch home shortcuts, explicit reduced motion, larger reading, Fahrenheit/measurement preferences and existing appearance options. Severe/Extreme local NWS warnings have a prominent Today entry; saved/unverified records and expiry are handled explicitly.
- **Delivery:** component style sources are bundled deterministically into one published stylesheet. The 27-file app shell is fingerprinted by deployment and still supports complete download-before-apply updates and offline reopen.

## Data behavior and calendar export

The planner starts at a future complete hourly sample and validates the entire duration. The calendar uses explicit UTC start/end times, preserves DST instants, escapes text and folds long UTF-8 lines. Downloaded `.ics` files can be opened in the user's calendar application. No event is silently added to an external account.

Weather signals retain unknown values. Forecast probabilities, accumulations, source-valid times and nearby station observations keep their original meanings. The new features do not add a paid provider, claim globally superior accuracy or change the existing regional coverage limits.

Image buffering retains at most four nearby decoded images, coalesces duplicate loads, protects the verified displayed frame and clears other images when changing product/layer. A failed or cancelled image cannot become a successful cached frame. Playback still waits for valid source imagery; no interpolation of storm positions is implied.

## Validation

Thirty-one unit scenarios cover the existing source/radar behavior and new future-window bounds, missing data, non-overlap/ranking, model spread, DST/calendar encoding, plot-coordinate selection, bounded image buffering, cancellation and retry behavior.

Browser checks cover touch/pointer/keyboard chart interaction, vertical scroll without accidental scrubbing, gust rendering, hourly-strip synchronization, quiet refresh, signal navigation, model spread, calendar download contents, direct planned-hour exploration, decoded-frame reuse, slow-metadata/identical-view refresh, continued playback through zoom, image failure retaining the previous timestamp, persistent preferences and severe-warning expiry. Existing warning/tropical geometry, live-weather, five viewport-size, offline and complete worker-upgrade suites remain.

Live Gatlinburg checks loaded the independent model comparison, exercised chart selection, exported an actual future calendar window, played and zoomed future map imagery, and reviewed lightning, light appearance and landscape layouts. These checks verify source integration and UI behavior, not physical iPhone/Safari certification or an accuracy benchmark.

## Development

Run `npm start` to build the stylesheet and serve locally. `npm test` also rebuilds it. Edit `style.css`, `atmosphere.css`, `observatory.css` or `horizon.css`, then run `python3 scripts/build-css.py` when working with a separately running server. `app.css` is the generated published bundle; deployment rebuilds it before fingerprinting the app shell.
