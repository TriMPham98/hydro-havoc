import * as THREE from "three";

/**
 * Flames out of the chrome zoomie stacks (StackTip_* empties from the Blender kit).
 * Boost: roaring blue-white jets. Super: gold. Lift-off at speed / dry tank: orange barks.
 */

const BOOST = new THREE.Color(0x6fd8ff);
const SUPER = new THREE.Color(0xffc23a);
const BARK = new THREE.Color(0xff6a1a);

export interface StackState {
  boosting: boolean;
  superOn: boolean;
  throttle: number;
  speed: number;
  sputter: number;
  dt: number;
  time: number;
}

interface Rig {
  flames: THREE.Mesh[];
  mat: THREE.ShaderMaterial;
  power: number;
  bark: number;
  lastThrottle: number;
  nextCough: number;
}

const rigs = new WeakMap<THREE.Object3D, Rig>();

let flameGeo: THREE.BufferGeometry | null = null;

function geometry(): THREE.BufferGeometry {
  if (flameGeo) return flameGeo;
  // Open cone, wide at the bore (y = 0) and pointed at y = 1, so scale.y is flame length.
  const g = new THREE.ConeGeometry(1, 1, 10, 4, true);
  g.rotateX(Math.PI);
  g.translate(0, 0.5, 0);
  flameGeo = g;
  return g;
}

function flameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uPower: { value: 0 },
      uColor: { value: BOOST.clone() },
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vAlong = position.y;
        vec3 p = position;
        // Turbulent wobble that grows toward the tip.
        float w = sin(uTime * 47.0 + p.y * 9.0) * 0.12 + sin(uTime * 31.0 + p.y * 17.0) * 0.08;
        p.xz *= 1.0 + w * p.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uPower;
      uniform vec3 uColor;
      uniform float uTime;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float rim = abs(dot(normalize(vN), normalize(vView)));
        float body = pow(rim, 1.4);
        float fade = pow(1.0 - vAlong, 1.6);
        float flick = 0.75 + 0.25 * sin(uTime * 61.0 + vAlong * 23.0);
        float a = body * fade * uPower * flick;
        if (a < 0.01) discard;
        vec3 col = mix(uColor, vec3(1.0), smoothstep(0.55, 0.0, vAlong) * body);
        gl_FragColor = vec4(col * a * 2.4, a);
      }
    `,
  });
}

export function bindStackFlames(root: THREE.Object3D): void {
  if (rigs.has(root)) return;
  const tips: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith("StackTip_")) tips.push(o);
  });
  if (!tips.length) return;
  const mat = flameMaterial();
  const flames = tips.map((tip) => {
    const m = new THREE.Mesh(geometry(), mat);
    m.name = "stackFlame";
    m.frustumCulled = false;
    m.renderOrder = 7;
    m.visible = false;
    tip.add(m);
    return m;
  });
  rigs.set(root, { flames, mat, power: 0, bark: 0, lastThrottle: 0, nextCough: 0 });
}

export function updateStackFlames(root: THREE.Object3D, s: StackState): void {
  const rig = rigs.get(root);
  if (!rig) return;
  rig.power += ((s.boosting ? 1 : 0) - rig.power) * (1 - Math.exp(-(s.boosting ? 18 : 8) * s.dt));
  if (rig.lastThrottle > 0.6 && s.throttle < 0.2 && s.speed > 18) rig.bark = 1;
  if (s.sputter > 0 && s.time > rig.nextCough) {
    rig.bark = 0.8;
    rig.nextCough = s.time + 0.1 + Math.random() * 0.12;
  }
  rig.lastThrottle = s.throttle;
  rig.bark = Math.max(0, rig.bark - s.dt * 5);
  // Lift-off barks stutter rather than holding a steady flame.
  const bark = rig.bark * (Math.sin(s.time * 70) > -0.2 ? 1 : 0.15);
  const p = Math.max(rig.power, bark);
  const u = rig.mat.uniforms;
  u.uPower.value = Math.min(1.2, p * 1.1);
  u.uTime.value = s.time;
  (u.uColor.value as THREE.Color).copy(rig.power > bark ? (s.superOn ? SUPER : BOOST) : BARK);
  const len = 0.15 + rig.power * (s.superOn ? 1.25 : 0.9) + bark * 0.45;
  const fat = 0.032 + p * 0.03;
  for (const f of rig.flames) {
    f.visible = p > 0.02;
    f.scale.set(fat, len * (0.9 + Math.random() * 0.2), fat);
  }
}
