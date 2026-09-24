import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { MicroVM } from '@systemfsoftware/effect-microsandbox'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Queue, Stream } from 'effect'
import type * as Crypto from 'effect/Crypto'
import type * as FileSystem from 'effect/FileSystem'
import { declaration, port } from './micro-vm.medium.js'
import type { MicroVMProgram } from './MicroVMProgram.js'
import type { MicroVMWorkload } from './MicroVMProgram.schema.js'

const STEP_ENCODER = new TextEncoder()

export const ChildStepLines: Readonly<Record<Conformance.ChildStep['_tag'], string>> = {
  BecomeReady: 'ready',
  ExitNormal: 'exit-normal',
  ExitAbnormal: 'exit-abnormal',
  IgnoreGracefulStop: 'ignore-graceful-stop',
  NeverBecomeReady: 'never-become-ready',
}

const lineOf = (step: Conformance.ChildStep): Uint8Array => STEP_ENCODER.encode(`${ChildStepLines[step._tag]}\n`)

export const conformanceDriver = (
  workload: MicroVMWorkload,
): Conformance.ConformanceDriver<
  MicroVMProgram,
  MicroVM.MicroVMError,
  Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber
> => ({
  name: 'microvm',
  declaration,
  scenario: { millis: 60_000, startTimeoutMillis: 3_000 },
  port,
  launch: (_childId, _script) =>
    Effect.map(Queue.unbounded<Conformance.ChildStep>(), (steps) => ({
      program: { workload, stdin: Stream.fromQueue(steps).pipe(Stream.map(lineOf)) },
      control: { advance: (step) => Effect.asVoid(Queue.offer(steps, step)) },
    })),
})
