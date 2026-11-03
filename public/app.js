import { Router } from "./router.js";
import { CATS, MINZOOM, icon, describe, distToLine, catLabel, catOne } from "./pois.js";
import { getWeather, headwind, beaufort, dirIndex, bestDeparture } from "./weather.js";
import { createFollower } from "./follow.js";
import { saved } from "./saved.js";
import { forSpeech, dual, dualText, spokenText } from "./speech.js";
import { t, setLang, getLang, locale, applyStatic, num, fmtLen, fmtDur, dict } from "./i18n.js";

const OFM = "https://tiles.openfreemap.org/styles/";
const STYLES = {
  liberty: OFM + "liberty",
  liberty2d: OFM + "liberty", // same map, flat: for older or slower devices
  bright: OFM + "bright",
  positron: OFM + "positron",
  dark: OFM + "dark",
  fiord: OFM + "fiord",
};
// Building colour per style for the 3D buildings this site adds (only Liberty has its own).
const BUILDING_3D = { bright: "#e8dfd1", positron: "#e2e2e0", dark: "#323840", fiord: "#41566b" };
const is3D = (v) => v !== "liberty2d";
const DARK_STYLES = new Set(["dark", "fiord"]);
// Same colours as --c0…--c6 in style.css.
const CLASS_COLORS = ["#1f9e6e", "#7cc576", "#3b8bd4", "#8a9bb0", "#f2a33a", "#e0523f", "#9b7b55"];
const STOP_COLORS = { start: "#1f9e6e", end: "#e5604d", via: "#5c6b7a" };
// Round trips; their names are in the language file (dict().presets), in the same order.
const PRESETS = [
  ["Hoorn", "Zwaag", "Blokker", "Hoorn"],
  ["Hoorn", "Schellinkhout", "Wijdenes", "Oosterleek", "Venhuizen", "Hoorn"],
  ["Hoorn", "Scharwoude", "Berkhout"],
  ["Hoorn", "Zwaag", "Wognum"],
  ["Hoorn", "Westwoud", "Hem"],
];
const NEAR_ROUTE = 100; // metres: "along the way"
// Typical speed per kind of scootmobiel.
const VEHICLES = { klein: { speed: 6 }, middel: { speed: 12 }, groot: { speed: 15 } };
const BLOCKED_KEY = "scootmobiel-blocked";

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
// The status line is only rewritten when its text really changes (a rewrite undoes a browser translation).
const status = (msg) => { const el = $("status"); if (el.__src !== msg) { el.__src = msg; el.textContent = msg; } };
// Icons from the inline sprite in index.html (colour gradients; decorative, so hidden from screen readers).
const ic = (name, cls = "") => `<svg class="ic${cls ? " " + cls : ""}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
// Write HTML only when it differs from what this code last wrote there. Redrawing the same text would
// throw away a browser translation (Google/Chrome replace the text nodes); unchanged text keeps it.
function put(el, html) {
  if (!el || el.__src === html) return;
  el.__src = html;
  el.innerHTML = html;
}
// Set a button's icon and label in one go (keeps the icon when the text changes).
function setBtn(btn, icon, cls, label) { btn.innerHTML = `${ic(icon, cls)} <span class="lbl">${esc(label)}</span>`; }
const phone = matchMedia("(max-width: 760px)");
// Feedback on something the rider just did: a message at the top of the screen, visible on every
// screen size (the status line at the bottom of the panel is easy to miss, especially on a phone).
let toastTimer = 0;
function say(msg, { long = false, icon = "info", tone = "teal" } = {}) {
  status(msg);
  const t = $("toast");
  t.innerHTML = ic(icon, tone) + dual(markNames(esc(msg)), msg);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), long ? 9000 : 4500);
}
$("toast").addEventListener("click", () => ($("toast").hidden = true));

// Browser translation (Google, Chrome, Safari) would turn Dutch place names into words: "Hoorn" → "Horn",
// "Nieuwe Steen" → "New Stone". Names are wrapped in translate="no"; everything around them is translated.
// A space next to a name goes inside the wrapper, because translators sometimes drop it ("ofHoorn").
let nameRe = null, nameCount = -1;
const noTr = (html) => `<span translate="no" lang="nl">${html}</span>`;
function markNames(html) {
  if (nameCount !== places.length) {
    const names = [...new Set(["Hoorn", ...places.map((p) => p.name)])].sort((a, b) => b.length - a.length)
      .map((n) => esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    nameRe = new RegExp(`(\\s?)(?<![\\p{L}\\p{N}-])(${names.join("|")})(?![\\p{L}\\p{N}-])(\\s?)`, "gu");
    nameCount = places.length;
  }
  return html.replace(nameRe, (_, a, n, b) => noTr(a + n + b));
}

// A Dutch website. Visitors who want another language use their browser's translation.
setLang("nl");
try { localStorage.removeItem("lang"); } catch { /* an older version stored a language choice */ }
applyStatic();

let router, places = [], pois = [], areas = [], lastRoute = null, activeStop = 0, weather = null, flownIn = false;
// A stop is { place } (a village name) or { lon, lat, name? } (a clicked point or a place on the map).
let stops = [{ place: "Hoorn" }, { place: "Zwaag" }];

const savedStyle = STYLES[safeGet("style")] ? safeGet("style") : "liberty";
$("style").value = savedStyle;
applyTheme(savedStyle);

// MapLibre's own control labels and tooltips, in the current language.
const mapLocale = () => ({
  "Map.Title": t("map.aria"), "Popup.Close": t("help.close"),
  "NavigationControl.ResetBearing": t("ctl.north"), "NavigationControl.ZoomIn": t("ctl.zoomIn"), "NavigationControl.ZoomOut": t("ctl.zoomOut"),
  "GeolocateControl.FindMyLocation": t("ctl.locate"), "GeolocateControl.LocationNotAvailable": t("ctl.noLocation"),
  "ScaleControl.Meters": t("u.m"), "ScaleControl.Kilometers": t("u.km"),
});

// Map credits in Dutch. The tile service's own credit line is English and can't be translated,
// so this replaces MapLibre's attribution control with the same sources.
// On a phone it folds into a small ⓘ button (shown in full for a few seconds first, and always one tap away),
// which keeps the map calm and still meets OpenStreetMap's attribution guidelines.
class MapCredits {
  onAdd(m) {
    this.el = document.createElement("div");
    this.el.className = "maplibregl-ctrl maplibregl-ctrl-attrib credits-map";
    this.el.setAttribute("translate", "no");
    this.el.innerHTML = `<button type="button" class="credits-toggle" aria-expanded="true" aria-label="${t("ctl.credits")}"><svg class="ic sky" aria-hidden="true" focusable="false"><use href="#i-info"/></svg></button>` +
      `<span class="credits-text">${creditsHtml()}</span>`;
    const btn = this.el.querySelector(".credits-toggle");
    const setOpen = (open) => { this.el.classList.toggle("open", open); btn.setAttribute("aria-expanded", open); };
    btn.addEventListener("click", () => setOpen(!this.el.classList.contains("open")));
    setOpen(true);
    const fold = () => setOpen(false);
    setTimeout(fold, 5000);
    m.once("dragstart", fold);
    return this.el;
  }
  onRemove() { this.el.remove(); }
}
const creditsHtml = () => t("credits.map", {
  osm: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  omt: '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a>',
  ofm: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
});

// "Whole route": back to an overview of the route after the close-up start view.
class OverviewControl {
  onAdd() {
    this.el = document.createElement("div");
    this.el.className = "maplibregl-ctrl maplibregl-ctrl-group overview-ctl";
    this.el.innerHTML = `<button type="button" id="overviewBtn">${ic("route", "teal")}<span class="lbl"></span></button>`;
    this.el.querySelector("button").addEventListener("click", () => lastRoute && overview(lastRoute.coords));
    return this.el;
  }
  onRemove() { this.el.remove(); }
}

// Without WebGL (old device, locked-down browser) the planner still works as a text-only
// route description; every map call then goes to a do-nothing stand-in.
const noMap = new Proxy(function () {}, { get: (_, k) => (k === "isStyleLoaded" ? () => true : noMap), apply: () => undefined });
let map;
try {
  // Opens wide over West-Friesland, then flies in to the route (the "cinematic fly-in").
  map = new maplibregl.Map({
    container: "map",
    style: STYLES[savedStyle],
    center: reduceMotion ? [5.06, 52.648] : [5.08, 52.67],
    zoom: reduceMotion ? 12.3 : 10.4,
    pitch: 0,
    maxBounds: [[4.85, 52.53], [5.32, 52.78]],
    attributionControl: false,
    locale: mapLocale(),
  });
  map.addControl(new MapCredits(), phone.matches ? "top-left" : "bottom-right");
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  map.addControl(new OverviewControl(), "top-right");
} catch {
  map = noMap;
  $("map").innerHTML = `<p class="nomap">${t("nomap")}</p>`;
  $("follow").hidden = true;
}

const follower = createFollower(map, {
  reduceMotion,
  pitch: () => (is3D($("style").value) ? 60 : 30),
  onEnd: () => setBtn($("follow"), "play", "teal", t("follow")),
});

// ---------- data ----------
// A clear loading screen on the first visit (the road network is ~1.3 MB), with a retry if it fails.
function loadData() {
  $("loading").hidden = false;
  $("loadingText").textContent = t("loading.text");
  $("loadingRetry").hidden = true;
  $("loading").classList.remove("failed");
  Promise.all(["graph", "places", "pois", "areas"].map((f) => fetch(`data/${f}.json`).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })))
    .then(([g, p, q, a]) => {
      router = new Router(g);
      places = p;
      pois = q;
      areas = a;
      readHash();
      renderStops();
      renderPresets();
      renderPoiToggles();
      renderSaved();
      renderBlockedInfo();
      showDates();
      status("");
      refreshWeather(); // also fetched (and kept for the road) before a route is planned
      // The route (and all its text) right away, without waiting for the map: a page translated by the
      // Google Translate website only translates what is there early on. The map draws it once it's ready.
      plan();
      whenStyled(() => { ensureLayers(); if (lastRoute) drawRoute(lastRoute); drawStops(); hideLoading(); });
      setTimeout(hideLoading, 8000); // never leave the rider stuck if the map style is slow or offline
      // Without a map (no WebGL) there's no style to wait for.
      if (map === noMap) hideLoading();
    })
    .catch(() => {
      status(t("status.loadfail"));
      $("loading").classList.add("failed");
      $("loadingText").textContent = navigator.onLine
        ? t("loading.fail")
        : t("loading.offline");
      $("loadingRetry").hidden = false;
      $("loadingRetry").focus();
    });
}
function hideLoading() {
  $("loading").classList.add("done");
  setTimeout(() => ($("loading").hidden = true), reduceMotion ? 0 : 400);
}
$("loadingRetry").addEventListener("click", loadData);
loadData();

function whenStyled(fn) { map.isStyleLoaded() ? fn() : map.once("idle", fn); }

// ---------- map layers ----------
const empty = () => ({ type: "FeatureCollection", features: [] });
const point = (c, props = {}) => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: c } });

function ensureLayers() {
  if (map.getSource("route") || !router) return;
  map.addSource("route", { type: "geojson", data: empty() });
  map.addSource("stops", { type: "geojson", data: empty() });
  map.addSource("me", { type: "geojson", data: empty() });
  map.addSource("here", { type: "geojson", data: empty() });
  map.addSource("obstacles", { type: "geojson", data: empty() });
  map.addSource("allObstacles", { type: "geojson", data: { type: "FeatureCollection", features: [...router.obsByEdge.values()].flat().map((o) => point([o.lon, o.lat], { kind: o.kind, hard: o.hard ? 1 : 0 })) } });
  map.addSource("pois", { type: "geojson", data: { type: "FeatureCollection", features: pois.map((p, i) => point([p.lon, p.lat], { c: p.c, i })) } });

  // Every obstacle, faint, once you zoom in close.
  map.addLayer({ id: "obstacles-all", type: "circle", source: "allObstacles", minzoom: 15, paint: { "circle-radius": 4, "circle-color": ["case", ["==", ["get", "hard"], 1], "#d73027", "#f39c12"], "circle-opacity": 0.55, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });

  map.addLayer({ id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 6, 16, 14], "line-opacity": 0.9 } });
  const routeColor = ["match", ["get", "cls"], 0, CLASS_COLORS[0], 1, CLASS_COLORS[1], 2, CLASS_COLORS[2], 3, CLASS_COLORS[3], 4, CLASS_COLORS[4], 5, CLASS_COLORS[5], CLASS_COLORS[6]];
  const routeWidth = ["interpolate", ["linear"], ["zoom"], 11, 3.5, 16, 9];
  map.addLayer({ id: "route-line", type: "line", source: "route", filter: ["!=", ["get", "unpaved"], 1], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": routeColor, "line-width": routeWidth } });
  // Unpaved stretches dashed, so they stand out without relying on colour alone.
  map.addLayer({ id: "route-unpaved", type: "line", source: "route", filter: ["==", ["get", "unpaved"], 1], paint: { "line-color": routeColor, "line-width": routeWidth, "line-dasharray": [1.2, 1] } });

  for (const cat of Object.keys(CATS)) {
    map.addLayer({
      id: `poi-${cat}`, type: "symbol", source: "pois", filter: ["==", ["get", "c"], cat], minzoom: MINZOOM[cat],
      layout: { "icon-image": `poi-${cat}`, "icon-size": CATS[cat].small ? 0.6 : 0.85, "icon-allow-overlap": !CATS[cat].small, "icon-ignore-placement": !CATS[cat].small, visibility: poiOn(cat) ? "visible" : "none" },
    });
  }

  map.addLayer({ id: "obstacles", type: "circle", source: "obstacles", paint: { "circle-radius": 8, "circle-color": ["case", ["==", ["get", "hard"], 1], "#d73027", "#f39c12"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "obstacles-label", type: "symbol", source: "obstacles", layout: { "text-field": "!", "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
  map.addLayer({ id: "stops", type: "circle", source: "stops", paint: { "circle-radius": 9, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
  map.addLayer({ id: "stops-label", type: "symbol", source: "stops", layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
  // How accurate the found location is: a light circle in metres around the "Jij bent hier" marker.
  map.addLayer({ id: "here-accuracy", type: "fill", source: "here", paint: { "fill-color": "#3b8bd4", "fill-opacity": 0.12 } });
  map.addLayer({ id: "here-accuracy-line", type: "line", source: "here", paint: { "line-color": "#3b8bd4", "line-opacity": 0.5, "line-width": 1.5 } });
  if (hereData) map.getSource("here").setData(hereData);
  map.addLayer({ id: "me-glow", type: "circle", source: "me", paint: { "circle-radius": 18, "circle-color": "#ffc94d", "circle-opacity": 0.25, "circle-blur": 0.6 } });
  map.addLayer({ id: "me", type: "circle", source: "me", paint: { "circle-radius": 7, "circle-color": "#0d7a6b", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
}

// Icons are drawn on demand, also after a style switch wipes them.
map.on("styleimagemissing", (e) => {
  const cat = e.id.startsWith("poi-") && e.id.slice(4);
  if (CATS[cat]) map.addImage(e.id, icon(cat), { pixelRatio: 2 });
});

// 3D buildings in every style: Liberty has them; for the others they're added from the same
// OpenMapTiles "building" data, below the labels. "Kleur (2D)" hides them for a flat map.
function apply3D(v) {
  const layers = map.getStyle()?.layers || [];
  for (const l of layers) {
    if (l.type !== "fill-extrusion") continue;
    map.setLayoutProperty(l.id, "visibility", is3D(v) ? "visible" : "none");
    map.setLayerZoomRange(l.id, 12.5, 24); // Liberty starts at 14: too far in to see them on a route overview
  }
  if (!is3D(v) || layers.some((l) => l.type === "fill-extrusion") || !BUILDING_3D[v]) return;
  const firstLabel = layers.find((l) => l.type === "symbol")?.id;
  map.addLayer({
    id: "buildings-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 12.5,
    filter: ["!=", ["get", "hide_3d"], true],
    paint: {
      "fill-extrusion-color": BUILDING_3D[v],
      "fill-extrusion-height": ["coalesce", ["get", "render_height"], 5],
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.85,
      "fill-extrusion-vertical-gradient": true,
    },
  }, firstLabel);
}

// After a style switch: re-add our layers once the new style is completely loaded.
map.on("style.load", () => {
  apply3D($("style").value);
  if (router && !map.getSource("route")) { ensureLayers(); if (lastRoute) drawRoute(lastRoute); drawStops(); }
});

const CLICKABLE = () => ["obstacles", "obstacles-all", ...Object.keys(CATS).map((c) => `poi-${c}`), "route-line", "route-unpaved"].filter((l) => map.getLayer(l));
map.on("mousemove", (ev) => {
  if (!router) return;
  map.getCanvas().style.cursor = map.queryRenderedFeatures(ev.point, { layers: CLICKABLE() }).length ? "pointer" : "";
});

map.on("click", (ev) => {
  if (!router) return;
  const hit = map.queryRenderedFeatures([[ev.point.x - 6, ev.point.y - 6], [ev.point.x + 6, ev.point.y + 6]], { layers: CLICKABLE() })[0];
  if (hit?.layer.id.startsWith("route-")) return showRoutePopup(ev.lngLat);
  if (hit) return showPopup(hit);
  const s = router.snap(ev.lngLat.lng, ev.lngLat.lat);
  if (!s) return say(t("msg.noPath"), { icon: "alert", tone: "sun" });
  showPointChoice(s.point);
});

// A tap on the map asks what the point is: start (A), destination (B) or an extra stop.
function showPointChoice(pt) {
  popup?.remove();
  const name = placeName(pt[0], pt[1]);
  const stop = { lon: +pt[0].toFixed(5), lat: +pt[1].toFixed(5), name };
  const el = document.createElement("div");
  el.className = "pop";
  el.innerHTML = `<strong>${markNames(esc(name))}</strong>
    <div class="row"><button type="button" data-a="from">${t("pop.from")}</button><button type="button" class="ghost" data-a="to">${t("pop.toB")}</button>
    <button type="button" class="ghost" data-a="via">${t("pop.via")}</button></div>`;
  el.addEventListener("click", (e) => {
    const a = e.target.closest("button")?.dataset.a;
    if (!a) return;
    if (a === "from") stops[0] = stop;
    else if (a === "to") stops[stops.length - 1] = stop;
    else stops.splice(stops.length - 1, 0, stop);
    popup.remove();
    renderStops(); plan();
  });
  popup = new maplibregl.Popup({ offset: 8, maxWidth: "280px" }).setLngLat(pt).setDOMContent(el).addTo(map);
  el.querySelector("button").focus();
}

let popup = null;
function showPopup(f) {
  popup?.remove();
  const el = document.createElement("div");
  el.className = "pop";
  const c = f.geometry.coordinates;
  let name;
  if (f.layer.id.startsWith("poi-")) {
    const p = pois[f.properties.i];
    const d = describe(p);
    name = d.title;
    el.innerHTML = `<strong translate="no" lang="nl">${esc(d.title)}</strong><small>${esc(d.sub)}</small>${d.bits.map((b) => `<span>${esc(b)}</span>`).join("")}`;
  } else {
    name = t(`obs${f.properties.kind}`);
    el.innerHTML = `<strong>${esc(name)}</strong><span>${t(f.properties.hard ? "obs.hard" : "obs.soft")}</span><small>${t("obs.source")}</small>`;
  }
  if (f.layer.id.startsWith("poi-")) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<button type="button" data-a="via">${t("pop.via")}</button><button type="button" class="ghost" data-a="to">${t("pop.to")}</button>`;
    row.addEventListener("click", (e) => {
      const a = e.target.dataset.a;
      if (!a) return;
      const stop = { lon: +c[0].toFixed(5), lat: +c[1].toFixed(5), name };
      if (a === "via") stops.splice(stops.length - 1, 0, stop);
      else stops[stops.length - 1] = stop;
      popup.remove();
      renderStops(); plan();
    });
    el.appendChild(row);
  }
  popup = new maplibregl.Popup({ offset: 12, maxWidth: "260px" }).setLngLat(c).setDOMContent(el).addTo(map);
}

