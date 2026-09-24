import { Cell } from '@systemfsoftware/effect-cell-types'
import type * as Crypto from 'effect/Crypto'
import type * as FileSystem from 'effect/FileSystem'
import { bootSandbox, type SandboxDraft } from './boot-sandbox.cell.js'
import type { LoopbackViolationError, SandboxBootError, VirtualizationUnsupportedError } from './MicroVMError.schema.js'
import { probeVirtualization } from './probe-virtualization.cell.js'
import type { BootInput } from './running-vm.handle.js'

export type BootMicroVMError =
  | LoopbackViolationError
  | SandboxBootError
  | VirtualizationUnsupportedError

export const bootMicroVM: Cell.Cell<
  SandboxDraft,
  BootInput,
  BootMicroVMError,
  Crypto.Crypto | FileSystem.FileSystem
> = probeVirtualization.pipe(
  Cell.mapInput((draft: SandboxDraft) => draft.spec),
  Cell.flatMap(() => bootSandbox),
)
