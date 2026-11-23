/**
 * 主界面：出题 / 判图考试 / 错题回看 / 题库管理 四个模块。
 * 全部状态在内存 + localStorage，无后端。
 */
import { generateScene, flattenScene, type Scene } from '../scene';
import { XRayRenderer } from '../gl/renderer';
import {
  questionStore, attemptStore, uid,
  type QuestionRecord, type AttemptRecord,
} from '../store';

type ViewName = 'gen' | 'exam' | 'review' | 'bank';

const VIEW_TABS: { id: ViewName; label: string }[] = [
  { id: 'gen', label: '出题' },
  { id: 'exam', label: '判图考试' },
  { id: 'review', label: '错题回看' },
  { id: 'bank', label: '题库管理' },
];

interface GradeResult {
  hits: string[];
  missed: string[];
  falseAlarms: number;
  score: number;
}

/** 判分：标记落在违禁品包围盒（外扩3%）内算命中；盒外标记算误报 */
export function grade(scene: Scene, marks: [number, number][]): GradeResult {
  const cbs = scene.items.filter((i) => i.contraband && i.bbox);
  const EX = 0.03;
  const hitSet = new Set<string>();
  const used = new Set<number>();
  for (const item of cbs) {
    const [x0, y0, x1, y1] = item.bbox!;
    for (let mi = 0; mi < marks.length; mi++) {
      const [mx, my] = marks[mi];
      if (mx >= x0 - EX && mx <= x1 + EX && my >= y0 - EX && my <= y1 + EX) {
        hitSet.add(item.label);
        used.add(mi);
      }
    }
  }
  const hits = cbs.map((c) => c.label).filter((l) => hitSet.has(l));
  const missed = cbs.map((c) => c.label).filter((l) => !hitSet.has(l));
  const falseAlarms = marks.length - used.size;
  const score = cbs.length === 0
    ? (falseAlarms === 0 ? 100 : Math.max(0, 100 - 15 * falseAlarms))
    : Math.max(0, Math.round((100 * hits.length) / cbs.length - 15 * falseAlarms));
  return { hits, missed, falseAlarms, score };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, className?: string, text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { hour12: false });
}

export function startApp(root: HTMLElement): void {
  // 共享一个渲染器/画布，在各视图间移动，避免创建多个 WebGL 上下文
  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'xray-canvas';
  let renderer: XRayRenderer | null = null;
  const getRenderer = (): XRayRenderer => {
    if (!renderer) renderer = new XRayRenderer(glCanvas, 1024);
    return renderer;
  };

  const nav = el('nav', 'nav');
  const content = el('main', 'content');
  root.append(nav, content);

  let current: ViewName = 'gen';
  const render = () => {
    for (const btn of Array.from(nav.children)) {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.view === current);
    }
    content.textContent = '';
    if (current === 'gen') renderGen(content, getRenderer, glCanvas);
    else if (current === 'exam') renderExam(content, getRenderer, glCanvas);
    else if (current === 'review') renderReview(content, getRenderer, glCanvas);
    else renderBank(content, getRenderer, glCanvas, render);
  };

  for (const tab of VIEW_TABS) {
    const b = el('button', 'nav-btn', tab.label);
    b.dataset.view = tab.id;
    b.onclick = () => { current = tab.id; render(); };
    nav.appendChild(b);
  }
  render();
}

