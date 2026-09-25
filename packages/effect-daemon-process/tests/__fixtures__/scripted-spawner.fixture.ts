/**
 * A scripted child-process spawner: the `ChildProcessSpawner` port double the process
 * medium's conformance checks drive the real medium and driver through.
 *
 * It models the platform's documented contract — `spawn` hands back a handle bound to the
 * caller's scope, `kill` signals the child, the scope's release kills it, and `exitCode`
 * fails in the platform's own words when the child dies from a signal — and runs the
 * medium-independent child script in process, so a check drives incarnations without
 * spawning an operating-system process.
 */
import {
  Array as Arr,
  Context,
  Data,
  Deferred,
  Effect,
  HashMap,
  Layer,
  Match,
  Option,
  Queue,
  Ref,
  Sink,
  Stream,
} from 'effect'
import type { Scope } from 'effect'
import * as PlatformError from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'

const READY_LINE = 'READY'

const encoder = new TextEncoder()

const decoder = new TextDecoder()

const GRACEFUL = 'SIGTERM'

const FORCED = 'SIGKILL'

/**
 * The platform's own wording for a signal death (`NodeChildProcessSpawner.exitCode`), which
 * the medium decodes back into the signal name it reports.
 */
const signalErrorOf = (signal: string): PlatformError.PlatformError =>
  PlatformError.systemError({
    _tag: 'Unknown',
    module: 'ChildProcessSpawner',
    method: 'exitCode',
    cause: new globalThis.Error(`Process interrupted due to receipt of signal: '${signal}'`),
  })

interface Incarnation {
  readonly name: string
  readonly stdout: Queue.Queue<Uint8Array>
  readonly exit: Deferred.Deferred<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>
  readonly ignoresGracefulStop: Ref.Ref<boolean>
}

interface Registry {
  readonly sequence: Ref.Ref<number>
  readonly live: Ref.Ref<HashMap.HashMap<string, Incarnation>>
  readonly signals: Ref.Ref<HashMap.HashMap<string, ReadonlyArray<string>>>
  readonly last: Ref.Ref<Option.Option<string>>
}

/** An incarnation the scripted spawner started and has not killed or seen exit. */
export class ProcessLeftRunning extends Data.TaggedError('ProcessLeftRunning')<{
  readonly names: ReadonlyArray<string>
}> {}

/** A stop the medium answered with a termination other than the shutdown its latch promises. */
export class ChildReportedOtherThanShutdown extends Data.TaggedError('ChildReportedOtherThanShutdown')<{
  readonly observed: string
}> {}

/** A brutal stop that reached the child as anything but the operating system's SIGKILL. */
export class StoppedWithAnUnexpectedSignal extends Data.TaggedError('StoppedWithAnUnexpectedSignal')<{
  readonly sent: ReadonlyArray<string>
  readonly expected: string
}> {}

/** A child the medium reported ready before it had been told to become ready. */
export class ChildWasReadyBeforeItSaidSo extends Data.TaggedError('ChildWasReadyBeforeItSaidSo')<{}> {}

/** What the scripted spawner did, readable after a run without holding the run's environment. */
export class ProcessLedger extends Context.Service<
  ProcessLedger,
  {
    readonly started: Effect.Effect<number>
    readonly running: Effect.Effect<ReadonlyArray<string>>
    readonly signalsToLast: Effect.Effect<ReadonlyArray<string>>
  }
>()('@systemfsoftware/effect-daemon-process/tests/process-medium.conformance.test/ProcessLedger') {}

/** The release probe: no incarnation the run started is still running. */
export const nothingLeftRunning: Effect.Effect<void, ProcessLeftRunning, ProcessLedger> = Effect.flatMap(
  Effect.service(ProcessLedger),
  (ledger) =>
    Effect.flatMap(
      ledger.running,
      (names) => names.length === 0 ? Effect.void : Effect.fail(new ProcessLeftRunning({ names })),
    ),
)

