import { RAM_BOOST, RAM_COOLDOWN, RAM_SPEED_DELTA } from "./constants";
import type { Boat } from "./Boat";
import { headingVector } from "./Boat";
import { addNormalBoost } from "./BoostSystem";

export interface RamEvent {
  attacker: Boat;
  defender: Boat;
  awarded: boolean;
}

const lastRam = new Map<string, number>();

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function boosting(boat: Boat): boolean {
  return boat.boostHeld && (boat.boostFuel > 0 || boat.superBoostRemaining > 0);
}

export function resolveHulls(boats: Boat[], now: number): RamEvent[] {
  const events: RamEvent[] = [];
  for (let i = 0; i < boats.length; i++) {
    for (let j = i + 1; j < boats.length; j++) {
      const a = boats[i];
      const b = boats[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const min = a.def.hullWidth * 0.42 + b.def.hullWidth * 0.42 + 0.3;
      if (dist >= min || dist < 0.0001) continue;

      const nx = dx / dist;
      const nz = dz / dist;
      const fwd = headingVector(a.yaw);
      const rx = fwd.z;
      const rz = -fwd.x;
      const side = Math.sign(dx * rx + dz * rz) || 1;
      const sx = nx * 0.3 + rx * side * 0.7;
      const sz = nz * 0.3 + rz * side * 0.7;
      const sl = Math.hypot(sx, sz) || 1;
      const px = sx / sl;
      const pz = sz / sl;

      const overlap = min - dist + 0.08;
      const invA = 1 / a.def.mass;
      const invB = 1 / b.def.mass;
      const share = invA + invB;
      a.x -= px * overlap * (invA / share);
      a.z -= pz * overlap * (invA / share);
      b.x += px * overlap * (invB / share);
      b.z += pz * overlap * (invB / share);

      const rel = (b.vx - a.vx) * px + (b.vz - a.vz) * pz;
      if (rel < 0) {
        const j = (rel * 0.55) / share;
        a.vx += j * invA * px;
        a.vz += j * invA * pz;
        b.vx -= j * invB * px;
        b.vz -= j * invB * pz;
        a.speed = Math.hypot(a.vx, a.vz);
        b.speed = Math.hypot(b.vx, b.vz);
      }

      const key = pairKey(a.id, b.id);
      const ready = now - (lastRam.get(key) ?? -99) > RAM_COOLDOWN;
      let attacker: Boat | null = null;
      let defender: Boat | null = null;
      if (boosting(a) && a.speed - b.speed > RAM_SPEED_DELTA) {
        attacker = a;
        defender = b;
      } else if (boosting(b) && b.speed - a.speed > RAM_SPEED_DELTA) {
        attacker = b;
        defender = a;
      }

      if (attacker && defender && ready) {
        const aim = headingVector(attacker.yaw);
        const toDefX = defender.x - attacker.x;
        const toDefZ = defender.z - attacker.z;
        const ahead = toDefX * aim.x + toDefZ * aim.z;
        if (ahead < 0.8) continue;
        lastRam.set(key, now);
        defender.vx += aim.x * 22 + px * 3;
        defender.vz += aim.z * 22 + pz * 3;
        defender.vy += 8;
        defender.airborne = true;
        defender.speed = Math.hypot(defender.vx, defender.vz);
        defender.camShake = 0.5;
        attacker.camShake = 0.25;
        addNormalBoost(attacker, RAM_BOOST);
        events.push({ attacker, defender, awarded: true });
      }
    }
  }
  return events;
}

export function resetRamTable(): void {
  lastRam.clear();
}
