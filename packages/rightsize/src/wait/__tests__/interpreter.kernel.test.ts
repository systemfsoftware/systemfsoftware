/**
 * Wait-interpreter tests (R11) — the poll loop over a recording
 * `SandboxRuntime` double: scripted probe results and per-call log/inspect/
 * exec scripts, driven by the TestClock so interval, deadline and
 * interruptibility are asserted deterministically (no sockets, no real
 * containers — U7's parity lane owns those).
 *
 * Round accounting: the interpreter probes once immediately (the do-while
 * one-shot), then once per poll interval. In these tests the loop is forked
 * and the clock advanced one interval per yield, so probe round N consumes
 * (N - 1) advances after the initial round — exact call-count assertions
 * rely on that.
 */
import { describe, expect, it } from '@effect/vitest'
import { Cause, Duration as D, Effect, Exit, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import type { RuntimeCapabilities } from '../../model/capabilities.schema.js'
import type { ContainerSpec, ExecRequest, ExecResult } from '../../model/container-spec.schema.js'
import { BackendError, ContainerLaunchError, UnsupportedByBackendError } from '../../model/errors.js'
import { newContainerSpec } from '../../model/spec-combinators.js'
import type { ContainerInspect, SandboxHandle, SandboxRuntimeService } from '../../runtime/runtime.js'
import { SandboxRuntime } from '../../runtime/runtime.js'
import type { HttpProbe, HttpProbeRequest, HttpProbeResponse, PortProbe } from '../interpreter.js'
import { waitForReady } from '../interpreter.js'
import { bodyContains, bodyMatches, forHealthCheck, forHttp, forLogMessage, forPort, forShell } from '../strategies.js'
import { InvalidWaitStrategyError } from '../verdict.kernel.js'

// =============================================================================
// Fixtures — recording runtime double + scripted probes
// =============================================================================

const dockerCapabilities: RuntimeCapabilities = {
  hardwareIsolated: false,
  checkpoint: false,
  checkpointRestartsWorkload: false,
  supportsNativeNetworks: true,
  healthInspection: true,
}

/** A scripted value, or a sentinel that makes the runtime method fail with `BackendError`. */
type Scripted<T> = T | { readonly failWith: string }

const asScripted = <T>(value: Scripted<T>): Error | T => {
  if (value !== null && typeof value === 'object' && 'failWith' in value) {
    return new Error(value.failWith)
  }
  return value
}

/**
 * The recording runtime: every method appends its name to `calls`, and
 * scripted queues feed per-call results (`failWith` turns the call into a
 * back-end error). Queues fall back to a benign default when drained.
 */
const makeRuntime = (options: {
  readonly logs?: ReadonlyArray<Scripted<string>>
  readonly inspects?: ReadonlyArray<Scripted<ContainerInspect>>
  readonly execs?: ReadonlyArray<Scripted<ExecResult>>
  readonly capabilities?: RuntimeCapabilities
} = {}) => {
  const calls: string[] = []
  const logsQueue = [...(options.logs ?? [])]
  const inspectsQueue = [...(options.inspects ?? [])]
  const execsQueue = [...(options.execs ?? [])]
  const nextOr = <T>(queue: Array<Scripted<T>>, fallback: T): T | Error => asScripted(queue.shift() ?? fallback)
  const runtime: SandboxRuntimeService = {
    name: 'docker',
    capabilities: options.capabilities ?? dockerCapabilities,
    create: (spec) => {
      calls.push('create')
      return Effect.succeed({ id: 'cid-test', spec })
    },
    start: () => {
      calls.push('start')
      return Effect.void
    },
    stop: () => {
      calls.push('stop')
      return Effect.void
    },
    remove: () => {
      calls.push('remove')
      return Effect.void
    },
    exec: (_handle: SandboxHandle, _request: ExecRequest) => {
      calls.push('exec')
      const scripted = nextOr(execsQueue, { exitCode: 0, stdout: '', stderr: '' })
      if (scripted instanceof Error) {
        return Effect.fail(BackendError.make({ message: scripted.message }))
      }
      return Effect.succeed(scripted)
    },
    logs: (_handle: SandboxHandle) => {
      calls.push('logs')
      const scripted = nextOr(logsQueue, '')
      if (scripted instanceof Error) {
        return Effect.fail(BackendError.make({ message: scripted.message }))
      }
      return Effect.succeed(scripted)
    },
    followLogs: (_handle: SandboxHandle, _consumer: (line: string) => void) => {
      calls.push('followLogs')
      return Effect.succeed({ close: Effect.void })
    },
    copyToContainer: () => {
      calls.push('copyToContainer')
      return Effect.void
    },
    copyFromContainer: () => {
      calls.push('copyFromContainer')
      return Effect.void
    },
    inspect: (_handle: SandboxHandle) => {
      calls.push('inspect')
      const scripted = nextOr(inspectsQueue, { exists: true, running: true, health: undefined })
      if (scripted instanceof Error) {
        return Effect.fail(BackendError.make({ message: scripted.message }))
      }
      return Effect.succeed(scripted)
    },
    removeByName: () => {
      calls.push('removeByName')
      return Effect.void
    },
    findRunning: (_spec: ContainerSpec) => {
      calls.push('findRunning')
      const none: undefined = undefined
      return Effect.succeed(none)
    },
  }
  return { runtime, calls }
}

/** A port probe that plays back scripted verdicts and counts its calls. */
const scriptedPorts = (results: readonly boolean[]): { readonly probe: PortProbe; readonly calls: () => number } => {
  const queue = [...results]
  let callCount = 0
  return {
    probe: () => {
      callCount++
      return Effect.succeed(queue.shift() ?? false)
    },
    calls: () => callCount,
  }
}

/** An HTTP probe that plays back scripted responses, records every request and counts its calls. */
const scriptedHttp = (
  responses: readonly HttpProbeResponse[],
): {
  readonly probe: HttpProbe
  readonly calls: () => number
  readonly requests: () => ReadonlyArray<HttpProbeRequest>
} => {
  const queue = [...responses]
  const requests: HttpProbeRequest[] = []
  let callCount = 0
  return {
    probe: (request) => {
      callCount++
      requests.push(request)
      return Effect.succeed(queue.shift() ?? { status: 0, body: '' })
    },
    calls: () => callCount,
    requests: () => requests,
  }
}

const baseSpec = (): ContainerSpec => newContainerSpec('alpine:3.20', 'rz-wait-test')

const handle = (spec: ContainerSpec): SandboxHandle => ({ id: 'cid-test', spec })

const waitProgram = (
  runtime: ReturnType<typeof makeRuntime>['runtime'],
  sandboxHandle: SandboxHandle,
  options: Parameters<typeof waitForReady>[1] = {},
): Effect.Effect<SandboxHandle, ContainerLaunchError | InvalidWaitStrategyError | UnsupportedByBackendError> =>
  Effect.provideService(SandboxRuntime, runtime)(waitForReady(sandboxHandle, options))

/**
 * Runs the wait to its exit: forks it, lets round 1 run (one immediate
 * probe), then advances the clock one poll interval per extra round — probe
 * N lands on the (N − 1)th advance.
 */
const runFor = <A, E>(
  program: Effect.Effect<A, E>,
  extraRounds: number,
  intervalMs = 250,
): Effect.Effect<Exit.Exit<A, E>> =>
  Effect.gen(function*() {
    const fiber = yield* Effect.forkChild(program)
    yield* Effect.yieldNow
    for (let i = 0; i < extraRounds; i++) {
      yield* TestClock.adjust(D.millis(intervalMs))
    }
    return yield* Fiber.await(fiber)
  })

const firstError = <E>(exit: Exit.Exit<unknown, E>): E | undefined =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error : undefined

const boundPortSpec = (hostPort: number, guestPort = 80): ContainerSpec => ({
  ...baseSpec(),
  ports: [{ hostPort, guestPort }],
})

// =============================================================================
// ForPort — read-probe readiness against the pre-allocated host ports
// =============================================================================

describe('waitForReady — ForPort', () => {
  it.effect('Should_BecomeReady_When_FirstProbeSucceeds', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const ports = scriptedPorts([true])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...boundPortSpec(38080), waitStrategy: forPort() }), {
          startupTimeoutMs: 120_000,
          portProbe: ports.probe,
        }),
        0,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(ports.calls()).toBe(1) // one round, one probe
      expect(calls).toEqual([]) // zero I/O on the runtime capability
    }))

  it.effect('Should_BecomeReady_When_ProbesFailThenSucceed', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime()
      const ports = scriptedPorts([false, false, true])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...boundPortSpec(38080), waitStrategy: forPort() }), {
          startupTimeoutMs: 120_000,
          portProbe: ports.probe,
        }),
        2,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(ports.calls()).toBe(3) // one probe per round; round 3 observes ready
    }))

  it.effect('Should_FailWithContainerLaunchError_When_DeadlinePasses', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime()
      const ports = scriptedPorts([false, false, false])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...boundPortSpec(38080), waitStrategy: forPort() }), {
          startupTimeoutMs: 500,
          portProbe: ports.probe,
        }),
        2,
      )
      // round 3 crosses the 500ms deadline on the failed probe (probe before
      // deadline check — the one-shot ordering) so exactly two intervals elapse.
      expect(Exit.isFailure(exit)).toBe(true)
      expect(ports.calls()).toBe(3)
      expect(firstError(exit)).toBeInstanceOf(ContainerLaunchError)
    }))

  it.effect('Should_NotProbe_When_HostPortWasNeverAllocated', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const ports = scriptedPorts([true])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...boundPortSpec(0), waitStrategy: forPort() }), {
          startupTimeoutMs: 500,
          portProbe: ports.probe,
        }),
        2,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(ports.calls()).toBe(0) // unallocated bindings never reach the probe
      expect(calls).toEqual(['logs']) // the only runtime contact is the timeout tail gather
    }))

  it.effect('Should_BeVacuouslyReady_When_NoPortsExposed', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const ports = scriptedPorts([true])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forPort() }), { portProbe: ports.probe }),
        0,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(ports.calls()).toBe(0)
      expect(calls).toEqual([])
    }))
})

