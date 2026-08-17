import { JUMP_COST, JUMP_MIN_SPEED, JUMP_WINDOW } from "./constants";
import type { Boat } from "./Boat";

export function canHydroJump(boat: Boat): boolean {
  const fuel = boat.boostFuel > JUMP_COST || boat.superBoostRemaining > 0;
  return boat.speed >= JUMP_MIN_SPEED && fuel && !boat.finished && boat.airTime < 0.12;
}

export function tryHydroJump(boat: Boat, now: number): boolean {
  if (!canHydroJump(boat)) return false;
  if (now - boat.brakeAt > JUMP_WINDOW) return false;
  if (boat.throttle > 0.35) return false;

  if (boat.superBoostRemaining <= 0) {
    boat.boostFuel = Math.max(0, boat.boostFuel - JUMP_COST);
  }
  const hold = boat.brake > 0.5 ? 1 : 0.55;
  boat.vy = Math.max(boat.vy, 0) + boat.def.jumpForce * hold;
  boat.speed = Math.min(boat.def.boostMaxSpeed, boat.speed + 3.2 * hold);
  boat.airborne = true;
  boat.onWater = false;
  boat.jumpHold = 0.22;
  return true;
}

export function tickJumpHold(boat: Boat, dt: number): void {
  if (boat.jumpHold <= 0) return;
  boat.jumpHold -= dt;
  if (boat.brake > 0.4 && boat.airborne) {
    boat.vy += boat.def.jumpForce * 1.15 * dt;
  }
}
