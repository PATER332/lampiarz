// GLSL ES 3.00 shaders: lit surfaces, shadow depth, dust particles, bloom and the final grade.

export const MAX_LIGHTS = 12;

export const LIT_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec2 a_uv;
layout(location=3) in vec3 a_tan;
uniform mat4 u_vp;
uniform mat4 u_model;
uniform mat4 u_shadowVP;
uniform mat4 u_shadow2VP;
uniform vec2 u_uvScale;
out vec3 v_wpos;
out vec3 v_nrm;
out vec3 v_tan;
out vec2 v_uv;
out vec4 v_shadow;
out vec4 v_shadow2;
void main() {
  vec4 w = u_model * vec4(a_pos, 1.0);
  v_wpos = w.xyz;
  mat3 m = mat3(u_model);
  v_nrm = m * a_nrm;
  v_tan = m * a_tan;
  v_uv = a_uv * u_uvScale;
  v_shadow = u_shadowVP * w;
  v_shadow2 = u_shadow2VP * w;
  gl_Position = u_vp * w;
}`;

export const LIT_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
#define MAXL ${MAX_LIGHTS}
uniform sampler2D u_albedo;
uniform sampler2D u_normal;
uniform sampler2DShadow u_shadowMap;
uniform sampler2DShadow u_shadowMap2;
uniform int u_sh2Light;
uniform vec3 u_tint;
uniform float u_rough;
uniform float u_spec;
uniform float u_emissive;
uniform vec3 u_emisColor;
uniform float u_alpha;
uniform vec3 u_camPos;
uniform int u_nLights;
uniform vec4 u_lightPos[MAXL];
uniform vec3 u_lightCol[MAXL];
uniform vec3 u_spotPos;
uniform vec3 u_spotDir;
uniform vec3 u_spotCol;
uniform vec2 u_spotCone;
uniform float u_spotRange;
uniform float u_shadowOn;
uniform vec3 u_ambient;
uniform vec3 u_fogCol;
uniform float u_fogDensity;
uniform float u_time;
in vec3 v_wpos;
in vec3 v_nrm;
in vec3 v_tan;
in vec2 v_uv;
in vec4 v_shadow;
in vec4 v_shadow2;
out vec4 o;

float shadowPCF(vec4 sc) {
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (sc.w <= 0.0 || p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0012;
  vec2 texel = 1.0 / vec2(textureSize(u_shadowMap, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      s += texture(u_shadowMap, vec3(p.xy + vec2(x, y) * texel * 1.5, p.z - bias));
  return s / 9.0;
}
float shadow2(vec4 sc) {
  vec3 p = sc.xyz / sc.w * 0.5 + 0.5;
  if (sc.w <= 0.0 || p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  vec2 texel = 1.0 / vec2(textureSize(u_shadowMap2, 0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
      s += texture(u_shadowMap2, vec3(p.xy + vec2(x, y) * texel * 1.2, p.z - 0.0015));
  return s / 9.0;
}

void main() {
  vec4 tex = texture(u_albedo, v_uv);
  if (tex.a * u_alpha < 0.02) discard;
  vec3 base = pow(tex.rgb, vec3(2.2)) * u_tint;
  vec3 N = normalize(v_nrm);
  vec3 T = normalize(v_tan - N * dot(N, v_tan));
  vec3 B = cross(N, T);
  vec3 nm = texture(u_normal, v_uv).xyz * 2.0 - 1.0;
  N = normalize(T * nm.x + B * nm.y + N * nm.z);
  vec3 V = normalize(u_camPos - v_wpos);
  float shin = mix(90.0, 6.0, u_rough);
  vec3 col = base * u_ambient * (0.6 + 0.4 * max(N.y, 0.0));
  for (int i = 0; i < MAXL; i++) {
    if (i >= u_nLights) break;
    vec3 Ld = u_lightPos[i].xyz - v_wpos;
    float d = length(Ld);
    float r = u_lightPos[i].w;
    if (d > r) continue;
    Ld /= d;
    float att = 1.0 - d / r;
    att *= att;
    float diff = max(dot(N, Ld), 0.0);
    float spec = pow(max(dot(N, normalize(Ld + V)), 0.0), shin) * u_spec;
    float sh = i == u_sh2Light ? shadow2(v_shadow2) : 1.0;
    col += (base * diff + spec) * u_lightCol[i] * att * sh;
  }
  // flashlight
  if (u_spotRange > 0.0) {
    vec3 Ld = u_spotPos - v_wpos;
    float d = length(Ld);
    if (d < u_spotRange) {
      Ld /= d;
      float c = dot(-Ld, u_spotDir);
      float cone = smoothstep(u_spotCone.y, u_spotCone.x, c);
      if (cone > 0.0) {
        float att = 1.0 - d / u_spotRange;
        att = att * att / (1.0 + d * 0.15);
        // lens imperfections: a soft hot centre and a faint ring
        float ring = 0.95 + 0.05 * smoothstep(0.0, 1.0, abs(sin(acos(clamp(c, -1.0, 1.0)) * 26.0)));
        float hot = 1.0 + 0.6 * smoothstep(u_spotCone.x, 1.0, c);
        float sh = u_shadowOn > 0.5 ? shadowPCF(v_shadow) : 1.0;
        float diff = max(dot(N, Ld), 0.0);
        float spec = pow(max(dot(N, normalize(Ld + V)), 0.0), shin) * u_spec;
        col += (base * diff + spec) * u_spotCol * att * cone * ring * hot * sh;
      }
    }
  }
  col += u_emissive * u_emisColor * pow(tex.rgb, vec3(2.2));
  float dist = length(u_camPos - v_wpos);
  float f = 1.0 - exp(-pow(dist * u_fogDensity, 1.6));
  col = mix(col, u_fogCol, clamp(f, 0.0, 1.0));
  o = vec4(col, tex.a * u_alpha);
}`;

