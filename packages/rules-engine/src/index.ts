export { ScoreEngine } from './engine';
export { buildContext } from './context';
export { runAllSignals, signalPredictors } from './signals';
export type { SignalPredictor } from './signals';
export { default as weights } from './config/weights.json';

// Reach forecast engine — shared between the Chrome extension and the Web app
export { computeForecast, formatNumber, FORECAST_CONSTANTS } from './forecast';
export type { ForecastInput } from './forecast';

// Individual signal predictors (escape hatch for tests / extension fine-tuning)
export {
  predictFavorite,
  predictReply,
  predictRetweet,
  predictQuote,
  predictShare,
  predictShareViaDm,
  predictShareViaCopyLink,
  predictClick,
  predictProfileClick,
  predictFollowAuthor,
  predictPhotoExpand,
  predictVqv,
  predictDwell,
  predictContDwellTime,
  predictContClickDwellTime,
  predictQuotedClick,
  predictQuotedVqv,
  predictNotDwelled,
  predictNotInterested,
  predictBlockAuthor,
  predictMuteAuthor,
  predictReport,
} from './signals';