/** 画布 + 覆盖层（标记/答案框）组合 */
function makeStage(glCanvas: HTMLCanvasElement): {
  stage: HTMLDivElement;
  overlay: HTMLCanvasElement;
  redraw: (marks: [number, number][], scene: Scene | null, showAnswers: boolean) => void;
} {
  const stage = el('div', 'stage');
  const overlay = document.createElement('canvas');
  overlay.className = 'overlay';
  overlay.width = 1024;
  overlay.height = 1024;
  stage.append(glCanvas, overlay);

  const redraw = (
    marks: [number, number][], scene: Scene | null, showAnswers: boolean,
  ) => {
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, 1024, 1024);
    if (scene && showAnswers) {
      ctx.strokeStyle = '#22cc55';
      ctx.lineWidth = 3;
      for (const item of scene.items) {
        if (!item.contraband || !item.bbox) continue;
        const [x0, y0, x1, y1] = item.bbox;
        ctx.strokeRect(x0 * 1024, y0 * 1024, (x1 - x0) * 1024, (y1 - y0) * 1024);
        ctx.fillStyle = '#22cc55';
        ctx.font = '28px sans-serif';
        ctx.fillText(item.label, x0 * 1024 + 4, y0 * 1024 + 30);
      }
    }
    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 4;
    for (const [mx, my] of marks) {
      const x = mx * 1024, y = my * 1024;
      ctx.beginPath();
      ctx.moveTo(x - 14, y - 14); ctx.lineTo(x + 14, y + 14);
      ctx.moveTo(x + 14, y - 14); ctx.lineTo(x - 14, y + 14);
      ctx.stroke();
    }
  };
  return { stage, overlay, redraw };
}

function overlayClick(
  overlay: HTMLCanvasElement,
  marks: [number, number][],
  onChange: () => void,
): void {
  overlay.onclick = (ev) => {
    const rect = overlay.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    // 点击已有标记附近 → 删除该标记
    const near = marks.findIndex(
      ([mx, my]) => Math.hypot((mx - x) * rect.width, (my - y) * rect.height) < 16,
    );
    if (near >= 0) marks.splice(near, 1);
    else marks.push([x, y]);
    onChange();
  };
}

// ---------------- 出题 ----------------
function renderGen(
  root: HTMLElement,
  getRenderer: () => XRayRenderer,
  glCanvas: HTMLCanvasElement,
): void {
  const form = el('div', 'panel');
  form.append(el('h2', undefined, '出题（随机生成行李场景）'));

  const row1 = el('div', 'form-row');
  const itemInput = el('input') as HTMLInputElement;
  itemInput.type = 'number'; itemInput.value = '40'; itemInput.min = '5'; itemInput.max = '80';
  const cbInput = el('input') as HTMLInputElement;
  cbInput.type = 'number'; cbInput.value = '2'; cbInput.min = '0'; cbInput.max = '10';
  const seedInput = el('input') as HTMLInputElement;
  seedInput.type = 'number'; seedInput.value = String(Math.floor(Math.random() * 1e9));
  const seedBtn = el('button', 'btn', '随机种子');
  seedBtn.onclick = () => { seedInput.value = String(Math.floor(Math.random() * 1e9)); };
  row1.append(
    labeled('物品数量', itemInput),
    labeled('违禁品数量', cbInput),
    labeled('种子', seedInput),
    seedBtn,
  );
  form.appendChild(row1);

  const row2 = el('div', 'form-row');
  const genBtn = el('button', 'btn primary', '生成预览');
  const saveBtn = el('button', 'btn', '保存到题库');
  const answerToggle = el('input') as HTMLInputElement;
  answerToggle.type = 'checkbox';
  saveBtn.disabled = true;
  row2.append(genBtn, saveBtn, labeled('显示答案框', answerToggle));
  form.appendChild(row2);

  const info = el('div', 'info');
  form.appendChild(info);
  root.appendChild(form);

  const { stage, overlay, redraw } = makeStage(glCanvas);
  root.appendChild(stage);

  let scene: Scene | null = null;
  const refresh = () => redraw([], scene, answerToggle.checked);
  answerToggle.onchange = refresh;

  genBtn.onclick = () => {
    const params = {
      seed: Number(seedInput.value) || 1,
      itemCount: Math.max(5, Math.min(80, Number(itemInput.value) || 40)),
      contrabandCount: Math.max(0, Math.min(10, Number(cbInput.value) || 0)),
    };
    scene = generateScene(params);
    getRenderer().render(flattenScene(scene));
    const cbs = scene.items.filter((i) => i.contraband);
    info.textContent = `已生成 ${scene.items.length - 1} 件物品，藏入违禁品 ${cbs.length} 件：`
      + (cbs.map((c) => c.label).join('、') || '无');
    saveBtn.disabled = false;
    refresh();
  };

  saveBtn.onclick = () => {
    if (!scene) return;
    const rec: QuestionRecord = {
      id: uid(),
      createdAt: Date.now(),
      params: scene.params,
      contrabandLabels: scene.items.filter((i) => i.contraband).map((i) => i.label),
    };
    questionStore.add(rec);
    info.textContent = `已保存到题库（题号 ${rec.id}），当前题库共 ${questionStore.list().length} 题`;
  };
}

