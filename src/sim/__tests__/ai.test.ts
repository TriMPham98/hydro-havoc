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
});
