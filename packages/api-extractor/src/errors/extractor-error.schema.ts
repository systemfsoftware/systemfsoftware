import { Schema } from 'effect'
import {
  CircularNamespaceReferenceError,
  ForgottenExportError,
  UnsupportedStarExportError,
  UnsupportedSyntaxError,
} from './analysis.schema.js'
import { TsConfigReadError, TypeScriptDiagnosticError } from './compiler.schema.js'
import {
  CircularConfigExtendsError,
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  UnresolvedTokenError,
} from './config.schema.js'
import { ApiReportMismatchError, ApiReportMissingError } from './report.schema.js'

const extractorErrorVariants = [
  ConfigFileNotFound,
  ConfigJsonSyntaxError,
  ConfigSchemaValidationError,
  UnresolvedTokenError,
  CircularConfigExtendsError,
  TsConfigReadError,
  TypeScriptDiagnosticError,
  UnsupportedSyntaxError,
  CircularNamespaceReferenceError,
  UnsupportedStarExportError,
  ForgottenExportError,
  ApiReportMismatchError,
  ApiReportMissingError,
] as const

export const ExtractorError = Schema.Union(extractorErrorVariants)

export type ExtractorError = typeof ExtractorError.Type

export const isExtractorError = Schema.is(ExtractorError)
