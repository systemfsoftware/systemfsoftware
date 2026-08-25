/**
 * Resolving a run's configuration: reading it from disk, validating it against
 * the option schema, and the failures either can produce.
 *
 * A published entry point, so what it exports is what an embedder can reach.
 */
export { CONFIG_SYNTAX_HELP, readConfig } from './config-reader.js'
export {
  ConfigError,
  ConfigFileInvalidError,
  ConfigFileNotFoundError,
  ConfigFileUnreadableError,
} from './config-reader.schema.js'
export {
  createDefaultOptions,
  defaultOptions,
  validateOptions,
  type ValidationSchemaDocument,
} from './options-validator.js'
