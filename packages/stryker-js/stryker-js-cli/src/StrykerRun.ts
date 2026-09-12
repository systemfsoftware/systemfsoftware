import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js'
import type { RunOutcome, StageError } from '@systemfsoftware/stryker-js-engine'
import type * as Effect from 'effect/Effect'

export type StrykerRun = (
  options: PartialStrykerOptions,
  targetMutatePatterns?: string[],
) => Effect.Effect<RunOutcome, StageError, never>
