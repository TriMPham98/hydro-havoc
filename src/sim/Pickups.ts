import {
  CRATE_RADIUS,
  CRUSHER_DURATION,
  MINE_ARM,
  MINE_RADIUS,
  PICKUP_RADIUS,
} from "./constants";
import type { Boat } from "./Boat";
import { headingVector } from "./Boat";
import { boostLive, collectPickup, queueBoost } from "./BoostSystem";
import { clampToCanal, type CrateSlot, type TrackWorld } from "./Track";

export interface PickupEvent {
  kind: "blue" | "red" | "super" | "crate-boost" | "crate-mine" | "crate-crusher" | "mine";
  x: number;
  y: number;
  z: number;
  boat: Boat;
}

const CRATE_MAX_SPEED = 22;

function megaHull(boat: Boat): boolean {
  return !boat.ai && boat.boostHeld && boostLive(boat);
}

function bumpCrate(crate: CrateSlot, boat: Boat): void {
  const dx = crate.x - boat.x;
  const dz = crate.z - boat.z;
  const dist = Math.hypot(dx, dz);
  let nx: number;
  let nz: number;
  if (dist < 1e-4) {
    const h = headingVector(boat.yaw);
    nx = h.x;
    nz = h.z;
  } else {
    nx = dx / dist;
    nz = dz / dist;
  }
  const along = boat.vx * nx + boat.vz * nz;
  const kick = Math.max(8, Math.abs(along), boat.speed * 0.55);
  crate.vx += nx * kick * 0.85 + boat.vx * 0.25;
  crate.vz += nz * kick * 0.85 + boat.vz * 0.25;
  const spd = Math.hypot(crate.vx, crate.vz);
  if (spd > CRATE_MAX_SPEED) {
    crate.vx *= CRATE_MAX_SPEED / spd;
    crate.vz *= CRATE_MAX_SPEED / spd;
  }
  const sep = Math.max(0.15, CRATE_RADIUS - dist) * 0.55;
  crate.x += nx * sep;
  crate.z += nz * sep;
}

function collectCrate(track: TrackWorld, crate: CrateSlot, boat: Boat, now: number, events: PickupEvent[]): void {
  crate.taken = 18;
  crate.vx = 0;
  crate.vz = 0;
  if (crate.kind === "boost") {
    queueBoost(boat, 1.2);
    events.push({ kind: "crate-boost", x: crate.x, y: crate.y, z: crate.z, boat });
  } else if (crate.kind === "crusher") {
    boat.crusherUntil = CRUSHER_DURATION;
    events.push({ kind: "crate-crusher", x: crate.x, y: crate.y, z: crate.z, boat });
  } else {
    track.mines.push({
      id: `m${now.toFixed(3)}-${crate.id}`,
      x: crate.x,
      y: crate.y,
      z: crate.z,
      age: 0,
      live: true,
    });
    events.push({ kind: "crate-mine", x: crate.x, y: crate.y, z: crate.z, boat });
  }
}

export function stepPickups(track: TrackWorld, boats: Boat[], dt: number, now: number): PickupEvent[] {
  const events: PickupEvent[] = [];

  for (const p of track.pickups) {
    if (p.taken > 0) {
      p.taken -= dt;
      continue;
    }
    for (const boat of boats) {
      if (boat.ai) continue;
      if (Math.hypot(boat.x - p.x, boat.z - p.z) < PICKUP_RADIUS && Math.abs(boat.y - p.y) < 6) {
        collectPickup(boat, p.kind);
        p.taken = 7.5;
        events.push({ kind: p.kind, x: p.x, y: p.y, z: p.z, boat });
        break;
      }
    }
  }

  for (const crate of track.crates) {
    if (crate.taken > 0) {
      crate.taken -= dt;
      crate.vx = 0;
      crate.vz = 0;
      continue;
    }

    let collected = false;
    for (const boat of boats) {
      if (Math.hypot(boat.x - crate.x, boat.z - crate.z) >= CRATE_RADIUS || Math.abs(boat.y - crate.y) >= 5) {
        continue;
      }
      const smash = megaHull(boat);
      if (crate.kind === "mine" || smash) {
        collectCrate(track, crate, boat, now, events);
        collected = true;
        break;
      }
      bumpCrate(crate, boat);
    }
    if (collected) continue;

    crate.x += crate.vx * dt;
    crate.z += crate.vz * dt;
    const damp = Math.exp(-3.2 * dt);
    crate.vx *= damp;
    crate.vz *= damp;
    const parked = clampToCanal(track, crate.x, crate.y, crate.z, 0, 3.6);
    crate.x = parked.x;
    crate.z = parked.z;
  }

  for (const mine of track.mines) {
    if (!mine.live) continue;
    mine.age += dt;
    if (mine.age < MINE_ARM) continue;
    for (const boat of boats) {
      if (Math.hypot(boat.x - mine.x, boat.z - mine.z) < MINE_RADIUS + 1.2) {
        mine.live = false;
        boat.speed *= 0.42;
        boat.vy += 11;
        boat.airborne = true;
        boat.camShake = 0.6;
        events.push({ kind: "mine", x: mine.x, y: mine.y, z: mine.z, boat });
        break;
      }
    }
    if (mine.age > 22) mine.live = false;
  }
  track.mines = track.mines.filter((m) => m.live || m.age < 0.4);

  return events;
}
