'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScoreEngine, computeForecast, type ForecastInput } from '@reach/rules-engine';
import type { AnalysisResult, ReachForecast, TimingResponse } from '@reach/shared-types';
import { colors, fonts } from '@lib/styles';
import { TweetComposer } from '@components/TweetComposer';
import { ScoreGauge } from '@components/ScoreGauge';
import { SignalBreakdown } from '@components/SignalBreakdown';
import { ReachForecast as ReachForecastCard } from '@components/ReachForecast';
import { TrendBadge } from '@components/TrendBadge';
import { LanguageToggle } from '@components/LanguageToggle';
import { AIOptimizer } from '@components/AIOptimizer';
import { AutoOptimizedCard } from '@components/AutoOptimizedCard';
import { CatProgressFab } from '@components/CatProgressFab';
import { useOptimizationPipeline } from '@lib/useOptimizationPipeline';
import { deriveButtonState, getRunningRound } from '@lib/pipeline-button';
import { useT } from '@lib/i18n-client';

const engine = new ScoreEngine();

// Smart debounce (per the audit-revised plan §3.3).
function debounceForLength(text: string): number {
  const len = text.length;
  if (len === 0) return 150;
  if (len <= 50) return 150;
  if (len <= 140) return 250;
  if (len <= 280) return 400;
  return 600;
}

