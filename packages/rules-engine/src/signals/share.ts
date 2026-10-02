import type { PostContext, SignalScore } from '@reach/shared-types';
import { buildSignalScore, NUMBER_REGEX } from './_helpers';

export const SHARE_MAX = 5;

export function predictShare(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'share',
    type: 'positive',
    bucket: 'engagement',
    max: SHARE_MAX,
    rules: [
      {
        name: 'surprising_fact',
        weight: 2,
        // English + Chinese: 突发 / 没想到 / 真相是 / 居然 / 说个冷知识 / 你知道吗 /
        // 说个反常识 / 太反直觉了
        test: (c) =>
          /\b(turns out|did you know|surprisingly|counterintuitive|believe it or not|breaking|just in)\b/i.test(
            c.text,
          ) || /突发|没想到|真相是|居然|说个冷知识|你知道吗|说个反常识|太反直觉了|万万没想到/.test(
            c.text,
          ),
      },
      {
        name: 'news_shaped',
        weight: 2,
        // English + Chinese: 据 / 报道 / 研究 / 报告显示 / 根据 / 数据显示
        test: (c) =>
          /\b(announced|launched|released|reports|study|research|report shows|according to)\b/i.test(
            c.text,
          ) || /据.{0,30}报道|最新.{0,10}显示|研究/.test(c.text),
      },
      {
        name: 'data_point',
        weight: 1,
        test: (c) => NUMBER_REGEX.test(c.text),
      },
    ],
    suggestionWhenLow:
      'Add a surprising data point or news-shaped framing to drive broadcast shares.',
  });
}
