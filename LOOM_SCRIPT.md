# RoadCast Loom walkthrough (5–7 minutes)

## 0:00–0:35 — Problem and finished product

“RoadCast helps a truck driver compare routes by the weather the truck is expected to meet, not just current weather. The driver enters an origin, destination, departure time, load weight, and a 10-, 25-, or 50-mile sampling interval. The application returns three alternatives and recommends the safest one before using travel time as the final tie-breaker.”

Show the hosted application and briefly point to the React interface, Leaflet map, and Django API status.

## 0:35–1:25 — Plan a trip

Use Dallas, Texas to Denver, Colorado, a departure within the available forecast window, 42,000 lb, and 50-mile sampling. Submit the form.

“The Django endpoint geocodes both places, requests three OSRM route alternatives, samples their geometry, fetches Open-Meteo forecasts in bounded parallel batches, and matches each checkpoint to the truck’s estimated arrival time.”

Point out that the result says **Live routing + forecast APIs**. If a public provider is temporarily unavailable, explain the visible sample-data fallback; do not present fallback data as a live result.

## 1:25–2:20 — Route comparison and recommendation

Show all three comparison cards.

“The recommendation is a lexicographic safety sort: first no-travel and severe miles, then high miles, then mileage-weighted average risk, and finally duration. That means a slightly longer route wins whenever it materially avoids dangerous weather.”

If all cards show zero severe/high miles and `0.0` average risk, say:

“Zero here is a valid clear-weather result. Missing or out-of-range forecasts are rejected as unavailable; they are never silently converted to zero. To prove the non-zero classifications independently of today’s weather, I’ll show the boundary tests near the end.”

## 2:20–3:20 — Map and checkpoints

Select each route and show how its line is highlighted. Click two checkpoint markers.

“Every marker contains its mile position, ETA, wind, hourly rain, hourly snow, and resulting risk level. Checkpoints are evaluated at their own ETAs, so later points use later forecast hours. Sampling can be changed to 10, 25, or 50 miles, trading API volume for spatial detail.”

Point out route distance, duration, severe miles, high miles, average risk, and the recommended badge.

## 3:20–4:05 — Forecast corridor heatmap

Move the slider from 0 through 48 hours and pause at several values.

“The corridor layer uses the cached 49-hour forecast returned for each checkpoint. Moving the slider does not issue another network request, which keeps interaction smooth. Marker and corridor colors update to the worst wind, rain, or snow category for that selected forecast hour.”

## 4:05–5:10 — Risk and load correctness

Open `backend/routing/risk.py` and `backend/routing/tests.py`.

“The thresholds directly implement the brief: wind reaches moderate at 25, high at 35, severe at 45, and no-travel at 55 miles per hour. Rain and snow follow their supplied thresholds, and the worst concurrent condition becomes the checkpoint risk. Load rules then escalate 45–54 mph to no-travel above 30,000 lb and preserve severe risk at 35–44 mph above 40,000 lb.”

Show the boundary tests, missing-weather test, and route-ranking test. Mention that the suite contains 7 backend tests and 9 frontend tests.

## 5:10–6:10 — Architecture and performance

Open `backend/routing/services.py`, `backend/routing/views.py`, and `src/api.js`.

“React owns presentation and cached slider interaction. Django owns validation, provider calls, ETA-weather matching, risk scoring, summaries, and recommendation. Weather locations are grouped into batches and fetched through one bounded worker pool. A live Dallas-to-Denver smoke test returned three routes and 55 total checkpoints in about 16 seconds.”

Mention that public OSRM is appropriate for this assignment but is not truck-restriction-aware; a production carrier product should replace it with a commercial truck-routing provider.

## 6:10–6:40 — Deployment and close

Show the GitHub repository, hosted frontend, and Vercel `/api/health/` response.

“The frontend is a production Vite build, and the Django API is configured for Vercel Hobby with explicit host, CORS, timeout, and worker settings. The README contains local setup, API behavior, risk assumptions, verification commands, and deployment instructions.”

End by showing one final recommended route and its checkpoint details.
