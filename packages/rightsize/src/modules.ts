/**
 * `@systemfsoftware/rightsize/modules` — the module presets surface (R13,
 * KTD11): the 23 upstream module presets plus the floci provider variants as
 * Schema data, never classes — image/env/ports/wait-data/memory-floor/
 * restrictions/transforms/helper-declarations per row, with one interpreter
 * each for building container specs and connection values.
 *
 * @since 0.1.0
 */
export * from './modules/helpers.js'
export * from './modules/index.js'
export * from './modules/preset.js'
export * from './modules/readiness.js'
export * from './modules/spec-builder.js'
// Payload types the modules surface's signatures reference — re-exported so
// the ./modules rollup is self-contained (the instal interior stays sealed).
export type { ContainerSpec, EnvPair } from './model/container-spec.js'
export type { PortBinding } from './model/ports.js'