// Tapping the route: "couldn't get through here" → avoid that stretch from now on (this browser only).
function showRoutePopup(ll) {
  popup?.remove();
  const s = router.snap(ll.lng, ll.lat);
  if (!s) return;
  const el = document.createElement("div");
  el.className = "pop";
  const name = router.names[router.eName[s.e]];
  el.innerHTML = `<strong>${t("pop.blockQ")}</strong><span>${name ? `<span translate="no" lang="nl">${esc(name)}</span>, ` : ""}${t(`cls${router.eCls[s.e]}`)}</span>
    <div class="row"><button type="button" data-a="block">${t("pop.block")}</button>
    <a class="btnlink" href="https://www.openstreetmap.org/note/new#map=19/${s.point[1].toFixed(5)}/${s.point[0].toFixed(5)}" target="_blank" rel="noopener">${t("pop.report")}</a></div>`;
  el.querySelector("[data-a=block]").addEventListener("click", () => {
    const list = blockedPoints();
    list.push([+s.point[0].toFixed(5), +s.point[1].toFixed(5)]);
    safeSet(BLOCKED_KEY, JSON.stringify(list));
    popup.remove();
    renderBlockedInfo();
    say(t("blocked.done"));
    plan();
  });
  popup = new maplibregl.Popup({ offset: 8, maxWidth: "270px" }).setLngLat(s.point).setDOMContent(el).addTo(map);
}
function blockedPoints() {
  try { const v = JSON.parse(safeGet(BLOCKED_KEY)); return Array.isArray(v) ? v : []; } catch { return []; }
}
// Stored as points, not edge numbers, so they survive a rebuild of the road data.
function blockedEdges() {
  const set = new Set();
  for (const [lon, lat] of blockedPoints()) { const s = router.snap(lon, lat); if (s && s.d < 5) set.add(s.e); }
  return set;
}
function renderBlockedInfo() {
  const n = blockedPoints().length;
  $("blockedInfo").hidden = !n;
  $("blockedInfo").innerHTML = n ? `${t("blocked.info", { n })} <button type="button" class="link" id="unblock">${t("blocked.reset")}</button>` : "";
  $("unblock")?.addEventListener("click", () => { safeSet(BLOCKED_KEY, "[]"); renderBlockedInfo(); plan(); });
}

