/**
 * 浏览器端验收套件（在真实页面里通过 DOM 操作驱动应用）。
 * 由 tests/e2e.mjs 通过 CDP 注入执行；不 mock 任何应用逻辑。
 */
(function () {
  const results = [];
  const tick = (ms = 90) => new Promise((r) => setTimeout(r, ms));
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const click = (s, r = document) => {
    const el = q(s, r);
    if (!el) throw new Error('找不到元素: ' + s);
    el.click();
    return el;
  };
  const setVal = (s, v) => {
    const el = q(s);
    if (!el) throw new Error('找不到输入: ' + s);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el;
  };
  const submit = (s) => {
    const f = q(s);
    if (!f) throw new Error('找不到表单: ' + s);
    f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };
  const text = () => q('#view').textContent.replace(/\s+/g, ' ');
  const data = () => JSON.parse(localStorage.getItem('qingheng.data.v1') || '{}');
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail: String(detail).slice(0, 200) });
  const nav = async (k) => { location.hash = '#/' + k; await tick(170); };
  const dk = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const T = dk(0);

  window.__runSuite = async function () {
    results.length = 0;
    try {
      // --- 0. 空状态：不允许虚构趋势 ---
      await nav('weight');
      check('0. 空数据时不生成虚构趋势图', !!q('.chart-empty') && !q('#view .chart svg'), q('.chart-empty-title')?.textContent || '');

      // --- 1. 计划设置 ---
      await nav('goal');
      setVal('#g-initial', '72');
      setVal('#g-target', '62');
      setVal('#g-start', dk(-30));
      setVal('#g-end', dk(60));
      setVal('#g-goal', '1800');
      setVal('#g-height', '170');
      submit('#goal-form');
      await tick(140);
      let s = data();
      check('1. 可设置初始体重和目标体重', s.settings?.initialWeight === 72 && s.settings?.targetWeight === 62, JSON.stringify(s.settings || {}));
      check('1b. 可设置计划日期与每日热量目标', !!s.settings?.startDate && !!s.settings?.targetDate && s.settings?.dailyCalorieGoal === 1800);
      check('1c. 目标页提供 BMI 参考与免责说明', text().includes('BMI') && text().includes('不是健康诊断'));

      // --- 2/3. 体重记录与趋势图 ---
      await nav('weight');
      for (const [date, val] of [[dk(-6), 72.0], [dk(-4), 71.4], [dk(-2), 70.8], [T, 70.2]]) {
        setVal('#w-date', date);
        setVal('#w-value', String(val));
        setVal('#w-note', '');
        submit('#weight-form');
        await tick(100);
      }
      s = data();
      check('2. 可添加体重记录（多条）', s.weights?.length === 4, '条数=' + s.weights?.length);
      check('3. 体重趋势图随真实记录更新', !!q('#view .chart svg'), 'SVG 折线已渲染');

      setVal('#w-date', dk(-4));
      setVal('#w-value', '71.0');
      submit('#weight-form');
      await tick(120);
      s = data();
      check('2b. 同一天重复填写会更新，不产生重复数据', s.weights.length === 4 && s.weights.find((w) => w.date === dk(-4))?.weight === 71, '条数=' + s.weights.length);

      const firstId = s.weights.find((w) => w.date === dk(-4)).id;
      const editBtn = q(`[data-action="edit-weight"][data-id="${firstId}"]`);
      check('2c. 历史体重记录提供修改入口', !!editBtn);
      if (editBtn) {
        editBtn.click();
        await tick(140);
        setVal('#w-value', '71.2');
        submit('#weight-form');
        await tick(140);
      }
      check('2c. 可修改历史体重记录', data().weights.find((w) => w.id === firstId)?.weight === 71.2, '新值=' + data().weights.find((w) => w.id === firstId)?.weight);

      for (const range of ['7', '30', '90', 'all']) {
        click(`[data-action="weight-range"][data-value="${range}"]`);
        await tick(110);
        check(`3b. 体重图表 ${range} 范围正常`, !!q('#view .chart svg'));
      }
      click('[data-action="weight-range"][data-value="30"]');
      await tick(100);

      const delId = data().weights.find((w) => w.date === dk(-2)).id;
      click(`[data-action="delete-weight"][data-id="${delId}"]`);
      await tick(110);
      check('2d. 删除体重记录前二次确认', !!q('[data-confirm]') && q('#modal-root').textContent.includes('删除体重记录'));
      click('[data-cancel]');
      await tick(110);
      check('2d. 取消确认不会删除数据', data().weights.length === 4);
      click(`[data-action="delete-weight"][data-id="${delId}"]`);
      await tick(90);
      click('[data-confirm]');
      await tick(150);
      check('2d. 确认后可删除体重记录', data().weights.length === 3 && !data().weights.some((w) => w.id === delId));
      setVal('#w-date', dk(-2));
      setVal('#w-value', '70.8');
      submit('#weight-form');
      await tick(110);

      // --- 4/5/8. 饮食记录、热量汇总、目标 ---
      await nav('diet');
      const meals = [
        ['breakfast', '鸡蛋', '140'], ['breakfast', '牛奶', '150'],
        ['lunch', '米饭', '250'], ['lunch', '鸡胸肉', '200'],
        ['dinner', '面条', '400'], ['snack', '苹果', '80'],
      ];
      for (const [cat, name, kcal] of meals) {
        click(`[data-action="set-category"][data-value="${cat}"]`);
        await tick(60);
        setVal('#meal-name', name);
        setVal('#meal-kcal', kcal);
        submit('#meal-form');
        await tick(100);
      }
      s = data();
      const sum = (s.meals || []).filter((m) => m.date === T).reduce((a, m) => a + m.calories, 0);
      check('4. 可连续添加当天多种饮食记录', s.meals?.length === 6, '条数=' + s.meals?.length);
      check('5. 自动汇总当天总热量 = 1220 kcal', sum === 1220 && text().includes('1,220'), '合计=' + sum);
      check('5b. 按餐次分组显示小计（早 290 / 午 450 / 晚 400）', text().includes('290') && text().includes('450') && text().includes('400'));
      check('8. 展示每日目标、剩余热量与完成比例', text().includes('1,800') && text().includes('剩余热量') && text().includes('68%'), '比例=68%');

      // --- 6. 修改 / 删除饮食记录后重算 ---
      const egg = data().meals.find((m) => m.name === '鸡蛋' && m.date === T);
      click(`[data-action="edit-meal"][data-id="${egg.id}"]`);
      await tick(140);
      setVal('#meal-kcal', '200');
      submit('#meal-form');
      await tick(140);
      const sumAfterEdit = data().meals.filter((m) => m.date === T).reduce((a, m) => a + m.calories, 0);
      check('6a. 修改饮食记录后热量同步更新为 1280', sumAfterEdit === 1280 && text().includes('1,280'), '合计=' + sumAfterEdit);

      const apple = data().meals.find((m) => m.name === '苹果' && m.date === T);
      click(`[data-action="delete-meal"][data-id="${apple.id}"]`);
      await tick(110);
      check('6b. 删除饮食记录前二次确认', !!q('[data-confirm]') && q('#modal-root').textContent.includes('删除饮食记录'));
      click('[data-confirm]');
      await tick(150);
      const sumAfterDel = data().meals.filter((m) => m.date === T).reduce((a, m) => a + m.calories, 0);
      check('6b. 删除饮食记录后热量同步更新为 1200', sumAfterDel === 1200 && text().includes('1,200'), '合计=' + sumAfterDel);

      // --- 7. 过去某一天的饮食 ---
      const past = dk(-3);
      setVal('#meal-date', past);
      await tick(150);
      check('7a. 可切换到过去某一天', q('#diet-date')?.value === past && q('#meal-date')?.value === past, q('#diet-date')?.value);
      click('[data-action="set-category"][data-value="lunch"]');
      await tick(70);
      setVal('#meal-name', '过去的一餐');
      setVal('#meal-kcal', '650');
      submit('#meal-form');
      await tick(140);
      check('7b. 可查看/添加过去某天饮食并汇总', data().meals.some((m) => m.date === past && m.name === '过去的一餐') && text().includes('650'));
      click('[data-action="diet-today"]');
      await tick(140);
      check('7c. 回到今天仍正确显示 1200 kcal', text().includes('1,200'));
      click('[data-action="calorie-range"][data-value="30"]');
      await tick(120);
      check('7d. 30 天每日热量趋势图正常', !!q('#view .chart svg'));
      click('[data-action="calorie-range"][data-value="7"]');
      await tick(110);
      await nav('history');
      check('7e. 历史页按日期对齐体重与当日热量', !!q('.history-table') && qa('.history-row').some((r) => r.textContent.includes('650')));
      check('7f. 历史页显示每周平均摄入热量', text().includes('每周平均摄入热量') && text().includes('kcal'));

      // --- 8. 调整 / 移除热量目标 ---
      await nav('goal');
      setVal('#g-goal', '1600');
      submit('#goal-form');
      await tick(140);
      check('8a. 可调整每日热量目标', data().settings.dailyCalorieGoal === 1600, '目标=' + data().settings.dailyCalorieGoal);
      await nav('diet');
      check('8b. 调整后页面立即显示新目标', text().includes('1,600'));
      await nav('goal');
      setVal('#g-goal', '');
      submit('#goal-form');
      await tick(140);
      check('8c. 可移除每日热量目标', data().settings.dailyCalorieGoal === null);
      await nav('diet');
      check('8d. 未设置目标时只显示实际摄入，不显示剩余热量', !text().includes('剩余热量') && text().includes('尚未设置每日热量目标'));
      await nav('goal');
      setVal('#g-goal', '1800');
      submit('#goal-form');
      await tick(140);

      // --- 10. 导出 / 恢复 / 清空二次确认 ---
      await nav('home');
      click('[data-action="open-settings"]');
      await tick(130);
      let captured = null;
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { captured = { href: this.href, download: this.download }; };
      try { click('[data-action="export"]'); } finally { HTMLAnchorElement.prototype.click = origClick; }
      check('10a. 导出生成 JSON 备份文件', !!captured && /\.json$/.test(captured.download), captured?.download || '');
      let backup = null;
      if (captured) backup = JSON.parse(await (await fetch(captured.href)).text());
      const snapshot = { weights: data().weights.length, meals: data().meals.length, settings: { ...data().settings } };
      check('10b. 导出内容包含全部记录与设置', !!backup && backup.weights.length === snapshot.weights && backup.meals.length === snapshot.meals && backup.settings.targetWeight === 62);

      const restore = async (payload) => {
        const dt = new DataTransfer();
        dt.items.add(new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' }));
        const input = q('#import-file');
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await tick(170);
        return !!q('[data-action="import-confirm"]');
      };

      const modified = { ...backup, settings: { ...backup.settings, targetWeight: 60 } };
      const confirmShown = await restore(modified);
      check('10c. 恢复数据前二次确认', confirmShown && q('#import-confirm').textContent.includes('覆盖'));
      click('[data-action="import-confirm"]');
      await tick(180);
      check('10d. JSON 恢复后数据被正确替换', data().settings.targetWeight === 60 && data().weights.length === snapshot.weights, '目标=' + data().settings.targetWeight);

      click('[data-action="open-settings"]');
      await tick(110);
      await restore(backup);
      click('[data-action="import-confirm"]');
      await tick(180);
      check('10e. 可再次恢复原备份', data().settings.targetWeight === 62);

      click('[data-action="open-settings"]');
      await tick(110);
      click('[data-action="clear-ask"]');
      await tick(110);
      click('[data-action="clear-confirm"]');
      await tick(130);
      check('10f. 清空需输入「清空」，不匹配时不删除', data().weights.length === snapshot.weights);
      setVal('#clear-input', '清空');
      click('[data-action="clear-confirm"]');
      await tick(180);
      check('10g. 二次确认后清空生效', data().weights.length === 0 && data().meals.length === 0);
      click('[data-action="open-settings"]');
      await tick(110);
      await restore(backup);
      click('[data-action="import-confirm"]');
      await tick(180);
      check('10h. 清空后仍能从备份完整恢复', data().weights.length === snapshot.weights && data().meals.length === snapshot.meals);

      // --- 首页概览字段 ---
      await nav('home');
      const homeText = text();
      check('首页展示体重概览全部字段', homeText.includes('70.2') && homeText.includes('初始体重') && homeText.includes('目标体重') && homeText.includes('距离目标') && homeText.includes('当前减重进度'));
      const expectedPct = Math.round((1200 / 1800) * 100);
      check('首页展示今日热量 / 目标 / 比例 / 剩余预算', homeText.includes('1,200') && homeText.includes('1,800') && homeText.includes('剩余') && homeText.includes(`${expectedPct}%`), `预期 ${expectedPct}%`);
      check('首页展示今日记录状态与最近记录时间', homeText.includes('今日记录') && homeText.includes('最近记录'));
      check('无虚构数据：记录条数与存储一致', data().weights.length === snapshot.weights && data().meals.length === snapshot.meals);

      sessionStorage.setItem('qh-snapshot', JSON.stringify({
        weights: data().weights.length,
        meals: data().meals.length,
        settings: { ...data().settings },
      }));
    } catch (err) {
      check('套件执行异常', false, (err && (err.stack || err.message)) || String(err));
    }
    return results;
  };

  window.__verifyPersisted = async function () {
    const out = [];
    try {
      await tick(220);
      const snap = JSON.parse(sessionStorage.getItem('qh-snapshot') || '{}');
      const d = data();
      out.push({
        name: '9. 刷新网页后全部记录保留',
        ok: d.weights?.length === snap.weights && d.meals?.length === snap.meals && d.settings?.targetWeight === snap.settings?.targetWeight,
        detail: `体重 ${d.weights?.length} 条 / 饮食 ${d.meals?.length} 条 / 目标 ${d.settings?.targetWeight} kg`,
      });
      const home = text();
      out.push({ name: '9b. 刷新后首页仍正确渲染', ok: home.includes('1,200') && home.includes('70.2') && home.includes('今日记录'), detail: '' });
    } catch (err) {
      out.push({ name: '刷新校验异常', ok: false, detail: err.message });
    }
    return out;
  };

  window.__layout = function () {
    const tabbar = q('#tabbar');
    const desk = q('.desk-nav');
    const grid = q('.home-grid');
    return {
      innerWidth: window.innerWidth,
      tabbar: getComputedStyle(tabbar).display,
      deskNav: getComputedStyle(desk).display,
      homeCols: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      quickButtons: qa('.quick-actions .btn').length,
    };
  };
})();
