import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore } from './_helpers';

export const FOLLOW_AUTHOR_MAX = 5;

const SERIES_MARKER = new RegExp(
  '\\b(\\d+\\s*\\/\\s*\\d+|part\\s+\\d+|thread\\s*\\d+|day\\s+\\d+\\b|chapter\\s+\\d+)\\b' +
    '|' +
    '第\\d+(天|个|章|期|课|条|篇)|第\\s*\\d+\\s*[\\\\/]',
  'i',
);
const NICHE_OWNERSHIP = new RegExp(
  '\\b(every day I post|I share daily|I tweet about|building in public|I document)\\b' +
    '|' +
    '(每天.{0,10}发|坚持.{0,10}更新|我会.{0,10}连载|每天都发|持续更新|连续.{0,10}天)',
  'i',
);

export function predictFollowAuthor(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'follow_author',
    type: 'positive',
    bucket: 'curiosity',
    max: FOLLOW_AUTHOR_MAX,
    rules: [
      {
        name: 'series_marker',
        weight: 2,
        test: (c) => SERIES_MARKER.test(c.text),
      },
      {
        name: 'niche_ownership',
        weight: 2,
        test: (c) => NICHE_OWNERSHIP.test(c.text),
      },
      {
        name: 'distinctive_voice',
        weight: 1,
        // Three independent voice signals:
        //   - ellipsis / em-dash ending (trailing-off style)
        //   - lowercase-start first line (lowercase styling — case-sensitive
        //     so we don't false-positive on every capitalized English tweet)
        //   - declarative "my rule" / "my take" / Chinese "我的原则" / "我的看法" framing
        test: (c) =>
          /(\.\.\.\s*$|—\s*$)/.test(c.firstLine) ||
          /^\s*[a-z]/.test(c.firstLine) ||
          /\b(I always|I never|my rule|my take|my advice)\b/i.test(c.text) ||
          /我的原则|我的看法|我的建议|我的规矩|我的暴论|我一直|我永远/.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Signal continuity (series marker, daily cadence) so readers expect more from you.',
  });
}