// ---------- planning ----------
function stopCoord(s) {
  if (s.place) {
    const p = places.find((x) => x.name === s.place);
    return p ? [p.lon, p.lat] : null;
  }
  return [s.lon, s.lat];
}
// The stop's name as HTML for the page: place and street names protected from browser translation,
// the words around them ("Fietspad bij …", "Mijn locatie") left translatable.
function stopLabelHtml(s) {
  if (s.place) return noTr(esc(s.place));
  if (s.name === "__me") return esc(t("here.me"));
  if (s.name && s.name !== placeName(s.lon, s.lat)) return markNames(esc(s.name));
  const p = placeParts(s.lon, s.lat);
  if (p.street) return noTr(esc(p.street)) + (p.near && !p.street.includes(p.near) ? `, ${noTr(esc(p.near))}` : "");
  return p.near ? t(p.area ? "place.in" : "place.near", { kind: esc(p.kind), near: noTr(esc(p.near)) }) : esc(p.kind);
}
// "Mijn locatie" is stored as a marker, so it shows in the reader's own language.
function stopLabel(s) { return s.place || (s.name === "__me" ? t("here.me") : s.name) || placeName(s.lon, s.lat); }

// A readable name for a point on the map, worked out from data the site already has (no lookup service):
// the street it's on plus the nearest village, e.g. "Grote Oost, Hoorn" or "Fietspad bij Zwaag".
function placeName(lon, lat) {
  const p = placeParts(lon, lat);
  if (p.street) return p.near && !p.street.includes(p.near) ? `${p.street}, ${p.near}` : p.street;
  return p.near ? t(p.area ? "place.in" : "place.near", { kind: p.kind, near: p.near }) : p.kind;
}
function placeParts(lon, lat) {
  const s = router?.snap(lon, lat);
  const street = s && s.d < 60 ? router.names[router.eName[s.e]] : "";
  // Inside a known neighbourhood ("Kersenboogerd-Zuid")? Otherwise the nearest town, village or hamlet.
  const area = areas.find((ar) => ar.rings.some((r) => inRing([lon, lat], r)));
  let near = area?.name || "";
  if (!near) {
    let village = null;
    for (const p of places) {
      if (p.kind === "wijk") continue;
      // Hamlets only when you're practically in them; otherwise the nearest town or village.
      const d = haversine([lon, lat], [p.lon, p.lat]) * (p.kind === "hamlet" ? 3 : 1);
      if (!village || d < village.d) village = { name: p.name, d };
    }
    near = village && village.d < 6000 ? village.name : "";
  }
  // Everyday words instead of the route-type names (fietspad, voetpad, woonstraat, erf/ventweg, …).
  const kind = s ? t(`place${[0, 1, 2, 3, 3, 3, 6][router.eCls[s.e]]}`) : t("placeSpot");
  return { street, near, kind, area: !!area };
}
const inRing = (pt, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < ((r[j][0] - r[i][0]) * (pt[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
};


function plan() {
  if (!router) return;
  stopFollow();
  writeHash();
  drawStops();
  const coords = stops.map(stopCoord);
  if (coords.some((c) => !c)) return;
  const prof = $("profile").value, avoid = $("avoid").checked, blocked = blockedEdges();
  const snaps = coords.map((c) => router.snap(c[0], c[1]));
  if (snaps.some((s) => !s)) return say(t("msg.tooFar"), { icon: "alert", tone: "sun" });
  const t0 = performance.now();
  const legs = [];
  for (let i = 0; i < snaps.length - 1; i++) {
    const r = router.route(snaps[i], snaps[i + 1], prof, avoid, blocked);
    if (!r) return say(t("msg.noRoute", { a: stopLabel(stops[i]), b: stopLabel(stops[i + 1]) }));
    legs.push(r);
  }
  const legStarts = [];
  const all = [];
  legs.forEach((l, i) => { legStarts.push(all.length); all.push(...(i ? l.coords.slice(1) : l.coords)); });
  const route = {
    coords: all,
    legStarts,
    pieces: legs.flatMap((l) => l.pieces),
    len: legs.reduce((s, l) => s + l.len, 0),
    obstacles: legs.flatMap((l) => l.obstacles),
  };
  lastRoute = route;
  if (map.isStyleLoaded()) ensureLayers(); // otherwise the map adds the layers when its style is ready
  drawRoute(route);
  showResult(route);
  status(t("status.planned", { ms: Math.round(performance.now() - t0) }));
  startView(route.coords);
  saved.addRecent(routeName(), location.hash);
  renderSaved();
  refreshWeather();
}

function drawRoute(route) {
  map.getSource("route")?.setData({
    type: "FeatureCollection",
    features: route.pieces.map((p) => ({ type: "Feature", properties: { cls: p.cls, unpaved: p.flags & 1 }, geometry: { type: "LineString", coordinates: p.coords } })),
  });
  map.getSource("obstacles")?.setData({ type: "FeatureCollection", features: route.obstacles.map((o) => point([o.lon, o.lat], { kind: o.kind, hard: o.hard ? 1 : 0 })) });
}

function drawStops() {
  const features = stops.map((s, i) => {
    const c = stopCoord(s);
    if (!c) return null;
    const end = i === stops.length - 1, start = i === 0;
    return point(c, { label: start ? "A" : end ? "B" : String(i), color: start ? STOP_COLORS.start : end ? STOP_COLORS.end : STOP_COLORS.via });
  }).filter(Boolean);
  map.getSource("stops")?.setData({ type: "FeatureCollection", features });
}

// The start: close in at A, tilted and looking along the first stretch of the route, so the 3D buildings
// are clearly visible. "Whole route" (a map button) shows the overview.
function startView(coords) {
  const a = coords[0];
  let i = 1, d = 0;
  while (i < coords.length - 1 && d < 250) { d += haversine(coords[i - 1], coords[i]); i++; }
  const look = coords.length > 1 ? bearing(a, coords[i]) : 0;
  // Put A in the lower part of the visible map, so the road ahead fills the view.
  const sheetTop = phone.matches ? $("panel").getBoundingClientRect().top : innerHeight;
  const visible = sheetTop;
  const offset = [0, Math.round((sheetTop - innerHeight) / 2 + visible * 0.2)];
  const cam = { center: a, zoom: 16.7, pitch: is3D($("style").value) ? 62 : 0, bearing: look, offset };
  if (!flownIn && !reduceMotion) { flownIn = true; map.flyTo({ ...cam, duration: 3400, essential: false }); return; }
  flownIn = true;
  map.easeTo({ ...cam, duration: reduceMotion ? 0 : 1000 });
}

function overview(coords) {
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  coords.forEach((c) => b.extend(c));
  // On a phone, keep the route clear of the message at the top and the sheet at the bottom.
  const sheetTop = phone.matches ? $("panel").getBoundingClientRect().top : innerHeight;
  // Right side: room for the zoom buttons, so the route's end never hides under them.
  const padding = phone.matches ? { top: 56, bottom: Math.max(40, innerHeight - sheetTop + 28), left: 16, right: 56 } : { top: 40, bottom: 40, left: 40, right: 80 };
  const bearing = flownIn ? map.getBearing() : -12;
  const cam = map.cameraForBounds(b, { padding, bearing, maxZoom: 17 });
  if (!cam) return;
  // A bit closer than an exact fit: the route fills the view and the 3D buildings show.
  const zoom = Math.min(17, cam.zoom + 0.25);
  const pitch = is3D($("style").value) ? (phone.matches ? 45 : 55) : 0;
  if (!flownIn && !reduceMotion) {
    // First route of the visit: a slow, tilted fly-in.
    flownIn = true;
    map.flyTo({ center: cam.center, zoom, pitch, bearing, duration: 3200, essential: false });
    return;
  }
  flownIn = true;
  map.easeTo({ center: cam.center, zoom, duration: reduceMotion ? 0 : 900 });
}

// ---------- result panel ----------
function showResult(route) {
  // A round trip already ends where it started, so "also ride back" doesn't apply.
  const c = route.coords, loop = haversine(c[0], c[c.length - 1]) < 300;
  const retour = $("retour").checked && !loop;
  $("retour").disabled = loop;
  $("retour").parentElement.title = loop ? t("retour.loop") : "";
  const kmOut = route.len / 1000;
  const km = kmOut * (retour ? 2 : 1);
  const speed = VEHICLES[$("vehicle").value].speed;
  const mins = Math.round((km / speed) * 60);
  // Arrival (or back home, for there and back) if you leave now.
  const arrive = new Date(Date.now() + mins * 60000).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

  $("result").hidden = false;
  const distText = `${num(km)} ${t("u.km")}`;
  const timeText = fmtDur(mins);
  put($("rDist"), dualText(distText));
  put($("rTime"), dualText(timeText));
  put($("rArrive"), dualText(arrive));
  // Only when it changes: the label was already filled (and maybe translated) from the HTML.
  const arriveKey = retour ? "stat.back" : "stat.arrive";
  if ($("rArriveLabel").dataset.i18n !== arriveKey) { $("rArriveLabel").dataset.i18n = arriveKey; $("rArriveLabel").textContent = t(arriveKey); }
  requestAnimationFrame(measurePeek);
  put($("summaryText"), dual(t("summary.line", { dist: `<b>${esc(distText)}</b>`, time: esc(timeText), arrive: esc(arrive) }), t("summary.spoken", { dist: distText, time: timeText, arrive })));

  const byCls = new Array(router.classes.length).fill(0);
  let unpaved = 0, busy = 0;
  for (const p of route.pieces) { byCls[p.cls] += p.len; if (p.flags & 1) unpaved += p.len; if (p.cls === 5) busy += p.len; }
  put($("mix"), byCls.map((m, c) => (m ? `<span style="flex:${m};background:${CLASS_COLORS[c]}"></span>` : "")).join(""));
  put($("mixLegend"), byCls.map((m, c) => (m / route.len > 0.01 ? `<li><i style="background:${CLASS_COLORS[c]}"></i>${t(`cls${c}`)} ${Math.round((m / route.len) * 100)}%</li>` : "")).join(""));

  // Weather line.
  if (weather) {
    const w = weather;
    const parts = [t("wx.line", { ms: Math.round(w.wind), bft: beaufort(w.wind), dir: t(`dir${dirIndex(w.from)}`), temp: Math.round(w.temp) })];
    const hw = headwind(route.coords, w);
    if (hw > 1) parts.push(t("wx.head") + (retour ? ` ${t("wx.headBack")}` : ""));
    else if (hw < -1) parts.push(t("wx.tail") + ` ${t(retour ? "wx.tailBack" : "wx.tailWarn")}`);
    else parts.push(t("wx.side"));
    if (w.temp < 5) parts.push(t("wx.cold"));
    if (w.rainChance >= 50) parts.push(t("wx.rain", { p: w.rainChance }));
    // Offline: the forecast kept from the last time online, and when that was.
    if (w.savedAt) parts.push(t("wx.saved", { time: new Date(w.savedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) }));
    put($("weather"), ic("wind", "sky") + dualText(parts.join(" ")));
    $("weather").hidden = false;
    const best = bestDeparture(route.coords, w, retour);
    $("best").hidden = !best;
    if (best) put($("best"), ic("clock", "sun") + dualText(best.rain < best.nowRain ? t("wx.bestRain", { time: best.time, p: best.rain }) : t("wx.best", { time: best.time })));
  } else { $("weather").hidden = true; $("best").hidden = true; }

  const warns = [];
  if (weather && weather.gust > 14) warns.push(t("warn.gust", { ms: Math.round(weather.gust) }));
  if (unpaved > 50) warns.push(t("warn.unpaved", { m: fmtLen(unpaved) }));
  if (busy > 100) warns.push(t("warn.busy", { m: fmtLen(busy) }));
  $("warn").hidden = !warns.length;
  put($("warn"), ic("alert", "sun") + dualText(warns.join(" ")));
  renderGist(route, byCls, busy);

  renderObstacles(route);
  renderAlong(route);
  renderSteps(route);
  updateSaveButton();
}

// One plain sentence with what matters most; the details sit under "Meer over deze route".
function renderGist(route, byCls, busy) {
  const share = (n) => n / route.len;
  const paths = Math.round(share(byCls[0] + byCls[1]) * 100);
  const quiet = share(byCls[0] + byCls[1] + byCls[2]) >= 0.75;
  let text = t(quiet ? "gist.quiet" : busy > 100 ? "gist.busy" : "gist.mixed", { p: paths });
  const hard = route.obstacles.filter((o) => o.hard).length;
  if (hard) text += " " + t("gist.hard", { n: hard });
  if (weather) {
    const hw = headwind(route.coords, weather);
    text += hw > 1 ? ` ${t("gist.headwind")}` : hw < -1 ? ` ${t("gist.tailwind")}` : "";
    if (weather.rainChance >= 50) text += ` ${t("gist.rain")}`;
  }
  put($("gist"), ic(hard ? "alert" : "check", hard ? "sun" : "teal") + dualText(text));
}

function renderObstacles(route) {
  const box = $("obstacles");
  const obs = route.obstacles;
  if (!obs.length) {
    box.hidden = false;
    box.innerHTML = `<p class="ok">${ic("check", "teal")} ${t("obs.none")}</p>`;
    return;
  }
  const counts = {};
  for (const o of obs) { const l = t(`obs${o.kind}`); counts[l] = (counts[l] || 0) + 1; }
  const hard = obs.filter((o) => o.hard);
  const list = Object.entries(counts).map(([l, n]) => `${n}× ${l}`).join(", ");
  let html = `<p>${dual(`<strong>${t("obs.list")}</strong> ${esc(list)}.`, `${t("obs.list")} ${list}.`)}</p>`;
  if (hard.length) {
    html += `<p>${t("obs.hardCount", { n: hard.length })} ${t($("avoid").checked ? "obs.noWay" : "obs.turnOn")}</p>`;
    html += `<div class="row">${hard.slice(0, 6).map((o, i) => `<button type="button" class="ghost small" data-o="${i}">${esc(t("obs.show", { label: t(`obs${o.kind}`) }))}</button>`).join("")}</div>`;
  }
  box.innerHTML = html;
  box.hidden = false;
  box.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
    const o = hard[+b.dataset.o];
    if (phone.matches) setSheet("peek");
    map.flyTo({ center: [o.lon, o.lat], zoom: 18, duration: reduceMotion ? 0 : 1200 });
  }));
}

