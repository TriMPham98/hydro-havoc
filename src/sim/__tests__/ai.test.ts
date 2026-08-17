import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import { driveAI } from "../AIRacer";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";

describe("AI theater", () => {
  it("drafts harder when stacked just behind the player", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", true);
    const ai = createBoat("a", "ironwake", false);
    const start = track.main.getFrameAtT(0.2);
    player.x = start.x;
    player.z = start.z;
    player.courseT = 0.2;
    player.lap = 0;
    const back = track.main.getFrameAtT(0.185);
    ai.x = back.x;
    ai.z = back.z;
    ai.courseT = 0.185;
    ai.lap = 0;
    ai.speed = 18;
    ai.boostFuel = 1;
    driveAI(ai, track, player, true);
    expect(ai.throttle).toBeGreaterThan(0.95);
    expect(ai.steer).toBeGreaterThan(-1);
  });

  it("aims at a close pack rival for scrum theater", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", true);
    const ai = createBoat("a", "ironwake", false);
    const f = track.main.getFrameAtT(0.3);
    player.x = f.x;
    player.z = f.z;
    player.courseT = 0.3;
    ai.x = f.x + f.rx * 4;
    ai.z = f.z + f.rz * 4;
    ai.courseT = 0.3;
    ai.speed = 22;
    player.speed = 20;
    ai.yaw = Math.atan2(f.tx, f.tz);
    driveAI(ai, track, player, true, [player, ai]);
    expect(ai.throttle).toBeGreaterThan(0.6);
    expect(Math.abs(ai.steer)).toBeGreaterThan(0);
  });
});
