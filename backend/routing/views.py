import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import requests

def health(_request):
    return JsonResponse({'status': 'ok'})

@csrf_exempt
def plan(request):
    if request.method != 'POST': return JsonResponse({'error': 'POST required'}, status=405)
    try:
        body = json.loads(request.body)
        origin = _geocode(body['origin']); destination = _geocode(body['destination'])
        url = f"https://router.project-osrm.org/route/v1/driving/{origin['lon']},{origin['lat']};{destination['lon']},{destination['lat']}"
        params = {'alternatives': 3, 'overview': 'full', 'geometries': 'geojson'}
        routes = requests.get(url, params=params, timeout=20).json().get('routes', [])
        return JsonResponse({'origin': origin, 'destination': destination, 'routes': routes})
    except (KeyError, ValueError, requests.RequestException) as exc:
        return JsonResponse({'error': str(exc)}, status=400)

def _geocode(query):
    data = requests.get('https://nominatim.openstreetmap.org/search', params={'q': query, 'format': 'jsonv2', 'limit': 1}, headers={'User-Agent': 'RoadCast/1.0'}, timeout=15).json()
    if not data: raise ValueError(f'Could not find {query}')
    return {'lat': float(data[0]['lat']), 'lon': float(data[0]['lon']), 'name': data[0]['display_name']}
