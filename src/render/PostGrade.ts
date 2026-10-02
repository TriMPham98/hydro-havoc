import * as THREE from "three";

/**
 * Display-referred finishing pass (runs after OutputPass): boost zoom-blur, lens
 * aberration, speed lines, teal/amber split-tone, vignette and film grain.
 */
export const PostGradeShader = {
  name: "PostGrade",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uBoost: { value: 0 },
    uSuper: { value: 0 },
    uPunch: { value: 0 },
    uBeat: { value: 0 },
    uAspect: { value: 16 / 9 },
    uTint: { value: new THREE.Color(0x7af0ff) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uBoost;
    uniform float uSuper;
    uniform float uPunch;
    uniform float uBeat;
    uniform float uAspect;
    uniform vec3 uTint;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 c = vUv - 0.5;
      vec2 ca = vec2(c.x * uAspect, c.y);
      float r = length(ca);

      // Zoom blur toward the vanishing point while boosting; centre stays sharp.
      float blur = (uBoost * 0.05 + uSuper * 0.03 + uPunch * 0.025) * smoothstep(0.12, 0.7, r);
      float aber = 0.0012 + uBoost * 0.0035 + uSuper * 0.003 + uPunch * 0.009;
      vec3 col = vec3(0.0);
      vec2 off = c * aber * r * 2.0;
      if (blur < 0.0004) {
        // Cruising: three taps, no zoom blur.
        col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      } else {
        const int TAPS = 8;
        float jitter = hash(vUv * 917.0 + uTime) / float(TAPS);
        for (int i = 0; i < TAPS; i++) {
          float k = (float(i) / float(TAPS) + jitter) * blur;
          vec2 uv = vUv - c * k;
          col.r += texture2D(tDiffuse, uv + off).r;
          col.g += texture2D(tDiffuse, uv).g;
          col.b += texture2D(tDiffuse, uv - off).b;
        }
        col /= float(TAPS);
      }

      // Speed lines: thin radial streaks racing outward from the centre.
      if (uBoost > 0.01) {
        float ang = atan(ca.y, ca.x);
        float lane = floor(ang * 38.0);
        float seed = hash(vec2(lane, 3.7));
        float run = fract(r * 1.4 - uTime * (2.4 + seed * 2.0) + seed * 7.0);
        float streak = step(0.86, seed) * smoothstep(0.0, 0.08, run) * smoothstep(0.35, 0.05, run);
        float thin = 1.0 - smoothstep(0.0, 0.5, abs(fract(ang * 38.0) - 0.5) * 2.0 - 0.5);
        float lines = streak * thin * smoothstep(0.28, 0.75, r) * uBoost;
        col += mix(vec3(1.0), uTint, 0.5) * lines * 0.32;
      }

      // Grade: lift teal into the shadows, warm the highlights, gentle S-curve and saturation.
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col += vec3(-0.012, 0.006, 0.02) * (1.0 - smoothstep(0.0, 0.4, l));
      col *= mix(vec3(1.0), vec3(1.06, 1.01, 0.93), smoothstep(0.45, 1.0, l));
      col = mix(vec3(l), col, 1.14 + uBoost * 0.08);
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);

      // Hit flash + boost rim glow.
      col += uTint * uPunch * 0.06 * smoothstep(0.3, 0.9, r);
      col += uTint * (uBoost * 0.04 + uSuper * 0.03) * smoothstep(0.55, 1.0, r);

      float vig = smoothstep(0.42, 1.05, r);
      col *= 1.0 - vig * (0.42 + uBoost * 0.12 - uBeat * 0.05);

      col += (hash(vUv * vec2(1920.0, 1080.0) + fract(uTime * 13.7)) - 0.5) * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