function nearRoute(route, cat) {
  const c = route.coords;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of c) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const pad = 0.002;
  return pois.filter((p) => p.c === cat && p.lon > minX - pad && p.lon < maxX + pad && p.lat > minY - pad && p.lat < maxY + pad)
    .map((p) => ({ p, ...distToLine(p.lon, p.lat, c) }))
    .filter((x) => x.d <= NEAR_ROUTE);
}

function renderAlong(route) {
  const parts = ["toilet", "bankje", "supermarkt", "apotheek"].map((cat) => {
    const n = nearRoute(route, cat).length;
    return n ? t(`along.${cat}`, { n }) : null;
  }).filter(Boolean);
  $("along").hidden = false;
  put($("along"), ic("pin", "violet") + dualText(parts.length ? t("along.some", { m: fmtLen(NEAR_ROUTE), list: parts.join(", ") }) : t("along.none", { m: fmtLen(NEAR_ROUTE) })));
}

const haversine = (a, b) => {
  const k = Math.PI / 180, x = (b[0] - a[0]) * k * Math.cos(((a[1] + b[1]) / 2) * k), y = (b[1] - a[1]) * k;
  return Math.hypot(x, y) * 6371008.8;
};

// A landmark at the start of a step ("bij Albert Heijn") makes directions easier to confirm on the street.
function landmarkAt(c) {
  let best = null;
  for (const p of pois) {
    if (p.c === "bankje" || !p.n) continue;
    if (Math.abs(p.lat - c[1]) > 0.0006 || Math.abs(p.lon - c[0]) > 0.001) continue;
    const d = haversine(c, [p.lon, p.lat]);
    if (d < 50 && (!best || d < best.d)) best = { d, name: p.n };
  }
  return best?.name;
}

