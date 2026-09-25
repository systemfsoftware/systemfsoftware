import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { findExportedSchemaNames } from './internal/schema-names.js'

/**
 * @since 0.1.0
 */
export interface FoundSchema {
  readonly name: string
  readonly filePath: string
}

/**
 * A schema is identified by the module that declares it *and* its exported
 * name. Two modules exporting the same name are two different schemas.
 *
 * @since 0.1.0
 */
export const identityOf = (filePath: string, name: string): string => `${resolve(filePath)}#${name}`

/**
 * A single-quoted TypeScript literal. Every quoted value the suite emits is
 * single-quoted, so this is the only quoting the package owns.
 *
 * @since 0.1.0
 */
export const quote = (value: string): string => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/**
 * Walk a directory and return every exported const whose type annotation
 * or initializer mentions `Schema`.
 *
 * @since 0.1.0
 */
export function findExportedSchemas(dir: string): FoundSchema[] {
  const schemas: FoundSchema[] = []
  const walk = (current: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry)
      let stat: ReturnType<typeof statSync>
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.git') continue
        walk(full)
      } else if (stat.isFile() && extname(entry) === '.ts') {
        let source: string
        try {
          source = readFileSync(full, 'utf-8')
        } catch {
          continue
        }
        for (const name of findExportedSchemaNames(source)) {
          schemas.push({ name, filePath: full })
        }
      }
    }
  }
  walk(resolve(dir))
  return schemas
}
