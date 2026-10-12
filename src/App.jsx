import { Fragment, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import {
  AlertTriangle,
  ArrowRight,
  Clock3,
  CloudSun,
  Gauge,
  MapPin,
  Navigation,
  Package,
  Route,
  ShieldCheck,
  Wind,
} from "lucide-react";
import { demoTrip, planTrip } from "./api";
import { LEVELS, rankRoutes, weatherRisk } from "./risk";

const COLORS = ["#75d6b1", "#ffd166", "#ff9f43", "#ff675d", "#982f42"];
const ROUTE_COLORS = ["#b7ff70", "#65b4ff", "#d4a5ff"];

function FitBounds({ routes }) {
  const map = useMap();
  useMemo(() => {
    const pts = routes.flatMap((r) => r.line.map(([lon, lat]) => [lat, lon]));
    if (pts.length)
      setTimeout(() => map.fitBounds(pts, { padding: [45, 45] }), 0);
  }, [routes, map]);
  return null;
}

function fmtDuration(minutes) {
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}

function fmtTime(iso) {
  return new Intl.DateTimeFormat([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function Metric({ label, value, tone }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong style={tone ? { color: tone } : undefined}>{value}</strong>
    </div>
  );
}

function RouteCard({ route, index, selected, recommended, onSelect }) {
  const s = route.summary;
  return (
    <button
      className={`route-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div className="route-card-head">
        <span
          className="route-number"
          style={{ background: ROUTE_COLORS[index] }}
        >
          {index + 1}
        </span>
        <div>
          <strong>
            {recommended ? `Recommended · ${route.name}` : route.name}
          </strong>
          <small>
            {Math.round(s.distanceMiles)} mi · {fmtDuration(s.durationMinutes)}
          </small>
        </div>
        {recommended && (
          <span className="recommended">
            <ShieldCheck size={13} /> Best
          </span>
        )}
      </div>
      <div className="route-metrics">
        <Metric
          label="No travel"
          value={`${Math.round(s.noTravelMiles)} mi`}
          tone={s.noTravelMiles ? COLORS[4] : COLORS[0]}
        />
        <Metric
          label="Severe"
          value={`${Math.round(s.severeMiles)} mi`}
          tone={s.severeMiles ? COLORS[3] : COLORS[0]}
        />
        <Metric
          label="High"
          value={`${Math.round(s.highMiles)} mi`}
          tone={s.highMiles ? COLORS[2] : COLORS[0]}
        />
        <Metric
          label="Avg risk"
          value={`${LEVELS[Math.min(4, Math.round(s.averageRisk))]} · ${s.averageRisk.toFixed(1)}`}
        />
      </div>
    </button>
  );
}

function ForecastLayer({ routes, selectedId, forecastHour, loadLbs }) {
  return routes.flatMap((route) =>
    route.checkpoints.map((checkpoint, i) => {
      const weather = checkpoint.forecast?.[forecastHour];
      const risk = weatherRisk(weather, loadLbs);
      if (risk.score == null) return null;
      const selected = route.id === selectedId;
      const next = route.checkpoints[i + 1];
      return (
        <Fragment key={`${route.id}-${checkpoint.id}`}>
          {next && (
            <Polyline
              positions={[
                [checkpoint.point[1], checkpoint.point[0]],
                [next.point[1], next.point[0]],
              ]}
              pathOptions={{
                color: COLORS[risk.score],
                weight: selected ? 18 : 9,
                opacity: selected ? 0.32 : 0.1,
                lineCap: "round",
              }}
            />
          )}
          <CircleMarker
            center={[checkpoint.point[1], checkpoint.point[0]]}
            radius={selected ? 5 + risk.score * 1.5 : 3}
            pathOptions={{
              color: COLORS[risk.score],
              fillColor: COLORS[risk.score],
              fillOpacity: selected ? 0.9 : 0.32,
              weight: selected ? 2 : 1,
            }}
          >
            <Popup>
              <b>
                {route.name} · Mile {Math.round(checkpoint.mile)}
              </b>
              <br />
              {risk.level} risk · {risk.reason}
              <br />
              Wind {weather.windMph.toFixed(0)} mph · Rain{" "}
              {weather.rainInHr.toFixed(2)} in/hr · Snow{" "}
              {weather.snowInHr.toFixed(1)} in/hr
              <br />
              Trip ETA {fmtTime(checkpoint.eta)}
            </Popup>
          </CircleMarker>
        </Fragment>
      );
    }),
  );
}

export default function App() {
  const initialDeparture = new Date(
    Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  const [form, setForm] = useState({
    origin: "Dallas, TX",
    destination: "Denver, CO",
    departure: initialDeparture,
    loadLbs: 36000,
    intervalMiles: 50,
  });
  const [trip, setTrip] = useState(() => demoTrip(36000));
  const [selected, setSelected] = useState("route-1");
  const [forecastHour, setForecastHour] = useState(0);
  const [status, setStatus] = useState("demo");
  const [error, setError] = useState("");
  const ranked = useMemo(() => rankRoutes(trip.routes), [trip]);
  const bestId = ranked[0]?.id;
  const selectedRoute =
    trip.routes.find((r) => r.id === selected) || trip.routes[0];

  async function submit(e) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      if (!form.origin.trim() || !form.destination.trim())
        throw new Error("Origin and destination are required");
      if (Number(form.loadLbs) < 0 || Number(form.loadLbs) > 80000)
        throw new Error("Load weight must be between 0 and 80,000 lb");
      const departure = new Date(form.departure);
      if (
        !Number.isFinite(departure.getTime()) ||
        departure < new Date(Date.now() - 5 * 60000)
      )
        throw new Error("Choose a valid future departure time");
      const result = await planTrip({
        ...form,
        departure: departure.toISOString(),
        loadLbs: Number(form.loadLbs),
        intervalMiles: Number(form.intervalMiles),
      });
      setTrip(result);
      const best = rankRoutes(result.routes)[0];
      setSelected(best.id);
      setStatus("live");
    } catch (err) {
      setError(
        `${err.message}. The existing ${trip.source === "demo" ? "clearly labeled sample" : "verified trip"} remains on screen.`,
      );
      setStatus(trip.source === "live" ? "live" : "demo");
    }
  }

  return (
    <div className="app-shell">
      <header>
        <div className="brand">
          <div className="brand-mark">
            <Navigation size={19} />
          </div>
          <span>ROADCAST</span>
        </div>
        <div className="live-pill">
          <i></i> Forecast data <b>{status === "live" ? "LIVE" : "DEMO"}</b>
        </div>
        <button className="driver">
          <span>JD</span>
          <div>
            <b>Driver 08</b>
            <small>Unit 4721</small>
          </div>
        </button>
      </header>

      <main>
        <aside className="planner">
          <div className="eyebrow">Trip intelligence</div>
          <h1>Plan the safer road.</h1>
          <p className="lede">
            Route around hazardous weather before it becomes a problem.
          </p>
          <form onSubmit={submit}>
            <label>
              <span>Origin</span>
              <div className="field">
                <MapPin size={16} />
                <input
                  aria-label="Origin"
                  value={form.origin}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                />
              </div>
            </label>
            <div className="field-line"></div>
            <label>
              <span>Destination</span>
              <div className="field">
                <MapPin size={16} />
                <input
                  aria-label="Destination"
                  value={form.destination}
                  onChange={(e) =>
                    setForm({ ...form, destination: e.target.value })
                  }
                />
              </div>
            </label>
            <div className="split">
              <label>
                <span>Departure</span>
                <div className="field">
                  <Clock3 size={16} />
                  <input
                    type="datetime-local"
                    required
                    value={form.departure}
                    onChange={(e) =>
                      setForm({ ...form, departure: e.target.value })
                    }
                  />
                </div>
              </label>
              <label>
                <span>Load weight</span>
                <div className="field">
                  <Package size={16} />
                  <input
                    type="number"
                    min="0"
                    max="80000"
                    step="500"
                    value={form.loadLbs}
                    onChange={(e) =>
                      setForm({ ...form, loadLbs: e.target.value })
                    }
                  />
                  <em>lb</em>
                </div>
              </label>
            </div>
            <label>
              <span>Weather checkpoints</span>
              <div className="segmented">
                {[10, 25, 50].map((n) => (
                  <button
                    type="button"
                    className={Number(form.intervalMiles) === n ? "active" : ""}
                    onClick={() => setForm({ ...form, intervalMiles: n })}
                    key={n}
                  >
                    {n} mi
                  </button>
                ))}
              </div>
            </label>
            <button className="plan-button" disabled={status === "loading"}>
              {status === "loading" ? (
                "Reading the road ahead…"
              ) : (
                <>
                  <span>Compare routes</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          {error && (
            <div className="error">
              <AlertTriangle size={15} />
              {error}
            </div>
          )}
          <div className="route-list-title">
            <span>Route comparison</span>
            <small>Ranked by safety first</small>
          </div>
          <div className="route-list">
            {trip.routes.map((r, i) => (
              <RouteCard
                key={r.id}
                route={r}
                index={i}
                selected={r.id === selected}
                recommended={r.id === bestId}
                onSelect={() => setSelected(r.id)}
              />
            ))}
          </div>
        </aside>

        <section className="map-panel">
          <MapContainer
            center={[36.2, -100.5]}
            zoom={5}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds routes={trip.routes} />
            {trip.routes.map((r, i) => (
              <Polyline
                key={r.id}
                positions={r.line.map(([lon, lat]) => [lat, lon])}
                pathOptions={{
                  color: ROUTE_COLORS[i],
                  weight: r.id === selected ? 6 : 3,
                  opacity: r.id === selected ? 1 : 0.45,
                }}
              />
            ))}
            <ForecastLayer
              routes={trip.routes}
              selectedId={selected}
              forecastHour={forecastHour}
              loadLbs={trip.loadLbs}
            />
          </MapContainer>

          <div className="map-topbar">
            <div>
              <Route size={16} />
              <span>{trip.origin.name.split(",").slice(0, 2).join(",")}</span>
              <ArrowRight size={14} />
              <span>
                {trip.destination.name.split(",").slice(0, 2).join(",")}
              </span>
            </div>
            <div className="legend">
              {LEVELS.map((l, i) => (
                <span key={l}>
                  <i style={{ background: COLORS[i] }}></i>
                  {l}
                </span>
              ))}
            </div>
          </div>

          <div className="forecast-card">
            <div className="forecast-head">
              <div>
                <CloudSun size={19} />
                <span>Corridor forecast</span>
              </div>
              <strong>
                +{forecastHour}h ·{" "}
                {fmtTime(
                  new Date(Date.now() + forecastHour * 3600000).toISOString(),
                )}
              </strong>
            </div>
            <input
              aria-label="Forecast hour"
              type="range"
              min="0"
              max="48"
              value={forecastHour}
              onChange={(e) => setForecastHour(Number(e.target.value))}
            />
            <div className="ticks">
              <span>NOW</span>
              <span>+12H</span>
              <span>+24H</span>
              <span>+36H</span>
              <span>+48H</span>
            </div>
          </div>

          <div className="route-detail">
            <div className="detail-title">
              <div>
                <span
                  className="route-number"
                  style={{
                    background:
                      ROUTE_COLORS[trip.routes.indexOf(selectedRoute)],
                  }}
                >
                  {trip.routes.indexOf(selectedRoute) + 1}
                </span>
                <div>
                  <small>SELECTED ROUTE</small>
                  <strong>{selectedRoute.name}</strong>
                </div>
              </div>
              <span
                className={`risk-chip risk-${selectedRoute.summary.maxRisk}`}
              >
                {LEVELS[selectedRoute.summary.maxRisk]} peak
              </span>
            </div>
            <div className="detail-stats">
              <Metric
                label="Distance"
                value={`${Math.round(selectedRoute.summary.distanceMiles)} mi`}
              />
              <Metric
                label="Travel time"
                value={fmtDuration(selectedRoute.summary.durationMinutes)}
              />
              <Metric
                label="Checkpoints"
                value={selectedRoute.checkpoints.length}
              />
              <Metric
                label="Risk score"
                value={`${LEVELS[Math.min(4, Math.round(selectedRoute.summary.averageRisk))]} · ${selectedRoute.summary.averageRisk.toFixed(1)}`}
              />
            </div>
            <div className="checkpoint-strip">
              {selectedRoute.checkpoints.map((c, i) => (
                <div className="checkpoint" key={c.id}>
                  <i style={{ background: COLORS[c.risk.score] }}></i>
                  <div>
                    <small>
                      {i === 0 ? "START" : `MI ${Math.round(c.mile)}`}
                    </small>
                    <b>{fmtTime(c.eta)}</b>
                    <span>
                      <Wind size={11} />
                      {c.weather.windMph.toFixed(0)} mph · {c.risk.level}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>
          <Gauge size={13} /> Decision order: no-travel → severe → high →
          average risk → travel time
        </span>
        <span>Weather guidance supports—not replaces—driver judgment.</span>
      </footer>
    </div>
  );
}
