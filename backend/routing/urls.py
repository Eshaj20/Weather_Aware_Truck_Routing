from django.urls import path
from .views import health, plan
urlpatterns = [path('health/', health), path('plan/', plan)]
