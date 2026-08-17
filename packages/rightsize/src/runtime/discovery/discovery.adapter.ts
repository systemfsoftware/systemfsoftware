/**
 * Socket-connect probe adapter — the effectful half of runtime discovery
 * (R8, KTD4). Liveness is established by CONNECTING to the unix socket,
 * never by statting its file: a present-but-dead socket file looks like an
 * answer and would stop the candidate walk before podman is ever tried (the
 * exact failure `docs/solutions/test-failures/contract-lane-stops-at-dead-docker-socket.md`
 * records). `probeSocket` resolves `true` on the `connect` event and `false`
 * on `error`, so a corpse file fails the probe and discovery falls through.
 *
 * The probe battery runs every ordered candidate and returns the verdicts
 * (the error path must name every candidate tried). The one typed failure is
 * an unsupported `DOCKER_HOST` scheme: `tcp://` is the documented non-goal
 * (R9), so the battery refuses loudly instead of silently rerouting.
 */
import { Context, Effect, Layer, Schema as S } from 'effect'
import * as net from 'node:net'
import { classifyDockerHost, orderedSocketCandidates, type ProbeEnvironment, type SocketProbeVerdict } from './probe.js'

/** Ceiling on one connect probe. A live daemon connects in microseconds; a wedged backlog must fail the probe instead of hanging discovery. */
export const PROBE_TIMEOUT_MS = 2_000

/** A non-goal dial target: an explicit `DOCKER_HOST` that is not a unix socket (e.g. `tcp://`). */
export class UnsupportedDockerHostError
  extends S.TaggedError<UnsupportedDockerHostError>()('UnsupportedDockerHostError', {
    dockerHost: S.String,
    reason: S.String,
  })
{}

/**
 * Probes one unix socket by connecting. Liveness is the `connect` event and
 * only it; `error` (dead socket, EACCES, ENOTDIR) and a bounded timeout both
 * score `false`. The socket is destroyed on every outcome, so a successful
 * probe leaves no lingering connection to whatever daemon answered.
 */
export const probeSocket = (socketPath: string): Effect.Effect<boolean> => {
  // The probe is a plain native-Promise bridge (no Effect callbacks in this
  // RC), so the resolver form the repo's lint asks for is used directly.
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = net.connect(socketPath)
  let settled = false
  const finish = (live: boolean): void => {
    if (settled) {
      return
    }
    settled = true
    socket.destroy()
    resolve(live)
  }
  socket.once('connect', () => finish(true))
  socket.once('error', () => finish(false))
  socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(false))
  return Effect.promise(() => promise)
}

/**
 * Probes every ordered candidate for one `ProbeEnvironment`, in priority
 * order, and returns the verdicts. Fails with `UnsupportedDockerHostError`
 * when `DOCKER_HOST` names a non-unix target — nothing is probed then,
 * because refusing the scheme is the point.
 */
export const probeBattery = (
  env: ProbeEnvironment,
): Effect.Effect<ReadonlyArray<SocketProbeVerdict>, UnsupportedDockerHostError> =>
  Effect.gen(function*() {
    const refused = classifyDockerHost(env.dockerHost)
    if (refused.kind === 'refused') {
      return yield* UnsupportedDockerHostError.make({
        dockerHost: refused.value,
        reason:
          'only unix sockets are supported (unix://… or an absolute path); tcp:// DOCKER_HOST is a documented non-goal',
      })
    }
    const candidates = orderedSocketCandidates(env)
    const verdicts: Array<SocketProbeVerdict> = []
    for (const candidate of candidates) {
      verdicts.push({
        id: candidate.id,
        socketPath: candidate.socketPath,
        live: yield* probeSocket(candidate.socketPath),
      })
    }
    return verdicts
  })

/** The ambient process facts: `process.env` + `process.getuid`. Read at call time, so an env change before a call is honored. */
export const defaultProbeEnvironment = (): ProbeEnvironment => ({
  dockerHost: process.env['DOCKER_HOST'] ?? undefined,
  xdgRuntimeDir: process.env['XDG_RUNTIME_DIR'] ?? undefined,
  uid: typeof process.getuid === 'function' ? process.getuid() : undefined,
})

// =============================================================================
// RuntimeDiscovery service
// =============================================================================

/** The discovery service surface the auto layer composes against (the component graph's `RuntimeDiscovery` node). */
export interface RuntimeDiscoveryService {
  /** Probe every ordered candidate for one environment (default: the ambient process facts); fails only on an unsupported `DOCKER_HOST` scheme. */
  readonly probe: (
    env?: ProbeEnvironment,
  ) => Effect.Effect<ReadonlyArray<SocketProbeVerdict>, UnsupportedDockerHostError>
}

/**
 * The `RuntimeDiscovery` service Tag — the connect-probe module as a
 * composeable service, so `layerAuto` and the backend Layers take the probe
 * battery as a dependency rather than importing it (KTD4: library-owned
 * probe module, memoization by Layer composition).
 */
export class RuntimeDiscovery extends Context.Service<RuntimeDiscovery, RuntimeDiscoveryService>()(
  '@systemfsoftware/rightsize/runtime/discovery/discovery.adapter/RuntimeDiscovery',
) {}

/** The live discovery layer: probe the ambient environment. */
export const layerRuntimeDiscovery: Layer.Layer<RuntimeDiscovery> = Layer.succeed(RuntimeDiscovery, {
  probe: (env) => probeBattery(env ?? defaultProbeEnvironment()),
})
