import * as THREE from "three";
import { WAVES } from "../sim/waterHeight";

const BLACK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK_TEX.needsUpdate = true;

const DETAIL_SIZE = 256;

function hash(ix: number, iy: number, p: number): number {
  const x = ((ix % p) + p) % p;
  const y = ((iy % p) + p) % p;
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(u: number, v: number, p: number): number {
  const ix = Math.floor(u);
  const iy = Math.floor(v);
  const fx = u - ix;
  const fy = v - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, p);
  const b = hash(ix + 1, iy, p);
  const c = hash(ix, iy + 1, p);
  const d = hash(ix + 1, iy + 1, p);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Tileable ripple field: RG = slope (normal xz), B = unused, A = height for foam breakup.
 * Built once on the CPU so the water shader does three texture taps instead of noise math.
 */
export function buildDetailHeight(size = DETAIL_SIZE): Float32Array {
  const h = new Float32Array(size * size);
  const octaves: [number, number][] = [
    [4, 0.5],
    [8, 0.28],
    [16, 0.14],
    [32, 0.08],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [freq, amp] of octaves) {
        // Ridged noise: sharp crests, broad troughs — reads like wind chop.
        const n = vnoise((x / size) * freq, (y / size) * freq, freq);
        v += (1 - Math.abs(n * 2 - 1)) * amp;
      }
      h[y * size + x] = v;
    }
  }
  return h;
}

let detailTex: THREE.DataTexture | null = null;

function detailTexture(): THREE.DataTexture {
  if (detailTex) return detailTex;
  const size = DETAIL_SIZE;
  const h = buildDetailHeight(size);
  const data = new Uint8Array(size * size * 4);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 6;
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, Math.round((-dx * 0.5 + 0.5) * 255)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round((-dy * 0.5 + 0.5) * 255)));
      data[i + 2] = 255;
      data[i + 3] = Math.round(((h[y * size + x] - lo) / (hi - lo || 1)) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  detailTex = tex;
  return tex;
}

