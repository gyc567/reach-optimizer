'use client';

import React from 'react';
import { colors, fonts, radius } from '@lib/styles';
import { useT } from '@lib/i18n-client';
import type { AIButtonState } from '@lib/pipeline-button';

export interface TweetComposerProps {
  text: string;
  onTextChange: (next: string) => void;
  hasMedia: boolean;
  hasImage: boolean;
  hasVideo: boolean;
  isQuoteTweet: boolean;
  hasExternalLink: boolean;
  onChangeMedia: (patch: {
    hasMedia?: boolean;
    hasImage?: boolean;
    hasVideo?: boolean;
    isQuoteTweet?: boolean;
    hasExternalLink?: boolean;
  }) => void;
  onClear: () => void;
  onAIOptimize: () => void;
  /** v11 — replaces the old `aiPending` boolean with a 4-state enum so the
   *  button can render different labels/colors for idle / running / result-ready
   *  / error states instead of being permanently stuck on "处理中…" after
   *  the first run. */
  aiButtonState?: AIButtonState;
  /** When running in the optimize phase, show "处理中… X/Y" round counter. */
  runningRound?: { current: number; total: number } | null;
}

export function TweetComposer({
  text,
  onTextChange,
  hasMedia,
  hasImage,
  hasVideo,
  isQuoteTweet,
  hasExternalLink,
  onChangeMedia,
  onClear,
  onAIOptimize,
  aiButtonState = 'idle',
  runningRound = null,
}: TweetComposerProps) {
  const t = useT();
  const charCount = text.length;
  const overLimit = charCount > 280;
  const textTooShort = charCount < 10;

  // v11 — derive button label + style from state machine.
  const buttonLabel = (() => {
    if (aiButtonState === 'running') {
      if (runningRound) {
        return t('common.thinking_with_progress', {
          current: runningRound.current,
          total: runningRound.total,
        });
      }
      return t('common.thinking');
    }
    if (aiButtonState === 'result-ready') return t('common.rerun_short');
    if (aiButtonState === 'error') return t('common.retry_short');
    return t('common.ai_optimize');
  })();

  const buttonStyle = (() => {
    if (aiButtonState === 'running') {
      return { bg: colors.bgTertiary, fg: '#fff', cursor: 'wait', border: 'none', opacity: 0.6 };
    }
    if (aiButtonState === 'result-ready') {
      return { bg: colors.accent.green, fg: '#fff', cursor: 'pointer', border: 'none', opacity: 1 };
    }
    if (aiButtonState === 'error') {
      return {
        bg: 'transparent',
        fg: colors.accent.red,
        cursor: 'pointer',
        border: `1px solid ${colors.accent.red}`,
        opacity: 1,
      };
    }
    // idle
    return { bg: colors.accent.blue, fg: '#fff', cursor: 'pointer', border: 'none', opacity: 1 };
  })();

  const isDisabled = aiButtonState === 'running' || textTooShort;
  const mediaButtons: Array<{
    key: 'image' | 'video' | 'quote' | 'link';
    label: string;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      key: 'image',
      label: '🖼️ Image',
      active: hasImage,
      onClick: () =>
        onChangeMedia({
          hasImage: !hasImage,
          hasMedia: !hasImage || hasVideo,
          hasVideo: !hasImage ? false : hasVideo,
        }),
    },
    {
      key: 'video',
      label: '🎥 Video',
      active: hasVideo,
      onClick: () =>
        onChangeMedia({
          hasVideo: !hasVideo,
          hasMedia: !hasVideo || hasImage,
          hasImage: !hasVideo ? false : hasImage,
        }),
    },
    {
      key: 'quote',
      label: '🔁 Quote',
      active: isQuoteTweet,
      onClick: () => onChangeMedia({ isQuoteTweet: !isQuoteTweet }),
    },
    {
      key: 'link',
      label: '🔗 Link',
      active: hasExternalLink,
      onClick: () => onChangeMedia({ hasExternalLink: !hasExternalLink }),
    },
  ];

  return (
    <div
      style={{
        backgroundColor: colors.bgSecondary,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        padding: 20,
        fontFamily: fonts.family,
      }}
    >
      <textarea
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={t('tweet.composer.placeholder')}
        rows={6}
        aria-label={t('tweet.composer.aria_label')}
        data-testid="composer-textarea"
        style={{
          width: '100%',
          minHeight: 140,
          backgroundColor: 'transparent',
          color: colors.textPrimary,
          border: 'none',
          outline: 'none',
          resize: 'vertical',
          fontSize: 16,
          lineHeight: 1.5,
          fontFamily: fonts.family,
        }}
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {mediaButtons.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={b.onClick}
              data-testid={`composer-toggle-${b.key}`}
              aria-pressed={b.active}
              style={{
                backgroundColor: b.active ? colors.accent.blue + '22' : 'transparent',
                color: b.active ? colors.accent.blue : colors.textSecondary,
                border: `1px solid ${b.active ? colors.accent.blue + '66' : colors.border}`,
                borderRadius: radius.full,
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            data-testid="composer-charcount"
            style={{
              fontFamily: fonts.mono,
              fontSize: 13,
              color: overLimit ? colors.accent.red : colors.textSecondary,
              fontWeight: overLimit ? 700 : 500,
            }}
          >
            {charCount}/280
          </span>
          <button
            type="button"
            onClick={onClear}
            data-testid="composer-clear"
            style={{
              backgroundColor: 'transparent',
              color: colors.textSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.full,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('tweet.composer.clear')}
          </button>
          <button
            type="button"
            onClick={onAIOptimize}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            data-testid="composer-ai-optimize"
            data-button-state={aiButtonState}
            title={
              textTooShort
                ? t('tweet.composer.title_too_short')
                : t('tweet.composer.title_run_ai')
            }
            style={{
              backgroundColor: buttonStyle.bg,
              color: buttonStyle.fg,
              border: buttonStyle.border,
              borderRadius: radius.full,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: buttonStyle.cursor,
              opacity: buttonStyle.opacity,
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}