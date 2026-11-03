import { Router } from "./router.js";
import { CATS, icon, describe, distToLine } from "./pois.js";
import { getWeather, headwind, batteryFactor, beaufort, dirName, bestDeparture } from "./weather.js";
import { createFollower } from "./follow.js";
import { saved } from "./saved.js";

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
const PRESETS = [
  { label: "Rondje Hoorn – Zwaag – Blokker", stops: ["Hoorn", "Zwaag", "Blokker", "Hoorn"] },
  { label: "Dijkroute Schellinkhout – Wijdenes", stops: ["Hoorn", "Schellinkhout", "Wijdenes", "Oosterleek", "Venhuizen", "Hoorn"] },
  { label: "Naar Berkhout & Scharwoude", stops: ["Hoorn", "Scharwoude", "Berkhout"] },
  { label: "Hoorn → Wognum", stops: ["Hoorn", "Zwaag", "Wognum"] },
  { label: "Westwoud & Hem", stops: ["Hoorn", "Westwoud", "Hem"] },
];
const NEAR_ROUTE = 100; // metres: "along the way"
// Typical speed and advertised range per kind of scootmobiel; the range field can be changed.
const VEHICLES = { klein: { speed: 6, range: 15 }, middel: { speed: 12, range: 30 }, groot: { speed: 15, range: 40 } };
const BLOCKED_KEY = "scootmobiel-blocked";

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const status = (msg) => ($("status").textContent = msg);
// Feedback on something the rider just did: a message at the top of the screen, visible on every
// screen size (the status line at the bottom of the panel is easy to miss, especially on a phone).
let toastTimer = 0;
function say(msg, { long = false } = {}) {
  status(msg);
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), long ? 9000 : 4500);
}
$("toast").addEventListener("click", () => ($("toast").hidden = true));

let router, places = [], pois = [], lastRoute = null, activeStop = 0, weather = null, flownIn = false;
// A stop is { place } (a village name) or { lon, lat, name? } (a clicked point or a place on the map).
let stops = [{ place: "Hoorn" }, { place: "Zwaag" }];

const savedStyle = STYLES[safeGet("style")] ? safeGet("style") : "liberty";
$("style").value = savedStyle;
applyTheme(savedStyle);

// MapLibre's own control labels and tooltips, in Dutch.
const NL_LOCALE = {
  "AttributionControl.ToggleAttribution": "Bronvermelding tonen of verbergen",
  "AttributionControl.MapFeedback": "Kaartfout melden",
  "FullscreenControl.Enter": "Volledig scherm",
  "FullscreenControl.Exit": "Volledig scherm sluiten",
  "GeolocateControl.FindMyLocation": "Mijn locatie zoeken",
  "GeolocateControl.LocationNotAvailable": "Locatie niet beschikbaar",
  "LogoControl.Title": "MapLibre-logo",
  "Map.Title": "Kaart",
  "Marker.Title": "Kaartmarkering",
  "NavigationControl.ResetBearing": "Kaart naar het noorden draaien",
  "NavigationControl.ZoomIn": "Inzoomen",
  "NavigationControl.ZoomOut": "Uitzoomen",
  "Popup.Close": "Sluiten",
  "ScaleControl.Feet": "ft",
  "ScaleControl.Meters": "m",
  "ScaleControl.Kilometers": "km",
  "ScaleControl.Miles": "mijl",
  "ScaleControl.NauticalMiles": "zm",
  "CooperativeGesturesHandler.WindowsHelpText": "Gebruik Ctrl + scrollen om in te zoomen",
  "CooperativeGesturesHandler.MacHelpText": "Gebruik ⌘ + scrollen om in te zoomen",
  "CooperativeGesturesHandler.MobileHelpText": "Gebruik twee vingers om de kaart te verschuiven",
};

// Map credits in Dutch. The tile service's own credit line is English and can't be translated,
// so this replaces MapLibre's attribution control with the same sources.
class DutchCredits {
  onAdd() {
    this.el = document.createElement("div");
    this.el.className = "maplibregl-ctrl maplibregl-ctrl-attrib credits-map";
    this.el.innerHTML = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> · Kaartdata © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers';
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
    locale: NL_LOCALE,
  });
  map.addControl(new DutchCredits(), "bottom-right");
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
} catch {
  map = noMap;
  $("map").innerHTML = '<p class="nomap">De kaart kan in deze browser niet getekend worden (geen WebGL). De routeplanner en routebeschrijving werken wel.</p>';
  $("follow").hidden = true;
}

