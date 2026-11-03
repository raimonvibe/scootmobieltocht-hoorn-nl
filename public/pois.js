// Places useful on a scootmobiel ride (from OpenStreetMap, built into public/data/pois.json).

export const CATS = {
  toilet: { label: "Toiletten", one: "toilet", color: "#3b8bd4", glyph: "WC", on: true },
  bankje: { label: "Bankjes", one: "bankje", color: "#6d6a5f", glyph: "", on: false, small: true },
  supermarkt: { label: "Supermarkten", one: "supermarkt", color: "#1a9850", glyph: "S", on: false },
  apotheek: { label: "Apotheken", one: "apotheek", color: "#c2185b", glyph: "+", on: false },
  laadpunt: { label: "Laadpunten", one: "laadpunt", color: "#f39c12", glyph: "⚡", on: true },
  scootmobielwinkel: { label: "Scootmobielwinkels", one: "scootmobielwinkel", color: "#7b3fb5", glyph: "🛵", on: true },
};

// Map icons drawn on a canvas, so they need no icon font or sprite sheet.
export function icon(cat) {
  const c = CATS[cat];
  const size = c.small ? 18 : 30, r = size / 2, px = 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size * px;
  const g = cv.getContext("2d");
  g.scale(px, px);
  g.beginPath(); g.arc(r, r, r - 1.5, 0, Math.PI * 2);
  g.fillStyle = c.color; g.fill();
  g.lineWidth = 2; g.strokeStyle = "#fff"; g.stroke();
  if (c.glyph) {
    g.fillStyle = "#fff";
    g.font = `bold ${c.glyph.length > 1 ? 11 : 15}px system-ui, sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(c.glyph, r, r + 1);
  }
  return { width: size * px, height: size * px, data: g.getImageData(0, 0, size * px, size * px).data };
}

const WHEEL = { yes: "rolstoeltoegankelijk", limited: "beperkt rolstoeltoegankelijk", no: "niet rolstoeltoegankelijk" };

export function describe(p) {
  const c = CATS[p.c];
  const bits = [];
  if (p.w) bits.push(WHEEL[p.w] || "");
  if (p.c === "toilet" && p.f) bits.push(p.f === "no" ? "gratis" : "betaald");
  if (p.c === "bankje" && p.b) bits.push(p.b === "yes" ? "met rugleuning" : "zonder rugleuning");
  if (p.h) bits.push(`open: ${p.h}`);
  return { title: p.n || c.one[0].toUpperCase() + c.one.slice(1), sub: c.one, bits: bits.filter(Boolean) };
}

// Distance (m) from a point to the nearest vertex of a line — fine for "is this near the route".
export function distToLine(lon, lat, coords, step = 1) {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = Infinity, at = 0;
  for (let i = 0; i < coords.length; i += step) {
    const dx = (coords[i][0] - lon) * k, dy = coords[i][1] - lat;
    const d = dx * dx + dy * dy;
    if (d < best) { best = d; at = i; }
  }
  return { d: Math.sqrt(best) * 111320, at };
}
