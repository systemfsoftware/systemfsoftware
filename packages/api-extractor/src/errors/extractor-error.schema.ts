import { Schema } from 'effect'

import { MissingMainEntryPointError, UnsupportedStarExportError, UnsupportedSyntaxError } from './analysis.schema.js'
import { TsCompilerLoadError, TsConfigReadError } from './compiler.schema.js'
import {
  CircularConfigExtendsError,
  ConfigExtendsResolutionError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  UnresolvedTokenError,
  UnsupportedFeatureError,
} from './config.schema.js'

/**
 * The closed error channel every unit produces into: the config and compiler variants this
 * module's siblings raise, plus the analysis variants the graph walker raises. A variant that
 * no step can produce does not belong here.
 */
export const ExtractorError = Schema.Union([
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  UnresolvedTokenError,
  CircularConfigExtendsError,
  ConfigExtendsResolutionError,
  UnsupportedFeatureError,
  TsConfigReadError,
  TsCompilerLoadError,
  UnsupportedSyntaxError,
  UnsupportedStarExportError,
  MissingMainEntryPointError,
])

export type ExtractorError = typeof ExtractorError.Type
