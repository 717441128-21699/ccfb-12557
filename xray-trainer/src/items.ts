/**
 * 物品目录：每件物品由若干凸体部件组成，每个部件带材质。
 * 尺寸单位 cm。contraband = true 的类型为违禁品（出题时藏入行李）。
 */
import type { MeshId } from './mesh';
import type { Rng } from './rng';
import { range } from './rng';

export interface PartSpec {
  mesh: MeshId;
  material: string;
  pos: [number, number, number];
  rot: [number, number, number];
  scale: [number, number, number];
}

export interface ItemType {
  id: string;
  label: string;
  contraband: boolean;
  make: (rng: Rng) => PartSpec[];
}

const P = (
  mesh: MeshId, material: string,
  pos: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
  rot: [number, number, number] = [0, 0, 0],
): PartSpec => ({ mesh, material, pos, rot, scale });

const Z90: [number, number, number] = [0, 0, Math.PI / 2];
const X90: [number, number, number] = [Math.PI / 2, 0, 0];

export const ITEM_TYPES: ItemType[] = [
  // ---------- 普通物品 ----------
  {
    id: 'clothes', label: '衣物', contraband: false,
    make: (rng) => [
      P('blob', 'fabric', [0, 0, 0], [range(rng, 12, 18), range(rng, 9, 13), range(rng, 3, 6)]),
      P('blob', 'fabric', [range(rng, -6, 6), range(rng, -5, 5), 2.5], [range(rng, 8, 12), range(rng, 7, 10), range(rng, 2.5, 4)]),
    ],
  },
  {
    id: 'laptop', label: '笔记本电脑', contraband: false,
    make: () => [
      P('box', 'aluminum', [0, 0, 0], [34, 24, 1.4]),
      P('box', 'battery', [-8, -4, 0.9], [12, 9, 0.8]),
      P('box', 'copper', [6, 2, 0.9], [10, 8, 0.3]),
    ],
  },
  {
    id: 'phone', label: '手机', contraband: false,
    make: () => [
      P('box', 'aluminum', [0, 0, 0], [15, 7.5, 0.9]),
      P('box', 'battery', [0, 0, 0.6], [7, 4.5, 0.5]),
    ],
  },
  {
    id: 'powerbank', label: '充电宝', contraband: false,
    make: () => [
      P('box', 'aluminum', [0, 0, 0], [14, 7, 1.6]),
      P('box', 'battery', [0, 0, 0], [12, 5, 1.1]),
    ],
  },
  {
    id: 'book', label: '书籍', contraband: false,
    make: (rng) => [
      P('box', 'paper', [0, 0, 0], [range(rng, 18, 24), range(rng, 13, 18), range(rng, 1.5, 3.5)]),
    ],
  },
  {
    id: 'shoes', label: '鞋子', contraband: false,
    make: () => [
      P('blob', 'rubber', [-4, 0, 0], [13, 5.5, 5]),
      P('blob', 'rubber', [4, 1, 1], [13, 5.5, 5]),
    ],
  },
  {
    id: 'umbrella', label: '折叠雨伞', contraband: false,
    make: () => [
      P('cyl', 'steel', [0, 0, 0], [1.2, 30, 1.2], Z90),
      P('cyl', 'fabric', [0, 0, 0], [6, 26, 6], Z90),
    ],
  },
  {
    id: 'camera', label: '相机', contraband: false,
    make: () => [
      P('box', 'aluminum', [0, 0, 0], [12, 8, 5]),
      P('cyl', 'glass', [0, 0, 3.5], [5, 3, 5], X90),
    ],
  },
  {
    id: 'glasscup', label: '玻璃杯', contraband: false,
    make: () => [P('cyl', 'glass', [0, 0, 0], [7, 9, 7])],
  },
  {
    id: 'cosmetics', label: '化妆品', contraband: false,
    make: () => [
      P('cyl', 'plastic', [0, 0, 0], [4, 8, 4]),
      P('cyl', 'water', [0, -0.5, 0], [3.4, 6.5, 3.4]),
    ],
  },
  {
    id: 'charger', label: '充电器', contraband: false,
    make: () => [
      P('box', 'plastic', [0, 0, 0], [6, 6, 3]),
      P('cyl', 'copper', [0, 0, 0], [2, 1.5, 2]),
    ],
  },
  {
    id: 'tablet', label: '平板电脑', contraband: false,
    make: () => [
      P('box', 'aluminum', [0, 0, 0], [24, 17, 0.8]),
      P('box', 'battery', [0, 0, 0.5], [14, 10, 0.4]),
    ],
  },
  {
    id: 'keys', label: '钥匙串', contraband: false,
    make: (rng) => [
      P('box', 'steel', [0, 0, 0], [6, 1.5, 0.3], [0, 0, range(rng, 0, 3)]),
      P('box', 'steel', [1, 1, 0.4], [5, 1.4, 0.3], [0, 0, range(rng, 0, 3)]),
      P('box', 'steel', [-1, -1, 0.8], [5.5, 1.5, 0.3], [0, 0, range(rng, 0, 3)]),
    ],
  },
  {
    id: 'bottleSmall', label: '小瓶水(≤100ml)', contraband: false,
    make: () => [
      P('cyl', 'plastic', [0, 0, 0], [6, 12, 6]),
      P('cyl', 'water', [0, -0.5, 0], [5.2, 10, 5.2]),
    ],
  },
  {
    id: 'snack', label: '食品', contraband: false,
    make: (rng) => [
      P('box', 'food', [0, 0, 0], [range(rng, 9, 14), range(rng, 6, 10), range(rng, 2, 4)]),
    ],
  },

  // ---------- 违禁品 ----------
  {
    id: 'knife', label: '刀具', contraband: true,
    make: () => [
      P('box', 'steel', [3, 0, 0], [16, 2.6, 0.35]),
      P('box', 'plastic', [-8.5, 0, 0], [9, 3, 1.1]),
    ],
  },
  {
    id: 'scissors', label: '剪刀', contraband: true,
    make: () => [
      P('box', 'steel', [2, 0.8, 0], [12, 1.2, 0.25], [0, 0, 0.12]),
      P('box', 'steel', [2, -0.8, 0.3], [12, 1.2, 0.25], [0, 0, -0.12]),
      P('box', 'plastic', [-5.5, 1.2, 0], [4, 2.2, 0.8]),
      P('box', 'plastic', [-5.5, -1.2, 0.3], [4, 2.2, 0.8]),
    ],
  },
  {
    id: 'lighter', label: '打火机', contraband: true,
    make: () => [
      P('box', 'plastic', [0, 0, 0], [2.5, 6, 1.2]),
      P('box', 'steel', [0, 3.4, 0], [1.6, 1, 1]),
    ],
  },
  {
    id: 'liquidLarge', label: '大瓶液体(>100ml)', contraband: true,
    make: () => [
      P('cyl', 'plastic', [0, 0, 0], [8, 20, 8]),
      P('cyl', 'water', [0, -0.8, 0], [7.2, 17, 7.2]),
    ],
  },
  {
    id: 'gun', label: '仿真枪', contraband: true,
    make: () => [
      P('box', 'steel', [0, 0, 0], [14, 4, 2]),
      P('box', 'steel', [9, 0.5, 0], [10, 1.6, 1.6]),
      P('box', 'steel', [-4, -3.5, 0], [3.5, 6, 1.8], [0, 0, 0.3]),
    ],
  },
  {
    id: 'wrench', label: '扳手', contraband: true,
    make: () => [
      P('box', 'steel', [0, 0, 0], [18, 2.6, 0.8]),
      P('cyl', 'steel', [10, 0, 0], [5, 0.8, 5], X90),
    ],
  },
  {
    id: 'spray', label: '压力喷雾罐', contraband: true,
    make: () => [
      P('cyl', 'aluminum', [0, 0, 0], [6, 15, 6]),
      P('cyl', 'water', [0, -1, 0], [5.2, 12, 5.2]),
    ],
  },
  {
    id: 'batterySpare', label: '备用锂电池', contraband: true,
    make: () => [P('box', 'battery', [0, 0, 0], [8, 6, 2.2])],
  },
  {
    id: 'explosive', label: '爆炸物模拟品', contraband: true,
    make: () => [
      P('box', 'explosive', [0, 0, 0], [12, 8, 4]),
      P('cyl', 'copper', [0, 5, 0], [0.8, 10, 0.8], Z90),
      P('box', 'battery', [5, 4, 0], [3, 2, 1.5]),
    ],
  },
  {
    id: 'ceramicKnife', label: '陶瓷刀', contraband: true,
    make: () => [
      P('box', 'ceramic', [3, 0, 0], [15, 2.4, 0.3]),
      P('box', 'plastic', [-8, 0, 0], [8.5, 2.8, 1]),
    ],
  },
];

