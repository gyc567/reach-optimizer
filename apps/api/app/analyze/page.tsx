import { colors, fonts } from '@lib/styles';

export const metadata = {
  title: 'Account Health · TopDiggX',
  description: 'Connect your X account to see real account health and tracked tweets.',
};

// v12 — Analyze page is a coming-soon stub. Full implementation (X OAuth login,
// account health metrics, tracked-tweet analytics) is deferred until the user
// confirms the dashboard surface is solid. The route still renders so nav
// links / SEO don't 404.
export default function AnalyzePage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: colors.bg,
        color: colors.textPrimary,
        fontFamily: fonts.family,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <main
        style={{
          flex: 1,
          maxWidth: 560,
          margin: '0 auto',
          padding: '80px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 16,
        }}
      >
        {/* Coming soon badge */}
        <span
          data-testid="analyze-coming-soon"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            backgroundColor: colors.accent.yellow + '22',
            color: colors.accent.yellow,
            border: `1px solid ${colors.accent.yellow}66`,
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          <span aria-hidden style={{ fontSize: 10 }}>●</span>
          Coming Soon
        </span>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            margin: 0,
            color: colors.textPrimary,
            lineHeight: 1.2,
          }}
        >
          Account Health
        </h1>

        <p
          style={{
            fontSize: 15,
            lineHeight: 1.6,
            color: colors.textSecondary,
            margin: 0,
            maxWidth: 420,
          }}
        >
          Connect your X account to see real account health, predicted reach
          multiplier, and tracked tweet analytics.
        </p>

        <p
          style={{
            fontSize: 13,
            color: colors.textTertiary,
            margin: '8px 0 0 0',
          }}
        >
          This page is currently being built. For now, try the{' '}
          <a
            href="/"
            style={{
              color: colors.accent.blue,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Web Scorer
          </a>{' '}
          or{' '}
          <a
            href="/dashboard"
            style={{
              color: colors.accent.blue,
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Dashboard
          </a>
          .
        </p>

        {/* Feature preview placeholder */}
        <div
          style={{
            marginTop: 32,
            padding: 24,
            width: '100%',
            backgroundColor: colors.bgSecondary,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            textAlign: 'left',
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              color: colors.textTertiary,
              textTransform: 'uppercase',
            }}
          >
            Planned
          </span>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 14,
              lineHeight: 1.8,
              color: colors.textSecondary,
            }}
          >
            <li>Account health score (0-100) + reach multiplier</li>
            <li>Optimal posting times heatmap</li>
            <li>Tracked tweet performance vs predicted</li>
            <li>Daily tweet ideas with predicted scores</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
