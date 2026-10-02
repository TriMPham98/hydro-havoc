/** Shared GLSL: cheap value noise + 2-octave FBM for foam lace and spray breakup. */
export const NOISE_GLSL = `
  float hhHash(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }
  float hhNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hhHash(i), hhHash(i + vec2(1.0, 0.0)), u.x),
               mix(hhHash(i + vec2(0.0, 1.0)), hhHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float hhFbm(vec2 p) {
    return hhNoise(p) * 0.62 + hhNoise(p * 2.3 + 7.1) * 0.38;
  }
`;
