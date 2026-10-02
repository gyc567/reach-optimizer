import type {
  PostContext,
  SignalBucket,
  SignalName,
  SignalScore,
  SignalType,
  SubRule,
} from '@reach/shared-types';

export interface SubRuleDef {
  name: string;
  weight: number;
  test: (ctx: PostContext) => boolean | string;
}

export interface ScoreOpts {
  signal: SignalName;
  type: SignalType;
  bucket: SignalBucket;
  max: number;
  applicable?: boolean;
  rules: SubRuleDef[];
  suggestionWhenLow?: string;
  suggestionWhenHigh?: string;
}

export function buildSignalScore(ctx: PostContext, opts: ScoreOpts): SignalScore {
  const applicable = opts.applicable ?? true;
  const subRules: SubRule[] = [];

  if (!applicable) {
    return {
      signal: opts.signal,
      type: opts.type,
      bucket: opts.bucket,
      score: 0,
      max: opts.max,
      applicable: false,
      firedRules: [],
      subRules: [],
    };
  }

  let raw = 0;
  for (const r of opts.rules) {
    const result = r.test(ctx);
    const fired = Boolean(result);
    const evidence = typeof result === 'string' ? result : undefined;
    if (fired) raw += r.weight;
    subRules.push({ name: r.name, weight: r.weight, fired, evidence });
  }

  let score: number;
  if (opts.type === 'positive') {
    score = Math.max(0, Math.min(opts.max, raw));
  } else {
    score = Math.max(opts.max, Math.min(0, raw));
  }

  const firedRules = subRules.filter((r) => r.fired).map((r) => r.name);

  let suggestion: string | undefined;
  if (opts.type === 'positive') {
    if (score < opts.max * 0.4 && opts.suggestionWhenLow) suggestion = opts.suggestionWhenLow;
    else if (score >= opts.max * 0.7 && opts.suggestionWhenHigh) suggestion = opts.suggestionWhenHigh;
  } else {
    if (score < 0 && opts.suggestionWhenLow) suggestion = opts.suggestionWhenLow;
  }

  return {
    signal: opts.signal,
    type: opts.type,
    bucket: opts.bucket,
    score,
    max: opts.max,
    applicable: true,
    firedRules,
    subRules,
    suggestion,
  };
}

// Reusable predicate helpers --------------------------------------------------

// CJK script range — used to detect Chinese/Japanese/Korean characters. We
// use explicit \u escapes to avoid the silent-widening bug where editors
// conflate U+F900 (CJK Compatibility Ideograph) with visually-similar U+8C48
// (CJK Unified Ideograph).
const CJK_REGEX = /[㐀-䶿一-鿿豈-﫿぀-ゟ゠-ヿㇰ-ㇿ가-힯ᄀ-ᇿꥠ-꥿ힰ-퟿ꀀ-꓏꒐-꓏]/g;

export const URL_REGEX = /https?:\/\/\S+/i;
// Accept both half-width "?" and full-width "？" so Chinese tweets that end in
// "？" trigger the reply signal. Same idea for closers below.
export const QUESTION_REGEX = /[?？][\s)\]）]*$/;
// Second-person: `you / your / you're` (EN) + `你 / 你的 / 你们 / 您` (ZH).
// Look-behind/look-ahead on Latin alphabet avoids false-positive at CJK/Latin
// boundaries where \b is meaningless.
export const SECOND_PERSON_REGEX =
  /(?<![A-Za-z])(you|your|you're|yourself)(?![A-Za-z])|你|你的|你们|您/;
// First-person: `I / I'm / I've` (EN) + `我 / 俺 / 咱` (ZH).
export const FIRST_PERSON_REGEX =
  /\bI(?:'m|'ve| )\b|我|俺|咱/;
// Numbers: $1,234 / 23% / 365 / 12,000 — Unicode-aware so "365万亿" and "310%"
// still fire.
export const NUMBER_REGEX = /\$[\d,]+|\d+%|\d{2,}/u;

export function startsWithAny(text: string, prefixes: string[]): boolean {
  const lower = text.trimStart().toLowerCase();
  return prefixes.some((p) => lower.startsWith(p));
}

export function containsAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

export function wordCount(text: string): number {
  // CJK characters don't have whitespace between words; \s+ would undercount.
  // Count CJK chars individually + treat non-CJK as one chunk per whitespace
  // split. Same rationale as CJK_REGEX — explicit \u escapes only.
  const cjk = (text.match(CJK_REGEX) ?? []).length;
  const latin = text.replace(CJK_REGEX, ' ').trim().split(/\s+/).filter(Boolean).length;
  return cjk + latin;
}

export function hasOpinionMarker(text: string): boolean {
  // English markers (kept from v3)
  const en = /\b(I think|in my opinion|hot take|unpopular opinion|truth is|the reality is|here'?s the truth|controversial|nobody talks about|change my mind)\b/i;
  // Chinese: 我认为 / 我觉得 / 说实话 / 说真的 / 说穿了 / 说白了 / 问题是 / 坦白说 /
  // 说个冷知识 / 我赌 / 我猜 / 真相是 / 我的观点是
  const zh = /我认为|我觉得|说实话|说真的|说穿了|说白了|问题是|坦白说|说个冷知识|我赌|我猜|真话是|真相是|我的观点是/;
  return en.test(text) || zh.test(text);
}

export function hasControversyMarker(text: string): boolean {
  // English: existing set
  const en = /\b(actually|wrong|overrated|underrated|hate to say|controversial|disagree|but actually)\b/i;
  // Chinese: 说穿了 / 你们可能不信 / 反常识 / 但是其实 / 其实不是 / 你错了 / 反直觉 /
  // 你们都错了 / 都错了 / 别被...骗了 / 说穿了
  const zh = /说穿了|你们可能不信|反常识|但是其实|其实不是|你错了|反直觉|你们都错了|都错了/;
  return en.test(text) || zh.test(text);
}

export function hasAphoristicShape(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 200) return false;
  if (trimmed.length < 12) return false;
  // Short, single/dual-sentence, declarative, no questions. Accept both
  // half-width and full-width closers so a Chinese aphorism like
  // "X 是 Y。Z。" still counts. Lowered the 20-char threshold to 12 because
  // CJK text carries more meaning per char.
  const enSplit = trimmed.split(/[.!?]\s+/).filter(Boolean);
  const zhSplit = trimmed.split(/[。！？!?]\s*/).filter(Boolean);
  const sentenceCount = Math.min(enSplit.length || Infinity, zhSplit.length || Infinity);
  const hasQ = trimmed.includes('?') || trimmed.includes('？');
  return sentenceCount <= 2 && !hasQ;
}

export function hasListShape(text: string): boolean {
  // numbered or bulleted list — accept CJK list markers and English numbers
  const numberedOrBulleted = /(^|\n)\s*(\d+[.)]\s|[-*•]\s|[(]\s*\d+\s*[)]\s)/.test(text);
  const enHeadings = /\b(\d+)\s+(ways|reasons|things|tips|lessons|rules|steps|examples)\b/i.test(text);
  // Chinese: "5 个方法 / 7 条原则 / 3 招" etc.
  const zhHeadings = /\d+\s*[个条招点](方法|原则|技巧|步骤|原因|理由|建议|经验|规矩)/.test(text);
  return numberedOrBulleted || enHeadings || zhHeadings;
}

