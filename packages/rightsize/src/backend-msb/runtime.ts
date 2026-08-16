/**
 * The microsandbox CLI driver — `SandboxRuntime` over the msb binary.
 * Behavioral source: upstream rightsize-node `src/backend-msb/backend.ts`
 * (Apache-2.0), with the port's kernel/adapter split: every DECISION here
 * delegates to the landed kernels (`output.kernel`'s classifications and
 * parsers, `commands/msb.kernel`'s argv builders, `tunnel.kernel`'s respawn
 * policy), and this module is the pure effect edge — spawn, poll, retry.
 *
 * The attached-mode boot is the whole ballgame: every sandbox starts as a
 * held `msb run` child (detached mode never executes the image's own
 * ENTRYPOINT/CMD) whose readiness is polled via `msb ls --format json`
 * until the name shows `"Running"`. The attached child's merged output is
 * kept only for pre-Running failure classification (image-cache corruption,
 * state-db migration races, install-lock refusals, port-bind conflicts);
 * workload logs always come from the `msb logs` channel, never the child.
 *
 * The command seam is injectable (`command-runner.ts`): tests drive the
 * whole bootstrap/retry matrix with scripted doubles — no real msb and no
 * real microVM anywhere in this unit.
 */
import { spawnSync } from 'node:child_process'
import * as readline from 'node:readline'

import { Clock, Effect, Exit, Fiber, Match } from 'effect'

import type { ContainerSpec, ExecRequest, ExecResult } from '../model/container-spec.js'
import { BackendError, PortBindConflictError } from '../model/errors.js'
import type { ContainerInspect, FollowHandle, SandboxHandle, SandboxRuntimeService } from '../runtime/runtime.js'
import type { CliChild, CommandRunnerService } from './command-runner.js'
import { MsbCommands, type MsbRunSpec } from './commands/msb.js'
import {
  type BootExitClassification,
  classifyBootExit,
  isAgentEndpointNotReady,
  isMsbStateDbError,
  lsEntries,
  runningNames,
  undeliveredLines,
} from './output.js'

// ---------------------------------------------------------------------------
// Timing (upstream values; every knob is injectable via the adapter options)
// ---------------------------------------------------------------------------

export interface MsbRuntimeOptions {
  /** Ceiling on one attached boot's readiness poll (a cold image pull can be slow). */
  readonly firstRunPullTimeoutMs: number
  /** The readiness-poll pause while `msb ls` shows the sandbox not yet Running. */
  readonly readinessPollMs: number
  /** One `msb stop`/`rm`/`image remove` invocation's budget. */
  readonly stopTimeoutMs: number
  /** One `msb exec` invocation's budget. */
  readonly execTimeoutMs: number
  /** How long `exec` keeps retrying while the guest agent's endpoint has not appeared (see `isAgentEndpointNotReady`). */
  readonly agentEndpointRetryBudgetMs: number
  /** The pause between agent-endpoint retries. */
  readonly agentEndpointRetryDelayMs: number
  /** One `msb log`/`msb ls` invocation's budget. */
  readonly logsTimeoutMs: number
  /** How long `stop` waits for the attached child to exit on its own before SIGKILL. */
  readonly attachedProcStopTimeoutMs: number
  /** The tail depth kept for boot-failure diagnostics. */
  readonly tailLines: number
  /** The pause before one state-db boot retry (the concurrent-migration race). */
  readonly stateDbRetryDelayMs: number
  /** How long `start` polls a refused boot while msb's install lock is held. */
  readonly installLockRetryBudgetMs: number
  /** The pause between install-lock retries. */
  readonly installLockRetryDelayMs: number
  /** One `msb copy` invocation's budget (a directory's copy scales with its contents). */
  readonly copyTimeoutMs: number
}

