/** 通用 UI 组件：图标、轻提示、对话框与二次确认 */
import { escapeHtml } from './utils.js';

const PATHS = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.8 9.4V20.5h12.4V9.4"/><path d="M9.6 20.5v-6h4.8v6"/>',
  weight: '<rect x="3.2" y="4" width="17.6" height="16" rx="3.2"/><path d="M7.4 10.2a4.6 4.6 0 0 1 9.2 0"/><path d="M12 10.4 14.2 13.2H9.8z"/><path d="M8 16.6h8"/>',
  diet: '<path d="M3.2 11.2h17.6a8.8 8.8 0 0 1-17.6 0Z"/><path d="M2.6 20.4h18.8"/><path d="M9 7.6c0-1.2 1.2-1.6 1.2-2.8M13.4 7.6c0-1.2 1.2-1.6 1.2-2.8"/>',
  target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  history: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.4 2.1"/><path d="M4.2 5.4 2.6 7l1.6 1.6"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  right: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  edit: '<path d="M4 20h4l10.4-10.4a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="M14.2 6.2 17.4 9.4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.2h9.4L17.5 7"/><path d="M10 10.5v6M14 10.5v6"/>',
  download: '<path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 17.5v2.2h15v-2.2"/>',
  upload: '<path d="M12 15.5v-11M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 17.5v2.2h15v-2.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5 9.8 17 19 7.5"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2"/><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.2 2"/>',
  arrow: '<path d="M5 12h13M13 6.5 18.5 12 13 17.5"/>',
};

export function icon(name, size = 20, extraClass = '') {
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast-dot"></span><span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  const timer = window.setTimeout(() => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), 220);
  }, 2800);
  el.addEventListener('click', () => {
    window.clearTimeout(timer);
    el.remove();
  });
}

let closeActive = null;

export function closeModal() {
  if (closeActive) closeActive();
}

/**
 * 打开一个模态框。onMount(host, close) 可绑定内部事件；
 * 无论通过按钮 / ESC / 点击遮罩关闭，都会触发 onClose（用于 resolve Promise）。
 */
export function openModal({ title = '', body = '', onMount = null, onClose = null }) {
  closeModal();
  const host = document.getElementById('modal-root');
  if (!host) return () => {};

  host.innerHTML = `<div class="modal-backdrop" data-backdrop>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || '对话框')}">
      <div class="modal-head">
        <h2>${escapeHtml(title)}</h2>
        <button type="button" class="icon-btn" data-modal-close aria-label="关闭">${icon('close', 20)}</button>
      </div>
      <div class="modal-body">${body}</div>
    </div>
  </div>`;

  const backdrop = host.querySelector('[data-backdrop]');
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    if (closeActive !== close) return;
    closeActive = null;
    document.removeEventListener('keydown', onKey);
    host.innerHTML = '';
    if (onClose) onClose();
  };
  closeActive = close;
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  host.querySelectorAll('[data-modal-close]').forEach((btn) => btn.addEventListener('click', close));
  if (onMount) onMount(host, close);
  host.querySelector('[data-modal-close]')?.focus();
  return close;
}

/** 二次确认；requireText 不为空时必须手动输入指定文字 */
export function confirmDialog({
  title = '确认操作', message = '', confirmText = '确认删除', cancelText = '取消',
  danger = true, requireText = null,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const body = `<div class="confirm-body">
      <div class="confirm-symbol ${danger ? 'is-danger' : ''}">${icon(danger ? 'trash' : 'info', 22)}</div>
      <div class="confirm-message">${message}</div>
      ${requireText ? `<div class="field"><label for="confirm-input">请输入「${escapeHtml(requireText)}」以确认</label><input id="confirm-input" type="text" autocomplete="off" placeholder="${escapeHtml(requireText)}" /></div>` : ''}
      <div class="confirm-actions">
        <button type="button" class="btn btn-secondary" data-cancel>${escapeHtml(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmText)}</button>
      </div>
    </div>`;

    openModal({
      title, body,
      onClose: () => done(false),
      onMount(host, close) {
        host.querySelector('[data-cancel]').addEventListener('click', () => { done(false); close(); });
        host.querySelector('[data-confirm]').addEventListener('click', () => {
          if (requireText) {
            const input = host.querySelector('#confirm-input');
            if (input.value.trim() !== requireText) {
              toast('输入不匹配，未执行操作', 'error');
              input.focus();
              return;
            }
          }
          done(true);
          close();
        });
        const input = host.querySelector('#confirm-input');
        if (input) input.focus();
      },
    });
  });
}
