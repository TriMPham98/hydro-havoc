import * as THREE from "three";
import { WAVES } from "../sim/waterHeight";

export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(-0.35, 0.82, 0.25).normalize() },
      uColorDeep: { value: new THREE.Color(0x046478) },
      uColorShallow: { value: new THREE.Color(0x1aa8b8) },
      uColorFoam: { value: new THREE.Color(0xe8ffff) },
      uSky: { value: new THREE.Color(0x8ec8e8) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vFoam;
      varying float vCrest;

      float wave(vec2 xz, vec2 dir, float amp, float len, float speed) {
        float k = 6.28318530718 / len;
        float q = 0.62;
        return amp * sin(dot(xz, dir) * k + uTime * speed) * q;
      }
      float dWave(vec2 xz, vec2 dir, float amp, float len, float speed) {
        float k = 6.28318530718 / len;
        return amp * k * 0.62 * cos(dot(xz, dir) * k + uTime * speed);
      }
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec2 xz = world.xz;
        float h = 0.0;
        h += wave(xz, vec2(${WAVES[0].dx}, ${WAVES[0].dz}), ${WAVES[0].amp}, ${WAVES[0].len}, ${WAVES[0].speed});
        h += wave(xz, vec2(${WAVES[1].dx}, ${WAVES[1].dz}), ${WAVES[1].amp}, ${WAVES[1].len}, ${WAVES[1].speed});
        h += wave(xz, vec2(${WAVES[2].dx}, ${WAVES[2].dz}), ${WAVES[2].amp}, ${WAVES[2].len}, ${WAVES[2].speed});
        float hx = 0.0;
        float hz = 0.0;
        hx += dWave(xz, vec2(${WAVES[0].dx}, ${WAVES[0].dz}), ${WAVES[0].amp}, ${WAVES[0].len}, ${WAVES[0].speed}) * ${WAVES[0].dx};
        hz += dWave(xz, vec2(${WAVES[0].dx}, ${WAVES[0].dz}), ${WAVES[0].amp}, ${WAVES[0].len}, ${WAVES[0].speed}) * ${WAVES[0].dz};
        hx += dWave(xz, vec2(${WAVES[1].dx}, ${WAVES[1].dz}), ${WAVES[1].amp}, ${WAVES[1].len}, ${WAVES[1].speed}) * ${WAVES[1].dx};
        hz += dWave(xz, vec2(${WAVES[1].dx}, ${WAVES[1].dz}), ${WAVES[1].amp}, ${WAVES[1].len}, ${WAVES[1].speed}) * ${WAVES[1].dz};
        hx += dWave(xz, vec2(${WAVES[2].dx}, ${WAVES[2].dz}), ${WAVES[2].amp}, ${WAVES[2].len}, ${WAVES[2].speed}) * ${WAVES[2].dx};
        hz += dWave(xz, vec2(${WAVES[2].dx}, ${WAVES[2].dz}), ${WAVES[2].amp}, ${WAVES[2].len}, ${WAVES[2].speed}) * ${WAVES[2].dz};
        world.y += h;
        vWorld = world.xyz;
        vNormalW = normalize(vec3(-hx, 1.0, -hz));
        vFoam = h;
        vCrest = max(0.0, h);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorDeep;
      uniform vec3 uColorShallow;
      uniform vec3 uColorFoam;
      uniform vec3 uSky;
      uniform vec3 uCam;
      uniform vec3 uSunDir;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vFoam;
      varying float vCrest;
      uniform float uTime;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 view = normalize(uCam - vWorld);
        float ndv = max(0.0, dot(n, view));
        float fresnel = pow(1.0 - ndv, 2.6);
        float depthMix = clamp(0.28 + vWorld.y * 0.1, 0.0, 1.0);
        vec3 water = mix(uColorDeep, uColorShallow, depthMix);
        vec3 r = reflect(-view, n);
        float skyH = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 env = mix(vec3(0.06, 0.18, 0.22), uSky, skyH);
        env = mix(env, vec3(1.0, 0.86, 0.62), pow(max(0.0, dot(normalize(r), uSunDir)), 18.0));
        water = mix(water, env, fresnel * 0.88);
        float spec = pow(max(0.0, dot(reflect(-uSunDir, n), view)), 110.0);
        water += vec3(1.0, 0.97, 0.88) * spec * 1.45;
        float spark = fract(sin(dot(vWorld.xz, vec2(12.9898, 78.233))) * 43758.5453);
        water += vec3(0.7, 0.88, 0.95) * step(0.988, spark) * (0.35 + fresnel);
        float foam = smoothstep(0.06, 0.28, vCrest);
        float edge = smoothstep(0.03, 0.16, abs(n.x) + abs(n.z));
        float sheet = foam * foam;
        water = mix(water, uColorFoam, sheet * 0.82 + edge * 0.18 + foam * 0.22);
        float caust = 0.09 * sin(vWorld.x * 0.42 + vWorld.z * 0.31 + uTime * 0.4) * sin(vWorld.z * 0.37);
        water += vec3(0.03, 0.1, 0.12) + caust;
        gl_FragColor = vec4(water, 0.9 + fresnel * 0.08);
      }
    `,
  });
}

export function createOceanMaterial(): THREE.ShaderMaterial {
  const mat = createWaterMaterial();
  mat.uniforms.uColorDeep.value = new THREE.Color(0x033844);
  mat.transparent = false;
  mat.depthWrite = true;
  return mat;
}
