/** 设置弹窗：数据说明、JSON 导出 / 恢复、清空数据（全部走二次确认） */
import { exportData, importData, clearAll, STORAGE_KEY } from '../store.js';
import { bus } from '../bus.js';
import { ui } from '../ui-state.js';
import { downloadJson, todayKey, escapeHtml } from '../utils.js';
import { openModal, toast, icon } from '../ui.js';

function resetUiAfterDataChange() {
  ui.editMealId = null;
  ui.editWeightId = null;
  ui.mealDraft = { name: '', calories: '', note: '' };
  ui.dietDate = todayKey();
  ui.weightFormDate = todayKey();
  ui.focusName = false;
}

export function openSettings() {
  let pendingImport = null;

  const body = `
    <section>
      <h3>数据保存在哪里</h3>
      <p>所有记录只保存在本机浏览器的 localStorage（键名 <code>${escapeHtml(STORAGE_KEY)}</code>），不会上传，也不需要账号或云端数据库。刷新、关闭浏览器后数据仍在；但清除浏览器站点数据、更换浏览器或设备会丢失，请定期导出 JSON 备份。</p>
    </section>
    <section>
      <h3>备份与恢复</h3>
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" data-action="export">${icon('download', 18)} 导出 JSON 备份</button>
        <button type="button" class="btn btn-secondary" data-action="pick-import">${icon('upload', 18)} 从 JSON 恢复</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden />
      <p class="hint" style="margin-top:10px">恢复会用备份文件替换当前全部数据，操作前会再次确认。建议先导出一份当前数据。</p>
      <div id="import-confirm" hidden></div>
    </section>
    <section class="danger-zone">
      <h3>清空所有数据</h3>
      <button type="button" class="btn btn-danger-ghost" data-action="clear-ask">清空全部记录</button>
      <p class="hint" style="margin-top:10px">需要二次确认并手动输入「清空」，清空后无法撤销。</p>
      <div id="clear-confirm" hidden></div>
    </section>
    <section>
      <h3>关于轻衡</h3>
      <p>v1.0 · 零依赖的本地网页工具。体重与热量仅作为自我记录，不提供医疗建议；图表只使用真实记录，不填充虚构数据。</p>
    </section>
  `;

  openModal({
    title: '设置与数据',
    body,
    onMount(host, close) {
      const fileInput = host.querySelector('#import-file');
      const importBox = host.querySelector('#import-confirm');
      const clearBox = host.querySelector('#clear-confirm');

      host.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const action = el.dataset.action;

        if (action === 'export') {
          downloadJson(`轻衡备份-${todayKey()}.json`, exportData());
          toast('JSON 备份已导出', 'success');
          return;
        }

        if (action === 'pick-import') { fileInput.click(); return; }

        if (action === 'import-cancel') {
          pendingImport = null;
          importBox.hidden = true;
          importBox.innerHTML = '';
          fileInput.value = '';
          return;
        }

        if (action === 'import-confirm') {
          if (!pendingImport) return;
          try {
            importData(pendingImport);
            resetUiAfterDataChange();
            close();
            toast('数据已从备份恢复', 'success');
            bus.emit('change');
          } catch (err) {
            toast(err.message || '恢复失败', 'error');
          }
          return;
        }

        if (action === 'clear-ask') {
          clearBox.hidden = false;
          clearBox.innerHTML = `
            <div class="notice" style="margin-top:12px">这会删除全部体重记录、饮食记录和计划设置，且无法撤销。请先导出备份，再输入「清空」确认。</div>
            <div class="field" style="margin-top:12px"><label for="clear-input">输入「清空」以确认</label><input id="clear-input" type="text" autocomplete="off" placeholder="清空" /></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-action="clear-cancel">取消</button>
              <button type="button" class="btn btn-danger" data-action="clear-confirm">确认清空</button>
            </div>`;
          host.querySelector('#clear-input')?.focus();
          return;
        }

        if (action === 'clear-cancel') {
          clearBox.hidden = true;
          clearBox.innerHTML = '';
          return;
        }

        if (action === 'clear-confirm') {
          const value = host.querySelector('#clear-input')?.value.trim();
          if (value !== '清空') { toast('输入不匹配，未清空任何数据', 'error'); return; }
          try {
            clearAll();
            resetUiAfterDataChange();
            close();
            toast('所有记录已清空', 'success');
            bus.emit('change');
          } catch (err) {
            toast(err.message || '清空失败', 'error');
          }
        }
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        try {
          const payload = JSON.parse(await file.text());
          if (!payload || !Array.isArray(payload.weights) || !Array.isArray(payload.meals)) {
            throw new Error('文件不是有效的轻衡备份（缺少 weights / meals）');
          }
          pendingImport = payload;
          importBox.hidden = false;
          importBox.innerHTML = `
            <div class="notice" style="margin-top:12px">即将用备份覆盖当前数据：体重 <strong>${payload.weights.length}</strong> 条、饮食 <strong>${payload.meals.length}</strong> 条。当前数据会被替换，确认后继续。</div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-action="import-cancel">取消</button>
              <button type="button" class="btn btn-danger" data-action="import-confirm">覆盖并恢复</button>
            </div>`;
        } catch (err) {
          pendingImport = null;
          importBox.hidden = true;
          importBox.innerHTML = '';
          fileInput.value = '';
          toast(`备份文件无法读取：${err.message}`, 'error');
        }
      });
    },
  });
}