// =============================================================================
// ForHttp — chained port/status/method/headers/body over the HTTP probe seam
// =============================================================================

describe('ForHttp', () => {
  it.effect('Should_BecomeReady_When_ExpectedStatusReturns', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const http = scriptedHttp([{ status: 404, body: 'not yet' }, { status: 200, body: 'ok' }])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...boundPortSpec(38080, 80), waitStrategy: forHttp('/healthz') }), {
          startupTimeoutMs: 120_000,
          httpProbe: http.probe,
        }),
        1,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(http.calls()).toBe(2)
      expect(http.requests()[0]).toMatchObject({ path: '/healthz', method: 'GET', host: '127.0.0.1', port: 38080 })
      expect(calls).toEqual([]) // the HTTP path never touches the runtime
    }))

  it.effect('Should_ProbeOverrideSettings_When_ChainedOptionsCarryThem', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime()
      const http = scriptedHttp([{ status: 500, body: '{"ok":true}' }])
      const spec: ContainerSpec = {
        ...baseSpec(),
        ports: [
          { hostPort: 38080, guestPort: 8080 },
          { hostPort: 39000, guestPort: 9000 },
        ],
      }
      const exit = yield* runFor(
        waitProgram(
          runtime,
          handle({
            ...spec,
            waitStrategy: forHttp('/health', {
              port: 9000,
              status: 500,
              method: 'PUT',
              headers: { 'X-Token': 'secret' },
              body: bodyContains('"ok":true'),
            }),
          }),
          { startupTimeoutMs: 120_000, httpProbe: http.probe },
        ),
        0,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(http.requests()[0]).toMatchObject({
        path: '/health',
        method: 'PUT',
        port: 39000, // the chained guest-port override resolves the right binding
        headers: { 'X-Token': 'secret' },
      })
    }))

  it.effect('Should_NotBeReady_When_BodyPredicateFails', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime()
      const http = scriptedHttp([{ status: 200, body: 'nope' }, { status: 200, body: 'nope' }])
      const exit = yield* runFor(
        waitProgram(
          runtime,
          handle({ ...boundPortSpec(38080), waitStrategy: forHttp('/x', { body: bodyMatches('^ok$') }) }),
          { startupTimeoutMs: 500, pollIntervalMs: 250, httpProbe: http.probe },
        ),
        2,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(ContainerLaunchError)
    }))

  it.effect('Should_NotBeReady_When_NoExposedPortsExist', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime()
      const http = scriptedHttp([{ status: 200, body: '' }])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forHttp('/x') }), {
          startupTimeoutMs: 500,
          httpProbe: http.probe,
        }),
        2,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(http.calls()).toBe(0) // no binding to probe: refuse the probe, poll on
    }))
})

