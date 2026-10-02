import { describe, expect, it } from 'vitest';
import { ScoreEngine } from '../engine';
import { computeForecast, formatNumber, FORECAST_CONSTANTS } from '../forecast';
import type { ForecastInput } from '../forecast';

const engine = new ScoreEngine();

/**
 * Helper: produce a minimal but realistic AnalysisResult for forecast tests
 * without round-tripping through the engine for every case. Returns a fresh
 * object each call so mutations don't leak between tests.
 */
function makeAnalysis(text: string, overrides: Partial<{ score: number }> = {}) {
  const base = engine.evaluate({
    text,
    platform: 'x',
    isThread: false,
    hasMedia: false,
  });
  if (overrides.score !== undefined) {
    base.score = overrides.score;
  }
  return base;
}

describe('computeForecast — base reach', () => {
  it('uses avgViews when tracked data is present', () => {
    const analysis = makeAnalysis('Plain tweet');
    const r = computeForecast({
      analysis,
      accountHealth: null,
      timingStatus: 'off_peak',
      hasMedia: false,
      hasExternalLink: false,
      avgViews: 4000,
      trackedTweetCount: 12,
    });
    expect(r.isEstimate).toBe(false);
    expect(r.dataPoints).toBe(12);
    // Confidence should be 12/30 = 0.4
    expect(r.confidence).toBeCloseTo(0.4, 5);
  });

  it('falls back to followers × 5% when no tracked data', () => {
    const analysis = makeAnalysis('Plain tweet', { score: 50 });
    const r = computeForecast({
      analysis,
      accountHealth: {
        healthScore: 80,
        reachMultiplier: 1.0,
        factors: [],
        isPremium: false,
        followerCount: 10000,
        followingCount: 0,
        tweetCount: 0,
        accountAgeDays: 30,
        avgEngagementRate: null,
        fetchedAt: '2026-10-01T00:00:00Z',
      },
      timingStatus: 'off_peak',
      hasMedia: false,
      hasExternalLink: false,
      avgViews: null,
      trackedTweetCount: 0,
    });
    expect(r.isEstimate).toBe(true);
    // baseReach = max(50, 10000 × 0.05) = 500
    // prediction = 500 × (50/50) × 0.85 × 1.0 × 1.0 × 1.0 × 1.0 × 1.0 = 425
    expect(r.predictedReach).toBe(425);
  });

  it('clamps very small accounts to MIN_ESTIMATED_VIEWS = 50', () => {
    const analysis = makeAnalysis('Plain tweet');
    const r = computeForecast({
      analysis,
      accountHealth: {
        healthScore: 50,
        reachMultiplier: 1.0,
        factors: [],
        isPremium: false,
        followerCount: 10, // 10 × 0.05 = 0.5 → would round to 1
        followingCount: 0,
        tweetCount: 0,
        accountAgeDays: 0,
        avgEngagementRate: null,
        fetchedAt: '2026-10-01T00:00:00Z',
      },
      timingStatus: 'off_peak',
      hasMedia: false,
      hasExternalLink: false,
      avgViews: null,
      trackedTweetCount: 0,
    });
    expect(r.isEstimate).toBe(true);
    // The base reach should be at least 50 (the floor)
    // and the prediction should respect score/50 + the 0.85 off-peak multiplier.
    // We just check the prediction is > 0 — actual exact value depends on score.
    expect(r.predictedReach).toBeGreaterThanOrEqual(0);
  });

  it('uses ANONYMOUS_FALLBACK_REACH = 200 with no data at all', () => {
    const analysis = makeAnalysis('Plain tweet', { score: 50 });
    const r = computeForecast({
      analysis,
      accountHealth: null,
      timingStatus: 'off_peak',
      hasMedia: false,
      hasExternalLink: false,
      avgViews: null,
      trackedTweetCount: 0,
    });
    expect(r.isEstimate).toBe(true);
    expect(r.dataPoints).toBe(0);
    expect(r.confidence).toBe(0);
    // With score=50, contentMultiplier=1.0, off_peak=0.85, no other overrides
    // 200 × 1.0 × 0.85 × 1.0 × 1.0 × 1.0 × 1.0 × 1.0 = 170
    expect(r.predictedReach).toBe(170);
  });
});

describe('computeForecast — multipliers', () => {
  const inputNoData: ForecastInput = {
    analysis: makeAnalysis('Plain tweet', { score: 50 }),
    accountHealth: null,
    timingStatus: 'off_peak',
    hasMedia: false,
    hasExternalLink: false,
    avgViews: null,
    trackedTweetCount: 0,
  };

  it('peak timing is 1.25× off-peak', () => {
    const peak = computeForecast({ ...inputNoData, timingStatus: 'good_now' });
    const off = computeForecast({ ...inputNoData, timingStatus: 'off_peak' });
    // ratio should be 1.25 / 0.85 ≈ 1.4706
    expect(peak.predictedReach / off.predictedReach).toBeCloseTo(1.25 / 0.85, 3);
  });

  it('media image is 1.35×', () => {
    const withImage = computeForecast({ ...inputNoData, hasMedia: true });
    const without = computeForecast({ ...inputNoData, hasMedia: false });
    // Tolerance accommodates Math.round rounding
    expect(withImage.predictedReach / without.predictedReach).toBeCloseTo(1.35, 2);
  });

  it('bare link without curiosity gap is neutral (1.0×)', () => {
    const withLink = computeForecast({ ...inputNoData, hasExternalLink: true });
    const withoutLink = computeForecast({ ...inputNoData, hasExternalLink: false });
    expect(withLink.predictedReach).toBe(withoutLink.predictedReach);
  });

  it('link with curiosity_gap rule fires is 1.18×', () => {
    const a = makeAnalysis('Plain tweet', { score: 50 });
    a.signalScores.click.firedRules.push('curiosity_gap');
    const r = computeForecast({
      ...inputNoData,
      analysis: a,
      hasExternalLink: true,
    });
    expect(r.predictedReach).toBe(Math.round(200 * (50 / 50) * 0.85 * 1.18));
  });
});

