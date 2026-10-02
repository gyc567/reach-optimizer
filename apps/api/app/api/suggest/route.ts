import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { detectLanguage, getLanguageInstruction, getLanguageName } from '@reach/ai-checks';
import { callAnthropic, AnthropicCallError, parseModelJson, extractTweetLikeStrings } from '@lib/anthropic';

// Force Node.js runtime (Anthropic SDK needs net/tls)
export const runtime = 'nodejs';
export const maxDuration = 30;
import type { SuggestRequest, SuggestResponse, ErrorResponse } from '@reach/shared-types';

/**
 * Generate a self-reply for the user to post immediately after their tweet.
 * Self-replies kickstart conversation threads (150x algorithm boost).
 */
async function generateSelfReply(tweetContent: string): Promise<string[]> {
  const lang = detectLanguage(tweetContent);
  const langInstruction = getLanguageInstruction(lang);

  const text = await callAnthropic({
    temperature: 0.5,
    system: `You write self-replies for X/Twitter. A self-reply is the FIRST reply the author posts under their own tweet. It MUST be directly related to the tweet content and in the SAME LANGUAGE.

${langInstruction}

Return ONLY valid JSON.`,
    messages: [{
      role: 'user',
      content: `Write 1 self-reply for this tweet. STRICT RULES:

1. SAME LANGUAGE as the original tweet — write in ${getLanguageName(lang)}
2. The reply MUST reference a SPECIFIC concept, term, or claim from the original tweet
3. Add ONE specific detail: a concrete follow-up fact, a surprising angle, or a pointed question about something mentioned in the tweet
4. The reply must make ZERO sense without reading the original tweet — that's how specific it should be
5. NEVER ask generic questions like "What do you think?" or "Anyone else experienced this?"
6. Under 200 characters
7. No emoji unless the original has them
8. Sound like a real person continuing their thought

EXTRACT the main topic/claim from this tweet, then write a follow-up that ONLY makes sense in that context:

Original tweet: "${tweetContent.replace(/"/g, '\\"')}"

Return JSON: {"suggestions": ["self-reply"]}`,
    }],
  });
  const result = parseModelJson<{ suggestions?: string[] }>(text) ?? {};
  return result.suggestions ?? extractTweetLikeStrings(text, 1);
}
// Note: "Hook rewrites × 3" mode was removed in v8. The endpoint now only
// handles "self-reply" requests. /api/tweets/auto-optimize covers the rewrite
// use case with full scoring + multi-round improvement.

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  // Parse body first
  const body: SuggestRequest = await request.json();
  if (!body.content || typeof body.content !== 'string') {
    return NextResponse.json(
      { success: false, error: 'Content is required', code: 'VALIDATION_ERROR' } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  // Try auth (optional in beta)
  let userId: string | null = null;
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const auth = await verifyToken(authHeader.slice(7));
    if (auth) userId = auth.userId;
  }

  // Rate limit by userId or IP
  const identifier = userId ?? (request.headers.get('x-forwarded-for') ?? 'anonymous');
  const rateLimited = applyRateLimit(request, identifier);
  if (rateLimited) return rateLimited;

  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'AI features not configured', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
      { status: 503 }
    );
  }

  // Only "self-reply" is supported. Reject anything else with 400 instead
  // of silently routing to self-reply, so clients can detect API drift early.
  if (body.type !== 'self-reply') {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported type "${body.type ?? ''}" — only "self-reply" is supported`,
        code: 'VALIDATION_ERROR',
      } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  try {
    const suggestions = await generateSelfReply(body.content);
    return NextResponse.json({ success: true, suggestions });
  } catch (error) {
    // AnthropicCallError carries the upstream HTTP code so we can map it
    // correctly (403/429/etc.) and the user-facing UI can distinguish
    // "config missing" (503) from "rate limited" (429) from "broken proxy" (500).
    if (error instanceof AnthropicCallError) {
      if (error.status === 429) {
        return NextResponse.json(
          { success: false, error: 'AI generation failed: ' + error.message, code: 'RATE_LIMITED' } satisfies ErrorResponse,
          { status: 429 }
        );
      }
      if (error.status === 503) {
        return NextResponse.json(
          { success: false, error: 'AI features not configured', code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
          { status: 503 }
        );
      }
      // 401 / 403 / 5xx upstream → 502 bad gateway so caller knows it's not their fault
      return NextResponse.json(
        { success: false, error: 'AI generation failed: ' + error.message, code: 'INTERNAL_ERROR' } satisfies ErrorResponse,
        { status: 502 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'AI generation failed: ' + (error instanceof Error ? error.message : String(error)), code: 'INTERNAL_ERROR' } as ErrorResponse,
      { status: 500 }
    );
  }
}
