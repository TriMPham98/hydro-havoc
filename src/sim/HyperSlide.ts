import type { BoatDef } from "../data/boats";
import type { Boat } from "./Boat";
import { boostLive } from "./BoostSystem";
import { STEER_GAIN } from "./constants";

/** Default |steer| to commit a Hyper Slide. Hulls may sit above or below this. */
export const SLIDE_STEER = 0.55;
/** Extra yaw as a fraction of hull turnRate (0.35 → ~1.35×). */
export const SLIDE_YAW = 0.35;
/** Boost / super burn multiplier while sliding. */
export const SLIDE_DRAIN = 1.8;
/** Extra lateral slip as a fraction of the grip slip term. */
export const SLIDE_SLIP = 0.55;
/** Accel trickle while sliding, so a committed slide holds speed vs lifting. */
export const SLIDE_SPEED = 0.16;
export const SLIDE_CAP = 1.035;
export const SLIDE_ROLL = 0.22;

export function slideTune(def: BoatDef): { steer: number; yaw: number; drain: number; slip: number } {
  return {
    steer: def.slideSteer ?? SLIDE_STEER,
    yaw: def.slideYaw ?? SLIDE_YAW,
    drain: def.slideDrain ?? SLIDE_DRAIN,
    slip: def.slideSlip ?? SLIDE_SLIP,
  };
}

/** Boost + hard steer on water. AI can call this later; physics apply whenever it is true. */
export function wantsHyperSlide(boat: Boat): boolean {
  if (boat.finished || boat.airborne || !boat.onWater) return false;
  if (!boat.boostHeld || !boostLive(boat)) return false;
  return Math.abs(boat.steer) > slideTune(boat.def).steer;
}

export function applyHyperSlide(boat: Boat): {
  active: boolean;
  yawAdd: number;
  slipAdd: number;
  drain: number;
} {
  const active = wantsHyperSlide(boat);
  boat.hyperSliding = active;
  if (!active) return { active: false, yawAdd: 0, slipAdd: 0, drain: 1 };
  const t = slideTune(boat.def);
  const dir = Math.sign(boat.steer);
  return {
    active: true,
    yawAdd: boat.def.turnRate * t.yaw * dir * STEER_GAIN,
    slipAdd: boat.speed * (1.15 / boat.def.grip) * dir * STEER_GAIN * t.slip,
    drain: t.drain,
  };
}

export function holdSlideSpeed(boat: Boat, dt: number, maxSpeed: number): void {
  if (!boat.hyperSliding) return;
  const cap = maxSpeed * SLIDE_CAP;
  boat.speed = Math.min(cap, boat.speed + boat.def.accel * SLIDE_SPEED * dt);
}
