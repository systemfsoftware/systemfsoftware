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
 */
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
