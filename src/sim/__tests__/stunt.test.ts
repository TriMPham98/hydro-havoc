import { describe, expect, it } from "vitest";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";
import { createBoat } from "../Boat";
import { stepBoat } from "../BoatController";
import { JUMP_COST } from "../constants";
import {
  STUNT_STUN,
  TAU,
  WIPEOUT_SPEED,
  resolveStuntLanding,
  stuntFlavor,
  tickAirStunt,
} from "../Stunt";
import { queryCourse } from "../Track";
import type { TrackWorld } from "../Track";
import type { Boat } from "../Boat";

function placeOnRibbon(boat: Boat, track: TrackWorld, t = 0.05): void {
  const start = track.main.getFrameAtT(t);
  boat.x = start.x;
  boat.y = start.y + 0.8;
  boat.z = start.z;
  boat.yaw = Math.atan2(start.tx, start.tz);
  boat.courseT = t;
}

describe("stunt hull flavor", () => {
  it("gives vesper the fastest roll and ironwake the slowest", () => {
    const skimmer = stuntFlavor("skimmer");
    const vesper = stuntFlavor("vesper");
    const ironwake = stuntFlavor("ironwake");
    expect(vesper.rollRate).toBeGreaterThan(skimmer.rollRate);
    expect(skimmer.rollRate).toBeGreaterThan(ironwake.rollRate);
    expect(skimmer.cleanWindow).toBeGreaterThan(vesper.cleanWindow);
    expect(skimmer.gravityScale).toBeLessThan(ironwake.gravityScale);
  });
});

