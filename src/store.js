/**
 * 本地数据层：唯一数据源是浏览器 localStorage。
 *
 * 稳定性约定（重要）：
 *  - 主键名 qingheng.data.v1 永不随版本/代码改动而改名，保证升级不清空历史记录。
 *  - 读取时按「补默认值 + 保留未知字段」的方式 normalize，绝不因为字段变化丢弃已有记录。
 *  - 提供内存存储兜底：隐私模式 / localStorage 被禁用时仍可临时使用。
 */
import { uid, isNum, trimText } from './utils.js';

export const STORAGE_KEY = 'qingheng.data.v1';
const LEGACY_KEYS = ['qingheng.health.v1'];
export const SCHEMA = 1;

function defaults() {
  return {
    schema: SCHEMA,
    settings: {
      initialWeight: null,
      targetWeight: null,
      startDate: null,
      targetDate: null,
      dailyCalorieGoal: null,
      height: null,
    },
    weights: [],
    meals: [],
  };
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

let memoryStorage = null;
let storage = null;

function getStorage() {
  if (storage) return storage;
  try {
    const ls = globalThis.localStorage;
    if (ls) {
      const probe = '__qingheng_probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      storage = ls;
      return storage;
    }
  } catch { /* 被禁用时回退到内存存储 */ }
  memoryStorage = memoryStorage || createMemoryStorage();
  storage = memoryStorage;
  return storage;
}

function safeNum(v) {
  return isNum(v) ? v : null;
}

function safeStr(v, max = 300) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];

function sanitizeWeight(w) {
  if (!w || typeof w !== 'object' || !DATE_RE.test(w.date || '')) return null;
  const weight = safeNum(w.weight);
  if (weight === null || weight <= 0) return null;
  return {
    id: safeStr(w.id, 60) || uid(),
    date: w.date,
    weight,
    note: safeStr(w.note, 200),
    createdAt: safeStr(w.createdAt, 40),
    updatedAt: safeStr(w.updatedAt, 40),
  };
}

function sanitizeMeal(m) {
  if (!m || typeof m !== 'object' || !DATE_RE.test(m.date || '')) return null;
  const calories = safeNum(m.calories);
  if (calories === null || calories < 0) return null;
  return {
    id: safeStr(m.id, 60) || uid(),
    date: m.date,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time || '') ? m.time : '',
    name: safeStr(m.name, 60) || '未命名食物',
    calories,
    category: MEAL_KEYS.includes(m.category) ? m.category : 'snack',
    note: safeStr(m.note, 200),
    createdAt: safeStr(m.createdAt, 40),
    updatedAt: safeStr(m.updatedAt, 40),
  };
}

/** 同一天只保留一条体重记录（保留最后更新的那条），避免重复数据 */
function dedupeWeights(list) {
  const byDate = new Map();
  for (const w of list) {
    const prev = byDate.get(w.date);
    if (!prev || String(w.updatedAt || '') > String(prev.updatedAt || '')) byDate.set(w.date, w);
  }
  return [...byDate.values()];
}

/** 兼容旧版 / 未来版本的数据：只补齐缺失项，绝不删除已有记录 */
export function normalize(raw) {
  const base = defaults();
  if (!raw || typeof raw !== 'object') return base;

  const srcSettings = raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : {};
  for (const k of ['initialWeight', 'targetWeight', 'dailyCalorieGoal', 'height']) {
    if (k in srcSettings) srcSettings[k] = safeNum(srcSettings[k]);
  }
  for (const k of ['startDate', 'targetDate']) {
    if (k in srcSettings) srcSettings[k] = DATE_RE.test(srcSettings[k] || '') ? srcSettings[k] : null;
  }
  base.settings = { ...base.settings, ...srcSettings };
  base.weights = dedupeWeights(
    (Array.isArray(raw.weights) ? raw.weights : []).map(sanitizeWeight).filter(Boolean),
  );
  base.meals = (Array.isArray(raw.meals) ? raw.meals : []).map(sanitizeMeal).filter(Boolean);
  return base;
}

let cache = null;

