/**
 * The in-process live-container registry (R15) — the fleet's live view and
 * the diagnostics report's data source.
 *
 * The registry is populated at handle-mint time: `ContainerHandle.fromRunning`
 * records every launched container here, and the diagnostics invariant — the
 * report's membership and state come from the live registry, never from a
 * backend query — depends on this. Rows carry the launch-time portrait a
 * foreign report needs (name, image, and the allocated port map; the
 * on-disk hygiene ledger stays names-only by design, R6, and never sees the
 * image or ports).
 *
 * Insertion-ordered: a `Map` preserves the order rows were recorded, which
 * is the container start order the diagnostics report presents. Handles
 * reconstructed by id that then `remove()` their container drop it from the
 * registry (the same row a launch's scope teardown would leave behind).
 */
import type { PortBinding } from '../model/ports.js'
import type { BackendName } from '../runtime/runtime.js'

/** One live container as the fleet sees it. */
export interface RegistryContainer {
  readonly backend: BackendName
  /** The backend-native container id. */
  readonly id: string
  /** The run-scoped container name («rz-<runId>-<seq>»). */
  readonly name: string
  /** The image the container was launched from. */
  readonly image: string
  /** The host ports allocated at launch, guest → host. */
  readonly ports: ReadonlyArray<PortBinding>
}

const containers = new Map<string, RegistryContainer>()

const keyFor = (backend: string, id: string): string => `${backend}:${id}`

/** Records a launched container — idempotent per (backend, id), preserving first-record order. */
export const recordContainer = (row: RegistryContainer): void => {
  const key = keyFor(row.backend, row.id)
  if (containers.has(key)) {
    return
  }
  containers.set(key, row)
}

/** Drops a container from the live view — called by a by-id `remove()` and the diagnostics overlays. */
export const unregisterContainer = (backend: string, id: string): void => {
  containers.delete(keyFor(backend, id))
}

/** The current live rows, in record (start) order. */
export const listLiveContainers = (): ReadonlyArray<RegistryContainer> => [...containers.values()]

/** Whether a (backend, id) pair is currently live. */
export const isLiveContainer = (backend: string, id: string): boolean => containers.has(keyFor(backend, id))

/** Test seam: clears the registry — never call from library code. */
export const _resetRegistryForTests = (): void => {
  containers.clear()
}
