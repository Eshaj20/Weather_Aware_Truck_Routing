import { summarizeRoute, weatherRisk } from "./risk";

const ROUTER = "https://router.project-osrm.org";
const GEOCODER = "https://nominatim.openstreetmap.org";
const WEATHER = "https://api.open-meteo.com/v1/forecast";

async function json(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.json();
}

async function geocode(query, signal) {
  const data = await json(
    `${GEOCODER}/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    signal,
  );
  if (!data[0]) throw new Error(`Could not find “${query}”`);
  return {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    name: data[0].display_name,
  };
}

function haversineMiles([lon1, lat1], [lon2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad,
    dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolateAtDistance(line, target, lengths) {
  if (target <= 0) return line[0];
  if (target >= lengths[lengths.length - 1]) return line[line.length - 1];
  const index = lengths.findIndex((v) => v >= target);
  const before = index === 0 ? 0 : lengths[index - 1];
  const t = (target - before) / Math.max(lengths[index] - before, 0.0001);
  const a = line[index],
    b = line[index + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function sampleLine(line, distanceMiles, intervalMiles) {
  const lengths = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += haversineMiles(line[i - 1], line[i]);
    lengths.push(total);
  }
  const miles = [];
  for (let mile = 0; mile < distanceMiles; mile += intervalMiles)
    miles.push(mile);
  if (miles.at(-1) !== distanceMiles) miles.push(distanceMiles);
  return miles.map((mile) => ({
    point: interpolateAtDistance(line, total * (mile / distanceMiles), lengths),
    mile,
  }));
}

function nearestHourIndex(times, iso) {
  const target = new Date(iso).getTime();
  let best = 0,
    delta = Infinity;
  times.forEach((time, i) => {
    const d = Math.abs(
      new Date(/[zZ]|[+-]\d\d:\d\d$/.test(time) ? time : `${time}Z`).getTime() -
        target,
    );
    if (d < delta) {
      best = i;
      delta = d;
    }
  });
  return best;
}

async function weatherForPoints(points, signal) {
  const batches = [];
  for (let i = 0; i < points.length; i += 20)
    batches.push(points.slice(i, i + 20));
  const results = await Promise.all(
    batches.map(async (batch) => {
      const latitudes = batch.map((p) => p[1]).join(",");
      const longitudes = batch.map((p) => p[0]).join(",");
    const url = `${WEATHER}?latitude=${latitudes}&longitude=${longitudes}&hourly=wind_speed_10m,rain,snowfall&wind_speed_unit=mph&forecast_days=4&timezone=GMT`;
      const data = await json(url, signal);
      return Array.isArray(data) ? data : [data];
    }),
  );
  return results.flat();
}

function normalizeWeather(entry, eta) {
  if (!entry?.hourly?.time?.length)
    throw new Error("Weather provider returned an incomplete forecast.");
  const i = nearestHourIndex(entry.hourly.time, eta);
  const forecastTime = entry.hourly.time[i];
  const forecastMs = new Date(
    /[zZ]|[+-]\d\d:\d\d$/.test(forecastTime)
      ? forecastTime
      : `${forecastTime}Z`,
  ).getTime();
  if (Math.abs(forecastMs - new Date(eta).getTime()) > 90 * 60000)
    throw new Error(
      "The selected trip falls outside the available forecast window.",
    );
  const raw = [
    entry.hourly.wind_speed_10m?.[i],
    entry.hourly.rain?.[i],
    entry.hourly.snowfall?.[i],
  ].map(Number);
  if (!raw.every(Number.isFinite))
    throw new Error("Weather provider returned an incomplete forecast.");
  return { windMph: raw[0], rainInHr: raw[1] / 25.4, snowInHr: raw[2] / 2.54 };
}

async function ensureThreeRoutes(routes, from, to, signal) {
  const output = [...routes];
  const dx = to.lon - from.lon, dy = to.lat - from.lat;
  const length = Math.hypot(dx, dy) || 1;
  for (const offset of [0.45, -0.45, 0.8, -0.8]) {
    if (output.length >= 3) break;
    const via = {
      lon: (from.lon + to.lon) / 2 + (-dy / length) * offset,
      lat: (from.lat + to.lat) / 2 + (dx / length) * offset,
    };
    let data;
    try {
      data = await json(
        `${ROUTER}/route/v1/driving/${from.lon},${from.lat};${via.lon},${via.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=false`,
        signal,
      );
    } catch {
      continue;
    }
    const candidate = data.routes?.[0];
    if (
      candidate &&
      output.every(
        (route) => Math.abs(route.distance - candidate.distance) > route.distance * 0.01,
      )
    )
      output.push(candidate);
  }
  return output.slice(0, 3);
}

export async function planTrip(
  { origin, destination, departure, loadLbs, intervalMiles },
  signal,
) {
  const apiBase = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
  if (apiBase) {
    const response = await fetch(`${apiBase}/api/plan/`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin,
        destination,
        departure,
        loadLbs,
        intervalMiles,
      }),
    });
    if (!response.ok)
      throw new Error(
        (await response.json().catch(() => ({}))).error ||
          `Planning API returned ${response.status}`,
      );
    return response.json();
  }
  const [from, to] = await Promise.all([
    geocode(origin, signal),
    geocode(destination, signal),
  ]);
  const routesData = await json(
    `${ROUTER}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?alternatives=3&overview=full&geometries=geojson&steps=false`,
    signal,
  );
  const routeOptions = await ensureThreeRoutes(
    routesData.routes || [],
    from,
    to,
    signal,
  );
  if (routeOptions.length < 3)
    throw new Error(
      "The routing provider could not produce three distinct alternatives for this trip.",
    );
  const routes = await Promise.all(
    routeOptions.map(async (route, routeIndex) => {
      const distanceMiles = route.distance / 1609.344;
      const durationMinutes = route.duration / 60;
      const line = route.geometry.coordinates;
      const samples = sampleLine(line, distanceMiles, intervalMiles);
      const forecasts = await weatherForPoints(
        samples.map((s) => s.point),
        signal,
      );
      const checkpoints = samples.map(({ point, mile }, i) => {
        const fraction = mile / distanceMiles;
        const eta = new Date(
          new Date(departure).getTime() + route.duration * 1000 * fraction,
        ).toISOString();
        const weather = normalizeWeather(forecasts[i], eta);
        const forecast = Array.from({ length: 49 }, (_, hour) =>
          normalizeWeather(
            forecasts[i],
            new Date(Date.now() + hour * 3600000).toISOString(),
          ),
        );
        return {
          id: `${routeIndex}-${i}`,
          point,
          mile,
          eta,
          weather,
          forecast,
          risk: weatherRisk(weather, loadLbs),
        };
      });
      return {
        id: `route-${routeIndex + 1}`,
        name: `Route ${String.fromCharCode(65 + routeIndex)}`,
        line,
        checkpoints,
        summary: summarizeRoute(checkpoints, distanceMiles, durationMinutes),
      };
    }),
  );
  return {
    origin: from,
    destination: to,
    routes,
    loadLbs,
    departure,
    source: "live",
  };
}

function syntheticWeather(seed, hour) {
  const windMph =
    16 + Math.max(0, Math.sin(seed * 1.8 + hour / 7)) * 27 + (seed % 3) * 2;
  const rainInHr =
    seed % 5 === 2 ? Math.max(0, Math.sin(hour / 5 + seed)) * 0.34 : 0.02;
  const snowInHr = seed % 7 === 4 ? Math.max(0, Math.sin(hour / 6)) * 0.8 : 0;
  return { windMph, rainInHr, snowInHr };
}

export function demoTrip(
  loadLbs = 36000,
  departure = new Date(Date.now() + 3600000).toISOString(),
) {
  const variants = [
    [
      [-96.797, 32.777],
      [-97.33, 34.1],
      [-98.5, 35.5],
      [-99.8, 37],
      [-101.2, 38.8],
      [-103.2, 39.3],
      [-104.99, 39.74],
    ],
    [
      [-96.797, 32.777],
      [-98.1, 33.5],
      [-99.4, 35.2],
      [-100.4, 36.8],
      [-102, 38],
      [-103.6, 39],
      [-104.99, 39.74],
    ],
    [
      [-96.797, 32.777],
      [-96.9, 34.2],
      [-98.2, 36],
      [-99.7, 37.5],
      [-102, 39.2],
      [-104.99, 39.74],
    ],
  ];
  const distances = [794, 826, 851],
    durations = [760, 795, 822];
  const routes = variants.map((line, r) => {
    const samples = sampleLine(line, distances[r], 50);
    const checkpoints = samples.map(({ point, mile }, i) => {
      const fraction = mile / distances[r];
      const eta = new Date(
        new Date(departure).getTime() + durations[r] * 60000 * fraction,
      ).toISOString();
      const weather = syntheticWeather(i + r * 2, fraction * 24);
      if (r === 1 && i > 7 && i < 12) weather.windMph += 9;
      const forecast = Array.from({ length: 49 }, (_, hour) =>
        syntheticWeather(i + r * 2, hour),
      );
      return {
        id: `${r}-${i}`,
        point,
        mile,
        eta,
        weather,
        forecast,
        risk: weatherRisk(weather, loadLbs),
      };
    });
    return {
      id: `route-${r + 1}`,
      name: ["High plains", "Frontier pass", "Eastern arc"][r],
      line,
      checkpoints,
      summary: summarizeRoute(checkpoints, distances[r], durations[r]),
    };
  });
  return {
    origin: { name: "Dallas, TX" },
    destination: { name: "Denver, CO" },
    routes,
    loadLbs,
    departure,
    source: "demo",
  };
}

export { syntheticWeather };
