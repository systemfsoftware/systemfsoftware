/**
 * Socket-probe decision kernel — the pure half of runtime discovery (R8,
 * KTD4). Everything here is data in, data out: the process facts an adapter
 * reads at the edge (`DOCKER_HOST`, `$XDG_RUNTIME_DIR`, the uid) arrive as
 * `ProbeEnvironment`, and the decision over recorded probe verdicts is a
 * lookup, not an effect. The connect itself lives in
 * `discovery.adapter.ts`; this module never touches a socket and never
 * stats one either.
 *
 * Candidate ordering (the priority): an explicit `DOCKER_HOST` is
 * authoritative — when set to a unix form it is the ONLY candidate, because
 * an operator who expressed a preference must hear about that socket being
 * dead instead of being silently rerouted (R8: "DOCKER_HOST authoritative",
 * and `docs/solutions/test-failures/contract-lane-stops-at-dead-docker-socket.md`
 * for the live-connect doctrine). Without it the walk is
 * `docker.sock` → `$XDG_RUNTIME_DIR/podman/podman.sock` (with the
 * `/run/user/<uid>` fallback the solution doc's probe uses, for the common
 * rootless case where XDG is unset inside a service manager) →
 * `/run/podman/podman.sock`.
 */
import { join } from 'node:path'

/** The docker daemon's default unix socket path. */
export const DEFAULT_DOCKER_SOCKET = '/var/run/docker.sock'

/** The system-wide (rootful) podman service socket path. */
export const SYSTEM_PODMAN_SOCKET = '/run/podman/podman.sock'

/**
 * The process facts the pure candidate ordering reads. Every field is
 * optional so tests can drive the decision without touching `process.env`.
 */
export interface ProbeEnvironment {
  /** The `DOCKER_HOST` value; `undefined` (or absent) when unset. */
  readonly dockerHost?: string | undefined
  /** `$XDG_RUNTIME_DIR`; `undefined` when unset. */
  readonly xdgRuntimeDir?: string | undefined
  /** `process.getuid()`; used for the `/run/user/<uid>` fallback. */
  readonly uid?: number | undefined
  /** Overrides `DEFAULT_DOCKER_SOCKET` (tests). */
  readonly defaultDockerSocket?: string | undefined
  /** Overrides `SYSTEM_PODMAN_SOCKET` (tests). */
  readonly podmanSystemSocket?: string | undefined
}

/**
 * How an explicit `DOCKER_HOST` classifies: unix-socket usable, or refused.
 * Anything that is not a unix socket (`unix://…` or an absolute path) is a
 * refusal — `tcp://` is the documented non-goal, and a stray value must
 * fail loudly rather than silently reroute (R9). The empty string is
 * "unset": operators unset the variable by exporting it empty, and an empty
 * `DOCKER_HOST=` must behave exactly like no variable at all.
 */
export type DockerHostKind =
  | { readonly kind: 'unset' }
  | { readonly kind: 'unix'; readonly socketPath: string }
  | { readonly kind: 'refused'; readonly value: string }

/** Classifies a raw `DOCKER_HOST` value. Pure; the adapter decides what a refusal means. */
export const classifyDockerHost = (dockerHost: string | undefined): DockerHostKind => {
  if (dockerHost === undefined || dockerHost === '') {
    return { kind: 'unset' }
  }
  if (dockerHost.startsWith('unix://')) {
    return { kind: 'unix', socketPath: dockerHost.slice('unix://'.length) }
  }
  if (dockerHost.startsWith('/')) {
    return { kind: 'unix', socketPath: dockerHost }
  }
  return { kind: 'refused', value: dockerHost }
}

/** One socket discovery candidate: a stable logical id and the path to connect to. */
export interface SocketCandidate {
  /** Stable logical name ('docker-host', 'docker.sock', 'xdg-podman', 'podman-system'). */
  readonly id: string
  /** The filesystem path of the socket (never a `unix://`-prefixed form). */
  readonly socketPath: string
}

/** A recorded candidate verdict: `live` means the connect probe succeeded. */
export interface SocketProbeVerdict {
  readonly id: string
  readonly socketPath: string
  /** `true` exactly when a connect probe to `socketPath` succeeded. */
  readonly live: boolean
}

/**
 * The ordered candidate list for one `ProbeEnvironment`. Order IS priority:
 * an explicit `DOCKER_HOST` yields exactly one candidate (authoritative), the
 * default walk yields `docker.sock` first, then the rootless podman socket,
 * then the system podman socket. An `undefined` XDG runtime dir with no uid
 * simply omits the rootless candidate — the walk never fabricates a path it
 * could not have derived from real process facts.
 */
export const orderedSocketCandidates = (env: ProbeEnvironment): ReadonlyArray<SocketCandidate> => {
  const host = classifyDockerHost(env.dockerHost)
  if (host.kind === 'unix') {
    return [{ id: 'docker-host', socketPath: host.socketPath }]
  }
  const runtimeDir = env.xdgRuntimeDir ?? (env.uid === undefined ? undefined : `/run/user/${env.uid}`)
  const candidates: Array<SocketCandidate> = [
    { id: 'docker.sock', socketPath: env.defaultDockerSocket ?? DEFAULT_DOCKER_SOCKET },
  ]
  if (runtimeDir !== undefined) {
    candidates.push({ id: 'xdg-podman', socketPath: join(runtimeDir, 'podman', 'podman.sock') })
  }
  candidates.push({ id: 'podman-system', socketPath: env.podmanSystemSocket ?? SYSTEM_PODMAN_SOCKET })
  return candidates
}

/**
 * The pure decision over recorded probe verdicts: the highest-priority live
 * candidate. `probes` arrive in candidate order (priority order), so the
 * first `live` verdict IS the winner — a stale socket file that refused to
 * connect scores `live: false` and lets the walk fall through, which is the
 * entire point of probing by connecting (the dead `docker.sock` that used to
 * stop the stryker lane dead). `undefined` means nothing answered: the
 * selection workflow turns that into `BackendUnreachableError`.
 */
export const firstLiveCandidate = (probes: ReadonlyArray<SocketProbeVerdict>): SocketProbeVerdict | undefined =>
  probes.find((probe) => probe.live)
