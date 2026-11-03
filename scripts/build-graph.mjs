// Turns the raw Overpass downloads (data/raw/ways_*.json, places.json) into a compact
// routing graph the browser can search on its own: public/data/graph.json + places.json.
// Run after scripts/fetch-osm.sh:  node scripts/build-graph.mjs
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";

const RAW = "data/raw";
const OUT = "public/data";
mkdirSync(OUT, { recursive: true });

// Way classes as the browser sees them. Index = class code in the graph.
const CLASSES = [
  "fietspad", // 0 cycleway
  "voetpad", // 1 footway / pedestrian / path
  "woonstraat", // 2 residential / living_street
  "erf/ventweg", // 3 service / unclassified
  "doorgaande weg", // 4 tertiary
  "drukke weg", // 5 secondary / primary
  "landweg", // 6 track
];
const classOf = (t) => {
  const hw = t.highway.replace(/_link$/, "");
  if (hw === "cycleway") return 0;
  if (hw === "footway" || hw === "pedestrian" || hw === "path") return t.bicycle === "designated" ? 0 : 1;
  if (hw === "residential" || hw === "living_street") return 2;
  if (hw === "service" || hw === "unclassified") return 3;
  if (hw === "tertiary") return 4;
  if (hw === "secondary" || hw === "primary") return 5;
  if (hw === "track") return 6;
  return null;
};

const UNPAVED = /^(unpaved|gravel|fine_gravel|compacted|dirt|earth|ground|grass|sand|mud|pebblestone|woodchips|grass_paver)$/;
const BAD = /^(grass|sand|mud|woodchips|dirt|earth|ground)$/;

function usable(t) {
  if (!t.highway || t.highway === "steps") return false; // steps: never for a scootmobiel
  if (t.area === "yes") return false;
  if (/^(no|private)$/.test(t.access || "") && !/^(yes|designated|permissive)$/.test(t.foot || t.bicycle || "")) return false;
  if (t.foot === "no" && t.bicycle === "no") return false;
  if (t.motorroad === "yes") return false;
  // A scootmobiel follows cycle rules: on roads where bikes must use the side path, so must we.
  const road = !/^(cycleway|footway|path|pedestrian|track)$/.test(t.highway);
  if (road && /^(no|use_sidepath)$/.test(t.bicycle || "")) return false;
  if (BAD.test(t.surface || "")) return false;
  if (t.highway === "track" && !t.surface) return false; // unknown track surface: usually a farm track
  if (t.highway === "service" && /^(parking_aisle|driveway)$/.test(t.service || "")) return false;
  if (t.wheelchair === "no") return false;
  return true;
}

const ways = new Map();
for (const f of readdirSync(RAW).filter((f) => /^ways_\d+\.json$/.test(f))) {
  for (const el of JSON.parse(readFileSync(`${RAW}/${f}`, "utf8")).elements) {
    if (el.type === "way" && el.geometry && el.tags && usable(el.tags)) ways.set(el.id, el);
  }
}

// Count how often each OSM node is used, to find junctions (graph vertices).
const uses = new Map();
for (const w of ways.values()) {
  w.nodes.forEach((n, i) => {
    const end = i === 0 || i === w.nodes.length - 1;
    uses.set(n, (uses.get(n) || 0) + (end ? 2 : 1));
  });
}

const vIndex = new Map();
const verts = []; // flat [lon, lat] * 1e5
const vertex = (id, g) => {
  let v = vIndex.get(id);
  if (v === undefined) {
    v = verts.length / 2;
    vIndex.set(id, v);
    verts.push(Math.round(g.lon * 1e5), Math.round(g.lat * 1e5));
  }
  return v;
};

const names = [""];
const nameIdx = new Map([["", 0]]);
const nameOf = (s) => {
  if (!nameIdx.has(s)) nameIdx.set(s, names.push(s) - 1);
  return nameIdx.get(s);
};

const R = 6371008.8;
const dist = (a, b) => {
  const toR = Math.PI / 180;
  const x = (b.lon - a.lon) * toR * Math.cos(((a.lat + b.lat) / 2) * toR);
  const y = (b.lat - a.lat) * toR;
  return Math.sqrt(x * x + y * y) * R;
};

// Edge = [from, to, metres, class, flags, nameIdx, [dLon, dLat, ...intermediate points, delta from `from`]]
// flags: 1 = unpaved, 4 = lit, 8 = has a passable obstacle (bollard, gate), 16 = has a hard obstacle (raised kerb, kissing gate)
const edges = [];

