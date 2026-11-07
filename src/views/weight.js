/** 体重页：录入 / 修改 / 删除（二次确认）+ 真实记录折线图 */
import { state, upsertWeight, removeWeight } from '../store.js';
import { bus } from '../bus.js';
import { ui } from '../ui-state.js';
import {
  todayKey, formatDateCN, weekdayCN, fmtNum, escapeHtml, trimText,
  validateWeight, validateRecordDate, round1,
} from '../utils.js';
import { sortedWeights, weightSeries } from '../logic.js';
import { lineChart } from '../charts.js';
import { toast, confirmDialog } from '../ui.js';
import { pageHead, segmented, emptyState, rowActions } from './shared.js';

const RANGES = [
  { value: 7, label: '7 天' }, { value: 30, label: '30 天' },
  { value: 90, label: '90 天' }, { value: 'all', label: '全部' },
];

export function render() {
  const s = state();
  const editing = ui.editWeightId ? (s.weights || []).find((w) => w.id === ui.editWeightId) : null;
  const formDate = editing ? editing.date : ui.weightFormDate;
  const otherOnDate = (s.weights || []).find((w) => w.date === formDate && (!editing || w.id !== editing.id));
  const list = sortedWeights(s, 'desc');
  const points = weightSeries(s, ui.weightRange);
  const rangeLabel = ui.weightRange === 'all' ? '全部记录里' : `最近 ${ui.weightRange} 天里`;

  const chart = lineChart(points, {
    emptyText: points.length === 0 ? `${rangeLabel}还没有体重记录` : '当前范围只有 1 条记录',
    emptyHint: points.length === 0
      ? '添加体重记录后，折线会自动连接真实数据点。'
      : '至少需要 2 条真实记录才会生成趋势图，可切换到更长的时间范围。',
  });

  const rows = list.map((w, i) => {
    const earlier = list[i + 1];
    const diff = earlier ? round1(w.weight - earlier.weight) : null;
    const diffText = diff === null
      ? '首次记录'
      : diff === 0 ? '与上次持平' : `${diff < 0 ? '↓' : '↑'} ${fmtNum(Math.abs(diff), 1)} kg`;
    return `<div class="data-row">
      <div class="row-main">
        <div class="row-title">${formatDateCN(w.date)} <span class="row-meta" style="display:inline">${weekdayCN(w.date)}</span></div>
        <div class="row-meta">${diffText}${w.note ? ` · ${escapeHtml(w.note)}` : ''}</div>
      </div>
      <div class="row-value">${fmtNum(w.weight, 1)}<small>kg</small></div>
      ${rowActions('edit-weight', 'delete-weight', w.id, `修改 ${w.date} 的体重记录`, `删除 ${w.date} 的体重记录`)}
    </div>`;
  }).join('');

  return `
    ${pageHead({ eyebrow: 'WEIGHT', title: '体重记录', desc: '每天一条，同一天再次填写会更新原记录，不产生重复数据。' })}

    <section class="panel form-panel" aria-labelledby="w-form-title">
      <div class="panel-head">
        <h2 id="w-form-title">${editing ? `修改 ${formatDateCN(editing.date)} 的记录` : '记录体重'}</h2>
        ${editing ? '<button type="button" class="link-btn" data-action="cancel-weight-edit">取消修改</button>' : ''}
      </div>
      <form id="weight-form" novalidate>
        <div class="field-row field-row--2">
          <div class="field field--half">
            <label for="w-date">日期</label>
            <input type="date" id="w-date" max="${todayKey()}" value="${escapeHtml(formDate)}" required />
          </div>
          <div class="field field--half">
            <label for="w-value">体重 (kg)</label>
            <input type="number" id="w-value" step="0.1" min="20" max="400" inputmode="decimal" placeholder="例如 68.4" value="${editing ? fmtNum(editing.weight, 1) : ''}" required />
          </div>
        </div>
        <div class="field">
          <label for="w-note">备注 <span class="opt">可选</span></label>
          <input type="text" id="w-note" maxlength="200" placeholder="例如：晨起空腹 / 慢跑 30 分钟" value="${editing ? escapeHtml(editing.note || '') : ''}" />
        </div>
        <p class="field-hint ${otherOnDate ? 'is-warn' : ''}" id="w-date-hint">${otherOnDate
          ? `${formDate} 已有体重记录，保存将更新它（同一天只保留一条）。`
          : '不填日期默认为今天；折线图只使用真实记录，不补齐缺失日期。'}</p>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">${editing ? '保存修改' : '保存记录'}</button>
          <span class="form-hint">体重建议在相近条件下记录，便于长期观察。</span>
        </div>
      </form>
    </section>

    <section class="panel" aria-labelledby="w-chart-title">
      <div class="panel-head"><h2 id="w-chart-title">体重变化</h2>${segmented('weight-range', RANGES, ui.weightRange)}</div>
      ${chart}
      <p class="chart-foot">${points.length >= 2 ? `当前范围共 ${points.length} 条真实记录；最轻 ${fmtNum(Math.min(...points.map((p) => p.value)), 1)} kg，最重 ${fmtNum(Math.max(...points.map((p) => p.value)), 1)} kg。` : '不生成虚构趋势，记录足够时自动绘制。'}</p>
    </section>

    <section class="panel" aria-labelledby="w-list-title">
      <div class="panel-head"><h2 id="w-list-title">全部记录</h2><span class="muted">共 ${list.length} 条</span></div>
      ${list.length ? rows : emptyState('还没有体重记录', '在上方填写一次体重，首页和趋势图就会更新。')}
    </section>
  `;
}

