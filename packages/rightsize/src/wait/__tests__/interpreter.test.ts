/**
 * The wait interpreter (R11) — one interruptible poll loop over the
 * strategy union, driven with deterministic virtual time (TestClock):
 * every probe outcome is scripted through a `SandboxRuntime` double, and
 * every sleep/deadline decision rides the virtual clock, so no test bets
 * on wall-clock pacing.
 *
 * Covered contracts:
 * - ForShell: exit 0 is ready on the first round; a failing command polls
 *   and the deadline crossing surfaces as `ContainerLaunchError` carrying
 *   the bounded log tail (the interpreter's timeout verdict);
 * - ForLogMessage: count semantics — count 0 is trivially ready with the
 *   runtime NEVER probed; a positive count reads distinct log snapshots
 *   until the count is met;
 * - interruption mid-poll kills the loop and leaves no dangling probe —
 *   no further exec ever runs after the interruption;
 * - an exceeded `startupTimeoutMs` resolves to the timeout error and the
 *   final report carries the gathered tail.
 */
import { Cause, Duration, Effect, Fiber, Layer, Schema as S } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'

import type { RuntimeCapabilities } from '../../model/capabilities.js'
import type { ContainerSpec } from '../../model/container-spec.js'
import { ContainerLaunchError } from '../../model/errors.js'
import { newContainerSpec } from '../../model/spec-combinators.js'
import type { BackendName, SandboxHandle, SandboxRuntimeService } from '../../runtime/runtime.js'
import { SandboxRuntime } from '../../runtime/runtime.js'
import { waitForReady } from '../interpreter.js'
import { forLogMessage, forShell } from '../strategies.js'

/** The docker capability board — only the health-check gate reads it; the strategies under test never do. */
const CAPABILITIES: RuntimeCapabilities = {
  hardwareIsolated: false,
  checkpoint: true,
  checkpointRestartsWorkload: false,
  supportsNativeNetworks: true,
  healthInspection: true,
}

/** A spec whose readiness strategy is scripted — the interpreter's default ForPort is never under test here. */
const waitSpec = (strategy: ContainerSpec['waitStrategy']): ContainerSpec => ({
  ...newContainerSpec('alpine:3.19', 'rz-wait-test'),
  waitStrategy: strategy,
})

const waitHandle = (spec: ContainerSpec): SandboxHandle => ({ id: 'wait-cid-1', spec })

/** The scripted runtime state the interpreter probes. Exec results and log snapshots are queues the test feeds. */
interface ScriptedState {
  readonly execResults: Array<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }>
  readonly logSnapshots: string[]
  /** Exec probes actually run — the dangling-probe counter. */
  execProbeCount: number
  /** Logs fetches actually made. */
  logsFetchCount: number
}

interface ScriptedRuntime {
  readonly state: ScriptedState
  readonly service: SandboxRuntimeService
}

const scriptedRuntime = (): ScriptedRuntime => {
  const state: ScriptedState = {
    execResults: [],
    logSnapshots: [],
    execProbeCount: 0,
    logsFetchCount: 0,
  }
  const service: SandboxRuntimeService = {
    name: 'docker' satisfies BackendName,
    capabilities: CAPABILITIES,
    create: () => Effect.never,
    start: () => Effect.never,
    stop: () => Effect.never,
    remove: () => Effect.never,
    exec: () => {
      state.execProbeCount += 1
      // An empty queue means "not ready yet" for the rest of the wait — the
      // struggling-workload posture the poll loop must keep polling through.
      const scripted = state.execResults.shift()
      return Effect.succeed(scripted ?? { exitCode: 1, stdout: '', stderr: '' })
    },
    logs: () => {
      state.logsFetchCount += 1
      return Effect.succeed(state.logSnapshots.shift() ?? '')
    },
    followLogs: () => Effect.never,
    copyToContainer: () => Effect.never,
    copyFromContainer: () => Effect.never,
    inspect: () => Effect.succeed({ exists: true, running: false, health: undefined }),
    removeByName: () => Effect.never,
    findRunning: () => {
      const none: SandboxHandle | undefined = undefined
      return Effect.succeed(none)
    },
  }
  return { state, service }
}

