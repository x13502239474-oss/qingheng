/**
 * 真实浏览器端到端验收（Chrome DevTools Protocol，零第三方依赖）。
 * 启动 -> 清空本地存储 -> 注入验收套件 -> 刷新持久化校验 -> 桌面/手机视口检查与截图。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'tests', 'screenshots');
const APP = process.env.APP_URL || 'http://127.0.0.1:5173/';
const CDP_PORT = 9200 + Math.floor(Math.random() * 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

async function main() {
  // 服务可用性
  try {
    const r = await fetch(APP);
    if (!r.ok) throw new Error('HTTP ' + r.status);
  } catch (e) {
    throw new Error(`本地服务未启动（${APP}）：${e.message}。请先运行 npm start`);
  }

  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error('未找到 Chrome / Edge 可执行文件');

  mkdirSync(SHOTS, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'qingheng-chrome-'));
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--hide-scrollbars',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
    '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  let ws;
  const cleanup = () => {
    try { if (ws) ws.close(); } catch { /* ignore */ }
    try { chrome.kill(); } catch { /* ignore */ }
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 800);
  };

  try {
    // 等待调试端口
    let ready = false;
    for (let i = 0; i < 80; i += 1) {
      try {
        const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (r.ok) { ready = true; break; }
      } catch { /* 尚未启动 */ }
      await sleep(150);
    }
    if (!ready) throw new Error('Chrome 调试端口未就绪');

    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('没有可用的页面目标');

    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });

    let msgId = 0;
    const pending = new Map();
    const browserErrors = [];
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        browserErrors.push('EXCEPTION: ' + (d.exception?.description || d.text));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        browserErrors.push('CONSOLE: ' + msg.params.args.map((a) => a.value || a.description).join(' '));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        browserErrors.push('LOG: ' + msg.params.entry.text + ' @ ' + (msg.params.entry.url || ''));
      }
      if (!msg.id || !pending.has(msg.id)) return;
      const { resolve: ok, reject: bad } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) bad(new Error(msg.error.message));
      else ok(msg.result);
    });

    const send = (method, params = {}) => new Promise((ok, bad) => {
      const id = ++msgId;
      pending.set(id, { resolve: ok, reject: bad });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); bad(new Error(`CDP 超时: ${method}`)); }
      }, 20000);
    });

    const ev = async (expression, awaitPromise = false) => {
      const r = await send('Runtime.evaluate', {
        expression, awaitPromise, returnByValue: true, userGesture: true,
      });
      if (r.exceptionDetails) {
        throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      }
      return r.result.value;
    };

    const waitReady = async () => {
      for (let i = 0; i < 90; i += 1) {
        try {
          if (await ev("document.readyState === 'complete' && !!document.querySelector('#view .view-page')")) return;
        } catch { /* 页面还在加载 */ }
        await sleep(120);
      }
      const info = await ev("JSON.stringify({href:location.href,title:document.title,ready:document.readyState,html:document.documentElement.outerHTML.slice(0,500)})").catch(() => '?');
      throw new Error('应用未加载完成。浏览器错误：\n' + browserErrors.join('\n') + '\n页面信息：' + info);
    };

    const injectSuite = () => ev(`(async () => {
      const s = document.createElement('script');
      s.src = '/tests/suite.js?t=' + Date.now();
      document.head.appendChild(s);
      await new Promise((ok, bad) => { s.onload = ok; s.onerror = () => bad(new Error('suite.js 加载失败')); });
      return typeof window.__runSuite === 'function';
    })()`, true);

    const viewport = async (width, height, dpr, mobile) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: dpr, mobile,
        screenWidth: width, screenHeight: height,
      });
      await sleep(320);
    };

    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(join(SHOTS, name), Buffer.from(r.data, 'base64'));
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');

    // 干净起点：清掉本地数据并刷新一次
    await send('Page.navigate', { url: APP });
    await waitReady();
    await ev('localStorage.clear(); true');
    await send('Page.reload', { ignoreCache: true });
    await waitReady();

    const injected = await injectSuite();
    if (!injected) throw new Error('验收套件注入失败');
    const suiteResults = await ev('window.__runSuite()', true);

    // 真·刷新：重新加载页面后再校验持久化
    await send('Page.reload', { ignoreCache: true });
    await waitReady();
    await injectSuite();
    const persistResults = await ev('window.__verifyPersisted()', true);

    // 桌面布局 + 截图
    await ev("location.hash = '#/home'");
    await sleep(260);
    await viewport(1280, 900, 1, false);
    const desktop = await ev('window.__layout()');
    await shot('desktop-home.png');

    // 手机布局 + 截图
    await viewport(390, 844, 2, true);
    const mobile = await ev('window.__layout()');
    await shot('mobile-home.png');

    // 手机端点击「记饮食」快捷入口，验证导航可用
    const mobileNav = await ev("document.querySelector('.quick-actions .btn:nth-child(2)').click(); location.hash");
    await sleep(220);
    await shot('mobile-diet.png');

    // 桌面饮食页截图
    await viewport(1280, 900, 1, false);
    await ev("location.hash = '#/diet'");
    await sleep(280);
    await shot('desktop-diet.png');

    const checks = [
      ...suiteResults,
      ...persistResults,
      {
        name: '11a. 桌面：顶部导航 / 底部标签隐藏 / 首页双栏 / 无横向溢出',
        ok: desktop.deskNav !== 'none' && desktop.tabbar === 'none' && desktop.homeCols === 2 && desktop.overflow <= 1,
        detail: JSON.stringify(desktop),
      },
      {
        name: '11b. 手机：底部标签 / 顶部导航隐藏 / 快捷入口可用 / 无横向溢出',
        ok: mobile.tabbar !== 'none' && mobile.deskNav === 'none' && mobile.overflow <= 1 && mobile.quickButtons === 2,
        detail: JSON.stringify(mobile),
      },
      {
        name: '11c. 手机端快捷入口可跳转到饮食页',
        ok: mobileNav === '#/diet',
        detail: mobileNav,
      },
    ];

    const pass = checks.filter((c) => c.ok).length;
    const fail = checks.length - pass;
    console.log('\n================ 浏览器验收结果 ================');
    for (const c of checks) {
      console.log(`${c.ok ? '[PASS]' : '[FAIL]'} ${c.name}${c.detail && !c.ok ? `  -> ${c.detail}` : ''}`);
    }
    console.log('=================================================');
    console.log(`合计 ${checks.length} 项：通过 ${pass}，失败 ${fail}`);
    writeFileSync(join(ROOT, 'tests', 'report.json'), JSON.stringify({ checks, pass, fail, desktop, mobile }, null, 2));
    console.log(`截图目录：${SHOTS}`);

    cleanup();
    if (fail > 0) process.exitCode = 1;
  } catch (err) {
    cleanup();
    console.error('端到端测试执行失败：', err && (err.stack || err.message));
    process.exitCode = 1;
  }
}

main();
