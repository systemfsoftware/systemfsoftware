import * as NodeSocket from '@effect/platform-node/NodeSocket'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Readiness as ReadinessModule } from '@systemfsoftware/effect-readiness'
import { Array as Arr, Duration, Effect, Exit, Fiber, Layer, Match, Option, Queue, Ref, Scope, Stream } from 'effect'
import type { Socket } from 'effect/unstable/socket'
import type { SocketAddress, SocketFrames, SocketProgram } from './socket-program.js'
import { shutdownTerminationOf, terminationOf } from './socket-termination.js'
import { textOf } from './socket-text.js'

export type { SocketAddress, SocketConnection, SocketProgram } from './socket-program.js'

/** How long a ready service has to announce itself before its readiness wait gives up. */
const READY_DEFAULT_TIMEOUT_MILLIS = 30_000

/**
 * The tight default is deliberate: a readiness wait is raced against the child's
 * start deadline (R10), which a supervisor may declare in the low hundreds of
 * milliseconds.
 */
const READY_DEFAULT_POLL_MILLIS = 25

export interface SocketMediumOptions {
  readonly readyTimeoutMillis?: number
  readonly readyPollMillis?: number
}

export const declaration: Supervisor.Medium.MediumDeclaration = { reporting: 'exit', groupStop: 'atomic' }

export const port = Supervisor.Medium.MediumPort<SocketProgram, never, Scope.Scope>('SocketMedium')

const SocketStartedTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-socket/SocketStarted')
type SocketStartedTypeId = typeof SocketStartedTypeId

interface SocketStarted extends Supervisor.Medium.Started {
  readonly [SocketStartedTypeId]: SocketStartedTypeId
  readonly life: Fiber.Fiber<void, Socket.SocketError>
  readonly scope: Scope.Scope
  readonly writeHalf: Scope.Scope
  readonly stopping: Ref.Ref<boolean>
}

interface LifeParts {
  readonly socket: Socket.Socket
  readonly writer: Socket.Writer
  readonly program: SocketProgram
  readonly log: Ref.Ref<ReadonlyArray<string>>
  readonly frames: Queue.Queue<SocketFrames, Socket.SocketError>
}

const socketOf = (evidence: Supervisor.Medium.Started): Option.Option<SocketStarted> =>
  Option.liftPredicate(evidence, (candidate): candidate is SocketStarted => SocketStartedTypeId in candidate)

const drainOf = (parts: LifeParts, reader: Socket.Reader): Effect.Effect<void, Socket.SocketError> =>
  Effect.flatMap(reader.pull, (batch) =>
    Effect.andThen(
      Effect.andThen(
        Ref.update(parts.log, (entries) => Arr.appendAll(entries, Arr.map(batch, textOf))),
        Effect.asVoid(Queue.offer(parts.frames, batch)),
      ),
      drainOf(parts, reader),
    ))

const lifeOf = (parts: LifeParts): Effect.Effect<void, Socket.SocketError, Scope.Scope> =>
  Effect.gen(function*() {
    const reader = yield* parts.socket.reader
    yield* Option.match(Option.fromNullishOr(parts.program.run), {
      onNone: () => Effect.void,
      onSome: (run) =>
        Effect.forkScoped(
          run({ frames: Stream.fromQueue(parts.frames), send: (frame) => parts.writer.write(frame) }),
        ),
    })
    yield* drainOf(parts, reader)
  })

const socketStarted = (parts: {
  readonly life: Fiber.Fiber<void, Socket.SocketError>
  readonly scope: Scope.Scope
  readonly writeHalf: Scope.Scope
  readonly stopping: Ref.Ref<boolean>
  readonly ready: Effect.Effect<void>
}): SocketStarted => ({
  [SocketStartedTypeId]: SocketStartedTypeId,
  [Supervisor.Medium.StartedTypeId]: Supervisor.Medium.StartedTypeId,
  ...parts,
})

const readinessVerdictOf = (verdict: Readiness.Satisfied | Readiness.TimedOut): Effect.Effect<void> =>
  Match.value(verdict).pipe(
    Match.tag('Satisfied', () => Effect.void),
    Match.tag('TimedOut', () => Effect.never),
    Match.exhaustive,
  )

const targetOf = (address: SocketAddress, options: SocketMediumOptions): Readiness.ProbeTargetBlueprint =>
  ReadinessModule.target([{ guest: address.port, host: address.host, hostPort: address.port }], {
    timeoutMs: Option.getOrElse(
      Option.fromNullishOr(options.readyTimeoutMillis),
      () => READY_DEFAULT_TIMEOUT_MILLIS,
    ),
    pollMs: Option.getOrElse(Option.fromNullishOr(options.readyPollMillis), () => READY_DEFAULT_POLL_MILLIS),
  })

