import type { ReportType } from './stryker-options.schema.js'

/** Re-exported so importers keep `ReportType` from `@systemfsoftware/stryker-js-plugin-api/core`. */
export type { ReportType }

export const ALL_REPORT_TYPES: ReadonlyArray<ReportType> = Object.freeze([
  'full',
  'mutationScore',
])
