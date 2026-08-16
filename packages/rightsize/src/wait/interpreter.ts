/**
 * The wait interpreter (R11) — one interruptible Effect poller over the
 * wait-strategy data union, driven by the pure verdict kernel
 * (`./verdict.kernel.ts`). Strategy data in, `ContainerLaunchError` out:
 * every poll round probes the strategy's condition against the
 * `SandboxRuntime` capability (or the host ports the spec pre-allocated),
 * folds the round through `decideVerdict`, and on the deadline-crossing
 * round gathers the bounded 50-line log tail from the runtime's logs
 * capability into the kernel's `Timeout` verdict, whose message mirrors
 * upstream: `Timed out waiting for <id> to become ready.\n<tail>`.
 *
 * Interruptibility: the loop is a plain Effect generator with no
 * `uninterruptible` wrapper anywhere, so a scope close mid-wait cancels the
 * wait at the next yield — probe and sleep alike — and the launch
 * executor's own finalizer deals with the container (upstream's poll loop
 * had the same property; here it is the Effect interruption model itself).
 *
 * The two I/O seams are injectable so tests script verdicts with zero
 * sockets (`portProbe`, `httpProbe`). The default implementations mirror
 * upstream `src/core/wait.ts` probe semantics exactly:
 *
 * - port readiness is connect-then-read, never connect-only: docker's
 *   userland proxy accepts the connect the instant the host port is
 *   published, before the guest has bound its own socket, and an
 *   accept-with-nobody-behind-it proxy closes immediately (EOF/RST) on a
 *   zero-byte read — a real peer either sends data or holds the connection
 *   open past the read timeout. Each probe is hard-backstopped so a
 *   black-holed connect can never hang the poll loop.
 * - the `node:http` probe is the workspace-catalog-driven choice: the
 *   catalog carries `@effect/platform-node`/`-shared` but no
 *   `@effect/platform` entry, so there is no Effect HttpClient surface to
 *   adopt; the seam keeps the interpreter independent of the transport
 *   (`forHttp` chainable port/status/method/headers/body via any
 *   fetch-shaped implementation).
 *
 * The spec's mapped host ports come from the handle's own spec (the
 * pre-allocation invariant, R7 — a backend binds what it was given): the
 * interpreter probes `127.0.0.1:<hostPort>` for each exposed guest port,
 * matching publish-on-loopback (R9) and the tunnel-emulation topology.
 */
import { Clock, Duration, Effect, Match, Result } from 'effect'
import * as http from 'node:http'
import * as net from 'node:net'
import { setTimeout as nodeSetTimeout } from 'node:timers'
import type { ContainerSpec } from '../model/container-spec.js'
import { ContainerLaunchError, UnsupportedByBackendError } from '../model/errors.js'
import type {
  ForHealthCheck,
  ForHttp,
  ForLogMessage,
  ForShell,
  HttpBodyMatcher,
  HttpMethod,
  WaitStrategy,
} from '../model/wait.js'
import type { SandboxHandle, SandboxRuntimeService } from '../runtime/runtime.js'
import { SandboxRuntime } from '../runtime/runtime.js'
import {
  decideVerdict,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  type InvalidWaitStrategyError,
  isTriviallyReady,
  validateWaitSetup,
  type WaitVerdict,
} from './verdict.js'

// =============================================================================
// Probe plumbing — parseable, injectable I/O
// =============================================================================

/** The loopback host every readiness probe dials (upstream parity). */
export const PROBE_HOST = '127.0.0.1'

/** Ceiling on the post-connect idle read of a port probe: a quiet-but-real peer holds the connection and passes it. */
export const READ_PROBE_TIMEOUT_MS = 200

/** Ceiling on the connect phase itself, before any byte has arrived — a connect that hangs gets a deadline, not a hang. */
export const CONNECT_PROBE_TIMEOUT_MS = 2_000

/** Ceiling on one HTTP readiness probe. */
export const HTTP_PROBE_TIMEOUT_MS = 1_000