// =============================================================================
// ForLogMessage — regex + count over the logs snapshot
// =============================================================================

describe('ForLogMessage', () => {
  it.effect('Should_BecomeReady_When_PatternMatchedEnoughLines', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime({ logs: ['starting', 'booted once', 'booted twice\nready\nready'] })
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forLogMessage('ready', 2) }), {
          startupTimeoutMs: 120_000,
        }),
        2,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(calls.filter((name) => name === 'logs')).toHaveLength(3) // one snapshot per round
    }))

  it.effect('Should_CountOnce_When_LineMatchesWhollyAndAsSubstring', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime({ logs: ['ready to accept connections'] })
      // times=1: a single matching line satisfies even though the pattern
      // would also match as a substring within that same line.
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forLogMessage('ready') }), {
          startupTimeoutMs: 120_000,
        }),
        0,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
    }))

  it.effect('Should_BeVacuouslyReady_When_CountIsZero', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forLogMessage('anything', 0) }), {}),
        0,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(calls).toEqual([])
    }))

  it.effect('Should_PollOn_When_LogsAreUnfetchable', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime({ logs: [{ failWith: 'logs not available yet' }] })
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forLogMessage('ready', 2) }), {
          startupTimeoutMs: 500,
        }),
        2,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(ContainerLaunchError)
      // every probe failed to fetch logs; the timeout tail also failed —
      // a resilient empty tail in the message, never a thrown error
      expect(calls.filter((name) => name === 'logs').length).toBeGreaterThanOrEqual(3)
    }))
})