function renderSteps(route) {
  // One step per street; unnamed paths are grouped by kind, and short bits fold into their neighbour.
  const steps = [];
  for (const p of route.pieces) {
    const last = steps[steps.length - 1];
    const same = last && (p.name ? last.name === p.name : !last.name && last.cls === p.cls);
    if (same || (last && p.len < 60)) { last.len += p.len; last.coords.push(...p.coords); }
    else steps.push({ name: p.name, cls: p.cls, len: p.len, coords: [...p.coords] });
  }
  const merged = [];
  for (const s of steps) {
    const last = merged[merged.length - 1];
    if (last && (s.name ? last.name === s.name : !last.name && last.cls === s.cls)) { last.len += s.len; last.coords.push(...s.coords); }
    else merged.push(s);
  }
  put($("steps"), merged.map((s, i) => {
    const turn = i ? turnWord(merged[i - 1].coords, s.coords) : t("step.start");
    const kind = t(`cls${s.cls}`);
    const mark = i ? landmarkAt(s.coords[0]) : null;
    const turnHtml = mark ? t("step.at", { turn, mark: `<span translate="no" lang="nl">${esc(mark)}</span>` }) : turn;
    const turnPlain = mark ? t("step.at", { turn, mark }) : turn;
    const html = t(s.name ? "step.via" : "step.over", { turn: turnHtml, where: s.name ? `<strong translate="no" lang="nl">${esc(s.name)}</strong>` : kind }) + ` <small>(${fmtLen(s.len)}, ${kind})</small>`;
    const plain = t(s.name ? "step.via" : "step.over", { turn: turnPlain, where: s.name || kind }) + `, ${fmtLen(s.len)}, ${kind}.`;
    return `<li>${dual(html, plain)}</li>`;
  }).join("") + `<li>${dual(t("step.arrive", { place: `<span translate="no" lang="nl">${esc(stopLabel(stops[stops.length - 1]))}</span>` }), t("step.arrive", { place: stopLabel(stops[stops.length - 1]) }) + ".")}</li>`);
}

function turnWord(prev, next) {
  const a = bearing(prev[Math.max(0, prev.length - 2)], prev[prev.length - 1]);
  const b = bearing(next[0], next[Math.min(1, next.length - 1)]);
  const d = ((b - a + 540) % 360) - 180;
  if (Math.abs(d) < 30) return t("step.straight");
  if (Math.abs(d) > 150) return t("step.back");
  return t(d > 0 ? (d > 100 ? "step.sharpRight" : "step.right") : d < -100 ? "step.sharpLeft" : "step.left");
}
const bearing = (p, q) => (Math.atan2((q[0] - p[0]) * Math.cos((p[1] * Math.PI) / 180), q[1] - p[1]) * 180) / Math.PI;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function refreshWeather() {
  try {
    const w = await getWeather(); // online: fresh (and kept for 24 h); offline: the kept forecast
    const changed = !weather || w !== weather;
    weather = w;
    if (changed && lastRoute) showResult(lastRoute);
  } catch { /* no weather: the route works the same, just without the wind line */ }
}

// ---------- toilet on the way ----------
$("toilet").addEventListener("click", addToilet);
function addToilet() {
  if (!lastRoute) return;
  const c = lastRoute.coords;
  // Nearest toilet to the route; a wheelchair-accessible one may be a bit further away.
  let best = null;
  for (const p of pois) {
    if (p.c !== "toilet" || p.w === "no") continue;
    const { d, at } = distToLine(p.lon, p.lat, c, 2);
    const score = d * (p.w === "yes" ? 0.6 : 1);
    if (!best || score < best.score) best = { p, d, at, score };
  }
  if (!best || best.d > 3000) return say(t("toilet.none"), { icon: "alert", tone: "sun" });
  const leg = lastRoute.legStarts.filter((s) => s <= best.at).length - 1;
  const name = best.p.n ? t("toilet.named", { name: best.p.n }) : t(best.p.w === "yes" ? "toilet.wheel" : "toilet.public");
  stops.splice(leg + 1, 0, { lon: best.p.lon, lat: best.p.lat, name });
  renderStops();
  plan();
  say(t("toilet.added", { name, m: fmtLen(best.d) }), { long: true, icon: "toilet", tone: "sky" });
  showMapOnPhone();
}

