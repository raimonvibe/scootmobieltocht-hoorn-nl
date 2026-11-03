// Wind and weather from Open-Meteo (free, no key, allows browser requests), and what it does to the battery.

const URL_ = "https://api.open-meteo.com/v1/forecast?latitude=52.64&longitude=5.06" +
  "&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation" +
  "&hourly=precipitation_probability,wind_speed_10m,wind_direction_10m,temperature_2m&forecast_hours=12" +
  "&daily=sunrise,sunset&forecast_days=1&wind_speed_unit=ms&timezone=Europe%2FAmsterdam";
const MAX_AGE = 15 * 60 * 1000;
let cached = null;

export async function getWeather() {
  if (cached && Date.now() - cached.at < MAX_AGE) return cached.data;
  const r = await fetch(URL_);
  if (!r.ok) throw new Error("weer niet beschikbaar");
  const j = await r.json();
  const data = {
    temp: j.current.temperature_2m,
    wind: j.current.wind_speed_10m,
    gust: j.current.wind_gusts_10m,
    from: j.current.wind_direction_10m, // degrees the wind comes FROM
    rainNow: j.current.precipitation,
    rainChance: Math.max(...(j.hourly?.precipitation_probability || [0]).slice(0, 4)),
    hours: (j.hourly?.time || []).map((t, i) => ({
      time: t, // local time, "2026-11-03T14:00"
      wind: j.hourly.wind_speed_10m[i],
      from: j.hourly.wind_direction_10m[i],
      temp: j.hourly.temperature_2m[i],
      rain: j.hourly.precipitation_probability[i],
    })),
    sunrise: j.daily?.sunrise?.[0],
    sunset: j.daily?.sunset?.[0],
  };
  cached = { at: Date.now(), data };
  return data;
}

const DIRS = ["noorden", "noordoosten", "oosten", "zuidoosten", "zuiden", "zuidwesten", "westen", "noordwesten"];
export const dirName = (deg) => DIRS[Math.round(deg / 45) % 8];
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
