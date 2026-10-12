export const LEVELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel'];

export function weatherRisk({ windMph = 0, rainInHr = 0, snowInHr = 0 }, loadLbs = 0) {
  const wind = windMph >= 55 ? 4 : windMph >= 45 ? 3 : windMph >= 35 ? 2 : windMph >= 25 ? 1 : 0;
  const rain = rainInHr > 1 ? 4 : rainInHr >= 0.5 ? 3 : rainInHr >= 0.25 ? 2 : rainInHr >= 0.1 ? 1 : 0;
  const snow = snowInHr > 3 ? 4 : snowInHr >= 2 ? 3 : snowInHr >= 1 ? 2 : snowInHr >= 0.5 ? 1 : 0;
  let score = Math.max(wind, rain, snow);
  const reasons = [];
  if (score === wind && wind > 0) reasons.push(`${windMph.toFixed(0)} mph wind`);
  if (score === rain && rain > 0) reasons.push(`${rainInHr.toFixed(2)} in/hr rain`);
  if (score === snow && snow > 0) reasons.push(`${snowInHr.toFixed(1)} in/hr snow`);
  if (windMph >= 55) score = 4;
  else if (windMph >= 45 && loadLbs > 30000) {
    score = 4;
    reasons.push('heavy-load wind restriction');
  } else if (windMph >= 35 && loadLbs > 40000) {
    score = Math.max(score, 3);
    reasons.push('heavy-load wind escalation');
  }
  return { score, level: LEVELS[score], reason: reasons[0] || 'Conditions within normal operating range' };
}

export function summarizeRoute(checkpoints, distanceMiles, durationMinutes) {
  const segment = distanceMiles / Math.max(checkpoints.length - 1, 1);
  const severeMiles = checkpoints.reduce((sum, c) => sum + (c.risk.score >= 3 ? segment : 0), 0);
  const highMiles = checkpoints.reduce((sum, c) => sum + (c.risk.score === 2 ? segment : 0), 0);
  const averageRisk = checkpoints.reduce((sum, c) => sum + c.risk.score, 0) / Math.max(checkpoints.length, 1);
  const maxRisk = Math.max(...checkpoints.map(c => c.risk.score));
  return { severeMiles, highMiles, averageRisk, maxRisk, distanceMiles, durationMinutes };
}

export function rankRoutes(routes) {
  return [...routes].sort((a, b) =>
    a.summary.severeMiles - b.summary.severeMiles ||
    a.summary.highMiles - b.summary.highMiles ||
    a.summary.averageRisk - b.summary.averageRisk ||
    a.summary.durationMinutes - b.summary.durationMinutes
  );
}
