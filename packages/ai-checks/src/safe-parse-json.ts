// Resilient JSON parsing for AI-generated responses.
//
// MiniMaxi (and Claude in adversarial prompts) occasionally returns
// malformed JSON: missing commas, trailing commas, code-fence leakage,
// or array literals where objects were requested. Strict parsing turns
// these into 500s that surface as ✕ rewrite / ✕ optimize in the scorer
// panel and make the user click Retry, only to hit the same flaky response.
//
// This helper tries multiple extraction strategies in order of strictness
// before falling back to an empty result. The caller decides whether an
// empty result is acceptable or warrants an error.

export interface SafeParseResult<T> {
  /** The parsed value, or null if all strategies failed. */
  value: T | null;
  /** Which strategy succeeded, in order: raw → fence-stripped → array-parse → regex. */
  strategy: 'raw' | 'fence-stripped' | 'array' | 'regex' | null;
  /** The cleaned string used in the successful strategy (debug aid). */
  cleaned: string | null;
}

/**
 * Parse AI-generated JSON without throwing on malformed input.
 *
 * Strategies (first match wins):
 *   1. raw — try the string as-is
 *   2. fence-stripped — remove ```json / ``` wrappers, try again
 *   3. array — if the response is an array, try parsing it directly
 *      (the model often returns `["a", "b"]` instead of `{"suggestions": [...]}`)
 *   4. regex — last fallback uses pattern extraction
 */
export function safeParseJsonResponse<T = unknown>(
  rawText: string | null | undefined,
): SafeParseResult<T> {
  if (!rawText || typeof rawText !== 'string') {
    return { value: null, strategy: null, cleaned: null };
  }

  // Strip markdown code fences
  const fenceStripped = rawText
    .replace(/```json\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  // Strategy 1+2: try the string with and without fences
  for (const candidate of [rawText.trim(), fenceStripped]) {
    if (!candidate) continue;
    try {
      return { value: JSON.parse(candidate) as T, strategy: candidate === rawText.trim() ? 'raw' : 'fence-stripped', cleaned: candidate };
    } catch {
      // continue
    }
  }

  // Strategy 3: if the response looks like an array, try wrapping it
  const arrayMatch = fenceStripped.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return { value: JSON.parse(arrayMatch[0]) as T, strategy: 'array', cleaned: arrayMatch[0] };
    } catch {
      // fall through
    }
  }

  // Strategy 4: regex — extract quoted strings as a last resort
  // Useful when the model returned an array but with a syntax error
  // like `["a" "b"]` (missing comma). We extract each "..." chunk.
  if (fenceStripped.trimStart().startsWith('[')) {
    const items = [...fenceStripped.matchAll(/"([^"\\]|\\.)*"/g)].map((m) =>
      // strip surrounding quotes and unescape common sequences
      m[0].slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n'),
    );
    if (items.length > 0) {
      // Return in the shape the caller expects. If caller expects
      // { suggestions: string[] }, this returns { suggestions: items };
      // if caller expects string[], the caller wraps.
      return {
        value: { suggestions: items } as unknown as T,
        strategy: 'regex',
        cleaned: fenceStripped,
      };
    }
  }

  return { value: null, strategy: null, cleaned: null };
}

/**
 * Convenience: extract `suggestions: string[]` from a model response,
 * tolerating the common shape variants (array literal vs object).
 * Returns [] on parse failure so callers can continue gracefully.
 */
export function parseSuggestionsField(rawText: string | null | undefined): string[] {
  const parsed = safeParseJsonResponse<{ suggestions?: unknown[] } | string[]>(rawText);
  if (!parsed.value) return [];
  if (Array.isArray(parsed.value)) {
    return parsed.value.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(parsed.value.suggestions)) {
    return parsed.value.suggestions.filter((s): s is string => typeof s === 'string');
  }
  return [];
}