/** 首页：每日健康概览。只突出「体重」与「今日热量」两块主视觉。 */
import { state } from '../store.js';
import {
  todayKey, formatDateCN, formatDateFull, weekdayCN, isNum, fmtNum, fmtInt,
} from '../utils.js';
import {
  latestWeight, weightDelta, planStats, dayCalories, mealTotals, dayMeals, lastRecordTime,
} from '../logic.js';
import { icon } from '../ui.js';
import { progressBar, deltaBadge, mealStrip, disclaimer } from './shared.js';

export function render() {
  const s = state();
  const today = todayKey();
  const latest = latestWeight(s);
  const delta = weightDelta(s);
  const plan = planStats(s);
  const goal = isNum(s.settings.dailyCalorieGoal) ? s.settings.dailyCalorieGoal : null;

  const total = dayCalories(s, today);
  const totals = mealTotals(s, today);
  const todayMeals = dayMeals(s, today);
  const hasWeight = (s.weights || []).some((w) => w.date === today);
  const last = lastRecordTime(s);
  const pct = goal ? Math.round((total / goal) * 100) : null;

  let weightTip = '在「目标」页设置初始体重与目标体重后显示进度';
  if (plan.total !== null && plan.lost !== null) {
    weightTip = plan.lost > 0
      ? `已减 ${fmtNum(plan.lost, 1)} / 共需减 ${fmtNum(plan.total, 1)} kg`
      : `较初始 +${fmtNum(-plan.lost, 1)} kg · 共需减 ${fmtNum(plan.total, 1)} kg`;
  } else if (plan.total !== null) {
    weightTip = `共需减 ${fmtNum(plan.total, 1)} kg，记录体重后显示已减多少`;
  }

  const calorieBody = goal
    ? `<div class="goal-line">每日目标 <strong>${fmtInt(goal)}</strong> kcal · ${total <= goal ? '剩余' : '超出'} <strong>${fmtInt(Math.abs(goal - total))}</strong> kcal</div>
       ${progressBar(pct, { tone: 'warm', label: '今日热量完成比例' })}
       <div class="hero-tip">已完成目标的 ${pct}%，数据来自今日 ${todayMeals.length} 条饮食记录${total > goal ? '；超出目标仅供自我参考，不必苛责' : ''}。</div>`
    : `<div class="goal-line is-empty">还没有设置每日热量目标，这里只显示实际摄入量。<button type="button" class="inline-link" data-nav="goal">去设置</button></div>
       <div class="hero-tip">目标完全由你自己决定，也可以一直不设置。</div>`;

  const noData = !latest && todayMeals.length === 0 && (s.weights || []).length === 0 && (s.meals || []).length === 0;

  return `
    <div class="home-head">
      <p class="eyebrow">DAILY OVERVIEW</p>
      <h1 class="home-title">${formatDateFull(today)} <span>${weekdayCN(today)}</span></h1>
      <p class="page-desc">${noData ? '从一次体重或一餐开始，所有数据只保存在这台设备上。' : '今天也花几十秒，看看自己的进展。'}</p>
    </div>

    <div class="home-grid">
      <section class="hero hero--weight" aria-labelledby="hero-weight-label">
        <div class="hero-label" id="hero-weight-label"><span>最新体重</span><span class="hero-date">${latest ? formatDateCN(latest.date) : '暂无记录'}</span></div>
        <div class="hero-metric"><span class="hero-number">${latest ? fmtNum(latest.weight, 1) : '—'}</span><span class="hero-unit">kg</span></div>
        <div class="hero-sub">${deltaBadge(delta)}</div>
        <div class="hero-divider"></div>
        <div class="hero-stats">
          <div><span>初始体重</span><strong>${plan.initial !== null ? fmtNum(plan.initial, 1) : '—'}</strong></div>
          <div><span>目标体重</span><strong>${plan.target !== null ? fmtNum(plan.target, 1) : '—'}</strong></div>
          <div><span>距离目标</span><strong>${plan.remaining !== null ? fmtNum(Math.max(0, plan.remaining), 1) : '—'}</strong></div>
        </div>
        <div class="hero-progress">
          <div class="progress-head"><span>当前减重进度</span><strong>${plan.progress === null ? '—' : `${plan.progress}%`}</strong></div>
          ${progressBar(plan.progress ?? 0, { label: '减重进度' })}
          <p class="hero-tip">${weightTip}</p>
        </div>
      </section>

      <section class="hero hero--calorie" aria-labelledby="hero-calorie-label">
        <div class="hero-label" id="hero-calorie-label"><span>今日摄入</span><span class="hero-date">${formatDateCN(today)}</span></div>
        <div class="hero-metric"><span class="hero-number">${fmtInt(total)}</span><span class="hero-unit">kcal</span></div>
        <div class="hero-sub"><span class="delta delta--none">${goal ? `目标 ${fmtInt(goal)} kcal · 完成 ${pct}%` : '按餐次自动汇总'}</span></div>
        ${calorieBody}
        ${mealStrip(totals)}
      </section>
    </div>

    <section class="section-block" aria-labelledby="status-title">
      <div class="section-head"><h2 id="status-title">今日记录</h2><span class="muted">${last ? `最近记录：${last.label}` : '暂无记录'}</span></div>
      <div class="status-row">
        <div class="status-item ${hasWeight ? '' : 'is-pending'}">
          <span class="status-icon">${icon(hasWeight ? 'check' : 'weight', 18)}</span>
          <div><span>体重</span><strong>${hasWeight ? '今日已记录' : '今日未记录'}</strong></div>
        </div>
        <div class="status-item ${todayMeals.length ? '' : 'is-pending'}">
          <span class="status-icon">${icon(todayMeals.length ? 'check' : 'diet', 18)}</span>
          <div><span>饮食</span><strong>${todayMeals.length ? `今日 ${todayMeals.length} 条记录` : '今日未记录'}</strong></div>
        </div>
      </div>
      <div class="quick-actions">
        <button type="button" class="btn btn-primary" data-nav="weight">${icon('plus', 18)} 记体重</button>
        <button type="button" class="btn btn-secondary" data-nav="diet">${icon('plus', 18)} 记饮食</button>
      </div>
      ${disclaimer('体重与热量只是记录，不据此推断脂肪变化或热量缺口；如有健康疑问请咨询专业人士。')}
    </section>
    <p class="home-foot">轻衡 · 数据仅存本机浏览器 · 无需账号</p>
  `;
}
