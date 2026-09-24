import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import type { Readiness } from '@systemfsoftware/effect-readiness'
import { Deferred, Effect, Exit, Layer, Match, Option, Ref, Scope, Stream } from 'effect'
import type * as Crypto from 'effect/Crypto'
import type * as FileSystem from 'effect/FileSystem'
import type { ExecEvent, ExecHandle, ExecSink } from 'microsandbox'
import type { MicroVMProgram } from './MicroVMProgram.js'
import type { MicroVMWorkload, WorkloadCommand } from './MicroVMProgram.schema.js'

const KILL_TIMEOUT_MILLIS = 5_000

const UNOBSERVED_EXIT_CODE = -1

const UNREPORTED_SIGNAL = 'unreported'

export const declaration: Supervisor.Medium.MediumDeclaration = { reporting: 'exit', groupStop: 'atomic' }

export interface MicroVMMediumOptions {
  readonly memoryMb?: number
}

type Requirements = Scope.Scope | Crypto.Crypto | FileSystem.FileSystem | Readiness.HostProber

type PortShape = Supervisor.Medium.MediumPortShape<MicroVMProgram, MicroVM.MicroVMError, Requirements>

export const port = Supervisor.Medium.MediumPort<MicroVMProgram, MicroVM.MicroVMError, Requirements>('MicroVMMedium')

const WorkloadTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-microvm/WorkloadStarted')
type WorkloadTypeId = typeof WorkloadTypeId

interface WorkloadStarted extends Supervisor.Medium.Started {
  readonly [WorkloadTypeId]: WorkloadTypeId
  readonly sandbox: MicroVM.RunningVM
  readonly childScope: Scope.Scope
  readonly exited: Deferred.Deferred<number>
}

const isWorkloadStarted = (evidence: Supervisor.Medium.Started): evidence is WorkloadStarted =>
  WorkloadTypeId in evidence

const workloadStartedOf = (evidence: Supervisor.Medium.Started): Option.Option<WorkloadStarted> =>
  Option.filter(Option.some(evidence), isWorkloadStarted)

const resourceOf = (workload: MicroVMWorkload, options: MicroVMMediumOptions) =>
  Option.match(Option.fromNullishOr(options.memoryMb), {
    onNone: () => MicroVM.make(workload.image),
    onSome: (memoryMb) => MicroVM.make(workload.image).withMemoryLimit(memoryMb),
  })

const sessionOf = (sandbox: MicroVM.RunningVM, command: WorkloadCommand) => {
  const [program, ...args] = command
  return Effect.acquireRelease(
    MicroVM.use(sandbox, (native) => native.execStreamWith(program, (builder) => builder.args(args).stdinPipe())),
    (session) => Effect.catchDefect(Effect.promise(() => session[Symbol.asyncDispose]()), () => Effect.void),
  )
}

const killed = MicroVM.use((native) => native.killWithTimeout(KILL_TIMEOUT_MILLIS))

const destroyed = MicroVM.use((native) => native.destroy({ force: true }))

const stopped = MicroVM.use((native) => native.stop())

const stoppedWithin = (millis: number) => MicroVM.use((native) => native.stopWithTimeout(millis))

const bestEffortOf = <E>(effect: Effect.Effect<void, E>): Effect.Effect<void> =>
  Effect.ignore(Effect.catchDefect(effect, () => Effect.void))

const reclaimOf = (sandbox: MicroVM.RunningVM): Effect.Effect<void> => bestEffortOf(sandbox.pipe(destroyed))

const teardownOf = (mode: Supervisor.Medium.ShutdownMode) => (sandbox: MicroVM.RunningVM): Effect.Effect<void> =>
  Match.value(mode).pipe(
    Match.tag('Brutal', () => bestEffortOf(sandbox.pipe(killed))),
    Match.tag('Graceful', (graceful) =>
      bestEffortOf(
        sandbox.pipe(stoppedWithin(graceful.millis), Effect.catchDefect(() => bestEffortOf(sandbox.pipe(killed)))),
      )),
    Match.tag('Infinity', () => bestEffortOf(sandbox.pipe(stopped))),
    Match.exhaustive,
  )

const WORKLOAD_OUTPUT = new TextDecoder()

const writeChunkOf = (stdin: ExecSink, chunk: Uint8Array): Effect.Effect<boolean> =>
  Effect.match(Effect.tryPromise({ try: () => stdin.write(chunk), catch: () => undefined }), {
    onFailure: () => false,
    onSuccess: () => true,
  })

const feedStdin = (stdin: ExecSink, bytes: Stream.Stream<Uint8Array>): Effect.Effect<void> =>
  Stream.runForEach(
    bytes,
    (chunk) => Effect.flatMap(writeChunkOf(stdin, chunk), (open) => open ? Effect.void : Effect.interrupt),
  )

const stdinOf = (session: ExecHandle): Effect.Effect<ExecSink> =>
  Effect.flatMap(Effect.promise(() => session.takeStdin()), (stdin) =>
    Option.match(Option.fromNullishOr(stdin), {
      onNone: () => Effect.die(new Error('the microsandbox exec session carried no stdin pipe')),
      onSome: (present) => Effect.succeed(present),
    }))

const pumpStdin = (session: ExecHandle, bytes: Stream.Stream<Uint8Array>): Effect.Effect<void> =>
  Effect.flatMap(stdinOf(session), (stdin) => feedStdin(stdin, bytes))

const tailAfterOf = (soFar: string, chunk: string, token: string): string => {
  const joined = `${soFar}${chunk}`
  const extra = joined.length - token.length
  return extra > 0 ? joined.slice(extra) : joined
}

