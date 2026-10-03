// Re-export the forecast engine from the shared rules-engine package so the
// extension and web app stay in sync. The original implementation lived
// here; it was moved to packages/rules-engine/src/forecast.ts.
//
// This file used to also contain a local copy of the implementations, but the
// duplicates broke `tsc --noEmit` (TS2323: Cannot redeclare exported variable).
// The local definitions have been deleted; callers should import from here (or
// directly from `@reach/rules-engine`).

export { computeForecast, formatNumber, FORECAST_CONSTANTS } from '@reach/rules-engine';
export type { ForecastInput } from '@reach/rules-engine';
