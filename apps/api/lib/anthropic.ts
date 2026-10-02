// Shared Anthropic-compatible client helper.
//
// Centralizes:
//   1. Base URL — env.ANTHROPIC_BASE_URL override (for proxies like
//      api.minimaxi.com/anthropic) with safe Anthropic fallback.
//   2. Model — env.ANTHROPIC_MODEL default, overridable per call.
//   3. The actual fetch call, headers, and JSON parse.
//   4. Error mapping — throws an `AnthropicCallError` with the upstream
//      status + a short message so route handlers can surface a clean error.
//
// Routes must NOT hardcode api.anthropic.com or specific model names —
// they should call callAnthropic() so the env-driven override always wins.

import { env } from './env';

export const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const DEFAULT_BASE = 'https://api.anthropic.com';
const MESSAGES_PATH = '/v1/messages';

export interface CallAnthropicOptions {
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  max_tokens?: number;
  temperature?: number;
  /** Override the default model from env. */
  model?: string;
  signal?: AbortSignal;
}

export class AnthropicCallError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'AnthropicCallError';
  }
}

/**
 * Resolve the base URL — strip trailing slash so we can append /v1/messages
 * deterministically. Empty/unset env value falls back to Anthropic direct.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.ANTHROPIC_BASE_URL?.replace(/\/+$/, '');
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_BASE;
}

function resolveModel(override?: string): string {
  return (
    override ??
    process.env.ANTHROPIC_MODEL ??
    DEFAULT_MODEL
  );
}

export interface AnthropicMessage {
  text: string;
}

export interface AnthropicResponse {
  content: AnthropicMessage[];
  model: string;
  stop_reason: string | null;
}

/**
 * Call an Anthropic-compatible /v1/messages endpoint and return the joined
 * text of the response content array.
 *
 * Throws AnthropicCallError on non-2xx. Caller decides HTTP status mapping.
 */
export async function callAnthropic(opts: CallAnthropicOptions): Promise<string> {
  const base = resolveBaseUrl();
  const url = `${base}${MESSAGES_PATH}`;
  const model = resolveModel(opts.model);
  const apiKey = env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new AnthropicCallError('AI features not configured', 503);
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: opts.max_tokens ?? 512,
    messages: opts.messages,
  };
  if (opts.system) body.system = opts.system;
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
    } catch {
      // ignore
    }
    throw new AnthropicCallError(`Anthropic ${res.status}`, res.status, text);
  }

  const data = (await res.json()) as AnthropicResponse;
  const text = data.content?.[0]?.text ?? '';
  return text;
}

/**
 * Parse JSON from a model response, stripping common markdown fences.
 * Returns null if the response is empty or unparseable.
 */
export function parseModelJson<T>(raw: string): T | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .replace(/```/g, '')
    .trim();
  if (!cleaned) return null;

  // Attempt 1: try the full cleaned string as-is.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through
  }

  // Attempt 2: extract the first {...} block (most common — prose + JSON).
  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    const objCandidate = cleaned.slice(objStart, objEnd + 1);
    try {
      return JSON.parse(objCandidate) as T;
    } catch {
      // fall through
    }
  }

  // Attempt 3: extract the first [...] block (model sometimes returns bare array).
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    const arrCandidate = cleaned.slice(arrStart, arrEnd + 1);
    try {
      return JSON.parse(arrCandidate) as unknown as T;
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Extract quoted strings that look like tweets (10-280 chars). Used as a
 * final fallback when the model returns prose with embedded suggestions
 * instead of strict JSON. Returns up to `limit` strings.
 */
export function extractTweetLikeStrings(raw: string, limit = 3): string[] {
  if (!raw) return [];
  // Step 1: try quoted strings
  const matches = raw.match(/"([^"\\]{15,280})"/g) ?? [];
  const fromQuotes = matches
    .map((m) => m.slice(1, -1))
    .filter((s) => !s.startsWith('{') && !s.startsWith('[') && !s.includes('suggestions') && !/^v\d/i.test(s));
  if (fromQuotes.length >= limit) return fromQuotes.slice(0, limit);

  // Step 2: try numbered/bulleted lines (V1: ..., 1. ..., - ..., etc.)
  const lineMatches = raw.match(/(?:^|\n)(?:[Vv][123][\s.:)|][^\n]+|[\-*\d][\s.)\]]+[^\n]{20,280})/g) ?? [];
  const fromLines = lineMatches
    .map((l) => l.replace(/^[\s\-*\d.)\]]+/, '').replace(/^[Vv][123][\s.:)|]+/, '').trim())
    .filter((s) => s.length >= 20 && s.length <= 280);
  if (fromLines.length >= limit) return fromLines.slice(0, limit);

  // Step 3: try sentence-level chunks (split on '. ' or '? ' or '! ')
  const sentences = raw
    .replace(/```/g, '')
    .split(/(?<=[.?!])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 280 && !s.startsWith('{') && !s.startsWith('[') && !/return json/i.test(s));
  if (sentences.length >= limit) return sentences.slice(0, limit);

  // Return best union
  return [...fromQuotes, ...fromLines, ...sentences].slice(0, limit);
}

export const anthropicHelpers = {
  resolveBaseUrl,
  resolveModel,
  DEFAULT_BASE,
  MESSAGES_PATH,
  DEFAULT_MODEL,
};

// Suppress unused warning for the const export when only callAnthropic is used.
void anthropicHelpers;