const rememberedSignals = (
  known: HashMap.HashMap<string, ReadonlyArray<string>>,
  name: string,
): ReadonlyArray<string> => Option.getOrElse(HashMap.get(known, name), () => [])

const signalTo = (registry: Registry, name: string, signal: string): Effect.Effect<void> =>
  Ref.update(
    registry.signals,
    (known) => HashMap.set(known, name, [...rememberedSignals(known, name), signal]),
  )

const bury = (registry: Registry, name: string): Effect.Effect<void> =>
  Ref.update(registry.live, (live) => HashMap.remove(live, name))

const die = (
  registry: Registry,
  incarnation: Incarnation,
  code: ChildProcessSpawner.ExitCode,
): Effect.Effect<void> => Effect.andThen(Deferred.succeed(incarnation.exit, code), bury(registry, incarnation.name))

const dieBySignal = (registry: Registry, incarnation: Incarnation, signal: string): Effect.Effect<void> =>
  Effect.andThen(Deferred.fail(incarnation.exit, signalErrorOf(signal)), bury(registry, incarnation.name))

/**
 * The platform's `kill`: the signal reaches the child, and a child that survives the graceful
 * signal is forced once the kill's window elapses. The wait is the kill's own, so a stop only
 * returns once the incarnation is gone.
 */
const kill = (
  registry: Registry,
  incarnation: Incarnation,
  options?: ChildProcess.KillOptions,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    const signal = options?.killSignal ?? GRACEFUL
    yield* signalTo(registry, incarnation.name, signal)
    const survivesGraceful = yield* Ref.get(incarnation.ignoresGracefulStop)
    if (signal === FORCED || !survivesGraceful) {
      return yield* dieBySignal(registry, incarnation, signal)
    }
    return yield* Option.match(Option.fromNullishOr(options?.forceKillAfter), {
      onNone: () => Effect.void,
      onSome: (window) => Effect.andThen(Effect.sleep(window), dieBySignal(registry, incarnation, FORCED)),
    })
  })

const applyStep = (
  registry: Registry,
  incarnation: Incarnation,
  tag: string,
): Effect.Effect<void> =>
  Match.value(tag).pipe(
    Match.when('BecomeReady', () => Effect.asVoid(Queue.offer(incarnation.stdout, encoder.encode(`${READY_LINE}\n`)))),
    Match.when('ExitNormal', () => die(registry, incarnation, ChildProcessSpawner.ExitCode(0))),
    Match.when('ExitAbnormal', () => dieBySignal(registry, incarnation, FORCED)),
    Match.when('IgnoreGracefulStop', () => Ref.set(incarnation.ignoresGracefulStop, true)),
    Match.when('NeverBecomeReady', () => Effect.void),
    Match.orElse((unknown: string) =>
      Effect.die(new globalThis.Error(`the scripted child was handed an unknown step: ${unknown}`))
    ),
  )

const readSteps = (
  registry: Registry,
  incarnation: Incarnation,
  steps: Stream.Stream<Uint8Array, PlatformError.PlatformError>,
): Effect.Effect<void, PlatformError.PlatformError> =>
  Stream.runForEach(steps, (chunk) => {
    const line = decoder.decode(chunk).trim()
    return line.length === 0 ? Effect.void : applyStep(registry, incarnation, line)
  })

/** The stream the command pipes into the child, when it names one. */
const pipedStream = (
  input: ChildProcess.StdinConfig,
): Option.Option<Stream.Stream<Uint8Array, PlatformError.PlatformError>> =>
  Stream.isStream(input.stream) ? Option.some(input.stream) : Option.none()

const stdinOf = (
  command: ChildProcess.StandardCommand,
): Option.Option<Stream.Stream<Uint8Array, PlatformError.PlatformError>> =>
  Option.flatMap(
    Option.fromNullishOr(command.options.stdin),
    (input) =>
      typeof input === 'string' ? Option.none() : Stream.isStream(input) ? Option.some(input) : pipedStream(input),
  )

