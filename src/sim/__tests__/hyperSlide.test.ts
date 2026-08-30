import { describe, expect, it } from "vitest";
import type { BoatId } from "../../data/boats";
import { createBoat, headingVector, type Boat } from "../Boat";
import { stepBoat } from "../BoatController";
import { SUPER_DURATION } from "../constants";
import { applyHyperSlide, slideTune, wantsHyperSlide } from "../HyperSlide";
import { wrapAngle } from "../math";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";
import type { TrackWorld } from "../Track";

const track: TrackWorld = buildRiptideRefinery();

function place(boat: Boat, t = 0.05): void {
  const start = track.main.getFrameAtT(t);
  boat.x = start.x;
  boat.y = start.y + 0.8;
  boat.z = start.z;
  boat.yaw = Math.atan2(start.tx, start.tz);
  boat.courseT = t;
  boat.speed = 26;
  boat.throttle = 1;
  boat.onWater = true;
  boat.airborne = false;
}

function primed(id: BoatId, steer: number, extra: Partial<Boat> = {}): Boat {
  const boat = createBoat(id, id, false);
  place(boat);
  boat.steer = steer;
  boat.boostHeld = true;
  boat.boostFuel = 4;
  boat.prevBoost = true;
  Object.assign(boat, extra);
  return boat;
}

function sampleTurn(id: BoatId, sliding: boolean): { dyaw: number; lat: number; sliding: boolean } {
  const boat = primed(id, 1);
  if (!sliding) boat.def = { ...boat.def, slideSteer: 2 };
  const before = boat.yaw;
  const fwd = headingVector(before);
  stepBoat(boat, track, 1 / 60, 0, false);
  return {
    dyaw: Math.abs(wrapAngle(boat.yaw - before)),
    lat: Math.abs(boat.vx * fwd.z + boat.vz * -fwd.x),
    sliding: boat.hyperSliding,
  };
}

describe("hyper slide", () => {
  it("does not slide without boost", () => {
    const empty = primed("skimmer", 1, { boostFuel: 0, superBoostRemaining: 0 });
    expect(wantsHyperSlide(empty)).toBe(false);
    stepBoat(empty, track, 1 / 60, 0, false);
    expect(empty.hyperSliding).toBe(false);

    const unheld = primed("skimmer", 1, { boostHeld: false });
    expect(wantsHyperSlide(unheld)).toBe(false);
    stepBoat(unheld, track, 1 / 60, 0, false);
    expect(unheld.hyperSliding).toBe(false);

    const bay = primed("skimmer", 1, { jetBay: 0.4 });
    expect(wantsHyperSlide(bay)).toBe(false);
  });

  it("does not slide in air", () => {
    const boat = primed("skimmer", 1, { airborne: true, onWater: false });
    boat.y += 8;
    boat.vy = 4;
    expect(wantsHyperSlide(boat)).toBe(false);
    const step = stepBoat(boat, track, 1 / 60, 0, false);
    expect(step.hyperSliding).toBe(false);
    expect(boat.hyperSliding).toBe(false);
  });

  it("does not slide with steer near 0", () => {
    const boat = primed("skimmer", 0.1);
    expect(wantsHyperSlide(boat)).toBe(false);
    stepBoat(boat, track, 1 / 60, 0, false);
    expect(boat.hyperSliding).toBe(false);
  });

  it("adds extra yaw versus a boosting hull that is not sliding", () => {
    const sliding = sampleTurn("skimmer", true);
    const baseline = sampleTurn("skimmer", false);
    expect(sliding.sliding).toBe(true);
    expect(baseline.sliding).toBe(false);
    expect(sliding.dyaw).toBeGreaterThan(baseline.dyaw);
    expect(sliding.lat).toBeGreaterThan(baseline.lat);
  });

  it("burns fuel faster than a straight boost", () => {
    const straight = primed("skimmer", 0);
    const slide = primed("skimmer", 1);
    for (let i = 0; i < 12; i++) {
      stepBoat(straight, track, 1 / 60, i / 60, false);
      stepBoat(slide, track, 1 / 60, i / 60, false);
    }
    expect(slide.hyperSliding).toBe(true);
    expect(4 - slide.boostFuel).toBeGreaterThan((4 - straight.boostFuel) * 1.45);
  });

  it("gives Vesper more extra yaw than Skimmer, then Ironwake", () => {
    const extra = (id: BoatId) => sampleTurn(id, true).dyaw - sampleTurn(id, false).dyaw;
    expect(extra("vesper")).toBeGreaterThan(extra("skimmer"));
    expect(extra("skimmer")).toBeGreaterThan(extra("ironwake"));

    expect(slideTune(primed("vesper", 1).def).drain).toBeLessThan(slideTune(primed("skimmer", 1).def).drain);
    expect(slideTune(primed("skimmer", 1).def).drain).toBeLessThan(slideTune(primed("ironwake", 1).def).drain);

    expect(wantsHyperSlide(primed("vesper", 0.5))).toBe(true);
    expect(wantsHyperSlide(primed("skimmer", 0.53))).toBe(true);
    expect(wantsHyperSlide(primed("skimmer", 0.5))).toBe(false);
    expect(wantsHyperSlide(primed("ironwake", 0.6))).toBe(false);
    expect(wantsHyperSlide(primed("ironwake", 0.7))).toBe(true);
  });

  it("slides on super boost and spends super remaining", () => {
    const slide = primed("skimmer", 1, { boostFuel: 0, superBoostRemaining: SUPER_DURATION });
    expect(wantsHyperSlide(slide)).toBe(true);
    const step = stepBoat(slide, track, 1 / 60, 0, false);
    expect(step.hyperSliding).toBe(true);
    expect(step.usingSuper).toBe(true);
    expect(slide.superBoostRemaining).toBeLessThan(SUPER_DURATION);

    const straight = primed("skimmer", 0, { boostFuel: 0, superBoostRemaining: SUPER_DURATION });
    stepBoat(straight, track, 1 / 60, 0, false);
    expect(slide.superBoostRemaining).toBeLessThan(straight.superBoostRemaining);
  });
});

describe("hyper slide apply", () => {
  it("returns hull-flavored yaw add and drain", () => {
    const v = applyHyperSlide(primed("vesper", 1));
    const s = applyHyperSlide(primed("skimmer", 1));
    const i = applyHyperSlide(primed("ironwake", 1));
    expect(v.active).toBe(true);
    expect(Math.abs(v.yawAdd)).toBeGreaterThan(Math.abs(s.yawAdd));
    expect(Math.abs(s.yawAdd)).toBeGreaterThan(Math.abs(i.yawAdd));
    expect(v.drain).toBeCloseTo(1.5);
    expect(s.drain).toBeCloseTo(1.8);
    expect(i.drain).toBeCloseTo(2.1);
  });
});