const readyOf = (parts: {
  readonly program: SocketProgram
  readonly options: SocketMediumOptions
  readonly prober: Readiness.HostProber['Service']
  readonly log: Ref.Ref<ReadonlyArray<string>>
}): Effect.Effect<void> =>
  targetOf(parts.program.address, parts.options).awaitCondition(parts.program.ready).pipe(
    Effect.provideService(ReadinessModule.HostProber, parts.prober),
    Effect.provideService(ReadinessModule.LogSource, { entries: Ref.get(parts.log) }),
    Effect.matchEffect({ onFailure: () => Effect.never, onSuccess: readinessVerdictOf }),
  )

const startOf = (parts: {
  readonly program: SocketProgram
  readonly options: SocketMediumOptions
  readonly prober: Readiness.HostProber['Service']
}): Effect.Effect<Supervisor.Medium.Started, never, Scope.Scope> =>
  Effect.gen(function*() {
    const scope = yield* Effect.scope
    const writeHalf = yield* Scope.fork(scope)
    const log = yield* Ref.make<ReadonlyArray<string>>(Arr.empty())
    const stopping = yield* Ref.make(false)
    const frames = yield* Queue.unbounded<SocketFrames, Socket.SocketError>()
    const socket = yield* NodeSocket.makeNet({
      host: parts.program.address.host,
      port: parts.program.address.port,
    })
    const writer = yield* Scope.provide(socket.writer, writeHalf)
    const life = yield* Effect.forkIn(
      Effect.onError(
        lifeOf({ socket, writer, program: parts.program, log, frames }),
        (cause) => Effect.asVoid(Queue.failCause(frames, cause)),
      ),
      scope,
    )
    return socketStarted({
      life,
      scope,
      writeHalf,
      stopping,
      ready: readyOf({ program: parts.program, options: parts.options, prober: parts.prober, log }),
    })
  })

const reportOf = (
  evidence: Supervisor.Medium.Started,
): Effect.Effect<Supervisor.Medium.TerminationReason, never, never> =>
  Option.match(socketOf(evidence), {
    onNone: () => Effect.succeed(shutdownTerminationOf()),
    onSome: (self) =>
      Effect.map(
        Effect.zip(Fiber.await(self.life), Ref.get(self.stopping)),
        ([exit, stopping]) => terminationOf({ stopping, exit }),
      ),
  })

const probeOf = (evidence: Supervisor.Medium.Started): Effect.Effect<boolean, never, never> =>
  Option.match(socketOf(evidence), {
    onNone: () => Effect.succeed(false),
    onSome: (self) => Effect.sync(() => self.life.pollUnsafe() === undefined),
  })

const destroyOf = (self: SocketStarted): Effect.Effect<void> =>
  Effect.andThen(Fiber.interrupt(self.life), Scope.close(self.scope, Exit.void))

const settledAfterHalfClose = (self: SocketStarted): Effect.Effect<void> =>
  Effect.andThen(Scope.close(self.writeHalf, Exit.void), Effect.asVoid(Fiber.await(self.life)))

const shutdownActionOf = (self: SocketStarted, mode: Supervisor.Medium.ShutdownMode): Effect.Effect<void> =>
  Match.value(mode).pipe(
    Match.tag('Brutal', () => destroyOf(self)),
    Match.tag(
      'Graceful',
      (graceful) =>
        Effect.andThen(
          Effect.timeoutOption(settledAfterHalfClose(self), Duration.millis(graceful.millis)),
          destroyOf(self),
        ),
    ),
    Match.tag('Infinity', () => Effect.andThen(settledAfterHalfClose(self), Scope.close(self.scope, Exit.void))),
    Match.exhaustive,
  )

const stopOf = (
  evidence: Supervisor.Medium.Started,
  mode: Supervisor.Medium.ShutdownMode,
): Effect.Effect<Supervisor.Medium.Stopped, never, never> =>
  Option.match(socketOf(evidence), {
    onNone: () => Effect.succeed(Supervisor.Medium.stopped),
    onSome: (self) =>
      Effect.as(
        Effect.andThen(Ref.set(self.stopping, true), shutdownActionOf(self, mode)),
        Supervisor.Medium.stopped,
      ),
  })

const mediumOf = (parts: {
  readonly prober: Readiness.HostProber['Service']
  readonly options: SocketMediumOptions
}): Supervisor.Medium.Medium<SocketProgram, never, Scope.Scope> =>
  Supervisor.Medium.make({
    declaration,
    start: (program) => startOf({ program, options: parts.options, prober: parts.prober }),
    report: reportOf,
    probe: probeOf,
    stop: stopOf,
  })

/**
 * Binds the socket port, satisfying the readiness prober here so a composition
 * root provides `@systemfsoftware/effect-readiness`'s Node driver once, at the
 * layer, rather than threading it through every child.
 */
export const layer = (
  options: SocketMediumOptions = {},
): Layer.Layer<Supervisor.Medium.MediumPortShape<SocketProgram, never, Scope.Scope>, never, Readiness.HostProber> =>
  Layer.effect(port, Effect.map(ReadinessModule.HostProber, (prober) => ({ medium: mediumOf({ prober, options }) })))