export const DEPTH_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_vp;
uniform mat4 u_model;
void main() { gl_Position = u_vp * u_model * vec4(a_pos, 1.0); }`;

export const DEPTH_FS = `#version 300 es
precision mediump float;
void main() {}`;

/** Floating dust: visible mostly inside the flashlight cone and near lamps. */
export const DUST_VS = `#version 300 es
layout(location=0) in vec3 a_pos;
uniform mat4 u_vp;
uniform vec3 u_center;
uniform float u_time;
uniform vec3 u_spotPos;
uniform vec3 u_spotDir;
uniform vec2 u_spotCone;
uniform float u_spotOn;
uniform float u_px;
out float v_a;
void main() {
  vec3 p = a_pos;
  p += vec3(sin(u_time * 0.21 + p.y * 3.0), sin(u_time * 0.13 + p.x * 2.0) * 0.4, cos(u_time * 0.17 + p.z * 2.5)) * 0.25;
  // wrap the 12 m cube of dust around the camera
  vec3 rel = mod(p - u_center + 6.0, 12.0) - 6.0;
  vec3 w = u_center + rel;
  w.y = clamp(w.y, 0.1, 3.1);
  vec3 L = w - u_spotPos;
  float d = length(L);
  float c = dot(L / max(d, 0.001), u_spotDir);
  float inBeam = smoothstep(u_spotCone.y, u_spotCone.x, c) * u_spotOn * clamp(1.0 - d / 9.0, 0.0, 1.0);
  v_a = inBeam * 0.55 + 0.03;
  vec4 cp = u_vp * vec4(w, 1.0);
  gl_Position = cp;
  gl_PointSize = clamp(u_px / cp.w, 1.0, 6.0);
}`;

export const DUST_FS = `#version 300 es
precision mediump float;
in float v_a;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c)) * v_a;
  o = vec4(vec3(1.0, 0.95, 0.85) * a, a);
}`;

/** Blood droplets, sparks: coloured points in world space. */
export const PART_VS = `#version 300 es
layout(location=0) in vec4 a_p;
uniform mat4 u_vp;
uniform float u_px;
out float v_k;
void main() {
  vec4 cp = u_vp * vec4(a_p.xyz, 1.0);
  gl_Position = cp;
  v_k = a_p.w;
  gl_PointSize = clamp(u_px / cp.w, 1.5, 9.0);
}`;
export const PART_FS = `#version 300 es
precision mediump float;
in float v_k;
out vec4 o;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.2, length(c));
  vec3 col = v_k < 0.5 ? vec3(0.25, 0.01, 0.01) : v_k < 1.5 ? vec3(0.05, 0.05, 0.04) : v_k < 2.5 ? vec3(2.5, 1.6, 0.6) : vec3(0.35, 0.33, 0.3);
  o = vec4(col, a);
}`;

export const QUAD_VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 v_uv;
void main() {
  vec2 p = P[gl_VertexID];
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

export const BRIGHT_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.75, 1.6, l), 1.0);
}`;

