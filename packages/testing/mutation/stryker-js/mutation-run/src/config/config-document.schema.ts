import * as S from 'effect/Schema'

/**
 * A Stryker config document read from disk or imported from a JS module: any
 * object record. Individual option keys and value shapes are enforced later
 * by the options validator against the derived JSON schema, so this boundary
 * decode only establishes that the document is an object — never a
 * hand-written `isRecord` narrowing.
 */
export const ConfigDocumentSchema = S.Record(S.String, S.Unknown)

/**
 * The shape of an imported JS config module as seen through the dynamic
 * `import()` boundary: a module namespace whose `default` export is the
 * config document. Only the default export is read here.
 */
export const ImportedModuleSchema = S.Struct({
  default: S.optional(S.Unknown),
})
