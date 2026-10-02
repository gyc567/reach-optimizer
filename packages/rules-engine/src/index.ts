export { ScoreEngine } from './engine';
export { buildContext } from './context';
export { runAllSignals, signalPredictors } from './signals';
export type { SignalPredictor } from './signals';
export { default as weights } from './config/weights.json';

// Reach Forecast Engine — shared by the Web scorer and the Chrome extension.
// Originally lived in apps/extension/src/content/forecast-engine.ts; moved
// here so the Web app can use it without depending on the extension package.
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
