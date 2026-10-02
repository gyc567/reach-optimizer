import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@lib/auth';
import { applyRateLimit } from '@lib/middleware';
import { env } from '@lib/env';
import { anthropicFetch, extractText } from '@reach/ai-checks';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

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
    return NextResponse.json(
      { success: false, error: 'AI not configured' },
      { status: 503 },
    );
  }

  try {
    // Use the shared wrapper so ANTHROPIC_BASE_URL is honoured
    // (MiniMaxi / alternative Anthropic-compatible endpoint).
    const response = await anthropicFetch(env.ANTHROPIC_API_KEY, {
      maxTokens: 512,
      temperature: 0.7,
      system: 'You generate engaging reply templates for X/Twitter. Return ONLY valid JSON.',
      messages: [
        {
          role: 'user',
          content: `Generate 3 short, engaging reply templates that a creator can use to respond to followers' comments on their tweets. These should:
- Be conversational and genuine (not robotic)
- Encourage further discussion (reply-to-reply chains are worth 150x in the algorithm)
- Be under 100 characters each
- Include a question or open-ended element

Context: ${body.context || 'General tweet engagement'}

Return JSON: {"suggestions": ["reply1", "reply2", "reply3"]}`,
        },
      ],
    });

    const text = extractText(response) ?? '{}';
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const result = JSON.parse(cleaned);

    return NextResponse.json({
      success: true,
      suggestions: result.suggestions || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
