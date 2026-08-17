/**
 * `@systemfsoftware/rightsize/backend-msb` — the microsandbox (microVM)
 * backend. Provision the pinned `msb` toolchain (or honor `MSB_PATH`), run
 * every sandbox as an attached `msb run` child, and emulate
 * container-to-container networking with `/etc/hosts` aliases plus TCP
 * relays over `msb exec --stream`. `layerMsb` composes the whole backend;
 * `registerMsbCleanupSync` is the synchronous process-exit teardown the
 * hygiene registry (U4b) consumes.
 *
 * @since 0.1.0
 */
export { createMsbCheckpoints } from './backend-msb/checkpoint.js'
export { type CliChild, type CommandRunnerService, createCommandRunner } from './backend-msb/command-runner.js'
export { createMsbImages } from './backend-msb/images.js'
export { createMsbBackend, layerMsb, type MsbBackendInstance, type MsbBackendServices } from './backend-msb/index.js'
export { createMsbNetworks, createTunnel, type TunnelHandle } from './backend-msb/networks.js'
export { type ProvisionerOptions, provisionMsb, resolveProvisionerOptions } from './backend-msb/provisioning.js'
export {
  createMsbRuntime,
  defaultMsbRuntimeOptions,
  type MsbRuntimeOptions,
  registerMsbCleanupSync,
} from './backend-msb/runtime.js'
