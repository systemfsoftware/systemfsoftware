import type { ReporterFailed } from '@systemfsoftware/stryker-js/Reporter'

const REPORTER_FAILED_TAG = 'ReporterFailed' as const

export const reporterFailure = (payload: Omit<ReporterFailed, '_tag'>): Error & ReporterFailed =>
  Object.assign(new Error(payload.cause), { ...payload, _tag: REPORTER_FAILED_TAG })
