import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createBoat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import { buildRiptideRefinery } from "../data/tracks/riptideRefinery";
import { gridPose } from "../sim/Track";
import { CameraRig } from "./CameraRig";

describe("showcase orbit", () => {
  it("circles the hull, including a transom view from ahead", () => {
    const boat = createBoat("p", "skimmer", false);
    boat.x = 0;
    boat.y = 1;
    boat.z = 0;
    boat.yaw = 0;
    const rig = new CameraRig(16 / 9);
    rig.snapShowcase(boat);
    const fwd = headingVector(boat.yaw);
    let minAlong = Infinity;
    let maxAlong = -Infinity;
    const dt = 1 / 60;
    const period = (Math.PI * 2) / 0.38;
    for (let t = 0; t < period + 0.5; t += dt) {
      rig.showcase(boat, t, dt);
      const along =
        (boat.x - rig.camera.position.x) * fwd.x + (boat.z - rig.camera.position.z) * fwd.z;
      minAlong = Math.min(minAlong, along);
      maxAlong = Math.max(maxAlong, along);
    }
    expect(maxAlong).toBeGreaterThan(8);
    expect(minAlong).toBeLessThan(-8);
  });
});

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

  it("pulls back further in attract so a three-hull pack fits", () => {
    const track = buildRiptideRefinery();
    const pose = gridPose(track, 0);
    const boat = createBoat("p", "skimmer", false);
    boat.x = pose.x;
    boat.y = pose.y;
    boat.z = pose.z;
    boat.yaw = pose.yaw;
    boat.courseT = pose.t;
    const chase = new CameraRig(16 / 9);
    chase.snap(boat, track, false);
    const wide = new CameraRig(16 / 9);
    wide.snap(boat, track, true);
    const fwd = headingVector(boat.yaw);
    const along = (b: CameraRig) =>
      (boat.x - b.camera.position.x) * fwd.x + (boat.z - b.camera.position.z) * fwd.z;
    expect(along(wide)).toBeGreaterThan(along(chase) + 6);
    expect(wide.camera.position.y).toBeGreaterThan(chase.camera.position.y + 1.5);
  });

  it("widens FOV and sits lower when the hull is airborne", () => {
    const track = buildRiptideRefinery();
    const pose = gridPose(track, 0);
    const boat = createBoat("p", "skimmer", false);
    boat.x = pose.x;
    boat.y = pose.y;
    boat.z = pose.z;
    boat.yaw = pose.yaw;
    boat.courseT = pose.t;
    boat.speed = 24;
    boat.airborne = false;
    const grounded = new CameraRig(16 / 9);
    grounded.snap(boat, track);
    boat.airborne = true;
    const air = new CameraRig(16 / 9);
    air.snap(boat, track);
    expect(grounded.camera.fov).toBeCloseTo(56, 0);
    expect(air.camera.fov).toBeCloseTo(62, 0);
    expect(air.camera.position.y).toBeLessThan(grounded.camera.position.y - 0.3);
    const fwd = headingVector(boat.yaw);
    const airDir = new THREE.Vector3();
    const groundDir = new THREE.Vector3();
    air.camera.getWorldDirection(airDir);
    grounded.camera.getWorldDirection(groundDir);
    const airAhead = airDir.x * fwd.x + airDir.z * fwd.z;
    const groundAhead = groundDir.x * fwd.x + groundDir.z * fwd.z;
    expect(airAhead).toBeGreaterThan(groundAhead);
  });
});