const runtimeLayer = (runtime: ScriptedRuntime): Layer.Layer<SandboxRuntime> =>
  Layer.succeed(SandboxRuntime, runtime.service)

/** One wait run's channel, folded into a plain outcome the assertions read. */
type WaitRun =
  | { readonly _tag: 'ready'; readonly value: SandboxHandle }
  | { readonly _tag: 'timedOut'; readonly failure: unknown }

/** Runs one wait under the scripted runtime, capturing the typed channels as data. */
const run = (
  handle: SandboxHandle,
  options: Parameters<typeof waitForReady>[1],
  runtime: ScriptedRuntime,
): Effect.Effect<WaitRun> =>
  Effect.match(waitForReady(handle, options).pipe(Effect.provide(runtimeLayer(runtime))), {
    onSuccess: (value): WaitRun => ({ _tag: 'ready', value }),
    onFailure: (failure): WaitRun => ({ _tag: 'timedOut', failure }),
  })

/** The timeout contract, narrowed through its schema — the typed `ContainerLaunchError`. */
const timeoutOf = (outcome: WaitRun): ContainerLaunchError => {
  if (outcome._tag === 'ready') {
    throw new Error('the wait resolved ready — expected the startup deadline to fire')
  }
  if (!S.is(ContainerLaunchError)(outcome.failure)) {
    throw new Error(`unexpected wait failure: ${String(outcome.failure)}`)
  }
  return outcome.failure
}

/** The ready arm, or a loud test failure. */
const readyOf = (outcome: WaitRun): SandboxHandle => {
  if (outcome._tag === 'timedOut') {
    throw new Error(`the wait timed out unexpectedly: ${String(outcome.failure)}`)
  }
  return outcome.value
}

/** Forks a wait run under the virtual clock and lets its first probe round land. */
const forkWait = (
  wait: Effect.Effect<WaitRun>,
): Effect.Effect<Fiber.Fiber<WaitRun>> =>
  Effect.gen(function*() {
    const fiber = yield* Effect.forkChild(wait)
    // The child's first probe round lands before the parent moves the clock.
    yield* Effect.yieldNow
    return fiber
  })

