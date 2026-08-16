/**
 * Pure `POST /containers/create` body builder (behavioral reference:
 * upstream rightsize-node `src/backend-docker/backend.ts` `buildCreateBody`
 * at the fork point, Apache-2.0).
 *
 * Builds the create body the runtime adapter sends: port bindings pinned to
 * `127.0.0.1` (the R7 invariant — host ports were pre-allocated by the
 * launch workflow; this backend binds exactly what the spec carries and
 * never allocates), read-only/read-write binds, the
 * `host.docker.internal` extra host, the run-id (or reuse) label, the
 * command and an optional memory ceiling. The msb-only
 * `diskLimitMb`/`tmpfsRootMb`/`networkDisabled` fields have no docker
 * equivalent and are deliberately left unread here.
 *
 * Pure: spec in, declared wire body out — no I/O, no daemon knowledge.
 *
 * @since 0.1.0
 */
import type { ContainerSpec } from '../model/container-spec.schema.js'
import { containerLabels } from './labels.js'
import type { ContainerCreateRequest } from './wire/container.schema.js'

/** Builds the `POST /containers/create` JSON body for one spec. */
export const buildCreateBody = (spec: ContainerSpec): ContainerCreateRequest => {
  const exposedPorts: Record<string, Record<string, never>> = {}
  const portBindings: Record<string, Array<{ HostIp: string; HostPort: string }>> = {}
  for (const p of spec.ports) {
    const key = `${p.guestPort}/tcp`
    exposedPorts[key] = {}
    portBindings[key] = [{ HostIp: '127.0.0.1', HostPort: String(p.hostPort) }]
  }

  const binds = spec.mounts.map((m) => `${m.hostPath}:${m.guestPath}:${m.readOnly ? 'ro' : 'rw'}`)

  return {
    Image: spec.image,
    Env: spec.env.map(([k, v]) => `${k}=${v}`),
    ExposedPorts: exposedPorts,
    Labels: containerLabels(spec),
    HostConfig: {
      PortBindings: portBindings,
      Binds: binds,
      ExtraHosts: ['host.docker.internal:host-gateway'],
      ...(spec.memoryLimitMb !== undefined ? { Memory: spec.memoryLimitMb * 1024 * 1024 } : {}),
    },
    ...(spec.command !== undefined ? { Cmd: [...spec.command] } : {}),
  }
}
