/**
 * The laws a child-process spawner — the port a process medium starts children
 * through — must keep, written once and run against both implementations: the
 * scripted spawner the conformance checks start no process with, and the real
 * operating-system spawner.
 *
 * A conformance check replaces the spawner with a fake, so the fake has to
 * behave the way the platform does for every stop the check cuts. These laws
 * are that behaviour: the readiness line and exit status the stop rules read,
 * stopping while a call is in flight, calling a child that already ended, and
 * killing one mid-call before a restart.
 */
import { Data, Deferred, Duration, Effect, Layer, Option, Result, type Scope, Stream } from 'effect'
import * as PlatformError from 'effect/PlatformError'
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process'
import { fileURLToPath } from 'node:url'

const fixturePath = fileURLToPath(new URL('./child-script.mjs', import.meta.url))

const encoder = new TextEncoder()

const READY = 'READY'

const GRACEFUL: ChildProcess.Signal = 'SIGTERM'

const FORCED: ChildProcess.Signal = 'SIGKILL'

const LIMIT = Duration.seconds(10)

/** The platform's own wording for a signal death, `Process interrupted due to receipt of signal: 'SIGKILL'`. */
const SIGNAL_IN_DETAIL = /signal: '([A-Z0-9]+)'/

/** A law the spawner did not keep, named in plain words for the failure report. */
export class LawBroken extends Data.TaggedError('LawBroken')<{
  readonly law: string
  readonly why: string
}> {}

export interface LawCase {
  readonly name: string
  readonly run: Effect.Effect<void, LawBroken, ChildProcessSpawner.ChildProcessSpawner>
}

const broken = (law: string, why: string): Effect.Effect<never, LawBroken> => Effect.fail(new LawBroken({ law, why }))

const commandOf = (steps: ReadonlyArray<string>): ChildProcess.Command =>
  ChildProcess.make(process.execPath, [fixturePath], {
    stdin: Stream.fromIterable(steps.map((step) => encoder.encode(`${step}\n`))),
    forceKillAfter: '1 second',
  })

const detailOf = (error: PlatformError.PlatformError): string =>
  error.reason.cause instanceof globalThis.Error ? error.reason.cause.message : error.message

const signalNameIn = (detail: string): string =>
  Option.getOrElse(
    Option.flatMap(
      Option.fromNullishOr(SIGNAL_IN_DETAIL.exec(detail)),
      (found) => Option.fromNullishOr(found[1]),
    ),
    () => detail,
  )

const spawnOf = (
  law: string,
  steps: ReadonlyArray<string>,
): Effect.Effect<
  ChildProcessSpawner.ChildProcessHandle,
  LawBroken,
  ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> =>
  Effect.flatMap(
    Effect.service(ChildProcessSpawner.ChildProcessSpawner),
    (spawner) =>
      Effect.flatMap(
        Effect.timeoutOption(Effect.result(spawner.spawn(commandOf(steps))), LIMIT),
        Option.match({
          onNone: () => broken(law, 'the spawner never handed back a handle within the limit'),
          onSome: (outcome) =>
            Result.match(outcome, {
              onFailure: (error) => broken(law, `spawning the child failed: ${error.message}`),
              onSuccess: (handle) => Effect.succeed(handle),
            }),
        }),
      ),
  )

/** Reads the readiness line the child announces itself with. */
const readySeen = (law: string, handle: ChildProcessSpawner.ChildProcessHandle): Effect.Effect<void, LawBroken> =>
  Effect.gen(function*() {
    const seen = yield* Deferred.make<void>()
    yield* Effect.forkChild(
      Effect.ignore(
        Stream.runForEach(
          Stream.splitLines(Stream.decodeText(handle.stdout)),
          (line) => line === READY ? Deferred.succeed(seen, void 0) : Effect.void,
        ),
      ),
    )
    const arrived = yield* Effect.timeoutOption(Deferred.await(seen), LIMIT)
    return yield* Option.isSome(arrived) ? Effect.void : broken(law, 'the child never said it was ready')
  })

/** The status the child exited with; an exit the platform could not answer is a broken law. */
const exitedWith = (
  law: string,
  handle: ChildProcessSpawner.ChildProcessHandle,
  expected: number,
): Effect.Effect<void, LawBroken> =>
  Effect.flatMap(
    Effect.timeoutOption(Effect.result(handle.exitCode), LIMIT),
    Option.match({
      onNone: () => broken(law, 'the child never settled its exit within the limit'),
      onSome: (outcome) =>
        Result.match(outcome, {
          onFailure: (error) => broken(law, `the child was ended by a signal, not a status: ${detailOf(error)}`),
          onSuccess: (code) =>
            Number(code) === expected
              ? Effect.void
              : broken(law, `the child exited with status ${code}, expected ${expected}`),
        }),
    }),
  )

