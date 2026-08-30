import * as THREE from "three";
import type { Boat } from "../sim/Boat";
import { headingVector } from "../sim/Boat";
import { gerstnerHeight } from "../sim/waterHeight";

/** Hull pose sits this far above Gerstner water (see BoatController waterY). */
export const HULL_WATERLINE = 0.55;

const GRID = 6;

function contactMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: {
      uOpacity: { value: 0.4 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        float a = smoothstep(1.0, 0.12, d) * uOpacity;
        if (a < 0.012) discard;
        gl_FragColor = vec4(0.015, 0.03, 0.04, a);
      }
    `,
  });
}

class HullContact {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private player: boolean;

  constructor(id: string, player: boolean) {
    this.player = player;
    this.mat = contactMaterial();
    const geo = new THREE.PlaneGeometry(1, 1, GRID, GRID);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = "hullContact";
    this.mesh.userData.boatId = id;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  sync(boat: Boat, time: number): void {
    const wet = boat.onWater && !boat.airborne;
    this.mesh.visible = wet;
    if (!wet) {
      this.mat.uniforms.uOpacity.value = 0;
      return;
    }
    const fwd = headingVector(boat.yaw);
    const rightX = fwd.z;
    const rightZ = -fwd.x;
    const hw = boat.def.hullWidth * (this.player ? 0.62 : 0.52);
    const hl = boat.def.hullLength * (this.player ? 0.4 : 0.34);
    const wave0 = gerstnerHeight(boat.x, boat.z, time);
    const waterY = boat.y - HULL_WATERLINE;
    const pos = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = (i % (GRID + 1)) / GRID;
      const v = Math.floor(i / (GRID + 1)) / GRID;
      const lat = (u - 0.5) * 2 * hw;
      const lon = (v - 0.5) * 2 * hl;
      const px = boat.x + rightX * lat + fwd.x * lon;
      const pz = boat.z + rightZ * lat + fwd.z * lon;
      const py = waterY + (gerstnerHeight(px, pz, time) - wave0) + 0.035;
      pos.setXYZ(i, px, py, pz);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mat.uniforms.uOpacity.value = this.player ? 0.46 : 0.32;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

export class ContactField {
  readonly group = new THREE.Group();
  private byId = new Map<string, HullContact>();

  constructor() {
    this.group.name = "contacts";
  }

  sync(boats: Boat[], time: number): void {
    const seen = new Set<string>();
    for (const boat of boats) {
      seen.add(boat.id);
      let hull = this.byId.get(boat.id);
      if (!hull) {
        hull = new HullContact(boat.id, !boat.ai);
        this.byId.set(boat.id, hull);
        this.group.add(hull.mesh);
      }
      hull.sync(boat, time);
    }
    for (const [id, hull] of this.byId) {
      if (seen.has(id)) continue;
      this.group.remove(hull.mesh);
      hull.dispose();
      this.byId.delete(id);
    }
  }
}
