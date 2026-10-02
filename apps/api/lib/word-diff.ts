// Word-level diff between two strings.
//
// Self-contained LCS (Longest Common Subsequence) implementation — 30 lines,
// zero dependencies. Used by AutoOptimizedCard to highlight which parts of
// the user's original tweet were kept / removed / added in the optimized
// version, so the comparison is immediately legible.
//
// Output: an ordered array of segments. Each segment is either:
//   { kind: 'keep', text }
//   { kind: 'del',  text }
//   { kind: 'ins',  text }
//
// Render the segments in order: keep = normal, del = red strikethrough,
// ins = green background.

export type DiffSegment = {
  kind: 'keep' | 'del' | 'ins';
  text: string;
};

// Tokenize on whitespace but preserve the whitespace as part of each token so
// the rendered output reads naturally. We split, then iterate as pairs.
function splitWords(s: string): string[] {
  // Split on word boundaries; keep whitespace as separate tokens so the
  // rendered diff preserves formatting (newlines, multiple spaces).
  return s.match(/\S+|\s+/g) ?? [];
}

/**
 * Compute the LCS table between two arrays. Standard DP, O(n*m) time/space.
 * We keep the full table because we need to walk it backward to produce
 * segments; an O(n+m) "Hunt–Szymanski" / "Patience" variant would be a future
 * optimization for very long inputs (not relevant for tweets ≤ 280 chars).
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/**
 * Walk the LCS table backwards to emit an array of segments in source order.
 * For ties (matches vs deletes vs inserts) we prefer keeping both sides — i.e.
 * emit a `del` and an `ins` rather than collapsing to a `keep`. This keeps the
 * diff truthful.
 */
function backtrack(a: string[], b: string[], dp: number[][]): DiffSegment[] {
  const segments: DiffSegment[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      segments.unshift({ kind: 'keep', text: a[i - 1] });
      i--;
      j--;
      continue;
    }
    if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      segments.unshift({ kind: 'ins', text: b[j - 1] });
      j--;
      continue;
    }
    if (i > 0) {
      segments.unshift({ kind: 'del', text: a[i - 1] });
      i--;
    }
  }
  return segments;
}

/**
 * Merge adjacent segments of the same kind so the UI doesn't render 50
 * `keep` segments in a row. Whitespace-only `keep` segments are preserved
 * so the diff output reads naturally (we don't drop line breaks).
 */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = [];
  for (const s of segments) {
    const last = merged[merged.length - 1];
    if (last && last.kind === s.kind) {
      last.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/**
 * Diff two strings at word granularity. Returns ordered segments marked as
 * kept, deleted, or inserted. Adjacent same-kind segments are merged.
 */
export function diffWords(before: string, after: string): DiffSegment[] {
  const a = splitWords(before);
  const b = splitWords(after);
  const dp = lcsTable(a, b);
  const segments = backtrack(a, b, dp);
  return mergeSegments(segments);
}

/**
 * Convenience: returns a small object describing the change magnitude so the
 * UI can show "+12 chars" or "+5 words" or "minor edit". Excludes whitespace
 * from word/char counts so leading-space tweaks aren't counted.
 */
export function diffSummary(before: string, after: string): {
  added: number;
  removed: number;
} {
  const segments = diffWords(before, after);
  let added = 0;
  let removed = 0;
  for (const s of segments) {
    if (s.kind === 'ins' && /\S/.test(s.text)) added++;
    if (s.kind === 'del' && /\S/.test(s.text)) removed++;
  }
  return { added, removed };
}