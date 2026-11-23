/**
 * 衰减物理：Beer-Lambert 定律 T = exp(-μ·t)。
 * 多种材质沿射线串联时，光学厚度累加：A = Σ μᵢ·tᵢ，T = exp(-A)。
 * 双能比值 r = A_low / A_high 用于估计等效原子序数区间（伪彩色染色）。
 */

/** 单材质透射率 */
export function transmittance(muLinear: number, thicknessCm: number): number {
  return Math.exp(-muLinear * thicknessCm);
}

export interface AttenuationSegment {
  muLow: number;  // cm⁻¹
  muHigh: number; // cm⁻¹
  thickness: number; // cm
}

/** 沿射线的累计光学厚度（低能/高能） */
export function opticalDepth(segments: AttenuationSegment[]): { low: number; high: number } {
  let low = 0;
  let high = 0;
  for (const s of segments) {
    low += s.muLow * s.thickness;
    high += s.muHigh * s.thickness;
  }
  return { low, high };
}

/** 双能比值染色阈值 */
export const RATIO_ORGANIC_MAX = 1.5;
export const RATIO_MIXTURE_MAX = 2.5;

export type HueClass = 'organic' | 'mixture' | 'metal';

/** 由双能比值判定染色类别 */
export function classifyByRatio(ratio: number): HueClass {
  if (ratio < RATIO_ORGANIC_MAX) return 'organic';
  if (ratio < RATIO_MIXTURE_MAX) return 'mixture';
  return 'metal';
}

/** 透射率低于此值视为穿不透（发黑） */
export const OPAQUE_TRANSMITTANCE = 0.02;
