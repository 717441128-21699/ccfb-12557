/** 列主序 4x4 矩阵小工具（无外部依赖） */

export type Mat4 = Float32Array; // length 16, column-major
export type Vec3 = [number, number, number];

export function ident(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** out = a * b（先应用 b，再应用 a） */
export function mul(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function translate(x: number, y: number, z: number): Mat4 {
  const m = ident();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

export function scale(x: number, y: number, z: number): Mat4 {
  const m = ident();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}

export function rotX(a: number): Mat4 {
  const m = ident();
  const c = Math.cos(a), s = Math.sin(a);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}

export function rotY(a: number): Mat4 {
  const m = ident();
  const c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}

export function rotZ(a: number): Mat4 {
  const m = ident();
  const c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}

/** T(pos) · Rz · Ry · Rx · S */
export function compose(pos: Vec3, rot: Vec3, scl: Vec3): Mat4 {
  let m = translate(pos[0], pos[1], pos[2]);
  m = mul(m, rotZ(rot[2]));
  m = mul(m, rotY(rot[1]));
  m = mul(m, rotX(rot[0]));
  m = mul(m, scale(scl[0], scl[1], scl[2]));
  return m;
}

/** 正交投影（X光近似平行束） */
export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = 2 / (r - l);
  m[5] = 2 / (t - b);
  m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l);
  m[13] = -(t + b) / (t - b);
  m[14] = -(f + n) / (f - n);
  m[15] = 1;
  return m;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
