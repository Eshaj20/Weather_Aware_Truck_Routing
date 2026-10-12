export const LEVELS = ["Low", "Moderate", "High", "Severe", "No Travel"];

export function weatherRisk(weather, loadLbs = 0) {
  const values = [weather?.windMph, weather?.rainInHr, weather?.snowInHr];
  if (!values.every(Number.isFinite))
    return {
      score: null,
      level: "Unavailable",
      reason: "Forecast data unavailable",
    };
  const [windMph, rainInHr, snowInHr] = values;
  const wind =
    windMph >= 55
      ? 4
      : windMph >= 45
        ? 3
        : windMph >= 35
          ? 2
          : windMph >= 25
            ? 1
            : 0;
  const rain =
    rainInHr > 1
      ? 4
      : rainInHr >= 0.5
        ? 3
        : rainInHr >= 0.25
          ? 2
          : rainInHr >= 0.1
            ? 1
            : 0;
  const snow =
    snowInHr > 3
      ? 4
      : snowInHr >= 2
        ? 3
        : snowInHr >= 1
          ? 2
          : snowInHr >= 0.5
            ? 1
            : 0;
  let score = Math.max(wind, rain, snow);
  const reasons = [];
  if (score === wind && wind > 0)
    reasons.push(`${windMph.toFixed(0)} mph wind`);
  if (score === rain && rain > 0)
    reasons.push(`${rainInHr.toFixed(2)} in/hr rain`);
  if (score === snow && snow > 0)
    reasons.push(`${snowInHr.toFixed(1)} in/hr snow`);
  if (windMph >= 55) score = 4;
  else if (windMph >= 45 && loadLbs > 30000) {
    score = 4;
    reasons.push("heavy-load wind restriction");
  } else if (windMph >= 35 && loadLbs > 40000) {
    score = Math.max(score, 3);
    reasons.push("heavy-load wind escalation");
  }
  return {
    score,
    level: LEVELS[score],
    reason: reasons[0] || "Conditions within normal operating range",
  };
}

export function summarizeRoute(checkpoints, distanceMiles, durationMinutes) {
  if (checkpoints.length < 2 || checkpoints.some((c) => c.risk.score == null))
    throw new Error("A complete forecast is required to summarize a route.");
  const totals = {
    noTravelMiles: 0,
    severeMiles: 0,
    highMiles: 0,
    moderateMiles: 0,
    weightedRisk: 0,
  };
  for (let i = 1; i < checkpoints.length; i++) {
    const miles = Math.max(0, checkpoints[i].mile - checkpoints[i - 1].mile);
    const score = Math.max(
      checkpoints[i - 1].risk.score,
      checkpoints[i].risk.score,
    );
    if (score === 4) totals.noTravelMiles += miles;
    else if (score === 3) totals.severeMiles += miles;
    else if (score === 2) totals.highMiles += miles;
    else if (score === 1) totals.moderateMiles += miles;
    totals.weightedRisk += score * miles;
  }
  const averageRisk = totals.weightedRisk / Math.max(distanceMiles, 1);
  const maxRisk = Math.max(...checkpoints.map((c) => c.risk.score));
  return { ...totals, averageRisk, maxRisk, distanceMiles, durationMinutes };
}

export function rankRoutes(routes) {
  return [...routes].sort(
    (a, b) =>
      a.summary.noTravelMiles - b.summary.noTravelMiles ||
      a.summary.severeMiles - b.summary.severeMiles ||
      a.summary.highMiles - b.summary.highMiles ||
      a.summary.averageRisk - b.summary.averageRisk ||
      a.summary.durationMinutes - b.summary.durationMinutes,
  );
}