/** The upstream default timing table — the plan's behavioral pin. */
export function defaultMsbRuntimeOptions(): MsbRuntimeOptions {
  return {
    firstRunPullTimeoutMs: 600_000,
    readinessPollMs: 300,
    stopTimeoutMs: 60_000,
    execTimeoutMs: 120_000,
    agentEndpointRetryBudgetMs: 30_000,
    agentEndpointRetryDelayMs: 250,
    logsTimeoutMs: 30_000,
    attachedProcStopTimeoutMs: 10_000,
    tailLines: 50,
    stateDbRetryDelayMs: 500,
    installLockRetryBudgetMs: 30_000,
    installLockRetryDelayMs: 2_000,
    copyTimeoutMs: 120_000,
  }
}

// ---------------------------------------------------------------------------
// Shared adapter state (per layer, never module-global)
// ---------------------------------------------------------------------------

/** Per-handle driver state: the attached supervisor child, its tunnels, and whether the child already exited. */
export interface MsbHandleState {
  /** The attached `msb run` child — msb's supervisor for the sandbox's whole lifetime. */
  attached: CliChild | undefined
  /** True once the attached child has actually exited (Node never replays a past 'exit' to a late listener). */
  attachedExited: boolean
  /** The network-alias tunnels this handle owns; `stop()` quiesces them first. */
  resources: Array<{ close: Effect.Effect<void> }>
}

/** The state all four msb backend services share — created once per backend layer. */
export interface MsbBackendState {
  readonly handles: Map<string, MsbHandleState>
  /** Own-run cleanup set. A keepAlive sandbox never enters it, so it survives this process by construction. */
  readonly startedNames: Set<string>
}

/** The empty shared state — one per `layerMsb` instance. */
export function createMsbBackendState(): MsbBackendState {
  return { handles: new Map(), startedNames: new Set() }
}

// ---------------------------------------------------------------------------
// Internal plumbing
// ---------------------------------------------------------------------------

/** Maps the domain spec onto the msb argv builder's shape (the kernel's own slice). */
function toRunSpec(spec: ContainerSpec): MsbRunSpec {
  return {
    name: spec.name,
    image: spec.image,
    env: spec.env,
    command: spec.command,
    ports: spec.ports.map((binding) => ({ hostPort: binding.hostPort, guestPort: binding.guestPort })),
    mounts: spec.mounts.map((mount) => ({
      hostPath: mount.hostPath,
      guestPath: mount.guestPath,
      readOnly: mount.readOnly,
    })),
    memoryLimitMb: spec.memoryLimitMb,
    diskLimitMb: spec.diskLimitMb,
    tmpfsRootMb: spec.tmpfsRootMb,
    networkDisabled: spec.networkDisabled,
    checkpointRef: spec.checkpointRef,
  }
}

/** Drains a stream's lines into the shared tail (capped), resolving when the stream closes. */
function drainIntoTail(stream: NodeJS.ReadableStream, tail: string[], maxLines: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  rl.on('line', (line) => {
    tail.push(line)
    if (tail.length > maxLines) {
      tail.shift()
    }
  })
  rl.on('close', () => resolve())
  return promise
}

// ---------------------------------------------------------------------------
// Attached boot
// ---------------------------------------------------------------------------

/** One boot attempt's outcome — the caller owns the state registration and retry policy. */
export type BootAttempt =
  | { readonly _tag: 'running'; readonly child: CliChild }
  | { readonly _tag: 'failure'; readonly classification: BootExitClassification; readonly output: string }
  | { readonly _tag: 'timed-out'; readonly output: string }

/** The named msb failure every non-classified early exit surfaces with. */
export function bootFailureMessage(id: string, code: number | null, output: string): string {
  return (
    `msb run for sandbox ${id} exited (code ${code ?? 'unknown'}) before reaching Running — check the image ` +
    `entrypoint and 'msb run' output below:\n${output}`
  )
}

/**
 * One boot attempt: spawns the attached `msb run` child, polls `msb ls`
 * until the sandbox reaches Running (or the pull budget lapses), and
 * classifies an early exit from the child's merged output. The caller
 * registers `state.attached` on `running` and owns the retry policy; a
 * timed-out child is killed here so a failed attempt never leaves a live
 * process behind.
 */
