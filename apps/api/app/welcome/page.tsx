import { getLocale, getMessages } from '@lib/i18n-server';
import { t } from '@lib/i18n';
import { LanguageToggle } from '@components/LanguageToggle';

export async function generateMetadata() {
  const locale = await getLocale();
  return {
    title: t(locale, 'welcome.page_title'),
    description: t(locale, 'welcome.page_description'),
  };
}

/**
 * Marketing landing page. Lives at /welcome so the home page (/) can be the
 * scorer. Kept structurally unchanged to avoid disrupting SEO and Chrome Web
 * Store inbound links.
 *
 * i18n: this is a server component, so we resolve locale + messages in the
 * function body and use `t()` directly (no React context).
 */
export default async function WelcomePage() {
  const locale = await getLocale();
  const $ = (k: string) => t(locale, k);
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#e7e9ea',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 40px',
          borderBottom: '1px solid #2f3336',
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#00ba7c',
            }}
          />
          <span style={{ fontSize: 18, fontWeight: 800, color: '#e7e9ea' }}>
            TopDiggX
          </span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <a
            href="/"
            style={{
              color: '#e7e9ea',
              padding: '8px 16px',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {$('common.try_scorer')}
          </a>
          <LanguageToggle />
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          textAlign: 'center',
          padding: '100px 20px 80px',
          maxWidth: 800,
          margin: '0 auto',
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 900,
            lineHeight: 1.1,
            marginBottom: 20,
            background: 'linear-gradient(135deg, #e7e9ea, #1d9bf0)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {$('welcome.hero.title')}
        </h1>
        <p
          style={{
            fontSize: 20,
            color: '#71767b',
            lineHeight: 1.5,
            marginBottom: 40,
            maxWidth: 560,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {$('welcome.hero.subtitle')}
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="/"
            style={{
              background: '#1d9bf0',
              color: '#fff',
              padding: '14px 32px',
              borderRadius: 28,
              fontWeight: 700,
              fontSize: 16,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            {$('welcome.hero.try_scorer')}
          </a>
          <a
            href="#how-it-works"
            style={{
              background: 'transparent',
              color: '#e7e9ea',
              padding: '14px 32px',
              borderRadius: 28,
              fontWeight: 700,
              fontSize: 16,
              textDecoration: 'none',
              border: '1px solid #2f3336',
              display: 'inline-block',
            }}
          >
            {$('welcome.hero.how_it_works')}
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section
        id="how-it-works"
        style={{
          padding: '80px 20px',
          maxWidth: 1000,
          margin: '0 auto',
          borderTop: '1px solid #2f3336',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 60,
          }}
        >
          {$('welcome.how_it_works_title')}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 40,
          }}
        >
          {[
            { step: '01', title: $('welcome.step.write'), desc: $('welcome.step.write_desc'), color: '#1d9bf0' },
            { step: '02', title: $('welcome.step.score'), desc: $('welcome.step.score_desc'), color: '#ffd400' },
            { step: '03', title: $('welcome.step.optimize'), desc: $('welcome.step.optimize_desc'), color: '#00ba7c' },
          ].map((item) => (
            <div
              key={item.step}
              style={{
                background: '#16181c',
                border: '1px solid #2f3336',
                borderRadius: 16,
                padding: '32px 28px',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: item.color,
                  marginBottom: 12,
                  letterSpacing: 1,
                }}
              >
                STEP {item.step}
              </div>
              <h3 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
                {item.title}
              </h3>
              <p style={{ color: '#71767b', fontSize: 15, lineHeight: 1.5 }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section
        style={{
          padding: '80px 20px',
          maxWidth: 1000,
          margin: '0 auto',
          borderTop: '1px solid #2f3336',
        }}
      >
        <h2
          style={{
            textAlign: 'center',
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 60,
          }}
        >
          {$('welcome.features_title')}
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 24,
          }}
        >
          {[
            { icon: '🎯', title: $('welcome.feature.score_overlay.title'), desc: $('welcome.feature.score_overlay.desc') },
            { icon: '✨', title: $('welcome.feature.auto_optimize.title'), desc: $('welcome.feature.auto_optimize.desc') },
            { icon: '💬', title: $('welcome.feature.reply_coach.title'), desc: $('welcome.feature.reply_coach.desc') },
            { icon: '🔥', title: $('welcome.feature.trending.title'), desc: $('welcome.feature.trending.desc') },
            { icon: '🤖', title: $('welcome.feature.ai_slop.title'), desc: $('welcome.feature.ai_slop.desc') },
            { icon: '🔄', title: $('welcome.feature.self_reply.title'), desc: $('welcome.feature.self_reply.desc') },
          ].map((f) => (
            <div
              key={f.title}
              style={{
                background: '#16181c',
                border: '1px solid #2f3336',
                borderRadius: 12,
                padding: '24px 20px',
              }}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {f.title}
              </h3>
              <p style={{ color: '#71767b', fontSize: 13, lineHeight: 1.5 }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section
        style={{
          padding: '80px 20px',
          maxWidth: 1000,
          margin: '0 auto',
          borderTop: '1px solid #2f3336',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 60,
            flexWrap: 'wrap',
          }}
        >
          {[
            { value: '25', label: $('welcome.stats.rules') },
            { value: '200', label: $('welcome.stats.calibration') },
            { value: '5', label: $('welcome.stats.rounds') },
            { value: '0-100', label: $('welcome.stats.score_range') },
          ].map((stat) => (
            <div key={stat.label}>
              <div
                style={{
                  fontSize: 48,
                  fontWeight: 900,
                  color: '#1d9bf0',
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {stat.value}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: '#71767b',
                  fontWeight: 500,
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section
        style={{
          padding: '80px 20px 100px',
          textAlign: 'center',
          borderTop: '1px solid #2f3336',
          maxWidth: 800,
          margin: '0 auto',
        }}
      >
        <h2
          style={{
            fontSize: 36,
            fontWeight: 800,
            marginBottom: 16,
          }}
        >
          {$('welcome.cta.title')}
        </h2>
        <p
          style={{
            color: '#71767b',
            fontSize: 18,
            marginBottom: 32,
          }}
        >
          {$('welcome.cta.desc')}
        </p>
        <a
          href="/"
          style={{
            background: 'linear-gradient(135deg, #1d9bf0, #0066cc)',
            color: '#fff',
            padding: '16px 40px',
            borderRadius: 28,
            fontWeight: 700,
            fontSize: 18,
            textDecoration: 'none',
            display: 'inline-block',
          }}
        >
          {$('welcome.cta.open_web_scorer')}
        </a>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid #2f3336',
          padding: '24px 40px',
          textAlign: 'center',
          color: '#71767b',
          fontSize: 13,
          maxWidth: 1200,
          margin: '0 auto',
        }}
      >
        {$('welcome.footer')}
      </footer>
    </div>
  );
}