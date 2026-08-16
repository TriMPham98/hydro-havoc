import { BLUE_BOOST, BOOST_CAP, RED_BOOST, SUPER_DURATION } from "./constants";
import type { Boat } from "./Boat";

export type PickupKind = "blue" | "red" | "super";

export function addNormalBoost(boat: Boat, amount: number, cap = BOOST_CAP): number {
  const before = boat.boostFuel;
  boat.boostFuel = Math.min(cap, boat.boostFuel + amount);
  return boat.boostFuel - before;
}

export function collectPickup(boat: Boat, kind: PickupKind): void {
  if (kind === "blue") addNormalBoost(boat, BLUE_BOOST);
  else if (kind === "red") addNormalBoost(boat, RED_BOOST);
  else activateSuper(boat);
}

export function activateSuper(boat: Boat): void {
  if (boat.superBoostRemaining <= 0) {
    boat.storedBoost = boat.boostFuel;
    boat.boostFuel = 0;
  }
  boat.superBoostRemaining = SUPER_DURATION;
}

export function spendBoost(boat: Boat, dt: number): { usingSuper: boolean; usingBoost: boolean } {
  const using = boat.boostHeld && !boat.finished;
  if (!using) return { usingSuper: false, usingBoost: false };

  if (boat.superBoostRemaining > 0) {
    boat.superBoostRemaining = Math.max(0, boat.superBoostRemaining - dt);
    if (boat.superBoostRemaining === 0) {
      boat.boostFuel = Math.min(BOOST_CAP, boat.boostFuel + boat.storedBoost);
      boat.storedBoost = 0;
    }
    return { usingSuper: true, usingBoost: true };
  }

  if (boat.boostFuel > 0) {
    boat.boostFuel = Math.max(0, boat.boostFuel - dt);
    return { usingSuper: false, usingBoost: true };
  }

  return { usingSuper: false, usingBoost: false };
}

export function restoreStoredIfIdle(boat: Boat): void {
  if (boat.superBoostRemaining <= 0 && boat.storedBoost > 0) {
    boat.boostFuel = Math.min(BOOST_CAP, boat.boostFuel + boat.storedBoost);
    boat.storedBoost = 0;
  }
}