export function createWaterMaterial(kind: "canal" | "ocean" = "canal"): THREE.ShaderMaterial {
  const canal = kind === "canal";
  const w = WAVES.map((v) => ({
    dir: `vec2(${v.dx.toFixed(4)}, ${v.dz.toFixed(4)})`,
    amp: v.amp.toFixed(4),
    len: v.len.toFixed(2),
    speed: v.speed.toFixed(4),
    dx: v.dx.toFixed(4),
    dz: v.dz.toFixed(4),
  }));
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
        uColorDeep: { value: new THREE.Color(canal ? 0x022a36 : 0x03303a) },
        uColorShallow: { value: new THREE.Color(canal ? 0x0d7a80 : 0x0b6068) },
        uColorFoam: { value: new THREE.Color(0xeef8fa) },
        uSky: { value: new THREE.Color(0xd7c09a) },
        uZenith: { value: new THREE.Color(0x3a6a9a) },
        uSunColor: { value: new THREE.Color(0xffd8a8) },
        uEnv: { value: null as THREE.CubeTexture | null },
        uHasEnv: { value: 0 },
        uPlanar: { value: BLACK_TEX },
        uHasPlanar: { value: 0 },
        uReflectMatrix: { value: new THREE.Matrix4() },
        uEdgeFoam: { value: canal ? 1 : 0 },
        uDetail: { value: detailTexture() as THREE.Texture },
        uFogColor: { value: new THREE.Color(0x8ab0c4) },
        uFogNear: { value: 120 },
        uFogFar: { value: 820 },
        uBoost: { value: 0 },
      },
    ]),
    vertexShader: `
      #include <common>
      #include <shadowmap_pars_vertex>
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
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
        float hx = 0.0;
        float hz = 0.0;
        ${w
          .map(
            (v) => `
        h += wave(xz, ${v.dir}, ${v.amp}, ${v.len}, ${v.speed});
        hx += dWave(xz, ${v.dir}, ${v.amp}, ${v.len}, ${v.speed}) * ${v.dx};
        hz += dWave(xz, ${v.dir}, ${v.amp}, ${v.len}, ${v.speed}) * ${v.dz};`,
          )
          .join("")}
        world.y += h;
        vWorld = world.xyz;
        vNormalW = normalize(vec3(-hx, 1.0, -hz));
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
      uniform vec3 uZenith;
      uniform vec3 uSunColor;
      uniform vec3 uCam;
      uniform vec3 uSunDir;
      uniform samplerCube uEnv;
      uniform float uHasEnv;
      uniform sampler2D uPlanar;
      uniform float uHasPlanar;
      uniform mat4 uReflectMatrix;
      uniform float uEdgeFoam;
      uniform float uTime;
      uniform sampler2D uDetail;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform float uBoost;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vCrest;
      varying vec2 vUv;

      vec3 skyColor(vec3 r) {
        float up = clamp(r.y, 0.0, 1.0);
        vec3 col = mix(uSky, uZenith, pow(up, 0.55));
        col = mix(uColorDeep * 0.6, col, smoothstep(-0.25, 0.02, r.y));
        float s = max(0.0, dot(r, uSunDir));
        col += uSunColor * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.8);
        return col;
      }

      void main() {
        float dist = length(uCam - vWorld);
        vec2 p = vWorld.xz;

        // Ripples: three scrolling taps of the tileable chop field, faded with distance
        // so the far canal doesn't shimmer.
        vec4 t1 = texture2D(uDetail, p * 0.031 + vec2(uTime * 0.021, uTime * 0.013));
        vec4 t2 = texture2D(uDetail, p * 0.077 + vec2(-uTime * 0.029, uTime * 0.024));
        vec4 t3 = texture2D(uDetail, p * 0.19 + vec2(uTime * 0.047, -uTime * 0.039));
        vec2 slope = (t1.xy - 0.5) * 0.9 + (t2.xy - 0.5) * 0.6 + (t3.xy - 0.5) * 0.35;
        float near = 1.0 - smoothstep(40.0, 360.0, dist);
        vec3 n = normalize(vNormalW + vec3(slope.x, 0.0, slope.y) * (0.35 + 0.65 * near));

        vec3 view = normalize(uCam - vWorld);
        float ndv = max(0.0, dot(n, view));
        float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 4.0);

        // Body: deep teal, lifting to turquoise where the lens looks steeply down or crests catch light.
        float scatter = pow(max(0.0, dot(view, -uSunDir) * 0.5 + 0.5), 3.0);
        vec3 body = mix(uColorDeep, uColorShallow, clamp(ndv * 0.55 + vCrest * 0.55, 0.0, 1.0));
        body += uColorShallow * scatter * clamp(vCrest * 1.6 + t2.a * 0.25, 0.0, 1.0) * 0.55;

        // Reflection: analytic sky, then cube probe, then distorted planar.
        vec3 r = reflect(-view, n);
        vec3 env = skyColor(r);
        if (uHasEnv > 0.5) {
          vec3 cube = textureCube(uEnv, r).rgb;
          env = mix(env, cube, uHasPlanar > 0.5 ? 0.2 : 0.55);
        }
        if (uHasPlanar > 0.5) {
          vec4 pc = uReflectMatrix * vec4(vWorld, 1.0);
          if (pc.w > 0.02) {
            vec2 puv = pc.xy / pc.w + slope * 0.055 * (0.4 + 0.6 * near);
            float edge = smoothstep(0.0, 0.06, puv.x) * smoothstep(1.0, 0.94, puv.x)
              * smoothstep(0.0, 0.06, puv.y) * smoothstep(1.0, 0.94, puv.y);
            vec3 planar = texture2D(uPlanar, puv).rgb;
            env = mix(env, planar, edge * 0.85);
          }
        }
        vec3 water = mix(body, env, clamp(fresnel * 1.1, 0.0, 0.92));

        // Sun: tight hot core + broad sheen + sparkle on ripple crests.
        vec3 hv = normalize(uSunDir + view);
        float ndh = max(0.0, dot(n, hv));
        float sh = getShadowMask();
        float lit = mix(0.25, 1.0, sh);
        water += uSunColor * (pow(ndh, 420.0) * 6.0 + pow(ndh, 60.0) * 0.45) * lit;
        float sparkle = pow(max(0.0, t3.a * t1.a * 2.2 - 0.6), 6.0) * pow(ndh, 18.0);
        water += vec3(1.0, 0.95, 0.85) * sparkle * 22.0 * near * lit;

        // Foam: crests + canal walls, broken up by the chop field and streaming along the flume.
        float breakup = t1.a * 0.6 + t2.a * 0.4;
        float crest = smoothstep(0.55, 0.95, vCrest * 1.4 + breakup * 0.55) * 0.35;
        float edge = 0.0;
        if (uEdgeFoam > 0.5) {
          float rim = min(vUv.x, 1.0 - vUv.x);
          float stream = texture2D(uDetail, vec2(vUv.x * 3.0, vUv.y * 40.0 - uTime * 0.35)).a;
          edge = smoothstep(0.075, 0.0, rim - stream * 0.05) * (0.55 + 0.45 * stream);
          float lace = smoothstep(0.16, 0.04, rim) * smoothstep(0.55, 0.85, breakup) * 0.6;
          edge = max(edge, lace);
        }
        float foam = clamp(crest + edge, 0.0, 1.0);
        water = mix(water, uColorFoam * (0.55 + 0.45 * lit), foam * 0.85);

        water *= mix(0.62, 1.0, sh);
        water += vec3(0.1, 0.6, 0.7) * uBoost * 0.04 * near;

        float fogK = smoothstep(uFogNear, uFogFar, dist);
        water = mix(water, uFogColor, fogK);
        gl_FragColor = vec4(water, 1.0);
      }
    `,
  });
}

export function createOceanMaterial(): THREE.ShaderMaterial {
  return createWaterMaterial("ocean");
}
