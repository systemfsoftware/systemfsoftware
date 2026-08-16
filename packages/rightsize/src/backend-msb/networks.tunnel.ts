/**
 * The microsandbox network adapter — `VirtualNetworks` over `msb exec
 * --stream` tunnels + `/etc/hosts` aliases. Behavioral source: upstream
 * rightsize-node `src/backend-msb/{backend.ts, exec-tunnel.ts}` (Apache-2.0).
 *
 * msb exposes no bridge/subnet (the only data path into a running sandbox is
 * the exec channel), so container-to-container links are emulated: the guest
 * gets a `127.0.0.1 <alias>` line per link, and each
 * `alias:guestPort → targetHostPort` route is bridged by an in-guest
 * `nc -l` listener spawned through `msb exec --stream` — one connection at a
 * time, single connection per link (client-speaks-first protocols only —
 * HTTP is).
 *
 * The respawn DECISION lives in the landed `tunnel.kernel` (`respawnDecision`
 * + `TUNNEL_TIMING`): a served connection respawns immediately; a spawn that
 * produced no traffic backs off with a doubling cap; a guest listener that
 * keeps dying without ever serving is given up after the kernel's
 * consecutive-failure budget — the bounded-deviation replacement for
 * upstream's indefinite fixed-200ms loop, so an orphaned listener cannot
 * spin the CLI driver forever.
 *
 * The guest-side host-publish proxy never propagates the target's own TCP
 * close back to the host socket, so the relay ends on idle windows: a
 * generous FIRST_BYTE deadline for a slow-but-real cold response, then a
 * tight IDLE window once data flows.
 */
import * as net from 'node:net'

import { Clock, Effect, Fiber, Match, Schema as S } from 'effect'

import { BackendError, UnsupportedByBackendError } from '../model/errors.js'
import type { NetworkLink, SandboxHandle, SandboxRuntimeService, VirtualNetworksService } from '../runtime/runtime.js'
import type { CliChild, CommandRunnerService } from './command-runner.js'
import { MsbCommands } from './commands/msb.kernel.js'
import { respawnDecision, TUNNEL_TIMING } from './commands/tunnel.kernel.js'
import { hostsAliasScript, validateAliases, validateGuestPorts } from './network-links.kernel.js'
import type { MsbBackendState } from './runtime.adapter.js'

/** Reads exactly one byte from a stream, resolving `undefined` when the stream ended without one. */
function firstByte(stream: NodeJS.ReadableStream): Promise<number | undefined> {
  const { promise, resolve } = Promise.withResolvers<number | undefined>()
  let settled = false
  const finish = (value: number | undefined): void => {
    if (settled) {
      return
    }
    settled = true
    stream.removeListener('readable', onReadable)
    stream.removeListener('end', onEnd)
    resolve(value)
  }
  const onReadable = (): void => {
    const chunk = (stream as NodeJS.ReadableStream & { read(size?: number): Buffer | string | null }).read(1)
    if (chunk !== null && chunk.length > 0 && typeof chunk !== 'string') {
      finish(chunk.readUInt8(0))
    }
  }
  const onEnd = (): void => finish(undefined)
  stream.on('readable', onReadable)
  stream.on('end', onEnd)
  return promise
}

/** Raw, unbuffered relay from the target into the guest's stdin, ending on an idle-read timeout (see module doc). */
function pumpWithIdleTimeout(target: net.Socket, guestStdin: NodeJS.WritableStream): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  let sawData = false
  let settled = false
  const finish = (): void => {
    if (settled) {
      return
    }
    settled = true
    target.removeAllListeners('data')
    target.removeAllListeners('timeout')
    target.removeAllListeners('end')
    target.removeAllListeners('error')
    resolve()
  }
  target.setTimeout(TUNNEL_TIMING.firstByteDeadlineMs)
  target.on('data', (chunk: Buffer) => {
    if (!sawData) {
      sawData = true
      target.setTimeout(TUNNEL_TIMING.idleWindowMs)
    }
    try {
      guestStdin.write(chunk)
    } catch {
      finish()
    }
  })
  target.on('timeout', () => finish())
  target.on('end', () => finish())
  target.on('error', () => finish())
  return promise
}

