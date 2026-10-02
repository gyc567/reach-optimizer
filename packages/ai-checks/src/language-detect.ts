/**
 * Script + language detection for tweet text.
 *
 * Strategy: detect Unicode SCRIPT first (Han / Hiragana / Katakana / Hangul /
 * Cyrillic / Arabic / Devanagari / Latin), then disambiguate within script
 * where multiple languages share characters.
 *
 *   - Han only              → Chinese
 *   - Han + Hiragana/Katakana → Japanese
 *   - Han + Hangul          → Korean
 *   - Latin + TR_CHARS      → Turkish
 *   - Latin + ES_CHARS      → Spanish
 *   - Latin + DE_CHARS      → German
 *   - Latin + FR_CHARS      → French
 *   - Latin + PT_CHARS      → Portuguese
 *   - Latin only            → 'en' (ambiguous fallback — common case for English)
 *   - anything else / short / empty → 'other' (prompt will say "preserve original")
 */

// Use explicit Unicode escapes — visually similar glyphs (e.g. the U+F900
// Compatibility Ideograph vs the U+8C48 CJK char) can silently widen a
// literal-character range and match unrelated scripts including emoji.
const RE_HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/; // CJK Ext A + Unified + Compatibility
const RE_HIRAGANA = /[\u3040-\u309F]/;
const RE_KATAKANA = /[\u30A0-\u30FF\u31F0-\u31FF]/;
const RE_HANGUL = /[\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/;
const RE_CYRILLIC = /[\u0400-\u04FF\u0500-\u052F]/;
const RE_ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const RE_DEVANAGARI = /[\u0900-\u097F\uA8E0-\uA8FF]/;
const RE_LATIN = /[A-Za-z]/;

// Unique (non-shared) Latin characters — checked first to avoid ambiguity.
// ß is only German, ñ/¿/¡ only Spanish, ã/õ only Portuguese.
const DE_UNIQUE = /[ß]/;
const ES_UNIQUE = /[ñ¿¡ÑÁ]/;
const PT_UNIQUE = /[ãõÃÕ]/;

// Shared chars (used as tiebreakers after unique detection).
// Turkish ç ğ ş ı are unique-ish (ç is shared with French, but ğ ş ı are Turkish-only).
const TR_UNIQUE = /[ğşıĞŞİ]/;
const FR_UNIQUE = /[àâæèêëîïôœùûÀÂÆÈÊËÎÏÔŒÙÛ]/;
const DE_SHARED = /[äöüÄÖÜ]/;
const FR_SHARED = /[çéÇÉ]/;
const ES_SHARED = /[áéíóúüÁÉÍÓÚÜ]/;

// Common Turkish words (kept for back-compat with original test)
const TR_WORDS = new Set([
  'bir', 'bu', 've', 'ile', 'için', 'ama', 'çok', 'da', 'de', 'ne',
  'var', 'yok', 'gibi', 'olan', 'daha', 'ben', 'sen', 'biz', 'onlar',
  'ki', 'ise', 'kadar', 'sonra', 'önce', 'çünkü', 'ama', 'fakat',
  'nasıl', 'neden', 'niye', 'hangi', 'bence', 'aslında', 'yani',
  'bile', 'hala', 'artık', 'zaten', 'sadece', 'hem', 'ya', 'mi',
  'mı', 'mu', 'mü', 'değil', 'olarak', 'böyle', 'şey', 'herkes',
  'hiç', 'her', 'kendi', 'biri', 'şu', 'en', 'çoğu', 'bazı',
  'oldu', 'olmuş', 'yapıyor', 'diyor', 'ediyor', 'geliyor', 'gidiyor',
]);

// Portuguese-specific stopwords. These appear ONLY in Portuguese (not
// Spanish/French/Italian/etc) — useful tiebreakers when unique chars (ã/õ)
// are absent.
const PT_WORDS = new Set([
  'você', 'não', 'são', 'está', 'como', 'muito', 'para', 'mais',
  'com', 'mas', 'por', 'isso', 'aqui', 'também', 'já', 'tem',
  'foi', 'ser', 'ter', 'fazer', 'nos', 'das', 'dos',
]);

export type DetectedLanguage =
  | 'zh' | 'ja' | 'ko'
  | 'tr' | 'en' | 'es' | 'fr' | 'de' | 'pt'
  | 'ru' | 'ar' | 'hi'
  | 'other';

/**
 * Human-readable language label used in AI prompts. Always include the native
 * script so the model can self-verify (e.g. "Chinese (中文)" — if the model
 * sees "中文" in the instruction AND the original tweet, it's a strong signal
 * to respond in Chinese).
 */
const LANG_DISPLAY: Record<DetectedLanguage, string> = {
  zh: 'Chinese (中文)',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  tr: 'Turkish (Türkçe)',
  en: 'English',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  de: 'German (Deutsch)',
  pt: 'Portuguese (Português)',
  ru: 'Russian (Русский)',
  ar: 'Arabic (العربية)',
  hi: 'Hindi (हिन्दी)',
  other: 'the SAME LANGUAGE as the original tweet',
};

/**
 * Detect the dominant language/script of `text`.
 *
 * Returns 'other' for empty/short/ambiguous text. Callers should treat 'other'
 * as "let the model infer from the original" — getLanguageInstruction emits
 * the right guidance.
 */

/** True if any word in `text` (case-insensitive, punctuation-stripped) is in `words`. */
function hasWordMatch(text: string, words: Set<string>): boolean {
  const tokens = text.toLowerCase().split(/\s+/);
  for (const tok of tokens) {
    // Strip punctuation from start/end
    const clean = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (words.has(clean)) return true;
  }
  return false;
}

export function detectLanguage(text: string): DetectedLanguage {
  if (!text || text.length < 3) return 'other';

  // CJK family: Han is shared between Chinese, Japanese, Korean
  if (RE_HAN.test(text)) {
    if (RE_HIRAGANA.test(text) || RE_KATAKANA.test(text)) return 'ja';
    if (RE_HANGUL.test(text)) return 'ko';
    return 'zh';
  }

  // Pure Hangul (rare in tweets but possible)
  if (RE_HANGUL.test(text)) return 'ko';

  // Pure Kana (loanwords / katakana-only)
  if (RE_HIRAGANA.test(text) || RE_KATAKANA.test(text)) return 'ja';

  if (RE_CYRILLIC.test(text)) return 'ru';
  if (RE_ARABIC.test(text)) return 'ar';
  if (RE_DEVANAGARI.test(text)) return 'hi';

  // Latin-script family — check unique chars FIRST so ambiguous shared
  // characters (ö/ü/é/á/ç/...) don't mis-classify.

  // 1. Unique markers (only appear in one language)
  if (DE_UNIQUE.test(text)) return 'de';          // ß
  if (ES_UNIQUE.test(text)) return 'es';          // ñ ¿ ¡ Á
  if (PT_UNIQUE.test(text)) return 'pt';          // ã õ
  if (TR_UNIQUE.test(text)) return 'tr';          // ğ ş ı (ç is shared with FR)

  // 2. Shared-char detection (need to disambiguate between similar languages)
  // German has ä/ö/ü; Turkish has ö/ü; French has é/ç. If shared chars are
  // present but no unique marker, prefer German if ä/ü appear (German uses ä
  // far more than Turkish which uses plain 'a' in loanwords).
  if (DE_SHARED.test(text)) {
    // French é/ç can also trigger DE_SHARED (no, they can't — ä/ö/ü vs é/ç).
    // DE_SHARED = äöü; FR_SHARED = çé. No overlap.
    return 'de';
  }
  if (FR_UNIQUE.test(text) || FR_SHARED.test(text)) {
    // French has à â æ ç é è ê ë î ï ô œ ù û ü.
    // Note: ç is also in Turkish. TR_UNIQUE was checked first so if we're
    // here, no ğ/ş/ı was present → Turkish unlikely.
    // Tiebreaker: Portuguese also uses ê (você), so check PT_WORDS before
    // defaulting to French.
    if (hasWordMatch(text, PT_WORDS)) return 'pt';
    return 'fr';
  }
  if (ES_SHARED.test(text)) return 'es';          // á é í ó ú ü (no unique markers but Spanish-only)

  // 3. Turkish word fallback for vowel-only Turkish like "bir ve çok"
  if (RE_LATIN.test(text) && hasWordMatch(text, TR_WORDS)) return 'tr';

  // 4. Latin only — ambiguous (en, fr, de, pt, it, vi all share the alphabet).
  // Default to English. The prompt's "preserve original language" instruction
  // catches the rare case where the user writes in another Latin language.
  if (RE_LATIN.test(text)) return 'en';

  return 'other';
}

/**
 * Returns a strict AI prompt instruction that tells the model to:
 *   1. Use the detected language name
 *   2. CRITICAL: never translate
 *   3. Preserve punctuation style (。 vs .), idioms, tone
 *
 * For 'other' (ambiguous), the instruction falls back to "preserve the
 * original language of the tweet" so the model can match based on content.
 */
export function getLanguageInstruction(lang: DetectedLanguage): string {
  const name = LANG_DISPLAY[lang];
  return [
    `The original tweet is in ${name}.`,
    `CRITICAL: You MUST write ALL suggestions in ${name}.`,
    `Do NOT translate to any other language.`,
    `PRESERVE the original language's characters, idioms, punctuation style (e.g. 。 vs .), and tone.`,
  ].join(' ');
}

/**
 * Convenience: just the language name (e.g. "Chinese (中文)") for use in
 * inline prompt fragments like "Write in ${getLanguageName(lang)}".
 */
export function getLanguageName(lang: DetectedLanguage): string {
  return LANG_DISPLAY[lang];
}