// Kerbs and barriers sit on path nodes. Severity: 1 = usually passable but narrow/annoying, 2 = often impassable for a scootmobiel.
const OBSTACLES = [
  ["paaltje", 1], ["hek", 1], ["slagboom", 1], ["betonblok", 1], ["stoeprand (onbekend)", 1], ["afgeronde stoeprand", 1],
  ["hoge stoeprand", 2], ["klaphek / fietssluis", 2], ["draaihek", 2], ["overstap", 2], ["ketting", 2], ["zoenhekje", 2],
];
function obstacleOf(t) {
  const kerb = t.kerb || (t.barrier === "kerb" ? "unknown" : "");
  if (kerb === "raised" || kerb === "yes") return 6;
  if (kerb === "rolled") return 5;
  if (kerb === "unknown") return 4;
  switch (t.barrier) {
    case "bollard": return 0;
    case "gate": case "swing_gate": case "sliding_gate": return t.access === "no" || t.locked === "yes" ? 7 : 1;
    case "lift_gate": return 2;
    case "block": return 3;
    case "cycle_barrier": return 7;
    case "turnstile": case "full-height_turnstile": return 8;
    case "stile": return 9;
    case "chain": return 10;
    case "kissing_gate": return 11;
  }
  return -1;
}
const obstacleNodes = new Map();
try {
  for (const el of JSON.parse(readFileSync(`${RAW}/barriers.json`, "utf8")).elements) {
    const k = obstacleOf(el.tags || {});
    if (k >= 0) obstacleNodes.set(el.id, k);
  }
} catch { console.warn("no data/raw/barriers.json — building without kerbs/barriers"); }
const obstacles = []; // [lon*1e5, lat*1e5, kind, edge]
for (const w of ways.values()) {
  const t = w.tags;
  const cls = classOf(t);
  if (cls === null) continue;
  let flags = 0;
  if (UNPAVED.test(t.surface || "")) flags |= 1;
  if (t.lit === "yes") flags |= 4;
  const name = nameOf(t.name || "");
  let start = 0;
  for (let i = 1; i < w.nodes.length; i++) {
    const last = i === w.nodes.length - 1;
    if (!last && uses.get(w.nodes[i]) < 2) continue;
    const g = w.geometry;
    let m = 0;
    for (let k = start + 1; k <= i; k++) m += dist(g[k - 1], g[k]);
    const a = vertex(w.nodes[start], g[start]);
    const b = vertex(w.nodes[i], g[i]);
    const mid = [];
    let px = verts[a * 2], py = verts[a * 2 + 1];
    for (let k = start + 1; k < i; k++) {
      const x = Math.round(g[k].lon * 1e5), y = Math.round(g[k].lat * 1e5);
      mid.push(x - px, y - py);
      px = x; py = y;
    }
    let ef = flags;
    const found = [];
    for (let k = start === 0 ? 0 : start + 1; k <= i; k++) {
      const kind = obstacleNodes.get(w.nodes[k]);
      if (kind === undefined) continue;
      ef |= OBSTACLES[kind][1] === 2 ? 16 : 8;
      found.push([Math.round(g[k].lon * 1e5), Math.round(g[k].lat * 1e5), kind, edges.length]);
    }
    if (a !== b) { edges.push([a, b, Math.round(m * 10) / 10, cls, ef, name, mid]); obstacles.push(...found); }
    start = i;
  }
}

// Obstacles at a junction vertex can be counted twice (once per way); keep one.
const seenObs = new Set();
const uniqueObs = obstacles.filter((o) => { const k = o[0] + "," + o[1]; if (seenObs.has(k)) return false; seenObs.add(k); return true; });
writeFileSync(`${OUT}/graph.json`, JSON.stringify({ built: new Date().toISOString().slice(0, 10), classes: CLASSES, names, verts, edges, obstacleKinds: OBSTACLES, obstacles: uniqueObs }));

// Towns and villages for the pickers.
const places = JSON.parse(readFileSync(`${RAW}/places.json`, "utf8"))
  .elements.filter((e) => e.tags?.name)
  .map((e) => ({ name: e.tags.name, kind: e.tags.place, lon: +e.lon.toFixed(5), lat: +e.lat.toFixed(5) }))
  .sort((a, b) => a.name.localeCompare(b.name, "nl"));
writeFileSync(`${OUT}/places.json`, JSON.stringify(places));

// Places along the way: accessible toilets, benches, charging, pharmacies, shops.
let pois = [];
try {
  for (const el of JSON.parse(readFileSync(`${RAW}/pois.json`, "utf8")).elements) {
    const t = el.tags || {};
    const lon = el.lon ?? el.center?.lon, lat = el.lat ?? el.center?.lat;
    if (lon === undefined) continue;
    let cat = null;
    if (t.amenity === "toilets") {
      if (t.access === "private" || t.access === "no") continue;
      cat = "toilet";
    } else if (t.amenity === "bench") cat = "bankje";
    else if (t.amenity === "pharmacy") cat = "apotheek";
    else if (t.shop === "supermarket") cat = "supermarkt";
    else if (t.shop === "mobility_scooter" || t.shop === "medical_supply") cat = "scootmobielwinkel";
    else if (t.amenity === "charging_station") {
      // Car chargers don't help a scootmobiel; keep ones with a normal socket or meant for small vehicles.
      const small = t.bicycle === "yes" || t.scooter === "yes" || t.mobility_scooter === "yes" || t["socket:schuko"] || t["socket:typee"] || t.motorcar === "no";
      if (!small) continue;
      cat = "laadpunt";
    }
    if (!cat) continue;
    const p = { c: cat, lon: +lon.toFixed(5), lat: +lat.toFixed(5) };
    if (t.name) p.n = t.name;
    if (t.wheelchair) p.w = t.wheelchair; // yes / limited / no
    if (t.opening_hours) p.h = t.opening_hours;
    if (t.backrest) p.b = t.backrest;
    if (t.fee) p.f = t.fee;
    pois.push(p);
  }
} catch { console.warn("no data/raw/pois.json — building without places"); }
writeFileSync(`${OUT}/pois.json`, JSON.stringify(pois));
const count = (arr, key) => Object.entries(arr.reduce((m, x) => ((m[key(x)] = (m[key(x)] || 0) + 1), m), {})).map(([k, n]) => `${k} ${n}`).join(", ");
console.log(`obstacles on paths: ${uniqueObs.length} (${count(uniqueObs, (o) => OBSTACLES[o[2]][0])})`);
console.log(`places: ${count(pois, (p) => p.c)}`);
console.log(`${ways.size} ways → ${verts.length / 2} vertices, ${edges.length} edges, ${places.length} places`);
