/**
 * 程序化网格：单位立方体 / 圆柱 / 球（可加噪声成"衣物团"）。
 * 所有网格均为凸体且绕向一致（外表面逆时针），
 * 渲染时用正面/背面两次 draw 的深度差得到射线穿过厚度。
 */

export interface Mesh {
  positions: Float32Array;
  indices: Uint16Array;
  /** 轴对齐包围盒 [minX, minY, minZ, maxX, maxY, maxZ] */
  bounds: [number, number, number, number, number, number];
}

function computeBounds(positions: Float32Array): Mesh['bounds'] {
  const b: Mesh['bounds'] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k];
      if (v < b[k]) b[k] = v;
      if (v > b[k + 3]) b[k + 3] = v;
    }
  }
  return b;
}

function makeMesh(positions: number[], indices: number[]): Mesh {
  const p = new Float32Array(positions);
  return { positions: p, indices: new Uint16Array(indices), bounds: computeBounds(p) };
}

/** 单位立方体，边长1，中心在原点 */
export function unitBox(): Mesh {
  // 8 个角点
  const p = [
    -0.5, -0.5, -0.5,  // 0
     0.5, -0.5, -0.5,  // 1
     0.5,  0.5, -0.5,  // 2
    -0.5,  0.5, -0.5,  // 3
    -0.5, -0.5,  0.5,  // 4
     0.5, -0.5,  0.5,  // 5
     0.5,  0.5,  0.5,  // 6
    -0.5,  0.5,  0.5,  // 7
  ];
  const idx = [
    0, 3, 2, 0, 2, 1,  // -z
    4, 5, 6, 4, 6, 7,  // +z
    1, 2, 6, 1, 6, 5,  // +x
    0, 4, 7, 0, 7, 3,  // -x
    3, 7, 6, 3, 6, 2,  // +y
    0, 1, 5, 0, 5, 4,  // -y
  ];
  return makeMesh(p, idx);
}

/** 单位圆柱：半径1，高1，轴线沿 y，中心在原点 */
export function unitCylinder(segments = 24): Mesh {
  const p: number[] = [];
  const idx: number[] = [];
  // 侧面：每个角度两个顶点（底/顶）
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a), z = Math.sin(a);
    p.push(x, -0.5, z, x, 0.5, z);
  }
  for (let i = 0; i < segments; i++) {
    const b0 = i * 2, t0 = i * 2 + 1, b1 = i * 2 + 2, t1 = i * 2 + 3;
    idx.push(b0, t1, b1, b0, t0, t1);
  }
  // 顶盖（+y）：从 +y 看逆时针
  const topCenter = p.length / 3;
  p.push(0, 0.5, 0);
  const topStart = p.length / 3;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    p.push(Math.cos(a), 0.5, Math.sin(a));
  }
  for (let i = 0; i < segments; i++) {
    idx.push(topCenter, topStart + i + 1, topStart + i);
  }
  // 底盖（-y）
  const botCenter = p.length / 3;
  p.push(0, -0.5, 0);
  const botStart = p.length / 3;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    p.push(Math.cos(a), -0.5, Math.sin(a));
  }
  for (let i = 0; i < segments; i++) {
    idx.push(botCenter, botStart + i, botStart + i + 1);
  }
  return makeMesh(p, idx);
}

/**
 * 单位球（经纬网格），radius 1。
 * noise > 0 时顶点沿径向扰动，形成"揉皱的衣物"团块。
 * 噪声按 (i mod slices, j) 哈希取值，保证接缝处顶点一致、网格保持封闭。
 */
export function unitSphere(slices = 16, stacks = 12, noise = 0): Mesh {
  const p: number[] = [];
  const idx: number[] = [];
  const hash = (i: number, j: number) => {
    const h = Math.sin(i * 12.9898 + j * 78.537) * 43758.5453;
    return h - Math.floor(h);
  };
  for (let j = 0; j <= stacks; j++) {
    const phi = (j / stacks) * Math.PI;
    for (let i = 0; i <= slices; i++) {
      const theta = (i / slices) * Math.PI * 2;
      let r = 1;
      if (noise > 0 && j > 0 && j < stacks) {
        r = 1 + (hash(i % slices, j) - 0.5) * 2 * noise;
      }
      p.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
    }
  }
  const row = slices + 1;
  for (let j = 0; j < stacks; j++) {
    for (let i = 0; i < slices; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, d, c, a, b, d);
    }
  }
  return makeMesh(p, idx);
}

export type MeshId = 'box' | 'cyl' | 'sphere' | 'blob';

const cache = new Map<MeshId, Mesh>();

/** 取内置网格（单例，供 GPU 缓存复用） */
export function getMesh(id: MeshId): Mesh {
  let m = cache.get(id);
  if (!m) {
    switch (id) {
      case 'box': m = unitBox(); break;
      case 'cyl': m = unitCylinder(); break;
      case 'sphere': m = unitSphere(); break;
      // 固定噪声的扰动球，同一"衣物"网格处处一致
      case 'blob':
        m = unitSphere(14, 10, 0.12);
        break;
    }
    cache.set(id, m);
  }
  return m;
}
