import { describe, expect, it } from "vitest";
import { rankRoutes, summarizeRoute, weatherRisk } from "./risk";
import { sampleLine } from "./api";

describe("weatherRisk", () => {
  it("implements every wind boundary", () => {
    expect(weatherRisk({ windMph: 24.9, rainInHr: 0, snowInHr: 0 }).level).toBe(
      "Low",
    );
    expect(weatherRisk({ windMph: 25, rainInHr: 0, snowInHr: 0 }).level).toBe(
      "Moderate",
    );
    expect(weatherRisk({ windMph: 35, rainInHr: 0, snowInHr: 0 }).level).toBe(
      "High",
    );
    expect(weatherRisk({ windMph: 45, rainInHr: 0, snowInHr: 0 }).level).toBe(
      "Severe",
    );
    expect(weatherRisk({ windMph: 55, rainInHr: 0, snowInHr: 0 }).level).toBe(
      "No Travel",
    );
  });
  it("applies load escalations", () => {
    expect(
      weatherRisk({ windMph: 45, rainInHr: 0, snowInHr: 0 }, 30001).level,
    ).toBe("No Travel");
    expect(
      weatherRisk({ windMph: 35, rainInHr: 0, snowInHr: 0 }, 40001).level,
    ).toBe("Severe");
  });
  it("uses the worst concurrent hazard", () => {
    expect(weatherRisk({ windMph: 10, rainInHr: 0.6, snowInHr: 0 }).level).toBe(
      "Severe",
    );
  });
  it("does not treat missing weather as safe", () => {
    expect(
      weatherRisk({ windMph: undefined, rainInHr: 0, snowInHr: 0 }).level,
    ).toBe("Unavailable");
  });
  it("implements rain and snow boundaries", () => {
    expect(weatherRisk({ windMph: 0, rainInHr: 0.1, snowInHr: 0 }).level).toBe(
      "Moderate",
    );
    expect(weatherRisk({ windMph: 0, rainInHr: 1.01, snowInHr: 0 }).level).toBe(
      "No Travel",
    );
    expect(weatherRisk({ windMph: 0, rainInHr: 0, snowInHr: 2 }).level).toBe(
      "Severe",
    );
    expect(weatherRisk({ windMph: 0, rainInHr: 0, snowInHr: 3.01 }).level).toBe(
      "No Travel",
    );
  });
});

describe("rankRoutes", () => {
  it("orders by severe, high, average, then duration", () => {
    const r = (id, severeMiles, highMiles, averageRisk, durationMinutes) => ({
      id,
      summary: {
        noTravelMiles: 0,
        severeMiles,
        highMiles,
        averageRisk,
        durationMinutes,
      },
    });
    expect(
      rankRoutes([
        r("fast", 1, 0, 0, 1),
        r("safe", 0, 2, 1, 99),
        r("safer", 0, 1, 3, 99),
      ]).map((x) => x.id),
    ).toEqual(["safer", "safe", "fast"]);
  });
  it("always puts a No Travel route last", () => {
    const clear = {
      id: "clear",
      summary: {
        noTravelMiles: 0,
        severeMiles: 10,
        highMiles: 0,
        averageRisk: 3,
        durationMinutes: 10,
      },
    };
    const blocked = {
      id: "blocked",
      summary: {
        noTravelMiles: 1,
        severeMiles: 0,
        highMiles: 0,
        averageRisk: 0,
        durationMinutes: 1,
      },
    };
    expect(rankRoutes([blocked, clear])[0].id).toBe("clear");
  });
});

describe("route sampling and mileage", () => {
  it("creates true interval targets plus the destination", () => {
    const samples = sampleLine(
      [
        [0, 0],
        [0, 1],
      ],
      69,
      25,
    );
    expect(samples.map((sample) => sample.mile)).toEqual([0, 25, 50, 69]);
  });
  it("counts every route segment exactly once", () => {
    const checkpoints = [
      { mile: 0, risk: { score: 0 } },
      { mile: 10, risk: { score: 3 } },
      { mile: 20, risk: { score: 0 } },
    ];
    const summary = summarizeRoute(checkpoints, 20, 30);
    expect(summary.severeMiles).toBe(20);
    expect(
      summary.noTravelMiles +
        summary.severeMiles +
        summary.highMiles +
        summary.moderateMiles,
    ).toBeLessThanOrEqual(20);
  });
});
