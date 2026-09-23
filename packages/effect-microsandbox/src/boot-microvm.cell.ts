import { Cell } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import type * as Crypto from 'effect/Crypto'
import type * as FileSystem from 'effect/FileSystem'
import type * as Scope from 'effect/Scope'
import { awaitReadiness } from './await-readiness.cell.js'
import { type AcquiredVM } from './boot-sandbox.cell.js'
import { bootSandbox } from './boot-sandbox.cell.js'
import type {
  LoopbackViolationError,
  PortAllocationError,
  SandboxBootError,
  VirtualizationUnsupportedError,
  WaitTimeoutError,
} from './MicroVMError.schema.js'
import type { MicroVMSpec } from './MicroVMSpec.schema.js'
import { probeVirtualization } from './probe-virtualization.cell.js'

export const bootMicroVM: Cell.Cell<
  MicroVMSpec,
  AcquiredVM,
  LoopbackViolationError | PortAllocationError | SandboxBootError | VirtualizationUnsupportedError | WaitTimeoutError,
  Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber | Scope.Scope
> = probeVirtualization.pipe(
  Cell.flatMap(() => bootSandbox),
  Cell.andThen(awaitReadiness),
)