export const BENIGN_TYPES = ITEM_TYPES.filter((t) => !t.contraband);
export const CONTRABAND_TYPES = ITEM_TYPES.filter((t) => t.contraband);

/** 加权普通物品池：衣物等低密度小物品概率高，大件/高密度物品概率低 */
export const BENIGN_POOL: ItemType[] = (() => {
  const byId = (id: string) => ITEM_TYPES.find((t) => t.id === id)!;
  return [
    byId('clothes'), byId('clothes'), byId('clothes'), byId('clothes'), byId('clothes'),
    byId('shoes'), byId('shoes'),
    byId('snack'), byId('snack'),
    byId('book'), byId('book'),
    byId('bottleSmall'), byId('bottleSmall'),
    byId('cosmetics'), byId('cosmetics'),
    byId('charger'), byId('charger'),
    byId('phone'), byId('phone'),
    byId('keys'),
    byId('powerbank'),
    byId('laptop'),
    byId('tablet'),
    byId('umbrella'),
    byId('camera'),
    byId('glasscup'),
  ];
})();

/** 大件/高密度物品：同一场景限量，防止中心叠成穿不透的黑块 */
export const LARGE_ITEM_IDS = new Set(['laptop', 'tablet', 'umbrella', 'camera', 'glasscup', 'book']);
export const LARGE_ITEM_QUOTA = 4;

/** 小件池（限量品被抽满后的替补） */
export const SMALL_POOL: ItemType[] = (() => {
  const byId = (id: string) => ITEM_TYPES.find((t) => t.id === id)!;
  return [
    byId('clothes'), byId('clothes'), byId('shoes'), byId('snack'),
    byId('bottleSmall'), byId('cosmetics'), byId('charger'), byId('phone'),
    byId('keys'), byId('powerbank'),
  ];
})();

export function getItemType(id: string): ItemType {
  const t = ITEM_TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`未知物品类型: ${id}`);
  return t;
}