function labeled(label: string, input: HTMLElement): HTMLLabelElement {
  const l = el('label', 'field');
  l.append(el('span', undefined, label), input);
  return l;
}

// ---------------- 判图考试 ----------------
function renderExam(
  root: HTMLElement,
  getRenderer: () => XRayRenderer,
  glCanvas: HTMLCanvasElement,
): void {
  const panel = el('div', 'panel');
  panel.append(el('h2', undefined, '判图考试'));
  const startBtn = el('button', 'btn primary', '抽题开始');
  const submitBtn = el('button', 'btn', '交卷');
  const answerBtn = el('button', 'btn', '查看正确答案');
  const nextBtn = el('button', 'btn', '再抽一题');
  submitBtn.disabled = true;
  answerBtn.disabled = true;
  nextBtn.disabled = true;
  const info = el('div', 'info', '点击图像放置/取消标记，找出所有违禁品后交卷。');
  const row = el('div', 'form-row');
  row.append(startBtn, submitBtn, answerBtn, nextBtn);
  panel.append(row, info);
  root.appendChild(panel);

  const { stage, overlay, redraw } = makeStage(glCanvas);
  root.appendChild(stage);

  let scene: Scene | null = null;
  let question: QuestionRecord | null = null;
  let marks: [number, number][] = [];
  let showAnswers = false;
  let startTime = 0;

  const refresh = () => redraw(marks, scene, showAnswers);
  overlayClick(overlay, marks, refresh);

  const start = () => {
    const bank = questionStore.list();
    if (bank.length === 0) {
      info.textContent = '题库为空，请先到「出题」生成并保存题目。';
      return;
    }
    question = bank[Math.floor(Math.random() * bank.length)];
    scene = generateScene(question.params);
    marks = [];
    showAnswers = false;
    startTime = Date.now();
    getRenderer().render(flattenScene(scene));
    const nCb = scene.items.filter((i) => i.contraband).length;
    info.textContent = `考试开始（题号 ${question.id}）。箱中共有 ${nCb} 件违禁品，请在图上标记。`;
    submitBtn.disabled = false;
    answerBtn.disabled = true;
    nextBtn.disabled = true;
    refresh();
  };
  startBtn.onclick = start;
  nextBtn.onclick = start;

  submitBtn.onclick = () => {
    if (!scene || !question) return;
    const g = grade(scene, marks);
    const attempt: AttemptRecord = {
      id: uid(),
      questionId: question.id,
      ts: Date.now(),
      marks: marks.slice(),
      hits: g.hits,
      missed: g.missed,
      falseAlarms: g.falseAlarms,
      score: g.score,
    };
    attemptStore.add(attempt);
    const secs = Math.round((Date.now() - startTime) / 1000);
    info.textContent = `得分 ${g.score}（用时 ${secs}s）：命中 ${g.hits.length} 件`
      + (g.hits.length ? `（${g.hits.join('、')}）` : '')
      + `，漏报 ${g.missed.length} 件`
      + (g.missed.length ? `（${g.missed.join('、')}）` : '')
      + `，误报 ${g.falseAlarms} 处。`;
    submitBtn.disabled = true;
    answerBtn.disabled = false;
    nextBtn.disabled = false;
  };

  answerBtn.onclick = () => {
    showAnswers = !showAnswers;
    answerBtn.textContent = showAnswers ? '隐藏正确答案' : '查看正确答案';
    refresh();
  };
}

