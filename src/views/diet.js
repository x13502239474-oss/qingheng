/** 饮食页：按日期记录、按餐次汇总、连续添加、每日热量趋势 */
import { state, upsertMeal, removeMeal } from '../store.js';
import { bus } from '../bus.js';
import { ui } from '../ui-state.js';
import {
  todayKey, addDays, formatDateCN, weekdayCN, relativeDay, nowTime, escapeHtml,
  fmtInt, trimText, isNum, validateCalories, validateRecordDate, validateTime,
} from '../utils.js';
import {
  MEAL_CATEGORIES, categoryLabel, dayMeals, dayCalories, mealTotals, calorieSeries,
} from '../logic.js';
import { barChart } from '../charts.js';
import { toast, confirmDialog, icon } from '../ui.js';
import {
  pageHead, segmented, categoryChips, progressBar, emptyState, rowActions, disclaimer,
} from './shared.js';

const RANGES = [{ value: 7, label: '7 天' }, { value: 30, label: '30 天' }];

export function render() {
  const s = state();
  const date = ui.dietDate;
  const today = todayKey();
  const goal = isNum(s.settings.dailyCalorieGoal) ? s.settings.dailyCalorieGoal : null;
  const meals = dayMeals(s, date);
  const total = dayCalories(s, date);
  const totals = mealTotals(s, date);
  const pct = goal ? Math.round((total / goal) * 100) : null;
  const editing = !!ui.editMealId;
  const draft = ui.mealDraft;
  const series = calorieSeries(s, ui.calorieRange, today);

  const groups = MEAL_CATEGORIES.map((c) => {
    const items = meals.filter((m) => m.category === c.key);
    if (!items.length) return '';
    return `<div class="group-head">${c.label}<span>${fmtInt(totals[c.key].total)} kcal · ${items.length} 条</span></div>
      ${items.map((m) => `<div class="data-row">
        <div class="row-main">
          <div class="row-title">${escapeHtml(m.name)}</div>
          <div class="row-meta">${m.time ? `${escapeHtml(m.time)} · ` : ''}${escapeHtml(categoryLabel(m.category))}${m.note ? ` · ${escapeHtml(m.note)}` : ''}</div>
        </div>
        <div class="row-value">${fmtInt(m.calories)}<small>kcal</small></div>
        ${rowActions('edit-meal', 'delete-meal', m.id, `修改 ${m.name}`, `删除 ${m.name}`)}
      </div>`).join('')}`;
  }).join('');

  const goalBlock = goal
    ? `<div class="kv"><span>每日目标</span><strong>${fmtInt(goal)} kcal</strong></div>
       <div class="kv"><span>${total <= goal ? '剩余热量' : '超出目标'}</span><strong>${fmtInt(Math.abs(goal - total))} kcal</strong></div>
       <div class="kv"><span>完成比例</span><strong>${pct}%</strong></div>
       ${progressBar(pct, { tone: 'warm', label: '当日热量完成比例' })}`
    : `<div class="summary-goal is-empty">尚未设置每日热量目标，这里只显示实际摄入量，不会替你假定一个数字。<br /><button type="button" class="inline-link" data-nav="goal">设置每日热量目标</button></div>`;

  return `
    ${pageHead({ eyebrow: 'DIET & CALORIES', title: '饮食记录', desc: '热量由你自己填写；保存后立即汇总到当天，连续添加不必重新选餐次。' })}

    <div class="date-bar">
      <button type="button" class="icon-btn" data-action="diet-prev" aria-label="前一天">${icon('left', 20)}</button>
      <div class="date-center">
        <input type="date" id="diet-date" max="${today}" value="${escapeHtml(date)}" aria-label="查看日期" />
        <span class="date-sub">${relativeDay(date)} · ${weekdayCN(date)}</span>
      </div>
      <button type="button" class="icon-btn" data-action="diet-next" aria-label="后一天" ${date >= today ? 'disabled' : ''}>${icon('right', 20)}</button>
      <button type="button" class="text-btn" data-action="diet-today" ${date === today ? 'disabled' : ''}>今天</button>
    </div>

    <section class="panel" aria-labelledby="diet-summary-title">
      <div class="panel-head"><h2 id="diet-summary-title">${date === today ? '今日' : formatDateCN(date)}热量</h2><span class="muted">${meals.length} 条记录</span></div>
      <div class="summary">
        <div>
          <div class="summary-label">总摄入</div>
          <div class="summary-value">${fmtInt(total)}<span>kcal</span></div>
          <p class="hint" style="margin-top:10px">按当天所有餐次自动合计，修改或删除后会实时重算。</p>
        </div>
        <div class="summary-goal ${goal ? '' : 'is-empty'}">${goalBlock}</div>
      </div>
      <div class="meal-strip">
        ${MEAL_CATEGORIES.map((c) => `<div class="meal-strip-item">
          <span class="meal-strip-label">${c.label}</span>
          <strong>${fmtInt(totals[c.key].total)}</strong>
          <span class="meal-strip-unit">kcal · ${totals[c.key].count} 条</span>
        </div>`).join('')}
      </div>
    </section>

    <section class="panel form-panel" aria-labelledby="meal-form-title">
      <div class="panel-head">
        <h2 id="meal-form-title">${editing ? '修改这条饮食记录' : '添加饮食'}</h2>
        ${editing ? '<button type="button" class="link-btn" data-action="cancel-meal-edit">取消修改</button>' : ''}
      </div>
      <form id="meal-form" novalidate>
        <div class="field"><label>餐次</label>${categoryChips(ui.dietCategory)}</div>
        <div class="field-row field-row--2">
          <div class="field field--half">
            <label for="meal-name">食物名称</label>
            <input type="text" id="meal-name" maxlength="60" required placeholder="例如：鸡蛋" value="${escapeHtml(draft.name)}" />
          </div>
          <div class="field field--half">
            <label for="meal-kcal">热量 (kcal)</label>
            <input type="number" id="meal-kcal" min="0" max="20000" step="1" inputmode="numeric" required placeholder="例如 140" value="${escapeHtml(draft.calories)}" />
          </div>
        </div>
        <div class="field-row field-row--2">
          <div class="field field--half">
            <label for="meal-date">日期</label>
            <input type="date" id="meal-date" max="${today}" value="${escapeHtml(date)}" />
          </div>
          <div class="field field--half">
            <label for="meal-time">时间</label>
            <input type="time" id="meal-time" value="${escapeHtml(ui.dietTime || nowTime())}" />
          </div>
        </div>
        <div class="field">
          <label for="meal-note">备注 <span class="opt">可选</span></label>
          <input type="text" id="meal-note" maxlength="200" placeholder="例如：水煮 / 半份" value="${escapeHtml(draft.note)}" />
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${icon('plus', 18)} ${editing ? '保存修改' : '添加记录'}</button>
          ${editing ? '<span class="form-hint">修改后当天热量会自动重算</span>' : '<span class="form-hint">保存后保留餐次与时间，可连续添加</span>'}
        </div>
      </form>
    </section>

    <section class="panel" aria-labelledby="diet-list-title">
      <div class="panel-head"><h2 id="diet-list-title">${formatDateCN(date)}吃了什么</h2><span class="muted">${meals.length ? `合计 ${fmtInt(total)} kcal` : '暂无记录'}</span></div>
      ${meals.length ? groups : emptyState('这一天还没有饮食记录', '在上方填写食物名称和热量即可，保存后这里会按餐次自动分组。')}
    </section>

    <section class="panel" aria-labelledby="cal-chart-title">
      <div class="panel-head"><h2 id="cal-chart-title">每日热量趋势</h2>${segmented('calorie-range', RANGES, ui.calorieRange)}</div>
      ${barChart(series, { goal })}
      <p class="chart-foot">仅显示有饮食记录的日子；浅色短横表示当天没有记录（不等于 0 kcal）。${goal ? '虚线为每日热量目标。' : ''}</p>
    </section>

    ${disclaimer('热量由你手动填写，未接入食物营养数据库；如日后加入查询功能，估算值会与可靠来源明确区分。')}
  `;
}

