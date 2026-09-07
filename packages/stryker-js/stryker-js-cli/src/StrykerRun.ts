import type { Cell } from '@systemfsoftware/effect-cell-types'
import type { PrepareExecutorArgs, RunOutcome, StageError, StageServices } from '@systemfsoftware/stryker-js-engine'
import type * as Scope from 'effect/Scope'

export type StrykerRun = Cell.Cell<PrepareExecutorArgs, RunOutcome, StageError, StageServices>

export type StrykerRunCell = Cell.Cell<PrepareExecutorArgs, RunOutcome, StageError, Scope.Scope>