// ---------- stops UI ----------
// Each stop is a large button that opens the place picker (search + grouped list).
function renderStops() {
  $("stopList").innerHTML = stops.map((s, i) => {
    const start = i === 0, end = i === stops.length - 1;
    const label = start ? t("stop.from") : end ? t("stop.to") : t("stop.via", { n: i });
    return `<div class="stop${i === activeStop ? " active" : ""}">
      <span class="pin ${start ? "start" : end ? "end" : ""}" aria-hidden="true">${start ? "A" : end ? "B" : i}</span>
      <button type="button" class="stop-pick" data-i="${i}" aria-label="${esc(t("stop.change", { label, value: stopLabel(s) }))}">
        <small>${label}</small><span>${stopLabelHtml(s)}</span>${ic("search")}
      </button>
      ${!start && !end ? `<button type="button" class="stop-rm" data-rm="${i}" aria-label="${esc(t("stop.remove", { label }))}">${ic("close")}</button>` : "<span></span>"}
    </div>`;
  }).join("");
  $("stopList").querySelectorAll(".stop-pick").forEach((b) => b.addEventListener("click", () => openPicker(+b.dataset.i, b)));
  $("stopList").querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    stops.splice(+b.dataset.rm, 1);
    activeStop = Math.min(activeStop, stops.length - 1);
    renderStops(); plan();
  }));
}
function markActive() {
  $("stopList").querySelectorAll(".stop").forEach((el, i) => el.classList.toggle("active", i === activeStop));
}

// ---------- place picker ----------
let pickFor = 0, pickReturn = null;
const fold = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function openPicker(i, from) {
  pickFor = i; pickReturn = from || null;
  activeStop = i; markActive();
  $("pickerTitle").textContent = i === 0 ? t("picker.from") : i === stops.length - 1 ? t("picker.to") : t("stop.via", { n: i });
  $("pickerInput").value = "";
  renderPicker("");
  $("picker").showModal();
  // On phones the keyboard would cover half the list; focus the search there only on request.
  if (!phone.matches) $("pickerInput").focus();
}
function renderPicker(q) {
  const f = fold(q);
  const groups = new Map();
  for (const p of places) {
    if (f && !fold(p.name).includes(f) && !fold(p.group).includes(f)) continue;
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push(p);
  }
  const order = [...groups.keys()].sort((a, b) => (a === "Hoorn" ? -1 : b === "Hoorn" ? 1 : a.localeCompare(b, "nl")));
  let n = 0;
  // Place names are Dutch (lang="nl"); the small description is in the reader's language.
  const row = (value, label, sub, icon, tone, name = true) => { n++; return `<li><button type="button" data-v="${esc(value)}">${ic(icon, tone)}<span>${name ? noTr(esc(label)) : esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</span></button></li>`; };
  let html = pickFor === 0 && !f ? `<ul class="pick-group">${row("__here", t("picker.here"), t("picker.hereSub"), "pin", "sky", false)}</ul>` : "";
  for (const g of order) {
    const list = groups.get(g);
    const head = list.find((p) => p.name === g);
    const rest = list.filter((p) => p !== head).sort((a, b) => (b.kind === "wijk") - (a.kind === "wijk") || a.name.localeCompare(b.name, "nl"));
    html += `<h3 class="pick-head">${noTr(esc(g))}</h3><ul class="pick-group">`;
    if (head) html += row(head.name, head.name, rest.length ? t(head.kind === "town" ? "picker.centre" : "picker.village") : "", "pin", "teal");
    for (const p of rest) html += row(p.name, p.name, t(p.kind === "wijk" ? "picker.wijk" : "picker.hamlet"), "pin", p.kind === "wijk" ? "violet" : "sun");
    html += "</ul>";
  }
  $("pickerList").innerHTML = html || `<p class="pick-none">${esc(t("picker.none", { q }))}</p>`;
  $("pickerCount").textContent = f ? t("picker.count", { n }) : "";
}
$("pickerInput").addEventListener("input", () => renderPicker($("pickerInput").value));
$("pickerInput").addEventListener("keydown", (e) => {
  // Enter picks the first match.
  if (e.key === "Enter") { e.preventDefault(); $("pickerList").querySelector("button")?.click(); }
});
$("pickerList").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-v]");
  if (!b) return;
  $("picker").close();
  if (b.dataset.v === "__here") return locate();
  stops[pickFor] = { place: b.dataset.v };
  activeStop = Math.min(pickFor + 1, stops.length - 1);
  renderStops(); plan(); showMapOnPhone();
});
$("picker").addEventListener("close", () => {
  // Back to the stop that opened it (the list was re-rendered, so find it again).
  const again = $("stopList").querySelector(`.stop-pick[data-i="${pickFor}"]`) || pickReturn;
  again?.focus();
});

function renderPresets() {
  const have = new Set(places.map((p) => p.name));
  const names = dict().presets;
  const usable = PRESETS.map((stops, i) => ({ stops, label: names[i] })).filter((p) => p.stops.every((s) => have.has(s)));
  $("presets").innerHTML = usable.map((p, i) => `<button type="button" data-p="${i}"><span class="lbl">${markNames(esc(p.label))}</span></button>`).join("");
  $("presets").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    stops = usable[+b.dataset.p].stops.map((place) => ({ place }));
    activeStop = 0; renderStops(); plan(); showMapOnPhone();
  }));
}

// ---------- places toggles ----------
function poiOn(cat) {
  const v = safeGet(`poi-${cat}`);
  return v === null ? CATS[cat].on : v === "1";
}
function renderPoiToggles() {
  const present = new Set(pois.map((p) => p.c));
  $("poiToggles").innerHTML = Object.entries(CATS).filter(([cat]) => present.has(cat)).map(([cat, c]) =>
    `<label class="check"><input type="checkbox" data-cat="${cat}" ${poiOn(cat) ? "checked" : ""}/> <i class="dot" style="background:${c.color}"></i>${catLabel(cat)}</label>`).join("");
  $("poiToggles").querySelectorAll("input").forEach((el) => el.addEventListener("change", () => {
    const cat = el.dataset.cat;
    safeSet(`poi-${cat}`, el.checked ? "1" : "0");
    if (map.getLayer(`poi-${cat}`)) map.setLayoutProperty(`poi-${cat}`, "visibility", el.checked ? "visible" : "none");
    if (el.checked) showPlaces(cat);
  }));
}

// After switching a kind of place on: say how many there are, and if none are in view, show the nearest.
function showPlaces(cat) {
  const all = pois.filter((p) => p.c === cat);
  const label = catLabel(cat);
  if (!all.length) return say(t("places.none", { label: label.toLowerCase() }));
  if (map === noMap) return say(t("places.count", { n: all.length, label: label.toLowerCase() }));
  const b = map.getBounds();
  const inView = all.filter((p) => b.contains([p.lon, p.lat])).length;
  // Some kinds only show close up: say so, instead of leaving the rider wondering why nothing appears.
  if (inView && map.getZoom() < MINZOOM[cat]) return say(t("places.zoom", { label, n: inView }), { icon: "search", tone: "teal" });
  if (inView) return say(`${label}: ${t("places.inView", { n: inView, all: all.length })}`);
  const ctr = map.getCenter();
  const near = all.reduce((x, p) => (haversine([ctr.lng, ctr.lat], [p.lon, p.lat]) < haversine([ctr.lng, ctr.lat], [x.lon, x.lat]) ? p : x));
  const km = haversine([ctr.lng, ctr.lat], [near.lon, near.lat]) / 1000;
  const bb = new maplibregl.LngLatBounds([ctr.lng, ctr.lat], [ctr.lng, ctr.lat]).extend([near.lon, near.lat]);
  const cam = map.cameraForBounds(bb, { padding: 80, maxZoom: Math.max(15, MINZOOM[cat] + 0.5) });
  if (cam) map.easeTo({ ...cam, zoom: Math.max(cam.zoom, MINZOOM[cat] + 0.2), duration: reduceMotion ? 0 : 900 });
  say(t("places.moved", { label: label.toLowerCase(), km: `${num(km)} ${t("u.km")}` }), { long: true });
}

// ---------- favourites and recent ----------
function routeName() { return t("route.name", { a: stopLabel(stops[0]), b: stopLabel(stops[stops.length - 1]) }) + (stops.length > 2 ? t("route.vias", { n: stops.length - 2 }) : ""); }
function updateSaveButton() {
  const fav = saved.isFavourite(location.hash);
  setBtn($("save"), "star", fav ? "sun" : "sun outline", t(fav ? "saved" : "save"));
  $("save").setAttribute("aria-pressed", fav);
}
$("save").addEventListener("click", saveFavourite);
function saveFavourite() {
  if (!lastRoute) return;
  if (saved.isFavourite(location.hash)) { saved.removeFavourite(location.hash); say(t("fav.removed")); }
  else {
    const name = prompt(t("fav.prompt"), routeName());
    if (name === null) return;
    saved.addFavourite(name.trim() || routeName(), location.hash);
    say(t("fav.saved"), { icon: "star", tone: "sun" });
  }
  updateSaveButton();
  renderSaved();
}
function renderSaved() {
  const { fav, recent } = saved.all();
  const others = recent.filter((r) => !fav.some((f) => f.hash === r.hash) && r.hash !== location.hash);
  $("savedBox").hidden = !fav.length && !others.length;
  $("favList").innerHTML = fav.map((f, i) => `<li><button type="button" class="link" data-h="${esc(f.hash)}">${ic("star", "sun")} <span class="lbl">${markNames(esc(f.name))}</span></button><button type="button" class="ghost tiny" data-del="${i}" aria-label="${esc(t("fav.remove", { name: f.name }))}">${ic("close")}</button></li>`).join("");
  $("recentHead").hidden = !others.length;
  $("recentList").innerHTML = others.map((r) => `<li><button type="button" class="link" data-h="${esc(r.hash)}"><span class="lbl">${markNames(esc(r.name))}</span></button></li>`).join("");
  $("savedBox").querySelectorAll("[data-h]").forEach((b) => b.addEventListener("click", () => {
    history.replaceState(null, "", b.dataset.h);
    readHash(); activeStop = 0; renderStops(); plan(); showMapOnPhone();
  }));
  $("favList").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
    saved.removeFavourite(fav[+b.dataset.del].hash);
    renderSaved(); updateSaveButton();
  }));
}

