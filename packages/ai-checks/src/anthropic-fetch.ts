// Centralised Anthropic-compatible HTTP wrapper.
//
// Replaces four hardcoded `fetch('https://api.anthropic.com/v1/messages', …)`
// call sites across the codebase. The base URL can be overridden via
// `ANTHROPIC_BASE_URL` env so a MiniMaxi-compatible (or any Anthropic-protocol)
// endpoint can be used without code changes. SDK callers should still prefer
// `createClaudeClient` for streaming / retries — this module exists for the
// minimal `messages` POST case used by suggest/auto-optimize/hooks.
//
// All callers go through `anthropicFetch` so behaviour stays consistent:
//   - 25s timeout (matches SDK helper)
//   - throws on non-2xx with the upstream status included in the error
//   - returns the parsed JSON body

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 25_000;

/**
 * Resolve the Anthropic base URL. Reads ANTHROPIC_BASE_URL at call time
 * (not at module load) so Vercel preview deployments can swap endpoints
 * between requests without restarting workers.
 */
export function anthropicBaseUrl(): string {
  return process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL;
}

/**
 * Single source of truth for the model id. Centralised so that swapping to
 * a MiniMaxi-tuned model only touches one place.
 */
export const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

export interface AnthropicFetchOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Override the model. Defaults to ANTHROPIC_MODEL (haiku). Some routes
   * (e.g. weekly tweet suggestions) deliberately use Sonnet for higher
   * quality. */
  model?: string;
}

export interface AnthropicFetchBody extends AnthropicFetchOptions {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * POST to /v1/messages and return the parsed JSON body.
 * Throws on network errors, timeout, or non-2xx.
 */
export async function anthropicFetch(
  apiKey: string,
  body: AnthropicFetchBody,
): Promise<unknown> {
  const url = `${anthropicBaseUrl()}/v1/messages`;
  const timeoutMs = body.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: body.model ?? ANTHROPIC_MODEL,
        max_tokens: body.maxTokens ?? 512,
        temperature: body.temperature ?? 0.3,
        system: body.system,
        messages: body.messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `Anthropic ${res.status} ${res.statusText}: ${errText.substring(0, 200)}`,
      );
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract the first text block from a /v1/messages response, or null if absent.
 */
export function extractText(response: unknown): string | null {
  if (
    response &&
    typeof response === 'object' &&
    'content' in response &&
    Array.isArray((response as { content: unknown[] }).content)
  ) {
    const blocks = (response as { content: Array<{ type?: string; text?: string }> }).content;
    const text = blocks.find((b) => b.type === 'text')?.text;
    return text ?? null;
  }
  return null;
}