const handleOf = (
  registry: Registry,
  incarnation: Incarnation,
  index: number,
): ChildProcessSpawner.ChildProcessHandle =>
  ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(index + 1),
    exitCode: Deferred.await(incarnation.exit),
    isRunning: Effect.map(Deferred.isDone(incarnation.exit), (exited) => !exited),
    kill: (options) => kill(registry, incarnation, options),
    stdin: Sink.drain,
    stdout: Stream.fromQueue(incarnation.stdout),
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
    unref: Effect.succeed(Effect.void),
  })

const bornOf = (
  registry: Registry,
  stdin: Option.Option<Stream.Stream<Uint8Array, PlatformError.PlatformError>>,
): Effect.Effect<{ readonly incarnation: Incarnation; readonly index: number }, never, Scope.Scope> =>
  Effect.gen(function*() {
    const index = yield* Ref.getAndUpdate(registry.sequence, (count) => count + 1)
    const incarnation: Incarnation = {
      name: `scripted-child-${index + 1}`,
      stdout: yield* Queue.unbounded<Uint8Array>(),
      exit: yield* Deferred.make<ChildProcessSpawner.ExitCode, PlatformError.PlatformError>(),
      ignoresGracefulStop: yield* Ref.make(false),
    }
    yield* Ref.update(registry.live, (live) => HashMap.set(live, incarnation.name, incarnation))
    yield* Ref.set(registry.last, Option.some(incarnation.name))
    yield* Option.match(stdin, {
      onNone: () => Effect.void,
      onSome: (steps) => Effect.asVoid(Effect.forkScoped(readSteps(registry, incarnation, steps))),
    })
    return { incarnation, index }
  })

const standardOf = (command: ChildProcess.Command): Option.Option<ChildProcess.StandardCommand> =>
  Match.value(command).pipe(
    Match.tag('StandardCommand', (standard) => Option.some(standard)),
    Match.orElse((): Option.Option<ChildProcess.StandardCommand> => Option.none()),
  )

const spawnScripted = (
  registry: Registry,
  command: ChildProcess.Command,
): Effect.Effect<ChildProcessSpawner.ChildProcessHandle, PlatformError.PlatformError, Scope.Scope> =>
  Effect.gen(function*() {
    const standard = yield* Option.match(standardOf(command), {
      onNone: () => Effect.die(new globalThis.Error('the scripted spawner only runs standard commands')),
      onSome: (found) => Effect.succeed(found),
    })
    const born = yield* Effect.acquireRelease(
      bornOf(registry, stdinOf(standard)),
      ({ incarnation }) => kill(registry, incarnation, { killSignal: FORCED }),
    )
    return handleOf(registry, born.incarnation, born.index)
  })

export const scriptedSpawner: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner | ProcessLedger> = Layer.unwrap(
  Effect.gen(function*() {
    const registry: Registry = {
      sequence: yield* Ref.make(0),
      live: yield* Ref.make(HashMap.empty<string, Incarnation>()),
      signals: yield* Ref.make(HashMap.empty<string, ReadonlyArray<string>>()),
      last: yield* Ref.make<Option.Option<string>>(Option.none()),
    }
    return Layer.mergeAll(
      Layer.succeed(
        ChildProcessSpawner.ChildProcessSpawner,
        ChildProcessSpawner.make((command) => spawnScripted(registry, command)),
      ),
      Layer.succeed(ProcessLedger, {
        started: Ref.get(registry.sequence),
        running: Effect.map(Ref.get(registry.live), (live) => Arr.fromIterable(HashMap.keys(live))),
        signalsToLast: Effect.gen(function*() {
          const last = yield* Ref.get(registry.last)
          const known = yield* Ref.get(registry.signals)
          return Option.match(last, {
            onNone: (): ReadonlyArray<string> => [],
            onSome: (name) => rememberedSignals(known, name),
          })
        }),
      }),
    )
  }),
)
