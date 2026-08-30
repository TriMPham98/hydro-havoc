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
import { stepPickups } from "../Pickups";

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

describe("AI boost pickups", () => {
  it("does not let AI collect blue/red/super or boost crates; player still can", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("player", "skimmer", false);
    const ai = createBoat("ai0", "ironwake", true);
    const p = track.pickups.find((x) => x.kind === "blue");
    if (!p) throw new Error("missing blue pickup");
    ai.x = p.x;
    ai.y = p.y;
    ai.z = p.z;
    player.x = p.x + 80;
    player.z = p.z + 80;
    const missed = stepPickups(track, [ai, player], 0.016, 1);
    expect(missed.filter((e) => e.kind === "blue")).toEqual([]);
    expect(ai.boostFuel).toBe(0);
    expect(p.taken).toBe(0);

    player.x = p.x;
    player.y = p.y;
    player.z = p.z;
    const got = stepPickups(track, [ai, player], 0.016, 2);
    expect(got.some((e) => e.kind === "blue" && e.boat === player)).toBe(true);
    expect(player.boostFuel).toBeGreaterThan(0);
    expect(ai.boostFuel).toBe(0);
  });

  it("does not let AI open a boost crate", () => {
    const track = buildRiptideRefinery();
    const crate = track.crates.find((c) => c.kind === "boost") ?? track.crates[0];
    crate.kind = "boost";
    crate.taken = 0;
    const ai = createBoat("ai0", "vesper", true);
    const player = createBoat("player", "skimmer", false);
    ai.x = crate.x;
    ai.y = crate.y;
    ai.z = crate.z;
    player.x = crate.x + 90;
    player.z = crate.z + 90;
    const ev = stepPickups(track, [ai, player], 0.016, 3);
    expect(ev.some((e) => e.kind === "crate-boost")).toBe(false);
    expect(ai.boostFuel).toBe(0);
    expect(crate.taken).toBe(0);
  });
});