/** Relays the guest's stdout into the target socket after the first byte, ending once the guest stream closes. */
function relayGuestToTarget(target: net.Socket, guest: NodeJS.ReadableStream, first: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  target.write(Buffer.from([first]))
  guest.pipe(target, { end: false })
  guest.once('end', () => resolve())
  guest.once('error', () => resolve())
  target.once('error', () => resolve())
  return promise
}

/**
 * One live tunnel: a worker of `spawn → serve → kernel-decision`, plus a
 * close that stops the worker and reaps the current listener. Factory
 * closure (ban-classes forbids a class here); the caller owns retention and
 * quiesces it on stop.
 */
export interface TunnelHandle {
  readonly close: Effect.Effect<void>
  /** How many guest listeners have been spawned — test observability for the give-up policy. */
  readonly spawnCount: () => number
}

/**
 * A `nc -l` bridge for one `alias:guestPort` route. The worker loop is a
 * plain Effect (the codebase bans async functions in effect modules); the
 * byte-level stream machinery stays promise-based under `Effect.promise`.
 */
export function createTunnel(
  runner: CommandRunnerService,
  sandboxName: string,
  guestPort: number,
  targetHostPort: number,
  sleep: (ms: number) => Promise<void> = (ms) => Effect.runPromise(Effect.sleep(ms)),
): TunnelHandle {
  const closed = { current: false }
  const consecutiveFailures = { current: 0 }
  const spawnCount = { current: 0 }
  let current: CliChild | undefined

  const serveOneConnection: Effect.Effect<boolean, BackendError> = Effect.gen(function*() {
    const child = yield* runner.spawn(
      MsbCommands.execStream(sandboxName, ['nc', '-l', '-p', String(guestPort)]),
      { stdin: 'pipe' },
    )
    spawnCount.current += 1
    current = child
    const attempt = Effect.gen(function*() {
      const first = yield* Effect.promise(() => firstByte(child.stdout))
      if (first === undefined) {
        // The listener exited with no client: the kernel backs off.
        return false
      }
      const target = net.connect(targetHostPort, '127.0.0.1')
      target.setNoDelay(true)
      const onConnect = Promise.withResolvers<void>()
      target.once('connect', () => onConnect.resolve())
      target.once('error', (error) => onConnect.reject(error))
      yield* Effect.promise(() => onConnect.promise)
      yield* Effect.promise(() => pumpWithIdleTimeout(target, child.stdin))
      yield* Effect.race(
        Effect.promise(() => relayGuestToTarget(target, child.stdout, first)),
        Effect.promise(() => sleep(2000)),
      )
      target.destroy()
      return true
    })
    return yield* attempt.pipe(
      Effect.catchEager(() =>
        Effect.sync(() => {
          if (current === child) {
            current = undefined
          }
          return false
        })
      ),
    )
  })

  const worker = Effect.gen(function*() {
    while (!closed.current) {
      const lastAttemptMs = yield* Clock.currentTimeMillis
      const served = yield* serveOneConnection.pipe(Effect.catchEager(() => Effect.succeed(false)))
      if (closed.current) {
        return
      }
      const decision = respawnDecision({
        closed: closed.current,
        served,
        consecutiveFailures: consecutiveFailures.current,
        lastAttemptMs,
        nowMs: yield* Clock.currentTimeMillis,
      })
      const giveUp = Match.value(decision).pipe(
        Match.tag('give-up', () => true),
        Match.tag('reconnect', () => false),
        Match.exhaustive,
      )
      if (giveUp) {
        return
      }
      const backoffMs = Match.value(decision).pipe(
        Match.tag('reconnect', ({ backoffMs }) => backoffMs),
        Match.tag('give-up', () => 0),
        Match.exhaustive,
      )
      if (served) {
        consecutiveFailures.current = 0
      } else {
        consecutiveFailures.current += 1
      }
      if (backoffMs > 0) {
        yield* Effect.sleep(backoffMs)
      }
    }
  })
  const workerFiber = Effect.runFork(worker)

  return {
    spawnCount: () => spawnCount.current,
    close: Effect.gen(function*() {
      if (closed.current) {
        return
      }
      closed.current = true
      current?.kill('SIGKILL')
      yield* Effect.race(Fiber.join(workerFiber), Effect.sleep(2000)).pipe(Effect.catchEager(() => Effect.void))
    }),
  }
}

