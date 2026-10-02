import type { TweetInput, RuleResult } from '@reach/shared-types';
import { detectSlopHeuristic } from './slop-detector';

// Core exports
export { detectSlopHeuristic } from './slop-detector';
export type { SlopMatch, SlopVerdict, SlopResult } from './slop-detector';
export { SLOP_PATTERNS } from './slop-patterns';
export type { SlopPattern } from './slop-patterns';

// AI pipeline exports
export { AIAnalyzer } from './analyzer';
export type { ServerAnalysisResult } from './analyzer';
export { createClaudeClient, analyzeWithClaude, parseClaudeJSON } from './claude-client';
export type { HookQualityResult } from './prompts/hook-quality';

// Anthropic-compatible HTTP wrapper — single fetch site, replaces ad-hoc hardcoded
// calls scattered across routes. Reads ANTHROPIC_BASE_URL for MiniMaxi support.
export {
  anthropicFetch,
  anthropicBaseUrl,
  extractText,
  ANTHROPIC_MODEL,
} from './anthropic-fetch';
export type {
  AnthropicFetchBody,
  AnthropicFetchOptions,
} from './anthropic-fetch';

// Language detection
export { detectLanguage, getLanguageInstruction } from './language-detect';
export type { DetectedLanguage } from './language-detect';

// Resilient JSON parsing — tolerates malformed model responses (missing commas,
// trailing commas, code-fence leakage, array vs object shape variants). Used
// by server routes that POST to /v1/messages and need to extract
// { suggestions: string[] } reliably.
export { safeParseJsonResponse, parseSuggestionsField } from './safe-parse-json';
export type { SafeParseResult } from './safe-parse-json';

// Backward-compatible stubs — use AIAnalyzer for full functionality
export async function analyzeWithAI(_input: TweetInput): Promise<RuleResult[]> {
  return [];
}

export async function detectAISlop(text: string): Promise<number> {
  const result = detectSlopHeuristic(text);
  return result.score;
}

export async function suggestHooks(_text: string): Promise<string[]> {
  return [];
}
