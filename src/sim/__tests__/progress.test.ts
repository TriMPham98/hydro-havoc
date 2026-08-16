import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import {
  compareProgress,
  crossedStart,
  placeBoats,
  raceMetric,
  updateLapAndCheckpoints,
} from "../progress";

describe("race progress", () => {
  it("orders by lap then t", () => {
    const a = { lap: 1, t: 0.2, finished: false, finishTime: 0 };
    const b = { lap: 0, t: 0.9, finished: false, finishTime: 0 };
    expect(compareProgress(a, b)).toBeLessThan(0);
    expect(raceMetric(a)).toBeGreaterThan(raceMetric(b));
  });

  it("detects start line wrap", () => {
    expect(crossedStart(0.95, 0.02)).toBe(true);
    expect(crossedStart(0.4, 0.41)).toBe(false);
  });

  it("counts a lap after late checkpoints", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.lastCheckpoint = 7;
    updateLapAndCheckpoints(boat, 0.96, 0.03, 42);
    expect(boat.lap).toBe(1);
    expect(boat.lastCheckpoint).toBe(0);
  });

  it("ranks finished boats ahead", () => {
    const a = createBoat("a", "skimmer", false);
    const b = createBoat("b", "vesper", true);
    a.finished = true;
    a.finishTime = 80;
    a.lap = 3;
    b.lap = 2;
    b.courseT = 0.9;
    placeBoats([a, b]);
    expect(a.place).toBe(1);
    expect(b.place).toBe(2);
  });
});
