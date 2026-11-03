// Client-side router: loads the prebuilt graph and finds routes with A*, entirely in the browser.

// Cost multipliers per way class (see scripts/build-graph.mjs CLASSES).
// fietspad, voetpad, woonstraat, erf/ventweg, doorgaande weg, drukke weg, landweg
const PROFILES = {
  rustig: { cls: [1.0, 1.15, 1.1, 1.3, 2.0, 5.0, 1.8], unpaved: 2.5 },
  kortst: { cls: [1, 1, 1, 1, 1.05, 1.2, 1.1], unpaved: 1.3 },
};

const R = 6371008.8;
const RAD = Math.PI / 180;
const COS_LAT = Math.cos(52.65 * RAD);
const metres = (lon1, lat1, lon2, lat2) => {
  const x = (lon2 - lon1) * RAD * COS_LAT;
  const y = (lat2 - lat1) * RAD;
  return Math.sqrt(x * x + y * y) * R;
};

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0], topK = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = topK;
    return top;
  }
}

export class Router {
  constructor(g) {
    this.classes = g.classes;
    this.built = g.built;
    this.names = g.names;
    const nv = g.verts.length / 2;
    this.lon = new Float64Array(nv);
    this.lat = new Float64Array(nv);
    for (let i = 0; i < nv; i++) { this.lon[i] = g.verts[2 * i] / 1e5; this.lat[i] = g.verts[2 * i + 1] / 1e5; }

    const ne = g.edges.length;
    this.eA = new Uint32Array(ne); this.eB = new Uint32Array(ne);
    this.eLen = new Float32Array(ne); this.eCls = new Uint8Array(ne);
    this.eFlags = new Uint8Array(ne); this.eName = new Uint32Array(ne);
    this.eGeom = new Array(ne);
    const deg = new Uint32Array(nv + 1);
    g.edges.forEach(([a, b, len, cls, flags, name, mid], i) => {
      this.eA[i] = a; this.eB[i] = b; this.eLen[i] = len; this.eCls[i] = cls;
      this.eFlags[i] = flags; this.eName[i] = name;
      // Full geometry as flat [lon, lat, ...] from a to b.
      const pts = [this.lon[a], this.lat[a]];
      let x = g.verts[2 * a], y = g.verts[2 * a + 1];
      for (let k = 0; k < mid.length; k += 2) { x += mid[k]; y += mid[k + 1]; pts.push(x / 1e5, y / 1e5); }
      pts.push(this.lon[b], this.lat[b]);
      this.eGeom[i] = pts;
      deg[a + 1]++; deg[b + 1]++;
    });
    // CSR adjacency: arcs stored as edge index, sign tells direction.
    for (let i = 0; i < nv; i++) deg[i + 1] += deg[i];
    this.adjStart = deg;
    this.adj = new Int32Array(ne * 2);
    const fill = deg.slice(0, nv);
    for (let i = 0; i < ne; i++) {
      this.adj[fill[this.eA[i]]++] = i + 1; // forward  a→b
      this.adj[fill[this.eB[i]]++] = -(i + 1); // backward b→a
    }
    // Kerbs and barriers, looked up per edge.
    this.obstacleKinds = g.obstacleKinds || [];
    this.obsByEdge = new Map();
    for (const [x, y, kind, e] of g.obstacles || []) {
      const o = { lon: x / 1e5, lat: y / 1e5, kind, label: this.obstacleKinds[kind][0], hard: this.obstacleKinds[kind][1] === 2 };
      if (!this.obsByEdge.has(e)) this.obsByEdge.set(e, []);
      this.obsByEdge.get(e).push(o);
    }
    this.buildGrid();
    this.dist = new Float64Array(nv);
    this.prev = new Int32Array(nv);
    this.seen = new Uint32Array(nv);
    this.stamp = 0;
  }

