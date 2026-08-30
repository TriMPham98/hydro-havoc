import { CHECKPOINT_COUNT, LATERAL_PAD } from "./constants";
import { clamp, wrap01 } from "./math";
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

export type CrateKind = "boost" | "mine" | "crusher";

export interface CrateSlot {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: CrateKind;
  taken: number;
  vx: number;
  vz: number;
}

export interface Mine {
  id: string;
  x: number;
  y: number;
  z: number;
  age: number;
  live: boolean;
}

/** Outer-lane silt / dirty water. Sim drag only. */
export interface SlowBand {
  t0: number;
  t1: number;
  minAbsLat: number;
  drag: number;
}

/** Threadable harbor channel markers. Split the pair for a speed kiss. */
export interface BuoyGate {
  t: number;
  gap: number;
}

export interface TrackWorld {
  id: string;
  name: string;
  main: ArcSpline;
  shortcut: ArcSpline;
  shortcutEnterT: number;
  shortcutExitT: number;
  checkpoints: number[];
  pickups: PlacedPickup[];
  crates: CrateSlot[];
  mines: Mine[];
  slowBands: SlowBand[];
  buoyGates: BuoyGate[];
  start: Frame;
  sectors: { until: number; name: string }[];
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
    id: "course",
    name: "Course",
    main,
    shortcut,
    shortcutEnterT: enter.frame.t,
    shortcutExitT: exit.frame.t,
    checkpoints,
    pickups: [],
    crates: [],
    mines: [],
    slowBands: [],
    buoyGates: [],
    start: main.getFrameAtT(0),
    sectors: [{ until: 1, name: "CANAL" }],
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

const CUT_AIR = 7.8;
const CUT_PLANAR_PAD = 4.2;
const CUT_T_PAD = 0.055;

export function mapShortcutToCourseT(track: TrackWorld, shortcutT: number): number {
  const a = track.shortcutEnterT;
  const b = track.shortcutExitT;
  const u = clamp(shortcutT, 0, 1);
  if (b >= a) return a + (b - a) * u;
  return wrap01(a + (1 - a + b) * u);
}

function inTSpan(t: number, a: number, b: number, pad: number): boolean {
  const lo = a - pad;
  const hi = b + pad;
  if (a <= b) return t >= lo && t <= hi;
  return t >= lo || t <= hi;
}

export function queryCourse(track: TrackWorld, x: number, y: number, z: number, hintT = 0): CourseQuery {
  const main = track.main.project(x, y, z, hintT);
  const half = main.frame.width * 0.5;
  const mainOn = Math.abs(main.lateral) < half + LATERAL_PAD;
  const cut = track.shortcut.project(x, y, z);
  const cutHalf = cut.frame.width * 0.5;
  const mapped = mapShortcutToCourseT(track, cut.frame.t);
  const windowed =
    inTSpan(hintT, track.shortcutEnterT, track.shortcutExitT, CUT_T_PAD) ||
    inTSpan(main.frame.t, track.shortcutEnterT, track.shortcutExitT, CUT_T_PAD) ||
    inTSpan(mapped, track.shortcutEnterT, track.shortcutExitT, CUT_T_PAD);
  const cutOn =
    Math.abs(cut.lateral) < cutHalf + LATERAL_PAD &&
    cut.planar < cutHalf + CUT_PLANAR_PAD &&
    Math.abs(cut.height) < CUT_AIR;
  const onMainSurface = mainOn && Math.abs(main.height) < 3.2;
  const cutHigher = cut.frame.y - main.frame.y > 2.2;
  const snapRisk = onMainSurface && (cutHigher || cut.planar > main.planar - 1.2);
  const preferCut = cutOn && windowed && cut.planar + 0.8 < main.planar && !snapRisk;

  if (preferCut) {
    return {
      frame: cut.frame,
      lateral: cut.lateral,
      onRibbon: true,
      onShortcut: true,
      courseT: mapped,
      waterY: cut.frame.y,
      halfWidth: cutHalf,
    };
  }
  return {
    frame: main.frame,
    lateral: main.lateral,
    onRibbon: mainOn,
    onShortcut: false,
    courseT: main.frame.t,
    waterY: main.frame.y,
    halfWidth: half,
  };
}

export function buoyGateKiss(track: TrackWorld, prevT: number, nextT: number, lateral: number): number {
  let kiss = 0;
  for (const g of track.buoyGates) {
    const half = g.gap * 0.5 - 1.2;
    if (prevT < g.t && nextT >= g.t && Math.abs(lateral) < half) kiss = Math.max(kiss, 2.15);
  }
  return kiss;
}

export function resolveBank(
  q: CourseQuery,
  x: number,
  z: number,
  vx: number,
  vz: number,
  hullHalfWidth = 2.2,
): { x: number; z: number; vx: number; vz: number; hit: boolean } {
  const limit = Math.max(1.2, q.halfWidth - hullHalfWidth - 0.35);
  if (Math.abs(q.lateral) <= limit) return { x, z, vx, vz, hit: false };
  const sign = Math.sign(q.lateral) || 1;
  const over = Math.abs(q.lateral) - limit;
  const nx = q.frame.rx * sign;
  const nz = q.frame.rz * sign;
  const pushedX = x - nx * (over + 0.05);
  const pushedZ = z - nz * (over + 0.05);
  const incoming = Math.hypot(vx, vz);
  const vn = vx * nx + vz * nz;
  let nvx = vx;
  let nvz = vz;
  if (vn > 0) {
    nvx -= vn * nx;
    nvz -= vn * nz;
  }
  const tx = q.frame.tx;
  const tz = q.frame.tz;
  let along = nvx * tx + nvz * tz;
  if (incoming > 5 && Math.abs(along) < incoming * 0.55) {
    const forward = along >= 0 || Math.abs(along) < incoming * 0.12 ? 1 : Math.sign(along);
    along = forward * Math.max(Math.abs(along), incoming * 0.78);
  }
  along *= 0.997;
  nvx = tx * along;
  nvz = tz * along;
  return { x: pushedX, z: pushedZ, vx: nvx, vz: nvz, hit: true };
}

export function slowBandDrag(track: TrackWorld, t: number, lateral: number): number {
  let drag = 0;
  for (const band of track.slowBands) {
    if (t >= band.t0 && t <= band.t1 && Math.abs(lateral) >= band.minAbsLat) drag += band.drag;
  }
  return drag;
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

export function gridPose(track: TrackWorld, slot: number): { x: number; y: number; z: number; yaw: number; t: number } {
  const row = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? -5.0 : 5.0;
  const spacing = 12;
  const frontT = 0.042;
  const t = wrap01(frontT - (row * spacing) / track.main.totalLength);
  const f = track.main.getFrameAtT(t);
  const maxLat = Math.max(2.8, f.width * 0.5 - 5.2);
  const lat = clamp(side, -maxLat, maxLat);
  return {
    x: f.x + f.rx * lat,
    y: f.y + 1.05,
    z: f.z + f.rz * lat,
    yaw: Math.atan2(f.tx, f.tz),
    t,
  };
}

/** Pull a world point back onto the water if it has drifted into a bank. */
export function clampToCanal(
  track: TrackWorld,
  x: number,
  y: number,
  z: number,
  hintT: number,
  pad = 4.2,
): { x: number; y: number; z: number } {
  const q = queryCourse(track, x, y, z, hintT);
  const limit = Math.max(1.2, q.halfWidth - pad);
  if (Math.abs(q.lateral) <= limit) return { x, y, z };
  const extra = Math.abs(q.lateral) - limit;
  const sign = Math.sign(q.lateral) || 1;
  return {
    x: x - q.frame.rx * sign * extra,
    y,
    z: z - q.frame.rz * sign * extra,
  };
}

/** Title attract: a single hull on the canal center. Extra slots stay unused. */
export function attractPose(
  track: TrackWorld,
  slot: number,
): { x: number; y: number; z: number; yaw: number; t: number } {
  const hostT = 0.085;
  const ahead = slot === 0 ? 0 : 18;
  const lat = slot === 0 ? 0 : slot === 1 ? -7.2 : 7.2;
  const t = wrap01(hostT + ahead / track.main.totalLength);
  const f = track.main.getFrameAtT(t);
  const maxLat = Math.max(2.6, f.width * 0.5 - 5.0);
  const side = clamp(lat, -maxLat, maxLat);
  return {
    x: f.x + f.rx * side,
    y: f.y + 1.05,
    z: f.z + f.rz * side,
    yaw: Math.atan2(f.tx, f.tz),
    t,
  };
}

/** Center of a wide harbor straight — hull select, not the start grid. */
export function showcasePose(track: TrackWorld): { x: number; y: number; z: number; yaw: number; t: number } {
  const f = track.main.getFrameAtT(0.06);
  return {
    x: f.x,
    y: f.y + 1.05,
    z: f.z,
    yaw: Math.atan2(f.tx, f.tz),
    t: 0.06,
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
