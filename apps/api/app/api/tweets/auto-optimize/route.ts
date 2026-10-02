import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { ScoreEngine } from '@reach/rules-engine';
import { detectLanguage, getLanguageInstruction, getLanguageName } from '@reach/ai-checks';
import { callAnthropic, parseModelJson, extractTweetLikeStrings } from '@lib/anthropic';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60s for multiple rounds

const engine = new ScoreEngine();

interface OptimizeRound {
  round: number;
  bestText: string;
  bestScore: number;
  delta: number; // vs original
  alternatives: { text: string; score: number }[];
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const originalText = body.content as string;
  const maxRounds = Math.min(body.maxRounds || 5, 5);
  // Optional composer context — when present we score original + variations
  // with the same media + quote state the client saw, so deltas line up and
  // v4 signals (vqv, quoted_click, quoted_vqv) apply consistently.
  const hasMedia = body.hasMedia === true;
  const mediaType = body.mediaType as 'image' | 'video' | 'gif' | 'poll' | undefined;
  const isQuoteTweet = body.isQuoteTweet === true;
  const quotedMediaType = body.quotedMediaType as 'image' | 'video' | 'gif' | 'poll' | undefined;

  if (!originalText || originalText.length < 10) {
    return NextResponse.json({ success: false, error: 'Content too short' }, { status: 400 });
  }

  // Try auth (optional in beta)
  let userId: string | null = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const auth = await verifyToken(authHeader.slice(7));
    if (auth) userId = auth.userId;
  }

  // Rate limit
  const identifier = userId ?? (request.headers.get('x-forwarded-for') ?? 'anonymous');
  const rateLimited = applyRateLimit(request, identifier);
  if (rateLimited) return rateLimited;

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ success: false, error: 'AI not configured' }, { status: 503 });
  }

  // Score original
  const originalResult = engine.evaluate({ text: originalText, platform: 'x', isThread: false, hasMedia, mediaType, isQuoteTweet, quotedMediaType });
  const originalScore = originalResult.score;

  // Compute which high-value signals the original is missing — we tell the
  // model exactly which levers to pull (rather than letting it wander). This
  // is what unblocks Chinese tweets where the previous AI only rearranged
  // words but never added a question mark / first-person / line break.
  const missingSignals = computeMissingSignals(originalResult);

  let currentBest = originalText;
  let currentBestScore = originalScore;
  const rounds: OptimizeRound[] = [];
  let totalGenerated = 0;

  for (let round = 1; round <= maxRounds; round++) {
    // Generate 3 variations of current best (pass originalText for language detection)
    const variations = await generateVariations(currentBest, round, originalText, missingSignals);
    totalGenerated += variations.length;

    // Score each variation with the same media + quote context as the original.
    const scored = variations.map(text => {
      const result = engine.evaluate({ text, platform: 'x', isThread: false, hasMedia, mediaType, isQuoteTweet, quotedMediaType });
      return { text, score: result.score };
    });

    // Find the best this round
    const roundBest = scored.reduce((best, v) => v.score > best.score ? v : best, { text: currentBest, score: currentBestScore });

    rounds.push({
      round,
      bestText: roundBest.text,
      bestScore: roundBest.score,
      delta: roundBest.score - originalScore,
      alternatives: scored.sort((a, b) => b.score - a.score),
    });

    // Stop conditions
    if (roundBest.score >= 85) break; // Perfect tier
    if (roundBest.score <= currentBestScore && round > 1) break; // Plateau

    // Update best for next round
    if (roundBest.score > currentBestScore) {
      currentBest = roundBest.text;
      currentBestScore = roundBest.score;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      originalScore,
      finalScore: currentBestScore,
      improvement: currentBestScore - originalScore,
      rounds,
      totalGenerated,
      bestText: currentBest,
    }
  });
}