export function bind(root) {
  // 保留输入草稿，使日期/餐次切换导致的重绘不丢字
  root.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'meal-name') ui.mealDraft.name = el.value;
    else if (el.id === 'meal-kcal') ui.mealDraft.calories = el.value;
    else if (el.id === 'meal-note') ui.mealDraft.note = el.value;
    else if (el.id === 'meal-time') ui.dietTime = el.value;
  });

  root.addEventListener('change', (e) => {
    if (e.target.id !== 'meal-date' && e.target.id !== 'diet-date') return;
    const key = validateRecordDate(e.target.value);
    if (!key) {
      toast('请选择有效日期，且不能晚于今天', 'error');
      e.target.value = ui.dietDate;
      return;
    }
    ui.dietDate = key;
    bus.emit('change');
  });

  root.addEventListener('submit', (e) => {
    if (!e.target || e.target.id !== 'meal-form') return;
    e.preventDefault();
    const date = validateRecordDate(root.querySelector('#meal-date').value);
    const time = validateTime(root.querySelector('#meal-time').value);
    const name = trimText(root.querySelector('#meal-name').value, 60);
    const calories = validateCalories(root.querySelector('#meal-kcal').value);
    const note = trimText(root.querySelector('#meal-note').value, 200);

    if (!date) { toast('请选择有效日期，且不能晚于今天', 'error'); return; }
    if (!time) { toast('时间格式不正确', 'error'); return; }
    if (!name) { toast('请填写食物名称', 'error'); root.querySelector('#meal-name')?.focus(); return; }
    if (calories === null) { toast('热量请填写 0–20000 之间的数字', 'error'); root.querySelector('#meal-kcal')?.focus(); return; }

    const res = upsertMeal({ id: ui.editMealId, date, time, name, calories, category: ui.dietCategory, note });
    if (!res.ok) { toast(res.error, 'error'); return; }

    ui.mealDraft = { name: '', calories: '', note: '' };
    ui.dietDate = date;
    if (ui.editMealId) {
      ui.editMealId = null;
      toast('饮食记录已更新，当天热量已重算', 'success');
    } else {
      ui.focusName = true;
      toast(`已添加「${name}」，可继续添加下一种食物`, 'success');
    }
    bus.emit('change');
  });

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, value, id } = el.dataset;

    if (action === 'calorie-range') { ui.calorieRange = Number(value); bus.emit('change'); return; }
    if (action === 'set-category') { ui.dietCategory = value; bus.emit('change'); return; }
    if (action === 'diet-prev') { ui.dietDate = addDays(ui.dietDate, -1); bus.emit('change'); return; }
    if (action === 'diet-next') {
      const next = addDays(ui.dietDate, 1);
      if (next > todayKey()) return;
      ui.dietDate = next; bus.emit('change'); return;
    }
    if (action === 'diet-today') { ui.dietDate = todayKey(); bus.emit('change'); return; }
    if (action === 'cancel-meal-edit') {
      ui.editMealId = null;
      ui.mealDraft = { name: '', calories: '', note: '' };
      ui.dietDate = todayKey();
      bus.emit('change');
      return;
    }
    if (action === 'edit-meal') {
      const m = (state().meals || []).find((x) => x.id === id);
      if (!m) { toast('记录不存在', 'error'); return; }
      ui.editMealId = id;
      ui.mealDraft = { name: m.name, calories: String(m.calories), note: m.note || '' };
      ui.dietCategory = m.category;
      ui.dietTime = m.time || nowTime();
      ui.dietDate = m.date;
      bus.emit('change');
      document.querySelector('#meal-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector('#meal-name')?.focus({ preventScroll: true });
      return;
    }
    if (action === 'delete-meal') {
      const m = (state().meals || []).find((x) => x.id === id);
      if (!m) { toast('记录不存在', 'error'); return; }
      const ok = await confirmDialog({
        title: '删除饮食记录',
        message: `确定删除 <strong>${escapeHtml(m.name)}（${fmtInt(m.calories)} kcal）</strong> 吗？<br />当天总热量会立即重新计算，此操作无法撤销。`,
        confirmText: '确认删除',
      });
      if (!ok) return;
      const res = removeMeal(id);
      if (!res.ok) { toast(res.error, 'error'); return; }
      if (ui.editMealId === id) {
        ui.editMealId = null;
        ui.mealDraft = { name: '', calories: '', note: '' };
      }
      toast('饮食记录已删除，当天热量已重算', 'success');
      bus.emit('change');
    }
  });

  if (ui.focusName) {
    ui.focusName = false;
    root.querySelector('#meal-name')?.focus();
  }
}
