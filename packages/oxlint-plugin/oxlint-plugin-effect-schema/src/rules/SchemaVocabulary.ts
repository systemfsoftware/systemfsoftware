import type { ImportOrigin } from '@systemfsoftware/oxlint-import-origin'
import { SCHEMA_MODULE_SOURCE } from './schema-declaration-location.config.js'

export const isSchemaVocabularyOrigin = (origin: ImportOrigin): boolean =>
  origin.source === SCHEMA_MODULE_SOURCE || (origin.source === 'effect' && origin.importedName === 'Schema')
