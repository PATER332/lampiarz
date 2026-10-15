import * as THREE from "three";
import { dustSprite } from "./textures";

/** Floating dust that becomes visible in the flashlight beam. */
export class Dust {
  points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  private count = 900;
  private radius = 7;
  private pos: Float32Array;
  private vel: Float32Array;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.count * 3);
    this.vel = new Float32Array(this.count * 3);
    const size = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.radius * 2;
      this.pos[i * 3 + 1] = Math.random() * 3.2;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.radius * 2;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.08;
      this.vel[i * 3 + 1] = -0.02 - Math.random() * 0.05;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.08;
      size[i] = 0.02 + Math.random() * 0.045;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: dustSprite() },
        uFlashPos: { value: new THREE.Vector3() },
        uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
        uFlashOn: { value: 0 },
        uCos: { value: Math.cos(Math.PI / 6.5) },
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.8) },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        uniform vec3 uFlashPos;
        uniform vec3 uFlashDir;
        uniform float uFlashOn;
        uniform float uCos;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec3 toP = wp.xyz - uFlashPos;
          float dist = length(toP);
          float c = dot(normalize(toP), uFlashDir);
          float cone = smoothstep(uCos - 0.03, uCos + 0.08, c);
          float fall = 1.0 / (1.0 + dist * dist * 0.08);
          float lit = cone * fall * uFlashOn;
          vAlpha = 0.02 + lit * 0.9;
          vec4 mv = viewMatrix * wp;
          float tw = 0.75 + 0.25 * sin(uTime * 3.0 + position.x * 10.0 + position.y * 7.0);
          gl_PointSize = aSize * tw * uPixelRatio * (320.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85), t.a * vAlpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt: number, time: number, center: THREE.Vector3, flashPos: THREE.Vector3, flashDir: THREE.Vector3, flashOn: boolean) {
    const p = this.pos;
    const v = this.vel;
    const R = this.radius;
    // keep the cloud anchored around the camera (world-space particles, re-wrapped)
    this.points.position.set(0, 0, 0);
    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      p[i3] += (v[i3] + Math.sin(time * 0.7 + i) * 0.015) * dt;
      p[i3 + 1] += v[i3 + 1] * dt;
      p[i3 + 2] += (v[i3 + 2] + Math.cos(time * 0.6 + i * 0.5) * 0.015) * dt;
      // wrap around the camera
      if (p[i3] < center.x - R) p[i3] += R * 2;
      else if (p[i3] > center.x + R) p[i3] -= R * 2;
      if (p[i3 + 2] < center.z - R) p[i3 + 2] += R * 2;
      else if (p[i3 + 2] > center.z + R) p[i3 + 2] -= R * 2;
      if (p[i3 + 1] < 0.05) p[i3 + 1] = 3.1;
      else if (p[i3 + 1] > 3.2) p[i3 + 1] = 0.1;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uFlashPos.value.copy(flashPos);
    this.mat.uniforms.uFlashDir.value.copy(flashDir);
    this.mat.uniforms.uFlashOn.value = flashOn ? 1 : 0;
  }

  /** Initially scatter particles around a point. */
  seed(center: THREE.Vector3) {
    for (let i = 0; i < this.count; i++) {
      this.pos[i * 3] = center.x + (Math.random() - 0.5) * this.radius * 2;
      this.pos[i * 3 + 2] = center.z + (Math.random() - 0.5) * this.radius * 2;
    }
  }
}
