import {
  GRAVITY,
  HULL_RADIUS,
  OFFTRACK_TIME,
  RESPAWN_SPEED_FACTOR,
  WATER_DAMP,
  WATER_SPRING,
} from "./constants";
import type { Boat } from "./Boat";
import { headingVector } from "./Boat";
import { spendBoost } from "./BoostSystem";
import { tickJumpHold, tryHydroJump } from "./HydroJump";
import { clamp, lerp, wrapAngle } from "./math";
import { queryCourse, resolveBank, respawnPose } from "./Track";
import type { TrackWorld } from "./Track";
import { gerstnerHeight } from "./waterHeight";
import { updateLapAndCheckpoints } from "./progress";

export interface ControllerResult {
  bankHit: boolean;
  landed: boolean;
  respawned: boolean;
  jumped: boolean;
  usingBoost: boolean;
  usingSuper: boolean;
}

function steerCurve(speed: number, maxSpeed: number): number {
  const n = speed / Math.max(maxSpeed, 1);
  if (n < 0.12) return 0.42 + n * 4.2;
  if (n < 0.58) return 1.06;
  return lerp(1.06, 0.7, (n - 0.58) / 0.42);
}

export function stepBoat(
  boat: Boat,
  track: TrackWorld,
  dt: number,
  raceTime: number,
  locked: boolean,
): ControllerResult {
  boat.time += dt;
  const result: ControllerResult = {
    bankHit: false,
    landed: false,
    respawned: false,
    jumped: false,
    usingBoost: false,
    usingSuper: false,
  };

  if (locked || boat.finished) {
    boat.throttle = 0;
    boat.steer = 0;
    boat.brake = 0;
    boat.boostHeld = false;
  }

  const brakeEdge = boat.brake > 0.5 && !boat.prevBrake;
  const boostEdge = boat.boostHeld && !boat.prevBoost;
  if (brakeEdge) boat.brakeAt = boat.time;
  if (boostEdge && !locked) {
    result.jumped = tryHydroJump(boat, boat.time);
  }
  tickJumpHold(boat, dt);
  boat.prevBrake = boat.brake > 0.5;
  boat.prevBoost = boat.boostHeld;

  const spend = locked ? { usingBoost: false, usingSuper: false } : spendBoost(boat, dt);
  result.usingBoost = spend.usingBoost;
  result.usingSuper = spend.usingSuper;

  const def = boat.def;
  let maxSpeed = def.maxSpeed;
  if (spend.usingSuper) maxSpeed = def.superBoostMaxSpeed;
  else if (spend.usingBoost) maxSpeed = def.boostMaxSpeed;
  // Cabinet kick: the instant you mash boost, the hull jumps a gear.
  if (spend.usingBoost && boostEdge && !result.jumped) {
    const punch = spend.usingSuper ? 11 : 7.5;
    boat.speed = Math.min(maxSpeed, boat.speed + punch);
  }

  const fwd = headingVector(boat.yaw);
  const rightX = fwd.z;
  const rightZ = -fwd.x;

  if (!boat.airborne) {
    const accel = def.accel * (spend.usingBoost ? 1.55 : 1) * (spend.usingSuper ? 1.25 : 1);
    if (boat.throttle > 0) boat.speed += accel * boat.throttle * dt;
    if (boat.brake > 0) boat.speed -= (accel * 1.35 + 18) * boat.brake * dt;
    const drag = (spend.usingBoost ? 0.38 : 0.55) + boat.speed * (spend.usingBoost ? 0.007 : 0.012);
    boat.speed -= drag * boat.speed * dt;
    if (boat.throttle < 0.05 && boat.brake < 0.05) boat.speed -= 8 * dt;
    boat.speed = clamp(boat.speed, 0, maxSpeed);
    const turn = def.turnRate * steerCurve(boat.speed, def.maxSpeed) * boat.steer;
    boat.yaw += turn * dt;
    const slip = boat.speed * (1.15 / def.grip) * boat.steer;
    boat.vx = fwd.x * boat.speed + rightX * slip * 2.4;
    boat.vz = fwd.z * boat.speed + rightZ * slip * 2.4;
  } else {
    if (spend.usingBoost) {
      boat.speed = Math.min(maxSpeed, boat.speed + def.accel * 0.45 * dt);
      boat.yaw += def.turnRate * 0.38 * boat.steer * dt;
    }
    const air = headingVector(boat.yaw);
    boat.vx = air.x * boat.speed;
    boat.vz = air.z * boat.speed;
    boat.vy -= GRAVITY * dt;
  }

  boat.x += boat.vx * dt;
  boat.y += boat.vy * dt;
  boat.z += boat.vz * dt;

  const prevT = boat.courseT;
  const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
  boat.courseT = q.courseT;
  updateLapAndCheckpoints(boat, prevT, boat.courseT, raceTime);

  const wall = resolveBank(q, boat.x, boat.z, boat.vx, boat.vz);
  if (wall.hit) {
    boat.x = wall.x;
    boat.z = wall.z;
    boat.vx = wall.vx;
    boat.vz = wall.vz;
    boat.speed = Math.hypot(wall.vx, wall.vz);
    result.bankHit = true;
    if (boat.airborne && boat.vy < 0) boat.vy *= 0.2;
    const desired = Math.atan2(q.frame.tx, q.frame.tz);
    const err = wrapAngle(desired - boat.yaw);
    if (Math.abs(err) > 0.7) boat.yaw += err * 0.4;
  }

  const wave = gerstnerHeight(boat.x, boat.z, boat.time, q.onShortcut ? 0.35 : 1);
  const waterY = q.waterY + wave + 0.55;
  const hull = boat.y - HULL_RADIUS * 0.15;

  if (!q.onRibbon) {
    boat.offTrackTime += dt;
  } else {
    boat.offTrackTime = 0;
  }
  boat.stallTime = 0;

  if (boat.offTrackTime > OFFTRACK_TIME || boat.y < q.waterY - 8) {
    const pose = respawnPose(track, boat.lastCheckpoint);
    boat.x = pose.x;
    boat.y = pose.y;
    boat.z = pose.z;
    boat.yaw = pose.yaw;
    boat.vx = 0;
    boat.vy = 0;
    boat.vz = 0;
    boat.speed = def.maxSpeed * RESPAWN_SPEED_FACTOR;
    boat.airborne = false;
    boat.onWater = true;
    boat.offTrackTime = 0;
    boat.stallTime = 0;
    result.respawned = true;
  }

  if (boat.airborne) {
    boat.airTime += dt;
    boat.onWater = false;
    if (q.onRibbon && hull <= waterY && boat.vy <= 2) {
      const hard = boat.pitch < -0.28 || boat.vy < -16;
      boat.airborne = false;
      boat.onWater = true;
      boat.airTime = 0;
      boat.y = waterY;
      boat.vy = 0;
      if (hard) boat.speed *= 0.72;
      else boat.speed *= 0.97;
      result.landed = true;
      boat.camShake = Math.max(boat.camShake, hard ? 0.45 : 0.2);
    }
  } else if (q.onRibbon) {
    const err = waterY - boat.y;
    boat.vy += err * WATER_SPRING * dt;
    boat.vy -= boat.vy * WATER_DAMP * dt;
    boat.y += boat.vy * dt;
    if (Math.abs(err) < 0.35) boat.y = lerp(boat.y, waterY, 0.25);
    boat.onWater = true;
    const climb = q.frame.ty;
    if (climb > 0.22 && boat.speed > 16) {
      boat.vy += climb * boat.speed * 0.9 * dt * 8;
    }
    if (climb < -0.28 && boat.speed > 14) {
      boat.airborne = true;
      boat.onWater = false;
      boat.vy = Math.max(boat.vy, -2);
    }
  }

  const look = gerstnerHeight(boat.x + fwd.x * 2.4, boat.z + fwd.z * 2.4, boat.time) -
    gerstnerHeight(boat.x - fwd.x * 2.4, boat.z - fwd.z * 2.4, boat.time);
  const side = gerstnerHeight(boat.x + rightX * 1.4, boat.z + rightZ * 1.4, boat.time) -
    gerstnerHeight(boat.x - rightX * 1.4, boat.z - rightZ * 1.4, boat.time);
  const targetPitch = boat.airborne ? clamp(-boat.vy * 0.02, -0.45, 0.35) : clamp(look * 0.18 + q.frame.ty * 0.8, -0.4, 0.4);
  const targetRoll = clamp(-boat.steer * 0.32 - side * 0.12, -0.45, 0.45);
  boat.pitch = lerp(boat.pitch, targetPitch, 1 - Math.pow(0.001, dt));
  boat.roll = lerp(boat.roll, targetRoll, 1 - Math.pow(0.0008, dt));
  boat.camShake = Math.max(0, boat.camShake - dt * 1.8);
  return result;
}
