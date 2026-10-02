// Word/character-level diff between two strings.
//
// Self-contained LCS (Longest Common Subsequence) implementation. Used by
// AutoOptimizedCard to highlight which parts of the user's original tweet were
// kept / removed / added in the optimized version, so the comparison is
// immediately legible.
//
// Tokenization:
//   - Latin script: split on whitespace (preserves word boundaries)
//   - CJK script (Chinese / Japanese / Korean): each ideograph / kana / hangul
//     is its own token, with adjacent Latin / punctuation merged into one token.
//     Without this, a Chinese sentence like "你好世界" would tokenize as a
//     single word, making the diff degenerate into "all deleted + all inserted".
//
// Output: an ordered array of segments. Each segment is either:
//   { kind: 'keep', text }
//   { kind: 'del',  text }
//   { kind: 'ins',  text }

export type DiffSegment = {
  kind: 'keep' | 'del' | 'ins';
  text: string;
};

// Unicode script ranges that lack whitespace between words.
const CJK_CHAR = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uAC00-\uD7AF\u1100-\u11FF\uA960-\uA97F\uD7B0-\uD7FF]/;

function splitWords(s: string): string[] {
  if (!s) return [];
  // Detect if the string has any CJK characters — if so, switch to character-level
  // tokenization so the diff can highlight per-character changes.
  if (CJK_CHAR.test(s)) {
    return tokenizeCJK(s);
  }
  return s.match(/\S+|\s+/g) ?? [];
}

/**
 * Tokenize a string containing CJK characters:
 *   - Each CJK char is its own token (so a sentence becomes ~N chars)
 *   - Runs of non-CJK (Latin, digits, punctuation, whitespace) merge into one
 *     token (matching the Latin path's behavior).
 */
function tokenizeCJK(s: string): string[] {
  const out: string[] = [];
  let buf = '';
  let prevIsCJK = false;
  for (const ch of s) {
    const isCJK = CJK_CHAR.test(ch);
    if (isCJK) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      out.push(ch);
      prevIsCJK = true;
    } else {
      if (prevIsCJK && buf) {
        // already pushed CJK above, now start a non-CJK run
      }
      buf += ch;
      prevIsCJK = false;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * Compute the LCS table between two arrays. Standard DP, O(n*m) time/space.
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