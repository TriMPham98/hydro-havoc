import type { Boat } from "./Boat";
import type { TrackWorld } from "./Track";
import { RUBBER_BAND } from "./constants";
import { clamp } from "./math";
import { wrapAngle } from "./math";

export function driveAI(boat: Boat, track: TrackWorld, player: Boat, racing: boolean, pack: Boat[] = []): void {
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
  const weave = Math.sin(boat.time * 0.55 + boat.x * 0.02) * 5.2;
  let laneOff = weave;
  const pdx = player.x - boat.x;
  const pdz = player.z - boat.z;
  const pdist = Math.hypot(pdx, pdz);
  const tDelta = boat.courseT + boat.lap - (player.courseT + player.lap);
  const drafting = tDelta < -0.002 && tDelta > -0.045 && pdist < 18;
  const bump = Math.abs(tDelta) < 0.018 && pdist < 9.5;
  if (drafting) laneOff = (player.x - frame.x) * frame.rx + (player.z - frame.z) * frame.rz;
  if (bump) laneOff += Math.sign(Math.sin(boat.time * 3.1 + boat.x)) * 3.4;
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
  const ramLane =
    rivalDist < 22 && boat.speed > rival.speed - 2 && Math.abs(rival.courseT - boat.courseT) < 0.08;
  const rdx = rival.x - boat.x;
  const rdz = rival.z - boat.z;
  const dx = ramLane || bump ? rdx * 0.5 + (laneX - boat.x) : laneX - boat.x;
  const dz = ramLane || bump ? rdz * 0.5 + (laneZ - boat.z) : laneZ - boat.z;
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
  const steal = pdist < 16 && behind > -0.02;
  const wantBoost =
    (onStraight || desperate || steal) &&
    boat.speed > 10 &&
    (boat.boostFuel > 0.18 || boat.superBoostRemaining > 0);
  boat.boostHeld = wantBoost && Math.sin(boat.time * 0.85 + boat.x * 0.01) > -0.42;
}

export function assignAIBoats(playerId: string): Array<"skimmer" | "ironwake" | "vesper"> {
  const all: Array<"skimmer" | "ironwake" | "vesper"> = ["skimmer", "ironwake", "vesper"];
  const rest = all.filter((id) => id !== playerId);
  while (rest.length < 3) rest.push(rest[rest.length - 1] ?? "skimmer");
  return rest.slice(0, 3);
}