/** The bounded tail a timeout error carries (upstream `LOG_TAIL_LINES`). */
export const LOG_TAIL_LINES = 50

/**
 * A TCP read-probe: `true` when `host:port` accepts a connection AND then
 * either sends data or holds the connection open past the read timeout —
 * never connect-only. Test doubles script verdicts through this seam.
 */
export type PortProbe = (host: string, port: number) => Effect.Effect<boolean>

/**
 * The real read-probe over `node:net` — upstream's `readProbe` semantics
 * exactly: first-event-wins between data (ready), post-connect idle timeout
 * (ready — a holding peer is a real listener), end-of-stream (not ready —
 * the accept-then-EOF proxy), error (not ready), plus a hard backstop that
 * bounds a connect that neither succeeds nor errors.
 */
export const realPortProbe: PortProbe = (host, port) => {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = new net.Socket()
  let settled = false

  // First-event-wins: whichever of data/timeout/end/error fires first
  // decides the verdict; every listener is torn down immediately so a later
  // event on the same socket can never flip an already-resolved verdict (a
  // chatty peer emitting `data` then `end` must resolve ready on the `data`
  // and ignore the trailing `end`).
  const finish = (ready: boolean): void => {
    if (settled) {
      return
    }
    settled = true
    clearTimeout(hardTimer)
    socket.removeAllListeners()
    socket.destroy()
    resolve(ready)
  }

  // Hard backstop, independent of socket.setTimeout(): the socket-level
  // timeout below is only armed AFTER connect succeeds, so a connect that
  // neither succeeds nor errors has nothing else bounding it. This is a
  // native timer inside the promise bridge on purpose: the poll loop cannot
  // rescue a probe that never settles, the bridge owns its own deadline,
  // and the Effect timer API has no place inside the native promise — hence
  // the import from node:timers rather than the global.
  // @effect-diagnostics-next-line globalTimers:off
  const hardTimer = nodeSetTimeout(() => finish(false), READ_PROBE_TIMEOUT_MS + CONNECT_PROBE_TIMEOUT_MS)

  // The connect-phase timeout listener is named so it can be explicitly
  // removed once connect succeeds; leaving it attached would otherwise also
  // fire on the READ-phase timeout re-armed below and race against that
  // timeout's own ready verdict.
  const onConnectTimeout = (): void => finish(false)
  socket.setTimeout(CONNECT_PROBE_TIMEOUT_MS)
  socket.once('error', () => finish(false))
  socket.once('timeout', onConnectTimeout)
  socket.connect(port, host, () => {
    socket.removeListener('timeout', onConnectTimeout)
    socket.setTimeout(READ_PROBE_TIMEOUT_MS)
    socket.once('data', () => finish(true))
    socket.once('timeout', () => finish(true))
    socket.once('end', () => finish(false))
    socket.once('error', () => finish(false))
  })
  return Effect.promise(() => promise)
}

/** One HTTP readiness probe request. */
export interface HttpProbeRequest {
  readonly host: string
  readonly port: number
  readonly path: string
  readonly method: HttpMethod
  readonly headers: Readonly<Record<string, string>>
}

/** The HTTP probe response; readiness is judged on `status` and body predicates. */
export interface HttpProbeResponse {
  readonly status: number
  readonly body: string
}

/**
 * An HTTP probe: one request, one response. Injectable so tests script
 * responses without a socket; the default implementation is `node:http`
 * (the workspace catalog carries no `@effect/platform` entry to build an
 * Effect HttpClient from — the plan's checked decision).
 */
export type HttpProbe = (request: HttpProbeRequest) => Effect.Effect<HttpProbeResponse>

