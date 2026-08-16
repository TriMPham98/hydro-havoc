import { CHECKPOINT_COUNT, HULL_RADIUS, LATERAL_PAD } from "./constants";
import { lerp, wrap01 } from "./math";
import { ArcSpline, type ControlPoint, type Frame } from "./spline";
import type { PickupKind } from "./BoostSystem";

export interface PlacedPickup {
  id: string;
  kind: PickupKind;
  x: number;
  y: number;
  z: number;
  taken: number;
}

export interface CrateSlot {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: "boost" | "mine";
  taken: number;
}

export interface Mine {
  id: string;
  x: number;
  y: number;
  z: number;
  age: number;
  live: boolean;
}

export interface TrackWorld {
  main: ArcSpline;
  shortcut: ArcSpline;
  shortcutEnterT: number;
  shortcutExitT: number;
  checkpoints: number[];
  pickups: PlacedPickup[];
  crates: CrateSlot[];
  mines: Mine[];
  start: Frame;
}

export function makeTrack(mainPts: ControlPoint[], shortcutPts: ControlPoint[]): TrackWorld {
  const main = new ArcSpline(mainPts, true);
  const shortcut = new ArcSpline(shortcutPts, false);
  const enter = main.project(shortcutPts[0].x, shortcutPts[0].y, shortcutPts[0].z);
  const last = shortcutPts[shortcutPts.length - 1];
  const exit = main.project(last.x, last.y, last.z);
  const checkpoints: number[] = [];
  for (let i = 0; i < CHECKPOINT_COUNT; i++) checkpoints.push(i / CHECKPOINT_COUNT);
  return {
    main,
    shortcut,
    shortcutEnterT: enter.frame.t,
    shortcutExitT: exit.frame.t,
    checkpoints,
    pickups: [],
    crates: [],
    mines: [],
    start: main.getFrameAtT(0),
  };
}

export interface CourseQuery {
  frame: Frame;
  lateral: number;
  onRibbon: boolean;
  onShortcut: boolean;
  courseT: number;
  waterY: number;
  halfWidth: number;
}

export function queryCourse(track: TrackWorld, x: number, y: number, z: number, hintT = 0): CourseQuery {
  const main = track.main.project(x, y, z, hintT);
  const cut = track.shortcut.project(x, y, z);
  const mainHalf = main.frame.width * 0.5;
  const cutHalf = cut.frame.width * 0.5;
  const onCut = Math.abs(cut.lateral) < cutHalf + 5 && cut.planar < cutHalf + 10;
  const preferCut = onCut && cut.planar + 1.5 < main.planar;
  const hit = preferCut ? cut : main;
  const half = preferCut ? cutHalf : mainHalf;
  const courseT = preferCut
    ? lerp(track.shortcutEnterT, track.shortcutExitT, wrap01(cut.frame.t))
    : hit.frame.t;
  return {
    frame: hit.frame,
    lateral: hit.lateral,
    onRibbon: Math.abs(hit.lateral) < half + LATERAL_PAD,
    onShortcut: preferCut,
    courseT,
    waterY: hit.frame.y,
    halfWidth: half,
  };
}

export function resolveBank(
  q: CourseQuery,
  x: number,
  z: number,
  vx: number,
  vz: number,
): { x: number; z: number; vx: number; vz: number; hit: boolean } {
  const limit = q.halfWidth - HULL_RADIUS;
  if (Math.abs(q.lateral) <= limit) return { x, z, vx, vz, hit: false };
  const sign = Math.sign(q.lateral) || 1;
  const over = Math.abs(q.lateral) - limit;
  const nx = q.frame.rx * sign;
  const nz = q.frame.rz * sign;
  const pushedX = x - nx * (over + 0.05);
  const pushedZ = z - nz * (over + 0.05);
  const vn = vx * nx + vz * nz;
  let nvx = vx;
  let nvz = vz;
  if (vn > 0) {
    nvx -= vn * 1.35 * nx;
    nvz -= vn * 1.35 * nz;
  }
  return { x: pushedX, z: pushedZ, vx: nvx * 0.72, vz: nvz * 0.72, hit: true };
}

export function respawnPose(track: TrackWorld, checkpoint: number): { x: number; y: number; z: number; yaw: number } {
  const t = track.checkpoints[checkpoint] ?? 0;
  const f = track.main.getFrameAtT(t);
  return {
    x: f.x,
    y: f.y + 1.1,
    z: f.z,
    yaw: Math.atan2(f.tx, f.tz),
  };
}

export function gridPose(track: TrackWorld, slot: number): { x: number; y: number; z: number; yaw: number } {
  const back = 10 + Math.floor(slot / 2) * 8;
  const side = slot % 2 === 0 ? -4.2 : 4.2;
  const f = track.main.getFrameAtT(0.004);
  return {
    x: f.x - f.tx * back + f.rx * side,
    y: f.y + 1.05,
    z: f.z - f.tz * back + f.rz * side,
    yaw: Math.atan2(f.tx, f.tz),
  };
}

export function placeAlong(
  spline: ArcSpline,
  t: number,
  lateral: number,
  yOff: number,
): { x: number; y: number; z: number } {
  const f = spline.getFrameAtT(t);
  return {
    x: f.x + f.rx * lateral,
    y: f.y + yOff,
    z: f.z + f.rz * lateral,
  };
}
