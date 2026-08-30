import { BLUE_BOOST, BOOST_CAP, JET_BAY_DELAY, JET_IGNITE, RED_BOOST, SUPER_DURATION } from "./constants";
import type { Boat } from "./Boat";

export type PickupKind = "blue" | "red" | "super";

export function addNormalBoost(boat: Boat, amount: number, cap = BOOST_CAP): number {
  const before = boat.boostFuel;
  boat.boostFuel = Math.min(cap, boat.boostFuel + amount);
  return boat.boostFuel - before;
}

export function boostLive(boat: Boat): boolean {
  return boat.jetBay <= 0 && (boat.boostFuel > 0 || boat.superBoostRemaining > 0);
}

function bayAlreadyOut(boat: Boat): boolean {
  return boat.jetBay <= 0 && (boat.boostFuel > 0 || boat.superBoostRemaining > 0);
}

export function igniteJet(boat: Boat, scale = 1): void {
  boat.jetIgnite = Math.max(boat.jetIgnite, JET_IGNITE * scale);
  if (!bayAlreadyOut(boat) && boat.jetBay <= 0) boat.jetBay = JET_BAY_DELAY;
}

function beginBay(boat: Boat, scale = 1): void {
  boat.jetIgnite = Math.max(boat.jetIgnite, JET_BAY_DELAY * scale);
  if (!bayAlreadyOut(boat) && boat.jetBay <= 0) boat.jetBay = JET_BAY_DELAY;
}

function applySuper(boat: Boat): void {
  if (boat.superBoostRemaining <= 0) {
    boat.storedBoost = boat.boostFuel;
    boat.boostFuel = 0;
  }
  boat.superBoostRemaining = SUPER_DURATION;
}

export function flushPending(boat: Boat): void {
  if (boat.pendingSuper > 0) {
    applySuper(boat);
    boat.pendingSuper = 0;
  }
  if (boat.pendingBoost > 0) {
    const add = boat.pendingBoost;
    boat.pendingBoost = 0;
    if (boat.superBoostRemaining > 0) {
      boat.storedBoost = Math.min(BOOST_CAP, boat.storedBoost + add);
    } else {
      addNormalBoost(boat, add);
    }
  }
}

export function tickBay(boat: Boat, dt: number): void {
  if (boat.jetBay <= 0) return;
  boat.jetBay = Math.max(0, boat.jetBay - dt);
  if (boat.jetBay === 0) flushPending(boat);
}

export function queueBoost(boat: Boat, amount: number): void {
  boat.pendingBoost += amount;
  beginBay(boat);
  if (boat.jetBay <= 0) flushPending(boat);
}

export function collectPickup(boat: Boat, kind: PickupKind): void {
  if (kind === "blue") boat.pendingBoost += BLUE_BOOST;
  else if (kind === "red") boat.pendingBoost += RED_BOOST;
  else boat.pendingSuper = Math.max(boat.pendingSuper, SUPER_DURATION);
  beginBay(boat, kind === "super" ? 1.25 : 1);
  if (boat.jetBay <= 0) flushPending(boat);
}

export function activateSuper(boat: Boat): void {
  boat.pendingSuper = Math.max(boat.pendingSuper, SUPER_DURATION);
  beginBay(boat, 1.25);
  if (boat.jetBay <= 0) flushPending(boat);
}

export function spendBoost(boat: Boat, dt: number): { usingSuper: boolean; usingBoost: boolean } {
  const using = boat.boostHeld && !boat.finished && boat.jetBay <= 0;
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
