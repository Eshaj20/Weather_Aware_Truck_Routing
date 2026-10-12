LEVELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']


def classify(wind_mph=None, rain_in_hr=None, snow_in_hr=None, load_lbs=0):
    if any(value is None for value in (wind_mph, rain_in_hr, snow_in_hr)):
        return {'score': None, 'level': 'Unavailable', 'reason': 'Forecast data unavailable'}
    wind = 4 if wind_mph >= 55 else 3 if wind_mph >= 45 else 2 if wind_mph >= 35 else 1 if wind_mph >= 25 else 0
    rain = 4 if rain_in_hr > 1 else 3 if rain_in_hr >= .5 else 2 if rain_in_hr >= .25 else 1 if rain_in_hr >= .1 else 0
    snow = 4 if snow_in_hr > 3 else 3 if snow_in_hr >= 2 else 2 if snow_in_hr >= 1 else 1 if snow_in_hr >= .5 else 0
    score = max(wind, rain, snow)
    reasons = []
    if score == wind and wind: reasons.append(f'{wind_mph:.0f} mph wind')
    if score == rain and rain: reasons.append(f'{rain_in_hr:.2f} in/hr rain')
    if score == snow and snow: reasons.append(f'{snow_in_hr:.1f} in/hr snow')
    if wind_mph >= 55:
        score = 4
    elif wind_mph >= 45 and load_lbs > 30000:
        score = 4; reasons.insert(0, 'heavy-load wind restriction')
    elif wind_mph >= 35 and load_lbs > 40000:
        score = max(score, 3); reasons.insert(0, 'heavy-load wind escalation')
    return {'score': score, 'level': LEVELS[score], 'reason': reasons[0] if reasons else 'Conditions within normal operating range'}


def summarize(checkpoints, distance_miles, duration_minutes):
    totals = {'noTravelMiles': 0, 'severeMiles': 0, 'highMiles': 0, 'moderateMiles': 0, 'weightedRisk': 0}
    for previous, current in zip(checkpoints, checkpoints[1:]):
        miles = max(0, current['mile'] - previous['mile'])
        score = max(previous['risk']['score'], current['risk']['score'])
        key = {4: 'noTravelMiles', 3: 'severeMiles', 2: 'highMiles', 1: 'moderateMiles'}.get(score)
        if key: totals[key] += miles
        totals['weightedRisk'] += score * miles
    return {**totals, 'averageRisk': totals['weightedRisk'] / max(distance_miles, 1),
            'maxRisk': max(c['risk']['score'] for c in checkpoints),
            'distanceMiles': distance_miles, 'durationMinutes': duration_minutes}


def ranking_key(route):
    summary = route['summary']
    return (summary['noTravelMiles'], summary['severeMiles'], summary['highMiles'],
            summary['averageRisk'], summary['durationMinutes'])
