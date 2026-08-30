import * as THREE from "three";

/** Inverted sphere that follows the camera so dusk sky stays inside the far plane. */
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
      varying vec3 vDir;
      void main() {
        vec3 n = normalize(vDir);
        vec3 sun = normalize(vec3(uSunDir.x, uSunDir.y * 0.58 - 0.1, uSunDir.z));
        float h = n.y;
        vec3 col = mix(uNadir, uHorizon, smoothstep(-0.2, 0.03, h));
        float band = exp(-pow((h - 0.015) / 0.11, 2.0));
        col += uHorizon * vec3(1.15, 0.55, 0.28) * band * 0.55;
        col = mix(col, uZenith, smoothstep(0.12, 0.84, h));
        float glow = pow(max(0.0, dot(n, sun)), 6.5);
        float disc = pow(max(0.0, dot(n, sun)), 640.0);
        col += vec3(1.0, 0.5, 0.18) * glow * 0.55;
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
