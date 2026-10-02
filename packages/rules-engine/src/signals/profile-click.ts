import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  FIRST_PERSON_REGEX,
  hasControversyMarker,
} from './_helpers';

export const PROFILE_CLICK_MAX = 7;

// Achievement verbs (EN) + Chinese. Use new RegExp() to combine the EN and
// ZH branches into a single regex literal — JS `|` between two literals is
// bitwise-OR, not regex alternation.
const SPECIFIC_ACHIEVEMENT = new RegExp(
  '\\bI\\s+(?:built|launched|shipped|founded|sold|raised|grew|scaled|wrote|coded|hired)\\b' +
    '|' +
    '我(?:创建|推出|发布|创立|卖出|筹款|扩张|扩展|写|搭|从零开始做)',
  'i',
);
const CREDENTIAL = new RegExp(
  '\\b(ex[- ]|former)\\s*\\w+|' +
    '\\b\\d+\\+?\\s*(years?|months?)\\s+(in|at|of)\\s+\\w+|' +
    '\\b(CEO|CTO|CMO|founder|head of)\\b\\s+(at|of)\\s+\\w+' +
    '|' +
    '前(谷歌|微软|苹果|亚马逊|脸书|阿里巴巴|腾讯|字节跳动|美团|京东|华为|小米|百度)' +
    '|' +
    '\\d+\\+?\\s*(?:年|个月).+(?:经验|经历)',
  'i',
);
const PERSPECTIVE = new RegExp(
  "\\b(I'?ve (?:seen|learned|noticed|tried)|in my (\\d+\\s+)?(years?|months?)|after (?:building|running|launching)|every time I)\\b" +
    '|' +
    '我(做了|见过|尝试过|学习)|在我的.{0,20}(经验|经历)',
  'i',
);

export function predictProfileClick(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'profile_click',
    type: 'positive',
    bucket: 'curiosity',
    max: PROFILE_CLICK_MAX,
    rules: [
      {
        name: 'specific_achievement',
        weight: 3,
        test: (c) => SPECIFIC_ACHIEVEMENT.test(c.text),
      },
      {
        name: 'named_credentials',
        weight: 2,
        test: (c) => CREDENTIAL.test(c.text),
      },
      {
        name: 'unusual_perspective',
        weight: 1,
        test: (c) => PERSPECTIVE.test(c.text),
      },
      {
        name: 'contrarian_pov',
        weight: 1,
        test: (c) => FIRST_PERSON_REGEX.test(c.text) && hasControversyMarker(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a specific achievement or credential so readers want to know who you are.',
  });
}