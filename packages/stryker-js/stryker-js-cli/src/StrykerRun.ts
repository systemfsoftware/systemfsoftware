import type { Cell } from '@systemfsoftware/effect-cell-types'
import type { PrepareExecutorArgs, RunOutcome, StageError, StageServices } from '@systemfsoftware/stryker-js-engine'

/**
 * The CLI's run capability: one Cell over the engine spine. The composition
 * root provides the host layer once; a run is `Cell.run` of this cell with
 * the command, at the process edge. An injected capability narrows R.
 */
export type StrykerRun = Cell.Cell<PrepareExecutorArgs, RunOutcome, StageError, StageServices>
