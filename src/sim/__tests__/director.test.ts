import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import { countdownLabel, createDirector, startCountdown, stepDirector } from "../RaceDirector";

describe("race director", () => {
  it("holds GO before releasing the field", () => {
    const dir = createDirector();
    const boats = [createBoat("p", "skimmer", false)];
    startCountdown(dir);
    stepDirector(dir, boats, 3.05);
    expect(dir.phase).toBe("countdown");
    expect(countdownLabel(dir)).toBe("GO");
    stepDirector(dir, boats, 0.5);
    expect(dir.phase).toBe("racing");
  });

  it("lets rivals keep racing after the player finishes", () => {
    const dir = createDirector();
    const player = createBoat("p", "skimmer", false);
    const ai = createBoat("a", "ironwake", true);
    startCountdown(dir);
    stepDirector(dir, [player, ai], 3.5);
    expect(dir.phase).toBe("racing");
    player.finished = true;
    player.finishTime = 12;
    player.lap = 3;
    stepDirector(dir, [player, ai], 0.05);
    expect(dir.phase).toBe("closing");
    expect(ai.finished).toBe(false);
    stepDirector(dir, [player, ai], 4);
    expect(dir.phase).toBe("finish");
    expect(ai.finished).toBe(true);
  });
});