  // Spatial grid over every geometry point, for snapping clicks to the nearest path.
  buildGrid() {
    this.cell = 0.004;
    this.grid = new Map();
    this.eGeom.forEach((pts, e) => {
      for (let k = 0; k < pts.length; k += 2) {
        const key = this.key(pts[k], pts[k + 1]);
        let arr = this.grid.get(key);
        if (!arr) this.grid.set(key, (arr = []));
        arr.push(e, k >> 1);
      }
    });
  }
  key(lon, lat) { return Math.floor(lon / this.cell) * 100000 + Math.floor(lat / this.cell); }

  // Nearest point on any edge: { e, seg, point:[lon,lat], toA, toB, off } (metres along edge).
  snap(lon, lat) {
    let best = null;
    for (let ring = 1; ring <= 4 && !best; ring++) {
      const cx = Math.floor(lon / this.cell), cy = Math.floor(lat / this.cell);
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) {
        const arr = this.grid.get((cx + dx) * 100000 + (cy + dy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i += 2) {
          const e = arr[i], k = arr[i + 1], pts = this.eGeom[e];
          for (const s of [k - 1, k]) {
            if (s < 0 || 2 * s + 3 >= pts.length) continue;
            const p = project(lon, lat, pts[2 * s], pts[2 * s + 1], pts[2 * s + 2], pts[2 * s + 3]);
            if (!best || p.d < best.d) best = { e, seg: s, t: p.t, point: [p.x, p.y], d: p.d };
          }
        }
      }
    }
    if (!best || best.d > 1500) return null;
    const pts = this.eGeom[best.e];
    let off = 0, total = 0;
    for (let s = 0; 2 * s + 3 < pts.length; s++) {
      const m = metres(pts[2 * s], pts[2 * s + 1], pts[2 * s + 2], pts[2 * s + 3]);
      if (s < best.seg) off += m;
      else if (s === best.seg) off += m * best.t;
      total += m;
    }
    best.toA = off; best.toB = total - off;
    return best;
  }

  weight(e, prof) {
    const p = PROFILES[prof];
    return p.cls[this.eCls[e]] * (this.eFlags[e] & 1 ? p.unpaved : 1);
  }

  // Extra cost in metres for passing an obstacle, when the rider wants to avoid them.
  penalty(e, avoid) {
    if (!avoid) return 0;
    const f = this.eFlags[e];
    return f & 16 ? 1500 : f & 8 ? 40 : 0;
  }

