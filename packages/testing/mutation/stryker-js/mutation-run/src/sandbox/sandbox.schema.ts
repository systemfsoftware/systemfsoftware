import { Schema as S } from 'effect'

import { ExitClass } from '../exit-classification.js'

export class BuildCommandFailedError extends S.TaggedError<BuildCommandFailedError>()(
  'BuildCommandFailedError',
  {
    command: S.String,
    description: S.String,
    cause: S.optional(S.Unknown),
  },
) {
  readonly exitClass = ExitClass.RuntimeError
}

export class SpawnFailedError extends S.TaggedError<SpawnFailedError>()(
  'SpawnFailedError',
  {
    command: S.String,
    cause: S.Unknown,
  },
) {
  readonly exitClass = ExitClass.RuntimeError
}
