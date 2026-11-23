/**
 * 场景生成：按种子确定性生成一个"行李箱"——
 * 箱壳 + 随机摆放（位置/姿态随机、允许互相遮挡）的若干物品，
 * 其中按参数藏入违禁品。违禁品的屏幕包围盒作为判图标准答案。
 */
import { compose, mul, transformPoint, type Mat4 } from './mat4';
import { getMesh, type MeshId } from './mesh';
import { getMaterial, muHigh, muLow } from './materials';
import {
  BENIGN_POOL, CONTRABAND_TYPES, LARGE_ITEM_IDS, LARGE_ITEM_QUOTA, SMALL_POOL,
  type ItemType, type PartSpec,
} from './items';
import { mulberry32, pick, range, sample } from './rng';

export interface SceneParams {
  seed: number;
  itemCount: number;        // 物品总数（含违禁品）
  contrabandCount: number;  // 藏入的违禁品数量
}

export interface PlacedItem {
  typeId: string;
  label: string;
  contraband: boolean;
  pos: [number, number, number];
  rot: [number, number, number];
  parts: PartSpec[];
  /** 违禁品的屏幕归一化包围盒 [x0, y0, x1, y1]（y 向下），非违禁品为 null */
  bbox: [number, number, number, number] | null;
}

export interface Scene {
  params: SceneParams;
  items: PlacedItem[];
}

/** 视野尺寸（cm），正方形视野边长 */
export const VIEW_SIZE = 62;
/** 行李箱内腔尺寸（cm） */
export const SUITCASE = { w: 56, h: 40, d: 18 };

export function generateScene(params: SceneParams): Scene {
  const rng = mulberry32(params.seed);
  const items: PlacedItem[] = [];

  // 1. 行李箱外壳（上下两层织物薄板，让图像有箱体轮廓）
  const shellParts: PartSpec[] = [
    { mesh: 'box', material: 'fabric', pos: [0, 0, -SUITCASE.d / 2], rot: [0, 0, 0], scale: [SUITCASE.w, SUITCASE.h, 1.2] },
    { mesh: 'box', material: 'fabric', pos: [0, 0, SUITCASE.d / 2], rot: [0, 0, 0], scale: [SUITCASE.w, SUITCASE.h, 1.2] },
  ];
  items.push({
    typeId: 'suitcase', label: '行李箱', contraband: false,
    pos: [0, 0, 0], rot: [0, 0, 0], parts: shellParts, bbox: null,
  });

  // 2. 选违禁品（不放回），其余从普通物品池随机抽（大件限量，超出改抽小件）
  const nCb = Math.min(params.contrabandCount, CONTRABAND_TYPES.length, params.itemCount);
  const chosen: ItemType[] = [...sample(rng, CONTRABAND_TYPES, nCb)];
  let largeCount = chosen.filter((t) => LARGE_ITEM_IDS.has(t.id)).length;
  while (chosen.length < params.itemCount) {
    let t = pick(rng, BENIGN_POOL);
    if (LARGE_ITEM_IDS.has(t.id)) {
      if (largeCount >= LARGE_ITEM_QUOTA) t = pick(rng, SMALL_POOL);
      else largeCount++;
    }
    chosen.push(t);
  }

  // 3. 随机摆放：x-y 平面用抖动网格均匀摊开（大物品自然压到邻格，形成遮挡），
  //    z 向随机分层，姿态随机。
  const n = chosen.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * SUITCASE.w) / SUITCASE.h)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = (SUITCASE.w - 4) / cols;
  const cellH = (SUITCASE.h - 4) / rows;
  const cells = sample(rng, Array.from({ length: cols * rows }, (_, i) => i), n);
  for (let idx = 0; idx < n; idx++) {
    const type = chosen[idx];
    const parts = type.make(rng);
    const ext = itemExtent(parts);
    const cx = cells[idx] % cols;
    const cy = Math.floor(cells[idx] / cols);
    const jx = Math.min(cellW * 0.35, Math.max(0, (SUITCASE.w / 2 - Math.max(ext[0], ext[1])) * 0.5));
    const jy = Math.min(cellH * 0.35, Math.max(0, (SUITCASE.h / 2 - Math.max(ext[0], ext[1])) * 0.5));
    const zr = Math.max(0, SUITCASE.d / 2 - ext[2]);
    const pos: [number, number, number] = [
      -SUITCASE.w / 2 + 2 + (cx + 0.5) * cellW + range(rng, -jx, jx),
      -SUITCASE.h / 2 + 2 + (cy + 0.5) * cellH + range(rng, -jy, jy),
      range(rng, -zr, zr),
    ];
    // 收边界，保证不出箱
    const rxy = Math.max(ext[0], ext[1]);
    pos[0] = Math.max(-SUITCASE.w / 2 + rxy, Math.min(SUITCASE.w / 2 - rxy, pos[0]));
    pos[1] = Math.max(-SUITCASE.h / 2 + rxy, Math.min(SUITCASE.h / 2 - rxy, pos[1]));
    const rot: [number, number, number] = [
      range(rng, -0.35, 0.35),
      range(rng, -0.35, 0.35),
      range(rng, 0, Math.PI * 2),
    ];
    items.push({
      typeId: type.id, label: type.label, contraband: type.contraband,
      pos, rot, parts, bbox: null,
    });
  }

  // 4. 计算违禁品屏幕包围盒（标准答案）
  for (const item of items) {
    if (!item.contraband) continue;
    item.bbox = computeItemBBox(item);
  }

  return { params, items };
}

