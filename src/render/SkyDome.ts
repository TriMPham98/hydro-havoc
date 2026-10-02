import * as THREE from "three";

/**
 * Inverted sphere that follows the camera so dusk sky stays inside the far plane.
 * Two FBM cloud decks drift across it, rim-lit toward the sun.
 */
export function createSkyDome(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(-0.62, 0.28, 0.38).normalize() },
      uZenith: { value: new THREE.Color(0x3a6a9a) },
      uHorizon: { value: new THREE.Color(0xf0a060) },
      uNadir: { value: new THREE.Color(0x1a2430) },
      uTime: { value: 0 },
      uCloud: { value: 1 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uHorizon;
      uniform vec3 uZenith;
      uniform vec3 uNadir;
      uniform float uTime;
      uniform float uCloud;
      varying vec3 vDir;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = rot * p * 2.03 + 3.1;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 n = normalize(vDir);
        vec3 sun = normalize(vec3(uSunDir.x, uSunDir.y * 0.58 - 0.1, uSunDir.z));
        float h = n.y;
        vec3 col = mix(uNadir, uHorizon, smoothstep(-0.2, 0.03, h));
        float band = exp(-pow((h - 0.015) / 0.11, 2.0));
        col += uHorizon * vec3(1.15, 0.55, 0.28) * band * 0.55;
        col = mix(col, uZenith, smoothstep(0.12, 0.84, h));
        float sd = max(0.0, dot(n, sun));
        float glow = pow(sd, 6.5);
        float disc = pow(sd, 640.0);
        col += vec3(1.0, 0.5, 0.18) * glow * 0.55;
        col += vec3(1.0, 0.45, 0.2) * pow(sd, 2.0) * 0.12;

        // Clouds: project onto a flat deck so they stretch toward the horizon.
        if (h > -0.02 && uCloud > 0.0) {
          vec2 uv = n.xz / (h + 0.12);
          float wind = uTime * 0.012;
          float base = fbm(uv * 1.1 + vec2(wind, wind * 0.4));
          float detail = noise(uv * 3.4 - vec2(wind * 2.0, 0.0)) * 0.6 + noise(uv * 7.1 + 3.0) * 0.3;
          float c = smoothstep(0.42, 0.8, base * 0.78 + detail * 0.36);
          float wisps = smoothstep(0.55, 0.9, fbm(uv * vec2(0.6, 2.4) + vec2(wind * 0.6, 7.0))) * 0.5;
          float cover = max(c, wisps) * smoothstep(-0.02, 0.12, h) * uCloud;
          // Lit edges facing the sun, bruised bellies away from it.
          float toward = pow(sd, 2.5);
          vec3 belly = mix(uZenith * 0.42, uHorizon * 0.38, 0.35 + 0.4 * smoothstep(0.3, 0.0, h));
          vec3 lit = mix(uHorizon * vec3(1.15, 0.72, 0.52), vec3(1.25, 0.78, 0.45), toward);
          float thick = smoothstep(0.15, 0.95, cover);
          vec3 cloud = mix(lit, belly, thick * (1.0 - toward * 0.6));
          cloud += vec3(1.0, 0.55, 0.25) * toward * (1.0 - thick) * 1.2;
          col = mix(col, cloud, clamp(cover * 1.3, 0.0, 0.92));
        }

        col *= 0.8;
        col += vec3(1.0, 0.9, 0.7) * disc * 2.6;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1600, 40, 24), material);
  mesh.frustumCulled = false;
  mesh.name = "skyDome";
  mesh.renderOrder = -10;
  return { mesh, material };
}
