import { describe, expect, it } from "vitest";
import { copyPose, createBoat } from "../Boat";
import { assignAIBoats, driveAI } from "../AIRacer";
import { buildRiptideRefinery } from "../../data/tracks/riptideRefinery";
import { stepBoat } from "../BoatController";
import { gridPose, queryCourse } from "../Track";

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

  it("demo style cruises the main canal without boost or bank hits", () => {
    const track = buildRiptideRefinery();
    const boat = createBoat("demo", "skimmer", true);
    const pose = gridPose(track, 0);
    copyPose(boat, pose);
    boat.courseT = pose.t;
    boat.speed = 22;
    boat.vx = Math.sin(boat.yaw) * 22;
    boat.vz = Math.cos(boat.yaw) * 22;
    let hits = 0;
    for (let i = 0; i < 240; i++) {
      driveAI(boat, track, boat, true, [boat], "demo");
      expect(boat.boostHeld).toBe(false);
      const step = stepBoat(boat, track, 1 / 60, i / 60, false);
      if (step.bankHit) hits++;
    }
    const q = queryCourse(track, boat.x, boat.y, boat.z, boat.courseT);
    expect(q.onRibbon).toBe(true);
    expect(q.onShortcut).toBe(false);
    expect(Math.abs(q.lateral)).toBeLessThan(q.halfWidth - 2);
    expect(hits).toBeLessThan(8);
    expect(boat.courseT).toBeGreaterThan(pose.t + 0.02);
  });

  it("fills the field with the other two hulls, not a triple copy", () => {
    const ids = assignAIBoats("skimmer");
    expect(ids).toHaveLength(3);
    expect(ids.includes("ironwake")).toBe(true);
    expect(ids.includes("vesper")).toBe(true);
    expect(ids.every((id) => id !== "skimmer")).toBe(true);
    expect(ids.filter((id) => id === ids[ids.length - 1]).length).toBeLessThan(3);
  });
});
