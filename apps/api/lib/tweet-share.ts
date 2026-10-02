/**
 * Tweet-sharing utilities for AutoOptimizedCard.
 *
 * Two responsibilities:
 *   1. Build an X (Twitter) intent URL from arbitrary text. The URL format is
 *      stable and used by `twitter.com/intent/tweet` and the newer `x.com/intent/post`.
 *      We use `x.com/intent/post` because X has rebranded.
 *   2. Copy text to clipboard with a fallback chain (modern API → legacy
 *      execCommand). The fallback is needed for non-secure-context browsers
 *      and Safari without `navigator.clipboard`.
 *
 * All functions are pure / DOM-only — no React, no state, no i18n.
 */

/** Twitter / X character limit for a single post. */
export const TWEET_MAX_LEN = 280;

/**
 * If the encoded intent URL is bigger than this, browsers may truncate and
 * X's backend may reject it. We surface a warning before opening a too-long
 * URL so the user can fall back to "Copy + paste manually".
 *
 * Conservative: browsers reliably accept URLs up to ~8KB, X accepts ~4KB.
 * 2KB encoded URL ≈ 800–1500 chars of source text depending on CJK content.
 */
export const URL_WARN_LENGTH = 2000;

/** The X intent endpoint — kept as a constant so it's easy to update if X migrates. */
const X_INTENT_BASE = 'https://x.com/intent/post';

/**
 * Build an X (Twitter) intent URL that opens the compose dialog with the
 * given text pre-filled.
 *
 *   buildPostToXUrl('hello')
 *   →  'https://x.com/intent/post?text=hello'
 *
 *   buildPostToXUrl('héllo 你')
 *   →  'https://x.com/intent/post?text=h%C3%A9llo%20%E4%BD%A0'
 *
 * @param text - The text to embed in the URL. Caller should ensure it's the
 *               *optimized* (post-AI) version, not the original.
 */
export function buildPostToXUrl(text: string): string {
  return `${X_INTENT_BASE}?text=${encodeURIComponent(text)}`;
}

/**
 * Returns the byte length of the encoded intent URL. Useful for warning
 * the user when the URL is too long to reliably open.
 */
export function encodedIntentUrlLength(text: string): number {
  return buildPostToXUrl(text).length;
}

/**
 * Returns true if the optimized text exceeds the X character limit.
 * X accepts longer text and shows a "Post" button to truncate, but the user
 * probably wants a heads-up — a 400-char tweet is unmanageable.
 */
export function isTweetTooLong(text: string): boolean {
  return text.length > TWEET_MAX_LEN;
}

/**
 * Copy text to the clipboard.
 *
 * Tries `navigator.clipboard.writeText` first (modern API, requires secure
 * context). If that throws or is unavailable, falls back to a hidden
 * `<textarea>` + `document.execCommand('copy')` — the legacy API that still
 * works on Safari and non-HTTPS contexts.
 *
 * @returns true on success, false if both methods fail.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  // Modern path
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure — fall through
    }
  }

  // Legacy fallback (deprecated but works)
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Position off-screen but still in flow so it can be focused.
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}