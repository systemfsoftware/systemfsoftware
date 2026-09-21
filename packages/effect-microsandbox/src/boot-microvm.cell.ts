import { Cell } from '@systemfsoftware/effect-cell-types'
import type * as FileSystem from 'effect/FileSystem'
import type * as Scope from 'effect/Scope'
import { awaitReadiness } from './await-readiness.cell.js'
import { type AcquiredVM, bootSandbox } from './boot-sandbox.cell.js'
import type { MicroVMError } from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import { probeVirtualization } from './probe-virtualization.cell.js'

export const bootMicroVM: Cell.Cell<
  MicroVMSpec,
  AcquiredVM,
  MicroVMError,
  FileSystem.FileSystem | Scope.Scope
> = probeVirtualization.pipe(
  Cell.flatMap(() => bootSandbox),
  Cell.andThen(awaitReadiness),
)
