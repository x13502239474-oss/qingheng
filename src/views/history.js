/** 历史页：体重趋势、每周平均摄入、按日期对齐的体重与热量明细 */
import { state } from '../store.js';
import { bus } from '../bus.js';
import { ui } from '../ui-state.js';
import { formatDateCN, weekdayCN, fmtNum, fmtInt, escapeHtml } from '../utils.js';
import { weightSeries, weeklyAverages, historyRows } from '../logic.js';
import { lineChart } from '../charts.js';
import { pageHead, segmented, emptyState, disclaimer } from './shared.js';

const RANGES = [
  { value: 30, label: '30 天' }, { value: 90, label: '90 天' }, { value: 'all', label: '全部' },
];

export function render() {
  const s = state();
  const rows = historyRows(s, 90);
  const points = weightSeries(s, ui.historyRange);
  const weeks = weeklyAverages(s, 6);
  const maxAvg = Math.max(1, ...weeks.map((w) => w.avg || 0));

  const chart = lineChart(points, {
    emptyText: '当前范围没有可绘制的体重记录',
    emptyHint: '至少需要 2 条真实体重记录，可切换到「全部」查看更长时间范围。',
    ariaLabel: '历史体重变化趋势图',
  });

  const weekly = weeks.map((w) => `<div class="weekly-row">
    <span class="weekly-label">${escapeHtml(w.label)}</span>
    <div class="weekly-track"><div class="weekly-fill" style="width:${w.avg ? Math.round((w.avg / maxAvg) * 100) : 0}%"></div></div>
    <span class="weekly-value ${w.avg ? '' : 'is-empty'}">${w.avg ? `${fmtInt(w.avg)} kcal` : '无记录'}</span>
  </div>`).join('');

  const table = rows.length ? `
    <div class="table-scroll"><div class="history-table">
      <div class="history-row is-head">
        <span>日期</span><span>体重</span><span>当日总热量</span><span>饮食条数</span><span></span>
      </div>
      ${rows.map((r) => `<div class="history-row">
        <span class="history-cell">${formatDateCN(r.date)} <span class="row-meta" style="display:inline">${weekdayCN(r.date)}</span></span>
        <span class="history-cell ${r.weight === null ? 'is-dim' : ''}">${r.weight === null ? '—' : `${fmtNum(r.weight, 1)} kg`}</span>
        <span class="history-cell ${r.hasMeals ? '' : 'is-dim'}">${r.hasMeals ? `${fmtInt(r.calories)} kcal` : '—'}</span>
        <span class="history-cell ${r.mealCount ? '' : 'is-dim'}">${r.mealCount ? `${r.mealCount} 条` : '—'}</span>
        <button type="button" class="history-link" data-action="view-day" data-date="${escapeHtml(r.date)}">查看饮食</button>
      </div>`).join('')}
    </div></div>` : emptyState('还没有历史记录', '记录体重或饮食后，这里会按日期汇总，最多显示最近 90 个有记录的日期。');

  return `
    ${pageHead({ eyebrow: 'HISTORY', title: '历史数据', desc: '体重与热量按同一天对齐，方便观察长期变化；所有数字都来自你自己的记录。' })}

    <section class="panel" aria-labelledby="h-chart-title">
      <div class="panel-head"><h2 id="h-chart-title">体重变化趋势</h2>${segmented('history-range', RANGES, ui.historyRange)}</div>
      ${chart}
      <p class="chart-foot">${points.length >= 2 ? `共 ${points.length} 条真实记录。` : '记录不足时不生成趋势线，也不补齐缺失日期。'}</p>
    </section>

    <section class="panel" aria-labelledby="h-week-title">
      <div class="panel-head"><h2 id="h-week-title">每周平均摄入热量</h2><span class="muted">最近 6 周</span></div>
      ${weekly}
      <p class="chart-foot">按每周「有饮食记录的天数」求平均，空白周显示为无记录，不会按 0 kcal 摊薄。</p>
    </section>

    <section class="panel" aria-labelledby="h-table-title">
      <div class="panel-head"><h2 id="h-table-title">每日明细</h2><span class="muted">${rows.length} 天有记录</span></div>
      ${table}
    </section>

    ${disclaimer('这里只呈现记录本身：不根据体重与热量推断具体的脂肪变化，也不计算每日热量缺口。')}
  `;
}

export function bind(root) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'history-range') {
      ui.historyRange = el.dataset.value === 'all' ? 'all' : Number(el.dataset.value);
      bus.emit('change');
      return;
    }
    if (el.dataset.action === 'view-day') {
      ui.dietDate = el.dataset.date;
      ui.editMealId = null;
      ui.mealDraft = { name: '', calories: '', note: '' };
      location.hash = '#/diet';
    }
  });
}
