/** 视图层共用的小组件（返回 HTML 字符串） */
import { escapeHtml, fmtNum } from '../utils.js';
import { icon } from '../ui.js';
import { MEAL_CATEGORIES } from '../logic.js';

export function pageHead({ eyebrow, title, desc }) {
  return `<header class="page-head">
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="page-desc">${escapeHtml(desc)}</p>
  </header>`;
}

export function progressBar(percent, { tone = 'green', label = '进度' } = {}) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div class="progress progress--${tone}" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}">
    <div class="progress-fill" style="width:${p}%"></div>
  </div>`;
}

export function emptyState(title, hint = '', extra = '') {
  return `<div class="empty-state">
    <div class="empty-mark">${icon('info', 18)}</div>
    <p class="empty-title">${escapeHtml(title)}</p>
    ${hint ? `<p class="empty-hint">${escapeHtml(hint)}</p>` : ''}
    ${extra}
  </div>`;
}

export function segmented(action, items, active) {
  return `<div class="segmented" role="group">
    ${items.map((it) => `<button type="button" class="seg ${String(it.value) === String(active) ? 'is-active' : ''}" data-action="${action}" data-value="${escapeHtml(it.value)}" aria-pressed="${String(it.value) === String(active)}">${escapeHtml(it.label)}</button>`).join('')}
  </div>`;
}

export function categoryChips(active, action = 'set-category') {
  return `<div class="chip-row" role="group" aria-label="餐次">
    ${MEAL_CATEGORIES.map((c) => `<button type="button" class="chip ${c.key === active ? 'is-active' : ''}" data-action="${action}" data-value="${c.key}" aria-pressed="${c.key === active}">${c.label}</button>`).join('')}
  </div>`;
}

export function mealStrip(totals) {
  return `<div class="meal-strip">
    ${MEAL_CATEGORIES.map((c) => `<div class="meal-strip-item">
      <span class="meal-strip-label">${c.label}</span>
      <strong>${fmtNum(totals[c.key].total, 0)}</strong>
      <span class="meal-strip-unit">kcal · ${totals[c.key].count} 条</span>
    </div>`).join('')}
  </div>`;
}

export function deltaBadge(delta) {
  if (delta === null || delta === undefined) return '<span class="delta delta--none">还没有可比较的记录</span>';
  if (delta === 0) return '<span class="delta delta--flat">与上一次持平</span>';
  const down = delta < 0;
  return `<span class="delta ${down ? 'delta--down' : 'delta--up'}">${down ? '↓' : '↑'} ${fmtNum(Math.abs(delta), 1)} kg <span class="delta-caption">较上一次记录</span></span>`;
}

export function rowActions(editAction, deleteAction, id, editLabel, deleteLabel) {
  return `<div class="row-actions">
    <button type="button" class="icon-btn icon-btn--sm" data-action="${editAction}" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(editLabel)}" title="修改">${icon('edit', 17)}</button>
    <button type="button" class="icon-btn icon-btn--sm is-danger" data-action="${deleteAction}" data-id="${escapeHtml(id)}" aria-label="${escapeHtml(deleteLabel)}" title="删除">${icon('trash', 17)}</button>
  </div>`;
}

export function disclaimer(text) {
  return `<p class="disclaimer">${icon('info', 15)}<span>${escapeHtml(text)}</span></p>`;
}
