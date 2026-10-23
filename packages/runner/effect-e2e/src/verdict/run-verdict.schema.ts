import * as Schema from 'effect/Schema'

import { FailureRecord } from './failure.schema.js'

export const RunStatus = Schema.Literals(['passed', 'failed', 'blocked', 'error', 'interrupted'])
export type RunStatus = typeof RunStatus.Type

export const ExitCode = Schema.Literals([0, 1, 2, 3, 4, 130])
export type ExitCode = typeof ExitCode.Type

export const RunVerdict = Schema.Struct({
  status: RunStatus,
  exitCode: ExitCode,
  failures: Schema.Array(FailureRecord),
})
export type RunVerdict = typeof RunVerdict.Type
