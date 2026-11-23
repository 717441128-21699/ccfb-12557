/** 题库与考试记录持久化（localStorage） */
import type { SceneParams } from './scene';

export interface QuestionRecord {
  id: string;
  createdAt: number;
  params: SceneParams;
  contrabandLabels: string[];
}

export interface AttemptRecord {
  id: string;
  questionId: string;
  ts: number;
  marks: [number, number][];
  hits: string[];        // 命中的违禁品标签
  missed: string[];      // 漏掉的违禁品标签
  falseAlarms: number;   // 误报标记数
  score: number;         // 0-100
}

const Q_KEY = 'xray.questions.v1';
const A_KEY = 'xray.attempts.v1';

function load<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, rows: T[]): void {
  localStorage.setItem(key, JSON.stringify(rows));
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const questionStore = {
  list(): QuestionRecord[] { return load<QuestionRecord>(Q_KEY); },
  get(id: string): QuestionRecord | undefined { return this.list().find((q) => q.id === id); },
  add(q: QuestionRecord): void { save(Q_KEY, [...this.list(), q]); },
  remove(id: string): void { save(Q_KEY, this.list().filter((q) => q.id !== id)); },
  clear(): void { save(Q_KEY, []); },
  exportJson(): string { return JSON.stringify(this.list(), null, 2); },
  importJson(json: string): number {
    const rows = JSON.parse(json) as QuestionRecord[];
    if (!Array.isArray(rows)) throw new Error('格式错误：应为题目数组');
    const existing = new Set(this.list().map((q) => q.id));
    const fresh = rows.filter((q) => q && q.id && q.params && !existing.has(q.id));
    save(Q_KEY, [...this.list(), ...fresh]);
    return fresh.length;
  },
};

export const attemptStore = {
  list(): AttemptRecord[] { return load<AttemptRecord>(A_KEY); },
  add(a: AttemptRecord): void { save(A_KEY, [...this.list(), a]); },
  remove(id: string): void { save(A_KEY, this.list().filter((a) => a.id !== id)); },
  wrongList(): AttemptRecord[] {
    return this.list().filter((a) => a.missed.length > 0 || a.falseAlarms > 0);
  },
};