/** The exit the platform reports as a death by the expected signal. */
const endedBy = (
  law: string,
  handle: ChildProcessSpawner.ChildProcessHandle,
  signal: string,
): Effect.Effect<void, LawBroken> =>
  Effect.flatMap(
    Effect.timeoutOption(Effect.result(handle.exitCode), LIMIT),
    Option.match({
      onNone: () => broken(law, 'the child never settled its exit within the limit'),
      onSome: (outcome) =>
        Result.match(outcome, {
          onFailure: (error) =>
            error.pipe(
              detailOf,
              signalNameIn,
              (named) => named === signal ? Effect.void : broken(law, `the child was ended by ${named}, not ${signal}`),
            ),
          onSuccess: (code) => broken(law, `the child exited with status ${code}, not ${signal}`),
        }),
    }),
  )

const killSettles = (
  law: string,
  handle: ChildProcessSpawner.ChildProcessHandle,
  signal: ChildProcess.Signal,
): Effect.Effect<void, LawBroken> =>
  Effect.flatMap(
    Effect.timeoutOption(Effect.exit(handle.kill({ killSignal: signal })), LIMIT),
    Option.match({
      onNone: () => broken(law, `the ${signal} kill never settled within the limit`),
      onSome: () => Effect.void,
    }),
  )

const notRunning = (law: string, handle: ChildProcessSpawner.ChildProcessHandle): Effect.Effect<void, LawBroken> =>
  Effect.flatMap(
    Effect.timeoutOption(Effect.result(handle.isRunning), LIMIT),
    Option.match({
      onNone: () => broken(law, 'the child never answered whether it was running'),
      onSome: (outcome) =>
        Result.match(outcome, {
          onFailure: (error) =>
            broken(law, `the platform could not say whether the child was running: ${detailOf(error)}`),
          onSuccess: (running) => running ? broken(law, 'the child was still reported running') : Effect.void,
        }),
    }),
  )

const ordinaryAnswer: LawCase = {
  name: 'the child announces itself and its exit status is reported as observed',
  run: Effect.scoped(Effect.gen(function*() {
    const law = ordinaryAnswer.name
    const handle = yield* spawnOf(law, ['BecomeReady', 'ExitNormal'])
    yield* readySeen(law, handle)
    yield* exitedWith(law, handle, 0)
  })),
}

const stoppingDuringACall: LawCase = {
  name: 'a graceful signal reaches a child that is still running',
  run: Effect.scoped(Effect.gen(function*() {
    const law = stoppingDuringACall.name
    const handle = yield* spawnOf(law, ['BecomeReady'])
    yield* readySeen(law, handle)
    yield* killSettles(law, handle, GRACEFUL)
    yield* notRunning(law, handle)
    yield* endedBy(law, handle, GRACEFUL)
  })),
}

const callingAfterStop: LawCase = {
  name: 'a child that already ended is not reported running and a further stop settles',
  run: Effect.scoped(Effect.gen(function*() {
    const law = callingAfterStop.name
    const handle = yield* spawnOf(law, ['BecomeReady', 'ExitNormal'])
    yield* readySeen(law, handle)
    yield* exitedWith(law, handle, 0)
    yield* notRunning(law, handle)
    yield* killSettles(law, handle, GRACEFUL)
    yield* notRunning(law, handle)
  })),
}

const killingMidCall: LawCase = {
  name: 'a forced signal ends the running child, and a fresh child starts and answers',
  run: Effect.scoped(Effect.gen(function*() {
    const law = killingMidCall.name
    const first = yield* spawnOf(law, ['BecomeReady'])
    yield* readySeen(law, first)
    yield* killSettles(law, first, FORCED)
    yield* notRunning(law, first)
    yield* endedBy(law, first, FORCED)
    const second = yield* spawnOf(law, ['BecomeReady', 'ExitNormal'])
    yield* readySeen(law, second)
    yield* exitedWith(law, second, 0)
  })),
}

export const spawnerLaws: ReadonlyArray<LawCase> = [
  ordinaryAnswer,
  stoppingDuringACall,
  callingAfterStop,
  killingMidCall,
]

/**
 * Runs every law on a fresh build of the spawner, so no law sees another's
 * children, and names each one's verdict in that law's own words.
 */
export const runSpawnerLaws = (
  layer: Layer.Layer<ChildProcessSpawner.ChildProcessSpawner>,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.forEach(
    spawnerLaws,
    (law) =>
      Effect.map(Effect.result(Effect.provide(law.run, layer)), (outcome) =>
        Result.match(outcome, {
          onFailure: (failure) => `${law.name}: broken — ${failure.why}`,
          onSuccess: () => `${law.name}: holds`,
        })),
  )
