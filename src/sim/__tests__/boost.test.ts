import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import { stepBoat } from "../BoatController";
import {
  activateSuper,
  addNormalBoost,
  collectPickup,
  spendBoost,
} from "../BoostSystem";
import { BOOST_CAP, SUPER_DURATION } from "../constants";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";

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

  it("kicks speed the frame boost is mashed", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("p", "skimmer", false);
    const start = track.main.getFrameAtT(0.05);
    boat.x = start.x;
    boat.y = start.y + 0.8;
    boat.z = start.z;
    boat.yaw = Math.atan2(start.tx, start.tz);
    boat.speed = 18;
    boat.boostFuel = 2;
    boat.throttle = 1;
    boat.boostHeld = false;
    stepBoat(boat, track, 1 / 60, 0, false);
    const before = boat.speed;
    boat.boostHeld = true;
    stepBoat(boat, track, 1 / 60, 0, false);
    expect(boat.speed).toBeGreaterThan(before + 4);
  });
});
