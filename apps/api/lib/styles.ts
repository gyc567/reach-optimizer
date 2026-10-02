// TopDiggX 统一颜色和样式系统
// 与 X/Twitter 深色主题保持一致

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

  // 评分等级颜色
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

// 信号桶颜色
export const signalBucketColors = {
  engagement: colors.accent.blue,
  curiosity: colors.accent.green,
  dwell: colors.accent.purple,
  risk: colors.accent.red,
};

// 评分仪表盘颜色
export const getScoreColor = (score: number): string => {
  if (score >= 80) return colors.score.excellent;
  if (score >= 60) return colors.score.good;
  if (score >= 40) return colors.score.average;
  if (score >= 20) return colors.score.below;
  return colors.score.critical;
};

// 评分等级
export const getScoreTier = (score: number): string => {
  if (score >= 90) return '完美';
  if (score >= 80) return '优秀';
  if (score >= 60) return '良好';
  if (score >= 40) return '一般';
  if (score >= 20) return '较差';
  return '危险';
};
