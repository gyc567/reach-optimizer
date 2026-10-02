// Re-export from the shared rules-engine so we have a single source of truth.
// The Web app (apps/api) consumes the same module; the extension historically
// owned this implementation and now points here for backward compatibility.

export {
  computeForecast,
  formatNumber,
  FORECAST_CONSTANTS,
} from '@reach/rules-engine';
export type { ForecastInput } from '@reach/rules-engine';