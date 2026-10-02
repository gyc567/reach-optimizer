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
import { AIOptimizer } from '@components/AIOptimizer';
import { AutoOptimizedCard } from '@components/AutoOptimizedCard';
import { LanguageToggle } from '@components/LanguageToggle';
import { useT } from '@lib/i18n-client';
import { useOptimizationPipeline } from '@lib/useOptimizationPipeline';

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
  /** v2 pipeline: single CTA drives analyze → rewrite ‖ optimize.
   *  Lives at the page level so the composer + AI panel share state. */
  const pipeline = useOptimizationPipeline({ authToken });
  /** Snapshot of text when Optimize started — passed to AutoOptimizedCard for
   *  diff comparison. Captured at start() time so user edits don't shift the
   *  comparison baseline. */
  const [snapshotText, setSnapshotText] = useState('');
  /** What was in the textarea BEFORE the most recent Use this — captured by
   *  AutoOptimizedCard's onApply to enable Undo. */
  const [preApplyText, setPreApplyText] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the text input — only the client engine runs on every keystroke
  // when debounce fires; no AI/Trending API is hit on the input path.
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
        // Silently degrade — timingStatus stays null → engine uses off_peak default.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Trending — fetched once on mount. /api/trending handles its own caching;
  // an empty array is the documented "service unavailable" state.
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
        // Empty state is fine.
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
  // host page, otherwise leave null (anonymous scorer). `chrome` is a global
  // the browser extension exposes; safe-guard with a typeof check.
  useEffect(() => {
    const c = (globalThis as { chrome?: { storage?: { local?: { get: (k: string, cb: (r: Record<string, unknown>) => void) => void } } } }).chrome;
    if (!c?.storage?.local) return;
    c.storage.local.get('authToken', (result) => {
      if (typeof result.authToken === 'string') setAuthToken(result.authToken);
    });
  }, []);

  // Client-side scoring — pure local. The audit-revised plan §3.2 is explicit:
  // input path runs no API call. engine.evaluate is synchronous and <50ms.
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

  // Reach forecast — recomputed locally when any input changes.
  const forecast: ReachForecast = useMemo(() => {
    const input: ForecastInput = {
      analysis,
      accountHealth: null, // Anonymous home page; dashboard passes real health.
      timingStatus,
      hasMedia,
      hasExternalLink,
      avgViews: null,
      trackedTweetCount: 0,
    };
    return computeForecast(input);
  }, [analysis, timingStatus, hasMedia, hasExternalLink]);

  // Detected trending keywords for badge highlighting. Same heuristic the
  // server uses in /api/analyze.checkTrendingAlignment — naive substring match.
  const matchedKeywords = useMemo(() => {
    if (!debouncedText) return [];
    const lower = debouncedText.toLowerCase();
    return trends
      .map((t) => t.name)
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
          onAIOptimize={() => {
            // v4: snapshot the textarea content so AutoOptimizedCard can
            // diff against the original even after the user keeps editing.
            // Pipeline runs against this snapshot — editing mid-run doesn't
            // abort. Re-clicking ✨ AI captures a fresh snapshot.
            setSnapshotText(text);
            pipeline.start(text);
          }}
          aiPending={pipeline.state.status === 'running'}
        />

        {/* Auto-Optimized Card — placed directly under the composer so the
            user can compare original vs optimized without scrolling. Hidden
            entirely while idle so we don't reserve empty space. */}
        <AutoOptimizedCard
          pipeline={pipeline}
          originalText={snapshotText || text}
          currentText={text}
          preApplyText={preApplyText}
          onApply={(t) => {
            // Capture the pre-apply text so Undo can restore it.
            setPreApplyText(text);
            setText(t);
            pipeline.apply(t);
          }}
          onUndo={() => {
            if (preApplyText !== null) {
              setText(preApplyText);
              // Clear appliedText so the "Applied" badge goes away
              // without touching the rounds (the optimize result is still
              // there for the user to re-apply).
              setPreApplyText(null);
              pipeline.reset();
            }
          }}
          onRerun={() => {
            setSnapshotText(text);
            pipeline.start(text);
          }}
          onAbort={() => pipeline.abort()}
        />

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

        <AIOptimizer
          textSnapshot={text}
          hasMedia={hasMedia}
          mediaType={hasImage ? 'image' : hasVideo ? 'video' : undefined}
          isQuoteTweet={isQuoteTweet}
          authToken={authToken}
          onApply={(t) => {
            // Two side-effects: 1) replace the textarea content,
            // 2) record the applied candidate in the pipeline so the
            //    applied banner + overLimit warning render.
            setText(t);
            pipeline.apply(t);
          }}
          pipeline={pipeline}
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
            Dashboard
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
            Analyze
          </a>
          <LanguageToggle />
        </nav>
      </div>
    </header>
  );
}