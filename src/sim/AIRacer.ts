import type { BoatId } from "../data/boats";
import type { Boat } from "./Boat";
import type { TrackWorld } from "./Track";
import { AI_COUNT, RUBBER_BAND } from "./constants";
import { clamp, wrapAngle } from "./math";

export type AIStyle = "race" | "demo";

interface HullFlavor {
  weave: number;
  center: number;
  lean: number;
  brakeBend: number;
  brake: number;
  greedy: boolean;
}

function flavor(id: string): HullFlavor {
  if (id === "ironwake") {
    return { weave: 2.15, center: 0.38, lean: 0.36, brakeBend: 0.2, brake: 0.3, greedy: false };
  }
  if (id === "vesper") {
    return { weave: 2.45, center: 0.22, lean: 0.12, brakeBend: 0.36, brake: 0.2, greedy: true };
  }
  return { weave: 1.12, center: 0.84, lean: 0.08, brakeBend: 0.15, brake: 0.42, greedy: false };
}

function headingAt(track: TrackWorld, t: number): number {
  const f = track.main.getFrameAtT(t);
  return Math.atan2(f.tx, f.tz);
}

function aheadBend(track: TrackWorld, t: number, meters: number): number {
  const dt = meters / track.main.totalLength;
  return Math.abs(wrapAngle(headingAt(track, t + dt) - headingAt(track, t)));
}

function idSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function driveAI(
  boat: Boat,
  track: TrackWorld,
  player: Boat,
  racing: boolean,
  pack: Boat[] = [],
  style: AIStyle = "race",
): void {
  if (style === "demo") {
    driveDemo(boat, track, pack);
    return;
  }
  if (!racing || boat.finished || boat.wipeout > 0) {
    boat.throttle = 0;
    boat.steer = 0;
    boat.brake = 0;
    boat.boostHeld = false;
    return;
  }

  const role = flavor(boat.def.id);
  const look = 18 + boat.speed * 0.4;
  const lookFar = look + 22;
  const invLen = 1 / track.main.totalLength;
  const targetT = boat.courseT + look * invLen;
  const frame = track.main.getFrameAtT(targetT);
  const bendNear = aheadBend(track, targetT, 16);
  const bendFar = aheadBend(track, boat.courseT, lookFar);
  const bend = Math.max(bendNear, bendFar * 0.7);

  const launch = boat.lap === 0 && boat.courseT < 0.12;
  const choke = boat.courseT > 0.37 && boat.courseT < 0.46;
  const setPiece = boat.courseT > 0.26 && boat.courseT < 0.38;
  const inBand = choke || setPiece;
  const tight = (inBand && bend > 0.07) || bend > role.brakeBend;

  const weave =
    Math.sin(boat.time * 0.55 + boat.x * 0.02) * (launch ? 0.7 : role.weave) * (1 - role.center * 0.55);
  let laneOff = weave;
  if (choke) laneOff *= 0.22;

  let rival = player;
  let rivalDist = Math.hypot(player.x - boat.x, player.z - boat.z);
  for (const other of pack) {
    if (other === boat) continue;
    const d = Math.hypot(other.x - boat.x, other.z - boat.z);
    if (d < rivalDist && Math.abs(other.courseT - boat.courseT) < 0.06) {
      rival = other;
      rivalDist = d;
    }
  }

  if (!launch && rivalDist < 16 && Math.abs(rival.courseT - boat.courseT) < 0.05) {
    const rivalLat = (rival.x - frame.x) * frame.rx + (rival.z - frame.z) * frame.rz;
    laneOff = laneOff * (1 - role.lean) + rivalLat * role.lean;
  }

  const maxLat = Math.max(1.1, frame.width * 0.5 - 5.6);
  laneOff = clamp(laneOff, -maxLat, maxLat);
  const dx = frame.x + frame.rx * laneOff - boat.x;
  const dz = frame.z + frame.rz * laneOff - boat.z;
  const err = wrapAngle(Math.atan2(dx, dz) - boat.yaw);
  boat.steer = clamp(err * 1.55, -1, 1);

  const behind = player.courseT + player.lap - (boat.courseT + boat.lap);
  const packN = Math.max(2, pack.length);
  const packEase = packN > 4 ? 0.88 : 1;
  let band = 0;
  if (behind > 0.005) band = clamp(behind * 2.5, 0, RUBBER_BAND) * packEase;
  else if (behind < -0.08) band = clamp(behind * 1.4, -RUBBER_BAND, 0);
  if (role.greedy && bend < 0.18 && behind > -0.12) band = Math.max(band, 0);

  let throttle = 1 + band;
  if (band <= 0 && (tight || Math.abs(err) > 0.72)) throttle = Math.min(throttle, role.greedy ? 0.84 : 0.7);
  if (band <= 0 && inBand && boat.speed > 18) throttle = Math.min(throttle, role.greedy ? 0.88 : 0.74);
  boat.throttle = clamp(throttle, 0.55, 1 + RUBBER_BAND);

  let brake = 0;
  if ((inBand || tight) && boat.speed > 16) brake = role.brake;
  if (bend > role.brakeBend + 0.08 && boat.speed > 14) brake = Math.max(brake, role.brake + 0.08);
  if (Math.abs(err) > 1.05) brake = Math.max(brake, 0.35);
  boat.brake = brake;

  const onStraight = bend < 0.18 && !tight && Math.abs(err) < 0.34;
  const desperate = behind > 0.08;
  const lastPack = behind > 0.16;
  const fuel = boat.boostFuel > 0.18 || boat.superBoostRemaining > 0 || lastPack;
  const wantBoost =
    (onStraight || (desperate && !tight) || lastPack) && boat.speed > 10 && fuel;
  const pulse = lastPack ? -0.82 : onStraight ? -0.32 - (role.greedy ? 0.22 : 0) : 0.18;
  boat.boostHeld = wantBoost && Math.sin(boat.time * 0.85 + boat.x * 0.01) > pulse;
}