describe("air stunts", () => {
  it("counts a full 360 of roll", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.airborne = true;
    boat.steer = 1;
    const dt = 1 / 60;
    const need = TAU / stuntFlavor("skimmer").rollRate + dt;
    for (let t = 0; t < need; t += dt) tickAirStunt(boat, dt, 8);
    expect(boat.stuntCount).toBeGreaterThanOrEqual(1);
  });

  it("awards boost on a full 360 and a gentle landing", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("p", "skimmer", false);
    placeOnRibbon(boat, track);
    boat.speed = 0;
    boat.vx = 0;
    boat.vz = 0;
    boat.airborne = true;
    boat.onWater = false;
    boat.y += 14;
    boat.vy = 2;
    boat.steer = 1;
    boat.boostFuel = 2;
    boat.pitch = 0;
    boat.roll = 0;

    let steps = 0;
    while (boat.airborne && boat.stuntCount < 1 && steps < 180) {
      stepBoat(boat, track, 1 / 60, 0, false);
      steps++;
    }
    expect(boat.stuntCount).toBeGreaterThanOrEqual(1);
    const spins = boat.stuntCount;
    boat.steer = 0;
    boat.pitch = 0;

    let land = stepBoat(boat, track, 1 / 60, 0, false);
    while (boat.airborne && steps < 360) {
      land = stepBoat(boat, track, 1 / 60, 0, false);
      steps++;
    }
    expect(land.landed).toBe(true);
    expect(land.wipeout).toBe(false);
    expect(land.stuntAward).toBe(spins);
    expect(boat.boostFuel + boat.pendingBoost).toBeGreaterThan(2);
    expect(boat.stuntStun).toBe(0);
    expect(boat.stuntCount).toBe(0);
  });

  it("wipes out when landing inverted", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("p", "skimmer", false);
    placeOnRibbon(boat, track);
    const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
    boat.airborne = true;
    boat.onWater = false;
    boat.y = q.waterY + 2.2;
    boat.vy = -3;
    boat.speed = 22;
    boat.vx = 0;
    boat.vz = 0;
    boat.roll = Math.PI;
    boat.pitch = 0;
    boat.boostFuel = 2;
    boat.stuntCount = 1;
    boat.stuntSpin = TAU;

    let land = stepBoat(boat, track, 1 / 60, 0, false);
    for (let i = 0; i < 30 && !land.landed; i++) {
      land = stepBoat(boat, track, 1 / 60, 0, false);
    }
    expect(land.landed).toBe(true);
    expect(land.wipeout).toBe(true);
    expect(land.stuntAward).toBe(0);
    expect(boat.speed).toBeCloseTo(22 * WIPEOUT_SPEED, 1);
    expect(boat.stuntStun).toBeGreaterThan(STUNT_STUN * 0.8);
    expect(boat.boostFuel + boat.pendingBoost).toBeCloseTo(2);
  });

  it("does not award a stunt on a level landing with no rotation", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("p", "skimmer", false);
    placeOnRibbon(boat, track);
    const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
    boat.airborne = true;
    boat.onWater = false;
    boat.y = q.waterY + 2.2;
    boat.vy = -3;
    boat.speed = 20;
    boat.vx = 0;
    boat.vz = 0;
    boat.roll = 0;
    boat.pitch = 0;
    boat.boostFuel = 2;
    boat.stuntCount = 0;

    let land = stepBoat(boat, track, 1 / 60, 0, false);
    for (let i = 0; i < 30 && !land.landed; i++) {
      land = stepBoat(boat, track, 1 / 60, 0, false);
    }
    expect(land.landed).toBe(true);
    expect(land.wipeout).toBe(false);
    expect(land.stuntAward).toBe(0);
    expect(boat.boostFuel + boat.pendingBoost).toBeCloseTo(2);
    expect(boat.stuntStun).toBe(0);
    expect(boat.speed).toBeCloseTo(20 * 0.97, 1);
  });

  it("still requires throttle down, then brake then boost", () => {
    const track = buildRiptideRefinery();
    const throttled = createBoat("hot", "skimmer", false);
    placeOnRibbon(throttled, track);
    throttled.speed = 28;
    throttled.boostFuel = 2;
    throttled.throttle = 1;
    throttled.brake = 1;
    stepBoat(throttled, track, 1 / 60, 0, false);
    throttled.boostHeld = true;
    const hot = stepBoat(throttled, track, 1 / 60, 0, false);
    expect(hot.jumped).toBe(false);
    expect(throttled.airborne).toBe(false);

    const boat = createBoat("p", "skimmer", false);
    placeOnRibbon(boat, track);
    boat.speed = 28;
    boat.boostFuel = 2;
    boat.throttle = 0;
    boat.brake = 1;
    stepBoat(boat, track, 1 / 60, 0, false);
    boat.boostHeld = true;
    const jump = stepBoat(boat, track, 1 / 60, 0, false);
    expect(jump.jumped).toBe(true);
    expect(boat.airborne).toBe(true);
    expect(boat.boostFuel).toBeLessThan(2 - JUMP_COST + 1e-6);
  });

  it("lets a hydro jump start an air stunt", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("p", "skimmer", false);
    placeOnRibbon(boat, track);
    boat.speed = 28;
    boat.boostFuel = 2;
    boat.throttle = 0;
    boat.brake = 1;
    stepBoat(boat, track, 1 / 60, 0, false);
    boat.boostHeld = true;
    expect(stepBoat(boat, track, 1 / 60, 0, false).jumped).toBe(true);
    boat.boostHeld = false;
    boat.brake = 0;
    boat.steer = 1;
    for (let i = 0; i < 24; i++) stepBoat(boat, track, 1 / 60, 0, false);
    expect(boat.airborne).toBe(true);
    expect(Math.abs(boat.stuntSpin)).toBeGreaterThan(1);
  });

  it("ignores throttle during stunt stun", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("p", "skimmer", false);
    placeOnRibbon(boat, track);
    boat.stuntStun = STUNT_STUN;
    boat.speed = 12;
    boat.throttle = 1;
    boat.steer = 1;
    const yaw = boat.yaw;
    stepBoat(boat, track, 1 / 60, 0, false);
    expect(boat.speed).toBeLessThan(12);
    expect(Math.abs(boat.yaw - yaw)).toBeLessThan(0.002);
  });
});

describe("stunt landing rules", () => {
  it("wipes out a hard landing after a completed spin", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.stuntCount = 1;
    boat.roll = 0;
    boat.boostFuel = 1;
    const r = resolveStuntLanding(boat, true);
    expect(r.wipeout).toBe(true);
    expect(r.awarded).toBe(0);
    expect(boat.boostFuel).toBe(1);
    expect(boat.stuntStun).toBe(STUNT_STUN);
  });

  it("does not wipe out a hard landing with no spin", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.stuntCount = 0;
    boat.roll = 0;
    const r = resolveStuntLanding(boat, true);
    expect(r.wipeout).toBe(false);
    expect(r.awarded).toBe(0);
  });
});
