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
// Payload types the modules surface's signatures reference (`ContainerSpec`,
// `EnvPair`, `PortBinding`) are intentionally NOT re-exported here: they are
// the root entry's model types, and a type-only re-export makes the modules
// api-extractor UNTRIMMED rollup declare `const ContainerSpec` (a phantom
// value — the runtime bundle exports no such name, so a consumer
// value-import crashes at ESM link). Consumers import the model types from
// the root entry `@systemfsoftware/rightsize`.
