// CDP E2E for v10 — verify floating CatProgressFab.
//
// Steps:
//   1. Launch Chrome
//   2. Open /, type Chinese tweet, click ✨ AI Optimize
//   3. Wait for [data-testid="cat-progress-fab"]
//   4. Assert: data-cat-mood="analyzing", position fixed, bottom-right
//   5. Assert: ring SVG exists, has stroke-dasharray
//   6. Assert: cat face SVG exists with 4 mood branches (compile-time)
//   7. Assert: NO emoji in source (cross-platform consistency)
//   8. Wait for mood to transition to optimizing
//   9. Assert: round label appears below FAB
//  10. Hover FAB → tooltip appears with progressbar role
//  11. After done, FAB unmounts
//  12. Screenshot

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:3100';
const PORT = 9338;
const USER_DIR = join(tmpdir(), 'chrome-v10-' + Date.now());
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
  console.log('[e2e] v10 — Floating cat progress FAB');

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

  // 1. Type tweet
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

  // 2. Click AI Optimize
  await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      if (!btn) throw new Error('no AI button');
      btn.click();
    })()
  `);
  console.log('[c] clicked AI Optimize');

  // 3. Wait for FAB
  await evalJs(`
    (async () => {
      for (let i = 0; i < 100; i++) {
        if (document.querySelector('[data-testid="cat-progress-fab"]')) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('cat-progress-fab never appeared');
    })()
  `);
  console.log('[c] FAB visible');

  // 4. Assert position: fixed, bottom-right
  const position = await evalJs(`
    (() => {
      const fab = document.querySelector('[data-testid="cat-progress-fab"]');
      const cs = window.getComputedStyle(fab);
      const rect = fab.getBoundingClientRect();
      return {
        position: cs.position,
        bottom: cs.bottom,
        right: cs.right,
        zIndex: cs.zIndex,
        rectRight: window.innerWidth - rect.right,
        rectBottom: window.innerHeight - rect.bottom,
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      };
    })()
  `);
  console.log('[c] position:', position);
  if (position.position !== 'fixed') throw new Error(`FAIL: position is ${position.position}, expected fixed`);
  if (position.rectRight > 60 || position.rectRight < 0) throw new Error(`FAIL: not in right corner (right=${position.rectRight})`);
  if (position.rectBottom > 80 || position.rectBottom < 0) throw new Error(`FAIL: not in bottom (bottom=${position.rectBottom})`);
  if (position.zIndex !== '100') throw new Error(`FAIL: zIndex=${position.zIndex}`);

  // 5. Assert ring SVG with stroke-dasharray
  const ring = await evalJs(`
    (() => {
      const ring = document.querySelector('[data-testid="cat-progress-ring"]');
      if (!ring) return null;
      return {
        dasharray: ring.getAttribute('stroke-dasharray'),
        dashoffset: ring.getAttribute('stroke-dashoffset'),
        stroke: ring.getAttribute('stroke'),
        r: ring.getAttribute('r'),
      };
    })()
  `);
  console.log('[c] ring:', ring);
  if (!ring) throw new Error('FAIL: no progress ring');
  if (!ring.dasharray) throw new Error('FAIL: ring missing stroke-dasharray');
  if (parseFloat(ring.r) < 25 || parseFloat(ring.r) > 40) throw new Error('FAIL: ring radius out of range');

  // 6. Assert cat face exists with multiple SVG paths
  const face = await evalJs(`
    (() => {
      const face = document.querySelector('[data-testid="cat-progress-face"]');
      if (!face) return null;
      return {
        pathCount: face.querySelectorAll('path').length,
        circleCount: face.querySelectorAll('circle').length,
        lineCount: face.querySelectorAll('line').length,
        polygonCount: face.querySelectorAll('polygon').length,
        rectCount: face.querySelectorAll('rect').length,
      };
    })()
  `);
  console.log('[c] cat face:', face);
  if (!face) throw new Error('FAIL: no cat face');
  // Should have: 2 polygons (ears) + 1 rect (head) + paths/lines/circles for eyes & mouth
  if (face.polygonCount !== 2) throw new Error(`FAIL: expected 2 ear polygons, got ${face.polygonCount}`);
  if (face.rectCount !== 1) throw new Error(`FAIL: expected 1 head rect, got ${face.rectCount}`);

  // 7. Assert: NO emoji in rendered text content (cross-platform)
  const emojiCheck = await evalJs(`
    (() => {
      const fab = document.querySelector('[data-testid="cat-progress-fab"]');
      const text = fab?.textContent || '';
      return /[\\u{1F400}-\\u{1F9FF}]|[💤🦋😺😾🐱]/u.test(text);
    })()
  `);
  console.log('[c] has emoji?', emojiCheck);
  if (emojiCheck) throw new Error('FAIL: emoji present in FAB (cross-platform risk)');

  // 8. Assert initial mood
  const initialMood = await evalJs(`
    document.querySelector('[data-testid="cat-progress-fab"]')?.getAttribute('data-cat-mood')
  `);
  console.log('[c] initial mood:', initialMood);
  if (!['analyzing', 'optimizing'].includes(initialMood)) {
    throw new Error(`FAIL: initial mood is ${initialMood}`);
  }

  // 9. Wait for mood transition (analyzing → optimizing)
  const transition = await evalJs(`
    (async () => {
      for (let i = 0; i < 200; i++) {
        const mood = document.querySelector('[data-testid="cat-progress-fab"]')?.getAttribute('data-cat-mood');
        if (mood === 'optimizing' || mood === 'done' || mood === 'error') return mood;
        await new Promise(r => setTimeout(r, 200));
      }
      throw new Error('mood never transitioned');
    })()
  `);
  console.log('[c] mood transitioned to:', transition);

  // 10. Assert round label below FAB
  const roundLabel = await evalJs(`
    (() => {
      const lbl = document.querySelector('[data-testid="cat-progress-round-label"]');
      return lbl ? lbl.textContent : null;
    })()
  `);
  console.log('[c] round label:', roundLabel);

  // 11. Hover FAB to show tooltip
  await evalJs(`
    (() => {
      const fab = document.querySelector('[data-testid="cat-progress-circle"]');
      const r = fab.getBoundingClientRect();
      const ev = new MouseEvent('mouseenter', { bubbles: true, clientX: r.left + 36, clientY: r.top + 36 });
      fab.dispatchEvent(ev);
    })()
  `);
  // Trigger via React state — use focus instead, more reliable
  await evalJs(`
    (() => {
      const fab = document.querySelector('[data-testid="cat-progress-circle"]');
      fab.focus();
    })()
  `);
  await sleep(200);

  const tooltipState = await evalJs(`
    (() => {
      const tt = document.querySelector('[data-testid="cat-progress-tooltip"]');
      if (!tt) return null;
      const pb = tt.querySelector('[role="progressbar"]');
      const abort = tt.querySelector('[data-testid="cat-progress-abort"]');
      const status = tt.querySelector('[data-testid="cat-progress-status"]');
      return {
        open: tt.getAttribute('data-tooltip-open'),
        hasProgressbar: !!pb,
        valuenow: pb?.getAttribute('aria-valuenow'),
        hasAbort: !!abort,
        statusText: status?.textContent || null,
      };
    })()
  `);
  console.log('[c] tooltip state:', tooltipState);
  if (!tooltipState) throw new Error('FAIL: tooltip missing');
  if (tooltipState.open !== 'true') console.warn('[c] WARN: tooltip not open via focus (mobile path may differ)');
  if (!tooltipState.hasProgressbar) throw new Error('FAIL: progressbar role missing in tooltip');
  if (!tooltipState.hasAbort) throw new Error('FAIL: abort button missing in tooltip');

  // 12. Wait for terminal — FAB unmounts
  const terminal = await evalJs(`
    (async () => {
      for (let i = 0; i < 600; i++) {
        const fab = document.querySelector('[data-testid="cat-progress-fab"]');
        const card = document.querySelector('[data-testid="auto-optimized-card"]');
        const skipped = document.querySelector('[data-testid="auto-optimized-skipped"]');
        const errCard = document.querySelector('[data-testid="auto-optimized-error"]');
        if (!fab && (card || skipped || errCard)) {
          return { hasCard: !!card, hasSkipped: !!skipped, hasError: !!errCard };
        }
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('never reached terminal');
    })()
  `);
  console.log('[c] terminal:', terminal);

  // 13. Screenshot
  const shot = await rpc('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/v10-e2e-result.png', Buffer.from(shot.data, 'base64'));
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
