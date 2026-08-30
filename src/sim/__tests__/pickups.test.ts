import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import { BLUE_BOOST, MINE_ARM, RED_BOOST } from "../constants";
import { stepPickups } from "../Pickups";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";

describe("pickups", () => {
  it("lets the player collect boosts while AI skips them", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", false);
    const ai = createBoat("a", "ironwake", true);
    const blue = track.pickups.find((p) => p.kind === "blue");
    const red = track.pickups.find((p) => p.kind === "red");
    const sup = track.pickups.find((p) => p.kind === "super");
    if (!blue || !red || !sup) throw new Error("expected boost pickups");

    ai.x = blue.x;
    ai.y = blue.y;
    ai.z = blue.z;
    player.x = 9000;
    player.z = 9000;
    expect(stepPickups(track, [ai, player], 0, 1)).toEqual([]);
    expect(ai.boostFuel).toBe(0);
    expect(blue.taken).toBe(0);

    player.x = blue.x;
    player.y = blue.y;
    player.z = blue.z;
    const blueHits = stepPickups(track, [ai, player], 0, 1);
    expect(blueHits.some((e) => e.kind === "blue" && e.boat === player)).toBe(true);
    expect(player.boostFuel).toBeCloseTo(BLUE_BOOST);
    expect(ai.boostFuel).toBe(0);

    blue.taken = 0;
    player.boostFuel = 0;
    player.x = red.x;
    player.y = red.y;
    player.z = red.z;
    ai.x = red.x;
    ai.y = red.y;
    ai.z = red.z;
    const redHits = stepPickups(track, [ai, player], 0, 2);
    expect(redHits.some((e) => e.kind === "red" && e.boat === player)).toBe(true);
    expect(player.boostFuel).toBeCloseTo(RED_BOOST);

    player.x = sup.x;
    player.y = sup.y;
    player.z = sup.z;
    ai.x = sup.x;
    ai.y = sup.y;
    ai.z = sup.z;
    const superHits = stepPickups(track, [ai, player], 0, 3);
    expect(superHits.some((e) => e.kind === "super" && e.boat === player)).toBe(true);
    expect(player.superBoostRemaining).toBeGreaterThan(0);
    expect(ai.superBoostRemaining).toBe(0);
  });

  it("skips boost crates for AI but still lets them trigger mines", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", false);
    const ai = createBoat("a", "vesper", true);
    player.x = 8000;
    player.z = 8000;
    const boostCrate = track.crates[0];
    const mineCrate = track.crates[1];
    boostCrate.kind = "boost";
    mineCrate.kind = "mine";

    ai.x = boostCrate.x;
    ai.y = boostCrate.y;
    ai.z = boostCrate.z;
    expect(stepPickups(track, [ai, player], 0, 1)).toEqual([]);
    expect(ai.boostFuel).toBe(0);
    expect(boostCrate.taken).toBe(0);

    player.x = boostCrate.x;
    player.y = boostCrate.y;
    player.z = boostCrate.z;
    const crateHits = stepPickups(track, [ai, player], 0, 2);
    expect(crateHits.some((e) => e.kind === "crate-boost" && e.boat === player)).toBe(true);
    expect(player.boostFuel).toBeGreaterThan(0);

    ai.x = mineCrate.x;
    ai.y = mineCrate.y;
    ai.z = mineCrate.z;
    const mineDrop = stepPickups(track, [ai], 0, 3);
    expect(mineDrop.some((e) => e.kind === "crate-mine" && e.boat === ai)).toBe(true);
    expect(track.mines.length).toBeGreaterThan(0);

    const mine = track.mines[0];
    mine.age = MINE_ARM;
    ai.x = mine.x;
    ai.y = mine.y;
    ai.z = mine.z;
    ai.speed = 24;
    const blasts = stepPickups(track, [ai], 0, 4);
    expect(blasts.some((e) => e.kind === "mine" && e.boat === ai)).toBe(true);
    expect(ai.speed).toBeLessThan(24);
  });
});