/** The `VirtualNetworks` adapter over one runner + the shared backend state. */
export function createMsbNetworks(
  runner: CommandRunnerService,
  runtime: SandboxRuntimeService,
  state: MsbBackendState,
  openTunnel: (handleId: string, link: NetworkLink) => TunnelHandle = (handleId, link) =>
    createTunnel(runner, handleId, link.guestPort, link.targetHostPort),
): VirtualNetworksService {
  return {
    ensureNetwork: () => Effect.void, // emulated via the host gateway; nothing to create
    removeNetwork: () => Effect.void, // nothing was created; nothing to remove
    installNetworkLinks: (handle: SandboxHandle, links: ReadonlyArray<NetworkLink>) =>
      Effect.gen(function*() {
        if (links.length === 0) {
          return
        }
        // The interface's error channel is `BackendError`; the two link-set
        // validations and the nc probe surface as `UnsupportedByBackendError`
        // (upstream's contract), mapped here so the channel stays exact.
        const mapped = Effect.gen(function*() {
          const ports = validateGuestPorts(links)
          const duplicate = Match.value(ports).pipe(
            Match.tag('ok', () => undefined),
            Match.tag('duplicate-guest-port', ({ guestPort }) => guestPort),
            Match.exhaustive,
          )
          if (duplicate !== undefined) {
            return yield* UnsupportedByBackendError.make({
              feature: `two siblings exposing the same guest port ${duplicate} on one network`,
              backend: 'msb',
            })
          }
          const aliases = validateAliases(links)
          const invalidAlias = Match.value(aliases).pipe(
            Match.tag('ok', () => undefined),
            Match.tag('invalid-alias', ({ alias }) => alias),
            Match.exhaustive,
          )
          if (invalidAlias !== undefined) {
            return yield* UnsupportedByBackendError.make({
              feature: `network alias '${invalidAlias}'`,
              backend: 'msb',
              remedy: "use a valid DNS label instead (allowed: letters, digits, '.', '_', '-')",
            })
          }
          const ncProbe = yield* runtime.exec(handle, { command: ['sh', '-c', 'command -v nc'], env: [] })
          if (ncProbe.exitCode !== 0) {
            return yield* UnsupportedByBackendError.make({
              feature: `network links (no nc/busybox in consumer image '${handle.spec.image}')`,
              backend: 'msb',
              remedy: 'run this test with RIGHTSIZE_BACKEND=docker instead',
            })
          }
          const hostsResult = yield* runtime.exec(handle, {
            command: ['sh', '-c', hostsAliasScript(links)],
            env: [],
          })
          if (hostsResult.exitCode !== 0) {
            return yield* BackendError.make({
              message: `failed to install /etc/hosts aliases in ${handle.id}: ${hostsResult.stderr}`,
            })
          }
          const handleState = state.handles.get(handle.id)
          for (const link of links) {
            const tunnel = openTunnel(handle.id, link)
            if (handleState !== undefined) {
              handleState.resources.push(tunnel)
            }
          }
        })
        yield* mapped.pipe(
          Effect.catchEager((error) =>
            S.is(UnsupportedByBackendError)(error)
              ? Effect.fail(BackendError.make({ message: error.message }))
              : Effect.fail(error)
          ),
        )
      }),
  }
}
