import * as THREE from "three";
import { WAVES } from "../sim/waterHeight";

const BLACK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK_TEX.needsUpdate = true;

export function createWaterMaterial(kind: "canal" | "ocean" = "canal"): THREE.ShaderMaterial {
  const canal = kind === "canal";
  return new THREE.ShaderMaterial({
    transparent: !canal,
    depthWrite: true,
    lights: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.lights,
      {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(-0.62, 0.28, 0.38).normalize() },
        uColorDeep: { value: new THREE.Color(canal ? 0x0a5870 : 0x044450) },
        uColorShallow: { value: new THREE.Color(canal ? 0x1eb4c6 : 0x16787c) },
        uColorFoam: { value: new THREE.Color(0xe4f4f6) },
        uSky: { value: new THREE.Color(0xd7c09a) },
        uEnv: { value: null as THREE.CubeTexture | null },
        uHasEnv: { value: 0 },
        uPlanar: { value: BLACK_TEX },
        uHasPlanar: { value: 0 },
        uReflectMatrix: { value: new THREE.Matrix4() },
        uEdgeFoam: { value: canal ? 1 : 0 },
      },
    ]),
    vertexShader: `
      #include <common>
      #include <shadowmap_pars_vertex>
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vFoam;
      varying float vCrest;
      varying vec2 vUv;

      float wave(vec2 xz, vec2 dir, float amp, float len, float speed) {
        float k = 6.28318530718 / len;
        return amp * sin(dot(xz, dir) * k + uTime * speed);
      }
      float dWave(vec2 xz, vec2 dir, float amp, float len, float speed) {
        float k = 6.28318530718 / len;
        return amp * k * cos(dot(xz, dir) * k + uTime * speed);
      }
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec2 xz = world.xz;
        float h = 0.0;
        h += wave(xz, vec2(${WAVES[0].dx.toFixed(4)}, ${WAVES[0].dz.toFixed(4)}), ${WAVES[0].amp.toFixed(4)}, ${WAVES[0].len.toFixed(2)}, ${WAVES[0].speed.toFixed(4)});
        h += wave(xz, vec2(${WAVES[1].dx.toFixed(4)}, ${WAVES[1].dz.toFixed(4)}), ${WAVES[1].amp.toFixed(4)}, ${WAVES[1].len.toFixed(2)}, ${WAVES[1].speed.toFixed(4)});
        h += wave(xz, vec2(${WAVES[2].dx.toFixed(4)}, ${WAVES[2].dz.toFixed(4)}), ${WAVES[2].amp.toFixed(4)}, ${WAVES[2].len.toFixed(2)}, ${WAVES[2].speed.toFixed(4)});
        float hx = 0.0;
        float hz = 0.0;
        hx += dWave(xz, vec2(${WAVES[0].dx.toFixed(4)}, ${WAVES[0].dz.toFixed(4)}), ${WAVES[0].amp.toFixed(4)}, ${WAVES[0].len.toFixed(2)}, ${WAVES[0].speed.toFixed(4)}) * ${WAVES[0].dx.toFixed(4)};
        hz += dWave(xz, vec2(${WAVES[0].dx.toFixed(4)}, ${WAVES[0].dz.toFixed(4)}), ${WAVES[0].amp.toFixed(4)}, ${WAVES[0].len.toFixed(2)}, ${WAVES[0].speed.toFixed(4)}) * ${WAVES[0].dz.toFixed(4)};
        hx += dWave(xz, vec2(${WAVES[1].dx.toFixed(4)}, ${WAVES[1].dz.toFixed(4)}), ${WAVES[1].amp.toFixed(4)}, ${WAVES[1].len.toFixed(2)}, ${WAVES[1].speed.toFixed(4)}) * ${WAVES[1].dx.toFixed(4)};
        hz += dWave(xz, vec2(${WAVES[1].dx.toFixed(4)}, ${WAVES[1].dz.toFixed(4)}), ${WAVES[1].amp.toFixed(4)}, ${WAVES[1].len.toFixed(2)}, ${WAVES[1].speed.toFixed(4)}) * ${WAVES[1].dz.toFixed(4)};
        hx += dWave(xz, vec2(${WAVES[2].dx.toFixed(4)}, ${WAVES[2].dz.toFixed(4)}), ${WAVES[2].amp.toFixed(4)}, ${WAVES[2].len.toFixed(2)}, ${WAVES[2].speed.toFixed(4)}) * ${WAVES[2].dx.toFixed(4)};
        hz += dWave(xz, vec2(${WAVES[2].dx.toFixed(4)}, ${WAVES[2].dz.toFixed(4)}), ${WAVES[2].amp.toFixed(4)}, ${WAVES[2].len.toFixed(2)}, ${WAVES[2].speed.toFixed(4)}) * ${WAVES[2].dz.toFixed(4)};
        world.y += h;
        vWorld = world.xyz;
        vNormalW = normalize(vec3(-hx, 1.0, -hz));
        vFoam = h;
        vCrest = max(0.0, h);
        vec3 transformedNormal = mat3(viewMatrix) * vNormalW;
        vec4 worldPosition = world;
        #include <shadowmap_vertex>
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      #include <common>
      #include <packing>
      #include <lights_pars_begin>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform vec3 uColorDeep;
      uniform vec3 uColorShallow;
      uniform vec3 uColorFoam;
      uniform vec3 uSky;
      uniform vec3 uCam;
      uniform vec3 uSunDir;
      uniform samplerCube uEnv;
      uniform float uHasEnv;
      uniform sampler2D uPlanar;
      uniform float uHasPlanar;
      uniform mat4 uReflectMatrix;
      uniform float uEdgeFoam;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vFoam;
      varying float vCrest;
      varying vec2 vUv;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 view = normalize(uCam - vWorld);
        float ndv = max(0.0, dot(n, view));
        float fresnel = pow(1.0 - ndv, 2.4);
        float depthMix = clamp(0.16 + vCrest * 0.4 + fresnel * 0.12, 0.0, 1.0);
        vec3 water = mix(uColorDeep, uColorShallow, depthMix);
        vec3 r = reflect(-view, n);
        float skyH = clamp(r.y * 0.7 + 0.3, 0.0, 1.0);
        vec3 env = mix(uColorDeep * 0.55, uSky, skyH);
        env = mix(env, vec3(1.0, 0.86, 0.58), pow(max(0.0, dot(normalize(r), uSunDir)), 16.0) * 0.45);
        if (uHasEnv > 0.5) {
          vec3 cube = textureCube(uEnv, normalize(r)).rgb;
          env = mix(env, cube, uHasPlanar > 0.5 ? 0.22 : 0.55);
        }
        if (uHasPlanar > 0.5) {
          vec4 pcoord = uReflectMatrix * vec4(vWorld, 1.0);
          if (pcoord.w > 0.02) {
            vec2 puv = pcoord.xy / pcoord.w;
            float pEdge = smoothstep(0.0, 0.07, puv.x) * smoothstep(1.0, 0.93, puv.x)
              * smoothstep(0.0, 0.07, puv.y) * smoothstep(1.0, 0.93, puv.y);
            vec3 planar = texture2D(uPlanar, puv).rgb;
            env = mix(env, planar, pEdge * clamp(0.42 + fresnel * 0.58, 0.0, 0.92));
          }
        }
        float envAmt = uHasPlanar > 0.5
          ? clamp(0.2 + fresnel * 0.7, 0.0, 0.86)
          : clamp(0.1 + fresnel * 0.48, 0.0, 0.58);
        water = mix(water, env, envAmt);
        float spec = pow(max(0.0, dot(reflect(-uSunDir, n), view)), 120.0);
        float specWide = pow(max(0.0, dot(reflect(-uSunDir, n), view)), 22.0);
        water += vec3(1.0, 0.97, 0.88) * spec * 1.35;
        water += vec3(1.0, 0.78, 0.48) * specWide * 0.14;
        float glitter = pow(max(0.0, dot(n, uSunDir)), 6.0) * fract(sin(dot(floor(vWorld.xz * 3.2), vec2(12.9898, 78.233))) * 43758.5453);
        water += vec3(0.85, 0.95, 1.0) * glitter * 0.18;
        float foam = smoothstep(0.12, 0.34, vCrest);
        float streak = 0.5 + 0.5 * sin(vWorld.x * 1.5 + vWorld.z * 0.8 - uTime * 2.8);
        float edge = 0.0;
        if (uEdgeFoam > 0.5) {
          float rim = min(vUv.x, 1.0 - vUv.x);
          edge = smoothstep(0.045, 0.0, rim);
          edge *= 0.65 + 0.35 * sin(vUv.y * 42.0 - uTime * 4.0);
        }
        water = mix(water, uColorFoam, clamp(foam * 0.22 * streak + edge * 0.55, 0.0, 0.62));
        float sss = pow(max(0.0, 1.0 - ndv), 1.4) * 0.16;
        water += vec3(0.05, 0.18, 0.24) * sss;
        float sh = getShadowMask();
        water *= mix(0.58, 1.0, sh);
        gl_FragColor = vec4(water, 1.0);
      }
    `,
  });
}

export function createOceanMaterial(): THREE.ShaderMaterial {
  return createWaterMaterial("ocean");
}
