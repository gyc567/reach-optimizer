/**
 * Component smoke tests — render the scorer pieces via React's server renderer
 * and assert the data-testid hooks + the v4 contract values make it to the
 * DOM. No DOM library needed; `react-dom/server` is enough to catch shape
 * regressions (missing tier labels, missing scenario ids, swapped colors, …).
 */

import { describe, expect, it } from 'vitest';
import React from 'react';
// `react-dom/server` ships untyped JS in this version; the function is a
// well-known React 19 API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { renderToStaticMarkup } = require('react-dom/server') as any;
import { ScoreEngine, computeForecast } from '@reach/rules-engine';
import type { AnalysisResult } from '@reach/shared-types';

import { ScoreGauge } from '../components/ScoreGauge';
import { SignalBreakdown } from '../components/SignalBreakdown';
import { ReachForecast as ReachForecastCard } from '../components/ReachForecast';
import { TweetComposer } from '../components/TweetComposer';
import { TrendBadge } from '../components/TrendBadge';
import { TimingHeatmap } from '../components/TimingHeatmap';
import { StatCard } from '../components/StatCard';
import { AIOptimizer } from '../components/AIOptimizer';

const engine = new ScoreEngine();

function fixtureAnalysis(text = 'Bold claim. Curious?'): AnalysisResult {
  return engine.evaluate({
    text,
    platform: 'x',
    isThread: false,
    hasMedia: false,
  });
}

function fixtureForecast(analysis: AnalysisResult) {
  return computeForecast({
    analysis,
    accountHealth: null,
    timingStatus: 'good_now',
    hasMedia: false,
    hasExternalLink: false,
    avgViews: null,
    trackedTweetCount: 0,
  });
}

describe('ScoreGauge', () => {
  it('renders the score number and tier label for non-empty text', () => {
    const a = fixtureAnalysis();
    const html = renderToStaticMarkup(
      <ScoreGauge score={a.score} tier={a.tier} hasText={true} />,
    );
    expect(html).toContain('data-testid="score-gauge"');
    expect(html).toContain('data-testid="score-gauge-value"');
    expect(html).toContain('data-testid="score-gauge-tier"');
    // tier label for good/excellent/perfect from weights.json
    const allowedLabels = ['Exceptional', 'Strong', 'Average', 'Significant Revision Needed', "Don't Post"];
    expect(allowedLabels.some((l) => html.includes(l))).toBe(true);
  });

  it('shows a placeholder, not the Dont-Post tier, when text is empty', () => {
    const html = renderToStaticMarkup(
      <ScoreGauge score={0} tier="critical" hasText={false} />,
    );
    expect(html).toContain('Start typing to begin');
    expect(html).not.toContain("Don't Post");
  });
});