export function bootOnce(
  runner: CommandRunnerService,
  spec: ContainerSpec,
  options: MsbRuntimeOptions,
): Effect.Effect<BootAttempt, BackendError> {
  return Effect.gen(function*() {
    const child = yield* runner.spawn(MsbCommands.run(toRunSpec(spec)))
    const tail: string[] = []
    const stdoutDone = drainIntoTail(child.stdout, tail, options.tailLines)
    const stderrDone = drainIntoTail(child.stderr, tail, options.tailLines)

    let exitedCode: number | null | undefined
    void child.exited.then((code) => {
      exitedCode = code
    })

    const start = yield* Clock.currentTimeMillis
    const deadline = start + options.firstRunPullTimeoutMs
    for (;;) {
      if (exitedCode !== undefined) {
        // The child has exited: await the fully-flushed merged tail, then
        // classify — the failure message is built from complete output.
        yield* Effect.promise(() => stdoutDone)
        yield* Effect.promise(() => stderrDone)
        const output = tail.join('\n')
        return { _tag: 'failure', classification: classifyBootExit(output), output }
      }
      const now = yield* Clock.currentTimeMillis
      if (now >= deadline) {
        child.kill('SIGKILL')
        return { _tag: 'timed-out', output: tail.join('\n') }
      }
      const ls = yield* runner.invoke(MsbCommands.ls(), options.logsTimeoutMs)
      if (runningNames(ls.stdout).has(spec.name)) {
        return { _tag: 'running', child }
      }
      yield* Effect.sleep(options.readinessPollMs)
    }
  })
}

/** Wires a successful boot's child into the shared state and the own-run cleanup set. */
function registerRunning(state: MsbBackendState, handle: SandboxHandle, child: CliChild): void {
  const entry = state.handles.get(handle.id)
  if (entry !== undefined) {
    entry.attached = child
    entry.attachedExited = false
    void child.exited.then(() => {
      entry.attachedExited = true
    })
  }
  // keepAlive (reuse) sandboxes must survive this process's own exit, so
  // they are never added to the own-run cleanup set.
  if (!handle.spec.keepAlive) {
    state.startedNames.add(handle.id)
  }
}

// ===========================================================================
// Boot driver (upstream MsbCliBackend.start)
// ===========================================================================

/** The timeout rendering of a boot that never reached Running. */
function timedOutFailure(handle: SandboxHandle, options: MsbRuntimeOptions, output: string): BackendError {
  return BackendError.make({
    message:
      `Sandbox ${handle.id} did not reach Running within ${options.firstRunPullTimeoutMs / 1000}s — this can mean ` +
      `a slow image pull, a crash-looping entrypoint, or msb itself being unresponsive; last output:\n${output}`,
  })
}

/** The plain early-exit failure for an unclassified boot exit. */
function earlyExitFailure(id: string, output: string): BackendError {
  return BackendError.make({
    message: `msb run for sandbox ${id} exited before reaching Running — check the image entrypoint and 'msb run' ` +
      `output below:\n${output}`,
  })
}

/** The port-bind failure the launch retry loop classifies. */
function portBindFailure(id: string, output: string): PortBindConflictError {
  return PortBindConflictError.make({
    message: `msb run for sandbox ${id} could not bind a host port: ${output}`,
  })
}

