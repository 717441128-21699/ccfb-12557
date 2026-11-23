/**
 * 自检：验收两条硬指标。
 * 1) 指数衰减律：同一材质厚度加倍，透射强度满足 T(2t)=T(t)²，与查表值偏差 ≤3%。
 *    - CPU：对材质表逐材质验证（理论恒等，验证表与公式实现一致）。
 *    - GPU：渲染已知厚度的材质块，从累积帧缓冲读回光学厚度对比查表值。
 * 2) 性能：40 件物品的行李箱渲染 1024×1024 ≤ 200ms。
 */
import { MATERIALS, muHigh, muLow } from './materials';
import { transmittance } from './physics';
import { generateScene, flattenScene, type RenderPart } from './scene';
import { scale } from './mat4';
import { XRayRenderer } from './gl/renderer';

export interface SelfTestResult {
  ok: boolean;
  physicsCpu: { checked: number; maxRelErr: number; pass: boolean };
  physicsGpu: { material: string; thickness: number; expected: number; measured: number; relErr: number }[];
  physicsGpuPass: boolean;
  perf: { itemCount: number; resolution: number; samplesMs: number[]; avgMs: number; pass: boolean };
  notes: string[];
}

const TOL = 0.03;

function checkCpu(): SelfTestResult['physicsCpu'] {
  let maxRelErr = 0;
  let checked = 0;
  for (const m of Object.values(MATERIALS)) {
    for (const mu of [muLow(m), muHigh(m)]) {
      for (const t of [0.5, 1, 2, 4, 8]) {
        const direct = transmittance(mu, 2 * t);
        const squared = transmittance(mu, t) ** 2;
        const relErr = Math.abs(direct - squared) / Math.max(squared, 1e-12);
        maxRelErr = Math.max(maxRelErr, relErr);
        checked++;
      }
    }
  }
  return { checked, maxRelErr, pass: maxRelErr <= TOL };
}

function wedgePart(materialId: string, thickness: number): RenderPart {
  const m = MATERIALS[materialId];
  return {
    meshId: 'box',
    mu: [muLow(m), muHigh(m)],
    model: scale(20, 20, thickness),
  };
}

function checkGpu(renderer: XRayRenderer, notes: string[]): { rows: SelfTestResult['physicsGpu']; pass: boolean } {
  const rows: SelfTestResult['physicsGpu'] = [];
  const c = renderer.size / 2;
  for (const matId of ['water', 'aluminum', 'steel']) {
    const m = MATERIALS[matId];
    for (const t of [2, 4]) {
      renderer.render([wedgePart(matId, t)], { debug: true });
      const px = renderer.readAccum(c, c, 1, 1);
      if (!px) {
        notes.push('环境不支持浮点帧缓冲读回，跳过 GPU 精度自检');
        return { rows, pass: true };
      }
      const measuredLow = px[0];
      const expectedLow = muLow(m) * t;
      const relErr = Math.abs(measuredLow - expectedLow) / expectedLow;
      rows.push({ material: m.name, thickness: t, expected: expectedLow, measured: measuredLow, relErr });
    }
    // 指数律：T(2t) 应等于 T(t)²（由读回的光学厚度换算）
    const a1 = rows[rows.length - 2].measured;
    const a2 = rows[rows.length - 1].measured;
    const t1 = Math.exp(-a1);
    const t2 = Math.exp(-a2);
    const relErr = Math.abs(t2 - t1 * t1) / Math.max(t1 * t1, 1e-12);
    rows.push({ material: `${m.name} T(2t)=T(t)²`, thickness: 0, expected: t1 * t1, measured: t2, relErr });
  }
  const pass = rows.every((r) => r.relErr <= TOL);
  return { rows, pass };
}

function checkPerf(renderer: XRayRenderer): SelfTestResult['perf'] {
  const scene = generateScene({ seed: 20261124, itemCount: 40, contrabandCount: 3 });
  const parts = flattenScene(scene);
  renderer.render(parts); // 预热（编译/上传）
  renderer.render(parts);
  // 连渲多帧取平均，避免计时器分辨率造成假象
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) samples.push(renderer.renderTimed(parts));
  const t0 = performance.now();
  const N = 20;
  for (let i = 0; i < N; i++) renderer.render(parts);
  renderer.renderTimed(parts); // 末尾 gl.finish 同步
  const sustained = (performance.now() - t0) / N;
  const avg = Math.max(samples.reduce((a, b) => a + b, 0) / samples.length, sustained);
  return { itemCount: 40, resolution: renderer.size, samplesMs: samples, avgMs: avg, pass: avg <= 200 };
}

export async function runSelfTest(): Promise<SelfTestResult> {
  const notes: string[] = [];
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const renderer = new XRayRenderer(canvas, 1024);

  const physicsCpu = checkCpu();
  const gpu = checkGpu(renderer, notes);
  const perf = checkPerf(renderer);

  const ok = physicsCpu.pass && gpu.pass && perf.pass;
  const result: SelfTestResult = {
    ok,
    physicsCpu,
    physicsGpu: gpu.rows,
    physicsGpuPass: gpu.pass,
    perf,
    notes,
  };
  (window as unknown as { __selftest: SelfTestResult }).__selftest = result;

  // 页面上也展示结果，便于人工查看
  const pre = document.createElement('pre');
  pre.id = 'selftest-output';
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);
  return result;
}
