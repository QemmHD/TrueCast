import { json } from "./api.js";
import { parseMapMetadata, MAP_PRODUCTS } from "./weather-maps.js";
export const LIGHTNING_URL =
  "https://nowcoast.noaa.gov/geoserver/lightning_detection/wms";
export const FIRE_URL =
  "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query";
export const OUTLOOK_URL =
  "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.nolyr.geojson";
const memory = new Map();
async function cached(key, ttl, loader, signal) {
  const old = memory.get(key);
  if (
    old &&
    Date.now() - old.at < ttl &&
    (!old.value.expiresAt || old.value.expiresAt > Date.now())
  )
    return old.value;
  const value = await loader();
  if (!signal?.aborted) {
    memory.set(key, { at: Date.now(), value });
    if (memory.size > 40) memory.delete(memory.keys().next().value);
  }
  return value;
}
export function distanceKm(a, b) {
  const r = (x) => (x * Math.PI) / 180,
    dlat = r(b[1] - a.latitude),
    dlon = r(b[0] - a.longitude);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(r(a.latitude)) * Math.cos(r(b[1])) * Math.sin(dlon / 2) ** 2;
  return (
    6371 *
    2 *
    Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)))
  );
}
export const lightningCoverage = (p) =>
  p.latitude >= -25 &&
  p.latitude <= 80 &&
  (p.longitude <= 0 || p.longitude >= 110);
