import os
from django.core.wsgi import get_wsgi_application
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'roadcast.settings')
application = get_wsgi_application()

# Vercel's Python runtime discovers a top-level WSGI variable named `app`.
# Django and traditional WSGI servers continue to use `application`.
app = application
