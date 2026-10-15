import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

/** Horror grading: barrel distortion, chromatic aberration, grain, vignette, cold-dark LUT-ish grade. */
const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uDread: { value: 0 },
    uGrain: { value: 0.07 },
    uVignette: { value: 1.15 },
    uAberration: { value: 0.0025 },
    uDistort: { value: 0.06 },
    uFlash: { value: 0 },
    uBlur: { value: 0 },
    uFade: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDread;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uAberration;
    uniform float uDistort;
    uniform float uFlash;
    uniform float uBlur;
    uniform float uFade;
    uniform vec2 uResolution;
    varying vec2 vUv;

    vec3 sampleBlur(vec2 uv, float amt) {
      if (amt <= 0.001) return texture2D(tDiffuse, uv).rgb;
      vec3 acc = texture2D(tDiffuse, uv).rgb * 2.0;
      float r = amt * 0.02;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        vec2 o = vec2(cos(a), sin(a)) * r;
        acc += texture2D(tDiffuse, uv + o).rgb;
        acc += texture2D(tDiffuse, uv + o * 0.5).rgb * 0.5;
      }
      return acc / 14.0;
    }

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 443.8975);
      p3 += dot(p3, p3.yzx + 19.19);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec2 barrel(vec2 uv, float k) {
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      return 0.5 + c * (1.0 + k * r2);
    }

    void main() {
      vec2 uv = barrel(vUv, uDistort);
      // dread wobble
      uv += vec2(sin(uTime * 13.0 + vUv.y * 40.0), cos(uTime * 11.0 + vUv.x * 30.0)) * 0.0012 * uDread * uDread;

      vec2 d = (uv - 0.5);
      float r = length(d);
      float ab = uAberration * (1.0 + uDread * 4.0) * (0.4 + r * 1.6);
      vec3 col;
      if (uBlur > 0.001) {
        col = sampleBlur(uv, uBlur);
        // double vision while coming round
        col = mix(col, sampleBlur(uv + vec2(0.012, 0.004) * uBlur, uBlur), 0.4 * uBlur);
      } else {
        col.r = texture2D(tDiffuse, uv + d * ab).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - d * ab).b;
      }

      // grade: crush blacks, cool shadows, warm highlights
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = vec3(0.78, 0.86, 1.08);
      vec3 highTint = vec3(1.08, 1.0, 0.9);
      col *= mix(shadowTint, highTint, smoothstep(0.0, 0.7, lum));
      col = pow(max(col, 0.0), vec3(1.08));
      col = (col - 0.02) * 1.06;
      // desaturate slightly, more when dread rises
      float sat = 0.82 - uDread * 0.25;
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, sat);
      // red bleed at the edges when hunted
      col += vec3(0.35, 0.02, 0.0) * uDread * smoothstep(0.25, 0.8, r);

      // film grain (animated)
      float g = hash(vUv * uResolution * 0.5 + fract(uTime * 7.0) * 100.0) - 0.5;
      col += g * uGrain * (1.0 + uDread * 1.6) * (1.0 - lum * 0.5);

      // vignette
      float v = smoothstep(0.95, 0.25, r * uVignette * (1.0 + uDread * 0.35));
      col *= mix(0.08, 1.0, v);

      // scanline hint
      col *= 1.0 - 0.035 * sin(vUv.y * uResolution.y * 1.5);

      // white flash (jumpscare)
      col = mix(col, vec3(1.0, 0.92, 0.9), uFlash);

      // outside-barrel black
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);

      // eyelids: fade darkens from top and bottom like closing eyes
      float lid = smoothstep(0.0, 0.5, uFade) * (1.0 - smoothstep(0.0, 0.5 * (1.0 - uFade * 0.6), abs(vUv.y - 0.5)));
      col *= 1.0 - uFade;
      col = mix(col, vec3(0.0), lid * uFade);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class PostFX {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  horror: ShaderPass;
  smaa: SMAAPass;
  private rt: THREE.WebGLRenderTarget;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(renderer, this.rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.65, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.horror = new ShaderPass(HorrorShader);
    this.horror.uniforms.uResolution.value.set(w, h);
    this.composer.addPass(this.horror);
    // AA runs last, preserving the horror grading while smoothing geometry edges.
    this.smaa = new SMAAPass();
    this.smaa.setSize(w, h);
    this.composer.addPass(this.smaa);
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.smaa.setSize(w, h);
    this.horror.uniforms.uResolution.value.set(w, h);
  }

  update(time: number, dread: number, flash: number, blur = 0, fade = 0) {
    this.horror.uniforms.uTime.value = time;
    this.horror.uniforms.uDread.value = dread;
    this.horror.uniforms.uFlash.value = flash;
    this.horror.uniforms.uBlur.value = blur;
    this.horror.uniforms.uFade.value = fade;
    this.bloom.strength = 0.5 + dread * 0.35 + blur * 0.6;
  }

  render() {
    this.composer.render();
  }
}