async function generateVariations(seedText: string, round: number, originalText: string, missingSignals: MissingSignalHint[]): Promise<string[]> {
  const lang = detectLanguage(originalText);
  const langInstruction = getLanguageInstruction(lang);
  const langName = getLanguageName(lang);

  const strategies = round === 1
    ? 'Version 1: Reorder to lead with the strongest existing claim. Version 2: Start with a question the tweet answers. Version 3: Make the hook more provocative while keeping the same framing.'
    : 'Rearrange the existing content more aggressively. Try different sentence structures. Each version should try a DIFFERENT arrangement of the SAME content.';

  // Lower temperature to reduce hallucination — 0.4 base, slight increase per round
  const temperature = Math.min(0.4 + (round * 0.05), 0.6);

  // Inject which signals the model should target. This is the v6 fix: without
  // it, the model only knew to rearrange and never added hooks the original
  // lacked (e.g. question mark, first-person, line breaks for Chinese tweets).
  const missingHints = missingSignals.length > 0
    ? `\nThe current tweet is missing these high-value signals (each can add up to ${missingSignals[0].maxPotential} points):\n` +
      missingSignals.map((m) => `- ${m.hint}`).join('\n') +
      `\nAdd at least 2 of these patterns in your rewrites (without fabricating any data).\n`
    : '';

  // Per-language punctuation reminder
  const punctuationHint = lang === 'zh'
    ? '\nPUNCTUATION: Use full-width Chinese punctuation （。，？！）— NOT half-width ASCII (.,?!). End with ？ or 。 only.\n'
    : '\nPUNCTUATION: Use ASCII half-width punctuation.\n'
    ;

  try {
    const text = await callAnthropic({
      max_tokens: 1024,
      temperature,
      system: `You are an elite X/Twitter ghostwriter. You rewrite tweets to maximize reach.

${langInstruction}

WINNING PROFILE (from 200-experiment autoresearch optimization):
- Tone: provocative and bold (0.77), NOT casual
- Structure: personal story angle (0.85), first-person when possible
- Hook: strong pattern interrupt or bold claim (0.81)
- Length: ~2 sentences, around 250-280 characters
- Ending: question or provocative statement (~46% end with question)
- Style: NO emoji, NO hashtags, sound human not AI

CONTENT RULES (relaxed in v6 — punctuation/person/paragraphing/insider framing are allowed):
- PRESERVE all original facts, numbers, statistics, names, and claims
- DO NOT invent new facts, numbers, statistics, or specific claims
- DO NOT replace the original's metaphor with a different one
- You MAY change: word order, sentence structure, hook placement, ending, punctuation
- You MAY add: question marks / periods / first-person pronouns / line breaks / insider framing
- You MAY add short structural markers like "内幕：", "说个冷知识：", "Truth:" if they strengthen the hook
- You MAY NOT add specific data the original didn't tweet

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Round ${round}. Rewrite this tweet 3 ways in ${langName}.

RULES:
1. Write in ${langName} — same language as the original
2. PRESERVE the original message, analogies, metaphors, and framing
3. DO NOT invent new facts, numbers, statistics, or claims
4. DO NOT replace the original's metaphor with a different one
5. DO NOT add facts that weren't in the original
6. MAY change: word order, sentence structure, hook placement, ending style, punctuation
7. MAY add: question marks, line breaks, first-person pronouns, insider framing (e.g. "内幕：")
8. Each rewrite under 280 chars, 2 sentences max
9. NO emoji, NO hashtags, NO AI words (delve, landscape, leverage, unleash, paradigm)
${missingHints}${punctuationHint}${strategies}

Original tweet: "${seedText.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["v1", "v2", "v3"]}`,
      }],
    });
    let result2 = parseModelJson<{ suggestions?: string[] }>(text) ?? {};
    let candidates = result2.suggestions ?? extractTweetLikeStrings(text, 3);
    // Post-process: force full-width punctuation if the language is Chinese and
    // the AI forgot. Only replaces half-width closers that have full-width
    // equivalents — leaves digits / URLs / letters untouched.
    if (lang === 'zh') {
      candidates = candidates.map(toFullWidthPunctuation);
    }
    return candidates.filter((s: string) => s && s.length > 10 && s.length <= 280);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// v6: missing-signal injection
