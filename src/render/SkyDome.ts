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
      uHorizon: { value: new THREE.Color(0xe8b888) },
      uNadir: { value: new THREE.Color(0x173040) },
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
        vec3 sun = normalize(uSunDir);
        float h = n.y;
        vec3 col = mix(uNadir, uHorizon, smoothstep(-0.28, 0.04, h));
        col = mix(col, uZenith, smoothstep(0.02, 0.78, h));
        float glow = pow(max(0.0, dot(n, sun)), 8.0);
        float disc = pow(max(0.0, dot(n, sun)), 900.0);
        col += vec3(1.0, 0.62, 0.28) * glow * 0.42;
        col += vec3(1.0, 0.95, 0.82) * disc * 2.8;
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
