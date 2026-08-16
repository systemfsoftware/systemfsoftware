/**
 * `@systemfsoftware/rightsize` — testcontainers-style container testing in
 * Effect-TS with two execution backends (Docker Engine over a unix socket;
 * microsandbox microVMs via the `msb` CLI).
 *
 * U2: the public data surface — schema-typed immutable domain data with JSON
 * codecs (R2), the full 19-tag error taxonomy as `Schema.TaggedError` (R4),
 * pure spec combinators (R3's underlying mechanism; the fluent chained
 * surface is a copy-on-write wrapper wired in a later unit), and the pure
 * Docker-image-reference kernel. The exports partitioning (this entry plus
 * `./modules`, `./backend-docker`, `./backend-msb`) is fixed (KTD10); the
 * internal tree stays sealed from it.
 *
 * U3: the runtime contracts — the four service Tags + capability data, the
 * connect-probe discovery module (pure kernel + socket adapter), the backend
 * selection workflow with the `Selection` Tag and `layerAuto`, the FreePorts
 * allocator, RunId, and the `RIGHTSIZE_*` config layer.
 *
 * U4b: the lifecycle — the launch executor and the teardown executor, both
 * authored as `Cell` descriptions (read → decode → decide → encode → write)
 * over the launch/teardown workflows, the fluent `GenericContainer` facade
 * over the pure spec combinators, and the hygiene (R6): the on-disk ledger,
 * the sync-exit registry, and the detached watchdog reaper.
 *
 * U8: the agent-native surface (R15, KTD7) — the durable by-id handle
 * (`ContainerHandle.byId`, JSON-threadable, fingerprint-validated
 * reconstruction without a fresh launch), the fleet introspection listing
 * (`listFleetContainers`), structured diagnostics (`reportDiagnostics` +
 * the pure renderer), and the explicit reaper (`reap`). The fleet's
 * errors (MalformedHandleError, HandleBackendMismatchError,
 * UnreachableMsbAgentError) join the taxonomy here; U12 folds them into
 * its matrix pass. The registry module stays sealed (internal).
 *
 * U10: reuse + checkpoints (R14) — the reuse-adoption seam (`adoptRunningSeam`,
 * a Cell description over the content-hash identity, the on-disk reuse
 * registry, and the double opt-in) consumed as `LaunchOptions.adoptRunning`,
 * and the `Checkpoints` surface: named-checkpoint registry
 * find/list/remove, portable export/import archives (a `checkpoint.json`
 * manifest validated against the active backend before import), the
 * container-side capture (`checkpointContainer`), and the
 * `fromCheckpoint`/`restoreFromCheckpoint` restore wiring.
 */
export type { CommandRunnerService } from './backend-msb/command-runner.js'
export * from './fleet/diagnostics.js'
export * from './fleet/fleet.js'
export * from './fleet/handle.js'
export * from './fleet/reap.js'
export * from './generic-container.js'
export * from './lifecycle/launch.executor.js'
export type { LaunchError } from './lifecycle/launch.workflow.js'
export type { TeardownStep } from './lifecycle/teardown.workflow.js'
export * from './model/capabilities.schema.js'
export * from './model/checkpoint.schema.js'
export * from './model/container-spec.schema.js'
export * from './model/diagnostics.schema.js'
export * from './model/docker-image-name.js'
export * from './model/errors.js'
export * from './model/network.schema.js'
export * from './model/ports.schema.js'
export * from './model/spec-combinators.js'
export * from './model/wait.schema.js'
export * from './runtime/config.js'
export * from './runtime/discovery/discovery.adapter.js'
export * from './runtime/discovery/probe.kernel.js'
export * from './runtime/free-ports.kernel.js'
export * from './runtime/run-id.js'
export * from './runtime/runtime.js'
export * from './runtime/selection.workflow.js'
export type { WaitOptions } from './wait/interpreter.js'

// U10: reuse + checkpoints (R14) — the reuse-adoption seam (content-hash
// identity, on-disk reuse registry, the adopt cell) and the Checkpoints
// surface (named-checkpoint registry CRUD, portable export/import archives,
// capture + restore wiring). Append-only block; U12 folds the additions
// into its matrix pass.
export * from './checkpoint/archive.js'
export * from './checkpoint/checkpoint-ref.js'
export * from './checkpoint/checkpoint.js'
export * from './checkpoint/checkpoints.js'
export * from './checkpoint/from-checkpoint.js'
export * from './checkpoint/registry.js'
export * from './checkpoint/tar.js'
export * from './reuse/adopt.js'
export * from './reuse/adopt.workflow.js'
export * from './reuse/hash.adapter.js'
export * from './reuse/hash.kernel.js'
export * from './reuse/registry.js'
