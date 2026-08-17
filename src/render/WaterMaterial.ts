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
      uColorDeep: { value: new THREE.Color(0x025a6a) },
      uColorShallow: { value: new THREE.Color(0x2ad4c8) },
      uColorFoam: { value: new THREE.Color(0xf4fffe) },
      uSky: { value: new THREE.Color(0xa8d8f0) },
      uEnv: { value: null as THREE.CubeTexture | null },
      uHasEnv: { value: 0 },
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
      uniform samplerCube uEnv;
      uniform float uHasEnv;
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
        float depthMix = clamp(0.22 + vWorld.y * 0.14 + fresnel * 0.18, 0.0, 1.0);
        vec3 water = mix(uColorDeep, uColorShallow, depthMix);
        vec3 r = reflect(-view, n);
        float skyH = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 env = mix(vec3(0.04, 0.12, 0.16), uSky, skyH);
        env = mix(env, vec3(1.0, 0.88, 0.62), pow(max(0.0, dot(normalize(r), uSunDir)), 18.0));
        float bank = abs(sin(vWorld.x * 0.045 + vWorld.z * 0.03));
        vec3 bankCol = mix(vec3(0.22, 0.12, 0.07), vec3(1.0, 0.55, 0.18), step(0.82, fract(vWorld.x * 0.08 + vWorld.z * 0.05)));
        bankCol = mix(bankCol, vec3(0.12, 0.72, 0.85), step(0.93, fract(vWorld.z * 0.07)));
        env = mix(env, bankCol, (1.0 - skyH) * 0.55 * bank);
        if (uHasEnv > 0.5) {
          vec3 cube = textureCube(uEnv, normalize(r)).rgb;
          env = mix(env, cube, 0.72);
        }
        water = mix(water, env, fresnel * 0.96);
        float spec = pow(max(0.0, dot(reflect(-uSunDir, n), view)), 160.0);
        float specWide = pow(max(0.0, dot(reflect(-uSunDir, n), view)), 28.0);
        water += vec3(1.0, 0.97, 0.9) * spec * 2.4;
        water += vec3(1.0, 0.86, 0.62) * specWide * 0.18;
        float glitter = pow(max(0.0, dot(n, uSunDir)), 8.0) * fract(sin(dot(floor(vWorld.xz * 2.4), vec2(12.9898, 78.233))) * 43758.5453);
        water += vec3(0.95, 0.98, 1.0) * glitter * 0.42;
        float foam = smoothstep(0.06, 0.28, vCrest);
        float streak = 0.5 + 0.5 * sin(vWorld.x * 1.7 + vWorld.z * 0.9 - uTime * 3.2);
        float churn = smoothstep(0.16, 0.4, vCrest) * (0.45 + 0.55 * sin(vWorld.x * 4.1 - uTime * 6.0));
        float edge = smoothstep(0.04, 0.22, abs(n.x) + abs(n.z));
        water = mix(water, uColorFoam, clamp(foam * 0.5 * streak + churn * 0.28 + edge * 0.16, 0.0, 0.78));
        float sss = pow(max(0.0, 1.0 - ndv), 1.4) * 0.12;
        water += vec3(0.05, 0.22, 0.2) * sss;
        float caust = 0.13 * sin(vWorld.x * 0.48 + vWorld.z * 0.33 + uTime * 0.55) * sin(vWorld.z * 0.41 - uTime * 0.22);
        water += vec3(0.02, 0.11, 0.13) + caust;
        gl_FragColor = vec4(water, 0.9 + fresnel * 0.09);
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