// ---------- controls ----------
$("addVia").addEventListener("click", () => {
  const prevEnd = stops[stops.length - 1];
  stops.splice(stops.length - 1, 0, { ...prevEnd });
  activeStop = stops.length - 2;
  renderStops(); plan();
});
$("swap").addEventListener("click", swap);
function swap() { stops.reverse(); renderStops(); plan(); }
["profile", "avoid"].forEach((id) => $(id).addEventListener("change", plan));
$("retour").addEventListener("input", () => { safeSet("retour", $("retour").checked ? "1" : ""); if (lastRoute) showResult(lastRoute); });
$("vehicle").addEventListener("change", () => {
  safeSet("vehicle", $("vehicle").value);
  if (lastRoute) showResult(lastRoute);
});
// Remember the rider's own scootmobiel between visits.
if (VEHICLES[safeGet("vehicle")]) $("vehicle").value = safeGet("vehicle");
$("retour").checked = safeGet("retour") === "1";

// ---------- start from my location ----------
$("locate").addEventListener("click", locate);

// "Jij bent hier": an HTML marker (a dot with a soft pulse and a label), so it stays sharp and readable
// on every screen and survives map-style switches. The accuracy circle is a map layer underneath.
let hereMarker = null, hereData = null;
function showHere(here, accuracy) {
  if (map === noMap) return;
  if (!hereMarker) {
    const el = document.createElement("div");
    el.className = "here-marker";
    el.setAttribute("role", "img");
    el.innerHTML = `<span class="here-label">${t("here.label")}</span><span class="here-pulse"></span><span class="here-dot"></span>`;
    hereMarker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(here).addTo(map);
  } else hereMarker.setLngLat(here);
  const acc = Math.min(Math.max(accuracy || 0, 0), 2000);
  hereMarker.getElement().querySelector(".here-label").textContent = t("here.label");
  hereMarker.getElement().setAttribute("aria-label", acc > 30 ? t("here.acc", { m: Math.round(acc) }) : t("here.label"));
  // Circle polygon for the accuracy; skipped when it's small enough not to matter.
  const ring = [];
  if (acc > 30) {
    const k = 1 / (111320 * Math.cos((here[1] * Math.PI) / 180));
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push([here[0] + Math.cos(a) * acc * k, here[1] + (Math.sin(a) * acc) / 110540]);
    }
  }
  hereData = { type: "FeatureCollection", features: ring.length ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] : [] };
  map.getSource("here")?.setData(hereData);
}
function locate() {
  if (!navigator.geolocation) return say(t("loc.none"), { long: true });
  const btn = $("locate");
  btn.disabled = true;
  setBtn(btn, "pin", "sky", t("locating"));
  say(t("loc.search"), { icon: "pin", tone: "sky" });
  const done = () => { btn.disabled = false; setBtn(btn, "pin", "sky", t("locate")); };
  const ok = (pos) => {
    done();
    const here = [pos.coords.longitude, pos.coords.latitude];
    const s = router?.snap(here[0], here[1]);
    if (!s || s.d > 500) {
      return say(t("loc.outside"), { long: true });
    }
    showHere(here, pos.coords.accuracy);
    stops[0] = { lon: +s.point[0].toFixed(5), lat: +s.point[1].toFixed(5), name: "__me" };
    activeStop = 1;
    renderStops(); plan(); showMapOnPhone();
    say(pos.coords.accuracy > 200 ? t("loc.foundRough", { km: `${num(pos.coords.accuracy / 1000)} ${t("u.km")}` }) : t("loc.found"), { icon: "pin", tone: "sky" });
  };
  // Laptops have no GPS; they ask the browser to guess from wifi. On Linux that often fails
  // (Firefox's location service stopped in 2024; many Chromium builds have none), so explain it.
  const fail = (err) => {
    done();
    if (err.code === 1) return say(t("loc.denied"), { long: true });
    say(t("loc.fail"), { long: true });
  };
  // First a quick, rough fix (also accepts a recent known position), then GPS-quality if that fails.
  navigator.geolocation.getCurrentPosition(ok, (err) => {
    if (err.code === 1) return fail(err);
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 });
}

// ---------- read the route aloud ----------
// The voice comes from the phone itself, so it also works offline. For Dutch the rider can choose between
// one female and one male voice (only offered when the device has both); other languages use their default.
const FEMALE = /ellen|claire|fenna|colette|hanna|lotte|femke|saskia|ilse|anouk|tessa|-tfb|-lfc|-yfr|female|vrouw/i;
const MALE = /xander|frank|maarten|arnaud|bram|-bmh|-dma|\bmale\b|\bman\b/i;
// The page's language right now: "nl", or the language a browser translated it into (it changes <html lang>).
const pageLang = () => (document.documentElement.lang || "nl").slice(0, 2).toLowerCase();
function pickVoices(lang = pageLang()) {
  const synth = window.speechSynthesis;
  if (!synth) return {};
  const all = synth.getVoices().filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith(lang));
  const offline = all.filter((v) => v.localService);
  const pool = offline.length ? offline : all;
  const female = pool.find((v) => FEMALE.test(v.name));
  const male = pool.find((v) => !FEMALE.test(v.name) && MALE.test(v.name));
  return { female, male, any: pool[0] };
}
function renderVoiceChoice() {
  const { female, male } = pickVoices();
  const show = pageLang() === "nl" && !!female && !!male;
  $("voiceBox").hidden = !show;
  if (show) document.querySelector(`input[name=voice][value=${safeGet("voice") === "male" ? "male" : "female"}]`).checked = true;
}
if (window.speechSynthesis) speechSynthesis.addEventListener?.("voiceschanged", renderVoiceChoice);
renderVoiceChoice();
document.querySelectorAll("input[name=voice]").forEach((r) => r.addEventListener("change", () => safeSet("voice", r.value)));
// When the browser translates the page (or undoes it), the voice choice follows.
new MutationObserver(renderVoiceChoice).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

const arriveText = () => t($("rArriveLabel").dataset.i18n === "stat.back" ? "speak.back" : "speak.arrive", { time: $("rArrive").textContent.trim() });
$("speak").addEventListener("click", () => {
  const synth = window.speechSynthesis;
  if (!synth) return say(t("speak.none"));
  if (synth.speaking) { synth.cancel(); setBtn($("speak"), "speaker", "teal", t("speak")); return; }
  // Built from the written-out versions, so "13 min" is read as "13 minuten" and "2,5 km" as "2,5 kilometer".
  const translated = pageLang() !== "nl";
  const steps = [...$("steps").querySelectorAll("li")].map((li) => spokenText(li, translated));
  // Dutch: a full sentence-by-sentence text. Translated by the browser: read what is on the page
  // (already translated), with a voice in that language, so it never sounds like Dutch read in English.
  const text = (translated
    ? [spokenText($("summaryText"), true), spokenText($("gist"), true), spokenText($("best"), true), spokenText($("warn"), true), ...steps]
    : [forSpeech(t("speak.route", { a: stopLabel(stops[0]), b: stopLabel(stops[stops.length - 1]) })),
      t("speak.time", { dist: spokenText($("rDist")), time: spokenText($("rTime")) }), arriveText(),
      spokenText($("best")), spokenText($("warn")), ...steps])
    // Each part ends with a full stop, so the voice pauses between the steps.
    .filter(Boolean).map((p) => (/[.!?]$/.test(p) ? p : `${p}.`)).join(" ");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = translated ? document.documentElement.lang : locale();
  const { female, male, any } = pickVoices();
  const voice = (!translated ? (safeGet("voice") === "male" ? male : female) : null) || any;
  // A device that hands back an odd voice must never stop the reading: then the language alone decides.
  try { if (voice) u.voice = voice; } catch { /* keep u.lang */ }
  $("speak").dataset.voice = voice?.name || "";
  u.rate = 0.95;
  u.onend = u.onerror = () => setBtn($("speak"), "speaker", "teal", t("speak"));
  setBtn($("speak"), "stop", "coral", t("speak.stop"));
  synth.speak(u);
});

