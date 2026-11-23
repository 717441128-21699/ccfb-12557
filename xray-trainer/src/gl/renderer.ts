/**
 * WebGL2 双能X光渲染器。
 *
 * 原理：透射率 T = exp(-Σ μᵢ·tᵢ)，光学厚度 Σ μᵢ·tᵢ 可叠加，
 * 因此对每个凸体部件做两次 draw（背面 +μ·深度、正面 -μ·深度），
 * 以加法混合累积到 RGBA16F 纹理，R=低能光学厚度，G=高能光学厚度。
 * 最后的着色 pass 计算 T_low/T_high、双能比值并伪彩色染色。
 */
import { getMesh, type MeshId } from '../mesh';
import { mul, ortho, translate, type Mat4 } from '../mat4';
import { VIEW_SIZE, type RenderPart } from '../scene';

const THICKNESS_VS = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uViewProj;
out float vDepth;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vec4 vp = uView * wp;
  vDepth = -vp.z;
  gl_Position = uViewProj * wp;
}`;

const THICKNESS_FS = `#version 300 es
precision highp float;
in float vDepth;
uniform vec2 uMu;
uniform float uSign;
out vec4 o;
void main() {
  o = vec4(uMu * (vDepth * uSign), 0.0, 0.0);
}`;

const COLOR_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const COLOR_FS = `#version 300 es
precision highp float;
uniform sampler2D uAccum;
uniform float uDebug;
uniform float uNoiseSeed;
in vec2 vUv;
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 A = texture(uAccum, vUv).rg;
  if (uDebug > 0.5) { o = vec4(vec3(A.x * 0.1), 1.0); return; }
  float Tl = exp(-A.x);
  float Th = exp(-A.y);
  float T = sqrt(Tl * Th);
  float r = A.x / max(A.y, 1e-6);
  vec3 hue = r < 1.5 ? vec3(1.0, 0.5, 0.08)
           : r < 2.5 ? vec3(0.05, 0.65, 0.2)
                     : vec3(0.1, 0.35, 0.9);
  float dens = clamp(1.0 - T, 0.0, 1.0);
  vec3 col = mix(vec3(0.93), hue, smoothstep(0.02, 0.55, dens));
  col *= 0.35 + 0.65 * T;
  if (T < 0.00035) col = vec3(0.0); // 光学厚度 A>8，基本穿不透，发黑
  col += (hash(vUv * uNoiseSeed) - 0.5) * 0.03;
  o = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`着色器编译失败: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`着色器链接失败: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

export class XRayRenderer {
  readonly size: number;
  private gl: WebGL2RenderingContext;
  private thicknessProg: WebGLProgram;
  private colorProg: WebGLProgram;
  private accumTex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private vaos = new Map<MeshId, WebGLVertexArrayObject>();
  private quadVao: WebGLVertexArrayObject;
  private view: Mat4;
  private viewProj: Mat4;
  private u: {
    model: WebGLUniformLocation; view: WebGLUniformLocation; viewProj: WebGLUniformLocation;
    mu: WebGLUniformLocation; sign: WebGLUniformLocation;
  };
  private c: { accum: WebGLUniformLocation; debug: WebGLUniformLocation; noise: WebGLUniformLocation };

  constructor(private canvas: HTMLCanvasElement, size = 1024) {
    this.size = size;
    canvas.width = size;
    canvas.height = size;
    const gl = canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      antialias: false,
      depth: false,
    });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    if (!gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('当前环境不支持 EXT_color_buffer_float，无法做浮点累积渲染');
    }
    // 优先 RGBA32F 累积（精度足以避免大深度值相减的灾难性抵消）；
    // 不支持 32F 混合时退化为 RGBA16F。
    const use32F = !!gl.getExtension('EXT_float_blend');

    this.thicknessProg = link(gl, THICKNESS_VS, THICKNESS_FS);
    this.colorProg = link(gl, COLOR_VS, COLOR_FS);
    this.u = {
      model: gl.getUniformLocation(this.thicknessProg, 'uModel')!,
      view: gl.getUniformLocation(this.thicknessProg, 'uView')!,
      viewProj: gl.getUniformLocation(this.thicknessProg, 'uViewProj')!,
      mu: gl.getUniformLocation(this.thicknessProg, 'uMu')!,
      sign: gl.getUniformLocation(this.thicknessProg, 'uSign')!,
    };
    this.c = {
      accum: gl.getUniformLocation(this.colorProg, 'uAccum')!,
      debug: gl.getUniformLocation(this.colorProg, 'uDebug')!,
      noise: gl.getUniformLocation(this.colorProg, 'uNoiseSeed')!,
    };

    // 累积纹理 + FBO
    this.accumTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, use32F ? gl.RGBA32F : gl.RGBA16F, size, size, 0,
      gl.RGBA, use32F ? gl.FLOAT : gl.HALF_FLOAT, null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.accumTex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('浮点帧缓冲不完整');
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 相机：z=50 处平行束正交投影，视野 VIEW_SIZE × VIEW_SIZE cm
    const half = VIEW_SIZE / 2;
    this.view = translate(0, 0, -50);
    this.viewProj = mul(ortho(-half, half, -half, half, 1, 100), this.view);

    // 全屏三角形
    this.quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.quadVao);
    const qb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  private vaoFor(meshId: MeshId): WebGLVertexArrayObject {
    let vao = this.vaos.get(meshId);
    if (vao) return vao;
    const gl = this.gl;
    const mesh = getMesh(meshId);
    vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.vaos.set(meshId, vao);
    return vao;
  }

  /** 渲染一帧：先累积光学厚度，再伪彩色着色到画布 */
  render(parts: RenderPart[], opts: { debug?: boolean } = {}): void {
    const gl = this.gl;

    // Pass 1: 厚度累积
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size, this.size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.thicknessProg);
    gl.uniformMatrix4fv(this.u.view, false, this.view);
    gl.uniformMatrix4fv(this.u.viewProj, false, this.viewProj);

    for (const part of parts) {
      const mesh = getMesh(part.meshId);
      gl.bindVertexArray(this.vaoFor(part.meshId));
      gl.uniformMatrix4fv(this.u.model, false, part.model);
      gl.uniform2f(this.u.mu, part.mu[0], part.mu[1]);
      gl.uniform1f(this.u.sign, 1);
      gl.cullFace(gl.FRONT); // 画背面：+μ·d
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(this.u.sign, -1);
      gl.cullFace(gl.BACK); // 画正面：-μ·d
      gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);

    // Pass 2: 伪彩色着色
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.colorProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accumTex);
    gl.uniform1i(this.c.accum, 0);
    gl.uniform1f(this.c.debug, opts.debug ? 1 : 0);
    gl.uniform1f(this.c.noise, Math.random() * 1000 + 1);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** 渲染并计时（gl.finish 同步），返回毫秒 */
  renderTimed(parts: RenderPart[]): number {
    const t0 = performance.now();
    this.render(parts);
    this.gl.finish();
    return performance.now() - t0;
  }

  /**
   * 从累积帧缓冲读回光学厚度（自检用）。
   * 返回 RGBA/FLOAT 像素；环境不支持浮点读回时返回 null。
   */
  readAccum(x: number, y: number, w: number, h: number): Float32Array | null {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    const out = new Float32Array(w * h * 4);
    try {
      gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, out);
    } catch {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (gl.getError() !== gl.NO_ERROR) return null;
    return out;
  }
}
