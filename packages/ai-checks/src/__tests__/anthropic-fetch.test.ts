import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  anthropicFetch,
  anthropicBaseUrl,
  ANTHROPIC_MODEL,
  extractText,
} from '../anthropic-fetch';

const ORIGINAL_BASE_URL = process.env.ANTHROPIC_BASE_URL;

describe('anthropicFetch', () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_BASE_URL;
  });

  afterEach(() => {
    if (ORIGINAL_BASE_URL === undefined) {
      delete process.env.ANTHROPIC_BASE_URL;
    } else {
      process.env.ANTHROPIC_BASE_URL = ORIGINAL_BASE_URL;
    }
    vi.restoreAllMocks();
  });

  it('POSTs to the default Anthropic endpoint with the model id', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    });
    vi.stubGlobal('fetch', mock);

    await anthropicFetch('sk-test', {
      system: 'sys',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(ANTHROPIC_MODEL);
    expect(body.system).toBe('sys');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(body.max_tokens).toBe(512);
    expect(body.temperature).toBe(0.3);
  });

  it('honours ANTHROPIC_BASE_URL (MiniMaxi swap)', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://minimaxi.example.com';
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mock);

    await anthropicFetch('sk-test', {
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const [url] = mock.mock.calls[0];
    expect(url).toBe('https://minimaxi.example.com/v1/messages');
  });

  it('anthropicBaseUrl() reflects env at call time', () => {
    expect(anthropicBaseUrl()).toBe('https://api.anthropic.com');
    process.env.ANTHROPIC_BASE_URL = 'https://override.example.com';
    expect(anthropicBaseUrl()).toBe('https://override.example.com');
  });

  it('allows a per-call model override', async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mock);

    await anthropicFetch('sk-test', {
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      model: 'claude-sonnet-4-20250514',
    });

    const body = JSON.parse(mock.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-20250514');
  });

  it('throws on non-2xx with status code in the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'rate limit hit',
      }),
    );
    await expect(
      anthropicFetch('sk-test', {
        system: 's',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    ).rejects.toThrow(/Anthropic 429/);
  });

  it('throws on timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
    );
    await expect(
      anthropicFetch('sk-test', {
        system: 's',
        messages: [{ role: 'user', content: 'hi' }],
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/aborted|Anthropic/);
  });
});

describe('extractText', () => {
  it('returns the text of the first text block', () => {
    expect(
      extractText({ content: [{ type: 'text', text: 'hello' }, { type: 'text', text: 'world' }] }),
    ).toBe('hello');
  });

  it('returns null when content is missing or non-text', () => {
    expect(extractText(null)).toBeNull();
    expect(extractText({ content: [{ type: 'image' }] })).toBeNull();
    expect(extractText({})).toBeNull();
  });
});