// ---------- footer: dates that keep themselves up to date ----------
function showDates() {
  const y = new Date().getFullYear();
  $("copyYear").textContent = y > 2026 ? `© 2026–${y}` : "© 2026";
  if (router.built) {
    const d = new Date(router.built + "T12:00:00");
    $("dataDate").textContent = t("data.updated", { date: d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" }) });
  }
}
$("plan").addEventListener("submit", (e) => e.preventDefault());

$("style").addEventListener("change", () => setStyle($("style").value));
function setStyle(v) {
  $("style").value = v;
  safeSet("style", v);
  applyTheme(v);
  stopFollow();
  map.setStyle(STYLES[v], { diff: false }); // full reload, so "style.load" fires and our layers come back
  map.easeTo({ pitch: is3D(v) ? 45 : 0, duration: reduceMotion ? 0 : 600 });
}
function applyTheme(v) { document.documentElement.dataset.theme = DARK_STYLES.has(v) ? "dark" : "light"; }

// ---------- follow ----------
$("follow").addEventListener("click", toggleFollow);
function toggleFollow() {
  if (follower.running) return stopFollow();
  if (!lastRoute) return;
  setBtn($("follow"), "stop", "coral", t("follow.stop"));
  if (phone.matches) setSheet("peek");
  follower.start(lastRoute.coords);
}
function stopFollow() { follower.stop(); setBtn($("follow"), "play", "teal", t("follow")); }

// ---------- share ----------
$("share").addEventListener("click", async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); say(t("share.copied"), { icon: "share", tone: "violet" }); }
  catch { say(t("share.manual")); }
});

// URL hash: #r=Hoorn|52.65,5.05|52.66,5.07,Toilet%3A%20Stadhuis&p=rustig&h=1 — no server needed to share a route.
function writeHash() {
  const r = stops.map((s) => (s.place ? encodeURIComponent(s.place) : `${s.lat},${s.lon}${s.name ? "," + encodeURIComponent(s.name) : ""}`)).join("|");
  history.replaceState(null, "", `#r=${r}&p=${$("profile").value}${$("avoid").checked ? "" : "&h=0"}`);
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const r = h.get("r");
  if (r) {
    const parsed = r.split("|").map((x) => {
      const m = x.match(/^(-?\d+\.\d+),(-?\d+\.\d+)(?:,(.*))?$/);
      if (!m) return { place: decodeURIComponent(x) };
      const s = { lat: +m[1], lon: +m[2] };
      if (m[3]) s.name = decodeURIComponent(m[3]);
      return s;
    });
    if (parsed.length >= 2) stops = parsed;
  }
  if (h.get("p") in { rustig: 1, kortst: 1 }) $("profile").value = h.get("p");
  $("avoid").checked = h.get("h") !== "0";
}

// MapLibre's own buttons and the "Hele route" button get their Dutch labels once the map is there.
function labelMapControls() {
  const set = (sel, key) => document.querySelectorAll(sel).forEach((b) => { b.title = t(key); b.setAttribute("aria-label", t(key)); });
  set(".maplibregl-ctrl-zoom-in", "ctl.zoomIn");
  set(".maplibregl-ctrl-zoom-out", "ctl.zoomOut");
  set(".maplibregl-ctrl-compass", "ctl.north");
  set(".maplibregl-ctrl-geolocate", "ctl.locate");
  const ov = $("overviewBtn");
  if (ov) { ov.querySelector(".lbl").textContent = t("map.overview"); ov.setAttribute("aria-label", t("map.overview.aria")); ov.title = t("map.overview.aria"); }
  const cr = document.querySelector(".credits-map");
  if (cr) { cr.querySelector(".credits-text").innerHTML = creditsHtml(); cr.querySelector(".credits-toggle").setAttribute("aria-label", t("ctl.credits")); }
}
map.once?.("load", labelMapControls);
setTimeout(labelMapControls, 0);

// ---------- keyboard shortcuts ----------
// Letter keys can be switched off for speech-input users (WCAG 2.1.4).
$("letterKeys").checked = safeGet("letterKeys") !== "off";
$("letterKeys").addEventListener("change", () => safeSet("letterKeys", $("letterKeys").checked ? "on" : "off"));
$("helpBtn").addEventListener("click", () => $("help").showModal());

// ---------- help: install steps for this phone ----------
// Chrome on Android offers a real install prompt; elsewhere the help shows the steps for this kind of phone.
let installEvent = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; $("installNow").hidden = false; });
$("installNow").addEventListener("click", async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  installEvent = null;
  $("installNow").hidden = true;
  if (outcome === "accepted") say(t("install.done"), { icon: "phone", tone: "violet" });
});
addEventListener("appinstalled", () => ($("installHelp").hidden = true));
(function setupInstallHelp() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : /Android/.test(ua) ? "android" : "";
  // On a known phone only its own steps; on a computer both, for whoever reads along.
  document.querySelectorAll(".install-steps").forEach((ol) => (ol.hidden = !!os && ol.dataset.os !== os));
  if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) $("installHelp").hidden = true;
})();

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (follower.running) stopFollow(); popup?.remove(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || $("help").open || $("picker").open) return;
  if (e.target instanceof Element && e.target.closest("input, select, textarea, [contenteditable]")) return;
  if (e.key === "?") { e.preventDefault(); $("help").showModal(); return; }
  if (e.key === "/") { e.preventDefault(); openPicker(0, $("stopList").querySelector(".stop-pick")); return; }
  if (!$("letterKeys").checked) return;
  const k = e.key.toLowerCase();
  const actions = {
    v: toggleFollow,
    o: swap,
    t: addToilet,
    b: saveFavourite,
    k: () => { const keys = Object.keys(STYLES); setStyle(keys[(keys.indexOf($("style").value) + 1) % keys.length]); },
  };
  if (actions[k]) { e.preventDefault(); actions[k](); }
});

// ---------- phone: the planner as a sheet over the map ----------
// Three sizes: "peek" (just the route in short), "half" (map and planner together) and "full".
// Sizing works with the arrow buttons, by tapping the grab bar, or by swiping it (WCAG 2.5.7: no drag needed).
const SHEET = ["peek", "half", "full"];
// The small "peek" size fits the bar exactly, also when large text makes the summary wrap.
function measurePeek() {
  const bar = $("panel").querySelector(".sheet-bar");
  if (bar.offsetHeight) document.documentElement.style.setProperty("--peek-bar", `${Math.ceil(bar.offsetHeight)}px`);
}
addEventListener("resize", measurePeek);
function setSheet(state) {
  measurePeek();
  document.body.dataset.sheet = state;
  const i = SHEET.indexOf(state);
  $("sheetLess").disabled = i === 0;
  $("sheetMore").disabled = i === SHEET.length - 1;
  $("sheetGrab").setAttribute("aria-label", t(`sheet.${state}`));
  // In "peek" only the bar is on screen: keep keyboard and screen readers out of the rest.
  for (const el of $("panel").children) if (!el.classList.contains("sheet-bar")) el.inert = phone.matches && state === "peek";
  if (state !== "full") $("panel").scrollTop = 0;
}
const sheetStep = (d) => setSheet(SHEET[Math.max(0, Math.min(SHEET.length - 1, SHEET.indexOf(document.body.dataset.sheet) + d))]);
function showMapOnPhone() { if (phone.matches && document.body.dataset.sheet === "full") setSheet("half"); }
$("sheetMore").addEventListener("click", () => sheetStep(1));
$("sheetLess").addEventListener("click", () => sheetStep(-1));
$("sheetGrab").addEventListener("click", () => (document.body.dataset.sheet === "full" ? setSheet("half") : sheetStep(1)));
$("summaryText").addEventListener("click", () => document.body.dataset.sheet === "peek" && setSheet("half"));
let dragY = null;
$("panel").querySelector(".sheet-bar").addEventListener("pointerdown", (e) => { if (!e.target.closest(".sheet-size")) dragY = e.clientY; });
addEventListener("pointerup", (e) => {
  if (dragY === null) return;
  const d = e.clientY - dragY;
  dragY = null;
  if (Math.abs(d) > 40) sheetStep(d < 0 ? 1 : -1);
});
phone.addEventListener("change", () => setSheet(document.body.dataset.sheet || "half"));
setSheet("half");

// ---------- offline app ----------
const showOnline = () => ($("offline").hidden = navigator.onLine);
addEventListener("online", () => { showOnline(); refreshWeather(); });
addEventListener("offline", showOnline);
showOnline();
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => { /* site still works, just not offline */ });
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
