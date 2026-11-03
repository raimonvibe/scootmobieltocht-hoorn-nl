// "Volg route": a glowing dot rides the route with a fading trail behind it (deck.gl TripsLayer,
// like the trains on amsterdam-metro). deck.gl is loaded only on first use; without it, a plain dot.
import { metres } from "./router.js";

const DECK_URL = "https://unpkg.com/deck.gl@9.1.14/dist.min.js";
let deckReady = null, overlay = null;

function loadDeck() {
  if (!deckReady) {
    deckReady = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = DECK_URL;
      s.onload = () => (window.deck?.MapboxOverlay ? ok(window.deck) : fail(new Error("deck.gl incompleet")));
      s.onerror = () => fail(new Error("deck.gl kon niet laden"));
      document.head.appendChild(s);
    });
  }
  return deckReady;
}

export function createFollower(map, { reduceMotion, onEnd, pitch }) {
  let raf = 0;

  async function start(coords) {
    stop();
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + metres(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
    const total = cum[cum.length - 1];
    const seconds = Math.min(60, Math.max(12, total / 250)); // a quick preview, not real time

    let deck = null;
    try { deck = await loadDeck(); } catch { /* fall back to the MapLibre dot */ }
    if (deck && !overlay) {
      overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
      map.addControl(overlay);
    }
    const trail = Math.max(250, total * 0.12);
    const draw = (d, p) => {
      if (overlay && deck) {
        overlay.setProps({
          layers: [
            new deck.TripsLayer({
              id: "trail", data: [{ path: coords, ts: cum }], getPath: (x) => x.path, getTimestamps: (x) => x.ts,
              getColor: [13, 122, 107], widthMinPixels: 7, capRounded: true, jointRounded: true,
              fadeTrail: true, trailLength: trail, currentTime: d,
            }),
            new deck.ScatterplotLayer({
              id: "glow", data: [p], getPosition: (x) => x, radiusUnits: "pixels",
              getRadius: 22, getFillColor: [255, 201, 77, 110], stroked: false,
            }),
            new deck.ScatterplotLayer({
              id: "dot", data: [p], getPosition: (x) => x, radiusUnits: "pixels",
              getRadius: 8, getFillColor: [13, 122, 107], stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 3,
            }),
          ],
        });
      } else {
        map.getSource("me")?.setData({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: p } });
      }
    };

    if (!reduceMotion) map.easeTo({ zoom: 16, pitch: pitch(), duration: 800 });
    const t0 = performance.now();
    let seg = 0;
    const bearingOf = (a, b) => (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
    const step = (now) => {
      const d = Math.min(1, (now - t0) / 1000 / seconds) * total;
      while (seg < cum.length - 2 && cum[seg + 1] < d) seg++;
      const f = (d - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
      const a = coords[seg], b = coords[seg + 1] || a;
      const p = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      draw(d, p);
      if (reduceMotion) map.jumpTo({ center: p });
      else {
        const turn = ((bearingOf(a, b) - map.getBearing() + 540) % 360) - 180;
        map.jumpTo({ center: p, bearing: map.getBearing() + turn * 0.04 });
      }
      if (d < total) raf = requestAnimationFrame(step);
      else { raf = 0; onEnd(true); }
    };
    raf = requestAnimationFrame(step);
  }

  function stop(keepDot) {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!keepDot) {
      overlay?.setProps({ layers: [] });
      map.getSource("me")?.setData({ type: "FeatureCollection", features: [] });
    }
  }

  return { start, stop, get running() { return raf !== 0; } };
}
