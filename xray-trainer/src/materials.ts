/**
 * 材质表：双能X射线质量衰减系数（μ/ρ，cm²/g）。
 * 低能档等效 ~70 keV，高能档等效 ~150 keV。
 * 数值参照 NIST XCOM 同量级数据整理，用于培训仿真。
 * 线衰减系数 μ = (μ/ρ) × 密度，透射率 T = exp(-μ · 厚度)。
 */

export type MaterialCategory = 'organic' | 'mixture' | 'metal';

export interface Material {
  id: string;
  name: string;
  density: number;   // g/cm³
  muRhoLow: number;  // cm²/g，低能档
  muRhoHigh: number; // cm²/g，高能档
  zEff: number;      // 等效原子序数
  category: MaterialCategory;
}

function mat(
  id: string, name: string, density: number,
  muRhoLow: number, muRhoHigh: number, zEff: number, category: MaterialCategory,
): Material {
  return { id, name, density, muRhoLow, muRhoHigh, zEff, category };
}

export const MATERIALS: Record<string, Material> = Object.freeze({
  water:     mat('water',     '水/液体',   1.00, 0.206, 0.150,  7.4, 'organic'),
  fabric:    mat('fabric',    '织物/衣物', 0.35, 0.200, 0.148,  7.0, 'organic'),
  plastic:   mat('plastic',   '塑料',      0.95, 0.190, 0.145,  6.0, 'organic'),
  paper:     mat('paper',     '纸张/书',   0.80, 0.200, 0.148,  7.0, 'organic'),
  rubber:    mat('rubber',    '橡胶',      1.10, 0.195, 0.146,  6.5, 'organic'),
  food:      mat('food',      '食品',      0.90, 0.200, 0.149,  7.2, 'organic'),
  explosive: mat('explosive', '爆炸物模拟', 1.60, 0.200, 0.148,  7.5, 'organic'),
  glass:     mat('glass',     '玻璃',      2.50, 0.240, 0.140, 11.0, 'mixture'),
  ceramic:   mat('ceramic',   '陶瓷',      3.80, 0.280, 0.140, 12.0, 'mixture'),
  battery:   mat('battery',   '锂电池',    2.00, 0.300, 0.150, 10.0, 'mixture'),
  aluminum:  mat('aluminum',  '铝合金',    2.70, 0.278, 0.137, 13.0, 'mixture'),
  steel:     mat('steel',     '钢',        7.80, 0.600, 0.160, 26.0, 'metal'),
  copper:    mat('copper',    '铜',        8.90, 1.000, 0.200, 29.0, 'metal'),
});

export function getMaterial(id: string): Material {
  const m = MATERIALS[id];
  if (!m) throw new Error(`未知材质: ${id}`);
  return m;
}

/** 低能档线衰减系数 μ (cm⁻¹) */
export function muLow(m: Material): number {
  return m.density * m.muRhoLow;
}

/** 高能档线衰减系数 μ (cm⁻¹) */
export function muHigh(m: Material): number {
  return m.density * m.muRhoHigh;
}