// =============================================================================
// ForHealthCheck — inspect health status, capability-gated
// =============================================================================

describe('ForHealthCheck', () => {
  it.effect('Should_Refuse_When_BackendLacksHealthInspection', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime({
        capabilities: { ...dockerCapabilities, healthInspection: false },
      })
      const exit = yield* runFor(waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forHealthCheck() }), {}), 0)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(UnsupportedByBackendError)
      expect(calls).toEqual([]) // refused before any probe
    }))

  it.effect('Should_BecomeReady_When_HealthReachesExpectedStatus', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime({
        inspects: [
          { exists: true, running: true, health: undefined },
          { exists: true, running: true, health: 'starting' },
          { exists: true, running: true, health: 'healthy' },
        ],
      })
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forHealthCheck() }), { startupTimeoutMs: 120_000 }),
        2,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(calls.filter((name) => name === 'inspect')).toHaveLength(3)
    }))

  it.effect('Should_BecomeReady_When_HealthReachesCustomStatus', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime({
        inspects: [{ exists: true, running: true, health: 'unhealthy' }, {
          exists: true,
          running: true,
          health: 'starting',
        }],
      })
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forHealthCheck('starting') }), {
          startupTimeoutMs: 120_000,
        }),
        1,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
    }))
})

// =============================================================================
// ForShell — exec exit code 0 is the readiness verdict
// =============================================================================

describe('ForShell', () => {
  it.effect('Should_BecomeReady_When_CommandExitsZero', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime({
        execs: [
          { exitCode: 1, stdout: '', stderr: 'not ready' },
          { exitCode: 0, stdout: '', stderr: '' },
        ],
      })
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forShell('true') }), { startupTimeoutMs: 120_000 }),
        1,
      )
      expect(Exit.isSuccess(exit)).toBe(true)
      expect(calls.filter((name) => name === 'exec')).toHaveLength(2)
    }))

  it.effect('Should_KeepPolling_When_ExecErrors', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime({
        execs: [{ failWith: 'workload still starting' }, { failWith: 'workload still starting' }, {
          failWith: 'workload still starting',
        }],
      })
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forShell('true') }), { startupTimeoutMs: 500 }),
        2,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(ContainerLaunchError)
    }))
})

// =============================================================================
// Timeout reporting — the bounded log tail in the ContainerLaunchError
// =============================================================================

