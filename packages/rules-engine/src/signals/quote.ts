import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasControversyMarker,
  hasOpinionMarker,
} from './_helpers';

export const QUOTE_MAX = 6;

export function predictQuote(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'quote',
    type: 'positive',
    bucket: 'engagement',
    max: QUOTE_MAX,
    rules: [
      {
        name: 'contrarian_or_polarizing',
        weight: 3,
        test: (c) => hasControversyMarker(c.text),
      },
      {
        name: 'confident_declarative',
        weight: 2,
        test: (c) =>
          /\b(is|are|will|always|never)\b.+[.!]/i.test(c.text) && hasOpinionMarker(c.text),
      },
      {
        name: 'invites_commentary',
        weight: 1,
        // English + Chinese: 怎么 / 怎么看 / 你们怎么看 / 你们说呢 / 你怎么看
        test: (c) =>
          /\b(thoughts\??|disagree\??|change my mind|fight me|tell me I'?m wrong)\b/i.test(c.text) ||
          /怎么看|你们怎么看|你们说呢|你怎么看|欢迎反驳|同意吗|同意的请举手|说说你的看法/.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Take a confident position people can react to with their own commentary.',
  });
}