/** The real HTTP probe over `node:http.request` — upstream's `HttpWaitStrategy.probe` semantics. */
export const realHttpProbe: HttpProbe = (request) => {
  const { promise, resolve } = Promise.withResolvers<HttpProbeResponse>()
  const req = http.request(
    {
      host: request.host,
      port: request.port,
      path: request.path,
      method: request.method,
      headers: request.headers,
      timeout: HTTP_PROBE_TIMEOUT_MS,
    },
    (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        body += chunk
      })
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body })
      })
    },
  )
  // A probe never rejects: a timeout or socket error resolves the status-0
  // sentinel (no HTTP status is 0), which no expected status can match, so a
  // failed probe scores `false` — `Effect.promise` maps rejection to a
  // defect, and a probe that cannot throw must not die either.
  const fail = (): void => {
    req.destroy()
    resolve({ status: 0, body: '' })
  }
  req.once('timeout', fail)
  req.once('error', fail)
  req.end()
  return Effect.promise(() => promise)
}

// =============================================================================
// Options and entry
// =============================================================================

/** The interpreter's knobs — every one exists so tests (and advanced callers) control the loop. */
export interface WaitOptions {
  /** Overrides the spec's `startupTimeoutMs` and the 120s default; must be a positive integer of ms. */
  readonly startupTimeoutMs?: number | undefined
  /** Overrides the 250ms default poll interval; must be a positive integer of ms. */
  readonly pollIntervalMs?: number | undefined
  /** The TCP read-probe seam (tests inject scripted verdicts); defaults to `realPortProbe`. */
  readonly portProbe?: PortProbe | undefined
  /** The HTTP probe seam (tests inject scripted responses); defaults to `realHttpProbe`. */
  readonly httpProbe?: HttpProbe | undefined
}

/**
 * Waits for `handle`'s spec's readiness strategy to be observed, polling
 * interruptibly until ready or the startup deadline passes with the bounded
 * log tail in the `ContainerLaunchError`. Returns the same handle so the
 * launch executor can chain (`waitForReady(handle).pipe(Effect.as(next))`).
 *
 * Refuses, before any probe runs and as a typed result:
 * - a resolved startup timeout or poll interval that is not a positive
 *   integer (a negative/zero `spec.startupTimeoutMs` — e.g. via
 *   `withStartupTimeout(spec, -1)` — is rejected here, at the point the
 *   spec meets the wait);
 * - strategy probe data the union's plain numbers admit but no probe can
 *   run against (bad `ForHttp.port`/`status`, non-compiling
 *   `ForLogMessage.pattern`, negative count, empty `ForShell.command`);
 * - a `ForHealthCheck` strategy on a backend whose capabilities lack
 *   `healthInspection` (the launch workflow gates pre-I/O; the interpreter
 *   double-gates so the strategy standalone can never poll a backend that
 *   cannot answer it).
 */
export const waitForReady = (
  handle: SandboxHandle,
  options: WaitOptions = {},
): Effect.Effect<
  SandboxHandle,
  ContainerLaunchError | InvalidWaitStrategyError | UnsupportedByBackendError,
  SandboxRuntime
