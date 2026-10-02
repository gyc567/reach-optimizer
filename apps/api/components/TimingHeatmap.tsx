'use client';

import React from 'react';
import { colors, fonts, radius } from '@lib/styles';

interface TimingHeatmapProps {
  heatmap?: number[][];
  timezone?: string;
}

const DEFAULT_HEATMAP_UTC: number[][] = (() => {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const windows: Array<{ day: number; hour: number; intensity: number }> = [
    { day: 2, hour: 9, intensity: 100 },
    { day: 2, hour: 10, intensity: 70 },
    { day: 2, hour: 11, intensity: 70 },
    { day: 3, hour: 9, intensity: 100 },
    { day: 3, hour: 10, intensity: 100 },
    { day: 3, hour: 11, intensity: 70 },
    { day: 3, hour: 12, intensity: 70 },
    { day: 3, hour: 13, intensity: 40 },
    { day: 4, hour: 9, intensity: 100 },
    { day: 4, hour: 10, intensity: 100 },
    { day: 4, hour: 11, intensity: 70 },
    { day: 4, hour: 12, intensity: 70 },
    { day: 4, hour: 13, intensity: 40 },
    { day: 5, hour: 9, intensity: 100 },
    { day: 5, hour: 10, intensity: 70 },
    { day: 5, hour: 11, intensity: 70 },
    { day: 5, hour: 12, intensity: 40 },
    { day: 5, hour: 13, intensity: 40 },
    { day: 1, hour: 9, intensity: 40 },
    { day: 1, hour: 10, intensity: 40 },
    { day: 1, hour: 13, intensity: 40 },
  ];
  for (const w of windows) {
    grid[w.day][w.hour] = w.intensity;
  }
  return grid;
})();

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DISPLAY_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

function heatColor(intensity: number): string {
  if (intensity >= 80) return colors.accent.green;
  if (intensity >= 50) return colors.accent.green + '88';
  if (intensity >= 20) return colors.accent.green + '44';
  return 'transparent';
}

export function TimingHeatmap({ heatmap, timezone = 'UTC' }: TimingHeatmapProps) {
  const grid = heatmap ?? DEFAULT_HEATMAP_UTC;
  return (
    <div
      style={{ overflowX: 'auto', fontFamily: fonts.family }}
      data-testid="timing-heatmap"
    >
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 8px', color: colors.textSecondary, textAlign: 'left', fontSize: 11 }} />
            {DISPLAY_HOURS.map((h) => (
              <th
                key={h}
                style={{
                  padding: '4px 2px',
                  color: colors.textSecondary,
                  fontSize: 10,
                  fontWeight: 500,
                  textAlign: 'center',
                  minWidth: 32,
                }}
              >
                {h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_LABELS.map((dayLabel, dayIdx) => (
            <tr key={dayIdx}>
              <td
                style={{
                  padding: '4px 8px',
                  color: colors.textSecondary,
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {dayLabel}
              </td>
              {DISPLAY_HOURS.map((h) => {
                const intensity = grid[dayIdx]?.[h] ?? 0;
                return (
                  <td key={h} style={{ padding: '2px' }}>
                    <div
                      style={{
                        width: '100%',
                        height: 20,
                        borderRadius: 3,
                        backgroundColor: intensity > 0 ? heatColor(intensity) : `${colors.border}66`,
                        border:
                          intensity >= 80
                            ? `1px solid ${colors.accent.green}88`
                            : '1px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={`${dayLabel} ${h < 12 ? h + 'AM' : h === 12 ? '12PM' : (h - 12) + 'PM'} ${timezone} — ${
                        intensity >= 80
                          ? 'Peak'
                          : intensity >= 50
                            ? 'Good'
                            : intensity > 0
                              ? 'Okay'
                              : 'Off-peak'
                      }`}
                    >
                      {intensity >= 80 && (
                        <span style={{ fontSize: 8, color: '#fff', fontWeight: 700 }}>P</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}