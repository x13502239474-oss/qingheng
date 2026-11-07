/** 目标页：减重计划设置、真实进度、里程碑、BMI 参考 */
import { state, saveSettings, upsertWeight } from '../store.js';
import { bus } from '../bus.js';
import {
  todayKey, fmtNum, isNum, escapeHtml, validateWeight, validateGoal,
  validateHeight, validatePlanDate,
} from '../utils.js';
import { planStats, milestones, bmiInfo, latestWeight } from '../logic.js';
import { toast, icon } from '../ui.js';
import { pageHead, progressBar, emptyState, disclaimer } from './shared.js';

export function render() {
  const s = state();
  const st = s.settings;
  const plan = planStats(s);
  const ms = milestones(s);
  const bmi = bmiInfo(isNum(st.height) ? st.height : null, plan.cur);
  const goal = isNum(st.dailyCalorieGoal) ? st.dailyCalorieGoal : null;

  let daysLabel = '目标日期';
  let daysValue = '—';
  if (plan.daysLeft !== null) {
    if (plan.daysLeft > 0) { daysLabel = '距目标日期（天）'; daysValue = String(plan.daysLeft); }
    else if (plan.daysLeft === 0) { daysLabel = '目标日期'; daysValue = '今天'; }
    else { daysLabel = '已过目标日期（天）'; daysValue = String(-plan.daysLeft); }
  } else {
    daysLabel = '未设置目标日期';
  }

  const progress = plan.valid ? `
    <div class="metric-grid">
      <div class="metric-cell"><span>共需减重</span><strong>${fmtNum(plan.total, 1)}<small>kg</small></strong></div>
      <div class="metric-cell is-accent"><span>已经减重</span><strong>${fmtNum(Math.max(0, plan.lost ?? 0), 1)}<small>kg</small></strong></div>
      <div class="metric-cell"><span>距离目标还差</span><strong>${fmtNum(Math.max(0, plan.remaining ?? 0), 1)}<small>kg</small></strong></div>
      <div class="metric-cell"><span>${daysLabel}</span><strong>${daysValue}</strong></div>
    </div>
    <div class="progress-head" style="margin-top:22px"><span>当前进度</span><strong>${plan.progress === null ? '—' : `${plan.progress}%`}</strong></div>
    ${progressBar(plan.progress ?? 0, { label: '减重计划完成度' })}
    <div class="milestones">
      ${ms.map((m) => `<div class="milestone ${m.reached ? 'is-reached' : ''}">
        <div class="milestone-mark">${icon(m.reached ? 'check' : 'target', 14)}</div>
        <strong>${m.name}</strong><span>累计减 ${fmtNum(m.target, 1)} kg</span>
      </div>`).join('')}
    </div>
    <p class="hint" style="margin-top:12px">里程碑按计划总量的 25% / 50% / 75% / 100% 划分，仅标记已达成，不推算减重速度。</p>`
    : emptyState('还没有完整的减重计划', '填写初始体重与目标体重后，这里会根据真实记录展示进度。');

  return `
    ${pageHead({ eyebrow: 'GOAL & PLAN', title: '减重目标', desc: '所有数字都由你自己设定，页面只做记录与展示，不替你制定激进计划。' })}

    <section class="panel" aria-labelledby="goal-progress-title">
      <div class="panel-head"><h2 id="goal-progress-title">计划进度</h2><span class="muted">${plan.started ? `始于 ${escapeHtml(plan.started)}` : '未设置开始日期'}</span></div>
      ${progress}
    </section>

    <section class="panel form-panel" aria-labelledby="goal-form-title">
      <div class="panel-head"><h2 id="goal-form-title">计划设置</h2></div>
      <form id="goal-form" novalidate>
        <div class="field-row field-row--3">
          <div class="field field--half"><label for="g-initial">初始体重 (kg)</label><input type="number" id="g-initial" step="0.1" min="20" max="400" inputmode="decimal" placeholder="例如 72.0" value="${plan.initial !== null ? fmtNum(plan.initial, 1) : ''}" /></div>
          <div class="field field--half"><label for="g-current">当前体重 (kg)</label><input type="number" id="g-current" step="0.1" min="20" max="400" inputmode="decimal" placeholder="来自最新记录" value="${plan.cur !== null ? fmtNum(plan.cur, 1) : ''}" /></div>
          <div class="field field--half"><label for="g-target">目标体重 (kg)</label><input type="number" id="g-target" step="0.1" min="20" max="400" inputmode="decimal" placeholder="例如 62.0" value="${plan.target !== null ? fmtNum(plan.target, 1) : ''}" /></div>
        </div>
        <p class="field-hint">当前体重取自最近一次体重记录；修改它会写入今天的体重记录（已有记录则更新，保留原备注）。</p>
        <div class="field-row field-row--3" style="margin-top:18px">
          <div class="field field--half"><label for="g-start">计划开始日期</label><input type="date" id="g-start" value="${escapeHtml(st.startDate || '')}" /></div>
          <div class="field field--half"><label for="g-end">目标完成日期</label><input type="date" id="g-end" value="${escapeHtml(st.targetDate || '')}" /></div>
          <div class="field field--half"><label for="g-goal">每日热量目标 <span class="opt">可选</span></label><input type="number" id="g-goal" step="1" min="1" max="20000" inputmode="numeric" placeholder="例如 1800" value="${goal !== null ? goal : ''}" /></div>
        </div>
        <div class="field-row field-row--3">
          <div class="field field--half"><label for="g-height">身高 (cm) <span class="opt">可选</span></label><input type="number" id="g-height" step="0.1" min="80" max="250" inputmode="decimal" placeholder="用于计算 BMI" value="${isNum(st.height) ? fmtNum(st.height, 1) : ''}" /></div>
        </div>
        ${goal !== null && goal < 1200 ? '<div class="notice">你设置的每日热量目标偏低，请留意身体感受；这不是医疗建议，也不是需要严格遵守的指令。</div>' : ''}
        <div class="form-actions"><button type="submit" class="btn btn-primary">保存计划</button><span class="form-hint">留空表示不设置该项，页面不会替你填空。</span></div>
      </form>
    </section>

    <section class="panel" aria-labelledby="bmi-title">
      <div class="panel-head"><h2 id="bmi-title">身体数据参考</h2></div>
      <div class="bmi-row">
        <div class="bmi-value">${bmi ? fmtNum(bmi.value, 1) : '—'}<span>BMI</span></div>
        <p class="bmi-note">${bmi
          ? `按身高 ${fmtNum(st.height, 1)} cm、最新体重 ${fmtNum(plan.cur, 1)} kg 计算。一般成人参考范围约 18.5–23.9。`
          : '在上方填写身高并记录一次体重后，这里会显示 BMI。'}</p>
      </div>
      ${disclaimer('BMI 仅为一般参考指标，不是健康诊断，也不代表体脂或身体状态评估。')}
    </section>

    <div class="notice">页面不会自动推算减重速度、不会给出节食方案，也不鼓励极端低热量饮食。热量目标只是自我记录的参考线，不是医疗建议；如有健康方面的疑问，请咨询专业人士。</div>
  `;
}

