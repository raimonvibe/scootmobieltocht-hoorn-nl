// Wind and weather from Open-Meteo (free, no key, allows browser requests).
// Each fetch is also kept on the device for 24 hours, so the forecast fetched at home on wifi
// is still there on the road without internet.

const URL_ = "https://api.open-meteo.com/v1/forecast?latitude=52.64&longitude=5.06" +
  "&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation" +
  "&hourly=precipitation_probability,wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m&forecast_hours=24" +
  "&daily=sunrise,sunset&forecast_days=2&wind_speed_unit=ms&timezone=Europe%2FAmsterdam";
const MAX_AGE = 15 * 60 * 1000;
const KEEP = 24 * 3600 * 1000;
const STORE = "scootmobiel-weather";
let cached = null;

export async function getWeather() {
  if (cached && Date.now() - cached.at < MAX_AGE) return cached.data;
  let j, savedAt = null;
  try {
    if (navigator.onLine === false) throw new Error("offline");
    const r = await fetch(URL_);
    if (!r.ok) throw new Error("weer niet beschikbaar");
    j = await r.json();
    try { localStorage.setItem(STORE, JSON.stringify({ at: Date.now(), j })); } catch { /* storage full or blocked */ }
  } catch (err) {
    // No internet: use the last forecast, if it's less than a day old.
    let kept = null;
    try { kept = JSON.parse(localStorage.getItem(STORE)); } catch { /* nothing kept */ }
    if (!kept || Date.now() - kept.at > KEEP) throw err;
    j = kept.j; savedAt = kept.at;
  }
  const data = build(j, savedAt);
  if (!data.hours.length) throw new Error("weerbericht te oud");
  cached = { at: Date.now(), data };
  return data;
}

// Local hour key like the API's "2026-11-03T14:00", to find "now" in an hourly list.
function hourKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

function build(j, savedAt) {
  const h = j.hourly || {};
  const now = hourKey();
  const hours = (h.time || []).map((time, i) => ({
    time,
    wind: h.wind_speed_10m[i],
    from: h.wind_direction_10m[i], // degrees the wind comes FROM
    gust: h.wind_gusts_10m?.[i] ?? h.wind_speed_10m[i] * 1.5,
    temp: h.temperature_2m[i],
    rain: h.precipitation_probability[i],
  })).filter((x) => x.time >= now);
  // Fresh: the live "current" values. Kept forecast: the hour that is now.
  const cur = savedAt ? hours[0] : null;
  const today = now.slice(0, 10);
  const day = Math.max(0, (j.daily?.time || []).indexOf(today));
  return {
    temp: cur ? cur.temp : j.current.temperature_2m,
    wind: cur ? cur.wind : j.current.wind_speed_10m,
    gust: cur ? cur.gust : j.current.wind_gusts_10m,
    from: cur ? cur.from : j.current.wind_direction_10m,
    rainNow: cur ? 0 : j.current.precipitation,
    rainChance: Math.max(0, ...hours.slice(0, 4).map((x) => x.rain)),
    hours: hours.slice(0, 12),
    sunrise: j.daily?.sunrise?.[day],
    sunset: j.daily?.sunset?.[day],
    savedAt,
  };
}

// Wind direction as one of eight compass points (0 = north); the words come from the language file.
export const dirIndex = (deg) => Math.round(deg / 45) % 8;
export function beaufort(ms) {
  const limits = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
  const i = limits.findIndex((l) => ms < l);
  return i === -1 ? 12 : i;
}

// Average head-wind component along a route (m/s, positive = against you), weighted by distance.
// 10 m wind is stronger than at seat height; 0.7 is a common rule of thumb for open, flat land.
export function headwind(coords, w) {
  let sum = 0, len = 0;
  const from = (w.from * Math.PI) / 180;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1], [x2, y2] = coords[i];
    const dx = (x2 - x1) * Math.cos((y1 * Math.PI) / 180), dy = y2 - y1;
    const m = Math.hypot(dx, dy);
    if (!m) continue;
    const heading = Math.atan2(dx, dy); // direction of travel, 0 = north
    sum += Math.cos(heading - from) * m;
    len += m;
  }
  return len ? (sum / len) * w.wind * 0.7 : 0;
}

// Best hour to leave in the coming 12 hours, in daylight: least battery use from wind and cold,
// and as little chance of rain as possible. Returns null when "now" is already about as good.
export function bestDeparture(coords, w, retour) {
  const score = (h) => {
    const hw = headwind(coords, h);
    const f = batteryFactor(hw, h.temp) + (retour ? batteryFactor(-hw, h.temp) : 0);
    return f * 100 + h.rain * 0.6;
  };
  const light = (t) => (!w.sunrise || t >= w.sunrise) && (!w.sunset || t <= w.sunset.slice(0, 11) + String(+w.sunset.slice(11, 13) - 1).padStart(2, "0") + w.sunset.slice(13));
  const hours = w.hours.filter((h) => light(h.time));
  if (hours.length < 2) return null;
  const now = hours[0];
  const best = hours.reduce((a, b) => (score(b) < score(a) ? b : a));
  if (best === now || score(now) - score(best) < 6) return null;
  return { time: best.time.slice(11, 16), rain: best.rain, wind: best.wind, nowRain: now.rain };
}

// Rough battery effect, as a factor on normal use. An estimate, not a measurement:
// ~3% extra per m/s of head wind, ~1.5% saving per m/s of tail wind, and cold batteries hold less.
export function batteryFactor(hw, temp) {
  const wind = hw > 0 ? 1 + 0.03 * hw : 1 + 0.015 * hw;
  const cold = temp < 10 ? 1 + Math.min(0.2, (10 - temp) * 0.01) : 1;
  return wind * cold;
}