describe('the wait interpreter', () => {
  it('Should_ResolveWhenReady_When_TheShellCommandExitsZero', () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const runtime = scriptedRuntime()
        runtime.state.execResults.push({ exitCode: 0, stdout: '', stderr: '' })
        const handle = waitHandle(waitSpec(forShell('true')))
        return yield* run(handle, {}, runtime)
      }).pipe(Effect.provide(TestClock.layer())),
    ).then((outcome) => {
      expect(outcome._tag).toBe('ready')
      expect(readyOf(outcome).id).toBe('wait-cid-1')
    }))

  it('Should_PollToTheTimeout_When_TheShellCommandNeverExitsZero', () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const runtime = scriptedRuntime()
        runtime.state.execResults.push({ exitCode: 1, stdout: '', stderr: '' })
        runtime.state.logSnapshots.push('line-1\nline-2')
        const handle = waitHandle(waitSpec(forShell('true')))
        const fiber = yield* forkWait(run(handle, { startupTimeoutMs: 30, pollIntervalMs: 10 }, runtime))
        yield* TestClock.adjust(Duration.seconds(1))
        const exit = yield* Fiber.await(fiber)
        if (exit._tag === 'Failure') {
          throw new Error(`the wait fiber failed: ${String(exit.cause)}`)
        }
        return { outcome: exit.value, probeRounds: runtime.state.execProbeCount }
      }).pipe(Effect.provide(TestClock.layer())),
    ).then(({ outcome, probeRounds }) => {
      const error = timeoutOf(outcome)
      expect(error.message).toContain('Timed out waiting for wait-cid-1 to become ready.')
      // The bounded log tail rides the report — the interpreter gathered it.
      expect(error.message).toContain('line-2')
      // The loop polled multiple rounds rather than giving up on round one.
      expect(probeRounds).toBeGreaterThan(1)
    }))

  it('Should_BeTriviallyReady_When_ForLogMessageCountIsZero', () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const runtime = scriptedRuntime()
        const handle = waitHandle(waitSpec(forLogMessage('boot', 0)))
        return {
          outcome: yield* run(handle, {}, runtime),
          logsFetchCount: runtime.state.logsFetchCount,
          execProbeCount: runtime.state.execProbeCount,
        }
      }).pipe(Effect.provide(TestClock.layer())),
    ).then(({ outcome, logsFetchCount, execProbeCount }) => {
      expect(readyOf(outcome).id).toBe('wait-cid-1')
      // Count 0 is a static property of the strategy: the interpreter exits
      // BEFORE touching the runtime or the clock — zero probes, zero fetches.
      expect(logsFetchCount).toBe(0)
      expect(execProbeCount).toBe(0)
    }))

  it('Should_CountMatchingLines_When_ForLogMessageRequiresTwoMatches', () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const runtime = scriptedRuntime()
        runtime.state.logSnapshots.push('')
        runtime.state.logSnapshots.push('boot\n')
        runtime.state.logSnapshots.push('boot\nready\nready\n')
        const handle = waitHandle(waitSpec(forLogMessage('ready', 2)))
        const fiber = yield* forkWait(run(handle, { pollIntervalMs: 10 }, runtime))
        // Round 1: zero matches → Continue. Round 2: one match → Continue.
        // Round 3: two distinct matching lines → Ready.
        yield* TestClock.adjust(Duration.millis(10))
        yield* TestClock.adjust(Duration.millis(10))
        const exit = yield* Fiber.await(fiber)
        if (exit._tag === 'Failure') {
          throw new Error(`the wait fiber failed: ${String(exit.cause)}`)
        }
        return { outcome: exit.value, logsFetchCount: runtime.state.logsFetchCount }
      }).pipe(Effect.provide(TestClock.layer())),
    ).then(({ outcome, logsFetchCount }) => {
      expect(readyOf(outcome).id).toBe('wait-cid-1')
      // One fetch per round — the interpreter polls fresh logs each round.
      expect(logsFetchCount).toBe(3)
    }))

  it('Should_CancelThePollLoop_When_InterruptedMidWait', () =>
    Effect.runPromise(
      Effect.gen(function*() {
        const runtime = scriptedRuntime()
        runtime.state.execResults.push({ exitCode: 1, stdout: '', stderr: '' })
        const handle = waitHandle(waitSpec(forShell('true')))
        const fiber = yield* forkWait(run(handle, { pollIntervalMs: 10 }, runtime))
        // Two probe rounds land on the virtual clock, then the wait is cut.
        yield* TestClock.adjust(Duration.millis(10))
        yield* TestClock.adjust(Duration.millis(10))
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        const afterInterrupt = runtime.state.execProbeCount
        // No dangling probe: advancing the clock after the interruption must
        // not schedule any further exec call on the cancelled fiber.
        yield* TestClock.adjust(Duration.seconds(5))
        const afterDeadline = runtime.state.execProbeCount
        return {
          interrupted: exit._tag === 'Failure' && Cause.hasInterrupts(exit.cause),
          afterInterrupt,
          afterDeadline,
        }
      }).pipe(Effect.provide(TestClock.layer())),
    ).then(({ interrupted, afterInterrupt, afterDeadline }) => {
      expect(interrupted).toBe(true)
      // The loop was polling — not silently stuck before its first probe.
      expect(afterInterrupt).toBeGreaterThan(1)
      expect(afterDeadline).toBe(afterInterrupt)
    }))
})
