# RoadCast — Weather-Aware Truck Routing

RoadCast compares three truck routes using forecast conditions at the truck's estimated arrival time. It follows the supplied wind, rain, snow, and load thresholds, then recommends by severe miles, high-risk miles, average risk, and travel time—in that order.

## Architecture

- **React + Vite** interactive planning UI and Leaflet map
- **Django** API boundary for production proxying and provider isolation
- **OSRM** route alternatives and **Nominatim** geocoding
- **Open-Meteo** hourly wind, rain, and snowfall forecasts
- Django's `/api/plan/` endpoint owns the complete pipeline: provider calls, haversine checkpoint sampling, ETA matching, weather validation, risk scoring, summaries, and recommendation.
- The static demo can call providers directly when `VITE_API_URL` is absent; set that variable to the deployed Django origin for the full-stack submission.

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
.venv/Scripts/activate
set DJANGO_DEBUG=true
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

The frontend is a static build (`dist/`). A Render-compatible backend blueprint is included at `render.yaml`.

1. Deploy the repository blueprint and set `DJANGO_ALLOWED_HOSTS` to the backend hostname.
2. Set `CORS_ALLOWED_ORIGINS` to the exact frontend origin.
3. Build the frontend with `VITE_API_URL=https://your-backend.example.com`.
4. Confirm `/api/health/` and submit one live trip before recording the walkthrough.

The public OSRM driving profile is not truck-restriction-aware. This assignment uses load weight for weather safety only; production navigation should replace OSRM with a truck-aware provider.

Missing or out-of-range weather is rejected as unavailable. It is never converted to zero risk. `No Travel` mileage ranks ahead of the requested severe/high/average/time tie-breakers so a blocked route cannot be recommended over a travel-permitted route.

## API contract

`POST /api/plan/` accepts `origin`, `destination`, ISO-8601 `departure`, `loadLbs`, and `intervalMiles` (`10`, `25`, or `50`). It returns three routes with geometry, checkpoint miles, ETAs, live and 0–48-hour weather, risk explanations, mileage-weighted summaries, and `recommendedRouteId`.

## Walkthrough outline (5–7 minutes)

1. Enter origin, destination, departure, load, and checkpoint spacing.
2. Compare all three color-coded routes and the safety-first recommendation.
3. Select a route; inspect its summary, checkpoint ETAs, wind, and map popovers.
4. Move the 0–48 hour forecast slider to see the corridor risk layer update.
5. Raise load above 40,000 lb and explain the load-based wind escalation.
6. Tour `risk.js`, `api.js`, Django endpoints, and boundary tests.

Forecasts are decision support, not a replacement for official closures, carrier policy, or driver judgment.
