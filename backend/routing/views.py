import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from requests import RequestException
from .services import PlanningError, plan_trip

def health(_request):
    return JsonResponse({'status': 'ok'})

@csrf_exempt
def plan(request):
    if request.method != 'POST': return JsonResponse({'error': 'POST required'}, status=405)
    try:
        body = json.loads(request.body)
        origin, destination = str(body['origin']).strip(), str(body['destination']).strip()
        load_lbs, interval = float(body['loadLbs']), int(body['intervalMiles'])
        if not origin or not destination: raise PlanningError('Origin and destination are required.')
        if not 0 <= load_lbs <= 80000: raise PlanningError('Load weight must be between 0 and 80,000 lb.')
        if interval not in (10, 25, 50): raise PlanningError('Checkpoint interval must be 10, 25, or 50 miles.')
        return JsonResponse(plan_trip(origin, destination, body['departure'], load_lbs, interval))
    except (KeyError, TypeError, ValueError, json.JSONDecodeError, PlanningError) as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    except RequestException:
        return JsonResponse({'error': 'A routing or weather provider is temporarily unavailable.'}, status=502)
