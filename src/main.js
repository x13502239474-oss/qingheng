/** 应用入口：hash 路由、导航骨架、全局事件、跨标签页同步 */
import { bus } from './bus.js';
import { ui } from './ui-state.js';
import { STORAGE_KEY, resetCache } from './store.js';
import { todayKey, formatDateCN, weekdayCN } from './utils.js';
import { icon } from './ui.js';
import * as home from './views/home.js';
import * as weight from './views/weight.js';
import * as diet from './views/diet.js';
import * as goal from './views/goal.js';
import * as history from './views/history.js';
import { openSettings } from './views/settings.js';

const VIEWS = { home, weight, diet, goal, history };
const NAV = [
  { key: 'home', label: '概览', icon: 'home' },
  { key: 'weight', label: '体重', icon: 'weight' },
  { key: 'diet', label: '饮食', icon: 'diet' },
  { key: 'goal', label: '目标', icon: 'target' },
  { key: 'history', label: '历史', icon: 'history' },
];

let route = 'home';

function renderChrome() {
  const topbar = document.getElementById('topbar');
  topbar.innerHTML = `<div class="topbar-inner">
    <a class="brand" href="#/home" data-nav="home" aria-label="轻衡首页">
      <span class="brand-symbol" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="brand-mark">轻衡</span>
      <span class="brand-sub">体重 · 饮食 · 目标</span>
    </a>
    <div class="topbar-right">
      <span class="today-label">${formatDateCN(todayKey())} ${weekdayCN(todayKey())}</span>
      <nav class="desk-nav" aria-label="页面导航">
        ${NAV.map((n) => `<button type="button" class="desk-link" data-nav="${n.key}">${icon(n.icon, 17)}${n.label}</button>`).join('')}
      </nav>
      <button type="button" class="icon-btn" data-action="open-settings" aria-label="设置与数据" title="设置与数据">${icon('settings', 20)}</button>
    </div>
  </div>`;

  document.getElementById('tabbar').innerHTML = NAV.map((n) => `
    <button type="button" class="tab" data-nav="${n.key}" aria-label="${n.label}">
      ${icon(n.icon, 21)}<span>${n.label}</span><span class="tab-dot" aria-hidden="true"></span>
    </button>`).join('');
}

function readRoute() {
  const key = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return VIEWS[key] ? key : 'home';
}

function render() {
  route = readRoute();
  const container = document.getElementById('view');
  const scrollY = window.scrollY;
  const restoreScroll = !ui.focusName;

  // 每次重绘都创建新的子容器，避免在同一个 #view 上叠加事件监听器
  container.innerHTML = `<div class="view-page">${VIEWS[route].render()}</div>`;
  const page = container.firstElementChild;
  if (VIEWS[route].bind) VIEWS[route].bind(page);

  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.nav === route);
    if (el.classList.contains('desk-link')) {
      if (el.dataset.nav === route) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  });

  if (restoreScroll) window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
}

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    e.preventDefault();
    const key = nav.dataset.nav;
    if (key === route && VIEWS[key]) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      location.hash = `#/${key}`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  if (e.target.closest('[data-action="open-settings"]')) openSettings();
});

window.addEventListener('hashchange', render);
bus.on(() => render());

// 同一浏览器多个标签页时保持数据一致
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { resetCache(); render(); }
});

renderChrome();
render();
