import { describe, it, expect } from 'vitest';
import { ScoreEngine } from '../engine';

const ZH_ORIGINAL = '突发：全球债务现已超过365万亿美元。这大约是全球GDP的310%。有史以来最高纪录。我们他妈的到底欠谁的钱？？';

const engine = new ScoreEngine();

describe('v6 Chinese score integration', () => {
  it('original scores > 0 (sanity)', () => {
    const r = engine.evaluate({ text: ZH_ORIGINAL, platform: 'x', isThread: false, hasMedia: false });
    expect(r.score).toBeGreaterThan(0);
  });

  it('original ends with ？ → reply fires (was 0 before v6)', () => {
    const r = engine.evaluate({ text: ZH_ORIGINAL, platform: 'x', isThread: false, hasMedia: false });
    expect(r.signalScores.reply.score).toBeGreaterThan(0);
  });

  it('well-optimized Chinese version scores 45+ (was 38 before)', () => {
    const opt3 = '说个冷知识。\n\n全球债务已经突破365万亿美元，相当于全球GDP的310%。\n\n有史以来最高纪录。\n\n你怎么看？';
    const r = engine.evaluate({ text: opt3, platform: 'x', isThread: false, hasMedia: false });
    expect(r.score).toBeGreaterThanOrEqual(45);
  });

  it('English reply fires when ending in ?', () => {
    const en = "Who are we paying?";
    const s = engine.evaluate({ text: en, platform: 'x', isThread: false, hasMedia: false });
    expect(s.signalScores.reply.score).toBeGreaterThan(0);
  });

  it('English tweet still works without regression', () => {
    const en = "I just read that global debt hit $365 trillion — 310% of GDP. Who exactly are we paying?";
    const s = engine.evaluate({ text: en, platform: 'x', isThread: false, hasMedia: false });
    expect(s.score).toBeGreaterThan(40);
  });
});