// ---------------- 错题回看 ----------------
function renderReview(
  root: HTMLElement,
  getRenderer: () => XRayRenderer,
  glCanvas: HTMLCanvasElement,
): void {
  const panel = el('div', 'panel');
  panel.append(el('h2', undefined, '错题回看'));
  root.appendChild(panel);

  const wrong = attemptStore.wrongList().sort((a, b) => b.ts - a.ts);
  if (wrong.length === 0) {
    panel.appendChild(el('div', 'info', '暂无错题记录。'));
    return;
  }
  const list = el('div', 'list');
  panel.appendChild(list);
  const detail = el('div');
  root.appendChild(detail);

  for (const a of wrong) {
    const row = el('div', 'list-row');
    row.append(
      el('span', undefined, fmtTime(a.ts)),
      el('span', undefined, `得分 ${a.score}`),
      el('span', undefined, `漏报 ${a.missed.length}（${a.missed.join('、') || '无'}）`),
      el('span', undefined, `误报 ${a.falseAlarms}`),
    );
    const viewBtn = el('button', 'btn small', '回看');
    viewBtn.onclick = () => {
      detail.textContent = '';
      const q = questionStore.get(a.questionId);
      if (!q) {
        detail.appendChild(el('div', 'info', '该题已从题库删除，无法复现图像。'));
        return;
      }
      const scene = generateScene(q.params);
      getRenderer().render(flattenScene(scene));
      const { stage, redraw } = makeStage(glCanvas);
      detail.appendChild(stage);
      redraw(a.marks, scene, true); // 绿框=正确答案，红叉=当时标记
      const legend = el('div', 'info',
        `绿框为违禁品标准答案（${a.missed.concat(a.hits).join('、') || '无'}），红叉为当时的标记。`);
      detail.appendChild(legend);
    };
    row.appendChild(viewBtn);
    list.appendChild(row);
  }
}

// ---------------- 题库管理 ----------------
function renderBank(
  root: HTMLElement,
  getRenderer: () => XRayRenderer,
  glCanvas: HTMLCanvasElement,
  rerender: () => void,
): void {
  const panel = el('div', 'panel');
  panel.append(el('h2', undefined, '题库管理'));

  const tools = el('div', 'form-row');
  const exportBtn = el('button', 'btn', '导出题库 (JSON)');
  const importLabel = el('label', 'btn', '导入题库');
  const importInput = el('input') as HTMLInputElement;
  importInput.type = 'file';
  importInput.accept = '.json';
  importInput.style.display = 'none';
  importLabel.appendChild(importInput);
  const clearBtn = el('button', 'btn danger', '清空题库');
  const info = el('span', 'info');
  tools.append(exportBtn, importLabel, clearBtn, info);
  panel.appendChild(tools);

  const questions = questionStore.list().sort((a, b) => b.createdAt - a.createdAt);
  info.textContent = `共 ${questions.length} 题`;

  exportBtn.onclick = () => {
    const blob = new Blob([questionStore.exportJson()], { type: 'application/json' });
    const a = el('a') as HTMLAnchorElement;
    a.href = URL.createObjectURL(blob);
    a.download = `xray-questions-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  importInput.onchange = async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const n = questionStore.importJson(await file.text());
      info.textContent = `导入成功，新增 ${n} 题`;
    } catch (e) {
      info.textContent = `导入失败：${(e as Error).message}`;
    }
    rerender();
  };
  clearBtn.onclick = () => {
    questionStore.clear();
    rerender();
  };

  const list = el('div', 'list');
  panel.appendChild(list);
  const preview = el('div');
  root.appendChild(preview);

  for (const q of questions) {
    const row = el('div', 'list-row');
    row.append(
      el('span', undefined, fmtTime(q.createdAt)),
      el('span', undefined, `${q.params.itemCount} 件物品`),
      el('span', undefined, `违禁品：${q.contrabandLabels.join('、') || '无'}`),
    );
    const previewBtn = el('button', 'btn small', '预览');
    previewBtn.onclick = () => {
      preview.textContent = '';
      const scene = generateScene(q.params);
      getRenderer().render(flattenScene(scene));
      const { stage, redraw } = makeStage(glCanvas);
      preview.appendChild(stage);
      redraw([], scene, true);
    };
    const delBtn = el('button', 'btn small danger', '删除');
    delBtn.onclick = () => {
      questionStore.remove(q.id);
      rerender();
    };
    row.append(previewBtn, delBtn);
    list.appendChild(row);
  }
  root.insertBefore(panel, root.firstChild);
}
