import * as S from 'effect/Schema'

import { ExitClass } from '../exit-classification.js'

export class PrepareFailedError extends S.TaggedError<PrepareFailedError>()(
  'PrepareFailedError',
  {
    reason: S.String,
    cause: S.optional(S.Unknown),
  },
) {
  readonly exitClass = ExitClass.ConfigError
}

export class InstrumentFailedError extends S.TaggedError<InstrumentFailedError>()(
  'InstrumentFailedError',
  {
    reason: S.String,
    cause: S.optional(S.Unknown),
  },
) {
  readonly exitClass = ExitClass.RuntimeError
}

export class DryRunNoTestsError extends S.TaggedError<DryRunNoTestsError>()(
  'DryRunNoTestsError',
  {
    reason: S.String,
  },
) {
  readonly exitClass = ExitClass.ConfigError
}

export class DryRunFailedError extends S.TaggedError<DryRunFailedError>()(
  'DryRunFailedError',
  {
    reason: S.String,
    cause: S.optional(S.Unknown),
  },
) {
  readonly exitClass = ExitClass.RuntimeError
}