// ---------------------------------------------------------------------------

interface MissingSignalHint {
  signal: string;
  maxPotential: number;
  hint: string;
}

/**
 * Look at the score breakdown of the original and return a list of the
 * high-value signals that scored 0 (or very low), in descending order of
 * potential gain. The model uses this list to know which hooks to add.
 *
 * Only POSITIVE signals are listed — telling the model "remove a penalty"
 * produces evasive rewrites that often lose the original's punch.
 */
function computeMissingSignals(result: { signalScores: Record<string, { score: number; max: number; type: string }>; }): MissingSignalHint[] {
  const priorities: Array<{ signal: string; maxPotential: number; hint: string }> = [
    { signal: 'reply',            maxPotential: 12, hint: 'Add a question, opinion, or position the reader can react to. End with ？ or "你怎么看？" / "you?" / "thoughts?"' },
    { signal: 'dwell',            maxPotential: 8,  hint: 'Add line breaks (\\n\\n) or restructure to 2 distinct paragraphs. Aim for 80–280 chars.' },
    { signal: 'click',            maxPotential: 8,  hint: 'Optionally add a single descriptive link with a curiosity gap.' },
    { signal: 'favorite',         maxPotential: 7,  hint: 'Add an identifiable emotion word or first-person "我" / "I" voice.' },
    { signal: 'retweet',           maxPotential: 7,  hint: 'Tighten to under 200 chars and keep a quotable aphoristic shape.' },
    { signal: 'profile_click',    maxPotential: 7,  hint: 'Add a specific achievement or credential so readers want to know who you are.' },
    { signal: 'quote',            maxPotential: 6,  hint: 'Take a confident position readers can react to with their own commentary.' },
    { signal: 'share_via_dm',     maxPotential: 6,  hint: 'Add insider framing (内幕 / 真相 / "the truth behind" / "what nobody tells you") or niche-targeted value.' },
    { signal: 'follow_author',    maxPotential: 5,  hint: 'Add a series marker (第N天 / "Day 5/30" / "Part 3") or daily cadence signal.' },
    { signal: 'share',            maxPotential: 5,  hint: 'Add a surprising data point or news-shaped framing.' },
    { signal: 'share_via_copy_link', maxPotential: 4, hint: 'Add a framework / list / template / guide that is save-and-share worthy.' },
    { signal: 'photo_expand',     maxPotential: 4,  hint: 'Tease the image so readers tap to expand it.' },
    { signal: 'vqv',              maxPotential: 8,  hint: 'Add a caption hook so the video starts a quality view.' },
  ];

  const out: MissingSignalHint[] = [];
  for (const p of priorities) {
    const sig = result.signalScores[p.signal];
    if (!sig) continue;
    if (sig.type !== 'positive') continue;
    if (sig.score < p.maxPotential * 0.4) {
      out.push({ signal: p.signal, maxPotential: p.maxPotential, hint: p.hint });
    }
  }
  return out;
}

/**
 * Replace half-width ASCII closers with full-width Chinese ones. Only affects
 * punctuation the AI wrote when generating Chinese output. Idempotent.
 */
function toFullWidthPunctuation(text: string): string {
  return text
    // Don't touch URLs / digits — only common ASCII closers
    .replace(/,/g, '，')
    .replace(/\.(?=$|[\s一-鿿]|\?)/g, '。') // period before EOS / CJK
    .replace(/!(\?|$|\s)/g, '！$1')
    .replace(/\?(\?|$|\s)/g, '？$1')
    .replace(/;/g, '；')
    .replace(/:/g, '：')
    ;
}