function itemMatrix(item: PlacedItem): Mat4 {
  return compose(item.pos, item.rot, [1, 1, 1]);
}

/** 物品各轴占位半径（部件中心偏移 + 缩放后网格半尺寸，取各部件最大值） */
function itemExtent(parts: PartSpec[]): [number, number, number] {
  const ext: [number, number, number] = [0, 0, 0];
  for (const part of parts) {
    const b = getMesh(part.mesh).bounds;
    for (let k = 0; k < 3; k++) {
      const half = Math.max(Math.abs(b[k]), Math.abs(b[k + 3])) * part.scale[k];
      const r = Math.abs(part.pos[k]) + half;
      if (r > ext[k]) ext[k] = r;
    }
  }
  return ext;
}

function computeItemBBox(item: PlacedItem): [number, number, number, number] {
  const im = itemMatrix(item);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const part of item.parts) {
    const pm = mul(im, compose(part.pos, part.rot, part.scale));
    const b = getMesh(part.mesh).bounds;
    for (let i = 0; i < 8; i++) {
      const corner: [number, number, number] = [
        i & 1 ? b[3] : b[0],
        i & 2 ? b[4] : b[1],
        i & 4 ? b[5] : b[2],
      ];
      const [wx, wy] = transformPoint(pm, corner);
      const nx = (wx + VIEW_SIZE / 2) / VIEW_SIZE;
      const ny = (VIEW_SIZE / 2 - wy) / VIEW_SIZE;
      if (nx < x0) x0 = nx;
      if (ny < y0) y0 = ny;
      if (nx > x1) x1 = nx;
      if (ny > y1) y1 = ny;
    }
  }
  const pad = 0.015;
  return [
    Math.max(0, x0 - pad), Math.max(0, y0 - pad),
    Math.min(1, x1 + pad), Math.min(1, y1 + pad),
  ];
}

/** 渲染用：把场景拍平成部件列表（世界矩阵 + 双能线衰减系数） */
export interface RenderPart {
  meshId: MeshId;
  mu: [number, number]; // [μ_low, μ_high] cm⁻¹
  model: Mat4;
}

export function flattenScene(scene: Scene): RenderPart[] {
  const out: RenderPart[] = [];
  for (const item of scene.items) {
    const im = itemMatrix(item);
    for (const part of item.parts) {
      const m = getMaterial(part.material);
      out.push({
        meshId: part.mesh,
        mu: [muLow(m), muHigh(m)],
        model: mul(im, compose(part.pos, part.rot, part.scale)),
      });
    }
  }
  return out;
}