export function bind(root) {
  root.addEventListener('submit', (e) => {
    if (!e.target || e.target.id !== 'weight-form') return;
    e.preventDefault();
    const date = validateRecordDate(root.querySelector('#w-date').value);
    const weight = validateWeight(root.querySelector('#w-value').value);
    if (!date) { toast('请选择有效日期，且不能晚于今天', 'error'); return; }
    if (weight === null) { toast('请输入 20–400 kg 之间的体重数值', 'error'); return; }

    const res = upsertWeight({
      id: ui.editWeightId,
      date,
      weight,
      note: trimText(root.querySelector('#w-note').value, 200),
    });
    if (!res.ok) { toast(res.error, 'error'); return; }

    ui.editWeightId = null;
    ui.weightFormDate = todayKey();
    toast(res.mode === 'update' ? '已更新该日期的体重记录（同一天不重复）' : '体重记录已保存', 'success');
    bus.emit('change');
  });

  root.addEventListener('change', (e) => {
    if (!e.target || e.target.id !== 'w-date') return;
    const key = e.target.value || todayKey();
    ui.weightFormDate = key;
    const existing = (state().weights || []).find((w) => w.date === key);
    const hint = root.querySelector('#w-date-hint');
    if (existing && existing.id !== ui.editWeightId) {
      root.querySelector('#w-value').value = existing.weight;
      root.querySelector('#w-note').value = existing.note || '';
      if (hint) {
        hint.textContent = `${key} 已有体重记录，已为你带入原值；保存将更新它，不会产生重复数据。`;
        hint.classList.add('is-warn');
      }
    } else if (hint) {
      hint.textContent = '不填日期默认为今天；折线图只使用真实记录，不补齐缺失日期。';
      hint.classList.remove('is-warn');
    }
  });

  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, value, id } = el.dataset;

    if (action === 'weight-range') { ui.weightRange = value === 'all' ? 'all' : Number(value); bus.emit('change'); return; }

    if (action === 'cancel-weight-edit') {
      ui.editWeightId = null; ui.weightFormDate = todayKey(); bus.emit('change'); return;
    }

    if (action === 'edit-weight') {
      const rec = (state().weights || []).find((w) => w.id === id);
      if (!rec) { toast('记录不存在', 'error'); return; }
      ui.editWeightId = id;
      ui.weightFormDate = rec.date;
      bus.emit('change');
      document.querySelector('#weight-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector('#w-value')?.focus({ preventScroll: true });
      return;
    }

    if (action === 'delete-weight') {
      const rec = (state().weights || []).find((w) => w.id === id);
      if (!rec) { toast('记录不存在', 'error'); return; }
      const ok = await confirmDialog({
        title: '删除体重记录',
        message: `确定删除 <strong>${escapeHtml(formatDateCN(rec.date))} · ${fmtNum(rec.weight, 1)} kg</strong> 这条记录吗？<br />删除后趋势图和进度会同步更新，此操作无法撤销。`,
        confirmText: '确认删除',
      });
      if (!ok) return;
      const res = removeWeight(id);
      if (!res.ok) { toast(res.error, 'error'); return; }
      if (ui.editWeightId === id) { ui.editWeightId = null; ui.weightFormDate = todayKey(); }
      toast('体重记录已删除', 'success');
      bus.emit('change');
    }
  });
}
