/**
 * 自绘 SVG 图表（零依赖）。
 * 只接收真实记录：点数不足时返回空状态，绝不补点、绝不造数据。
 */
import { fmtNum, fmtInt, formatShort, escapeHtml } from './utils.js';

let seq = 0;

export function emptyChart(title, hint = '') {
  return `<div class="chart-empty" role="status">
    <svg viewBox="0 0 128 44" width="128" height="44" aria-hidden="true">
      <path d="M4 32 H124" stroke="#E3E8DF" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M12 27 L36 21 L60 24 L84 15 L108 18" stroke="#C9D6CB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 5" fill="none"/>
      <circle cx="36" cy="21" r="2.6" fill="#B6C8B9"/>
      <circle cx="84" cy="15" r="2.6" fill="#B6C8B9"/>
    </svg>
    <p class="chart-empty-title">${escapeHtml(title)}</p>
    ${hint ? `<p class="chart-empty-hint">${escapeHtml(hint)}</p>` : ''}
  </div>`;
}

/** 体重折线图：points = [{date, value}]，少于 2 点不绘图 */
export function lineChart(points, opts = {}) {
  const {
    unit = 'kg', color = '#2E6F4E', fill = '#DCEBDF',
    emptyText = '当前范围的记录不足，暂不生成趋势图',
    emptyHint = '至少需要 2 条真实记录，可切换到更长的时间范围。',
    ariaLabel = '体重变化折线图',
  } = opts;

  if (!Array.isArray(points) || points.length < 2) return emptyChart(emptyText, emptyHint);

  const W = 640, H = 224, P = { l: 48, r: 16, t: 20, b: 34 };
  const values = points.map((p) => Number(p.value)).filter(Number.isFinite);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(rawMax - rawMin, 0.8);
  const min = rawMin - span * 0.2;
  const max = rawMax + span * 0.2;
  const X = (i) => P.l + (W - P.l - P.r) * (i / (points.length - 1));
  const Y = (v) => P.t + (H - P.t - P.b) * (1 - (v - min) / (max - min));
  const gid = `qh-line-${++seq}`;

  let grid = '';
  for (let i = 0; i < 4; i += 1) {
    const v = min + (max - min) * (i / 3);
    const y = Y(v);
    grid += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${W - P.r}" y2="${y.toFixed(1)}" stroke="#E9EDE6" stroke-width="1"/>`;
    grid += `<text x="${P.l - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#7C8A7D">${fmtNum(v, 1)}</text>`;
  }

  const line = points.map((p, i) => `${i ? 'L' : 'M'} ${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${X(points.length - 1).toFixed(1)} ${H - P.b} L ${X(0).toFixed(1)} ${H - P.b} Z`;
  const dots = points.map((p, i) =>
    `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.value).toFixed(1)}" r="3.6" fill="#FFFFFF" stroke="${color}" stroke-width="2"><title>${escapeHtml(p.date)} · ${fmtNum(p.value, 1)} ${unit}</title></circle>`,
  ).join('');
  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const xlabels = labelIdx.map((i) =>
    `<text x="${X(i).toFixed(1)}" y="${H - 10}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}" font-size="11" fill="#7C8A7D">${formatShort(points[i].date)}</text>`,
  ).join('');

  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${fill}" stop-opacity="0.95"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#${gid})"/>
    <path class="chart-line" pathLength="1" d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${xlabels}
  </svg></div>`;
}

/** 每日热量柱状图：points = [{date, value, hasRecord}]，空白日期用短横线占位 */
export function barChart(points, opts = {}) {
  const {
    goal = null, color = '#C58A4B',
    emptyText = '该时间段暂无饮食记录',
    emptyHint = '记录饮食后，这里会按天显示真实的热量合计。',
    ariaLabel = '每日热量柱状图',
  } = opts;

  if (!Array.isArray(points) || !points.length || !points.some((p) => p.hasRecord)) {
    return emptyChart(emptyText, emptyHint);
  }

  const W = 640, H = 210, P = { l: 44, r: 14, t: 18, b: 32 };
  const maxValue = Math.max(goal || 0, ...points.map((p) => p.value), 200);
  const top = maxValue * 1.12;
  const slot = (W - P.l - P.r) / points.length;
  const bw = Math.max(2.5, Math.min(slot * 0.62, 30));
  const Y = (v) => P.t + (H - P.t - P.b) * (1 - v / top);

  let grid = '';
  for (let i = 0; i < 4; i += 1) {
    const v = top * (i / 3);
    const y = Y(v);
    grid += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${W - P.r}" y2="${y.toFixed(1)}" stroke="#EDE9E2" stroke-width="1"/>`;
    grid += `<text x="${P.l - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#8B8A7C">${fmtInt(v)}</text>`;
  }

  const bars = points.map((p, i) => {
    const x = P.l + slot * i + (slot - bw) / 2;
    if (!p.hasRecord) {
      return `<rect x="${x.toFixed(1)}" y="${H - P.b - 3}" width="${bw.toFixed(1)}" height="3" rx="1.5" fill="#E2E5DE"><title>${escapeHtml(p.date)} · 无记录</title></rect>`;
    }
    const y = Y(p.value);
    const h = Math.max(3, H - P.b - y);
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}" fill-opacity="0.88"><title>${escapeHtml(p.date)} · ${fmtInt(p.value)} kcal（${p.value === 0 ? '记录为 0' : '真实记录'}）</title></rect>`;
  }).join('');

  const every = Math.max(1, Math.ceil(points.length / 6));
  const xlabels = points.map((p, i) => {
    if (i % every !== 0 && i !== points.length - 1) return '';
    const x = P.l + slot * i + slot / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#8B8A7C">${formatShort(p.date)}</text>`;
  }).join('');

  const goalLine = goal
    ? `<line x1="${P.l}" y1="${Y(goal).toFixed(1)}" x2="${W - P.r}" y2="${Y(goal).toFixed(1)}" stroke="#2E6F4E" stroke-width="1.5" stroke-dasharray="5 5" opacity="0.75"/>
       <text x="${W - P.r - 2}" y="${(Y(goal) - 6).toFixed(1)}" text-anchor="end" font-size="11" fill="#2E6F4E">目标 ${fmtInt(goal)}</text>`
    : '';

  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">
    ${grid}${bars}${goalLine}${xlabels}
  </svg></div>`;
}
