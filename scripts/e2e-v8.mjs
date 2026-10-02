// CDP E2E for v8 — verify Hook rewrites × 3 is gone.
//
// Steps:
//   1. Launch Chrome
//   2. POST /api/suggest { type: 'hook' } → expect 400
//   3. POST /api/suggest { type: 'cta' } → expect 400
//   4. POST /api/suggest { type: 'self-reply' } → expect 200
//   5. Open browser, type tweet, click ✨ AI Optimize
//   6. Wait for AutoOptimizedCard
//   7. Assert: NO RewritesSection in DOM
//   8. Assert: NO rewrite-{0,1,2} in DOM

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:3100';
const PORT = 9335;
const USER_DIR = join(tmpdir(), 'chrome-v8-' + Date.now());
mkdirSync(USER_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function waitFor(fn, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const v = await fn(); if (v) return v; } catch {}
    await sleep(200);
  }
  throw new Error('waitFor timeout');
}

async function main() {
  console.log('[e2e] v8 — Hook rewrites × 3 cleanup');

  // 1. Test API rejects hook + cta
  console.log('\n[api] POST /api/suggest { type: "hook" }');
  const hookRes = await fetch('http://localhost:3100/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'hello world', type: 'hook' }),
  });
  console.log('  status:', hookRes.status);
  if (hookRes.status !== 400) throw new Error(`FAIL: hook should be 400, got ${hookRes.status}`);
  const hookBody = await hookRes.json();
  console.log('  body:', hookBody);
  if (hookBody.code !== 'VALIDATION_ERROR') throw new Error('FAIL: missing VALIDATION_ERROR');

  console.log('\n[api] POST /api/suggest { type: "cta" }');
  const ctaRes = await fetch('http://localhost:3100/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'hello world', type: 'cta' }),
  });
  console.log('  status:', ctaRes.status);
  if (ctaRes.status !== 400) throw new Error(`FAIL: cta should be 400, got ${ctaRes.status}`);

  console.log('\n[api] POST /api/suggest { } (no type)');
  const noTypeRes = await fetch('http://localhost:3100/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'hello world' }),
  });
  console.log('  status:', noTypeRes.status);
  if (noTypeRes.status !== 400) throw new Error(`FAIL: no-type should be 400, got ${noTypeRes.status}`);

  console.log('\n[api] POST /api/suggest { type: "self-reply" }');
  const srRes = await fetch('http://localhost:3100/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '突发:全球债务已经飙到365万亿美元,这钱到底欠了谁?', type: 'self-reply' }),
  });
  console.log('  status:', srRes.status);
  if (srRes.status !== 200) throw new Error(`FAIL: self-reply should be 200, got ${srRes.status}`);
  const srBody = await srRes.json();
  console.log('  suggestions:', srBody.suggestions?.[0]?.slice(0, 80));

  console.log('\n[api] All 4 API contract checks passed ✓');

  // 2. Browser test
  console.log('\n[chrome] launching on port', PORT);
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + USER_DIR,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  await waitFor(async () => {
    const v = await getJson(`http://127.0.0.1:${PORT}/json`);
    return v.length > 0 ? v : null;
  });
  console.log('[c] chrome ready');

  const newTab = await fetch(`http://127.0.0.1:${PORT}/json/new?` + encodeURIComponent(URL), { method: 'PUT' }).then(r => r.json());
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
    const r = await rpc('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('JS error: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  }

  await rpc('Page.enable');
  await rpc('Runtime.enable');

  // Wait for load
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

  // 3. Type tweet
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

  // 4. Click AI Optimize
  await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      if (!btn) throw new Error('no AI button');
      btn.click();
    })()
  `);
  console.log('[c] clicked AI Optimize');

  // 5. Wait for AutoOptimizedCard to reach a terminal state (done/error/no-improvement).
  // AI takes ~30s/round × up to 5 rounds, so wait up to 240s.
  const cardResult = await evalJs(`
    (async () => {
      for (let i = 0; i < 800; i++) {
        const card = document.querySelector('[data-testid="auto-optimized-card"]');
        const errorCard = document.querySelector('[data-testid="auto-optimized-error"]');
        const optText = document.querySelector('[data-testid="auto-optimized-text"]');
        const noImp = document.querySelector('[data-testid="auto-optimized-no-improvement"]');
        const skipped = document.querySelector('[data-testid="auto-optimized-skipped"]');
        if (card && card.getAttribute('data-state') !== 'running' && (optText || noImp || skipped || errorCard)) {
          return {
            state: card.getAttribute('data-state'),
            hasOptText: !!optText,
            hasNoImp: !!noImp,
            hasSkipped: !!skipped,
            hasError: !!errorCard,
          };
        }
        await new Promise(r => setTimeout(r, 300));
      }
      throw new Error('card never reached terminal state');
    })()
  `);
  console.log('[c] card result:', cardResult);

  // 6. ASSERT: RewritesSection is GONE
  const rewritesSection = await evalJs(`!!document.querySelector('[data-testid="rewrites-section"]')`);
  console.log('[c] rewrites-section present?', rewritesSection);
  if (rewritesSection) throw new Error('FAIL: RewritesSection still present');

  const rewrite0 = await evalJs(`!!document.querySelector('[data-testid="rewrite-0"]')`);
  console.log('[c] rewrite-0 present?', rewrite0);
  if (rewrite0) throw new Error('FAIL: rewrite-0 still present');

  // 7. ASSERT: AutoOptimizedCard reached a valid v7 terminal state (done/error/skipped).
  // The exact sub-state (Copy/Post vs no-improvement) depends on whether the
  // optimizer beat the original — both are valid v7 outcomes. v8 just removed
  // the legacy RewritesSection.
  if (!cardResult.state || cardResult.state === 'running') {
    throw new Error('FAIL: card did not reach terminal');
  }
  if (!cardResult.hasOptText && !cardResult.hasNoImp && !cardResult.hasSkipped && !cardResult.hasError) {
    throw new Error('FAIL: card reached terminal state but no v7 indicator present');
  }

  // 8. ASSERT: Stage indicator for "rewrite" stage is GONE
  const stageNames = await evalJs(`
    Array.from(document.querySelectorAll('[data-stage]'))
      .map(el => el.getAttribute('data-stage'))
  `);
  console.log('[c] stage names:', stageNames);
  if (stageNames.includes('rewrite')) throw new Error('FAIL: rewrite stage still in DOM');

  // 9. ASSERT: No "Hook rewrites × 3" heading anywhere
  const rewritesHeading = await evalJs(`
    Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p'))
      .some(el => /Hook\\s*重写|rewrites\\s*×/i.test(el.textContent || ''))
  `);
  console.log('[c] rewrites heading present?', rewritesHeading);
  if (rewritesHeading) throw new Error('FAIL: rewrites heading still in DOM');

  // 8. Screenshot
  const shot = await rpc('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/v8-e2e-result.png', Buffer.from(shot.data, 'base64'));
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