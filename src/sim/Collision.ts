import { HULL_RADIUS, RAM_BOOST, RAM_COOLDOWN, RAM_SPEED_DELTA } from "./constants";
import type { Boat } from "./Boat";
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

export function resolveHulls(boats: Boat[], now: number): RamEvent[] {
  const events: RamEvent[] = [];
  for (let i = 0; i < boats.length; i++) {
    for (let j = i + 1; j < boats.length; j++) {
      const a = boats[i];
      const b = boats[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const min = HULL_RADIUS * 2;
      if (dist >= min || dist < 0.0001) continue;

      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = min - dist;
      const invA = 1 / a.def.mass;
      const invB = 1 / b.def.mass;
      const share = invA + invB;
      a.x -= nx * overlap * (invA / share);
      a.z -= nz * overlap * (invA / share);
      b.x += nx * overlap * (invB / share);
      b.z += nz * overlap * (invB / share);

      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const impulse = rel * 0.85;
        a.vx += impulse * nx * a.def.mass;
        a.vz += impulse * nz * a.def.mass;
        b.vx -= impulse * nx * b.def.mass;
        b.vz -= impulse * nz * b.def.mass;
      }

      const key = pairKey(a.id, b.id);
      const ready = now - (lastRam.get(key) ?? -99) > RAM_COOLDOWN;
      const aFast = a.speed - b.speed;
      let attacker: Boat | null = null;
      let defender: Boat | null = null;
      if (aFast > RAM_SPEED_DELTA) {
        attacker = a;
        defender = b;
      } else if (-aFast > RAM_SPEED_DELTA) {
        attacker = b;
        defender = a;
      } else {
        a.speed *= 0.94;
        b.speed *= 0.94;
      }

      if (attacker && defender && ready) {
        lastRam.set(key, now);
        const side = Math.sign(defender.x * attacker.vz - defender.z * attacker.vx) || 1;
        defender.vx += nx * 10 + attacker.vz * 0.05 * side;
        defender.vz += nz * 10 - attacker.vx * 0.05 * side;
        defender.vy += 7;
        defender.airborne = true;
        defender.speed *= 0.55;
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