/** Attract-mode cruise: spline center, unique weave, no boost or ram. */
function driveDemo(boat: Boat, track: TrackWorld, pack: Boat[]): void {
  const slot = pack.indexOf(boat);
  const i = slot < 0 ? idSeed(boat.id) % 4 : slot;
  const phase = i * 1.26 + idSeed(boat.id) * 0.00021;
  const home = (i % 2 === 0 ? -1 : 1) * (1.12 + (i % 4) * 0.52);
  const look = 22 + boat.speed * 0.3;
  const invLen = 1 / track.main.totalLength;
  const frame = track.main.getFrameAtT(boat.courseT + look * invLen);
  const bend = aheadBend(track, boat.courseT + look * invLen, 18);
  const maxLat = Math.max(1.2, frame.width * 0.5 - 6.5);
  const weave = Math.sin(boat.time * 0.32 + phase) * 0.95;
  const laneOff = clamp(home + weave, -maxLat, maxLat);
  const dx = frame.x + frame.rx * laneOff - boat.x;
  const dz = frame.z + frame.rz * laneOff - boat.z;
  const err = wrapAngle(Math.atan2(dx, dz) - boat.yaw);
  boat.steer = clamp(err * 1.45, -1, 1);
  boat.throttle = bend > 0.2 || Math.abs(err) > 0.85 ? 0.5 : 0.8;
  boat.brake = bend > 0.28 || Math.abs(err) > 1.05 ? 0.4 : 0;
  boat.boostHeld = false;
}

export function assignAIBoats(playerId: string): BoatId[] {
  const all: BoatId[] = ["skimmer", "ironwake", "vesper"];
  const rest = all.filter((id) => id !== playerId);
  const cycle: BoatId[] = rest.length ? [...rest, playerId as BoatId] : all;
  const out: BoatId[] = [];
  for (let i = 0; i < AI_COUNT; i++) out.push(cycle[i % cycle.length] ?? "skimmer");
  return out;
}
