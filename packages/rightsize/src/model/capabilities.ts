/**
 * Runtime capabilities — the capability flags a backend's execution model can
 * and cannot guarantee, set once per backend and never changed at runtime
 * (upstream `BackendCapabilities` at the fork point, plus the two flags the
 * port plan moves onto it: `supportsNativeNetworks` — upstream carries it on
 * `SandboxBackend` directly — and `healthInspection`, the new gate for the
 * health-check wait strategy).
 *
 * The launch workflow gates on these flags before any I/O: a required
 * capability the active backend lacks is a typed error, never a
 * degraded-silently run.
 */
import { Schema as S } from 'effect'

/**
 * `true` when each sandbox runs in its own hardware-virtualized microVM with
 * its own kernel (msb); `false` when sandboxes share the host kernel (docker).
 * `withRequireIsolation()` demands `true`.
 */
export const RuntimeCapabilities = S.Struct({
  hardwareIsolated: S.Boolean,
  /**
   * `true` when the backend can checkpoint/restore a sandbox's state.
   */
  checkpoint: S.Boolean,
  /**
   * `true` when capturing a checkpoint restarts the sandbox's workload as a
   * side effect (msb's stop/snapshot/reboot cycle) — `false` when the
   * sandbox is undisturbed (docker's commit-to-image).
   */
  checkpointRestartsWorkload: S.Boolean,
  /**
   * `true` for docker's native bridge networks; `false` for msb, which
   * emulates alias links over exec-stream tunnels.
   */
  supportsNativeNetworks: S.Boolean,
  /**
   * `true` when the backend can report a container's health status (docker
   * inspect); `false` for msb — gates the `ForHealthCheck` wait strategy.
   */
  healthInspection: S.Boolean,
}).pipe(
  S.annotate({
    identifier: 'RuntimeCapabilities',
    title: 'RuntimeCapabilities',
    description: 'Capability flags describing a backend execution model.',
  }),
)

export type RuntimeCapabilities = S.Schema.Type<typeof RuntimeCapabilities>
