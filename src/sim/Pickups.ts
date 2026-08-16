import { CRATE_RADIUS, MINE_ARM, MINE_RADIUS, PICKUP_RADIUS } from "./constants";
import type { Boat } from "./Boat";
import { addNormalBoost, collectPickup } from "./BoostSystem";
import type { TrackWorld } from "./Track";

export interface PickupEvent {
  kind: "blue" | "red" | "super" | "crate-boost" | "crate-mine" | "mine";
  x: number;
  y: number;
  z: number;
  boat: Boat;
}

export function stepPickups(track: TrackWorld, boats: Boat[], dt: number, now: number): PickupEvent[] {
  const events: PickupEvent[] = [];

  for (const p of track.pickups) {
    if (p.taken > 0) {
      p.taken -= dt;
      continue;
    }
    for (const boat of boats) {
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
      continue;
    }
    for (const boat of boats) {
      if (Math.hypot(boat.x - crate.x, boat.z - crate.z) < CRATE_RADIUS && Math.abs(boat.y - crate.y) < 5) {
        crate.taken = 18;
        if (crate.kind === "boost") {
          addNormalBoost(boat, 1.2);
          events.push({ kind: "crate-boost", x: crate.x, y: crate.y, z: crate.z, boat });
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
        break;
      }
    }
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
