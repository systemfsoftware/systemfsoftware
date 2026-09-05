import type { ImportOrigin } from '@systemfsoftware/oxlint-import-origin'

/**
 * Whether an import origin denotes the Effect Schema vocabulary: the
 * `effect/Schema` module, or the `Schema` namespace export of `effect`.
 * Schema-vocabulary knowledge stays in this plugin; the shared resolver only
 * answers where a value came from, never what the module means.
 */
export const isSchemaVocabularyOrigin = (origin: ImportOrigin): boolean =>
  origin.source === 'effect/Schema' || (origin.source === 'effect' && origin.importedName === 'Schema')