export const BLUR_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb * 0.227;
  c += texture(u_tex, v_uv + u_dir * 1.385).rgb * 0.316;
  c += texture(u_tex, v_uv - u_dir * 1.385).rgb * 0.316;
  c += texture(u_tex, v_uv + u_dir * 3.231).rgb * 0.070;
  c += texture(u_tex, v_uv - u_dir * 3.231).rgb * 0.070;
  o = vec4(c, 1.0);
}`;

export const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_bloomOn;
uniform float u_time;
uniform float u_grain;
uniform float u_ca;
uniform float u_fear;
uniform float u_cctv;
uniform float u_exposure;
uniform float u_fade;
uniform float u_glitch;
uniform float u_hurt;
uniform vec2 u_res;
in vec2 v_uv;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 uv = v_uv;
  vec2 cc = uv - 0.5;
  if (u_cctv > 0.5) {
    // barrel distortion of a cheap CCTV lens
    float r2 = dot(cc, cc);
    uv = 0.5 + cc * (1.0 + 0.18 * r2);
    // rolling desync line
    float roll = fract(u_time * 0.07);
    uv.x += (smoothstep(0.0, 0.02, abs(uv.y - roll)) - 1.0) * -0.01;
  }
  if (u_glitch > 0.0) {
    float band = step(0.96 - u_glitch * 0.3, hash(vec2(floor(uv.y * 40.0), floor(u_time * 20.0))));
    uv.x += band * (hash(vec2(u_time, uv.y)) - 0.5) * 0.08 * u_glitch;
  }
  float ca = u_ca * (0.4 + length(cc) * 1.2) + u_glitch * 0.004;
  vec3 col;
  col.r = texture(u_scene, uv + cc * ca).r;
  col.g = texture(u_scene, uv).g;
  col.b = texture(u_scene, uv - cc * ca).b;
  if (u_bloomOn > 0.5) col += texture(u_bloom, uv).rgb * 0.55;
  col *= u_exposure;
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  if (u_cctv > 0.5) {
    float l = dot(col, vec3(0.3, 0.59, 0.11));
    col = vec3(l * 0.75, l * 1.0, l * 0.82) * 1.25;
    col *= 0.86 + 0.14 * sin(uv.y * u_res.y * 1.4);
    col += (hash(uv * u_res + u_time) - 0.5) * 0.16;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
  }
  // vignette and fear
  float v = smoothstep(0.85, 0.25, length(cc * vec2(1.1, 1.0)));
  col *= mix(0.55, 1.0, v);
  float pulse = 0.5 + 0.5 * sin(u_time * (4.0 + u_fear * 6.0));
  col = mix(col, col * vec3(1.15, 0.55, 0.5), (1.0 - v) * u_fear * (0.35 + 0.35 * pulse));
  col = mix(col, vec3(0.5, 0.02, 0.0), u_hurt * (1.0 - v * 0.6));
  // film grain
  col += (hash(uv * u_res * 0.5 + fract(u_time) * 100.0) - 0.5) * u_grain;
  col *= 1.0 - u_fade;
  o = vec4(col, 1.0);
}`;
