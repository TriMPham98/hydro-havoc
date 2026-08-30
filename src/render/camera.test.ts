import { describe, expect, it } from "vitest";
import { createBoat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import { buildRiptideRefinery } from "../data/tracks/riptideRefinery";
import { gridPose } from "../sim/Track";
import { CameraRig } from "./CameraRig";

describe("chase camera", () => {
  it("sits behind the grid hull, not the canal center, during countdown", () => {
    const track = buildRiptideRefinery();
    const pose = gridPose(track, 0);
    const boat = createBoat("p", "skimmer", false);
    boat.x = pose.x;
    boat.y = pose.y;
    boat.z = pose.z;
    boat.yaw = pose.yaw;
    boat.courseT = pose.t;
    boat.speed = 0;
    const rig = new CameraRig(16 / 9);
    rig.snap(boat, track);
    const fwd = headingVector(boat.yaw);
    const toBoatX = boat.x - rig.camera.position.x;
    const toBoatZ = boat.z - rig.camera.position.z;
    const along = toBoatX * fwd.x + toBoatZ * fwd.z;
    const side = toBoatX * fwd.z + toBoatZ * -fwd.x;
    expect(along).toBeGreaterThan(8);
    expect(Math.abs(side)).toBeLessThan(0.45);
  });
});