export function state() {
  if (cache) return cache;
  const ls = getStorage();
  let raw = ls.getItem(STORAGE_KEY);
  if (!raw) {
    for (const legacy of LEGACY_KEYS) {
      raw = ls.getItem(legacy);
      if (raw) break;
    }
  }
  try {
    cache = raw ? normalize(JSON.parse(raw)) : defaults();
  } catch {
    cache = defaults(); // JSON 损坏时也不覆盖原始字符串，等下次成功写入
  }
  return cache;
}

export function commit() {
  const ls = getStorage();
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(cache));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : '本地存储不可用' };
  }
}

/** 跨标签页同步 / 单元测试使用 */
export function resetCache() {
  cache = null;
}

function finish(result) {
  const saved = commit();
  if (saved.ok) return result;
  return { ok: false, error: `本地存储写入失败，记录未保存：${saved.error}` };
}

/* ------------------------------ 体重记录 ------------------------------ */

/**
 * 新增或修改体重。
 * 同一天再次记录时：自动更新当天已有记录（不产生重复数据）。
 * 修改记录时若把日期改到另一条记录所在的日期：拒绝并提示。
 */
export function upsertWeight({ id = null, date, weight, note = '' }) {
  const s = state();
  const existing = id
    ? s.weights.find((w) => w.id === id)
    : s.weights.find((w) => w.date === date);
  const now = new Date().toISOString();

  if (existing) {
    if (id && date !== existing.date && s.weights.some((w) => w.date === date && w.id !== id)) {
      return { ok: false, error: `${date} 已有体重记录，请先修改或删除那条记录` };
    }
    Object.assign(existing, { date, weight, note: trimText(note, 200), updatedAt: now });
    return finish({ ok: true, mode: 'update', record: existing });
  }

  const record = {
    id: uid(), date, weight, note: trimText(note, 200), createdAt: now, updatedAt: now,
  };
  s.weights.push(record);
  return finish({ ok: true, mode: 'create', record });
}

export function removeWeight(id) {
  const s = state();
  const i = s.weights.findIndex((w) => w.id === id);
  if (i < 0) return { ok: false, error: '记录不存在' };
  s.weights.splice(i, 1);
  return finish({ ok: true });
}

/* ------------------------------ 饮食记录 ------------------------------ */

export function upsertMeal({ id = null, date, time, name, calories, category, note = '' }) {
  const s = state();
  const now = new Date().toISOString();
  const payload = {
    date, time, name: trimText(name, 60), calories,
    category, note: trimText(note, 200), updatedAt: now,
  };

  if (id) {
    const record = s.meals.find((m) => m.id === id);
    if (!record) return { ok: false, error: '记录不存在，可能已被删除' };
    Object.assign(record, payload);
    return finish({ ok: true, mode: 'update', record });
  }

  const record = { id: uid(), createdAt: now, ...payload };
  s.meals.push(record);
  return finish({ ok: true, mode: 'create', record });
}

export function removeMeal(id) {
  const s = state();
  const i = s.meals.findIndex((m) => m.id === id);
  if (i < 0) return { ok: false, error: '记录不存在' };
  s.meals.splice(i, 1);
  return finish({ ok: true });
}

/* ------------------------------ 设置 ------------------------------ */

export function saveSettings(patch) {
  Object.assign(state().settings, patch);
  return finish({ ok: true });
}

/* ------------------------------ 备份 / 恢复 / 清空 ------------------------------ */

export function exportData() {
  const s = state();
  return {
    app: '轻衡',
    schema: SCHEMA,
    exportedAt: new Date().toISOString(),
    settings: { ...s.settings },
    weights: s.weights.map((w) => ({ ...w })),
    meals: s.meals.map((m) => ({ ...m })),
  };
}

export function importData(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.weights) || !Array.isArray(payload.meals)) {
    throw new Error('不是有效的轻衡备份文件（缺少 weights / meals 数据）');
  }
  const next = normalize(payload);
  cache = next;
  const saved = commit();
  if (!saved.ok) throw new Error(`恢复失败：${saved.error}`);
  return next;
}

export function clearAll() {
  cache = defaults();
  const saved = commit();
  if (!saved.ok) throw new Error(`清空失败：${saved.error}`);
  return cache;
}