const follower = createFollower(map, {
  reduceMotion,
  pitch: () => (is3D($("style").value) ? 60 : 30),
  onEnd: () => ($("follow").textContent = "▶ Volg route"),
});

// ---------- data ----------
Promise.all(["graph", "places", "pois"].map((f) => fetch(`data/${f}.json`).then((r) => r.json())))
  .then(([g, p, q]) => {
    router = new Router(g);
    places = p;
    pois = q;
    readHash();
    renderStops();
    renderPresets();
    renderPoiToggles();
    renderSaved();
    renderBlockedInfo();
    showDates();
    status("");
    whenStyled(() => { ensureLayers(); plan(); });
  })
  .catch(() => status("Het wegennet kon niet geladen worden. Controleer je internetverbinding en laad de pagina opnieuw."));

function whenStyled(fn) { map.isStyleLoaded() ? fn() : map.once("idle", fn); }

// ---------- map layers ----------
const empty = () => ({ type: "FeatureCollection", features: [] });
const point = (c, props = {}) => ({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: c } });

function ensureLayers() {
  if (map.getSource("route") || !router) return;
  map.addSource("route", { type: "geojson", data: empty() });
  map.addSource("stops", { type: "geojson", data: empty() });
  map.addSource("me", { type: "geojson", data: empty() });
  map.addSource("turn", { type: "geojson", data: empty() });
  map.addSource("here", { type: "geojson", data: empty() });
  map.addSource("obstacles", { type: "geojson", data: empty() });
  map.addSource("allObstacles", { type: "geojson", data: { type: "FeatureCollection", features: [...router.obsByEdge.values()].flat().map((o) => point([o.lon, o.lat], { label: o.label, hard: o.hard ? 1 : 0 })) } });
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
      id: `poi-${cat}`, type: "symbol", source: "pois", filter: ["==", ["get", "c"], cat], minzoom: CATS[cat].small ? 14 : 11,
      layout: { "icon-image": `poi-${cat}`, "icon-size": CATS[cat].small ? 0.6 : 0.85, "icon-allow-overlap": !CATS[cat].small, "icon-ignore-placement": !CATS[cat].small, visibility: poiOn(cat) ? "visible" : "none" },
    });
  }

  map.addLayer({ id: "obstacles", type: "circle", source: "obstacles", paint: { "circle-radius": 8, "circle-color": ["case", ["==", ["get", "hard"], 1], "#d73027", "#f39c12"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "obstacles-label", type: "symbol", source: "obstacles", layout: { "text-field": "!", "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
  map.addLayer({ id: "stops", type: "circle", source: "stops", paint: { "circle-radius": 9, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
  map.addLayer({ id: "stops-label", type: "symbol", source: "stops", layout: { "text-field": ["get", "label"], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
  map.addLayer({ id: "here-halo", type: "circle", source: "here", paint: { "circle-radius": 20, "circle-color": "#3b8bd4", "circle-opacity": 0.2 } });
  map.addLayer({ id: "here", type: "circle", source: "here", paint: { "circle-radius": 8, "circle-color": "#3b8bd4", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
  map.addLayer({ id: "me-glow", type: "circle", source: "me", paint: { "circle-radius": 18, "circle-color": "#ffc94d", "circle-opacity": 0.25, "circle-blur": 0.6 } });
  map.addLayer({ id: "turn", type: "circle", source: "turn", paint: { "circle-radius": 11, "circle-color": "#e5604d", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
  map.addLayer({ id: "turn-label", type: "symbol", source: "turn", layout: { "text-field": ["get", "label"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-offset": [0, 1.6], "text-anchor": "top", "text-allow-overlap": true }, paint: { "text-color": "#b23a2a", "text-halo-color": "#fff", "text-halo-width": 2 } });
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
    if (l.type === "fill-extrusion") map.setLayoutProperty(l.id, "visibility", is3D(v) ? "visible" : "none");
  }
  if (!is3D(v) || layers.some((l) => l.type === "fill-extrusion") || !BUILDING_3D[v]) return;
  const firstLabel = layers.find((l) => l.type === "symbol")?.id;
  map.addLayer({
    id: "buildings-3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 13,
    filter: ["!=", ["get", "hide_3d"], true],
    paint: {
      "fill-extrusion-color": BUILDING_3D[v],
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, ["coalesce", ["get", "render_height"], 5]],
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
  if (!s) return say("Daar is geen pad in de buurt.");
  stops[activeStop] = { lon: +s.point[0].toFixed(5), lat: +s.point[1].toFixed(5) };
  // Next click fills the next stop; the last one keeps moving the destination.
  activeStop = Math.min(activeStop + 1, stops.length - 1);
  renderStops();
  plan();
});

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
    el.innerHTML = `<strong translate="no">${esc(d.title)}</strong><small>${esc(d.sub)}</small>${d.bits.map((b) => `<span>${esc(b)}</span>`).join("")}`;
  } else {
    name = f.properties.label;
    el.innerHTML = `<strong>${esc(f.properties.label)}</strong><span>${f.properties.hard ? "Vaak niet te passeren met een scootmobiel." : "Meestal te passeren, maar smal of hinderlijk."}</span><small>Bron: OpenStreetMap. Klopt het niet? Meld het op openstreetmap.org.</small>`;
  }
  if (f.layer.id.startsWith("poi-")) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = '<button type="button" data-a="via">Als tussenstop</button><button type="button" class="ghost" data-a="to">Als bestemming</button>';
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
  el.innerHTML = `<strong>Kon je hier niet langs?</strong><span>${name ? `<span translate="no">${esc(name)}</span>, ` : ""}${router.classes[router.eCls[s.e]]}</span>
    <div class="row"><button type="button" data-a="block">Vermijd dit stuk</button>
    <a class="btnlink" href="https://www.openstreetmap.org/note/new#map=19/${s.point[1].toFixed(5)}/${s.point[0].toFixed(5)}" target="_blank" rel="noopener">Meld op OpenStreetMap</a></div>`;
  el.querySelector("[data-a=block]").addEventListener("click", () => {
    const list = blockedPoints();
    list.push([+s.point[0].toFixed(5), +s.point[1].toFixed(5)]);
    safeSet(BLOCKED_KEY, JSON.stringify(list));
    popup.remove();
    renderBlockedInfo();
    say("Dit stuk wordt voortaan vermeden. Terugzetten kan onder Meer instellingen.");
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
  $("blockedInfo").innerHTML = n ? `Je vermijdt ${n} ${n === 1 ? "stuk" : "stukken"} dat je zelf hebt aangegeven. <button type="button" class="link" id="unblock">Alles terugzetten</button>` : "";
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
function stopLabel(s) { return s.place || s.name || `Punt op kaart (${s.lat.toFixed(4)}, ${s.lon.toFixed(4)})`; }

function plan() {
  if (!router) return;
  stopFollow();
  writeHash();
  drawStops();
  const coords = stops.map(stopCoord);
  if (coords.some((c) => !c)) return;
  const prof = $("profile").value, avoid = $("avoid").checked, blocked = blockedEdges();
  const snaps = coords.map((c) => router.snap(c[0], c[1]));
  if (snaps.some((s) => !s)) return say("Een van de punten ligt te ver van een pad.");
  const t0 = performance.now();
  const legs = [];
  for (let i = 0; i < snaps.length - 1; i++) {
    const r = router.route(snaps[i], snaps[i + 1], prof, avoid, blocked);
    if (!r) return say(`Geen route gevonden tussen ${stopLabel(stops[i])} en ${stopLabel(stops[i + 1])}.`);
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
  ensureLayers();
  drawRoute(route);
  showResult(route);
  status(`Route berekend in ${Math.round(performance.now() - t0)} ms, in je eigen browser.`);
  fit(route.coords);
  saved.addRecent(routeName(), location.hash);
  renderSaved();
  refreshWeather();
}

function drawRoute(route) {
  map.getSource("route")?.setData({
    type: "FeatureCollection",
    features: route.pieces.map((p) => ({ type: "Feature", properties: { cls: p.cls, unpaved: p.flags & 1 }, geometry: { type: "LineString", coordinates: p.coords } })),
  });
  map.getSource("obstacles")?.setData({ type: "FeatureCollection", features: route.obstacles.map((o) => point([o.lon, o.lat], { label: o.label, hard: o.hard ? 1 : 0 })) });
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

function fit(coords) {
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  coords.forEach((c) => b.extend(c));
  // On a phone, keep the route clear of the message at the top and the summary card at the bottom.
  const padding = innerWidth <= 760 ? { top: 70, bottom: 150, left: 30, right: 60 } : 60;
  if (!flownIn && !reduceMotion) {
    // First route of the visit: a slow, tilted fly-in.
    flownIn = true;
    map.fitBounds(b, { padding, maxZoom: 15.5, duration: 3200, pitch: is3D($("style").value) ? 50 : 0, bearing: -12, essential: false });
    return;
  }
  flownIn = true;
  map.fitBounds(b, { padding, duration: reduceMotion ? 0 : 900, maxZoom: 16 });
}

// ---------- result panel ----------
function showResult(route) {
  // A round trip already ends where it started, so "also ride back" doesn't apply.
  const c = route.coords, loop = haversine(c[0], c[c.length - 1]) < 300;
  const retour = $("retour").checked && !loop;
  $("retour").disabled = loop;
  $("retour").parentElement.title = loop ? "Dit is al een rondje" : "";
  const kmOut = route.len / 1000;
  const km = kmOut * (retour ? 2 : 1);
  const speed = VEHICLES[$("vehicle").value].speed;
  const mins = Math.round((km / speed) * 60);
  const range = +$("range").value || 30;
  // Real rides get less than the advertised range; the safe range depends on the battery's age.
  const usable = range * +$("battery").value;

  // Battery: distance share of the safe range, adjusted for wind and cold when the weather is known.
  let fOut = 1, fBack = 1, wx = null;
  if (weather) {
    const hw = headwind(route.coords, weather);
    fOut = batteryFactor(hw, weather.temp); fBack = batteryFactor(-hw, weather.temp);
    wx = { hw, fOut, fBack };
  }
  const used = kmOut * fOut + (retour ? kmOut * fBack : 0);
  const pct = Math.round((used / usable) * 100);
  drawTurnPoint(route, pct > 100 ? (retour ? usable / (fOut + fBack) : usable / fOut) : null, retour);

  $("result").hidden = false;
  $("rDist").textContent = km.toFixed(1).replace(".", ",") + " km";
  $("rTime").textContent = mins >= 60 ? `${Math.floor(mins / 60)} u ${mins % 60} min` : `${mins} min`;
  $("rBatt").textContent = pct + "%";
  $("rBatt").parentElement.classList.toggle("low", pct > 80);
  $("summaryText").innerHTML = `<b>${esc($("rDist").textContent)}</b> · ${esc($("rTime").textContent)} · accu ${pct}%`;

  const byCls = new Array(router.classes.length).fill(0);
  let unpaved = 0, busy = 0;
  for (const p of route.pieces) { byCls[p.cls] += p.len; if (p.flags & 1) unpaved += p.len; if (p.cls === 5) busy += p.len; }
  $("mix").innerHTML = byCls.map((m, c) => (m ? `<span style="flex:${m};background:${CLASS_COLORS[c]}"></span>` : "")).join("");
  $("mixLegend").innerHTML = byCls.map((m, c) => (m / route.len > 0.01 ? `<li><i style="background:${CLASS_COLORS[c]}"></i>${router.classes[c]} ${Math.round((m / route.len) * 100)}%</li>` : "")).join("");

  // Weather line.
  if (weather) {
    const w = weather;
    const parts = [`Wind ${Math.round(w.wind)} m/s (${beaufort(w.wind)} Bft) uit het ${dirName(w.from)}, ${Math.round(w.temp)} °C.`];
    const pctOf = (f) => Math.round(Math.abs(f - 1) * 100);
    if (wx.hw > 1) parts.push(`Heen vooral tegenwind: ca. ${pctOf(wx.fOut)}% meer accu.${retour ? " Terug wind mee." : ""}`);
    else if (wx.hw < -1) parts.push(`Heen wind mee.${retour ? ` Terug tegenwind: ca. ${pctOf(wx.fBack)}% meer accu.` : " Let op: terug heb je tegenwind."}`);
    else parts.push("Wind vooral van opzij.");
    if (w.temp < 10) parts.push("Een koude accu heeft minder bereik; dat is meegerekend.");
    if (w.rainChance >= 50) parts.push(`Kans op regen de komende uren: ${w.rainChance}%.`);
    $("weather").textContent = parts.join(" ") + " (schatting)";
    $("weather").hidden = false;
    const best = bestDeparture(route.coords, w, retour);
    $("best").hidden = !best;
    if (best) $("best").textContent = `Tip: vertrek liever om ${best.time}. Dan kost de wind minder accu${best.rain < best.nowRain ? ` en is de kans op regen kleiner (${best.rain}%)` : ""}.`;
  } else { $("weather").hidden = true; $("best").hidden = true; }

  const warns = [];
  if (pct > 100) warns.push(retour
    ? `Te ver voor één acculading heen en terug (${pct}%). Keer uiterlijk om bij de rode stip op de kaart, of laad onderweg.`
    : `Te ver voor één acculading (${pct}%). Bij de rode stip op de kaart is je accu waarschijnlijk leeg.`);
  else if (pct > 80) warns.push(`Krap: de route gebruikt ongeveer ${pct}% van je veilige actieradius.`);
  if (weather && weather.gust > 14) warns.push(`Harde windstoten (${Math.round(weather.gust)} m/s). Rij voorzichtig op de dijk en open stukken.`);
  if (unpaved > 50) warns.push(`${Math.round(unpaved)} m onverhard (gestippeld op de kaart).`);
  if (busy > 100) warns.push(`${Math.round(busy)} m langs of over een drukke weg (rood).`);
  $("warn").hidden = !warns.length;
  $("warn").textContent = warns.join(" ");

  renderObstacles(route);
  renderAlong(route);
  renderSteps(route);
  updateSaveButton();
}

function renderObstacles(route) {
  const box = $("obstacles");
  const obs = route.obstacles;
  if (!obs.length) {
    box.hidden = false;
    box.innerHTML = '<p class="ok">✓ Geen bekende hekjes, paaltjes of hoge stoepranden op deze route.</p>';
    return;
  }
  const counts = {};
  for (const o of obs) counts[o.label] = (counts[o.label] || 0) + 1;
  const hard = obs.filter((o) => o.hard);
  const list = Object.entries(counts).map(([l, n]) => `${n}× ${l}`).join(", ");
  let html = `<p><strong>Obstakels op de route:</strong> ${esc(list)}.</p>`;
  if (hard.length) {
    html += `<p>${hard.length} daarvan ${hard.length === 1 ? "is" : "zijn"} vaak lastig voor een scootmobiel (rood). ${$("avoid").checked ? "Er is geen route zonder." : 'Zet "Vermijd hekjes" aan voor een route eromheen.'}</p>`;
    html += `<div class="row">${hard.slice(0, 6).map((o, i) => `<button type="button" class="ghost small" data-o="${i}">Toon ${esc(o.label)}</button>`).join("")}</div>`;
  }
  box.innerHTML = html;
  box.hidden = false;
  box.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
    const o = hard[+b.dataset.o];
    showMapOnPhone();
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
  const names = { toilet: ["toilet", "toiletten"], bankje: ["bankje", "bankjes"], supermarkt: ["supermarkt", "supermarkten"], apotheek: ["apotheek", "apotheken"] };
  const parts = Object.entries(names).map(([cat, [one, many]]) => {
    const n = nearRoute(route, cat).length;
    return n ? `${n} ${n === 1 ? one : many}` : null;
  }).filter(Boolean);
  $("along").hidden = false;
  $("along").textContent = parts.length ? `Binnen ${NEAR_ROUTE} m van de route: ${parts.join(", ")}.` : `Geen toiletten of bankjes bekend binnen ${NEAR_ROUTE} m van de route.`;
}

// Where the battery runs out (one way) or where to turn back (there and back), drawn on the map.
function drawTurnPoint(route, km, retour) {
  if (km === null) { map.getSource("turn")?.setData(empty()); return; }
  const c = route.coords;
  let d = 0;
  for (let i = 1; i < c.length; i++) {
    const m = haversine(c[i - 1], c[i]);
    if (d + m >= km * 1000) {
      const f = (km * 1000 - d) / m;
      const p = [c[i - 1][0] + (c[i][0] - c[i - 1][0]) * f, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f];
      map.getSource("turn")?.setData({ type: "FeatureCollection", features: [point(p, { label: retour ? "Keer hier om" : "Accu bijna leeg" })] });
      return;
    }
    d += m;
  }
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
  $("steps").innerHTML = merged.map((s, i) => {
    const turn = i ? turnWord(merged[i - 1].coords, s.coords) : "Vertrek";
    const where = s.name ? `<strong translate="no">${esc(s.name)}</strong>` : router.classes[s.cls];
    const mark = i ? landmarkAt(s.coords[0]) : null;
    return `<li>${turn}${mark ? ` bij <span translate="no">${esc(mark)}</span>` : ""} ${s.name ? "via" : "over"} ${where} <small>(${fmtLen(s.len)}, ${router.classes[s.cls]})</small></li>`;
  }).join("") + `<li>Aangekomen bij <span translate="no">${esc(stopLabel(stops[stops.length - 1]))}</span></li>`;
}

function turnWord(prev, next) {
  const a = bearing(prev[Math.max(0, prev.length - 2)], prev[prev.length - 1]);
  const b = bearing(next[0], next[Math.min(1, next.length - 1)]);
  const d = ((b - a + 540) % 360) - 180;
  if (Math.abs(d) < 30) return "Rechtdoor";
  if (Math.abs(d) > 150) return "Keer om";
  return d > 0 ? (d > 100 ? "Scherp rechtsaf" : "Rechtsaf") : d < -100 ? "Scherp linksaf" : "Linksaf";
}
const bearing = (p, q) => (Math.atan2((q[0] - p[0]) * Math.cos((p[1] * Math.PI) / 180), q[1] - p[1]) * 180) / Math.PI;
const fmtLen = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace(".", ",") + " km" : Math.round(m / 10) * 10 + " m");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function refreshWeather() {
  if (!navigator.onLine) return;
  try {
    const w = await getWeather();
    const changed = !weather || w !== weather;
    weather = w;
    if (changed && lastRoute) showResult(lastRoute);
  } catch { /* no weather: battery estimate falls back to distance only */ }
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
  if (!best || best.d > 3000) return say("Er is geen openbaar toilet bekend in de buurt van deze route.");
  const leg = lastRoute.legStarts.filter((s) => s <= best.at).length - 1;
  const name = best.p.n ? `Toilet: ${best.p.n}` : best.p.w === "yes" ? "Rolstoeltoilet" : "Openbaar toilet";
  stops.splice(leg + 1, 0, { lon: best.p.lon, lat: best.p.lat, name });
  renderStops();
  plan();
  say(`🚻 Tussenstop toegevoegd: ${name}, ${Math.round(best.d)} m van je route. Het nummer op de kaart wijst het aan.`, { long: true });
  showMapOnPhone();
}

// ---------- stops UI ----------
function renderStops() {
  const opts = places.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join("");
  $("stopList").innerHTML = stops.map((s, i) => {
    const start = i === 0, end = i === stops.length - 1;
    const label = start ? "Van" : end ? "Naar" : `Tussenstop ${i}`;
    const custom = s.place ? "" : `<option value="__pt" selected>${esc(stopLabel(s))}</option>`;
    return `<div class="stop${i === activeStop ? " active" : ""}">
      <span class="pin ${start ? "start" : end ? "end" : ""}" aria-hidden="true">${start ? "A" : end ? "B" : i}</span>
      <select data-i="${i}" aria-label="${label}">${custom}${opts}</select>
      ${!start && !end ? `<button type="button" data-rm="${i}" aria-label="Verwijder ${label}">✕</button>` : "<span></span>"}
    </div>`;
  }).join("");
  $("stopList").querySelectorAll("select").forEach((el) => {
    const s = stops[+el.dataset.i];
    if (s.place) el.value = s.place;
    el.addEventListener("focus", () => { activeStop = +el.dataset.i; markActive(); });
    el.addEventListener("change", () => { stops[+el.dataset.i] = { place: el.value }; renderStops(); plan(); });
  });
  $("stopList").querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
    stops.splice(+b.dataset.rm, 1);
    activeStop = Math.min(activeStop, stops.length - 1);
    renderStops(); plan();
  }));
}
function markActive() {
  $("stopList").querySelectorAll(".stop").forEach((el, i) => el.classList.toggle("active", i === activeStop));
}

function renderPresets() {
  const have = new Set(places.map((p) => p.name));
  const usable = PRESETS.filter((p) => p.stops.every((s) => have.has(s)));
  $("presets").innerHTML = usable.map((p, i) => `<button type="button" data-p="${i}">${esc(p.label)}</button>`).join("");
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
    `<label class="check"><input type="checkbox" data-cat="${cat}" ${poiOn(cat) ? "checked" : ""}/> <i class="dot" style="background:${c.color}"></i>${c.label}</label>`).join("");
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
  const c = CATS[cat];
  if (!all.length) return say(`Er zijn geen ${c.label.toLowerCase()} bekend in dit gebied.`);
  if (map === noMap) return say(`${all.length} ${c.label.toLowerCase()} bekend in dit gebied.`);
  const b = map.getBounds();
  const inView = all.filter((p) => b.contains([p.lon, p.lat])).length;
  if (inView) return say(`${inView} ${inView === 1 ? c.one : c.label.toLowerCase()} in beeld (${all.length} in het hele gebied).`);
  const ctr = map.getCenter();
  const near = all.reduce((x, p) => (haversine([ctr.lng, ctr.lat], [p.lon, p.lat]) < haversine([ctr.lng, ctr.lat], [x.lon, x.lat]) ? p : x));
  const km = haversine([ctr.lng, ctr.lat], [near.lon, near.lat]) / 1000;
  const bb = new maplibregl.LngLatBounds([ctr.lng, ctr.lat], [ctr.lng, ctr.lat]).extend([near.lon, near.lat]);
  map.fitBounds(bb, { padding: 80, maxZoom: 15, duration: reduceMotion ? 0 : 900 });
  say(`Geen ${c.label.toLowerCase()} in dit stuk van de kaart. De kaart schuift naar de dichtstbijzijnde (${km.toFixed(1).replace(".", ",")} km).`, { long: true });
}

// ---------- favourites and recent ----------
function routeName() { return `${stopLabel(stops[0])} → ${stopLabel(stops[stops.length - 1])}${stops.length > 2 ? ` (${stops.length - 2} tussenstop${stops.length > 3 ? "s" : ""})` : ""}`; }
function updateSaveButton() {
  const fav = saved.isFavourite(location.hash);
  $("save").textContent = fav ? "★ Bewaard" : "☆ Bewaar";
  $("save").setAttribute("aria-pressed", fav);
}
$("save").addEventListener("click", saveFavourite);
function saveFavourite() {
  if (!lastRoute) return;
  if (saved.isFavourite(location.hash)) { saved.removeFavourite(location.hash); say("Uit je favorieten gehaald."); }
  else {
    const name = prompt("Naam voor deze route:", routeName());
    if (name === null) return;
    saved.addFavourite(name.trim() || routeName(), location.hash);
    say("⭐ Bewaard bij Mijn routes (alleen in deze browser).");
  }
  updateSaveButton();
  renderSaved();
}
function renderSaved() {
  const { fav, recent } = saved.all();
  const others = recent.filter((r) => !fav.some((f) => f.hash === r.hash) && r.hash !== location.hash);
  $("savedBox").hidden = !fav.length && !others.length;
  $("favList").innerHTML = fav.map((f, i) => `<li><button type="button" class="link" data-h="${esc(f.hash)}">★ ${esc(f.name)}</button><button type="button" class="ghost tiny" data-del="${i}" aria-label="Verwijder favoriet ${esc(f.name)}">✕</button></li>`).join("");
  $("recentHead").hidden = !others.length;
  $("recentList").innerHTML = others.map((r) => `<li><button type="button" class="link" data-h="${esc(r.hash)}">${esc(r.name)}</button></li>`).join("");
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
["range", "retour", "battery"].forEach((id) => $(id).addEventListener("input", () => { safeSet(id, id === "retour" ? ($(id).checked ? "1" : "") : $(id).value); if (lastRoute) showResult(lastRoute); }));
$("vehicle").addEventListener("change", () => {
  const v = VEHICLES[$("vehicle").value];
  $("range").value = v.range;
  safeSet("vehicle", $("vehicle").value); safeSet("range", v.range);
  if (lastRoute) showResult(lastRoute);
});
// Remember the rider's own scootmobiel between visits.
if (VEHICLES[safeGet("vehicle")]) $("vehicle").value = safeGet("vehicle");
if (+safeGet("range") > 0) $("range").value = safeGet("range");
if (safeGet("battery")) $("battery").value = safeGet("battery");
$("retour").checked = safeGet("retour") === "1";

// ---------- start from my location ----------
$("locate").addEventListener("click", locate);
function locate() {
  if (!navigator.geolocation) return say("Je browser kan je locatie niet bepalen. Kies een dorp, of tik op de kaart.", { long: true });
  const btn = $("locate");
  btn.disabled = true;
  btn.textContent = "📍 Locatie zoeken…";
  say("📍 Je locatie wordt gezocht…");
  const done = () => { btn.disabled = false; btn.textContent = "📍 Vanaf mijn locatie"; };
  const ok = (pos) => {
    done();
    const here = [pos.coords.longitude, pos.coords.latitude];
    const s = router?.snap(here[0], here[1]);
    if (!s || s.d > 500) {
      return say("Je bent buiten het gebied van deze kaart (Hoorn en omgeving). Kies een dorp als vertrekpunt, of tik op de kaart.", { long: true });
    }
    map.getSource("here")?.setData({ type: "FeatureCollection", features: [point(here)] });
    stops[0] = { lon: +s.point[0].toFixed(5), lat: +s.point[1].toFixed(5), name: "Mijn locatie" };
    activeStop = 1;
    renderStops(); plan(); showMapOnPhone();
    say(`📍 Gevonden! Je route begint nu bij jou${pos.coords.accuracy > 200 ? ` (nauwkeurig tot op ca. ${Math.round(pos.coords.accuracy / 100) / 10} km)` : ""}.`);
  };
  // Laptops have no GPS; they ask the browser to guess from wifi. On Linux that often fails
  // (Firefox's location service stopped in 2024; many Chromium builds have none), so explain it.
  const fail = (err) => {
    done();
    if (err.code === 1) return say("Je hebt de site geen toestemming gegeven voor je locatie. Dat kun je aanzetten via het slotje naast het webadres.", { long: true });
    say("Je locatie kon niet worden bepaald. Op een laptop of computer lukt dat vaak niet, want die heeft geen gps. Op je telefoon werkt het wel. Kies hier een dorp, of tik op de kaart.", { long: true });
  };
  // First a quick, rough fix (also accepts a recent known position), then GPS-quality if that fails.
  navigator.geolocation.getCurrentPosition(ok, (err) => {
    if (err.code === 1) return fail(err);
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }, { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 });
}

// ---------- read the route aloud ----------
$("speak").addEventListener("click", () => {
  const synth = window.speechSynthesis;
  if (!synth) return say("Voorlezen werkt niet in deze browser.");
  if (synth.speaking) { synth.cancel(); $("speak").textContent = "🔊 Voorlezen"; return; }
  const text = [`Route van ${stopLabel(stops[0])} naar ${stopLabel(stops[stops.length - 1])}.`,
    `${$("rDist").textContent.replace(",", " komma ")}, ongeveer ${$("rTime").textContent.replace(" u ", " uur ")}.`,
    $("best").hidden ? "" : $("best").textContent, $("warn").hidden ? "" : $("warn").textContent,
    ...[...$("steps").querySelectorAll("li")].map((li) => li.textContent.replace(/\(([^)]*)\)/, ", $1."))].filter(Boolean).join(" ");
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "nl-NL";
  u.rate = 0.95;
  u.onend = u.onerror = () => ($("speak").textContent = "🔊 Voorlezen");
  $("speak").textContent = "■ Stoppen met voorlezen";
  synth.speak(u);
});

// ---------- footer: dates that keep themselves up to date ----------
function showDates() {
  const y = new Date().getFullYear();
  $("copyYear").textContent = y > 2026 ? `© 2026–${y}` : "© 2026";
  if (router.built) {
    const d = new Date(router.built + "T12:00:00");
    $("dataDate").textContent = ` (bijgewerkt ${d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })})`;
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
  $("follow").textContent = "■ Stoppen";
  showMapOnPhone();
  follower.start(lastRoute.coords);
}
function stopFollow() { follower.stop(); $("follow").textContent = "▶ Volg route"; }

// ---------- share ----------
$("share").addEventListener("click", async () => {
  writeHash();
  try { await navigator.clipboard.writeText(location.href); say("🔗 Link gekopieerd. Plak hem in een bericht of mail."); }
  catch { say("Kopieer de link uit de adresbalk."); }
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

// ---------- keyboard shortcuts ----------
// Letter keys can be switched off for speech-input users (WCAG 2.1.4).
$("letterKeys").checked = safeGet("letterKeys") !== "off";
$("letterKeys").addEventListener("change", () => safeSet("letterKeys", $("letterKeys").checked ? "on" : "off"));
$("helpBtn").addEventListener("click", () => $("help").showModal());

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (follower.running) stopFollow(); popup?.remove(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey || $("help").open) return;
  if (e.target instanceof Element && e.target.closest("input, select, textarea, [contenteditable]")) return;
  if (e.key === "?") { e.preventDefault(); $("help").showModal(); return; }
  if (e.key === "/") { e.preventDefault(); $("stopList").querySelector("select")?.focus(); return; }
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

// ---------- phone: map / planner tabs ----------
const phone = matchMedia("(max-width: 760px)");
function setView(v) {
  document.body.dataset.view = v;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === v));
  // Keep keyboard and screen-reader users out of the hidden half.
  $("panel").inert = phone.matches && v === "map";
  if (v === "map") map.resize();
}
function showMapOnPhone() { if (phone.matches) setView("map"); }
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("summary").addEventListener("click", () => setView("plan"));
phone.addEventListener("change", () => setView(document.body.dataset.view || "map"));
setView("map");

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
