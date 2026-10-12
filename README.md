# RoadCast — Weather-Aware Truck Routing

RoadCast compares three truck routes using forecast conditions at the truck's estimated arrival time. It follows the supplied wind, rain, snow, and load thresholds, then recommends by severe miles, high-risk miles, average risk, and travel time—in that order.

## Architecture

- **React + Vite** interactive planning UI and Leaflet map
- **Django** API boundary for production proxying and provider isolation
- **OSRM** route alternatives and **Nominatim** geocoding
- **Open-Meteo** hourly wind, rain, and snowfall forecasts
- Browser-direct providers keep the static hosted demo usable; the Django `/api/plan/` endpoint is included for a controlled production deployment.

## Run locally

```bash
npm install
npm run dev
```

In another terminal:

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
.venv/Scripts/python manage.py runserver
```

The app opens with a complete Dallas-to-Denver demonstration. Submit the form to load live routes and forecasts. If a public provider is unavailable, the sample remains interactive and a visible fallback notice appears.

## Verification

```bash
npm test
npm run build
cd backend && python manage.py test
```

## Risk model

Each checkpoint is classified by the worst concurrent wind/rain/snow category. Load rules can escalate wind risk. Route risk mileage is approximated by assigning each sampled segment the risk of its checkpoint. The recommendation is a stable lexicographic sort matching the brief.

## Deployment notes

The frontend is a static build (`dist/`). For a single-origin production deployment, host Django separately and change the frontend provider adapter to `/api/plan/`, or serve the built frontend from Django. Public APIs are intentionally isolated in `src/api.js` and `backend/routing/views.py`.

## Walkthrough outline (5–7 minutes)

1. Enter origin, destination, departure, load, and checkpoint spacing.
2. Compare all three color-coded routes and the safety-first recommendation.
3. Select a route; inspect its summary, checkpoint ETAs, wind, and map popovers.
4. Move the 0–48 hour forecast slider to see the corridor risk layer update.
5. Raise load above 40,000 lb and explain the load-based wind escalation.
6. Tour `risk.js`, `api.js`, Django endpoints, and boundary tests.

Forecasts are decision support, not a replacement for official closures, carrier policy, or driver judgment.