/** The one non-retried outcome handler — running registers, every failure is typed. */
function settleOutcome(
  state: MsbBackendState,
  handle: SandboxHandle,
  options: MsbRuntimeOptions,
  outcome: BootAttempt,
): Effect.Effect<void, BackendError | PortBindConflictError> {
  return Match.value(outcome).pipe(
    Match.tag('running', ({ child }) => Effect.sync(() => registerRunning(state, handle, child))),
    Match.tag('timed-out', ({ output }) => Effect.fail(timedOutFailure(handle, options, output))),
    Match.tag('failure', ({ classification, output }) =>
      Match.value(classification).pipe(
        Match.tag('port-bind-conflict', () => Effect.fail(portBindFailure(handle.id, output))),
        Match.tag('unknown', () => Effect.fail(earlyExitFailure(handle.id, output))),
        Match.tag('image-cache-corruption', () => Effect.void),
        Match.tag('state-db', () => Effect.void),
        Match.tag('install-lock', () => Effect.void),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )
}

/** Whether a boot attempt ended in a classified early exit at all (narrowing guard). */
function isBootFailure(outcome: BootAttempt): outcome is Extract<BootAttempt, { readonly _tag: 'failure' }> {
  return Match.value(outcome).pipe(
    Match.tag('failure', () => true),
    Match.tag('running', () => false),
    Match.tag('timed-out', () => false),
    Match.exhaustive,
  )
}

/** The failure kind `start` dispatches on — every classification maps to exactly one retry policy. */
function retryKind(classification: BootExitClassification): RetryKind {
  return Match.value(classification).pipe(
    Match.tag('install-lock', () => 'install-lock' as const),
    Match.tag('state-db', () => 'state-db' as const),
    Match.tag('image-cache-corruption', () => 'image-cache-corruption' as const),
    Match.tag('port-bind-conflict', () => 'terminal' as const),
    Match.tag('unknown', () => 'terminal' as const),
    Match.exhaustive,
  )
}

/** The retry-policy dispatch key for a boot attempt. */
export type RetryKind = 'install-lock' | 'state-db' | 'image-cache-corruption' | 'terminal'

/** Renders a heal attempt's outcome for the second-failure diagnostic (see `start`). */
function describeHeal(heal: Exit.Exit<ExecResult, BackendError>): string {
  return Match.value(heal).pipe(
    Match.tag(
      'Success',
      ({ value }) =>
        value.exitCode === 0 ? 'removed' : `'msb image remove' exited ${value.exitCode}: ${value.stderr.trim()}`,
    ),
    Match.tag('Failure', () => "'msb image remove' itself failed to run"),
    Match.exhaustive,
  )
}

/** A boot that hit the state-db migration race: paused once, retried once, both outputs surfaced on a second identical failure. */
function bootWithStateDbRetry(
  runner: CommandRunnerService,
  state: MsbBackendState,
  handle: SandboxHandle,
  options: MsbRuntimeOptions,
  firstOutput: string,
): Effect.Effect<void, BackendError | PortBindConflictError> {
  return Effect.gen(function*() {
    yield* Effect.sleep(options.stateDbRetryDelayMs)
    const second = yield* bootOnce(runner, handle.spec, options)
    if (isBootFailure(second) && retryKind(second.classification) === 'state-db') {
      return yield* BackendError.make({
        message: `msb run for sandbox ${handle.id} hit msb's state-database error twice in a row — the usual cause ` +
          `(concurrent msb invocations racing startup migrations) is transient and one retry covers it, so this ` +
          `looks like real state-database trouble on this host.\nfirst attempt:\n${firstOutput}\nafter retry:\n${second.output}`,
      })
    }
    return yield* settleOutcome(state, handle, options, second)
  })
}

/** A boot that hit the image-cache corruption: heals by removing the one image's cache entry, then retries once. */
function bootWithImageCacheHeal(
  runner: CommandRunnerService,
  state: MsbBackendState,
  handle: SandboxHandle,
  options: MsbRuntimeOptions,
  firstOutput: string,
): Effect.Effect<void, BackendError | PortBindConflictError> {
  return Effect.gen(function*() {
    const heal = yield* runner.invoke(MsbCommands.imageRemove(handle.spec.image), options.stopTimeoutMs).pipe(
      Effect.exit,
    )
    const second = yield* bootOnce(runner, handle.spec, options)
    if (isBootFailure(second) && retryKind(second.classification) === 'image-cache-corruption') {
      return yield* BackendError.make({
        message: `msb run for sandbox ${handle.id} hit its image cache error twice in a row for image ` +
          `'${handle.spec.image}', even after removing that image's cache entry (${describeHeal(heal)}) and ` +
          `retrying — this is likely a deeper cache corruption than this backend's one-shot heal covers; try ` +
          `clearing the msb image cache by hand.\nfirst attempt:\n${firstOutput}\nafter heal + retry:\n${second.output}`,
      })
    }
    return yield* settleOutcome(state, handle, options, second)
  })
}

/**
 * A boot that msb refused while its internal install lock is held: polled
 * (the message's ~30-minute deadline is fiction — observed refusals cleared
 * within seconds), surfacing the last refusal when the budget lapses.
 */
function bootUnderInstallLock(
  runner: CommandRunnerService,
  state: MsbBackendState,
  handle: SandboxHandle,
  options: MsbRuntimeOptions,
  firstOutput: string,
): Effect.Effect<void, BackendError | PortBindConflictError> {
  return Effect.gen(function*() {
    const deadline = (yield* Clock.currentTimeMillis) + options.installLockRetryBudgetMs
    const poll = (): Effect.Effect<void, BackendError | PortBindConflictError> =>
      Effect.gen(function*() {
        yield* Effect.sleep(options.installLockRetryDelayMs)
        const again = yield* bootOnce(runner, handle.spec, options)
        if (isBootFailure(again) && retryKind(again.classification) === 'install-lock') {
          if ((yield* Clock.currentTimeMillis) >= deadline) {
            return yield* BackendError.make({
              message: `msb run for sandbox ${handle.id} was refused for ${options.installLockRetryBudgetMs / 1000}s ` +
                `by msb's install lock — every observed occurrence cleared within seconds, so a lock held this ` +
                `long looks like a genuinely stuck msb install on this host.\n${firstOutput}\n${again.output}`,
            })
          }
          return yield* poll()
        }
        return yield* settleOutcome(state, handle, options, again)
      })
    return yield* poll()
  })
}

/**
 * The attached boot with upstream's `start()` retry policy applied: the
 * install-lock refusal is polled, the state-db race retried once, the
 * image-cache corruption healed and retried once, a port-bind conflict
 * surfaces typed for the launch retry loop, everything else fails with the
 * raw early-exit output.
 */
export function startInternal(
  runner: CommandRunnerService,
  state: MsbBackendState,
  handle: SandboxHandle,
  options: MsbRuntimeOptions,
): Effect.Effect<void, BackendError | PortBindConflictError> {
  return Effect.gen(function*() {
    const first = yield* bootOnce(runner, handle.spec, options)
    if (!isBootFailure(first)) {
      // running, or never reached Running inside the pull budget.
      return yield* settleOutcome(state, handle, options, first)
    }
    const kind = retryKind(first.classification)
    if (kind === 'state-db') {
      return yield* bootWithStateDbRetry(runner, state, handle, options, first.output)
    }
    if (kind === 'image-cache-corruption') {
      return yield* bootWithImageCacheHeal(runner, state, handle, options, first.output)
    }
    if (kind === 'install-lock') {
      return yield* bootUnderInstallLock(runner, state, handle, options, first.output)
    }
    return yield* settleOutcome(state, handle, options, first)
  })
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/** Executes a command in the guest, retrying only msb's agent-endpoint-not-ready framing (upstream `exec`). */
export function execIn(
  runner: CommandRunnerService,
  id: string,
  request: ExecRequest,
  options: MsbRuntimeOptions,
): Effect.Effect<ExecResult, BackendError> {
  return Effect.gen(function*() {
    const args = MsbCommands.exec(id, request.command)
    const deadline = (yield* Clock.currentTimeMillis) + options.agentEndpointRetryBudgetMs
    const attemptExec = (): Effect.Effect<ExecResult, BackendError> =>
      Effect.gen(function*() {
        const result = yield* runner.invoke(args, options.execTimeoutMs)
        if (result.exitCode === 0 || !isAgentEndpointNotReady(result.stderr)) {
          return result
        }
        if ((yield* Clock.currentTimeMillis) >= deadline) {
          return result
        }
        yield* Effect.sleep(options.agentEndpointRetryDelayMs)
        return yield* attemptExec()
      })
    return yield* attemptExec()
  })
}

/** One `msb logs` snapshot — the workload's own output (never the attached child's pipe). */
export function logsOf(
  runner: CommandRunnerService,
  id: string,
  options: MsbRuntimeOptions,
): Effect.Effect<string, BackendError> {
  return runner.invoke(MsbCommands.logs(id), options.logsTimeoutMs).pipe(Effect.map((result) => result.stdout))
}

/**
 * The POSIX follow-logs path (upstream `followLogs`): a `msb logs -f` child
 * delivers lines live while a watchdog polls `msb ls`; the instant the
 * sandbox leaves Running, the stuck follow child is quiesced first, then one
 * authoritative non-follow fetch replays only the lines after `delivered`
 * (guarded so the replay can only ever happen once). An explicit `close()`
 * stops delivery and never triggers a replay.
 */
/**
 * The POSIX follow-logs path (upstream `followLogs`): a `msb logs -f` child
 * delivers lines live while a watchdog polls `msb ls`; the instant the
 * sandbox leaves Running, the stuck follow child is quiesced first, then one
 * authoritative non-follow fetch replays only the lines after `delivered`
 * (guarded so the replay can only ever happen once). An explicit `close()`
 * stops delivery and never triggers a replay.
 */

/**
 * The follow-logs driver (upstream's POSIX path): a `msb logs -f` child
 * delivers lines live while a watchdog polls `msb ls` on a plain promise
 * loop (the runner's `invokePromise` seam — this machinery lives outside
 * Effect territory, since the service contract carries no Scope). The
 * instant the sandbox leaves Running, the stuck follow child is quiesced
 * first, then one authoritative non-follow fetch replays only the lines
 * after `delivered` (guarded so the replay can only happen once). An
 * explicit `close()` stops delivery and never triggers a replay.
 */

/**
 * The follow-logs driver (upstream's POSIX path): a `msb logs -f` child
 * delivers lines live while a watchdog polls `msb ls`; the instant the
 * sandbox leaves Running, the stuck follow child is quiesced first, then one
 * authoritative non-follow fetch replays only the lines after `delivered`
 * (guarded so the replay can only ever happen once). An explicit `close()`
 * stops delivery and never triggers a replay.
 */
export function followLogsOf(
  runner: CommandRunnerService,
  id: string,
  consumer: (line: string) => void,
  options: MsbRuntimeOptions,
): Effect.Effect<FollowHandle, BackendError> {
  return Effect.gen(function*() {
    const child = yield* runner.spawn(MsbCommands.followLogs(id))
    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity })
    const readerDone = Promise.withResolvers<void>()
    let delivered = 0
    rl.on('line', (line) => {
      delivered += 1
      consumer(line)
    })
    rl.on('close', () => readerDone.resolve())
    // stderr carries no signal this backend acts on; drain it so the pipe
    // never backs up and stalls the child.
    child.stderr.resume()

    const flushed = { current: false }
    const closeRequested = { current: false }

    const flushTailOnce = Effect.gen(function*() {
      child.kill()
      yield* Effect.promise(() => readerDone.promise)
      if (flushed.current) {
        return
      }
      flushed.current = true
      const full = (yield* runner.invoke(MsbCommands.logs(id), options.logsTimeoutMs)).stdout
      for (const line of undeliveredLines(full, delivered)) {
        consumer(line)
      }
    })

    const watchdog = Effect.gen(function*() {
      while (!closeRequested.current) {
        const names = yield* runner
          .invoke(MsbCommands.ls(), options.logsTimeoutMs)
          .pipe(Effect.catchEager(() => Effect.succeed({ exitCode: 1, stdout: '[]', stderr: '' })))
        if (!runningNames(names.stdout).has(id)) {
          yield* flushTailOnce
          return
        }
        yield* Effect.sleep(options.readinessPollMs)
      }
    })
    // The fork lives in a module helper — outside this Effect context, so the
    // child runs with no scope entanglement (the service contract has none).
    const watchdogFiber = yield* Effect.sync(() => runWatchdog(watchdog))

    return {
      close: Effect.gen(function*() {
        closeRequested.current = true
        child.kill()
        yield* Effect.promise(() => readerDone.promise)
        yield* Fiber.join(watchdogFiber).pipe(Effect.catchEager(() => Effect.void))
      }),
    }
  })
}

/** Forks a background effect outside the caller's Effect context (no Scope in the service contract). */
function runWatchdog(watchdog: Effect.Effect<void, unknown>) {
  return Effect.runFork(watchdog)
}

/** The protocol-free stop: quiesce tunnels, `msb stop`, then wait for the attached supervisor child. */
export function stopSandbox(
  runner: CommandRunnerService,
  state: MsbBackendState,
  id: string,
  options: MsbRuntimeOptions,
): Effect.Effect<void, BackendError> {
  return Effect.gen(function*() {
    const handleState = state.handles.get(id)
    if (handleState !== undefined) {
      for (const resource of handleState.resources) {
        yield* resource.close.pipe(Effect.catchEager(() => Effect.void))
      }
      handleState.resources = []
    }
    yield* runner.invoke(MsbCommands.stop(id), options.stopTimeoutMs).pipe(Effect.catchEager(() => Effect.void))
    const attached = handleState?.attached
    if (attached !== undefined && handleState !== undefined && !handleState.attachedExited) {
      const exited = yield* Effect.race(
        Effect.promise(() => attached.exited).pipe(Effect.as(true)),
        Effect.sleep(options.attachedProcStopTimeoutMs).pipe(Effect.as(false)),
      )
      if (!exited) {
        attached.kill('SIGKILL')
      }
      handleState.attached = undefined
    }
  })
}

/** Best-effort removal of the backend-native resource. */
export function removeIn(
  runner: CommandRunnerService,
  state: MsbBackendState,
  id: string,
  options: MsbRuntimeOptions,
): Effect.Effect<void, BackendError> {
  return Effect.gen(function*() {
    yield* runner.invoke(MsbCommands.rm(id), options.stopTimeoutMs).pipe(Effect.catchEager(() => Effect.void))
    state.startedNames.delete(id)
    state.handles.delete(id)
  })
}

/** `msb copy -q <hostPath> <name>:<containerPath>` — a non-zero exit surfaces the tool's own stderr. */
export function copyInto(
  runner: CommandRunnerService,
  handle: SandboxHandle,
  hostPath: string,
  containerPath: string,
  options: MsbRuntimeOptions,
): Effect.Effect<void, BackendError> {
  return Effect.gen(function*() {
    const result = yield* runner.invoke(MsbCommands.copyIn(hostPath, handle.id, containerPath), options.copyTimeoutMs)
    if (result.exitCode !== 0) {
      return yield* BackendError.make({
        message:
          `msb copy into ${handle.id}:${containerPath} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
      })
    }
  })
}

/** The reverse direction of `copyInto` — see its own contract. */
export function copyOutOf(
  runner: CommandRunnerService,
  handle: SandboxHandle,
  containerPath: string,
  hostPath: string,
  options: MsbRuntimeOptions,
): Effect.Effect<void, BackendError> {
  return Effect.gen(function*() {
    const result = yield* runner.invoke(MsbCommands.copyOut(handle.id, containerPath, hostPath), options.copyTimeoutMs)
    if (result.exitCode !== 0) {
      return yield* BackendError.make({
        message:
          `msb copy from ${handle.id}:${containerPath} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
      })
    }
  })
}

/** The container's existence/state from a fresh `msb ls` reading; msb reports no health. */
export function inspectIn(
  runner: CommandRunnerService,
  handle: SandboxHandle,
  options: MsbRuntimeOptions,
): Effect.Effect<ContainerInspect, BackendError> {
  return Effect.gen(function*() {
    const result = yield* runner.invoke(MsbCommands.ls(), options.logsTimeoutMs)
    const entry = lsEntries(result.stdout).find((candidate) => candidate.name === handle.id)
    if (entry === undefined) {
      return { exists: false, running: false, health: undefined }
    }
    return { exists: true, running: entry.status === 'Running', health: undefined }
  })
}

/** Best-effort stop+remove by NAME — each step retried once on msb's own state-db error. */
export function removeByNameIn(
  runner: CommandRunnerService,
  name: string,
  options: MsbRuntimeOptions,
): Effect.Effect<void, BackendError> {
  const runStep = (args: readonly string[]): Effect.Effect<void, BackendError> =>
    Effect.gen(function*() {
      const result = yield* runner.invoke(args, options.stopTimeoutMs)
      if (isMsbStateDbError(`${result.stdout}\n${result.stderr}`)) {
        yield* Effect.sleep(options.stateDbRetryDelayMs)
        yield* runner.invoke(args, options.stopTimeoutMs).pipe(Effect.catchEager(() => Effect.void))
      }
    })
  return Effect.gen(function*() {
    yield* runStep(MsbCommands.stop(name))
    yield* runStep(MsbCommands.rm(name))
  })
}

/** Reuse's adopt path: a handle when `spec.name` is Running, from `msb ls` — never re-derived from inspection. */
export function findRunningIn(
  runner: CommandRunnerService,
  spec: ContainerSpec,
  options: MsbRuntimeOptions,
): Effect.Effect<SandboxHandle | undefined, BackendError> {
  return Effect.gen(function*() {
    const result = yield* runner.invoke(MsbCommands.ls(), options.logsTimeoutMs)
    if (!runningNames(result.stdout).has(spec.name)) {
      return undefined
    }
    return { id: spec.name, spec }
  })
}

/**
 * The synchronous, blocking teardown helper for the process-exit path
 * (U4b's hygiene registry consumes this): `stop` + `rm` via `spawnSync`,
 * failures swallowed — there is no caller left to report them.
 */
export function registerMsbCleanupSync(msbPath: string, id: string): void {
  try {
    spawnSync(msbPath, MsbCommands.stop(id))
  } catch {
    // Best-effort.
  }
  try {
    spawnSync(msbPath, MsbCommands.rm(id))
  } catch {
    // Best-effort.
  }
}

/** The adapter set over one runner + shared state: the service plus the layer-release close. */
export interface RuntimeAdapter {
  readonly service: SandboxRuntimeService
  /** Layer release: own-run sandboxes are stopped+removed; keepAlive ones survive. */
  readonly close: Effect.Effect<void>
}

/** Builds the msb `SandboxRuntime` service over one runner and the shared backend state. */
export function createMsbRuntime(
  runner: CommandRunnerService,
  state: MsbBackendState,
  options: MsbRuntimeOptions = defaultMsbRuntimeOptions(),
): RuntimeAdapter {
  const service: SandboxRuntimeService = {
    name: 'msb',
    capabilities: {
      hardwareIsolated: true,
      checkpoint: true,
      checkpointRestartsWorkload: true,
      supportsNativeNetworks: false,
      healthInspection: false,
    },
    create: (spec) =>
      Effect.sync(() => {
        state.handles.set(spec.name, { attached: undefined, attachedExited: false, resources: [] })
        return { id: spec.name, spec }
      }),
    start: (handle) => startInternal(runner, state, handle, options),
    stop: (handle) => stopSandbox(runner, state, handle.id, options),
    remove: (handle) => removeIn(runner, state, handle.id, options),
    exec: (handle, request) => execIn(runner, handle.id, request, options),
    logs: (handle) => logsOf(runner, handle.id, options),
    followLogs: (handle, consumer) => followLogsOf(runner, handle.id, consumer, options),
    copyToContainer: (handle, hostPath, containerPath) => copyInto(runner, handle, hostPath, containerPath, options),
    copyFromContainer: (handle, containerPath, hostPath) => copyOutOf(runner, handle, containerPath, hostPath, options),
    inspect: (handle) => inspectIn(runner, handle, options),
    removeByName: (name) => removeByNameIn(runner, name, options),
    findRunning: (spec) => findRunningIn(runner, spec, options),
  }
  return {
    service,
    close: Effect.gen(function*() {
      for (const name of state.startedNames) {
        yield* removeByNameIn(runner, name, options).pipe(Effect.catchEager(() => Effect.void))
      }
    }),
  }
}
