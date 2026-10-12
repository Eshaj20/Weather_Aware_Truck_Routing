import { describe, expect, it } from 'vitest';
import { rankRoutes, weatherRisk } from './risk';

describe('weatherRisk', () => {
  it('implements every wind boundary', () => {
    expect(weatherRisk({ windMph: 24.9 }).level).toBe('Low');
    expect(weatherRisk({ windMph: 25 }).level).toBe('Moderate');
    expect(weatherRisk({ windMph: 35 }).level).toBe('High');
    expect(weatherRisk({ windMph: 45 }).level).toBe('Severe');
    expect(weatherRisk({ windMph: 55 }).level).toBe('No Travel');
  });
  it('applies load escalations', () => {
    expect(weatherRisk({ windMph: 45 }, 30001).level).toBe('No Travel');
    expect(weatherRisk({ windMph: 35 }, 40001).level).toBe('Severe');
  });
  it('uses the worst concurrent hazard', () => {
    expect(weatherRisk({ windMph: 10, rainInHr: 0.6, snowInHr: 0 }).level).toBe('Severe');
  });
});

describe('rankRoutes', () => {
  it('orders by severe, high, average, then duration', () => {
    const r = (id, severeMiles, highMiles, averageRisk, durationMinutes) => ({ id, summary: { severeMiles, highMiles, averageRisk, durationMinutes } });
    expect(rankRoutes([r('fast',1,0,0,1), r('safe',0,2,1,99), r('safer',0,1,3,99)]).map(x=>x.id)).toEqual(['safer','safe','fast']);
  });
});
