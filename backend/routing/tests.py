from django.test import SimpleTestCase
from .risk import classify

class RiskTests(SimpleTestCase):
    def test_no_travel_for_universal_wind_limit(self):
        self.assertEqual(classify(wind_mph=55, load_lbs=0)['level'], 'No Travel')
    def test_heavy_load_escalation(self):
        self.assertEqual(classify(wind_mph=35, load_lbs=40001)['level'], 'Severe')
    def test_worst_hazard_wins(self):
        self.assertEqual(classify(wind_mph=5, rain_in_hr=.6)['level'], 'Severe')
