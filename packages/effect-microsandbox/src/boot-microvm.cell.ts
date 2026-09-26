import { Cell } from '@systemfsoftware/effect-cell-types'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Match } from 'effect'
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

type StartRefusal = LoopbackViolationError | VirtualizationUnsupportedError

type StartAnswer = AcquiredVM | StartRefusal

type StartError =
  | LoopbackViolationError
  | PortAllocationError
  | SandboxBootError
  | VirtualizationUnsupportedError
  | WaitTimeoutError

type StartServices = Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber | Scope.Scope

type StartStage = Cell.Cell<MicroVMSpec, StartAnswer, StartError, StartServices>

type BootedStart = Cell.Cell<MicroVMSpec, AcquiredVM, StartError, StartServices>

export const bootMicroVM: Cell.Cell<
  MicroVMSpec,
  AcquiredVM,
  LoopbackViolationError | PortAllocationError | SandboxBootError | VirtualizationUnsupportedError | WaitTimeoutError,
  Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber | Scope.Scope
> = probeVirtualization.pipe(
  Cell.flatMap((probe) =>
    Match.value(probe).pipe(
      Match.tag('VirtualizationUnsupportedError', (refusal): StartStage =>
        Cell.succeed<VirtualizationUnsupportedError, MicroVMSpec>(refusal)),
      Match.orElse((): StartStage =>
        bootSandbox.pipe(
          Cell.flatMap((plan) =>
            Match.value(plan).pipe(
              Match.tag('LoopbackViolationError', (refusal): StartStage =>
                Cell.succeed<LoopbackViolationError, MicroVMSpec>(refusal)),
              Match.orElse((vm): StartStage =>
                Cell.succeed<AcquiredVM, MicroVMSpec>(vm).pipe(Cell.andThen(awaitReadiness))
              ),
            )
          ),
        )
      ),
    )
  ),
  Cell.flatMap((answer) =>
    Match.value(answer).pipe(
      Match.tag('VirtualizationUnsupportedError', (refusal): BootedStart => Cell.fail(refusal)),
      Match.tag('LoopbackViolationError', (refusal): BootedStart => Cell.fail(refusal)),
      Match.orElse((vm): BootedStart => Cell.succeed<AcquiredVM, MicroVMSpec>(vm)),
    )
  ),
)