describe('timeout error carries the bounded log tail', () => {
  it.effect('Should_BoundTheTail_When_LogsExceedTheLimit', () =>
    Effect.gen(function*() {
      const sixtyLines = Array.from({ length: 60 }, (_, i) => `line-${i + 1}`).join('\n')
      const { runtime, calls } = makeRuntime({ logs: [sixtyLines] })
      const ports = scriptedPorts([false, false, false])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...boundPortSpec(38080, 80), waitStrategy: forPort() }), {
          startupTimeoutMs: 500,
          portProbe: ports.probe,
        }),
        2,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(ContainerLaunchError)
      expect(calls.filter((name) => name === 'logs')).toHaveLength(1) // gathered only on the deadline round
      const message = (firstError(exit) as ContainerLaunchError).message
      const lines = message.split('\n')
      expect(lines[0]).toBe('Timed out waiting for cid-test to become ready.')
      expect(lines).toHaveLength(51) // header + 50 tail lines
      expect(lines[1]).toBe('line-11') // the last 50 of 60 lines: line-11 … line-60
      expect(lines[50]).toBe('line-60')
      expect(lines.slice(1)).not.toContain('line-1') // exact lines only — 'line-1' is not among the tail
      expect(lines.slice(1)).not.toContain('line-10')
    }))

  it.effect('Should_StillReport_When_NoLogsAreReachable', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime()
      const ports = scriptedPorts([false, false])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...boundPortSpec(38080), waitStrategy: forPort() }), {
          startupTimeoutMs: 500,
          portProbe: ports.probe,
        }),
        2,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect((firstError(exit) as ContainerLaunchError).message).toContain('Timed out waiting for cid-test')
    }))
})

// =============================================================================
// Interruptibility — the wait dies cleanly between polls
// =============================================================================

describe('interruptibility', () => {
  it.effect('Should_BeInterruptible_When_CancelledBetweenPolls', () =>
    Effect.gen(function*() {
      const { runtime } = makeRuntime()
      const ports = scriptedPorts([false, false])
      const fiber = yield* Effect.forkChild(
        waitProgram(runtime, handle({ ...boundPortSpec(38080), waitStrategy: forPort() }), {
          startupTimeoutMs: 120_000,
          portProbe: ports.probe,
        }),
      )
      yield* Effect.yieldNow
      expect(ports.calls()).toBe(1) // round 1 probed, then the loop is asleep
      yield* TestClock.adjust(D.millis(250))
      expect(ports.calls()).toBe(2) // round 2 probed, then asleep again
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      if (Exit.isSuccess(exit)) {
        throw new Error('expected the interrupted wait to fail')
      }
      expect(Cause.hasInterrupts(exit.cause)).toBe(true) // an interruption, not a typed failure
      expect(Cause.hasFails(exit.cause)).toBe(false)
    }))
})

// =============================================================================
// Setup validation — refused as a typed result before any probe
// =============================================================================

describe('wait setup validation (typed, pre-I/O)', () => {
  it.effect('Should_Refuse_When_StartupTimeoutIsZero', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const ports = scriptedPorts([true])
      const exit = yield* waitProgram(
        runtime,
        handle({ ...baseSpec(), waitStrategy: forPort() }),
        { startupTimeoutMs: 0, portProbe: ports.probe },
      ).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(InvalidWaitStrategyError)
      expect(ports.calls()).toBe(0)
      expect(calls).toEqual([])
    }))

  it.effect('Should_Refuse_When_SpecStartupTimeoutIsNegative', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const exit = yield* waitProgram(
        runtime,
        handle({ ...baseSpec(), waitStrategy: forPort(), startupTimeoutMs: -1 }),
        {},
      ).pipe(Effect.exit)
      // the spec's own invalid deadline is refused as a typed result — it
      // never reaches a probe or the clock (runs synchronously)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(InvalidWaitStrategyError)
      expect(calls).toEqual([])
    }))

  it.effect('Should_RefuseInvalidHttpStatus_When_ProbeSettingsAreBad', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const http = scriptedHttp([])
      const exit = yield* runFor(
        waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forHttp('/x', { status: 99 }) }), {
          startupTimeoutMs: 120_000,
          httpProbe: http.probe,
        }),
        0,
      )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(InvalidWaitStrategyError)
      expect(http.calls()).toBe(0)
      expect(calls).toEqual([])
    }))

  it.effect('Should_RejectNegativeLogCount_When_ProbeSettingsAreBad', () =>
    Effect.gen(function*() {
      const { runtime, calls } = makeRuntime()
      const exit = yield* waitProgram(runtime, handle({ ...baseSpec(), waitStrategy: forLogMessage('x', -1) }), {})
        .pipe(
          Effect.exit,
        )
      expect(Exit.isFailure(exit)).toBe(true)
      expect(firstError(exit)).toBeInstanceOf(InvalidWaitStrategyError)
      expect(calls).toEqual([])
    }))
})
