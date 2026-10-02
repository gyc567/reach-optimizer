'use client';

import { useEffect, useState } from 'react';
import type { AccountHealth } from '@reach/shared-types';
import { colors, fonts, radius } from '@lib/styles';
import { StatCard } from '@components/StatCard';
import { TimingHeatmap } from '@components/TimingHeatmap';
import { useT } from '@lib/i18n-client';

interface TrackedTweet {
  id: string;
  content: string;
  reachScore: number;
  predictedReach: number | null;
  postedAt: string;
  optimized: boolean;
  metrics?: {
    views: number;
    likes: number;
    replies: number;
    retweets: number;
  };
}

const MOCK_HEALTH: AccountHealth = {
  healthScore: 50,
  reachMultiplier: 1.0,
  factors: [
    { name: 'Profile completeness', score: 4, maxScore: 10, status: 'warning', tip: 'Add a bio + banner to lift reach' },
    { name: 'Posting consistency', score: 6, maxScore: 10, status: 'good' },
    { name: 'Engagement rate', score: 2, maxScore: 10, status: 'critical', tip: 'Track more tweets to measure this' },
    { name: 'Follower ratio', score: 7, maxScore: 10, status: 'good' },
    { name: 'Account age', score: 5, maxScore: 10, status: 'warning' },
  ],
  isPremium: false,
  followerCount: 1200,
  followingCount: 480,
  tweetCount: 320,
  accountAgeDays: 540,
  avgEngagementRate: null,
  fetchedAt: '2026-10-01T00:00:00Z',
  forecastCorrectionFactor: null,
};

export default function AnalyzePage() {
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const t = useT();
  const [tweets, setTweets] = useState<TrackedTweet[]>([]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = (globalThis as { chrome?: { storage?: { local?: { get: (k: string, cb: (r: Record<string, unknown>) => void) => void } } } }).chrome;
    if (!c?.storage?.local) {
      setLoading(false);
      return;
    }
    c.storage.local.get('authToken', (result) => {
      const tok = typeof result.authToken === 'string' ? result.authToken : null;
      setAuthToken(tok);
      if (!tok) setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading === false && authToken === null) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/account-health', {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
        if (!res.ok) {
          // 401 = not logged in; fall back to mock
          if (res.status === 401 || res.status === 502) {
            setHealth(MOCK_HEALTH);
            setError(null);
            return;
          }
          throw new Error(`Server ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        setHealth(data.data as AccountHealth);
      } catch (e) {
        if (cancelled) return;
        // Real fetch failed — keep mock and surface the error so the user sees
        // the source of truth is degraded.
        setHealth(MOCK_HEALTH);
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authToken, loading]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.bg,
        color: colors.textPrimary,
        fontFamily: fonts.family,
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${colors.border}`,
          padding: '16px 24px',
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
              }}
            />
            <span style={{ fontSize: 18, fontWeight: 800 }}>TopDiggX · Analyze</span>
          </div>
          <a
            href="/"
            style={{
              color: colors.textSecondary,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {t('analyze.back_to_scorer')}
          </a>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px' }}>
        {error && (
          <div
            style={{
              backgroundColor: colors.bgSecondary,
              border: `1px solid ${colors.accent.yellow}66`,
              borderRadius: radius.md,
              padding: 12,
              marginBottom: 16,
              fontSize: 13,
              color: colors.accent.yellow,
            }}
          >
            ⚠️ {error}. Showing example data.
          </div>
        )}

        {!authToken && (
          <div
            style={{
              backgroundColor: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              padding: 16,
              marginBottom: 16,
              fontSize: 13,
              color: colors.textSecondary,
            }}
            data-testid="analyze-login-hint"
          >
            Connect your X account to see your real account health and tracked tweets.{' '}
            <a
              href="/api/auth/login"
              style={{
                color: colors.accent.blue,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Connect X →
            </a>
          </div>
        )}

        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
          Account Health
          {!authToken && (
            <span
              style={{
                marginLeft: 10,
                fontSize: 11,
                color: colors.accent.yellow,
                fontWeight: 600,
              }}
              data-testid="analyze-mock-badge"
            >
              EXAMPLE DATA
            </span>
          )}
        </h2>

        {health && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              <StatCard
                label="Health"
                value={`${health.healthScore}/100`}
                color={
                  health.healthScore >= 80
                    ? colors.accent.green
                    : health.healthScore >= 60
                      ? colors.accent.blue
                      : health.healthScore >= 40
                        ? colors.accent.yellow
                        : colors.accent.red
                }
              />
              <StatCard
                label="Reach multiplier"
                value={`${health.reachMultiplier.toFixed(2)}×`}
              />
              <StatCard
                label="Followers"
                value={health.followerCount.toLocaleString()}
              />
              <StatCard
                label="Engagement rate"
                value={
                  health.avgEngagementRate !== null
                    ? `${(health.avgEngagementRate * 100).toFixed(2)}%`
                    : '—'
                }
              />
            </div>

            {health.factors.length > 0 && (
              <section
                style={{
                  backgroundColor: colors.bgSecondary,
                  border: `1px solid ${colors.border}`,
                  borderRadius: radius.lg,
                  padding: 16,
                  marginBottom: 24,
                }}
                data-testid="analyze-factors"
              >
                <h3
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    margin: '0 0 12px 0',
                    color: colors.textPrimary,
                  }}
                >
                  Factors
                </h3>
                {health.factors.map((f, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 60px 30px',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom:
                        i === health.factors.length - 1
                          ? 'none'
                          : `1px solid ${colors.border}`,
                      fontSize: 13,
                    }}
                  >
                    <span>
                      <span style={{ color: colors.textPrimary, fontWeight: 500 }}>
                        {f.name}
                      </span>
                      {f.tip && (
                        <span style={{ display: 'block', color: colors.textSecondary, fontSize: 11 }}>
                          {f.tip}
                        </span>
                      )}
                    </span>
                    <div
                      style={{
                        height: 6,
                        backgroundColor: colors.bgTertiary,
                        borderRadius: radius.full,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${(f.score / f.maxScore) * 100}%`,
                          height: '100%',
                          backgroundColor:
                            f.status === 'great' || f.status === 'good'
                              ? colors.accent.green
                              : f.status === 'warning'
                                ? colors.accent.yellow
                                : colors.accent.red,
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontFamily: fonts.mono,
                        color: colors.textSecondary,
                        textAlign: 'right',
                      }}
                    >
                      {f.score}/{f.maxScore}
                    </span>
                  </div>
                ))}
              </section>
            )}

            <section style={{ marginBottom: 24 }}>
              <h3
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  margin: '0 0 12px 0',
                  color: colors.textPrimary,
                }}
              >
                Optimal Posting Times
              </h3>
              <TimingHeatmap />
            </section>
          </>
        )}

        {tweets.length > 0 && (
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px 0' }}>
              Recent Tracked Tweets
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tweets.map((t) => (
                <div
                  key={t.id}
                  style={{
                    backgroundColor: colors.bgSecondary,
                    border: `1px solid ${colors.border}`,
                    borderRadius: radius.md,
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: 13, color: colors.textPrimary }}>{t.content}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}