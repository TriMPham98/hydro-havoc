import { RAM_BOOST, RAM_COOLDOWN, RAM_SPEED_DELTA } from "./constants";
import type { Boat } from "./Boat";
import { enterWipeout, headingVector } from "./Boat";
import { addNormalBoost, boostLive } from "./BoostSystem";

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
  return boat.boostHeld && boostLive(boat);
}

/** Oriented collision box matching the visual hull, slightly inside the paint. */
export function hullBox(boat: Boat): {
  x: number;
  z: number;
  fx: number;
  fz: number;
  rx: number;
  rz: number;
  hl: number;
  hw: number;
} {
  const f = headingVector(boat.yaw);
  return {
    x: boat.x,
    z: boat.z,
    fx: f.x,
    fz: f.z,
    rx: f.z,
    rz: -f.x,
    hl: boat.def.hullLength * 0.5,
    hw: boat.def.hullWidth * 0.52,
  };
}

function projectBox(
  box: ReturnType<typeof hullBox>,
  ax: number,
  az: number,
): { min: number; max: number } {
  const c = box.x * ax + box.z * az;
  const e = box.hl * Math.abs(box.fx * ax + box.fz * az) + box.hw * Math.abs(box.rx * ax + box.rz * az);
  return { min: c - e, max: c + e };
}

/** Minimum-translation vector for two hull OBBs, or null if they do not overlap. */
export function hullOverlap(
  a: Boat,
  b: Boat,
): { nx: number; nz: number; depth: number } | null {
  const A = hullBox(a);
  const B = hullBox(b);
  const axes: [number, number][] = [
    [A.fx, A.fz],
    [A.rx, A.rz],
    [B.fx, B.fz],
    [B.rx, B.rz],
  ];
  let depth = Infinity;
  let nx = 1;
  let nz = 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [ax, az] of axes) {
    const len = Math.hypot(ax, az) || 1;
    const ux = ax / len;
    const uz = az / len;
    const pa = projectBox(A, ux, uz);
    const pb = projectBox(B, ux, uz);
    const o = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (o <= 0) return null;
    if (o < depth) {
      depth = o;
      const sign = dx * ux + dz * uz >= 0 ? 1 : -1;
      nx = ux * sign;
      nz = uz * sign;
    }
  }
  return { nx, nz, depth };
}

function separatePair(a: Boat, b: Boat): { nx: number; nz: number; depth: number } | null {
  const hit = hullOverlap(a, b);
  if (!hit) return null;
  const px = hit.nx;
  const pz = hit.nz;
  const overlap = hit.depth + 0.1;
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
  return hit;
}

export function resolveHulls(boats: Boat[], now: number): RamEvent[] {
  const events: RamEvent[] = [];
  const awarded = new Set<string>();
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < boats.length; i++) {
      for (let j = i + 1; j < boats.length; j++) {
        const a = boats[i];
        const b = boats[j];
        const hit = separatePair(a, b);
        if (!hit || pass > 0) continue;

        const key = pairKey(a.id, b.id);
        if (awarded.has(key)) continue;
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
          awarded.add(key);
          defender.vx += aim.x * 22 + hit.nx * 3;
          defender.vz += aim.z * 22 + hit.nz * 3;
          defender.vy += 8;
          defender.airborne = true;
          defender.speed = Math.hypot(defender.vx, defender.vz);
          defender.camShake = 0.5;
          attacker.camShake = 0.25;
          enterWipeout(defender);
          addNormalBoost(attacker, RAM_BOOST);
          events.push({ attacker, defender, awarded: true });
        }
      }
    }
  }
  return events;
}

export function resetRamTable(): void {
  lastRam.clear();
}