> =>
  Effect.gen(function*() {
    const runtime = yield* SandboxRuntime
    const resolvedStrategy = handle.spec.waitStrategy

    const setup = {
      strategy: resolvedStrategy,
      startupTimeoutMs: options.startupTimeoutMs ?? handle.spec.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      portProbe: options.portProbe ?? realPortProbe,
      httpProbe: options.httpProbe ?? realHttpProbe,
    }
    // The setup gate runs before anything else — a resolved deadline that
    // cannot be waited on is refused even for a vacuously-ready strategy
    // (a `withStartupTimeout(spec, -1)` spec is invalid no matter what it
    // waits for).
    const validation = validateWaitSetup(setup)
    if (Result.isFailure(validation)) {
      return yield* validation.failure
    }

    // Vacuous readiness is a static property of the strategy (an empty port
    // set or count 0 never changes), so it is decided once, before any call
    // reaches the runtime or the clock.
    if (isTriviallyReady(resolvedStrategy, handle.spec.ports.length)) {
      return handle
    }

    // The health wait is capability-gated (the launch workflow rejects
    // pre-I/O; this is the standalone double-gate so the strategy can never
    // poll a backend that cannot answer it).
    const healthGate = Match.value(resolvedStrategy).pipe(
      Match.tag('ForHealthCheck', () => runtime.capabilities.healthInspection),
      Match.orElse(() => true),
    )
    if (!healthGate) {
      return yield* UnsupportedByBackendError.make({
        feature: 'health-check wait (ForHealthCheck)',
        backend: runtime.name,
        remedy: 'run the container on a backend with health inspection (docker)',
      })
    }

    const start = yield* Clock.currentTimeMillis
    const deadlineMs = setup.startupTimeoutMs
    /**
     * One round's dispatch: a successful probe wins even at/after the
     * deadline (the kernel's one-shot rule); otherwise the loop folds to the
     * next round, or — with the deadline crossed and the probe failing —
     * gathers the bounded log tail the report carries and re-folds this SAME
     * round (probeOk and elapsed are unchanged) so the kernel keeps
     * producing the Timeout verdict with the tail inside it.
     */
    const verdictRound = (
      verdict: WaitVerdict,
      elapsed: number,
      tail: string,
    ): Effect.Effect<SandboxHandle, ContainerLaunchError> =>
      Match.value(verdict).pipe(
        Match.tag('Ready', () => Effect.succeed(handle)),
        Match.tag(
          'Continue',
          () => Effect.sleep(Duration.millis(setup.pollIntervalMs)).pipe(Effect.flatMap(() => poll(tail))),
        ),
        // Deadline crossed with the probe failing — the timeout path.
        Match.orElse(() => timeoutRound(elapsed)),
      )
    const timeoutRound = (elapsed: number): Effect.Effect<SandboxHandle, ContainerLaunchError> =>
      Effect.flatMap(gatherLogTail(runtime, handle), (gathered) => {
        const finalVerdict = decideVerdict({
          probeOk: false,
          elapsedMs: elapsed,
          timeoutMs: deadlineMs,
          tail: gathered,
        })
        return Match.value(finalVerdict).pipe(
          Match.tag('Timeout', (timedOut) => timeoutFailure(handle.id, timedOut.tail)),
          // Unreachable — the deadline has not moved since the first fold.
          Match.orElse(() => timeoutFailure(handle.id, gathered)),
        )
      })
    const poll = (tail: string): Effect.Effect<SandboxHandle, ContainerLaunchError> =>
      Effect.gen(function*() {
        const probeOk = yield* probeOnce(runtime, handle, resolvedStrategy, setup.portProbe, setup.httpProbe)
        const elapsed = (yield* Clock.currentTimeMillis) - start
        const verdict = decideVerdict({ probeOk, elapsedMs: elapsed, timeoutMs: deadlineMs, tail })
        return yield* verdictRound(verdict, elapsed, tail)
      })
    return yield* poll('')
  })

// =============================================================================
// Per-strategy probes — every one is an effect; a probe never throws, it
// scores `false`, so a struggling container (or a transient backend error)
// reads as "not ready yet" and the poll loop decides the outcome.
// =============================================================================

const probeOnce = (
  runtime: SandboxRuntimeService,
  handle: SandboxHandle,
  strategy: WaitStrategy,
  portProbe: PortProbe,
  httpProbe: HttpProbe,
): Effect.Effect<boolean> =>
  Match.typeTags<WaitStrategy>()({
    ForPort: () => probeForPort(handle.spec, portProbe),
    ForHttp: (strategy) => probeForHttp(handle.spec, strategy, httpProbe),
    ForLogMessage: (strategy) => probeForLogMessage(runtime, handle, strategy),
    ForHealthCheck: (strategy) => probeForHealthCheck(runtime, handle, strategy),
    ForShell: (strategy) => probeForShell(runtime, handle, strategy),
  })(strategy)

/** Read-probes every exposed host port; a binding never allocated (hostPort 0) reads as not ready. */
const probeForPort = (spec: ContainerSpec, portProbe: PortProbe): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    for (const binding of spec.ports) {
      if (binding.hostPort === 0) {
        return false
      }
      if (!(yield* portProbe(PROBE_HOST, binding.hostPort))) {
        return false
      }
    }
    return true
  })