export function densityValue(body) {
  const value = body?.features?.[0]?.properties?.Band1;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value / 1000
    : null;
}
async function latestLightning(signal) {
  return cached(
    "lightning-times",
    60000,
    async () => {
      const controller = new AbortController(),
        abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(abort, 15000);
      try {
        const r = await fetch(
          `${LIGHTNING_URL}?service=WMS&version=1.3.0&request=GetCapabilities`,
          { signal: controller.signal, cache: "no-cache" },
        );
        if (!r.ok) throw new Error("Lightning source unavailable");
        const meta = parseMapMetadata(await r.text(), MAP_PRODUCTS.lightning);
        const time = meta.times.filter((t) => t <= Date.now() + 60000).at(-1);
        if (!time || Date.now() - time > 90 * 60000)
          throw new Error("Lightning source delayed");
        return time;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    },
    signal,
  );
}
export async function lightningSample(p, { time, signal } = {}) {
  if (!lightningCoverage(p))
    return { available: false, reason: "coverage", value: null, time: null };
  const valid = time || (await latestLightning(signal));
  if (
    !Number.isFinite(valid) ||
    valid > Date.now() + 60000 ||
    Date.now() - valid > 8 * 3600000
  )
    throw new Error("Invalid lightning time");
  const key = `lightning-${p.latitude.toFixed(4)}-${p.longitude.toFixed(4)}-${valid}`;
  return cached(
    key,
    300000,
    async () => {
      const layer = MAP_PRODUCTS.lightning.layer;
      const params = new URLSearchParams({
        service: "WMS",
        version: "1.1.1",
        request: "GetFeatureInfo",
        layers: layer,
        query_layers: layer,
        styles: "",
        srs: "EPSG:4326",
        bbox: [
          p.longitude - 0.05,
          p.latitude - 0.05,
          p.longitude + 0.05,
          p.latitude + 0.05,
        ].join(","),
        width: 101,
        height: 101,
        x: 50,
        y: 50,
        info_format: "application/json",
        feature_count: 1,
        time: new Date(valid).toISOString(),
      });
      const body = await json(`${LIGHTNING_URL}?${params}`, {
        signal,
        cache: "no-cache",
      });
      if (body?.type !== "FeatureCollection")
        throw new Error("Missing lightning sample");
      return {
        available: true,
        value: densityValue(body),
        time: valid,
        checkedAt: Date.now(),
      };
    },
    signal,
  );
}
export function currentFireFeatures(body, p, now = Date.now()) {
  return (body?.features || [])
    .filter((f) => {
      const c = f.geometry?.coordinates,
        t = f.properties?.ModifiedOnDateTime_dt;
      return (
        !(
          Number.isFinite(f.properties?.PercentContained) &&
          f.properties.PercentContained >= 100
        ) &&
        f.geometry?.type === "Point" &&
        c?.length >= 2 &&
        c.every(Number.isFinite) &&
        Math.abs(c[1]) <= 90 &&
        Math.abs(c[0]) <= 180 &&
        Number.isFinite(t) &&
        t <= now + 60000 &&
        now - t <= 7 * 86400000 &&
        distanceKm(p, c) <= 400
      );
    })
    .map((f) => ({ ...f, distance: distanceKm(p, f.geometry.coordinates) }))
    .sort((a, b) => a.distance - b.distance);
}
export async function fireReports(p, { signal } = {}) {
  if (p.country_code && p.country_code !== "US")
    return { available: false, features: [], complete: false };
  return cached(
    `fire-${p.latitude}-${p.longitude}`,
    300000,
    async () => {
      const q = new URLSearchParams({
        where:
          "ActiveFireCandidate=1 AND IncidentTypeCategory='WF' AND FireOutDateTime IS NULL AND (PercentContained<100 OR PercentContained IS NULL)",
        geometry: `${p.longitude},${p.latitude}`,
        geometryType: "esriGeometryPoint",
        inSR: 4326,
        spatialRel: "esriSpatialRelIntersects",
        distance: 400,
        units: "esriSRUnit_Kilometer",
        outFields:
          "IncidentName,PercentContained,IncidentSize,ModifiedOnDateTime_dt,FireDiscoveryDateTime,POOState",
        outSR: 4326,
        returnGeometry: true,
        resultRecordCount: 500,
        f: "geojson",
        orderByFields: "ModifiedOnDateTime_dt DESC",
      });
      const body = await json(`${FIRE_URL}?${q}`, { signal });
      if (body.type !== "FeatureCollection" || !Array.isArray(body.features))
        throw new Error("Missing fire reports");
      return {
        available: true,
        features: currentFireFeatures(body, p),
        complete: !(
          body.exceededTransferLimit || body.properties?.exceededTransferLimit
        ),
        checkedAt: Date.now(),
      };
    },
    signal,
  );
}
export function outlookFeatures(body, now = Date.now()) {
  return (body?.features || []).filter((f) => {
    const p = f.properties,
      issued = Date.parse(p?.ISSUE_ISO),
      start = Date.parse(p?.VALID_ISO),
      end = Date.parse(p?.EXPIRE_ISO);
    return (
      ["Polygon", "MultiPolygon"].includes(f.geometry?.type) &&
      Number.isFinite(issued) &&
      issued <= now + 60000 &&
      Number.isFinite(start) &&
      start <= now + 60000 &&
      end > now
    );
  });
}
export async function stormOutlook({ signal } = {}) {
  return cached(
    "storm-outlook",
    300000,
    async () => {
      const body = await json(OUTLOOK_URL, { signal, cache: "no-cache" });
      if (body.type !== "FeatureCollection" || !Array.isArray(body.features))
        throw new Error("Missing storm outlook");
      const features = outlookFeatures(body);
      return {
        features,
        checkedAt: Date.now(),
        expiresAt: features.length
          ? Math.min(
              ...features.map((f) => Date.parse(f.properties.EXPIRE_ISO)),
            )
          : 0,
      };
    },
    signal,
  );
}
export function lightningText(sample) {
  return !sample?.available
    ? "Outside the source coverage"
    : sample.value === null
      ? "No grid value returned"
      : sample.value > 0
        ? "Lightning detected in local grid"
        : "Zero density in this grid cell";
}

export function densityLabel(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return value > 0 && value < 0.001
    ? "<0.001"
    : value.toLocaleString("en", { maximumFractionDigits: 3 });
}
