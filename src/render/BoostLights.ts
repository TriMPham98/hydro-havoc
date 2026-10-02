import * as THREE from "three";
import { BOOST_CAP, JET_SPUTTER, SUPER_DURATION } from "../sim/constants";

/**
 * Hull light strips (BoostStrip_L / _R along the sponson decks, _T across the transom).
 *
 *  pickup   → a white-hot head races stern → bow and the gauge fills behind it, then the hull flashes
 *  armed    → strips hold the fuel level and breathe in the pickup colour
 *  boosting → chevrons chase aft at speed, white-hot core, gauge drains in real time
 *  empty    → strips stutter red like a dying fluorescent tube, then go dark
 */

export const STRIP_PREFIX = /^BoostStrip_/;

const CYAN = new THREE.Color(0x2ee6ff);
const RED = new THREE.Color(0xff3d6e);
const GOLD = new THREE.Color(0xffd23a);
const SWEEP_TIME = 0.55;

export interface BoostLightState {
  boostFuel: number;
  pendingBoost: number;
  superRemaining: number;
  pendingSuper: number;
  boosting: boolean;
  sputter: number;
  dt: number;
  time: number;
}

interface Rig {
  mats: THREE.ShaderMaterial[];
  idle: THREE.Color;
  shown: number;
  lastFuel: number;
  lastSuper: number;
  sweep: number;
  flash: number;
  boost: number;
  kick: number;
  color: THREE.Color;
  wasBoosting: boolean;
}

const rigs = new WeakMap<THREE.Object3D, Rig>();

