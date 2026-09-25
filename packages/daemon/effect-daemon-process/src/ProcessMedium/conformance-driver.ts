/**
 * The conformance driver a process medium hands to `Conformance.prove` (U8, KTD14).
 *
 * Each incarnation gets its own channel. The kernel starts a child at generation 0 and each
 * restart is `child.generation + 1`, so the driver's per-child launch count *is* the kernel's
 * generation, and an incarnation claims its channel when the spawner materialises the command's
 * `stdin` for it. A step is written to the channel of exactly the generation it is for; one
 * whose generation has not launched yet waits on that generation and is flushed when it claims
 * its channel. A superseded incarnation reads only its own channel, so it can never take a
 * successor's step — which matters because a stop is reported before the process is gone, and
 * the incumbent's stdin is still being read until its scope closes.
 *
 * @since 0.1.0
 */
import type { Conformance } from '@systemfsoftware/effect-daemon-conformance'
import { Effect, HashMap, Option, Queue, Ref, Scope, Stream } from 'effect'
import * as PlatformError from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { declaration, port } from './medium.js'

export const fixtureReadyLine = 'READY'

export interface ProcessConformanceDriverOptions {
  readonly fixturePath: string
  readonly nodePath?: string | undefined
  readonly fixtureArgs?: ReadonlyArray<string> | undefined
}

const TEARDOWN_FORCE_KILL = '1 second'

const encoder = new TextEncoder()

const commandLineOf = (options: ProcessConformanceDriverOptions): ReadonlyArray<string> => [
  options.fixturePath,
  ...(options.fixtureArgs ?? []),
]

interface Channels {
  readonly launched: Ref.Ref<number>
  readonly open: Ref.Ref<HashMap.HashMap<number, Queue.Queue<Uint8Array>>>
  readonly waiting: Ref.Ref<HashMap.HashMap<number, ReadonlyArray<Uint8Array>>>
}

const heldFor = (
  buffered: HashMap.HashMap<number, ReadonlyArray<Uint8Array>>,
  generation: number,
): ReadonlyArray<Uint8Array> => Option.getOrElse(HashMap.get(buffered, generation), () => [])

const takeHeld = (channels: Channels, generation: number): Effect.Effect<ReadonlyArray<Uint8Array>> =>
  Effect.map(
    Ref.modify(channels.waiting, (buffered) => [
      heldFor(buffered, generation),
      HashMap.remove(buffered, generation),
    ]),
    (held) => held,
  )

const claimChannel = (channels: Channels): Effect.Effect<Queue.Queue<Uint8Array>> =>
  Effect.gen(function*() {
    const generation = yield* Ref.modify(channels.launched, (count) => [count, count + 1])
    const steps = yield* Queue.unbounded<Uint8Array>()
    yield* Queue.offerAll(steps, yield* takeHeld(channels, generation))
    yield* Ref.update(channels.open, (open) => HashMap.set(open, generation, steps))
    return steps
  })

const stdinFor = (channels: Channels): Stream.Stream<Uint8Array> =>
  Stream.unwrap(Effect.map(claimChannel(channels), Stream.fromQueue))

const programOf = (
  options: ProcessConformanceDriverOptions,
  channels: Channels,
): ChildProcess.Command =>
  ChildProcess.make(options.nodePath ?? process.execPath, commandLineOf(options), {
    stdin: stdinFor(channels),
    forceKillAfter: TEARDOWN_FORCE_KILL,
  })

const offerTo = (channels: Channels) => (step: Conformance.ChildStep, generation: number): Effect.Effect<void> =>
  Effect.gen(function*() {
    const item = encoder.encode(`${step._tag}\n`)
    const open = yield* Ref.get(channels.open)
    yield* Option.match(HashMap.get(open, generation), {
      onSome: (steps) => Effect.asVoid(Queue.offer(steps, item)),
      onNone: () =>
        Ref.update(
          channels.waiting,
          (buffered) => HashMap.set(buffered, generation, [...heldFor(buffered, generation), item]),
        ),
    })
  })

const launchOf = (
  options: ProcessConformanceDriverOptions,
): Effect.Effect<Conformance.LaunchedChild<ChildProcess.Command>, never, Scope.Scope> =>
  Effect.gen(function*() {
    const channels: Channels = {
      launched: yield* Ref.make(0),
      open: yield* Ref.make(HashMap.empty<number, Queue.Queue<Uint8Array>>()),
      waiting: yield* Ref.make(HashMap.empty<number, ReadonlyArray<Uint8Array>>()),
    }
    return {
      program: programOf(options, channels),
      control: { advance: offerTo(channels) },
    }
  })

export const conformanceDriver = (
  options: ProcessConformanceDriverOptions,
): Conformance.ConformanceDriver<
  ChildProcess.Command,
  PlatformError.PlatformError,
  ChildProcessSpawner.ChildProcessSpawner
> => ({
  name: 'process',
  declaration,
  scenario: { millis: 30_000, startTimeoutMillis: 3_000, livenessTickMillis: 30_000 },
  port,
  launch: () => launchOf(options),
})
