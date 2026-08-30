import type { Boat } from "./Boat";
import type { TrackWorld } from "./Track";
import { RUBBER_BAND } from "./constants";
import { clamp } from "./math";
import { wrapAngle } from "./math";

export type AIStyle = "race" | "demo";

export function driveAI(
  boat: Boat,
  track: TrackWorld,
  player: Boat,
  racing: boolean,
  pack: Boat[] = [],
  style: AIStyle = "race",
): void {
  if (style === "demo") {
    driveDemo(boat, track);
    return;
  }
  if (!racing || boat.finished) {
    boat.throttle = 0;
    boat.steer = 0;
    boat.brake = 0;
    boat.boostHeld = false;
    return;
  }

  const look = 16 + boat.speed * 0.35;
  const targetT = boat.courseT + look / track.main.totalLength;
  const frame = track.main.getFrameAtT(targetT);
  const launch = boat.lap === 0 && boat.courseT < 0.12;
  const weave = Math.sin(boat.time * 0.55 + boat.x * 0.02) * (launch ? 1.4 : 3.2);
  let laneOff = weave;
  const choke = boat.courseT > 0.37 && boat.courseT < 0.46;
  if (choke) laneOff *= 0.28;
  const pdx = player.x - boat.x;
  const pdz = player.z - boat.z;
  const pdist = Math.hypot(pdx, pdz);
  const tDelta = boat.courseT + boat.lap - (player.courseT + player.lap);
  const drafting = !launch && tDelta < -0.002 && tDelta > -0.045 && pdist < 18;
  const bump = !launch && Math.abs(tDelta) < 0.018 && pdist < 9.5;
  if (drafting) laneOff = (player.x - frame.x) * frame.rx + (player.z - frame.z) * frame.rz;
  if (bump) laneOff += Math.sign(Math.sin(boat.time * 3.1 + boat.x)) * 3.2;
  const laneX = frame.x + frame.rx * laneOff;
  const laneZ = frame.z + frame.rz * laneOff;
  let rival = player;
  let rivalDist = pdist;
  for (const other of pack) {
    if (other === boat) continue;
    const d = Math.hypot(other.x - boat.x, other.z - boat.z);
    if (d < rivalDist && Math.abs(other.courseT - boat.courseT) < 0.06) {
      rival = other;
      rivalDist = d;
    }
  }
  const setPiece = boat.courseT > 0.26 && boat.courseT < 0.38;
  const scrum = !launch && rivalDist < 14 && Math.abs(rival.courseT - boat.courseT) < 0.05;
  const ramLane =
    scrum ||
    (rivalDist < 24 && boat.speed > rival.speed - 2 && Math.abs(rival.courseT - boat.courseT) < 0.09) ||
    (setPiece && rivalDist < 32);
  const rdx = rival.x - boat.x;
  const rdz = rival.z - boat.z;
  const ramMix = launch ? 0 : scrum ? 0.72 : ramLane || bump ? 0.55 : 0;
  const dx = rdx * ramMix + (laneX - boat.x) * (1 - ramMix * 0.35);
  const dz = rdz * ramMix + (laneZ - boat.z) * (1 - ramMix * 0.35);
  const desired = Math.atan2(dx, dz);
  const err = wrapAngle(desired - boat.yaw);
  boat.steer = clamp(err * 1.6, -1, 1);
  boat.throttle = 1;
  boat.brake = Math.abs(err) > 1.15 ? 0.35 : 0;

  const behind = player.courseT + player.lap - (boat.courseT + boat.lap);
  const band = clamp(behind * 2.8, -RUBBER_BAND, RUBBER_BAND);
  const draftPull = drafting ? 0.08 : 0;
  boat.throttle = clamp(1 + band + draftPull, 0.62, 1);

  const curvature = Math.abs(err);
  const onStraight = curvature < 0.34;
  const desperate = behind > 0.08;
  const lastPack = behind > 0.16;
  const steal = pdist < 16 && behind > -0.02;
  const wantBoost =
    (onStraight || desperate || steal || lastPack) &&
    boat.speed > 10 &&
    (boat.boostFuel > 0.18 || boat.superBoostRemaining > 0 || lastPack);
  const pulse = lastPack || scrum ? -0.82 : -0.42;
  boat.boostHeld = wantBoost && Math.sin(boat.time * 0.85 + boat.x * 0.01) > pulse;
  if (lastPack || scrum) boat.throttle = 1;
}

/** Attract-mode cruise: spline center, light weave, no boost or ram. */
function driveDemo(boat: Boat, track: TrackWorld): void {
  const look = 20 + boat.speed * 0.28;
  const frame = track.main.getFrameAtT(boat.courseT + look / track.main.totalLength);
  const maxLat = Math.max(1.2, frame.width * 0.5 - 6.5);
  const laneOff = clamp(Math.sin(boat.time * 0.32 + boat.x * 0.01) * 1.15, -maxLat, maxLat);
  const dx = frame.x + frame.rx * laneOff - boat.x;
  const dz = frame.z + frame.rz * laneOff - boat.z;
  const err = wrapAngle(Math.atan2(dx, dz) - boat.yaw);
  boat.steer = clamp(err * 1.45, -1, 1);
  boat.throttle = Math.abs(err) > 0.85 ? 0.52 : 0.8;
  boat.brake = Math.abs(err) > 1.05 ? 0.38 : 0;
  boat.boostHeld = false;
}

export function assignAIBoats(playerId: string): Array<"skimmer" | "ironwake" | "vesper"> {
  const all: Array<"skimmer" | "ironwake" | "vesper"> = ["skimmer", "ironwake", "vesper"];
  const rest = all.filter((id) => id !== playerId);
  const out: Array<"skimmer" | "ironwake" | "vesper"> = [];
  for (let i = 0; i < 3; i++) out.push(rest[i % rest.length] ?? "skimmer");
  return out;
}
