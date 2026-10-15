import threading
import time
from unittest.mock import patch

from django.test import SimpleTestCase
from .risk import classify, ranking_key, summarize
from .services import weather_batches

class RiskTests(SimpleTestCase):
    def test_all_wind_boundaries(self):
        for wind, level in [(24.9, 'Low'), (25, 'Moderate'), (35, 'High'), (45, 'Severe'), (55, 'No Travel')]:
            self.assertEqual(classify(wind, 0, 0, 0)['level'], level)

    def test_rain_and_snow_boundaries(self):
        self.assertEqual(classify(0, .1, 0, 0)['level'], 'Moderate')
        self.assertEqual(classify(0, 1.01, 0, 0)['level'], 'No Travel')
        self.assertEqual(classify(0, 0, 2, 0)['level'], 'Severe')
        self.assertEqual(classify(0, 0, 3.01, 0)['level'], 'No Travel')

    def test_load_escalations_are_strict(self):
        self.assertEqual(classify(45, 0, 0, 30000)['level'], 'Severe')
        self.assertEqual(classify(45, 0, 0, 30001)['level'], 'No Travel')
        self.assertEqual(classify(35, 0, 0, 40001)['level'], 'Severe')

    def test_missing_weather_is_unavailable(self):
        self.assertEqual(classify(None, 0, 0, 0)['level'], 'Unavailable')

    def test_summary_counts_each_segment_once(self):
        points = [{'mile': 0, 'risk': {'score': 0}}, {'mile': 10, 'risk': {'score': 3}}, {'mile': 20, 'risk': {'score': 0}}]
        summary = summarize(points, 20, 30)
        self.assertEqual(summary['severeMiles'], 20)
        self.assertLessEqual(sum(summary[key] for key in ('noTravelMiles','severeMiles','highMiles','moderateMiles')), 20)

    def test_no_travel_is_ranked_first(self):
        clear = {'summary': {'noTravelMiles': 0, 'severeMiles': 10, 'highMiles': 0, 'averageRisk': 3, 'durationMinutes': 20}}
        blocked = {'summary': {'noTravelMiles': 1, 'severeMiles': 0, 'highMiles': 0, 'averageRisk': 1, 'durationMinutes': 10}}
        self.assertLess(ranking_key(clear), ranking_key(blocked))


class WeatherBatchTests(SimpleTestCase):
    def test_batches_run_concurrently_and_preserve_all_locations(self):
        active = 0
        max_active = 0
        lock = threading.Lock()

        def fake_get(_url, *, params=None, timeout=None):
            nonlocal active, max_active
            with lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.03)
            count = len(params['latitude'].split(','))
            with lock:
                active -= 1
            return [{'location': index} for index in range(count)]

        samples = [{'point': [-96.0, 32.0]} for _ in range(40)]
        with patch('routing.services._get', side_effect=fake_get):
            forecasts = weather_batches(samples)

        self.assertEqual(len(forecasts), 40)
        self.assertGreaterEqual(max_active, 2)
