// CDP E2E for v11 — verify AI Optimize button state transitions.
//
// The bug: button used to get stuck on "处理中…" forever after the first run
// because the page checked `appliedText === null` which is always true.
//
// Steps:
//   1. Open /, type Chinese tweet, click ✨ AI Optimize
//   2. Within 0.5s, data-button-state="running", disabled=true, label 含 "处理中"
//   3. Wait for completion → data-button-state="result-ready", disabled=false, label="✨ 再优化一次"
//   4. Click the result-ready button → goes back to "running"
//   5. Verify: at no point does the button stay stuck on "处理中" while results are visible
//   6. Screenshot

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:3100';
const PORT = 9340;
const USER_DIR = join(tmpdir(), 'chrome-v11-' + Date.now());
mkdirSync(USER_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function waitFor(fn, timeoutMs = 30000, intervalMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timeout (${timeoutMs}ms)`);
}

async function main() {
  console.log('[e2e] v11 — Button state fix');

  console.log('[chrome] launching on port', PORT);
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + USER_DIR,
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );

  await waitFor(async () => {
    const v = await getJson(`http://127.0.0.1:${PORT}/json`);
    return v.length > 0 ? v : null;
  });
  console.log('[c] chrome ready');

  const newTab = await fetch(
    `http://127.0.0.1:${PORT}/json/new?` + encodeURIComponent(URL),
    { method: 'PUT' },
  ).then((r) => r.json());
  const ws = new WebSocket(newTab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
    setTimeout(() => rej(new Error('ws timeout')), 5000);
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const data = JSON.parse(ev.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result);
    }
  });
  function rpc(method, params = {}) {
    const reqId = ++id;
    return new Promise((resolve, reject) => {
      pending.set(reqId, { resolve, reject });
      ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }
  async function evalJs(expr) {
    const r = await rpc('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error('JS error: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }

  await rpc('Page.enable');
  await rpc('Runtime.enable');

  await new Promise((resolve) => {
    const handler = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', handler);
        resolve();
      }
    };
    ws.addEventListener('message', handler);
    setTimeout(resolve, 15000);
  });
  await sleep(1500);

  // 1. Initial state — button should be idle
  const initial = await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      return {
        state: btn?.getAttribute('data-button-state'),
        disabled: btn?.disabled,
        ariaDisabled: btn?.getAttribute('aria-disabled'),
        label: btn?.textContent,
      };
    })()
  `);
  console.log('[c] initial:', initial);
  if (initial.state !== 'idle') throw new Error(`FAIL: initial state should be idle, got ${initial.state}`);
  // Empty textarea → button disabled by textTooShort, that's correct
  if (initial.disabled !== true) throw new Error('FAIL: empty textarea should disable button');
  if (initial.ariaDisabled !== 'true') throw new Error('FAIL: aria-disabled missing');
  if (!initial.label?.includes('AI')) throw new Error(`FAIL: initial label missing "AI": ${initial.label}`);

  // 2. Type tweet
  const TWEET = '突发:全球债务现已超过365万亿美元。这大约是全球GDP的310%。有史以来最高纪录。我们他妈的到底欠谁的钱??';
  await evalJs(`
    (() => {
      const ta = document.querySelector('textarea');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(TWEET)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  console.log('[c] tweet typed');

  // 3. Click AI Optimize
  await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      btn.click();
    })()
  `);
  console.log('[c] clicked AI Optimize');

  // 4. Within 0.5s button should transition to running
  await evalJs(`
    (async () => {
      for (let i = 0; i < 50; i++) {
        const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
        if (btn?.getAttribute('data-button-state') === 'running') return true;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('button never went to running');
    })()
  `);
  const running = await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      return {
        state: btn?.getAttribute('data-button-state'),
        disabled: btn?.disabled,
        ariaDisabled: btn?.getAttribute('aria-disabled'),
        label: btn?.textContent,
      };
    })()
  `);
  console.log('[c] running:', running);
  if (running.state !== 'running') throw new Error(`FAIL: state should be running`);
  if (running.disabled !== true) throw new Error('FAIL: running button should be disabled');
  if (running.ariaDisabled !== 'true') throw new Error('FAIL: aria-disabled missing');
  if (!running.label?.includes('处理中')) throw new Error(`FAIL: label should include 处理中, got: ${running.label}`);

  // 5. Wait for completion — this is the bug fix verification
  const terminal = await evalJs(`
    (async () => {
      for (let i = 0; i < 600; i++) {
        const card = document.querySelector('[data-testid="auto-optimized-card"]');
        const optText = document.querySelector('[data-testid="auto-optimized-text"]');
        const noImp = document.querySelector('[data-testid="auto-optimized-no-improvement"]');
        const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
        if ((optText || noImp) && btn?.getAttribute('data-button-state') === 'result-ready') {
          return {
            buttonState: btn.getAttribute('data-button-state'),
            buttonLabel: btn.textContent,
            disabled: btn.disabled,
            ariaDisabled: btn.getAttribute('aria-disabled'),
          };
        }
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('button never reached result-ready');
    })()
  `);
  console.log('[c] terminal button:', terminal);
  if (terminal.buttonState !== 'result-ready') {
    throw new Error(`FAIL: button should be result-ready after done, got ${terminal.buttonState}`);
  }
  if (terminal.disabled !== false) {
    throw new Error('FAIL: result-ready button should be enabled (the original bug)');
  }
  if (!terminal.buttonLabel?.includes('再优化')) {
    throw new Error(`FAIL: button label should say 再优化, got: ${terminal.buttonLabel}`);
  }
  console.log('[c] ✓ Bug fixed: button is enabled after done with label "' + terminal.buttonLabel + '"');

  // 6. Click the result-ready button — should go back to running
  await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      btn.click();
    })()
  `);

  // Wait for running again
  await evalJs(`
    (async () => {
      for (let i = 0; i < 50; i++) {
        const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
        if (btn?.getAttribute('data-button-state') === 'running') return true;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('button did not restart on re-click');
    })()
  `);
  const rerunRunning = await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      return {
        state: btn?.getAttribute('data-button-state'),
        disabled: btn?.disabled,
      };
    })()
  `);
  console.log('[c] re-run started:', rerunRunning);
  if (rerunRunning.state !== 'running') throw new Error('FAIL: re-click should go back to running');
  if (rerunRunning.disabled !== true) throw new Error('FAIL: re-running button should be disabled');

  // 7. Screenshot (capture during running state with round counter if possible)
  await sleep(2000);
  const shot = await rpc('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/v11-e2e-result.png', Buffer.from(shot.data, 'base64'));
  console.log('[c] screenshot saved');

  console.log('\n[c] ALL ASSERTIONS PASS ✓');
  ws.close();
  chrome.kill('SIGKILL');
  await sleep(500);
  process.exit(0);
}

main().catch((err) => {
  console.error('[c] FAIL:', err.message);
  process.exit(1);
});
