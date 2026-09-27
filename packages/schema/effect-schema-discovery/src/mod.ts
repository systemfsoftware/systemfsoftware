import { resolve } from 'node:path'
import type { FoundSchema } from './internal/schema-scan.js'

export { findExportedSchemas } from './internal/schema-scan.js'
export type { FoundSchema } from './internal/schema-scan.js'

/** @since 0.1.0 */
export type SchemaIdentity = `${string}#${string}`

/**
 * Every quoted value the suite emits is single-quoted, so this is the only quoting the package
 * owns.
 *
 * @since 0.1.0
 */
export type QuotedText = `'${string}'`

/**
 * Two modules exporting the same name are two different schemas.
 *
 * @since 0.1.0
 */
export const identityOf = (schema: FoundSchema): SchemaIdentity => `${resolve(schema.filePath)}#${schema.name}`

/** @since 0.1.0 */
export const quote = (value: string): QuotedText => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
