import { describe, expect, it } from 'vitest';
import { MATERIALS, muHigh, muLow } from '../src/materials';
import { classifyByRatio, opticalDepth, transmittance } from '../src/physics';

describe('Beer-Lambert 指数衰减律', () => {
  it('所有材质：厚度加倍时 T(2t) = T(t)²，偏差 ≤3%', () => {
    for (const m of Object.values(MATERIALS)) {
      for (const mu of [muLow(m), muHigh(m)]) {
        for (const t of [0.5, 1, 2, 4, 8]) {
          const direct = transmittance(mu, 2 * t);
          const squared = transmittance(mu, t) ** 2;
          const relErr = Math.abs(direct - squared) / squared;
          expect(relErr, `${m.name} μ=${mu} t=${t}`).toBeLessThanOrEqual(0.03);
        }
      }
    }
  });

  it('透射率随厚度单调下降', () => {
    const m = MATERIALS.steel;
    const mu = muLow(m);
    let prev = 1;
    for (const t of [0.1, 0.5, 1, 2, 5]) {
      const cur = transmittance(mu, t);
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });
});

describe('光学厚度累加', () => {
  it('多材质串联：A = Σ μᵢ·tᵢ，T = exp(-A)', () => {
    const segs = [
      { muLow: muLow(MATERIALS.water), muHigh: muHigh(MATERIALS.water), thickness: 5 },
      { muLow: muLow(MATERIALS.aluminum), muHigh: muHigh(MATERIALS.aluminum), thickness: 0.5 },
    ];
    const { low, high } = opticalDepth(segs);
    expect(low).toBeCloseTo(muLow(MATERIALS.water) * 5 + muLow(MATERIALS.aluminum) * 0.5, 10);
    expect(high).toBeCloseTo(muHigh(MATERIALS.water) * 5 + muHigh(MATERIALS.aluminum) * 0.5, 10);
    expect(Math.exp(-low)).toBeCloseTo(
      transmittance(segs[0].muLow, 5) * transmittance(segs[1].muLow, 0.5), 12,
    );
  });
});

describe('双能比值染色分类', () => {
  it('水/塑料 → 有机物（橙），玻璃/铝 → 混合物（绿），钢/铜 → 金属（蓝）', () => {
    const ratioOf = (id: string) => muLow(MATERIALS[id]) / muHigh(MATERIALS[id]);
    expect(classifyByRatio(ratioOf('water'))).toBe('organic');
    expect(classifyByRatio(ratioOf('plastic'))).toBe('organic');
    expect(classifyByRatio(ratioOf('fabric'))).toBe('organic');
    expect(classifyByRatio(ratioOf('glass'))).toBe('mixture');
    expect(classifyByRatio(ratioOf('aluminum'))).toBe('mixture');
    expect(classifyByRatio(ratioOf('steel'))).toBe('metal');
    expect(classifyByRatio(ratioOf('copper'))).toBe('metal');
  });
});
