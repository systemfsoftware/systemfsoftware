/**
 * `@systemfsoftware/rightsize/backend-docker` — the Docker Engine backend
 * subpath.
 *
 * U6b: `layerDocker` — the four backend Tags (`SandboxRuntime`,
 * `VirtualNetworks`, `CheckpointStore`, `ImageRegistry`) composed over the
 * hand-rolled unix-socket-only Engine API client — plus
 * `registerDockerCleanupSync`, the blocking cleanup primitive the hygiene
 * unit's sync-exit registry consumes (R6). Everything else in the backend
 * tree stays sealed behind this barrel (KTD10).
 *
 * @since 0.1.0
 */
export * from './backend-docker/index.js'