  // Route between two snapped points.
  // Returns { coords, pieces:[{cls,flags,name,len,coords}], len, obstacles:[{lon,lat,label,hard}] }.
  // `blocked`: edges the rider marked as "couldn't get through here"; they are never used.
  route(from, to, prof = "rustig", avoid = true, blocked = new Set()) {
    const wF = this.weight(from.e, prof), wT = this.weight(to.e, prof);
    let bestCost = Infinity, bestEnd = -1, direct = null;

    if (from.e === to.e) {
      bestCost = Math.abs(from.toA - to.toA) * wF;
      direct = true;
    }

    const stamp = ++this.stamp;
    const { dist, prev, seen, lon, lat } = this;
    const tLon = to.point[0], tLat = to.point[1];
    const h = (v) => metres(lon[v], lat[v], tLon, tLat) * 0.95; // fietspad (w=1) is the cheapest way class
    const heap = new Heap();
    const relax = (v, d, p) => {
      if (seen[v] !== stamp || d < dist[v]) { seen[v] = stamp; dist[v] = d; prev[v] = p; heap.push(d + h(v), v); }
    };
    relax(this.eA[from.e], from.toA * wF, 0);
    relax(this.eB[from.e], from.toB * wF, 0);
    const endA = this.eA[to.e], endB = this.eB[to.e];

    while (heap.size) {
      const v = heap.pop();
      if (heap.lastKey >= bestCost) break;
      const d = dist[v];
      if (heap.lastKey > d + h(v) + 1e-6) continue; // stale entry
      if (v === endA && d + to.toA * wT < bestCost) { bestCost = d + to.toA * wT; bestEnd = v; direct = false; }
      if (v === endB && d + to.toB * wT < bestCost) { bestCost = d + to.toB * wT; bestEnd = v; direct = false; }
      for (let i = this.adjStart[v], n = this.adjStart[v + 1]; i < n; i++) {
        const arc = this.adj[i], e = Math.abs(arc) - 1;
        if (blocked.has(e)) continue;
        const u = arc > 0 ? this.eB[e] : this.eA[e];
        relax(u, d + this.eLen[e] * this.weight(e, prof) + this.penalty(e, avoid), arc);
      }
    }
    if (bestCost === Infinity) return null;

    const pieces = [];
    const push = (e, coords, len, partial = true) => pieces.push({ e, partial, cls: this.eCls[e], flags: this.eFlags[e], name: this.names[this.eName[e]], len, coords });

    if (direct) {
      const c = this.slice(from, to);
      push(from.e, c, Math.abs(from.toA - to.toA));
    } else {
      // Walk back from the end vertex to the start.
      const chain = [];
      let v = bestEnd;
      while (prev[v] !== 0) {
        const arc = prev[v], e = Math.abs(arc) - 1;
        chain.push(arc);
        v = arc > 0 ? this.eA[e] : this.eB[e];
      }
      const startAtA = v === this.eA[from.e];
      push(from.e, this.partial(from, startAtA ? "fromPointToA" : "fromPointToB"), startAtA ? from.toA : from.toB);
      for (let i = chain.length - 1; i >= 0; i--) {
        const arc = chain[i], e = Math.abs(arc) - 1;
        push(e, this.coords(e, arc < 0), this.eLen[e], false);
      }
      const endAtA = bestEnd === endA;
      push(to.e, this.partial(to, endAtA ? "fromAToPoint" : "fromBToPoint"), endAtA ? to.toA : to.toB);
    }
    const coords = [];
    for (const p of pieces) for (const c of p.coords) {
      const last = coords[coords.length - 1];
      if (!last || last[0] !== c[0] || last[1] !== c[1]) coords.push(c);
    }
    return { coords, pieces: pieces.filter((p) => p.len > 0.5), len: pieces.reduce((s, p) => s + p.len, 0), obstacles: this.obstaclesOn(pieces) };
  }

  // Obstacles on the stretches actually ridden; for half-ridden edges, only those on the ridden part.
  obstaclesOn(pieces) {
    const out = [];
    for (const p of pieces) {
      for (const o of this.obsByEdge.get(p.e) || []) {
        if (!p.partial || onLine(o, p.coords)) out.push(o);
      }
    }
    return out;
  }

  coords(e, reverse) {
    const pts = this.eGeom[e], out = [];
    for (let k = 0; k < pts.length; k += 2) out.push([pts[k], pts[k + 1]]);
    return reverse ? out.reverse() : out;
  }

  partial(s, mode) {
    const all = this.coords(s.e, false);
    const before = all.slice(0, s.seg + 1).concat([s.point]); // A … point
    const after = [s.point].concat(all.slice(s.seg + 1)); // point … B
    if (mode === "fromPointToA") return before.reverse();
    if (mode === "fromPointToB") return after;
    if (mode === "fromAToPoint") return before;
    return after.reverse(); // fromBToPoint
  }

  slice(from, to) {
    const all = this.coords(from.e, false);
    const [a, b] = from.toA <= to.toA ? [from, to] : [to, from];
    const out = [a.point, ...all.slice(a.seg + 1, b.seg + 1), b.point];
    return from === a ? out : out.reverse();
  }

  // All edges as GeoJSON (for the optional network overlay).
  networkGeoJSON() {
    const features = [];
    for (let e = 0; e < this.eGeom.length; e++) {
      features.push({ type: "Feature", properties: { cls: this.eCls[e] }, geometry: { type: "LineString", coordinates: this.coords(e, false) } });
    }
    return { type: "FeatureCollection", features };
  }
}

function project(px, py, ax, ay, bx, by) {
  const kx = COS_LAT;
  const dx = (bx - ax) * kx, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? (((px - ax) * kx) * dx + (py - ay) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
  return { t, x, y, d: metres(px, py, x, y) };
}

function onLine(o, coords) {
  for (let i = 1; i < coords.length; i++) {
    if (project(o.lon, o.lat, coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]).d < 2) return true;
  }
  return false;
}

export { metres };
