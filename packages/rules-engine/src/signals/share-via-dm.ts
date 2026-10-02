import type { PostContext, SignalScore } from '@reach/shared-types';
import {
  buildSignalScore,
  hasInsiderFraming,
  hasNicheTargeting,
} from './_helpers';

export const DM_SHARE_MAX = 6;

export function predictShareViaDm(ctx: PostContext): SignalScore {
  return buildSignalScore(ctx, {
    signal: 'share_via_dm',
    type: 'positive',
    bucket: 'engagement',
    max: DM_SHARE_MAX,
    rules: [
      {
        name: 'insider_framing',
        weight: 2,
        test: (c) => hasInsiderFraming(c.text),
      },
      {
        name: 'niche_targeting',
        weight: 2,
        test: (c) => hasNicheTargeting(c.text),
      },
      {
        name: 'send_to_friend_pattern',
        weight: 2,
        // English + Chinese: 转发给你朋友 / 转发给你的 / 转发给你的老板 / 转发给你的老板 / ...
    test: (c) =>
          /\b(send this to|tag (your|a) (friend|boss|teammate|founder|designer)|forward this|share this with)\b/i.test(
            c.text,
          ) ||
          /转发给(你的|你的朋友|你的同事|你的老板|你的老板|你的队友|你的合伙人)/.test(c.text),
      },
    ],
    suggestionWhenLow:
      'DM-shares are scored separately. Add insider framing or niche-targeted value.',
  });
}
