/**
 * Wire declarations for the Docker Engine API's container endpoints:
 * `POST /containers/create`, `GET /containers/{id}/json`.
 *
 * Payload shapes follow the Engine API and the podman-compatible subset this
 * backend drives (behavioral reference: upstream rightsize-node
 * `src/backend-docker/backend.ts` `buildCreateBody` + daemon responses).
 * Everything here is a marked wire declaration (KTD8) — the workspace
 * restates the daemon's members, so nothing names a Docker SDK type.
 *
 * Decoding is deliberately strict where the daemon always emits, and
 * optional only where the daemon may omit: a field the daemon promises is
 * required, so drift fails loudly via {@link WireDecodeError} instead of
 * degrading to a silent default.
 *
 * @since 0.1.0
 */
import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'

/** One host-side binding of a guest port, as reported by the daemon. */
export const PortBinding = Wire.wire({
  HostIp: Wire.string,
  HostPort: Wire.string,
})
export type PortBinding = S.Schema.Type<typeof PortBinding>

/** The container-creation `HostConfig` subset this backend drives. */
export const HostConfig = Wire.wire({
  /** guest-port key (`"6379/tcp"`) → host bindings, pinned to `127.0.0.1` by this backend. */
  PortBindings: Wire.record(Wire.string, Wire.array(PortBinding)),
  /** `hostPath:guestPath:ro|rw` mount strings. */
  Binds: Wire.array(Wire.string),
  ExtraHosts: Wire.array(Wire.string),
  /** Memory limit in bytes; only present when the spec sets a memory floor. */
  Memory: Wire.optional(Wire.integer),
})
export type HostConfig = S.Schema.Type<typeof HostConfig>

/** `POST /containers/create` request body. */
export const ContainerCreateRequest = Wire.wire({
  Image: Wire.string,
  Env: Wire.array(Wire.string),
  Cmd: Wire.optional(Wire.array(Wire.string)),
  /** `"port/tcp"` → `{}`; the daemon only reads the keys. */
  ExposedPorts: Wire.record(Wire.string, Wire.wire({})),
  Labels: Wire.record(Wire.string, Wire.string),
  HostConfig,
})
export type ContainerCreateRequest = S.Schema.Type<typeof ContainerCreateRequest>

/** `POST /containers/create` success body. */
export const ContainerCreateResponse = Wire.wire({
  Id: Wire.string,
  Warnings: Wire.optional(Wire.array(Wire.string)),
})
export type ContainerCreateResponse = S.Schema.Type<typeof ContainerCreateResponse>

/** One entry of `State.Health.Log`. */
export const ContainerHealthLogEntry = Wire.wire({
  Start: Wire.string,
  End: Wire.string,
  ExitCode: Wire.integer,
  Output: Wire.string,
})
export type ContainerHealthLogEntry = S.Schema.Type<typeof ContainerHealthLogEntry>

/** `State.Health` — present only when the image declares a healthcheck. */
export const ContainerHealth = Wire.wire({
  Status: Wire.literal('none', 'starting', 'healthy', 'unhealthy'),
  FailingStreak: Wire.integer,
  Log: Wire.optional(Wire.array(ContainerHealthLogEntry)),
})
export type ContainerHealth = S.Schema.Type<typeof ContainerHealth>

/** `ContainerState` for the lifecycle fields the library reads. */
export const ContainerState = Wire.wire({
  Status: Wire.string,
  Running: Wire.boolean,
  Paused: Wire.boolean,
  Restarting: Wire.boolean,
  OOMKilled: Wire.boolean,
  Dead: Wire.boolean,
  Pid: Wire.integer,
  ExitCode: Wire.integer,
  Error: Wire.string,
  StartedAt: Wire.string,
  FinishedAt: Wire.string,
  Health: Wire.optional(Wire.nullOr(ContainerHealth)),
})
export type ContainerState = S.Schema.Type<typeof ContainerState>

/** `NetworkSettings` for the port-map subset. */
export const ContainerNetworkSettings = Wire.wire({
  /** `"80/tcp"` → bindings; `null` per entry (and the whole map) under host networking. */
  Ports: Wire.optional(Wire.nullOr(Wire.record(Wire.string, Wire.nullOr(Wire.array(PortBinding))))),
})
export type ContainerNetworkSettings = S.Schema.Type<typeof ContainerNetworkSettings>

/** `GET /containers/{id}/json` success body — the inspect surface. */
export const ContainerInspectResponse = Wire.wire({
  Id: Wire.string,
  Name: Wire.string,
  State: ContainerState,
  NetworkSettings: ContainerNetworkSettings,
})
export type ContainerInspectResponse = S.Schema.Type<typeof ContainerInspectResponse>