export function bind(root) {
  root.addEventListener('submit', (e) => {
    if (!e.target || e.target.id !== 'goal-form') return;
    e.preventDefault();

    const readOptional = (id, label, validate) => {
      const raw = root.querySelector(`#${id}`).value.trim();
      if (raw === '') return null;
      const v = validate(raw);
      if (v === null || v === undefined) throw new Error(`${label}填写不合法，请检查数值或日期`);
      return v;
    };

    try {
      const initial = readOptional('g-initial', '初始体重', validateWeight);
      const current = readOptional('g-current', '当前体重', validateWeight);
      const target = readOptional('g-target', '目标体重', validateWeight);
      const goal = readOptional('g-goal', '每日热量目标', validateGoal);
      const height = readOptional('g-height', '身高', validateHeight);
      const startDate = readOptional('g-start', '计划开始日期', validatePlanDate);
      const targetDate = readOptional('g-end', '目标完成日期', validatePlanDate);
      if (startDate && targetDate && targetDate < startDate) throw new Error('目标完成日期不能早于计划开始日期');
      if (initial !== null && target !== null && initial <= target) {
        // 不阻止保存：这可能只是暂存的计划，首页会显示中性提示
      }

      let wroteWeight = false;
      if (current !== null) {
        const latest = latestWeight(state());
        if (!latest || Math.abs(current - latest.weight) > 0.001) {
          const todayRecord = (state().weights || []).find((w) => w.date === todayKey());
          const res = upsertWeight({
            date: todayKey(), weight: current, note: todayRecord ? todayRecord.note : '',
          });
          if (!res.ok) throw new Error(res.error);
          wroteWeight = true;
        }
      }

      const saved = saveSettings({
        initialWeight: initial,
        targetWeight: target,
        startDate,
        targetDate,
        dailyCalorieGoal: goal,
        height,
      });
      if (!saved.ok) throw new Error(saved.error);

      toast(wroteWeight ? '计划已保存，当前体重已同步到今天的记录' : '计划已保存', 'success');
      bus.emit('change');
    } catch (err) {
      toast(err.message || '保存失败，请检查输入', 'error');
    }
  });
}
