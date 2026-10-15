# RoadCast: Weather-Aware Truck Routing

RoadCast compares three truck routes using forecast conditions at the truck's estimated arrival time. It applies the supplied wind, rain, snow, and load thresholds, then recommends the safest route before considering travel time.

## Live application

- **Frontend:** [roadcast-truck-routing.salty-macaw-4898.chatgpt.site](https://roadcast-truck-routing.salty-macaw-4898.chatgpt.site)
- **Django API:** [weather-aware-truck-routing-beige.vercel.app](https://weather-aware-truck-routing-beige.vercel.app)
- **Health check:** [`/api/health/`](https://weather-aware-truck-routing-beige.vercel.app/api/health/)

## Features

- Origin, destination, departure time, load weight, and 10/25/50-mile checkpoint inputs
- Three OSRM route alternatives with fallback generation for insufficient alternatives
- Hourly Open-Meteo forecasts matched to each checkpoint's truck ETA
- Wind, rain, snow, and load-aware risk classification
- Safety-first route recommendation with mileage-weighted summaries
- Leaflet map with all routes, checkpoint popovers, ETAs, and risk colors
- Smooth 0–48-hour forecast corridor slider using cached checkpoint forecasts
- Explicit unavailable-weather handling; missing data is never treated as zero risk

## Architecture

- **React + Vite:** planning interface and production build
- **Leaflet + React Leaflet:** route, checkpoint, and corridor visualization
- **Django:** validation, provider orchestration, ETA matching, scoring, and recommendation
- **Nominatim:** origin and destination geocoding
- **OSRM:** route alternatives and geometry
- **Open-Meteo:** hourly wind, rain, and snowfall forecasts

The production frontend sends planning requests to Django. Django batches checkpoint locations and fetches weather through a bounded concurrent worker pool, keeping the live three-route request within the Vercel serverless execution window.

## Run locally

Requirements: Node.js 18+ and Python 3.12.

Start Django in PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DJANGO_DEBUG="true"
python manage.py runserver
```

Start React in a second PowerShell terminal:

```powershell
npm install
$env:VITE_API_URL="http://127.0.0.1:8000"
npm run dev
```

Open `http://localhost:5173`. The initial Dallas-to-Denver sample keeps the interface explorable before the first live submission; live results are clearly labeled.

## Verification

```powershell
npm test
npm run build
python backend\manage.py test routing
python backend\manage.py check --deploy
```

Current verification: **9 frontend tests**, **7 Django tests**, a successful production build, and a live three-route API smoke test.

## Risk model

Each checkpoint receives the worst concurrent wind, rain, or snow category.

| Condition | Low | Moderate | High | Severe | No Travel |
| --- | ---: | ---: | ---: | ---: | ---: |
| Wind | `<25 mph` | `25–34` | `35–44` | `45–54` | `≥55 mph` |
| Rain | `<0.10 in/hr` | `0.10–0.25` | `0.25–0.50` | `0.50–1.00` | `>1.00` |
| Snow | `<0.5 in/hr` | `0.5–1.0` | `1.0–2.0` | `2.0–3.0` | `>3.0` |

Load escalation rules:

- Wind `≥55 mph`: No Travel for every load
- Wind `45–54 mph` with load `>30,000 lb`: No Travel
- Wind `35–44 mph` with load `>40,000 lb`: Severe

Route mileage is approximated by assigning each sampled segment its checkpoint risk. Recommendation is a stable lexicographic sort by No Travel miles, Severe miles, High miles, mileage-weighted average risk, and duration. The leading No Travel safety gate prevents a blocked route from beating a travel-permitted route.

## Production deployment

The application is fully deployed:

- The public React build is hosted with Sites.
- The Django API is hosted on Vercel Hobby with `backend` as its project root.
- `.env.production` points the Vite build to the deployed Django origin.
- `backend/pyproject.toml` declares the Python dependencies and WSGI entrypoint.
- `backend/vercel.json` configures the API function's execution duration.

Required Django production variables are documented in `backend/.env.example`. Secrets remain outside Git and must be configured in the hosting dashboard.

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
