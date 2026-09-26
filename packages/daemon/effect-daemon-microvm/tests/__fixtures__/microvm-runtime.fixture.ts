import { MicroVMMedium } from '@systemfsoftware/effect-daemon-microvm'
import { MicroVM } from '@systemfsoftware/effect-microsandbox'
import { Context, Effect, Layer, Match, Option } from 'effect'
import type { ExecEvent, ExecHandle, ExecSink, ResolvedRuntime, Sandbox } from 'microsandbox'
import { ABNORMAL_EXIT_CODE, READY_TOKEN } from './child-script.js'
import type { SandboxRuntimeUnderTest } from './sandbox-runtime-laws.fixture.js'

export type SandboxBehaviour = 'waits-for-steps' | 'ends-after-started'

const encoder = new TextEncoder()

const decoder = new TextDecoder()

const FIRST_PORT = 41_000

const KILL_TIMEOUT_MILLIS = 5_000

const stubRuntime: ResolvedRuntime = {
  msbPath: '/stub/msb',
  libkrunfwPath: '/stub/libkrunfw',
  origin: 'configuration',
}

const eventFor = (line: string): Option.Option<ExecEvent> =>
  Match.value(line).pipe(
    Match.when(
      MicroVMMedium.ChildStepLines.BecomeReady,
      () => Option.some<ExecEvent>({ kind: 'stdout', data: encoder.encode(`${READY_TOKEN}\n`) }),
    ),
    Match.when(MicroVMMedium.ChildStepLines.ExitNormal, () => Option.some<ExecEvent>({ kind: 'exited', code: 0 })),
    Match.when(MicroVMMedium.ChildStepLines.ExitAbnormal, () =>
      Option.some<ExecEvent>({ kind: 'exited', code: ABNORMAL_EXIT_CODE })),
    Match.orElse(() =>
      Option.none<ExecEvent>()
    ),
  )

const textOf = (data: Uint8Array | string): string => typeof data === 'string' ? data : decoder.decode(data)

interface ScriptedSession {
  readonly handle: ExecHandle
  readonly deliver: (event: ExecEvent) => void
}

const scriptedSession = (behaviour: SandboxBehaviour): ScriptedSession => {
  const pending: Array<ExecEvent> = [{ kind: 'started', pid: 1 }]
  const waiters: Array<(event: ExecEvent | null) => void> = []
  const deliver = (event: ExecEvent): void => {
    const next = waiters.shift()
    if (next === undefined) pending.push(event)
    else next(event)
  }
  const recv = (): Promise<ExecEvent | null> => {
    const queued = pending.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    if (behaviour === 'ends-after-started') return Promise.resolve(null)
    const parked = Promise.withResolvers<ExecEvent | null>()
    waiters.push(parked.resolve)
    return parked.promise
  }
  const sink: ExecSink = {
    write: (data: Uint8Array | string): Promise<void> => {
      Option.match(eventFor(textOf(data).trim()), {
        onNone: () => undefined,
        onSome: (event) => deliver(event),
      })
      return Promise.resolve()
    },
    close: () => Promise.resolve(),
    [Symbol.asyncDispose]: () => Promise.resolve(),
  } as object as ExecSink
  const handle: ExecHandle = {
    recv,
    takeStdin: () => Promise.resolve(sink),
    wait: () => Promise.resolve({ code: 0 }),
    [Symbol.asyncDispose]: () => Promise.resolve(),
  } as object as ExecHandle
  return { handle, deliver }
}

interface ExecBuilder {
  args(args: ReadonlyArray<string>): ExecBuilder
  stdinPipe(): ExecBuilder
}

const fakeSandbox = (name: string, behaviour: SandboxBehaviour, onDestroyed: (name: string) => void): Sandbox => {
  const destroyed = (): void => {
    onDestroyed(name)
  }
  const builder: ExecBuilder = {
    args: () => builder,
    stdinPipe: () => builder,
  }
  return {
    name,
    execStreamWith: (_cmd: string, configure: (builder: ExecBuilder) => ExecBuilder): Promise<ExecHandle> => {
      const session = scriptedSession(behaviour)
      configure(builder)
      return Promise.resolve(session.handle)
    },
    ping: () => Promise.resolve({}),
    stop: () => {
      destroyed()
      return Promise.resolve()
    },
    stopWithTimeout: () => {
      destroyed()
      return Promise.resolve()
    },
    killWithTimeout: () => {
      destroyed()
      return Promise.resolve()
    },
    destroy: () => {
      destroyed()
      return Promise.resolve()
    },
    [Symbol.asyncDispose]: () => Promise.resolve(),
  } as object as Sandbox
}

