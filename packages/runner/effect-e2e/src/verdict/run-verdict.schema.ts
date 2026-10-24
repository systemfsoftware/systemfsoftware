import * as Schema from 'effect/Schema'

import { ConfigInvalid } from '../Config/config-invalid.schema.js'
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

/**
 * How a run ended: judged by the verifier, or refused before any test ran because its config did not decode.
 * Collection and policy refusals join when a producer exists for them (requirements FR-5, exit 2).
 */
export const RunEnding = Schema.Union([
  Schema.TaggedStruct('Judged', { verdict: RunVerdict }),
  Schema.TaggedStruct('ConfigRefused', { error: ConfigInvalid }),
]).pipe(Schema.toTaggedUnion('_tag'))
export type RunEnding = typeof RunEnding.Type
