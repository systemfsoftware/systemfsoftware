import * as S from 'effect/Schema'

import { StrykerOptionsSchema } from './StrykerOptions.schema.js'

/**
 * The JSON Schema document derived from `StrykerOptionsSchema`, self-contained.
 *
 * It lives beside the schema module rather than inside it because it is a *use*
 * of that schema, not a declaration of one: `S.toJsonSchemaDocument` consumes a
 * schema and returns a plain document. Keeping uses out of a `*.schema.ts` is
 * what lets a tool read every exported schema in a package and trust that each
 * one is a schema - the generated law suite does exactly that, and a document
 * handed to `toEncoded` takes the whole suite down with it.
 */
export const strykerCoreSchema: Record<string, unknown> = (() => {
  const { schema, definitions } = S.toJsonSchemaDocument(StrykerOptionsSchema)
  return Object.keys(definitions).length === 0
    ? schema
    : { ...schema, definitions }
})()