function stripMaterial(axis: 0 | 1, lo: number, hi: number, idle: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAxis: { value: axis },
      uLo: { value: lo },
      uHi: { value: hi },
      uFuel: { value: 0 },
      uSweep: { value: -1 },
      uBoost: { value: 0 },
      uKick: { value: 0 },
      uDie: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: CYAN.clone() },
      uIdle: { value: idle.clone() },
    },
    vertexShader: `
      uniform float uAxis;
      uniform float uLo;
      uniform float uHi;
      varying float vAlong;
      void main() {
        float c = uAxis < 0.5 ? position.z : abs(position.x);
        // Sponson strips: 0 at the stern, 1 at the bow. Transom bar: 0 centre, 1 tips.
        vAlong = clamp((c - uLo) / max(1e-4, uHi - uLo), 0.0, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uFuel;
      uniform float uSweep;
      uniform float uBoost;
      uniform float uKick;
      uniform float uDie;
      uniform float uFlash;
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uIdle;
      varying float vAlong;

      float hash(float n) { return fract(sin(n) * 43758.5453); }

      void main() {
        float a = vAlong;
        vec3 col = uIdle * 0.22;

        // Fuel gauge, filling from the stern.
        float lit = (1.0 - smoothstep(uFuel - 0.015, uFuel + 0.015, a)) * step(0.001, uFuel);
        float breathe = 0.7 + 0.3 * sin(uTime * 3.2 - a * 7.0);
        col += uColor * lit * breathe * 1.6;

        // Boosting: chevrons racing aft, white-hot core.
        float chase = fract(a * 7.0 + uTime * 6.5);
        float band = smoothstep(0.0, 0.12, chase) * smoothstep(0.55, 0.25, chase);
        vec3 hot = mix(uColor, vec3(1.0), 0.45);
        col += hot * lit * uBoost * (1.2 + band * 3.4);
        col += vec3(1.0) * lit * uKick * 2.5;

        // Pickup sweep head + trailing charge.
        if (uSweep >= 0.0) {
          float d = a - uSweep;
          col += vec3(1.0) * exp(-d * d * 420.0) * 5.0;
          col += uColor * exp(-max(0.0, -d) * 9.0) * step(d, 0.0) * 1.4;
        }
        col += mix(uColor, vec3(1.0), 0.5) * uFlash * 3.0;

        // Dry tank: fluorescent-tube stutter, red, then dark.
        if (uDie > 0.0) {
          float tick = floor(uTime * 26.0);
          float on = step(0.45 + uDie * 0.45, hash(tick + floor(a * 5.0) * 7.0));
          vec3 ember = vec3(1.0, 0.16, 0.06) * (0.4 + 2.6 * on) * (1.0 - uDie);
          col = mix(col, ember + uIdle * 0.04, smoothstep(0.0, 0.08, uDie));
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Swap strip materials for animated ones. Call once per spawned hull (after cloning). */
export function bindBoostLights(root: THREE.Object3D, idleHex: number): void {
  if (rigs.has(root)) return;
  const idle = new THREE.Color(idleHex);
  const mats: THREE.ShaderMaterial[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !STRIP_PREFIX.test(obj.name)) return;
    const geo = obj.geometry as THREE.BufferGeometry;
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const tail = obj.name.endsWith("_T");
    const mat = tail
      ? stripMaterial(1, 0, Math.max(Math.abs(box.min.x), Math.abs(box.max.x)), idle)
      : stripMaterial(0, box.min.z, box.max.z, idle);
    obj.material = mat;
    obj.castShadow = false;
    obj.receiveShadow = false;
    mats.push(mat);
  });
  if (!mats.length) return;
  rigs.set(root, {
    mats,
    idle,
    shown: 0,
    lastFuel: 0,
    lastSuper: 0,
    sweep: -1,
    flash: 0,
    boost: 0,
    kick: 0,
    color: CYAN.clone(),
    wasBoosting: false,
  });
}

export function hasBoostLights(root: THREE.Object3D): boolean {
  return rigs.has(root);
}

/** Returns true on the frame a pickup lands, so callers can fire matching FX. */
export function updateBoostLights(root: THREE.Object3D, s: BoostLightState): { pickup: boolean; ignite: boolean } {
  const rig = rigs.get(root);
  if (!rig) return { pickup: false, ignite: false };
  const fuel = s.boostFuel + s.pendingBoost;
  const sup = s.superRemaining + s.pendingSuper;
  const superMode = sup > 0.01;
  const target = superMode ? Math.min(1, sup / SUPER_DURATION) : Math.min(1, fuel / BOOST_CAP);

  let pickup = false;
  if (sup > rig.lastSuper + 0.05) {
    pickup = true;
    rig.color.copy(GOLD);
  } else if (fuel > rig.lastFuel + 0.05) {
    pickup = true;
    rig.color.copy(fuel - rig.lastFuel > 2.2 ? RED : CYAN);
  } else if (!superMode && rig.sweep < 0 && s.sputter <= 0 && fuel <= 0.01) {
    rig.color.copy(CYAN);
  }
  if (superMode && rig.sweep < 0) rig.color.lerp(GOLD, 0.2);
  if (pickup) rig.sweep = 0;
  rig.lastFuel = fuel;
  rig.lastSuper = sup;

  let sweepUniform = -1;
  if (rig.sweep >= 0) {
    rig.sweep += s.dt / SWEEP_TIME;
    sweepUniform = rig.sweep;
    // The gauge can't run ahead of the charge head.
    rig.shown = Math.min(target, Math.max(rig.shown, Math.min(target, rig.sweep)));
    if (rig.sweep >= 1) {
      rig.sweep = -1;
      rig.flash = 1;
    }
  } else {
    // Drain/settle smoothly; boosting drains in real time so it tracks the sim closely.
    const k = 1 - Math.exp(-(s.boosting ? 20 : 6) * s.dt);
    rig.shown += (target - rig.shown) * k;
  }

  const ignite = s.boosting && !rig.wasBoosting;
  if (ignite) rig.kick = 1;
  rig.wasBoosting = s.boosting;
  rig.kick = Math.max(0, rig.kick - s.dt * 4);
  rig.flash = Math.max(0, rig.flash - s.dt * 3.2);
  rig.boost += ((s.boosting ? 1 : 0) - rig.boost) * (1 - Math.exp(-12 * s.dt));
  const die = s.sputter > 0 ? 1 - s.sputter / JET_SPUTTER : 0;

  for (const m of rig.mats) {
    const u = m.uniforms;
    u.uFuel.value = die > 0 ? Math.max(rig.shown, 0.85) : rig.shown;
    u.uSweep.value = sweepUniform;
    u.uBoost.value = rig.boost;
    u.uKick.value = rig.kick;
    u.uDie.value = die;
    u.uFlash.value = rig.flash;
    u.uTime.value = s.time;
    (u.uColor.value as THREE.Color).copy(rig.color);
  }
  return { pickup, ignite };
}
