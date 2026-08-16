import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import {
  activateSuper,
  addNormalBoost,
  collectPickup,
  spendBoost,
} from "../BoostSystem";
import { BOOST_CAP, SUPER_DURATION } from "../constants";

describe("boost system", () => {
  it("caps normal boost", () => {
    const boat = createBoat("p", "skimmer", false);
    addNormalBoost(boat, 10);
    expect(boat.boostFuel).toBe(BOOST_CAP);
  });

  it("adds blue and red pickups", () => {
    const boat = createBoat("p", "skimmer", false);
    collectPickup(boat, "blue");
    collectPickup(boat, "red");
    expect(boat.boostFuel).toBeCloseTo(4.5);
  });

  it("stores normal fuel while super is active", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.boostFuel = 2;
    activateSuper(boat);
    expect(boat.superBoostRemaining).toBe(SUPER_DURATION);
    expect(boat.storedBoost).toBe(2);
    expect(boat.boostFuel).toBe(0);
    boat.boostHeld = true;
    spendBoost(boat, SUPER_DURATION);
    expect(boat.superBoostRemaining).toBe(0);
    expect(boat.boostFuel).toBe(2);
    expect(boat.storedBoost).toBe(0);
  });

  it("spends super before normal boost", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.boostFuel = 3;
    activateSuper(boat);
    boat.boostHeld = true;
    const a = spendBoost(boat, 0.5);
    expect(a.usingSuper).toBe(true);
    expect(boat.boostFuel).toBe(0);
  });

  it("does nothing when boost is not held", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.boostFuel = 2;
    boat.boostHeld = false;
    const r = spendBoost(boat, 1);
    expect(r.usingBoost).toBe(false);
    expect(boat.boostFuel).toBe(2);
  });
});