interface SandboxRecord {
  readonly created: Set<string>
  readonly destroyed: Set<string>
}

interface RuntimeState {
  readonly record: SandboxRecord
  readonly stops: Array<number>
}

const runtimeState = (): RuntimeState => ({
  record: { created: new Set<string>(), destroyed: new Set<string>() },
  stops: [],
})

const sandboxRuntimeShapeOf = (state: RuntimeState, behaviour: SandboxBehaviour): MicroVM.SandboxRuntimeShape => ({
  acquire: (plan) =>
    Effect.sync(() => {
      state.record.created.add(plan.name)
      return fakeSandbox(plan.name, behaviour, (name) => state.record.destroyed.add(name))
    }),
  release: (sandbox) =>
    Effect.sync(() => {
      state.record.destroyed.add(sandbox.name)
    }),
})

/**
 * The fake sandbox runtime, wearing the same adapter the real microsandbox runtime does, so
 * the shared law suite in `sandbox-runtime-laws.fixture.ts` judges both.
 */
export const microvmRuntimeUnderTest = (behaviour: SandboxBehaviour): SandboxRuntimeUnderTest => {
  const state = runtimeState()
  const shape = sandboxRuntimeShapeOf(state, behaviour)
  return {
    acquire: (plan) => shape.acquire(plan),
    release: (sandbox) => shape.release(sandbox),
    kill: (sandbox) => Effect.promise(() => sandbox.killWithTimeout(KILL_TIMEOUT_MILLIS)),
    heldByOutside: (sandbox) => Effect.sync(() => !state.record.destroyed.has(sandbox.name)),
  }
}

export class SandboxLedger extends Context.Service<
  SandboxLedger,
  {
    readonly started: Effect.Effect<number>
    readonly outstanding: Effect.Effect<ReadonlyArray<string>>
    readonly stops: Effect.Effect<ReadonlyArray<number>>
    readonly recordStop: (outstanding: number) => Effect.Effect<void>
    /** What the runtime shows once the process that booted its machines is gone. */
    readonly restarted: Effect.Effect<void>
  }
>()('@systemfsoftware/effect-daemon-microvm/tests/microvm-medium.conformance.test/SandboxLedger') {}

const outstandingIn = (record: SandboxRecord): ReadonlyArray<string> =>
  [...record.created].filter((name) => !record.destroyed.has(name))

export const microvmSandboxRuntime = (behaviour: SandboxBehaviour): Layer.Layer<SandboxLedger> => {
  const state = runtimeState()
  const portAllocator: MicroVM.PortAllocatorShape = {
    reserve: (guest) =>
      Effect.acquireRelease(
        Effect.succeed({ guest, host: '127.0.0.1', hostPort: FIRST_PORT + guest }),
        () => Effect.void,
      ),
  }
  return Layer.mergeAll(
    Layer.succeed(MicroVM.RuntimeResolver, { resolve: () => Effect.succeed(stubRuntime) }),
    Layer.succeed(MicroVM.PortAllocator, portAllocator),
    Layer.succeed(MicroVM.SandboxRuntime, sandboxRuntimeShapeOf(state, behaviour)),
    Layer.succeed(SandboxLedger, {
      started: Effect.sync(() => state.record.created.size),
      outstanding: Effect.sync(() => outstandingIn(state.record)),
      stops: Effect.sync(() => [...state.stops]),
      recordStop: (outstanding) =>
        Effect.sync(() => {
          state.stops.push(outstanding)
        }),
      restarted: Effect.sync(() => {
        for (const name of state.record.created) {
          state.record.destroyed.add(name)
        }
      }),
    }),
  )
}
