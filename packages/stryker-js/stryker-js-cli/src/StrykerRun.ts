import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js/Options'
import type * as Effect from 'effect/Effect'
import type { RunOutcome, StageError } from './run/index.js'

export type StrykerRun = (
  options: PartialStrykerOptions,
  targetMutatePatterns?: string[],
) => Effect.Effect<RunOutcome, StageError, never>
