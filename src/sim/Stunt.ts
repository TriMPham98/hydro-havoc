import type { BoatId } from "../data/boats";
import type { Boat } from "./Boat";
import { queueBoost } from "./BoostSystem";
import { STEER_GAIN } from "./constants";
import { clamp, lerp, wrapAngle } from "./math";

export const TAU = Math.PI * 2;
export const STUNT_STUN = 0.7;
export const WIPEOUT_SPEED = 0.45;
/** Nose-down or impact speed that already counts as a slam. */
export const HARD_PITCH = -0.28;
export const HARD_VY = -16;

export interface StuntFlavor {
  /** Barrel rad/s at full steer. */
  rollRate: number;
  /** Extra pitch rad/s from throttle (up) / brake (down). */
  pitchRate: number;
  /** |wrapped roll| must be below this to count as a clean landing. */
  cleanWindow: number;
  /** Extra air yaw; Skimmer has the most. */
  airSteer: number;
  /** Multiplier on gravity while airborne. Skimmer < 1 for hang. */
  gravityScale: number;
  /** Auto-level rate when the stick is released. */
  recover: number;
}

export function stuntFlavor(id: BoatId): StuntFlavor {
  if (id === "vesper") {
    return {
      rollRate: 9.6,
      pitchRate: 1.55,
      cleanWindow: 0.4,
      airSteer: 0.22,
      gravityScale: 1,
      recover: 6.2,
    };
  }
  if (id === "ironwake") {
    return {
      rollRate: 3.5,
      pitchRate: 0.85,
      cleanWindow: 0.48,
      airSteer: 0.12,
      gravityScale: 1,
      recover: 4.4,
    };
  }
  return {
    rollRate: 7.4,
    pitchRate: 1.2,
    cleanWindow: 0.62,
    airSteer: 0.3,
    gravityScale: 0.88,
    recover: 5.4,
  };
}

export function wrappedRoll(boat: Boat): number {
  return wrapAngle(boat.roll);
}

export function tickAirStunt(boat: Boat, dt: number, heightAboveWater: number): void {
  if (dt <= 0) return;
  const flavor = stuntFlavor(boat.def.id);
  const dRoll = boat.steer * flavor.rollRate * dt;
  if (Math.abs(boat.steer) > 0.12) {
    const prev = boat.stuntSpin;
    boat.stuntSpin += dRoll;
    boat.roll += dRoll;
    const before = Math.floor(Math.abs(prev) / TAU);
    const after = Math.floor(Math.abs(boat.stuntSpin) / TAU);
    if (after > before) boat.stuntCount += after - before;
  } else {
    boat.roll = lerp(wrapAngle(boat.roll), 0, 1 - Math.exp(-flavor.recover * dt));
  }

  const pitchIn = boat.throttle - boat.brake;
  if (Math.abs(pitchIn) > 0.12) {
    boat.pitch = clamp(boat.pitch + pitchIn * flavor.pitchRate * dt, -0.85, 0.7);
  } else {
    const glide = clamp(-boat.vy * 0.015, -0.25, 0.22);
    boat.pitch = lerp(boat.pitch, glide, 1 - Math.exp(-4 * dt));
  }

  boat.yaw += flavor.airSteer * boat.def.turnRate * boat.steer * STEER_GAIN * dt;

  const leveled = Math.abs(wrapAngle(boat.roll)) < flavor.cleanWindow && boat.pitch > HARD_PITCH;
  if (leveled && heightAboveWater < 4 && boat.vy < -12) {
    boat.vy = lerp(boat.vy, -10, 1 - Math.exp(-8 * dt));
  }
}

export function resolveStuntLanding(
  boat: Boat,
  hard: boolean,
): { wipeout: boolean; awarded: number } {
  const flavor = stuntFlavor(boat.def.id);
  const rolled = Math.abs(wrappedRoll(boat));
  const inverted = rolled > Math.PI * 0.5;
  const tilted = rolled > flavor.cleanWindow;
  const wipeout = inverted || tilted || (hard && boat.stuntCount > 0);
  const awarded = !wipeout && !hard && boat.stuntCount > 0 ? boat.stuntCount : 0;
  if (awarded > 0) queueBoost(boat, awarded);
  if (wipeout) boat.stuntStun = STUNT_STUN;
  boat.stuntCount = 0;
  boat.stuntSpin = 0;
  return { wipeout, awarded };
}

export function resetStunt(boat: Boat): void {
  boat.stuntCount = 0;
  boat.stuntSpin = 0;
  boat.stuntStun = 0;
}