const noteOutput = (
  ready: Deferred.Deferred<void>,
  tail: Ref.Ref<string>,
  token: string,
  chunk: string,
): Effect.Effect<void> =>
  Effect.flatMap(
    Ref.updateAndGet(tail, (soFar) => tailAfterOf(soFar, chunk, token)),
    (seen) => seen.includes(token) ? Effect.asVoid(Deferred.succeed(ready, void 0)) : Effect.void,
  )

const exitCodeOf = (session: ExecHandle): Effect.Effect<number> =>
  Effect.match(Effect.tryPromise({ try: () => session.wait(), catch: () => UNOBSERVED_EXIT_CODE }), {
    onFailure: (unobserved) => unobserved,
    onSuccess: (status) => status.code,
  })

function readSession(
  session: ExecHandle,
  sandbox: MicroVM.RunningVM,
  readyToken: Option.Option<string>,
  ready: Deferred.Deferred<void>,
  exited: Deferred.Deferred<number>,
  tail: Ref.Ref<string>,
): Effect.Effect<void> {
  const next = () => readSession(session, sandbox, readyToken, ready, exited, tail)
  const reclaim = sandbox.pipe(reclaimOf)
  const step = (event: ExecEvent): Effect.Effect<void> =>
    Match.value(event).pipe(
      Match.discriminator('kind')('started', () => next()),
      Match.discriminator('kind')('stderr', () => next()),
      Match.discriminator('kind')('stdout', (output) =>
        Option.match(readyToken, {
          onNone: () => next(),
          onSome: (token) =>
            Effect.andThen(noteOutput(ready, tail, token, WORKLOAD_OUTPUT.decode(output.data)), next()),
        })),
      Match.discriminator('kind')(
        'exited',
        (done) => Effect.andThen(Effect.asVoid(Deferred.succeed(exited, done.code)), reclaim),
      ),
      Match.exhaustive,
    )
  const settled = Effect.andThen(
    Effect.flatMap(exitCodeOf(session), (code) => Deferred.succeed(exited, code)),
    reclaim,
  )
  return Effect.suspend(() =>
    Effect.flatMap(Effect.promise(() => session.recv()), (event) =>
      Option.match(Option.fromNullishOr(event), {
        onNone: () => Effect.asVoid(settled),
        onSome: (present) => step(present),
      }))
  )
}

const startedOf = (
  sandbox: MicroVM.RunningVM,
  childScope: Scope.Scope,
  ready: Deferred.Deferred<void>,
  exited: Deferred.Deferred<number>,
): WorkloadStarted => ({
  ...Supervisor.Medium.started(Deferred.await(ready)),
  [WorkloadTypeId]: WorkloadTypeId,
  sandbox,
  childScope,
  exited,
})

const startOf =
  (options: MicroVMMediumOptions) =>
  (program: MicroVMProgram): Effect.Effect<Supervisor.Medium.Started, MicroVM.MicroVMError, Requirements> =>
    Effect.gen(function*() {
      const childScope = yield* Effect.scope
      const sandbox = yield* resourceOf(program.workload, options).scoped
      const session = yield* sessionOf(sandbox, program.workload.command)
      const readyToken = Option.fromNullishOr(program.workload.readyOnStdout)
      const ready = yield* Deferred.make<void>()
      const exited = yield* Deferred.make<number>()
      const tail = yield* Ref.make('')
      yield* Option.isNone(readyToken) ? Deferred.succeed(ready, void 0) : Effect.void
      yield* Effect.forkIn(readSession(session, sandbox, readyToken, ready, exited, tail), childScope)
      yield* Option.match(Option.fromNullishOr(program.stdin), {
        onNone: () => Effect.void,
        onSome: (bytes) => Effect.asVoid(Effect.forkIn(pumpStdin(session, bytes), childScope)),
      })
      return startedOf(sandbox, childScope, ready, exited)
    })

const terminationOf = (code: number): Supervisor.Medium.TerminationReason =>
  code === 0
    ? Supervisor.Medium.NormalTermination.make({})
    : Supervisor.Medium.AbnormalTermination.make({
      report: Supervisor.Medium.ExitReport.make({ code, signal: UNREPORTED_SIGNAL }),
    })

const mediumFor = (
  options: MicroVMMediumOptions,
): Supervisor.Medium.Medium<MicroVMProgram, MicroVM.MicroVMError, Requirements> =>
  Supervisor.Medium.make({
    declaration,
    start: startOf(options),
    report: (evidence) =>
      Option.match(workloadStartedOf(evidence), {
        onNone: () => Effect.succeed(Supervisor.Medium.ShutdownTermination.make({})),
        onSome: (self) => Effect.map(Deferred.await(self.exited), terminationOf),
      }),
    probe: (evidence) =>
      Option.match(workloadStartedOf(evidence), {
        onNone: () => Effect.succeed(false),
        onSome: (self) => MicroVM.ping(self.sandbox),
      }),
    stop: (evidence, mode) =>
      Option.match(workloadStartedOf(evidence), {
        onNone: () => Effect.succeed(Supervisor.Medium.stopped),
        onSome: (self) =>
          Effect.as(
            Effect.andThen(
              self.sandbox.pipe(teardownOf(mode)),
              Scope.close(self.childScope, Exit.void),
            ),
            Supervisor.Medium.stopped,
          ),
      }),
  })

export const layer = (options: MicroVMMediumOptions = {}): Layer.Layer<PortShape> =>
  Layer.succeed(port, { medium: mediumFor(options) })
