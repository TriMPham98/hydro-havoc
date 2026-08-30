import { describe, expect, it } from "vitest";
import { createBoat } from "../Boat";
import { BLUE_BOOST, CRUSHER_DURATION, MINE_ARM, RED_BOOST } from "../constants";
import { stepPickups } from "../Pickups";
import { buildRiptideRefinery, rollCrateKinds } from "../../data/tracks/riptideRefinery";

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
    expect(player.pendingBoost).toBeCloseTo(BLUE_BOOST);
    expect(player.boostFuel).toBe(0);
    expect(ai.boostFuel).toBe(0);

    blue.taken = 0;
    player.pendingBoost = 0;
    player.jetBay = 0;
    player.x = red.x;
    player.y = red.y;
    player.z = red.z;
    ai.x = red.x;
    ai.y = red.y;
    ai.z = red.z;
    const redHits = stepPickups(track, [ai, player], 0, 2);
    expect(redHits.some((e) => e.kind === "red" && e.boat === player)).toBe(true);
    expect(player.pendingBoost).toBeCloseTo(RED_BOOST);
    expect(player.boostFuel).toBe(0);

    player.x = sup.x;
    player.y = sup.y;
    player.z = sup.z;
    ai.x = sup.x;
    ai.y = sup.y;
    ai.z = sup.z;
    const superHits = stepPickups(track, [ai, player], 0, 3);
    expect(superHits.some((e) => e.kind === "super" && e.boat === player)).toBe(true);
    expect(player.pendingSuper).toBeGreaterThan(0);
    expect(player.superBoostRemaining).toBe(0);
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
    expect(stepPickups(track, [ai, player], 0, 1).some((e) => e.kind === "crate-boost")).toBe(false);
    expect(ai.boostFuel).toBe(0);
    expect(ai.pendingBoost).toBe(0);
    expect(boostCrate.taken).toBe(0);

    player.boostHeld = true;
    player.boostFuel = 1;
    player.x = boostCrate.x;
    player.y = boostCrate.y;
    player.z = boostCrate.z;
    const crateHits = stepPickups(track, [ai, player], 0, 2);
    expect(crateHits.some((e) => e.kind === "crate-boost" && e.boat === player)).toBe(true);
    expect(player.boostFuel).toBeGreaterThan(1);

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

  it("does not collect boost crates unless the player is Mega Hull boosting", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", false);
    const crate = track.crates[0];
    crate.kind = "boost";
    crate.taken = 0;
    player.x = crate.x;
    player.y = crate.y;
    player.z = crate.z;
    player.boostHeld = false;
    player.boostFuel = 2;
    expect(stepPickups(track, [player], 0, 1).some((e) => e.kind === "crate-boost")).toBe(false);
    expect(crate.taken).toBe(0);
    expect(player.pendingBoost).toBe(0);
  });

  it("moves a crate when a boat overlaps it over a few steps", () => {
    const track = buildRiptideRefinery();
    const crate = track.crates[0];
    crate.kind = "boost";
    crate.taken = 0;
    crate.vx = 0;
    crate.vz = 0;
    const x0 = crate.x;
    const z0 = crate.z;
    const ai = createBoat("a", "ironwake", true);
    const player = createBoat("p", "skimmer", false);
    player.x = 9000;
    player.z = 9000;
    ai.x = crate.x;
    ai.y = crate.y;
    ai.z = crate.z;
    ai.vx = 18;
    ai.speed = 18;
    ai.yaw = Math.PI / 2;
    for (let i = 0; i < 8; i++) stepPickups(track, [ai, player], 1 / 60, 1);
    expect(Math.hypot(crate.x - x0, crate.z - z0)).toBeGreaterThan(0.4);
    expect(crate.taken).toBe(0);
    expect(ai.pendingBoost).toBe(0);
    expect(ai.boostFuel).toBe(0);
  });

  it("lets AI push boost crates without collecting them", () => {
    const track = buildRiptideRefinery();
    const crate = track.crates.find((c) => c.kind === "boost") ?? track.crates[0];
    crate.kind = "boost";
    crate.taken = 0;
    const ai = createBoat("a", "vesper", true);
    ai.x = crate.x;
    ai.y = crate.y;
    ai.z = crate.z;
    ai.vx = 12;
    ai.vz = 4;
    ai.speed = 12;
    const ev = stepPickups(track, [ai], 1 / 60, 1);
    expect(ev.some((e) => e.kind === "crate-boost")).toBe(false);
    expect(crate.taken).toBe(0);
    expect(ai.pendingBoost).toBe(0);
    expect(Math.hypot(crate.vx, crate.vz)).toBeGreaterThan(0);
  });

  it("keeps exactly one hull crusher after rollCrateKinds", () => {
    const track = buildRiptideRefinery();
    for (const rng of [() => 0, () => 0.49, () => 0.99]) {
      rollCrateKinds(track, rng);
      expect(track.crates.filter((c) => c.kind === "crusher")).toHaveLength(1);
    }
    for (const crate of track.crates) crate.kind = "boost";
    rollCrateKinds(track, () => 0.2);
    expect(track.crates.filter((c) => c.kind === "crusher")).toHaveLength(1);
  });

  it("lets a boosting player smash a hull crusher crate", () => {
    const track = buildRiptideRefinery();
    const player = createBoat("p", "skimmer", false);
    const crate = track.crates.find((c) => c.kind === "crusher") ?? track.crates[3];
    crate.kind = "crusher";
    crate.taken = 0;
    player.x = crate.x;
    player.y = crate.y;
    player.z = crate.z;
    player.boostHeld = true;
    player.boostFuel = 1;
    const hits = stepPickups(track, [player], 0, 1);
    expect(hits.some((e) => e.kind === "crate-crusher" && e.boat === player)).toBe(true);
    expect(player.crusherUntil).toBe(CRUSHER_DURATION);
    expect(crate.taken).toBeGreaterThan(0);
  });
});
