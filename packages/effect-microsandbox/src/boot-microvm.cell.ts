import { Cell } from '@systemfsoftware/effect-cell-types'
import { awaitReadiness } from './await-readiness.cell.js'
import { bootSandbox } from './boot-sandbox.cell.js'
import { probeVirtualization } from './probe-virtualization.cell.js'

export const bootMicroVM = probeVirtualization.pipe(
  Cell.flatMap(() => bootSandbox),
  Cell.andThen(awaitReadiness),
)
