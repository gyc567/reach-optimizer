'use client';

import React from 'react';
import { colors, fonts, radius } from '@lib/styles';
import { useT } from '@lib/i18n-client';

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
  aiPending?: boolean;
}

/**
 * Composer area for the Web scorer.
 *
 * The conditional signal set in the v4 engine (`photo_expand`, `vqv`,
 * `quoted_click`, `quoted_vqv`) only fires when the matching media/quote
 * context is set. Without these toggles the What-if scenarios are dead and
 * the score plateaus at the unconditional subset. The toggles here make the
 *   composer state explicit so the user — and the engine — see the same
 *   picture that the What-if row consumes.
 */
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
  aiPending,
}: TweetComposerProps) {
  const t = useT();
  const charCount = text.length;
  const overLimit = charCount > 280;
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
          // Image ↔ Video are mutually exclusive in the v4 model (one or the other).
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
        {/* Media + context switches */}
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

        {/* Right cluster: char count + buttons */}
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
            disabled={aiPending}
            data-testid="composer-ai-optimize"
            title={
              charCount < 10
                ? t('tweet.composer.title_too_short')
                : t('tweet.composer.title_run_ai')
            }
            style={{
              backgroundColor: aiPending ? colors.bgTertiary : colors.accent.blue,
              color: '#fff',
              border: 'none',
              borderRadius: radius.full,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: aiPending ? 'wait' : 'pointer',
              opacity: aiPending ? 0.6 : 1,
            }}
          >
            {aiPending ? t('common.thinking') : t('common.ai_optimize')}
          </button>
        </div>
      </div>
    </div>
  );
}