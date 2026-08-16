import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import { canHydroJump, tryHydroJump } from "../HydroJump";
import { JUMP_COST, JUMP_MIN_SPEED } from "../constants";

describe("hydro jump", () => {
  it("rejects when too slow", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.speed = JUMP_MIN_SPEED - 1;
    boat.boostFuel = 2;
    boat.throttle = 0;
    boat.brakeAt = boat.time;
    expect(canHydroJump(boat)).toBe(false);
    expect(tryHydroJump(boat, boat.time)).toBe(false);
  });

  it("rejects when empty", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.speed = 30;
    boat.boostFuel = 0;
    expect(canHydroJump(boat)).toBe(false);
  });

  it("rejects when already airborne", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.speed = 30;
    boat.boostFuel = 2;
    boat.airTime = 0.5;
    expect(canHydroJump(boat)).toBe(false);
  });

  it("launches when brake then boost within the window", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.speed = 30;
    boat.boostFuel = 2;
    boat.throttle = 0;
    boat.time = 1;
    boat.brakeAt = 0.95;
    boat.brake = 1;
    expect(tryHydroJump(boat, 1)).toBe(true);
    expect(boat.airborne).toBe(true);
    expect(boat.vy).toBeGreaterThan(10);
    expect(boat.boostFuel).toBeCloseTo(2 - JUMP_COST);
  });
});
