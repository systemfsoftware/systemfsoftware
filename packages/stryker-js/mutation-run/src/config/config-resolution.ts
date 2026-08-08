/**
 * Surface-only re-export of the three configuration entry points the CLI
 * imports from core: `ConfigReader`, `defaultOptions`, `OptionsValidator`.
 * Wildcard-barrel entries are inadmissible (the plan's U7 ruling), so this
 * module enumerates the symbols explicitly. Each symbol is re-exported from
 * its source module — no local definitions, no behavior.
 */
export { ConfigReader } from './config-reader.js'
export { defaultOptions, OptionsValidator } from './options-validator.js'