export function hasInsiderFraming(text: string): boolean {
  // English: existing set
  const en = /\b(the trick|the secret|nobody tells you|what (they|nobody) won'?t tell you|hidden|insider|behind the scenes|the real reason|truth (about|behind))\b/i;
  // Chinese: 内幕 / 真相 / 真实原因 / 冷知识 / 你们不知道 / 说个秘密 / 隐藏的 /
  // 说个冷门 / 很少有人 / 揭秘 / 说个不为人知
  const zh = /内幕|真相|真实原因|冷知识|你们不知道|说个秘密|隐藏的|说个冷门|很少有人|揭秘|说个不为人知/;
  return en.test(text) || zh.test(text);
}

export function hasNicheTargeting(text: string): boolean {
  // English: existing set
  const en = /\b(every (designer|engineer|founder|PM|marketer|writer|dev|developer|manager|CEO|CTO|CMO|recruiter|teacher|parent|student) should|if you'?re a)\b/i;
  // Chinese: 每个[职业]都应该 / 做 [职业] 的 / 设计师 / 工程师 / 投资人 / 创业者 / 产品经理
  const zh = /每个(设计师|工程师|创始人|产品经理|运营|投资人|创业者|开发者|管理者|老师|家长|学生)都应该|设计师|工程师|投资人|创业者|产品经理/;
  return en.test(text) || zh.test(text);
}

export function hasParagraphBreaks(text: string): boolean {
  return /\n\s*\n/.test(text);
}

export function isWallOfText(text: string): boolean {
  const trimmed = text.trim();
  // 300-char threshold tuned for English. Chinese tweets rarely hit 300 chars,
  // so this is unlikely to false-positive on Chinese.
  return trimmed.length > 300 && !hasParagraphBreaks(trimmed);
}

export function hasGenericOpener(text: string): boolean {
  const openers = [
    'so today',
    'let me explain',
    "here's why",
    "let's talk about",
    'i want to talk',
    'in this thread',
    'a thread on',
    'thread:',
    'nobody asked',
    'can we talk about',
    "i'm going to share",
  ];
  return startsWithAny(text, openers);
}

const AI_SLOP_WORDS = [
  'delve into',
  'navigate the',
  'tapestry',
  'in the realm of',
  'leverage',
  'paradigm',
  'unleash',
  'embark on',
  'utilize',
  'seamless',
  "it's important to note",
];

export function hasAiSlopWords(text: string): boolean {
  return containsAny(text, AI_SLOP_WORDS);
}

export function repeatedCharsSpam(text: string): boolean {
  return /(.)\1{6,}/.test(text);
}

export function repeatedWordsSpam(text: string): boolean {
  return /\b(\w{3,})\b(?:\s+\1\b){3,}/i.test(text);
}

export function aggressiveTone(text: string): boolean {
  return /\b(idiot|moron|stupid|garbage|trash|kys|loser|pathetic|braindead|delusional)\b/i.test(
    text,
  );
}

export function adHominem(text: string): boolean {
  return /\byou(?:'re| are)\s+(an?\s+)?(idiot|moron|stupid|delusional|pathetic|loser|braindead)\b/i.test(
    text,
  );
}

export function selfPromoRatio(text: string): number {
  const links = (text.match(/https?:\/\/\S+/g) ?? []).length;
  const ownProductMarkers = (text.match(/\b(my (?:app|tool|product|book|course|newsletter|startup|company)|check out my|signup|sign up|buy now|order now)\b/gi) ?? []).length;
  const words = wordCount(text);
  if (words === 0) return 0;
  return (links + ownProductMarkers) / Math.max(1, words / 10);
}