import { describe, expect, it } from 'vitest';
import { generateScene, flattenScene } from '../src/scene';
import { grade } from '../src/ui/app';

describe('场景生成', () => {
  it('同一种子生成完全相同的场景（可复现）', () => {
    const a = generateScene({ seed: 42, itemCount: 40, contrabandCount: 3 });
    const b = generateScene({ seed: 42, itemCount: 40, contrabandCount: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('物品数量与违禁品数量符合参数', () => {
    const s = generateScene({ seed: 7, itemCount: 40, contrabandCount: 3 });
    // items 含箱壳 1 件
    expect(s.items.length).toBe(41);
    const cbs = s.items.filter((i) => i.contraband);
    expect(cbs.length).toBe(3);
    for (const cb of cbs) {
      expect(cb.bbox).not.toBeNull();
      const [x0, y0, x1, y1] = cb.bbox!;
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeGreaterThan(y0);
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(1);
    }
  });

  it('拍平后的渲染部件都带合法的双能衰减系数', () => {
    const s = generateScene({ seed: 99, itemCount: 40, contrabandCount: 2 });
    const parts = flattenScene(s);
    expect(parts.length).toBeGreaterThan(40);
    for (const p of parts) {
      expect(p.mu[0]).toBeGreaterThan(0);
      expect(p.mu[1]).toBeGreaterThan(0);
      expect(p.mu[0]).toBeGreaterThanOrEqual(p.mu[1]); // 低能衰减不小于高能
      expect(p.model.length).toBe(16);
    }
  });
});

describe('判分', () => {
  it('标记命中所有违禁品得满分，漏报扣分，误报扣分', () => {
    const s = generateScene({ seed: 7, itemCount: 40, contrabandCount: 2 });
    const cbs = s.items.filter((i) => i.contraband);
    const centers = cbs.map((c): [number, number] => {
      const [x0, y0, x1, y1] = c.bbox!;
      return [(x0 + x1) / 2, (y0 + y1) / 2];
    });
    const full = grade(s, centers);
    expect(full.hits.length).toBe(cbs.length);
    expect(full.missed.length).toBe(0);
    expect(full.score).toBe(100);

    const none = grade(s, []);
    expect(none.missed.length).toBe(cbs.length);
    expect(none.score).toBe(0);

    const withFalse = grade(s, [...centers, [0.02, 0.02], [0.98, 0.98]]);
    expect(withFalse.falseAlarms).toBeGreaterThan(0);
    expect(withFalse.score).toBeLessThan(100);
  });
});
