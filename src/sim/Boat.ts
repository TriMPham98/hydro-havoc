import type { BoatDef, BoatId } from "../data/boats";
import { boatById } from "../data/boats";

export interface Boat {
  id: string;
  def: BoatDef;
  ai: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  speed: number;
  throttle: number;
  steer: number;
  brake: number;
  boostHeld: boolean;
  onWater: boolean;
  airborne: boolean;
  airTime: number;
  boostFuel: number;
  superBoostRemaining: number;
  storedBoost: number;
  lastCheckpoint: number;
  courseT: number;
  lap: number;
  finished: boolean;
  finishTime: number;
  offTrackTime: number;
  stallTime: number;
  jumpHold: number;
  prevBrake: boolean;
  prevBoost: boolean;
  brakeAt: number;
  time: number;
  camShake: number;
  place: number;
  color: number;
}

export function createBoat(id: string, defId: BoatId, ai: boolean): Boat {
  const def = boatById(defId);
  return {
    id,
    def,
    ai,
    x: 0,
    y: 0.8,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    steer: 0,
    brake: 0,
    boostHeld: false,
    onWater: true,
    airborne: false,
    airTime: 0,
    boostFuel: 0,
    superBoostRemaining: 0,
    storedBoost: 0,
    lastCheckpoint: 0,
    courseT: 0,
    lap: 0,
    finished: false,
    finishTime: 0,
    offTrackTime: 0,
    stallTime: 0,
    jumpHold: 0,
    prevBrake: false,
    prevBoost: false,
    brakeAt: -9,
    time: 0,
    camShake: 0,
    place: 1,
    color: def.color,
  };
}

export function headingVector(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function copyPose(
  boat: Boat,
  pose: { x: number; y: number; z: number; yaw: number },
): void {
  boat.x = pose.x;
  boat.y = pose.y;
  boat.z = pose.z;
  boat.yaw = pose.yaw;
}
