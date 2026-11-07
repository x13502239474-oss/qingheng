/**
 * 统计与派生数据：全部为纯函数，不修改入参。
 * 只呈现真实记录，不推断脂肪变化 / 热量缺口，不补齐缺失日期。
 */
import {
  todayKey, addDays, diffDays, weekStartKey, formatShort, relativeDay,
  toDateKey, pad2, isNum, round1, clamp, isValidDateKey,
} from './utils.js';

export const MEAL_CATEGORIES = [
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'snack', label: '加餐' },
];

export function categoryLabel(key) {
  const found = MEAL_CATEGORIES.find((c) => c.key === key);
  return found ? found.label : '加餐';
}

export function sortedWeights(s, order = 'asc') {
  const list = [...(s.weights || [])].sort(
    (a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  );
  return order === 'desc' ? list.reverse() : list;
}

export function latestWeight(s) {
  return sortedWeights(s, 'desc')[0] || null;
}

export function previousWeight(s) {
  return sortedWeights(s, 'desc')[1] || null;
}

export function currentWeight(s) {
  const w = latestWeight(s);
  return w ? w.weight : null;
}

/** 最新体重 - 上一次体重；正数代表上升，负数代表下降 */
export function weightDelta(s) {
  const a = latestWeight(s);
  const b = previousWeight(s);
  return a && b ? round1(a.weight - b.weight) : null;
}

/** 减重计划的全部派生指标；未设置完整时对应字段为 null */
export function planStats(s) {
  const st = s.settings || {};
  const initial = isNum(st.initialWeight) ? st.initialWeight : null;
  const target = isNum(st.targetWeight) ? st.targetWeight : null;
  const cur = currentWeight(s);
  const total = initial !== null && target !== null && initial > target ? round1(initial - target) : null;
  const lost = initial !== null && cur !== null ? round1(initial - cur) : null;
  const remaining = cur !== null && target !== null ? round1(cur - target) : null;
  const progress = total !== null && lost !== null ? clamp(Math.round((lost / total) * 100), 0, 100) : null;
  const daysLeft = isValidDateKey(st.targetDate || '') ? diffDays(todayKey(), st.targetDate) : null;
  const started = isValidDateKey(st.startDate || '') ? st.startDate : null;
  return { initial, target, cur, total, lost, remaining, progress, daysLeft, started, valid: total !== null };
}

/** 按 25% / 50% / 75% / 100% 生成里程碑，不推算减重速度 */
export function milestones(s) {
  const { total, lost } = planStats(s);
  if (total === null) return [];
  const names = ['起步', '过半', '冲刺', '达成'];
  return [0.25, 0.5, 0.75, 1].map((p, i) => {
    const target = round1(total * p);
    return {
      name: names[i],
      percent: Math.round(p * 100),
      target,
      reached: lost !== null && lost >= target,
    };
  });
}

export function dayMeals(s, date) {
  return (s.meals || [])
    .filter((m) => m.date === date)
    .sort((a, b) =>
      String(a.time || '').localeCompare(String(b.time || '')) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    );
}

export function dayCalories(s, date) {
  return dayMeals(s, date).reduce((sum, m) => sum + (isNum(m.calories) ? m.calories : 0), 0);
}

export function mealTotals(s, date) {
  const out = {};
  for (const c of MEAL_CATEGORIES) out[c.key] = { total: 0, count: 0 };
  for (const m of dayMeals(s, date)) {
    const bucket = out[m.category] || out.snack;
    bucket.total += isNum(m.calories) ? m.calories : 0;
    bucket.count += 1;
  }
  return out;
}

export function hasDayRecord(s, date) {
  return (s.weights || []).some((w) => w.date === date) || (s.meals || []).some((m) => m.date === date);
}

/** 连续 N 天的每日热量；hasRecord 区分「没记录」与「记录了 0 kcal」 */
export function calorieSeries(s, days, endDate = todayKey()) {
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDays(endDate, -i);
    const meals = dayMeals(s, date);
    out.push({
      date,
      value: meals.reduce((sum, m) => sum + (isNum(m.calories) ? m.calories : 0), 0),
      hasRecord: meals.length > 0,
    });
  }
  return out;
}

/** 体重折线点：7 / 30 / 90 / all，仅取真实记录 */
export function weightSeries(s, range) {
  const all = sortedWeights(s).map((w) => ({ date: w.date, value: w.weight }));
  if (range === 'all' || range === '全部') return all;
  const n = Number(range);
  if (!Number.isFinite(n) || n <= 0) return all;
  const from = addDays(todayKey(), -(n - 1));
  return all.filter((p) => p.date >= from);
}

/** 最近若干周的有记录日均热量（按有记录天数平均，不按 7 天摊薄） */
export function weeklyAverages(s, weeks = 6) {
  const byWeek = new Map();
  for (const m of s.meals || []) {
    const wk = weekStartKey(m.date);
    if (!byWeek.has(wk)) byWeek.set(wk, new Map());
    const days = byWeek.get(wk);
    days.set(m.date, (days.get(m.date) || 0) + (isNum(m.calories) ? m.calories : 0));
  }
  const currentWeek = weekStartKey(todayKey());
  const out = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const week = addDays(currentWeek, -7 * i);
    const days = byWeek.get(week);
    const dayCount = days ? days.size : 0;
    const sum = days ? [...days.values()].reduce((a, b) => a + b, 0) : 0;
    out.push({
      week,
      label: `${formatShort(week)} 起`,
      dayCount,
      sum,
      avg: dayCount ? Math.round(sum / dayCount) : null,
    });
  }
  return out;
}

/** BMI 仅为一般参考指标，不做任何诊断分级 */
export function bmiInfo(height, weight) {
  if (!isNum(height) || !isNum(weight) || height <= 0 || weight <= 0) return null;
  const m = height / 100;
  return { value: round1(weight / (m * m)) };
}

/** 最近一次写入（体重或饮食）的可读时间 */
export function lastRecordTime(s) {
  const items = [...(s.weights || []), ...(s.meals || [])]
    .map((r) => r.updatedAt || r.createdAt)
    .filter(Boolean)
    .sort()
    .reverse();
  if (!items.length) return null;
  const d = new Date(items[0]);
  if (Number.isNaN(d.getTime())) return null;
  const key = toDateKey(d);
  return { at: items[0], date: key, label: `${relativeDay(key)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}

/** 历史页每日汇总：体重与热量按同一日期对齐 */
export function historyRows(s, limit = 90) {
  const dates = new Set([
    ...(s.weights || []).map((w) => w.date),
    ...(s.meals || []).map((m) => m.date),
  ]);
  return [...dates]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit)
    .map((date) => {
      const w = (s.weights || []).find((x) => x.date === date);
      const meals = dayMeals(s, date);
      return {
        date,
        weight: w ? w.weight : null,
        calories: meals.reduce((sum, m) => sum + (isNum(m.calories) ? m.calories : 0), 0),
        mealCount: meals.length,
        hasMeals: meals.length > 0,
      };
    });
}
