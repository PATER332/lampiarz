// Thin WebGL2 helpers: programs, meshes, textures and render targets.

export type GL = WebGL2RenderingContext;

export class Program {
  prog: WebGLProgram;
  private locs = new Map<string, WebGLUniformLocation | null>();
  constructor(
    public gl: GL,
    vs: string,
    fs: string,
    public name: string,
  ) {
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${name}: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.bindAttribLocation(p, 1, 'a_nrm');
    gl.bindAttribLocation(p, 2, 'a_uv');
    gl.bindAttribLocation(p, 3, 'a_tan');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(p)}`);
    this.prog = p;
  }
  use() {
    this.gl.useProgram(this.prog);
    return this;
  }
  loc(n: string) {
    let l = this.locs.get(n);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.prog, n);
      this.locs.set(n, l);
    }
    return l;
  }
  m4(n: string, v: Float32Array) {
    this.gl.uniformMatrix4fv(this.loc(n), false, v);
  }
  f1(n: string, v: number) {
    this.gl.uniform1f(this.loc(n), v);
  }
  i1(n: string, v: number) {
    this.gl.uniform1i(this.loc(n), v);
  }
  f2(n: string, a: number, b: number) {
    this.gl.uniform2f(this.loc(n), a, b);
  }
  f3(n: string, a: number, b: number, c: number) {
    this.gl.uniform3f(this.loc(n), a, b, c);
  }
  v3(n: string, v: ArrayLike<number>) {
    this.gl.uniform3f(this.loc(n), v[0], v[1], v[2]);
  }
  f3v(n: string, v: Float32Array) {
    this.gl.uniform3fv(this.loc(n), v);
  }
  f4v(n: string, v: Float32Array) {
    this.gl.uniform4fv(this.loc(n), v);
  }
}

export interface Mesh {
  vao: WebGLVertexArrayObject;
  count: number;
  mode: number;
  buffers: WebGLBuffer[];
}

/** Interleaved-free mesh: separate buffers for position, normal, uv, tangent + indices. */
export function createMesh(gl: GL, pos: Float32Array, nrm: Float32Array, uv: Float32Array, tan: Float32Array, idx: Uint32Array | Uint16Array): Mesh {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buffers: WebGLBuffer[] = [];
  const attr = (loc: number, data: Float32Array, size: number) => {
    const b = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    buffers.push(b);
  };
  attr(0, pos, 3);
  attr(1, nrm, 3);
  attr(2, uv, 2);
  attr(3, tan, 3);
  const ib = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  buffers.push(ib);
  gl.bindVertexArray(null);
  return { vao, count: idx.length, mode: idx instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, buffers };
}

export function drawMesh(gl: GL, m: Mesh) {
  gl.bindVertexArray(m.vao);
  gl.drawElements(gl.TRIANGLES, m.count, m.mode, 0);
}

export function deleteMesh(gl: GL, m: Mesh) {
  for (const b of m.buffers) gl.deleteBuffer(b);
  gl.deleteVertexArray(m.vao);
}

export function textureFromCanvas(gl: GL, src: TexImageSource, opts: { repeat?: boolean; mips?: boolean; aniso?: number; linear?: boolean } = {}): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const wrap = opts.repeat === false ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (opts.mips !== false) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (opts.aniso) {
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(opts.aniso, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  }
  return t;
}

export function updateTexture(gl: GL, t: WebGLTexture, src: TexImageSource, mips = false) {
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  if (mips) gl.generateMipmap(gl.TEXTURE_2D);
}

export function solidTexture(gl: GL, r: number, g: number, b: number, a = 255) {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return t;
}

export interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  depth: WebGLRenderbuffer | null;
  w: number;
  h: number;
}

export function createTarget(gl: GL, w: number, h: number, opts: { float?: boolean; depth?: boolean } = {}): Target {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  if (opts.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let depth: WebGLRenderbuffer | null = null;
  if (opts.depth) {
    depth = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    if (opts.float) return createTarget(gl, w, h, { ...opts, float: false });
    throw new Error('framebuffer incomplete');
  }
  return { fb, tex, depth, w, h };
}

export function deleteTarget(gl: GL, t: Target) {
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.tex);
  if (t.depth) gl.deleteRenderbuffer(t.depth);
}

export interface ShadowTarget {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  size: number;
}

export function createShadowTarget(gl: GL, size: number): ShadowTarget {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, size };
}
