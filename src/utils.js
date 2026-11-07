/**
 * 通用工具：日期、数值、格式化、校验。
 * 全部为纯函数（不触碰 DOM / localStorage），可在 Node 中直接单元测试。
 */

export const pad2 = (n) => String(n).padStart(2, '0');

export function toDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayKey() {
  return toDateKey(new Date());
}

export function nowTime() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 严格解析 YYYY-MM-DD，拒绝 2026-02-30 这类不存在的日期 */
export function parseDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function isValidDateKey(key) {
  return !!parseDateKey(key) && key >= '2000-01-01' && key <= '2100-12-31';
}

export function addDays(key, n) {
  const d = parseDateKey(key) || new Date();
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

/** 返回 to - from 的自然日差值 */
export function diffDays(from, to) {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** 所在周的周一（周一为一周起点） */
export function weekStartKey(key) {
  const d = parseDateKey(key) || new Date();
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return toDateKey(d);
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayCN(key) {
  const d = parseDateKey(key);
  return d ? WEEKDAYS[d.getDay()] : '';
}

export function formatDateCN(key) {
  const d = parseDateKey(key);
  return d ? `${d.getMonth() + 1}月${d.getDate()}日` : (key || '');
}

export function formatDateFull(key) {
  const d = parseDateKey(key);
  return d ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : (key || '');
}

export function formatShort(key) {
  const d = parseDateKey(key);
  return d ? `${d.getMonth() + 1}/${d.getDate()}` : (key || '');
}

export function relativeDay(key) {
  const today = todayKey();
  if (key === today) return '今天';
  if (key === addDays(today, -1)) return '昨天';
  return formatDateCN(key);
}

export function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (c) => map[c]);
}

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

export function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function round1(v) {
  return Math.round(v * 10) / 10;
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function fmtNum(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('zh-CN');
}

export function trimText(v, max = 200) {
  return String(v ?? '').trim().slice(0, max);
}

export function uid() {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- 输入校验：非法一律返回 null，由视图提示用户 ---------- */

export function validateWeight(v) {
  const n = num(v);
  return n === null || n < 20 || n > 400 ? null : round1(n);
}

export function validateCalories(v) {
  const n = num(v);
  return n === null || n < 0 || n > 20000 ? null : Math.round(n);
}

export function validateGoal(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = num(v);
  return n === null || n < 1 || n > 20000 ? undefined : Math.round(n); // undefined = 输入非法
}

export function validateHeight(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = num(v);
  return n === null || n < 80 || n > 250 ? undefined : round1(n);
}

export function validateTime(v) {
  if (!v) return nowTime();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
}

/** 记录日期：必须是真实日期且不能是未来 */
export function validateRecordDate(v) {
  const key = v || todayKey();
  return isValidDateKey(key) && key <= todayKey() ? key : null;
}

/** 计划日期：允许未来，但仍必须是真实日期 */
export function validatePlanDate(v) {
  if (!v) return null;
  return isValidDateKey(v) ? v : undefined;
}

/** 浏览器端下载 JSON 文件 */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
