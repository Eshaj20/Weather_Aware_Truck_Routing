LEVELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']

def classify(wind_mph=0, rain_in_hr=0, snow_in_hr=0, load_lbs=0):
    wind = 4 if wind_mph >= 55 else 3 if wind_mph >= 45 else 2 if wind_mph >= 35 else 1 if wind_mph >= 25 else 0
    rain = 4 if rain_in_hr > 1 else 3 if rain_in_hr >= .5 else 2 if rain_in_hr >= .25 else 1 if rain_in_hr >= .1 else 0
    snow = 4 if snow_in_hr > 3 else 3 if snow_in_hr >= 2 else 2 if snow_in_hr >= 1 else 1 if snow_in_hr >= .5 else 0
    score = max(wind, rain, snow)
    if wind_mph >= 55 or (wind_mph >= 45 and load_lbs > 30000): score = 4
    elif wind_mph >= 35 and load_lbs > 40000: score = max(score, 3)
    return {'score': score, 'level': LEVELS[score]}
