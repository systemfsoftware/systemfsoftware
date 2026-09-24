import { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import type { MicroVM } from '@systemfsoftware/effect-microsandbox'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, HashMap, Option, Queue, Ref, Stream } from 'effect'
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

/**
 * Each incarnation gets its own channel. The kernel starts a child at generation 0 and each
 * restart is `child.generation + 1`, so the driver's per-child launch count *is* the kernel's
 * generation, and an incarnation claims its channel when the medium runs the workload's stdin for
 * it. A step is written to the channel of exactly the generation it is for; one whose generation
 * has not started yet waits on that generation and is flushed when it claims its channel. A
 * superseded incarnation reads only its own channel, so it can never take a successor's step —
 * which matters because a stop is reported before the sandbox is gone, and its exec's stdin is
 * still being fed until its scope closes.
 */
interface Channels {
  readonly launched: Ref.Ref<number>
  readonly open: Ref.Ref<HashMap.HashMap<number, Queue.Queue<Conformance.ChildStep>>>
  readonly waiting: Ref.Ref<HashMap.HashMap<number, ReadonlyArray<Conformance.ChildStep>>>
}

const heldFor = (
  buffered: HashMap.HashMap<number, ReadonlyArray<Conformance.ChildStep>>,
  generation: number,
): ReadonlyArray<Conformance.ChildStep> => Option.getOrElse(HashMap.get(buffered, generation), () => [])

const takeHeld = (channels: Channels, generation: number): Effect.Effect<ReadonlyArray<Conformance.ChildStep>> =>
  Effect.map(
    Ref.modify(channels.waiting, (buffered) => [
      heldFor(buffered, generation),
      HashMap.remove(buffered, generation),
    ]),
    (held) => held,
  )

const claimChannel = (channels: Channels): Effect.Effect<Queue.Queue<Conformance.ChildStep>> =>
  Effect.gen(function*() {
    const generation = yield* Ref.modify(channels.launched, (count) => [count, count + 1])
    const steps = yield* Queue.unbounded<Conformance.ChildStep>()
    yield* Queue.offerAll(steps, yield* takeHeld(channels, generation))
    yield* Ref.update(channels.open, (open) => HashMap.set(open, generation, steps))
    return steps
  })

const stdinFor = (channels: Channels): Stream.Stream<Uint8Array> =>
  Stream.unwrap(
    Effect.map(claimChannel(channels), (steps) => Stream.fromQueue(steps).pipe(Stream.map(lineOf))),
  )

const offerTo = (channels: Channels) => (step: Conformance.ChildStep, generation: number): Effect.Effect<void> =>
  Effect.gen(function*() {
    const open = yield* Ref.get(channels.open)
    yield* Option.match(HashMap.get(open, generation), {
      onSome: (steps) => Effect.asVoid(Queue.offer(steps, step)),
      onNone: () =>
        Ref.update(
          channels.waiting,
          (buffered) => HashMap.set(buffered, generation, [...heldFor(buffered, generation), step]),
        ),
    })
  })

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
    Effect.map(
      Effect.gen(function*() {
        const channels: Channels = {
          launched: yield* Ref.make(0),
          open: yield* Ref.make(HashMap.empty<number, Queue.Queue<Conformance.ChildStep>>()),
          waiting: yield* Ref.make(HashMap.empty<number, ReadonlyArray<Conformance.ChildStep>>()),
        }
        return channels
      }),
      (channels) => ({
        program: { workload, stdin: stdinFor(channels) },
        control: { advance: offerTo(channels) },
      }),
    ),
})
