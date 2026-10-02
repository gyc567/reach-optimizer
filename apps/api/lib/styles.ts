// TopDiggX unified color and style system — matches the original X/Twitter
// dark theme. Centralized so all components pull from one source.

export const colors = {
  bg: '#000000',
  bgSecondary: '#16181c',
  bgTertiary: '#1d1f23',
  border: '#2f3336',
  borderHover: '#3f4549',

  textPrimary: '#e7e9ea',
  textSecondary: '#71767b',
  textTertiary: '#536471',

  accent: {
    blue: '#1d9bf0',
    green: '#00ba7c',
    yellow: '#ffd400',
    red: '#f4212e',
    purple: '#7856ff',
    orange: '#ff7a00',
    pink: '#f91880',
  },

  // Score tier colors
  score: {
    excellent: '#00ba7c',  // 80+
    good: '#1d9bf0',       // 60-79
    average: '#ffd400',    // 40-59
    below: '#ff7a00',      // 20-39
    critical: '#f4212e',   // 0-19
  },
};

export const fonts = {
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  mono: '"SF Mono", Monaco, "Cascadia Code", monospace',
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
};

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
};

export const shadows = {
  card: '0 1px 3px rgba(0, 0, 0, 0.3)',
  dropdown: '0 4px 12px rgba(0, 0, 0, 0.4)',
  glow: (color: string) => `0 0 20px ${color}40`,
};

// Signal bucket colors
export const signalBucketColors = {
  engagement: colors.accent.blue,
  curiosity: colors.accent.green,
  dwell: colors.accent.purple,
  risk: colors.accent.red,
};

// Score gauge color (matches reach flow chart colors)
export function getScoreColor(score: number): string {
  if (score >= 80) return colors.score.excellent;
  if (score >= 60) return colors.score.good;
  if (score >= 40) return colors.score.average;
  if (score >= 20) return colors.score.below;
  return colors.score.critical;
}

// Tier label (used in some fallback paths)
export function getScoreTier(score: number): string {
  if (score >= 90) return 'Perfect';
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Strong';
  if (score >= 40) return 'Average';
  if (score >= 20) return 'Below';
  return 'Critical';
}