/** One HTTP probe against the mapped port; ready iff status matches and the body predicate passes. */
const probeForHttp = (spec: ContainerSpec, strategy: ForHttp, httpProbe: HttpProbe): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const guestPort = strategy.port ?? spec.ports[0]?.guestPort
    if (guestPort === undefined) {
      return false
    }
    const binding = spec.ports.find((candidate) => candidate.guestPort === guestPort)
    if (binding === undefined || binding.hostPort === 0) {
      return false
    }
    const response = yield* httpProbe({
      host: PROBE_HOST,
      port: binding.hostPort,
      path: strategy.path,
      method: strategy.method ?? 'GET',
      headers: strategy.headers ?? {},
    })
    if (response.status !== (strategy.status ?? 200)) {
      return false
    }
    return bodyPredicate(strategy.body, response.body)
  })

/** The body predicate: absent — contained — regex-searched (a broken pattern in a body matcher is a failed probe, not a throw). */
const bodyPredicate = (matcher: HttpBodyMatcher | undefined, body: string): boolean => {
  if (matcher === undefined) {
    return true
  }
  return Match.value(matcher).pipe(
    Match.tag('BodyContains', (contains) => body.includes(contains.value)),
    Match.orElse((matches) => {
      try {
        return new RegExp(matches.pattern).test(body)
      } catch {
        return false
      }
    }),
  )
}

/** From a logs snapshot; distinct lines only — a line matching whole-line and as a substring counts once (upstream). */
const probeForLogMessage = (
  runtime: SandboxRuntimeService,
  handle: SandboxHandle,
  strategy: ForLogMessage,
): Effect.Effect<boolean> =>
  Effect.map(
    runtime.logs(handle).pipe(Effect.orElseSucceed(() => '')),
    (logs) => {
      const pattern = new RegExp(strategy.pattern)
      let matches = 0
      for (const line of logs.split('\n')) {
        if (pattern.test(line)) {
          matches++
        }
      }
      return matches >= (strategy.count ?? 1)
    },
  )

/** Docker health status; the interpreter pre-gate handled the capability check. */
const probeForHealthCheck = (
  runtime: SandboxRuntimeService,
  handle: SandboxHandle,
  strategy: ForHealthCheck,
): Effect.Effect<boolean> =>
  Effect.map(
    runtime.inspect(handle).pipe(Effect.orElseSucceed(() => null)),
    (inspect) => inspect?.health === (strategy.status ?? 'healthy'),
  )

/** Ready when the command exits 0; an exec that errs (workload still booting) is a failed probe, not an error. */
const probeForShell = (
  runtime: SandboxRuntimeService,
  handle: SandboxHandle,
  strategy: ForShell,
): Effect.Effect<boolean> =>
  Effect.map(
    runtime.exec(handle, { command: [strategy.command], env: [] }).pipe(
      Effect.orElseSucceed(() => null),
    ),
    (result) => result !== null && result.exitCode === 0,
  )

// =============================================================================
// Timeout report — bounded log tail (upstream logTail parity)
// =============================================================================

/** The bounded tail the timeout error carries: the last 50 log lines, or `''` when logs are unreachable. */
const gatherLogTail = (runtime: SandboxRuntimeService, handle: SandboxHandle): Effect.Effect<string> =>
  Effect.map(
    runtime.logs(handle).pipe(Effect.orElseSucceed(() => '')),
    (logs) => logs.split('\n').slice(-LOG_TAIL_LINES).join('\n'),
  )

/** The upstream-shaped timeout message: describe + (newline + tail). */
const timeoutMessage = (id: string, tail: string): string => `Timed out waiting for ${id} to become ready.\n${tail}`

const timeoutFailure = (id: string, tail: string): Effect.Effect<never, ContainerLaunchError> =>
  Effect.fail(ContainerLaunchError.make({ message: timeoutMessage(id, tail) }))
