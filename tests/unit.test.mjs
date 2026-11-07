/** 纯逻辑单元测试：node --test tests/unit.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../src/utils.js';
import * as L from '../src/logic.js';

// 在导入 store 之前注入内存版 localStorage，模拟浏览器存储
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const store = await import('../src/store.js');

const today = u.todayKey();
const d = (n) => u.addDays(today, n);

/* ------------------------------ 日期与校验 ------------------------------ */
test('日期解析：拒绝不存在的日期，接受闰年', () => {
  assert.equal(u.parseDateKey('2026-02-30'), null);
  assert.equal(u.parseDateKey('2026-13-01'), null);
  assert.ok(u.parseDateKey('2024-02-29'));
  assert.equal(u.isValidDateKey('2026-02-30'), false);
});

test('日期加减与差值跨月正确', () => {
  assert.equal(u.addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(u.diffDays('2026-10-31', '2026-11-01'), 1);
  assert.equal(u.diffDays(d(-7), today), 7);
});

test('周一为一周起点', () => {
  assert.equal(u.weekStartKey('2026-11-07'), '2026-11-02'); // 周六 -> 周一
});

test('输入校验：体重 / 热量 / 目标 / 身高 / 记录日期', () => {
  assert.equal(u.validateWeight('68.45'), 68.5);
  assert.equal(u.validateWeight('999'), null);
  assert.equal(u.validateWeight('abc'), null);
  assert.equal(u.validateCalories('140'), 140);
  assert.equal(u.validateCalories('-1'), null);
  assert.equal(u.validateGoal(''), null);
  assert.equal(u.validateGoal('1800'), 1800);
  assert.equal(u.validateGoal('abc'), undefined);
  assert.equal(u.validateRecordDate(d(1)), null, '不允许未来日期');
  assert.equal(u.validateRecordDate(today), today);
  assert.equal(u.validatePlanDate(d(30)), d(30), '计划日期允许未来');
});

test('HTML 转义防止记录内容注入', () => {
  assert.equal(u.escapeHtml('<img src=x onerror=1>'), '&lt;img src=x onerror=1&gt;');
});

/* ------------------------------ 数据层 ------------------------------ */
test('全新状态为空，不产生任何虚构数据', () => {
  mem.clear();
  store.resetCache();
  const s = store.state();
  assert.deepEqual(s.weights, []);
  assert.deepEqual(s.meals, []);
  assert.equal(s.settings.dailyCalorieGoal, null);
});

test('设置计划并持久化；模拟刷新后仍然存在', () => {
  mem.clear(); store.resetCache();
  store.saveSettings({ initialWeight: 72, targetWeight: 62, dailyCalorieGoal: 1800, height: 170, startDate: d(-30), targetDate: d(60) });
  store.resetCache(); // 相当于刷新页面
  assert.equal(store.state().settings.initialWeight, 72);
  assert.equal(store.state().settings.dailyCalorieGoal, 1800);
  assert.equal(store.state().settings.targetDate, d(60));
});

test('同一天重复记录体重会更新而不是新增', () => {
  mem.clear(); store.resetCache();
  const a = store.upsertWeight({ date: today, weight: 70, note: '晨起' });
  assert.equal(a.mode, 'create');
  const b = store.upsertWeight({ date: today, weight: 69.6 });
  assert.equal(b.mode, 'update');
  assert.equal(b.record.id, a.record.id);
  assert.equal(store.state().weights.length, 1);
  assert.equal(store.state().weights[0].weight, 69.6);
});

test('修改体重记录时日期冲突会被拒绝', () => {
  mem.clear(); store.resetCache();
  const a = store.upsertWeight({ date: d(-2), weight: 71 });
  const b = store.upsertWeight({ date: d(-1), weight: 70 });
  const conflict = store.upsertWeight({ id: a.record.id, date: d(-1), weight: 70.5, note: '' });
  assert.equal(conflict.ok, false);
  assert.equal(store.state().weights.length, 2);
  assert.ok(b.record.id);
});

test('体重删除后统计同步变化', () => {
  mem.clear(); store.resetCache();
  const a = store.upsertWeight({ date: d(-3), weight: 72 });
  store.upsertWeight({ date: today, weight: 70 });
  assert.equal(L.planStats(store.state()).cur, 70);
  store.removeWeight(a.record.id);
  assert.equal(store.state().weights.length, 1);
  assert.equal(L.latestWeight(store.state()).weight, 70);
});

test('饮食 CRUD 与当天热量实时汇总', () => {
  mem.clear(); store.resetCache();
  const a = store.upsertMeal({ date: today, time: '08:00', name: '鸡蛋', calories: 140, category: 'breakfast', note: '' });
  const b = store.upsertMeal({ date: today, time: '08:10', name: '牛奶', calories: 150, category: 'breakfast', note: '' });
  store.upsertMeal({ date: today, time: '12:00', name: '米饭', calories: 250, category: 'lunch', note: '' });
  store.upsertMeal({ date: today, time: '12:05', name: '鸡胸肉', calories: 200, category: 'lunch', note: '' });
  store.upsertMeal({ date: today, time: '18:00', name: '面条', calories: 400, category: 'dinner', note: '' });
  const snack = store.upsertMeal({ date: today, time: '15:00', name: '苹果', calories: 80, category: 'snack', note: '' });

  assert.equal(L.dayCalories(store.state(), today), 1220);
  const totals = L.mealTotals(store.state(), today);
  assert.equal(totals.breakfast.total, 290);
  assert.equal(totals.lunch.total, 450);
  assert.equal(totals.dinner.total, 400);
  assert.equal(totals.snack.total, 80);

  store.upsertMeal({ id: a.record.id, date: today, time: '08:00', name: '鸡蛋', calories: 200, category: 'breakfast', note: '' });
  assert.equal(L.dayCalories(store.state(), today), 1280, '修改后同步重算');
  store.removeMeal(snack.record.id);
  assert.equal(L.dayCalories(store.state(), today), 1200, '删除后同步重算');
  assert.ok(b.record.id);
});

test('导出 / 恢复 / 清空，且升级 normalize 不丢记录', () => {
  mem.clear(); store.resetCache();
  store.saveSettings({ initialWeight: 72, targetWeight: 62 });
  store.upsertWeight({ date: d(-1), weight: 71 });
  store.upsertMeal({ date: d(-1), time: '09:00', name: '燕麦', calories: 300, category: 'breakfast', note: '' });

  const backup = store.exportData();
  assert.equal(backup.app, '轻衡');
  assert.equal(backup.weights.length, 1);
  assert.equal(backup.meals.length, 1);

  store.clearAll();
  assert.equal(store.state().weights.length, 0);
  const restored = store.importData(backup);
  assert.equal(restored.weights.length, 1);
  assert.equal(restored.meals[0].name, '燕麦');
  store.resetCache();
  assert.equal(store.state().settings.targetWeight, 62, '刷新后恢复的数据仍在');

  assert.throws(() => store.importData({ hello: 1 }), /不是有效的轻衡备份/);

  // 模拟未来版本字段：未知字段保留、已有记录不丢
  const upgraded = store.normalize({ ...backup, settings: { ...backup.settings, futureSetting: 'keep-me' }, newField: 42 });
  assert.equal(upgraded.weights.length, 1);
  assert.equal(upgraded.settings.futureSetting, 'keep-me');
});

test('损坏的 JSON 不会清空原始存储内容', () => {
  mem.clear(); store.resetCache();
  mem.set(store.STORAGE_KEY, '{ this is broken');
  store.resetCache();
  assert.deepEqual(store.state().weights, []);
  assert.equal(mem.get(store.STORAGE_KEY), '{ this is broken');
});

/* ------------------------------ 统计逻辑 ------------------------------ */
test('减重进度只基于真实记录', () => {
  const s = {
    settings: { initialWeight: 72, targetWeight: 62, startDate: d(-30), targetDate: d(60), dailyCalorieGoal: null, height: null },
    weights: [{ id: '1', date: d(-2), weight: 71 }, { id: '2', date: today, weight: 68.4 }],
    meals: [],
  };
  const p = L.planStats(s);
  assert.equal(p.total, 10);
  assert.equal(p.lost, 3.6);
  assert.equal(p.remaining, 6.4);
  assert.equal(p.progress, 36);
  assert.equal(p.daysLeft, 60);
  assert.equal(L.weightDelta(s), -2.6);
  const ms = L.milestones(s);
  assert.equal(ms.length, 4);
  assert.equal(ms[0].reached, true);
  assert.equal(ms[2].reached, false);
});

test('未设置完整计划时进度为 null，不臆造数字', () => {
  const p = L.planStats({ settings: { initialWeight: null, targetWeight: null }, weights: [], meals: [] });
  assert.equal(p.progress, null);
  assert.equal(p.total, null);
  assert.deepEqual(L.milestones({ settings: p, weights: [], meals: [] }), []);
});

test('体重序列只取真实记录，热量序列区分「无记录」', () => {
  const s = {
    settings: {},
    weights: [{ id: '1', date: d(-10), weight: 72 }, { id: '2', date: d(-2), weight: 71 }, { id: '3', date: today, weight: 70 }],
    meals: [{ id: 'm', date: d(-2), time: '', name: 'x', calories: 500, category: 'lunch', note: '' }],
  };
  assert.equal(L.weightSeries(s, 7).length, 2);
  assert.equal(L.weightSeries(s, 30).length, 3);
  assert.equal(L.weightSeries(s, 'all').length, 3);
  const series = L.calorieSeries(s, 7, today);
  assert.equal(series.length, 7);
  assert.equal(series[series.length - 1].hasRecord, false);
  assert.equal(series[series.length - 3].value, 500);
});

test('周平均按有记录天数计算，BMI 需身高与体重', () => {
  const s = {
    settings: {},
    weights: [{ id: '1', date: today, weight: 70 }],
    meals: [
      { id: 'a', date: today, time: '', name: 'x', calories: 1000, category: 'lunch', note: '' },
      { id: 'b', date: d(-1), time: '', name: 'y', calories: 2000, category: 'lunch', note: '' },
    ],
  };
  const weeks = L.weeklyAverages(s, 2);
  const thisWeek = weeks[weeks.length - 1];
  assert.ok(thisWeek.dayCount >= 1);
  assert.ok(thisWeek.avg > 0);
  assert.equal(L.bmiInfo(170, 70).value, 24.2);
  assert.equal(L.bmiInfo(null, 70), null);
});

test('历史明细按日期对齐体重与热量', () => {
  const s = {
    settings: {},
    weights: [{ id: '1', date: d(-1), weight: 71 }],
    meals: [{ id: 'm', date: d(-1), time: '', name: 'x', calories: 900, category: 'dinner', note: '' }],
  };
  const rows = L.historyRows(s);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].weight, 71);
  assert.equal(rows[0].calories, 900);
  assert.equal(rows[0].mealCount, 1);
});
