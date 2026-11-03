// Places useful on a scootmobiel ride (from OpenStreetMap, built into public/data/pois.json).

export const CATS = {
  toilet: { label: "Toiletten", one: "toilet", color: "#3b8bd4", light: "#7cc8ff", on: true },
  bankje: { label: "Bankjes", one: "bankje", color: "#6d6a5f", light: "#a29d8f", on: false, small: true },
  supermarkt: { label: "Supermarkten", one: "supermarkt", color: "#1a9850", light: "#5fd38f", on: false },
  apotheek: { label: "Apotheken", one: "apotheek", color: "#c2185b", light: "#ff6fa3", on: false },
  laadpunt: { label: "Laadpunten", one: "laadpunt", color: "#e08a00", light: "#ffd166", on: true },
  scootmobielwinkel: { label: "Scootmobielwinkels", one: "scootmobielwinkel", color: "#5b3fc4", light: "#b693ff", on: true },
};

// Zoom level from which each kind shows on the map: toilets and scootmobiel shops always,
// shops and pharmacies once you zoom in, benches only close up. Keeps the overview calm.
export const MINZOOM = { toilet: 10, scootmobielwinkel: 10, laadpunt: 13.5, supermarkt: 14, apotheek: 14, bankje: 15.5 };

// White pictograms on a 24×24 grid (the same drawings as the page's icon set).
const GLYPH = {
  toilet: "M8 4.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm8 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zM6.4 9.2h3.2v5.2H8.9V19H7.1v-4.6h-.7zm8.2 0h2.8l1.8 6h-1.6V19h-1.2v-3.8h-.8V19h-1.2v-3.8h-1.6z",
  supermarkt: "M3 4h2.6l2.2 10.2h9.6L19.6 7H7.3l-.5-2zM9 16.4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z",
  apotheek: "M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z",
  laadpunt: "M13.5 2 5 13.5h5.5L9.5 22 19 9.8h-5.6z",
  scootmobielwinkel: "M4.7 3.6c0-.6.5-1.1 1.1-1.1h.8c.6 0 1.1.5 1.1 1.1V9.6h3.5c.7 0 1.2.5 1.2 1.2v.8c0 .7-.5 1.2-1.2 1.2H9.6v1.6h4.2l2.7-8.8h-1.2a.9.9 0 1 1 0-1.8h3.8a.9.9 0 1 1 0 1.8h-.8l-2.7 8.8h2.2c1.3 0 2.4 1.1 2.4 2.4v.6H3.3v-.8c0-1.2 1-2.2 2.2-2.2h2.2v-1.6H5.9c-.7 0-1.2-.5-1.2-1.2zM6.4 16.7a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4zm11.5 0a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4z",
  bankje: "M4 9h16v3H4zm1 4h2v6H5zm12 0h2v6h-2zM4 13.5h16v2H4z",
};

// Map icons drawn on a canvas: a round badge with a colour gradient and a white pictogram.
export function icon(cat) {
  const c = CATS[cat];
  const size = c.small ? 22 : 34, r = size / 2, px = 2;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size * px;
  const g = cv.getContext("2d");
  g.scale(px, px);
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, c.light); grad.addColorStop(1, c.color);
  g.beginPath(); g.arc(r, r, r - 1.5, 0, Math.PI * 2);
  g.fillStyle = grad; g.fill();
  g.lineWidth = 2.2; g.strokeStyle = "#fff"; g.stroke();
  const s = (size * 0.62) / 24;
  g.translate(r - 12 * s, r - 12 * s);
  g.scale(s, s);
  g.fillStyle = "#fff";
  g.fill(new Path2D(GLYPH[cat]), "evenodd");
  return { width: size * px, height: size * px, data: g.getImageData(0, 0, size * px, size * px).data };
}

const WHEEL = { yes: "rolstoeltoegankelijk", limited: "beperkt rolstoeltoegankelijk", no: "niet rolstoeltoegankelijk" };

export function describe(p) {
  const c = CATS[p.c];
  const bits = [];
  if (p.w) bits.push(WHEEL[p.w] || "");
  if (p.c === "toilet" && p.f) bits.push(p.f === "no" ? "gratis" : "betaald");
  if (p.c === "bankje" && p.b) bits.push(p.b === "yes" ? "met rugleuning" : "zonder rugleuning");
  if (p.h) bits.push(`open: ${hoursNl(p.h)}`);
  return { title: p.n || c.one[0].toUpperCase() + c.one.slice(1), sub: c.one, bits: bits.filter(Boolean) };
}

// OpenStreetMap writes opening hours with English day names ("Mo-Sa 08:00-20:00; Su off").
const DAYS = { Mo: "ma", Tu: "di", We: "wo", Th: "do", Fr: "vr", Sa: "za", Su: "zo", PH: "feestdagen", SH: "schoolvakanties" };
function hoursNl(h) {
  return h
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b/g, (d) => DAYS[d])
    .replace(/\boff\b|\bclosed\b/g, "gesloten")
    .replace(/24\/7/g, "dag en nacht")
    .replace(/;\s*/g, "; ");
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