export default function ScorerPage() {
  const t = useT();
  const [text, setText] = useState('');
  const [debouncedText, setDebouncedText] = useState('');
  const [hasMedia, setHasMedia] = useState(false);
  const [hasImage, setHasImage] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [isQuoteTweet, setIsQuoteTweet] = useState(false);
  const [hasExternalLink, setHasExternalLink] = useState(false);
  const [timingStatus, setTimingStatus] = useState<'good_now' | 'better_later' | 'off_peak' | null>(null);
  const [trends, setTrends] = useState<Array<{ name: string; keyword?: string; tweetVolume?: number | null }>>([]);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [authToken, setAuthToken] = useState<string | null>(null);
  /** Captured at the moment the user clicks "AI Optimize" so the diff
   *  between original → optimized stays stable even if the user keeps
   *  editing the textarea. */
  const [snapshotText, setSnapshotText] = useState('');
  /** v4 pipeline: single CTA, parallel stages, per-stage retry, no-improvement
   *  detection. Lives at the page level so composer + AI panel share state. */
  const pipeline = useOptimizationPipeline({ authToken });
  /** Ref to the panel area that will show AI results — used to scroll the
   *  viewport there immediately on click so the user never sees "no reaction"
   *  while the pipeline runs below the fold. */
  const pipelineAnchorRef = useRef<HTMLDivElement | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the text input — only the client engine runs on every keystroke
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedText(text);
    }, debounceForLength(text));
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [text]);

  // Timing — fetched once on mount via browser timezone.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        const res = await fetch('/api/timing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timezone: tz }),
        });
        if (!res.ok || cancelled) return;
        const data: TimingResponse = await res.json();
        setTimingStatus(data.data.currentStatus);
      } catch {
        // Silent degradation
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Trending — fetched once on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/trending');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setTrends(data?.data?.trends ?? []);
      } catch {
        // Empty state
      } finally {
        if (!cancelled) setTrendsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auth token — pull from chrome.storage.local when running as the extension
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const c = (globalThis as unknown as { chrome?: { storage?: { local?: { get: (k: string, cb: (r: Record<string, unknown>) => void) => void } } } }).chrome;
    if (!c?.storage?.local) return;
    c.storage.local.get('authToken', (result) => {
      if (typeof result.authToken === 'string') setAuthToken(result.authToken);
    });
  }, []);

  // Client-side scoring — pure local
  const analysis: AnalysisResult = useMemo(() => {
    return engine.evaluate({
      text: debouncedText,
      platform: 'x',
      isThread: false,
      hasMedia,
      mediaType: hasImage ? 'image' : hasVideo ? 'video' : undefined,
      isQuoteTweet,
    });
  }, [debouncedText, hasMedia, hasImage, hasVideo, isQuoteTweet]);

  // Reach forecast
  const forecast: ReachForecast = useMemo(() => {
    const input: ForecastInput = {
      analysis,
      accountHealth: null,
      timingStatus,
      hasMedia,
      hasExternalLink,
      avgViews: null,
      trackedTweetCount: 0,
    };
    return computeForecast(input);
  }, [analysis, timingStatus, hasMedia, hasExternalLink]);

  // Detected trending keywords for badge highlighting
  const matchedKeywords = useMemo(() => {
    if (!debouncedText) return [];
    const lower = debouncedText.toLowerCase();
    return trends
      .map((trend) => trend.name)
      .filter((n) => n.length >= 3 && lower.includes(n.toLowerCase()));
  }, [debouncedText, trends]);

  const handleMediaChange = useCallback(
    (patch: {
      hasMedia?: boolean;
      hasImage?: boolean;
      hasVideo?: boolean;
      isQuoteTweet?: boolean;
      hasExternalLink?: boolean;
    }) => {
      if (patch.hasImage !== undefined) setHasImage(patch.hasImage);
      if (patch.hasVideo !== undefined) setHasVideo(patch.hasVideo);
      if (patch.hasMedia !== undefined) setHasMedia(patch.hasMedia);
      if (patch.isQuoteTweet !== undefined) setIsQuoteTweet(patch.isQuoteTweet);
      if (patch.hasExternalLink !== undefined) setHasExternalLink(patch.hasExternalLink);
    },
    [],
  );

  const handleClear = useCallback(() => {
    setText('');
    setDebouncedText('');
  }, []);

  const hasText = debouncedText.trim().length > 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.bg,
        color: colors.textPrimary,
        fontFamily: fonts.family,
        paddingBottom: 48,
      }}
    >
      <Header />

      <main
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '24px 24px 48px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <TweetComposer
          text={text}
          onTextChange={setText}
          hasMedia={hasMedia}
          hasImage={hasImage}
          hasVideo={hasVideo}
          isQuoteTweet={isQuoteTweet}
          hasExternalLink={hasExternalLink}
          onChangeMedia={handleMediaChange}
          onClear={handleClear}
          aiButtonState={deriveButtonState(pipeline.state)}
          runningRound={getRunningRound(pipeline.state)}
          onAIOptimize={() => {
            // v4 pipeline: snapshot text + start the pipeline. Editing
            // the textarea mid-run does NOT abort.
            setSnapshotText(text);
            pipeline.start(text);
            // Scroll immediately so the user gets feedback even before the
            // panel renders. The anchor sits right below the composer — the
            // AutoOptimizedCard is there for the side-by-side compare.
            queueMicrotask(() => {
              const el = pipelineAnchorRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const offset = window.scrollY + rect.top - 80;
              window.scrollTo({ top: Math.max(0, offset), behavior: 'auto' });
            });
          }}
        />

        {/* AI result area: anchor ref for the predictive scroll on AI click.
            AutoOptimizedCard sits directly under the composer for the
            original ↔ optimized compare layout. Hidden while idle. */}
        <div ref={pipelineAnchorRef} data-testid="pipeline-anchor">
          <AutoOptimizedCard
            pipeline={pipeline}
            originalText={snapshotText || text}
            currentText={text}
            onRerun={() => {
              setSnapshotText(text);
              pipeline.start(text);
            }}
            onAbort={() => pipeline.abort()}
          />
        </div>

        <TrendBadge
          trends={trends}
          matchedKeywords={matchedKeywords}
          loading={trendsLoading}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}
        >
          <ScoreGauge score={analysis.score} tier={analysis.tier} hasText={hasText} />
          <ReachForecastCard forecast={forecast} />
        </div>

        <SignalBreakdown analysis={analysis} />

        {/* Pipeline panel: stages + analysis + errors. Sits below the
            signal breakdown since the optimize result is already shown
            above (right under the composer for direct comparison). */}
        <AIOptimizer
          pipeline={pipeline}
          textSnapshot={text}
          onAbort={() => pipeline.abort()}
        />

        <footer
          style={{
            color: colors.textTertiary,
            fontSize: 12,
            textAlign: 'center',
            marginTop: 24,
          }}
        >
          {t('scorer.footer', {
            signals: analysis.signalScores ? Object.keys(analysis.signalScores).length : 0,
          })}
        </footer>
      </main>

      {/* v10 — Floating cat FAB. Sits in viewport's bottom-right and stays
          visible regardless of scroll. Auto-mounts during AI Optimize and
          unmounts on done/error-timeout. */}
      <CatProgressFab pipeline={pipeline} onAbort={() => pipeline.abort()} />
    </div>
  );
}

function Header() {
  const t = useT();
  return (
    <header
      style={{
        borderBottom: `1px solid ${colors.border}`,
        padding: '16px 24px',
        position: 'sticky',
        top: 0,
        backgroundColor: colors.bg,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: colors.accent.green,
              display: 'inline-block',
              boxShadow: `0 0 8px ${colors.accent.green}88`,
            }}
          />
          <span style={{ fontSize: 18, fontWeight: 800 }}>TopDiggX</span>
          <span style={{ fontSize: 11, color: colors.accent.yellow, fontWeight: 600, marginLeft: 4 }}>
            {t('scorer.scorer_badge')}
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <a
            href="/dashboard"
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t('common.dashboard')}
          </a>
          <a
            href="/analyze"
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t('common.analyze')}
          </a>
          <LanguageToggle />
        </nav>
      </div>
    </header>
  );
}