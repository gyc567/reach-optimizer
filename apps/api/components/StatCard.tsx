'use client';

import React from 'react';
import { colors, fonts, radius } from '@lib/styles';

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

export function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div
      data-testid="stat-card"
      style={{
        flex: '1 1 200px',
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: fonts.family,
      }}
    >
      <span style={{ color: colors.textSecondary, fontSize: 13 }}>{label}</span>
      <span
        style={{
          color: color ?? colors.textPrimary,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
    </div>
  );
}