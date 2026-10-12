from datetime import datetime, timezone, timedelta
from math import asin, cos, radians, sin, sqrt
import requests
from .risk import classify, summarize, ranking_key

ROUTER = 'https://router.project-osrm.org'
GEOCODER = 'https://nominatim.openstreetmap.org'
WEATHER = 'https://api.open-meteo.com/v1/forecast'


class PlanningError(ValueError):
    pass


def _get(url, *, params=None, timeout=25):
    response = requests.get(url, params=params, headers={'User-Agent': 'RoadCast/1.0'}, timeout=timeout)
    response.raise_for_status()
    return response.json()


def geocode(query):
    data = _get(f'{GEOCODER}/search', params={'q': query, 'format': 'jsonv2', 'limit': 1})
    if not data: raise PlanningError(f'Could not find “{query}”')
    return {'lat': float(data[0]['lat']), 'lon': float(data[0]['lon']), 'name': data[0]['display_name']}


def haversine(a, b):
    lon1, lat1 = map(radians, a); lon2, lat2 = map(radians, b)
    dlon, dlat = lon2 - lon1, lat2 - lat1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 3958.7613 * 2 * asin(sqrt(value))


def sample_line(line, route_miles, interval):
    cumulative, total = [], 0
    for previous, current in zip(line, line[1:]):
        total += haversine(previous, current); cumulative.append(total)
    targets = list(range(0, int(route_miles), interval))
    if not targets or targets[-1] != route_miles: targets.append(route_miles)
    samples = []
    for mile in targets:
        geometry_target = total * mile / route_miles
        index = next((i for i, value in enumerate(cumulative) if value >= geometry_target), len(cumulative) - 1)
        before = cumulative[index - 1] if index else 0
        ratio = (geometry_target - before) / max(cumulative[index] - before, .000001)
        start, end = line[index], line[index + 1]
        point = [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]
        samples.append({'point': point, 'mile': float(mile)})
    return samples


def weather_batches(samples):
    forecasts = []
    for start in range(0, len(samples), 20):
        batch = samples[start:start + 20]
        data = _get(WEATHER, params={
            'latitude': ','.join(str(s['point'][1]) for s in batch),
            'longitude': ','.join(str(s['point'][0]) for s in batch),
            'hourly': 'wind_speed_10m,rain,snowfall', 'wind_speed_unit': 'mph',
            'forecast_days': 4, 'timezone': 'GMT',
        })
        forecasts.extend(data if isinstance(data, list) else [data])
    if len(forecasts) != len(samples): raise PlanningError('Weather provider returned an incomplete forecast.')
    return forecasts


def parse_time(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def weather_at(entry, moment):
    times = [parse_time(value) for value in entry.get('hourly', {}).get('time', [])]
    if not times: raise PlanningError('Weather provider returned an incomplete forecast.')
    index = min(range(len(times)), key=lambda i: abs((times[i] - moment).total_seconds()))
    if abs((times[index] - moment).total_seconds()) > 5400:
        raise PlanningError('The selected trip falls outside the available forecast window.')
    hourly = entry['hourly']
    try:
        values = [float(hourly[name][index]) for name in ('wind_speed_10m', 'rain', 'snowfall')]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise PlanningError('Weather provider returned an incomplete forecast.') from exc
    return {'windMph': values[0], 'rainInHr': values[1] / 25.4, 'snowInHr': values[2] / 2.54}


def ensure_three_routes(routes, origin, destination):
    output = list(routes)
    dx, dy = destination['lon'] - origin['lon'], destination['lat'] - origin['lat']
    length = sqrt(dx * dx + dy * dy) or 1
    for offset in (.45, -.45, .8, -.8):
        if len(output) >= 3: break
        via_lon = (origin['lon'] + destination['lon']) / 2 + (-dy / length) * offset
        via_lat = (origin['lat'] + destination['lat']) / 2 + (dx / length) * offset
        try:
            data = _get(f"{ROUTER}/route/v1/driving/{origin['lon']},{origin['lat']};{via_lon},{via_lat};{destination['lon']},{destination['lat']}", params={
                'overview': 'full', 'geometries': 'geojson', 'steps': 'false',
            })
        except requests.RequestException:
            continue
        candidate = (data.get('routes') or [None])[0]
        if candidate and all(abs(route['distance'] - candidate['distance']) > route['distance'] * .01 for route in output):
            output.append(candidate)
    return output[:3]


def plan_trip(origin_text, destination_text, departure_text, load_lbs, interval):
    departure = parse_time(departure_text)
    origin, destination = geocode(origin_text), geocode(destination_text)
    route_data = _get(f"{ROUTER}/route/v1/driving/{origin['lon']},{origin['lat']};{destination['lon']},{destination['lat']}", params={
        'alternatives': 3, 'overview': 'full', 'geometries': 'geojson', 'steps': 'false',
    })
    raw_routes = ensure_three_routes(route_data.get('routes', []), origin, destination)
    if len(raw_routes) < 3: raise PlanningError('The routing provider could not produce three distinct alternatives for this trip.')
    routes = []
    for route_index, raw in enumerate(raw_routes[:3]):
        distance, duration = raw['distance'] / 1609.344, raw['duration'] / 60
        line = raw['geometry']['coordinates']
        samples = sample_line(line, distance, interval)
        forecasts = weather_batches(samples)
        checkpoints = []
        for index, (sample, forecast_data) in enumerate(zip(samples, forecasts)):
            eta = departure + timedelta(seconds=raw['duration'] * sample['mile'] / distance)
            weather = weather_at(forecast_data, eta)
            hourly = [weather_at(forecast_data, datetime.now(timezone.utc) + timedelta(hours=hour)) for hour in range(49)]
            checkpoints.append({'id': f'{route_index}-{index}', **sample, 'eta': eta.isoformat(),
                                'weather': weather, 'forecast': hourly,
                                'risk': classify(weather['windMph'], weather['rainInHr'], weather['snowInHr'], load_lbs)})
        routes.append({'id': f'route-{route_index + 1}', 'name': f'Route {chr(65 + route_index)}', 'line': line,
                       'checkpoints': checkpoints, 'summary': summarize(checkpoints, distance, duration)})
    recommended = min(routes, key=ranking_key)['id']
    return {'origin': origin, 'destination': destination, 'routes': routes, 'recommendedRouteId': recommended,
            'loadLbs': load_lbs, 'departure': departure.isoformat(), 'source': 'live'}
