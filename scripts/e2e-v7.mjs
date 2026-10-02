// CDP-driven E2E for v7 — minimal, robust version.
// Uses raw WebSocket API (Node 22 built-in) to talk to Chrome DevTools.

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://localhost:3100';
const PORT = 9334;
const USER_DIR = join(tmpdir(), 'chrome-v7-' + Date.now());
mkdirSync(USER_DIR, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
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
  console.log('[e2e] spawning Chrome on port', PORT);
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

  // Wait for debug port
  const debugJsonUrl = `http://127.0.0.1:${PORT}/json`;
  await waitFor(async () => {
    const v = await getJson(debugJsonUrl);
    return v.length > 0 ? v : null;
  });
  console.log('[e2e] chrome ready');

  // Open new tab
  const newTab = await fetch(debugJsonUrl + '/new?' + encodeURIComponent(URL), { method: 'PUT' }).then(r => r.json());
  const wsUrl = newTab.webSocketDebuggerUrl;
  console.log('[e2e] new tab:', wsUrl);

  // Connect WebSocket
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
    setTimeout(() => reject(new Error('ws timeout')), 5000);
  });
  console.log('[e2e] ws connected');

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

  await rpc('Page.enable');
  await rpc('Runtime.enable');

  // Wait for the page to finish loading
  await new Promise((resolve) => {
    const handler = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.method === 'Page.loadEventFired') {
        ws.removeEventListener('message', handler);
        resolve();
      }
    };
    ws.addEventListener('message', handler);
    // safety net: 15s
    setTimeout(resolve, 15000);
  });
  await sleep(1000); // small grace for hydration

  async function evalJs(expr) {
    const r = await rpc('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error('JS error: ' + JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
    }
    return r.result.value;
  }

  // 1. Wait for textarea
  await evalJs(`
    (async () => {
      for (let i = 0; i < 60; i++) {
        if (document.querySelector('textarea')) return true;
        await new Promise(r => setTimeout(r, 100));
      }
      throw new Error('no textarea');
    })()
  `);
  console.log('[c] composer ready');

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

  // 3. Stub clipboard BEFORE clicking
  await evalJs(`
    window.__clipCalls = [];
    navigator.clipboard.writeText = async (t) => { window.__clipCalls.push(t); };
  `);

  // 4. Click AI Optimize
  await evalJs(`
    (() => {
      const btn = document.querySelector('[data-testid="composer-ai-optimize"]');
      if (!btn) throw new Error('no AI button');
      btn.click();
    })()
  `);
  console.log('[c] clicked AI Optimize');

  // 5. Wait for the card to reach a terminal state (done/error) or for the
  // optimized text to appear. AI takes ~30s/round, so we wait up to 90s.
  await evalJs(`
    (async () => {
      for (let i = 0; i < 300; i++) {
        const card = document.querySelector('[data-testid="auto-optimized-card"]');
        const errorCard = document.querySelector('[data-testid="auto-optimized-error"]');
        const optText = document.querySelector('[data-testid="auto-optimized-text"]');
        const noImp = document.querySelector('[data-testid="auto-optimized-no-improvement"]');
        // Done if any terminal state appears
        if (optText || noImp || errorCard) return true;
        await new Promise(r => setTimeout(r, 300));
      }
      throw new Error('card never reached terminal state');
    })()
  `);
  // Inspect what's there
  const cardState = await evalJs(`
    (() => {
      const card = document.querySelector('[data-testid="auto-optimized-card"]');
      const txt = document.querySelector('[data-testid="auto-optimized-text"]');
      const noImp = document.querySelector('[data-testid="auto-optimized-no-improvement"]');
      const copy = document.querySelector('[data-testid="auto-optimized-copy"]');
      const post = document.querySelector('[data-testid="auto-optimized-post-x"]');
      return {
        card: !!card,
        state: card?.getAttribute('data-state'),
        hasOptimizedText: !!txt,
        optText: txt?.textContent?.slice(0, 80) || null,
        hasNoImprovement: !!noImp,
        noImpText: noImp?.textContent || null,
        hasCopy: !!copy,
        hasPost: !!post,
      };
    })()
  `);
  console.log('[c] card state:', cardState);
  if (!cardState.card) throw new Error('FAIL: card never appeared');
  if (!cardState.hasOptimizedText) throw new Error('FAIL: optimized text block missing');
  const optText = cardState.optText;
  console.log('[c] optimized:', optText);

  // 6. ASSERT: no line-through in optimized block
  const lineThru = await evalJs(`
    Array.from(document.querySelectorAll('[data-testid="auto-optimized-text"] *'))
      .some(el => getComputedStyle(el).textDecorationLine.includes('line-through'))
  `);
  console.log('[c] line-through present?', lineThru);
  if (lineThru) throw new Error('FAIL: line-through still in optimized text');

  // 7. Click Copy button
  await evalJs(`document.querySelector('[data-testid="auto-optimized-copy"]').click()`);
  await sleep(150);
  const copyState = await evalJs(`document.querySelector('[data-testid="auto-optimized-copy"]').getAttribute('data-copy-state')`);
  const clipText = await evalJs(`window.__clipCalls[0] || ''`);
  console.log('[c] copy state:', copyState, '/ clipboard len:', clipText.length);
  if (copyState !== 'copied') throw new Error('FAIL: copy state ' + copyState);
  if (clipText !== optText) throw new Error('FAIL: clipboard text mismatch');

  // 8. ASSERT: Post to 𝕏 link
  const post = await evalJs(`
    (() => {
      const a = document.querySelector('[data-testid="auto-optimized-post-x"]');
      if (!a) return null;
      return { href: a.href, rel: a.rel, target: a.target };
    })()
  `);
  console.log('[c] post link:', post);
  if (!post) throw new Error('FAIL: post link missing');
  if (!post.href.startsWith('https://x.com/intent/post?text=')) throw new Error('FAIL: bad href');
  if (!post.rel.includes('noopener')) throw new Error('FAIL: missing rel');
  if (post.target !== '_blank') throw new Error('FAIL: target');

  // 9. ASSERT: Show changes → diff appears
  await evalJs(`document.querySelector('[data-testid="auto-optimized-show-changes"]').click()`);
  await sleep(300);
  const diffVisible = await evalJs(`!!document.querySelector('[data-testid="auto-optimized-diff"]')`);
  console.log('[c] diff visible:', diffVisible);
  if (!diffVisible) throw new Error('FAIL: diff did not show');

  // 10. Screenshot
  const shot = await rpc('Page.captureScreenshot', { format: 'png' });
  writeFileSync('/tmp/v7-e2e-result.png', Buffer.from(shot.data, 'base64'));
  console.log('[c] screenshot saved');

  console.log('[c] ALL ASSERTIONS PASS ✓');
  ws.close();
  chrome.kill('SIGKILL');
  await sleep(500);
  process.exit(0);
}

main().catch((err) => {
  console.error('[c] FAIL:', err.message);
  process.exit(1);
});