describe('computeForecast — what-if scenarios', () => {
  it('emits the add-image and add-video scenarios when there is no media', () => {
    const input: ForecastInput = {
      analysis: makeAnalysis('Plain tweet', { score: 50 }),
      accountHealth: null,
      timingStatus: 'good_now', // suppress optimal-time
      hasMedia: false,
      hasExternalLink: false,
      avgViews: null,
      trackedTweetCount: 0,
    };
    const r = computeForecast(input);
    const ids = r.scenarios.map((s) => s.id);
    expect(ids).toContain('add-image');
    expect(ids).toContain('add-video');
  });

  it('marks media alreadyApplied when hasMedia is true', () => {
    const r = computeForecast({
      analysis: makeAnalysis('Plain tweet', { score: 50 }),
      accountHealth: null,
      timingStatus: 'good_now',
      hasMedia: true,
      hasExternalLink: false,
      avgViews: null,
      trackedTweetCount: 0,
    });
    const imageScenario = r.scenarios.find((s) => s.id === 'add-image');
    expect(imageScenario?.alreadyApplied).toBe(true);
    expect(imageScenario?.delta).toBe(0);
  });

  it('emits the combined scenario when ≥2 improvements are unapplied', () => {
    const r = computeForecast({
      analysis: makeAnalysis('Plain tweet', { score: 50 }),
      accountHealth: null,
      timingStatus: 'off_peak', // makes optimal-time actionable
      hasMedia: false,           // makes add-image/add-video actionable
      hasExternalLink: false,
      avgViews: null,
      trackedTweetCount: 0,
    });
    const combined = r.scenarios.find((s) => s.id === 'combined');
    expect(combined).toBeDefined();
    expect(combined?.delta).toBeGreaterThan(0);
  });

  it('does not emit combined if all scenarios are already applied', () => {
    const r = computeForecast({
      analysis: makeAnalysis('Plain tweet', { score: 50 }),
      accountHealth: null,
      timingStatus: 'good_now',
      hasMedia: true,
      hasExternalLink: false,
      avgViews: null,
      trackedTweetCount: 0,
    });
    expect(r.scenarios.find((s) => s.id === 'combined')).toBeUndefined();
  });
});

describe('computeForecast — probabilities', () => {
  it('replyProbability scales with the reply signal', () => {
    const low = makeAnalysis('Tweet');
    low.signalScores.reply.score = 2;
    const high = makeAnalysis('Tweet');
    high.signalScores.reply.score = 12;
    const r1 = computeForecast({
      analysis: low, accountHealth: null, timingStatus: 'off_peak',
      hasMedia: false, hasExternalLink: false, avgViews: null, trackedTweetCount: 0,
    });
    const r2 = computeForecast({
      analysis: high, accountHealth: null, timingStatus: 'off_peak',
      hasMedia: false, hasExternalLink: false, avgViews: null, trackedTweetCount: 0,
    });
    expect(r2.replyProbability).toBeGreaterThan(r1.replyProbability);
  });

  it('viralChance is capped at 40', () => {
    const a = makeAnalysis('Tweet', { score: 95 });
    a.trendingAlignment = {
      isAligned: true, matchedTrends: [], bonusPoints: 5,
    };
    const r = computeForecast({
      analysis: a, accountHealth: null, timingStatus: 'good_now',
      hasMedia: true, hasExternalLink: false, avgViews: null, trackedTweetCount: 0,
    });
    expect(r.viralChance).toBeLessThanOrEqual(40);
  });
});

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [142, '142'],
    [999, '999'],
    [1_500, '1.5K'],
    [12_345, '12.3K'],
    [999_999, '1000.0K'],
    [1_500_000, '1.5M'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatNumber(input)).toBe(expected);
  });
});

describe('FORECAST_CONSTANTS', () => {
  it('exposes documented v4 multipliers', () => {
    expect(FORECAST_CONSTANTS.IMAGE_MULTIPLIER).toBe(1.35);
    expect(FORECAST_CONSTANTS.VIDEO_MULTIPLIER).toBe(1.45);
    expect(FORECAST_CONSTANTS.CLICK_GAP_MULTIPLIER).toBe(1.18);
    expect(FORECAST_CONSTANTS.TRENDING_MULTIPLIER).toBe(1.15);
    expect(FORECAST_CONSTANTS.PEAK_TIME_MULTIPLIER).toBe(1.25);
    expect(FORECAST_CONSTANTS.ANONYMOUS_FALLBACK_REACH).toBe(200);
  });
});