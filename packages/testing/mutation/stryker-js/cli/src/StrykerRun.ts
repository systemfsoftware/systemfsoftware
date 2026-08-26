import type { StageError } from '@systemfsoftware/stryker-js-platform-node'
import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import type * as Effect from 'effect/Effect'

/**
 * The mutation-testing entry the CLI calls once options are parsed. Injectable
 * so tests capture the parsed options without starting a real mutation run.
 */
export type StrykerRun = (options: PartialStrykerOptions) => Effect.Effect<unknown, StageError, never>
