import { describe, expect, it } from "vitest";
import { BOATS, boatById, statBars } from "../../data/boats";
import { createBoat, enterWipeout } from "../Boat";
import { stepBoat } from "../BoatController";
import { RESPAWN_SPEED_FACTOR, WIPEOUT_TIME } from "../constants";
import { wrapAngle } from "../math";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";

describe("hull stats", () => {
  it("spreads the fleet so Speed / Turn / Armor read as different boats", () => {
    const bars = Object.fromEntries(BOATS.map((b) => [b.id, Object.fromEntries(statBars(b).map((s) => [s.label, s.value]))]));
    expect(bars.vesper.Speed).toBeGreaterThan(bars.ironwake.Speed + 0.2);
    expect(bars.ironwake.Speed).toBeGreaterThan(bars.skimmer.Speed + 0.2);
    expect(bars.skimmer.Turn).toBeGreaterThan(bars.ironwake.Turn + 0.2);
    expect(bars.ironwake.Turn).toBeGreaterThan(bars.vesper.Turn + 0.2);
    expect(bars.ironwake.Armor).toBeGreaterThan(bars.skimmer.Armor + 0.2);
    expect(bars.skimmer.Armor).toBeGreaterThan(bars.vesper.Armor + 0.1);
    expect(boatById("skimmer").name).toBe("Skimmer");
  });

  it("lets each hull hold its listed top speed and turn in that order", () => {
    const track = buildRiptideRefinery();
    const start = track.main.getFrameAtT(0.05);
    const cruise = (id: "skimmer" | "ironwake" | "vesper") => {
      const boat = createBoat(id, id, false);
      boat.x = start.x;
      boat.y = start.y + 0.8;
      boat.z = start.z;
      boat.yaw = Math.atan2(start.tx, start.tz);
      boat.courseT = 0.05;
      boat.throttle = 1;
      for (let i = 0; i < 240; i++) stepBoat(boat, track, 1 / 60, i / 60, false);
      return boat;
    };
    const skimmer = cruise("skimmer");
    const ironwake = cruise("ironwake");
    const vesper = cruise("vesper");
    expect(skimmer.speed).toBeGreaterThan(skimmer.def.maxSpeed * 0.9);
    expect(ironwake.speed).toBeGreaterThan(skimmer.speed + 1.2);
    expect(vesper.speed).toBeGreaterThan(ironwake.speed + 1.5);
    expect(vesper.speed).toBeGreaterThan(vesper.def.maxSpeed * 0.9);

    const yawAt = (id: "skimmer" | "ironwake" | "vesper") => {
      const boat = createBoat(id, id, false);
      boat.x = start.x;
      boat.y = start.y + 0.8;
      boat.z = start.z;
      boat.yaw = 0;
      boat.speed = 22;
      boat.throttle = 1;
      boat.steer = 1;
      const before = boat.yaw;
      stepBoat(boat, track, 1 / 60, 0, false);
      return Math.abs(boat.yaw - before);
    };
    expect(yawAt("skimmer")).toBeGreaterThan(yawAt("ironwake") * 1.08);
    expect(yawAt("ironwake")).toBeGreaterThan(yawAt("vesper") * 1.08);
  });

  it("respawns with usable forward speed", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("p", "skimmer", false);
    const start = track.main.getFrameAtT(0);
    boat.x = start.x;
    boat.z = start.z;
    boat.y = start.y - 12;
    boat.speed = 4;
    const step = stepBoat(boat, track, 1 / 60, 0, false);
    expect(step.respawned).toBe(true);
    expect(boat.speed).toBeCloseTo(boat.def.maxSpeed * RESPAWN_SPEED_FACTOR);
    expect(Math.hypot(boat.vx, boat.vz)).toBeGreaterThan(boat.speed * 0.9);
  });

  it("drags more in the outer silt band than on center", () => {
    const track = buildRiptideRefinery();
    const t = 0.505;
    const f = track.main.getFrameAtT(t);
    const run = (lat: number) => {
      const boat = createBoat("p", "skimmer", false);
      boat.x = f.x + f.rx * lat;
      boat.y = f.y + 0.8;
      boat.z = f.z + f.rz * lat;
      boat.yaw = Math.atan2(f.tx, f.tz);
      boat.courseT = t;
      boat.speed = 26;
      boat.throttle = 0;
      boat.brake = 0;
      for (let i = 0; i < 40; i++) stepBoat(boat, track, 1 / 60, 0, false);
      return boat.speed;
    };
    expect(run(7.2)).toBeLessThan(run(0) - 1.2);
  });

  it("enterWipeout zeros effective control until the timer expires", () => {
    const track = buildRiptideRefinery();
    const start = track.main.getFrameAtT(0.05);
    const boat = createBoat("p", "skimmer", false);
    boat.x = start.x;
    boat.y = start.y + 0.8;
    boat.z = start.z;
    boat.yaw = Math.atan2(start.tx, start.tz);
    boat.courseT = 0.05;
    boat.speed = 24;
    boat.vx = Math.sin(boat.yaw) * 24;
    boat.vz = Math.cos(boat.yaw) * 24;
    boat.boostFuel = 3;
    enterWipeout(boat, 0.2);
    expect(boat.wipeout).toBeCloseTo(0.2);
    const speed0 = boat.speed;
    for (let i = 0; i < 8; i++) {
      boat.throttle = 1;
      boat.steer = 1;
      boat.brake = 0;
      boat.boostHeld = true;
      stepBoat(boat, track, 1 / 60, i / 60, false);
      expect(boat.throttle).toBe(0);
      expect(boat.steer).toBe(0);
      expect(boat.boostHeld).toBe(false);
    }
    expect(boat.wipeout).toBeGreaterThan(0);
    expect(boat.speed).toBeLessThan(speed0);
    expect(boat.boostFuel).toBe(3);

    for (let i = 0; i < 20; i++) {
      boat.throttle = 0;
      boat.steer = 0;
      boat.boostHeld = false;
      stepBoat(boat, track, 1 / 60, 0.2 + i / 60, false);
    }
    expect(boat.wipeout).toBe(0);

    boat.airborne = false;
    boat.onWater = true;
    boat.speed = 22;
    boat.vx = Math.sin(boat.yaw) * 22;
    boat.vz = Math.cos(boat.yaw) * 22;
    const yaw0 = boat.yaw;
    boat.steer = 1;
    boat.throttle = 1;
    stepBoat(boat, track, 1 / 60, 1, false);
    expect(Math.abs(wrapAngle(boat.yaw - yaw0))).toBeGreaterThan(0.015);
  });

  it("uses a ~1.2s default wipeout window", () => {
    const boat = createBoat("p", "ironwake", false);
    enterWipeout(boat);
    expect(boat.wipeout).toBeCloseTo(WIPEOUT_TIME);
    expect(WIPEOUT_TIME).toBeGreaterThanOrEqual(1);
    expect(WIPEOUT_TIME).toBeLessThanOrEqual(1.3);
  });
});
