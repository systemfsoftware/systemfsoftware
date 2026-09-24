import { Schema } from 'effect'
import { UnsupportedStarExportError, UnsupportedSyntaxError } from './analysis.schema.js'
import { TsCompilerLoadError, TsConfigReadError } from './compiler.schema.js'
import {
  CircularConfigExtendsError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  UnresolvedTokenError,
} from './config.schema.js'

const extractorErrorVariants = [
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  UnresolvedTokenError,
  CircularConfigExtendsError,
  TsConfigReadError,
  TsCompilerLoadError,
  UnsupportedSyntaxError,
  UnsupportedStarExportError,
] as const

export const ExtractorError = Schema.Union(extractorErrorVariants)

export type ExtractorError = typeof ExtractorError.Type

export const isExtractorError = Schema.is(ExtractorError)