describe('SignalBreakdown', () => {
  it('exposes bucket toggles for all 4 v4 buckets', () => {
    const a = fixtureAnalysis();
    const html = renderToStaticMarkup(<SignalBreakdown analysis={a} />);
    expect(html).toContain('data-testid="signal-breakdown"');
    expect(html).toContain('data-testid="bucket-toggle-engagement"');
    expect(html).toContain('data-testid="bucket-toggle-curiosity"');
    expect(html).toContain('data-testid="bucket-toggle-dwell"');
    expect(html).toContain('data-testid="bucket-toggle-risk"');
    // Engagement is open by default — its rows must be in the markup.
    expect(html).toContain('Reply');
    expect(html).toContain('Favorite');
  });

  it('renders at least the 12-row engagement bucket by default', () => {
    const a = fixtureAnalysis();
    const html = renderToStaticMarkup(<SignalBreakdown analysis={a} />);
    // Engagement bucket (default open) renders 12 rows. The remaining 13
    // live in the curiosity/dwell/risk buckets and only render once those
    // toggles are clicked — covered manually.
    const rowCount = (html.match(/data-testid="signal-row-/g) ?? []).length;
    expect(rowCount).toBeGreaterThanOrEqual(12);
  });

  it('shows "(not applicable)" for conditional signals when media is absent', () => {
    const a = fixtureAnalysis();
    const html = renderToStaticMarkup(<SignalBreakdown analysis={a} />);
    expect(html).toContain('(not applicable)');
  });
});

function SignalBreakdownHarness() {
  // Placeholder kept to keep the test file structurally stable.
  // Real coverage for "all 25 rows when every bucket is open" is a manual
  // DOM-flow concern: simulate user clicks then re-assert.
  return null;
}

describe('ReachForecast', () => {
  it('exposes predictedReach, scenarios, and the 4 scenario ids', () => {
    const a = fixtureAnalysis();
    const forecast = fixtureForecast(a);
    const html = renderToStaticMarkup(<ReachForecastCard forecast={forecast} />);
    expect(html).toContain('data-testid="reach-forecast"');
    expect(html).toContain('data-testid="forecast-predicted"');
    // Anonymous baseReach = 200, score-driven content multiplier — value is
    // a numeric span inside the predicted markup.
    const match = html.match(/data-testid="forecast-predicted"[^>]*>([^<]+)</);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/^\d/);
  });

  it('emits at least one what-if scenario id', () => {
    const a = fixtureAnalysis('Link to https://x.com/');
    const forecast = computeForecast({
      analysis: a,
      accountHealth: null,
      timingStatus: 'off_peak',
      hasMedia: false,
      hasExternalLink: true,
      avgViews: null,
      trackedTweetCount: 0,
    });
    const html = renderToStaticMarkup(<ReachForecastCard forecast={forecast} />);
    // With a link and no curiosity gap, the gap scenario is recommended.
    expect(html).toContain('data-testid="scenario-add-curiosity-gap"');
    expect(html).toContain('data-testid="scenario-add-image"');
    expect(html).toContain('data-testid="scenario-add-video"');
  });
});

describe('TweetComposer', () => {
  it('reflects char count and over-limit styling', () => {
    const html = renderToStaticMarkup(
      <TweetComposer
        text={'a'.repeat(300)}
        onTextChange={() => {}}
        hasMedia={false}
        hasImage={false}
        hasVideo={false}
        isQuoteTweet={false}
        hasExternalLink={false}
        onChangeMedia={() => {}}
        onClear={() => {}}
        onAIOptimize={() => {}}
      />,
    );
    expect(html).toContain('data-testid="composer-textarea"');
    expect(html).toContain('data-testid="composer-charcount"');
    expect(html).toContain('300/280');
  });

  it('exposes media toggle buttons for image/video/quote/link', () => {
    const html = renderToStaticMarkup(
      <TweetComposer
        text=""
        onTextChange={() => {}}
        hasMedia={false}
        hasImage={false}
        hasVideo={false}
        isQuoteTweet={false}
        hasExternalLink={false}
        onChangeMedia={() => {}}
        onClear={() => {}}
        onAIOptimize={() => {}}
      />,
    );
    expect(html).toContain('data-testid="composer-toggle-image"');
    expect(html).toContain('data-testid="composer-toggle-video"');
    expect(html).toContain('data-testid="composer-toggle-quote"');
    expect(html).toContain('data-testid="composer-toggle-link"');
    expect(html).toContain('data-testid="composer-clear"');
    expect(html).toContain('data-testid="composer-ai-optimize"');
  });

  it('does NOT silently disable the AI 优化 button when text is short (regression)', () => {
    // The original bug: clicking "AI 优化" with < 10 chars did nothing —
    // the button was `disabled` with no fallback. The fix routes the click
    // through the parent's triggerKey so AIOptimizer can show a hint.
    // We assert the button is rendered without `disabled` when the text is
    // short (text="" here), and that a tooltip hints at the requirement.
    const html = renderToStaticMarkup(
      <TweetComposer
        text="hi"
        onTextChange={() => {}}
        hasMedia={false}
        hasImage={false}
        hasVideo={false}
        isQuoteTweet={false}
        hasExternalLink={false}
        onChangeMedia={() => {}}
        onClear={() => {}}
        onAIOptimize={() => {}}
      />,
    );
    // The button must exist
    expect(html).toContain('data-testid="composer-ai-optimize"');
    // And it must not be in disabled state (the regression vector)
    expect(html).not.toMatch(/data-testid="composer-ai-optimize"[^>]*disabled/);
    // A tooltip must hint the user why it's not running
    expect(html).toMatch(/Type at least 10 characters to enable AI analysis/);
  });
});

describe('TrendBadge', () => {
  it('renders empty state when no trends are available', () => {
    const html = renderToStaticMarkup(
      <TrendBadge trends={[]} matchedKeywords={[]} loading={false} />,
    );
    expect(html).toContain('Trends unavailable');
  });

  it('highlights matched keywords', () => {
    const html = renderToStaticMarkup(
      <TrendBadge
        trends={[{ name: 'AI', keyword: 'AI', tweetVolume: 100 }]}
        matchedKeywords={['ai']}
        loading={false}
      />,
    );
    expect(html).toContain('#AI');
  });
});

describe('TimingHeatmap', () => {
  it('renders the 7-day table', () => {
    const html = renderToStaticMarkup(<TimingHeatmap />);
    expect(html).toContain('data-testid="timing-heatmap"');
    // 7 day labels — Sun..Sat
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((d) => {
      expect(html).toContain(d);
    });
  });
});

describe('StatCard', () => {
  it('renders label and value', () => {
    const html = renderToStaticMarkup(<StatCard label="Health" value="85/100" />);
    expect(html).toContain('Health');
    expect(html).toContain('85/100');
  });
});

describe('AIOptimizer', () => {
  // Build a stub pipeline that mirrors UseOptimizationPipelineReturn shape
  // for render tests. We don't actually fire fetches; we just feed the
  // component the state values and verify it renders the right markup.
  function mockPipeline(overrides: Partial<{
    status: 'idle' | 'running' | 'done' | 'error';
    analysis: AnalysisResult | null;
    rewrites: Array<{ text: string; score: number }>;
    rounds: Array<{ round: number; bestText: string; bestScore: number }>;
    activeStages: { analyze: boolean; rewrite: boolean; optimize: boolean };
    errorStage: 'analyze' | 'rewrite' | 'optimize' | null;
    errorMessage: string | null;
    appliedText: string | null;
    overLimit: boolean;
  }> = {}) {
    return {
      state: {
        status: 'idle',
        analysis: null,
        rewrites: [],
        rounds: [],
        textSnapshot: '',
        activeStages: { analyze: false, rewrite: false, optimize: false },
        errorStage: null,
        errorMessage: null,
        appliedText: null,
        overLimit: false,
        ...overrides,
      } as never,
      start: () => {},
      abort: () => {},
      reset: () => {},
      apply: () => {},
      retryStage: async () => {},
      bestRewrite: null,
      bestOptimize: null,
      bestOverall: null,
    };
  }

  it('renders nothing visible in idle state (no analysis yet)', () => {
    const html = renderToStaticMarkup(
      <AIOptimizer
        textSnapshot="hello"
        onApply={() => {}}
        pipeline={mockPipeline()}
      />,
    );
    expect(html).toContain('data-testid="ai-optimizer"');
    // When idle and no analysis, the panel shows the hint "Click ✨ AI"
    expect(html).toContain('Click ✨ AI');
  });

  it('renders stage indicators + analysis summary when only Stage 1 has completed', () => {
    const analysis = fixtureAnalysis('Bold claim');
    const html = renderToStaticMarkup(
      <AIOptimizer
        textSnapshot="Bold claim"
        onApply={() => {}}
        pipeline={mockPipeline({ analysis })}
      />,
    );
    expect(html).toContain('data-testid="analysis-summary"');
    expect(html).toContain('data-testid="analysis-score"');
    expect(html).toContain('data-testid="stage-analyze-done"');
    // Without rewrites/rounds, Stage 2 + 3 are still pending
    expect(html).toContain('data-testid="stage-rewrite-pending"');
    expect(html).toContain('data-testid="stage-optimize-pending"');
    expect(html).toContain(String(analysis.score));
  });

  it('renders per-candidate Use this buttons when rewrites are present', () => {
    const analysis = fixtureAnalysis('Bold claim');
    const rewrites = [
      { text: 'V1 candidate', score: 70 },
      { text: 'V2 candidate', score: 75 },
      { text: 'V3 candidate', score: 65 },
    ];
    const html = renderToStaticMarkup(
      <AIOptimizer
        textSnapshot="Bold claim"
        onApply={() => {}}
        pipeline={mockPipeline({ analysis, rewrites, status: 'done' })}
      />,
    );
    expect(html).toContain('data-testid="rewrites-section"');
    expect(html).toContain('data-testid="rewrite-0"');
    expect(html).toContain('data-testid="rewrite-1"');
    expect(html).toContain('data-testid="rewrite-2"');
    expect(html).toContain('data-testid="rewrite-use-0"');
    expect(html).toContain('Use this');
    expect(html).toContain('V2 candidate');
  });

  it('omits the optimize section (moved to AutoOptimizedCard in v4)', () => {
    // v4: Stage 3 result moved to AutoOptimizedCard which lives directly
    // under the composer for the side-by-side compare layout. The
    // AIOptimizer / PipelinePanel no longer renders its own OptimizeSection
    // to avoid duplication.
    const analysis = fixtureAnalysis('Bold claim');
    const rounds = [
      { round: 1, bestText: 'Round 1 best', bestScore: 70 },
      { round: 2, bestText: 'Round 2 best', bestScore: 80 },
    ];
    const html = renderToStaticMarkup(
      <AIOptimizer
        textSnapshot="Bold claim"
        onApply={() => {}}
        pipeline={mockPipeline({ analysis, rounds, status: 'done' })}
      />,
    );
    expect(html).not.toContain('data-testid="optimize-section"');
    expect(html).not.toContain('optimize-use-round-');
    // Rewrites still render here
    expect(html).not.toContain('Round 2 best'); // moved out
  });

  it('renders error block with Retry button when stage fails', () => {
    const analysis = fixtureAnalysis('Bold claim');
    const html = renderToStaticMarkup(
      <AIOptimizer
        textSnapshot="Bold claim"
        onApply={() => {}}
        pipeline={mockPipeline({
          analysis,
          status: 'error',
          errorStage: 'rewrite',
          errorMessage: 'AI rate limit',
        })}
      />,
    );
    expect(html).toContain('data-testid="pipeline-error"');
    expect(html).toContain('Rewrite');
    expect(html).toContain('AI rate limit');
    expect(html).toContain('data-testid="pipeline-retry-rewrite"');
  });

  it('renders applied banner and over-limit warning when appliedText exceeds 280 chars', () => {
    const analysis = fixtureAnalysis('Bold claim');
    const longText = 'a'.repeat(300);
    const html = renderToStaticMarkup(
      <AIOptimizer
        textSnapshot="Bold claim"
        onApply={() => {}}
        pipeline={mockPipeline({
          analysis,
          rewrites: [{ text: longText, score: 90 }],
          status: 'done',
          appliedText: longText,
          overLimit: true,
        })}
      />,
    );
    expect(html).toContain('data-testid="applied-banner"');
    expect(html).toContain('data-testid="over-limit-warning"');
    expect(html).toContain('exceeds 280');
  });

  it('shows Abort button while pipeline is running', () => {
    const html = renderToStaticMarkup(
      <AIOptimizer
        textSnapshot="x"
        onApply={() => {}}
        pipeline={mockPipeline({
          status: 'running',
          activeStages: { analyze: true, rewrite: false, optimize: false },
        })}
      />,
    );
    expect(html).toContain('data-testid="pipeline-abort"');
    expect(html).toContain('Stop');
  });
});