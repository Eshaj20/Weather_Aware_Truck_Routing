import { summarizeRoute, weatherRisk } from './risk';

const ROUTER = 'https://router.project-osrm.org';
const GEOCODER = 'https://nominatim.openstreetmap.org';
const WEATHER = 'https://api.open-meteo.com/v1/forecast';

async function json(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.json();
}

async function geocode(query, signal) {
  const data = await json(`${GEOCODER}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, signal);
  if (!data[0]) throw new Error(`Could not find “${query}”`);
  return { lat: Number(data[0].lat), lon: Number(data[0].lon), name: data[0].display_name };
}

function interpolate(line, fraction) {
  if (fraction <= 0) return line[0];
  if (fraction >= 1) return line[line.length - 1];
  const lengths = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const [aLon, aLat] = line[i - 1];
    const [bLon, bLat] = line[i];
    const miles = Math.hypot((bLat - aLat) * 69, (bLon - aLon) * 55);
    total += miles;
    lengths.push(total);
  }
  const target = total * fraction;
  const index = lengths.findIndex(v => v >= target);
  const before = index === 0 ? 0 : lengths[index - 1];
  const t = (target - before) / Math.max(lengths[index] - before, 0.0001);
  const a = line[index], b = line[index + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function sampleLine(line, distanceMiles, intervalMiles) {
  const count = Math.max(2, Math.ceil(distanceMiles / intervalMiles) + 1);
  return Array.from({ length: count }, (_, i) => interpolate(line, i / (count - 1)));
}

function nearestHourIndex(times, iso) {
  const target = new Date(iso).getTime();
  let best = 0, delta = Infinity;
  times.forEach((time, i) => {
    const d = Math.abs(new Date(time).getTime() - target);
    if (d < delta) { best = i; delta = d; }
  });
  return best;
}

async function weatherForPoints(points, signal) {
  const batches = [];
  for (let i = 0; i < points.length; i += 20) batches.push(points.slice(i, i + 20));
  const results = await Promise.all(batches.map(async batch => {
    const latitudes = batch.map(p => p[1]).join(',');
    const longitudes = batch.map(p => p[0]).join(',');
    const url = `${WEATHER}?latitude=${latitudes}&longitude=${longitudes}&hourly=wind_speed_10m,rain,snowfall&wind_speed_unit=mph&forecast_days=3&timezone=GMT`;
    const data = await json(url, signal);
    return Array.isArray(data) ? data : [data];
  }));
  return results.flat();
}

function normalizeWeather(entry, eta, fallbackSeed = 0) {
  if (!entry?.hourly?.time?.length) return syntheticWeather(fallbackSeed, 0);
  const i = nearestHourIndex(entry.hourly.time, eta);
  return {
    windMph: Number(entry.hourly.wind_speed_10m?.[i] || 0),
    rainInHr: Number(entry.hourly.rain?.[i] || 0) / 25.4,
    snowInHr: Number(entry.hourly.snowfall?.[i] || 0) / 2.54,
  };
}

export async function planTrip({ origin, destination, departure, loadLbs, intervalMiles }, signal) {
  const [from, to] = await Promise.all([geocode(origin, signal), geocode(destination, signal)]);
  const routesData = await json(`${ROUTER}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=3&overview=full&geometries=geojson&steps=false`, signal);
  if (!routesData.routes?.length) throw new Error('No drivable route was returned.');
  const routes = await Promise.all(routesData.routes.slice(0, 3).map(async (route, routeIndex) => {
    const distanceMiles = route.distance / 1609.344;
    const durationMinutes = route.duration / 60;
    const line = route.geometry.coordinates;
    const points = sampleLine(line, distanceMiles, intervalMiles);
    const forecasts = await weatherForPoints(points, signal);
    const checkpoints = points.map((point, i) => {
      const fraction = i / (points.length - 1);
      const eta = new Date(new Date(departure).getTime() + route.duration * 1000 * fraction).toISOString();
      const weather = normalizeWeather(forecasts[i], eta, i + routeIndex);
      const forecast = Array.from({ length: 49 }, (_, hour) => normalizeWeather(forecasts[i], new Date(Date.now() + hour * 3600000).toISOString(), i + routeIndex));
      return { id: `${routeIndex}-${i}`, point, mile: distanceMiles * fraction, eta, weather, forecast, risk: weatherRisk(weather, loadLbs) };
    });
    return { id: `route-${routeIndex + 1}`, name: ['Safest route', 'Balanced route', 'Alternate route'][routeIndex], line, checkpoints, summary: summarizeRoute(checkpoints, distanceMiles, durationMinutes) };
  }));
  return { origin: from, destination: to, routes };
}

function syntheticWeather(seed, hour) {
  const windMph = 16 + Math.max(0, Math.sin(seed * 1.8 + hour / 7)) * 27 + (seed % 3) * 2;
  const rainInHr = seed % 5 === 2 ? Math.max(0, Math.sin(hour / 5 + seed)) * 0.34 : 0.02;
  const snowInHr = seed % 7 === 4 ? Math.max(0, Math.sin(hour / 6)) * 0.8 : 0;
  return { windMph, rainInHr, snowInHr };
}

export function demoTrip(loadLbs = 36000, departure = new Date(Date.now() + 3600000).toISOString()) {
  const variants = [
    [[-96.797,32.777],[-97.33,34.1],[-98.5,35.5],[-99.8,37],[-101.2,38.8],[-103.2,39.3],[-104.99,39.74]],
    [[-96.797,32.777],[-98.1,33.5],[-99.4,35.2],[-100.4,36.8],[-102,38],[-103.6,39],[-104.99,39.74]],
    [[-96.797,32.777],[-96.9,34.2],[-98.2,36],[-99.7,37.5],[-102,39.2],[-104.99,39.74]],
  ];
  const distances = [794, 826, 851], durations = [760, 795, 822];
  const routes = variants.map((line, r) => {
    const points = sampleLine(line, distances[r], 50);
    const checkpoints = points.map((point, i) => {
      const fraction = i / (points.length - 1);
      const eta = new Date(new Date(departure).getTime() + durations[r] * 60000 * fraction).toISOString();
      const weather = syntheticWeather(i + r * 2, fraction * 24);
      if (r === 1 && i > 7 && i < 12) weather.windMph += 9;
      const forecast = Array.from({ length: 49 }, (_, hour) => syntheticWeather(i + r * 2, hour));
      return { id: `${r}-${i}`, point, mile: distances[r] * fraction, eta, weather, forecast, risk: weatherRisk(weather, loadLbs) };
    });
    return { id: `route-${r + 1}`, name: ['High plains', 'Frontier pass', 'Eastern arc'][r], line, checkpoints, summary: summarizeRoute(checkpoints, distances[r], durations[r]) };
  });
  return { origin: { name: 'Dallas, TX' }, destination: { name: 'Denver, CO' }, routes };
}

export { syntheticWeather };
