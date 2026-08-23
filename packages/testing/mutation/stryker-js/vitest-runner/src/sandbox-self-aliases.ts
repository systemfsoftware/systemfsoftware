import { escapeRegExp } from '@stryker-mutator/util'
import { Option } from 'effect'
import * as S from 'effect/Schema'
import fs from 'fs'
import path from 'path'

import { ExportEntry, PackageManifest } from './sandbox-self-aliases.schema.js'

export const SOURCE_CONDITION = '@systemfsoftware/source'

export interface SandboxAlias {
  readonly find: RegExp
  readonly replacement: string
}

const sourceTargetOf = (entry: ExportEntry): string | undefined => {
  if (typeof entry === 'string') {
    return entry.endsWith('.ts') || entry.endsWith('.tsx') || entry.endsWith('.mts')
      ? entry
      : undefined
  }
  const source = entry[SOURCE_CONDITION]
  return typeof source === 'string' ? source : undefined
}

const specifierForExport = (
  packageName: string,
  exportKey: string,
): string | undefined => {
  if (exportKey === '.') {
    return packageName
  }
  if (exportKey === './package.json' || !exportKey.startsWith('./')) {
    return undefined
  }
  return `${packageName}/${exportKey.slice(2)}`
}

export const sandboxSelfAliases = (
  manifest: PackageManifest,
  projectRoot: string,
): readonly SandboxAlias[] => {
  const name = manifest.name
  const exports = manifest.exports
  if (name === undefined || name.length === 0 || exports === undefined) {
    return []
  }
  const aliases: SandboxAlias[] = []
  for (const [key, value] of Object.entries(exports)) {
    const spec = specifierForExport(name, key)
    const target = sourceTargetOf(value)
    if (spec === undefined || target === undefined) {
      continue
    }
    aliases.push({
      find: new RegExp(`^${escapeRegExp(spec)}$`),
      replacement: path.resolve(projectRoot, target),
    })
  }
  return aliases
}

export const readSandboxSelfAliases = (projectRoot: string): readonly SandboxAlias[] => {
  let raw: string
  try {
    raw = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
  } catch {
    return []
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  return Option.match(S.decodeUnknownOption(PackageManifest)(parsed), {
    onNone: () => [],
    onSome: (manifest) => sandboxSelfAliases(manifest, projectRoot),
  })
}

/**
 * Vite records a package specifier as a bare dep. Vitest related-mode then
 * joins that specifier onto the project root, misses the file, and reports
 * zero tests. Returning the sandbox source path from `resolveId` makes the
 * dep a real filesystem path related-mode can walk.
 */
export const sandboxSelfPlugin = (projectRoot: string) => {
  const aliases = readSandboxSelfAliases(projectRoot)
  return {
    name: 'stryker-sandbox-self-exports',
    enforce: 'pre' as const,
    resolveId(source: string): string | undefined {
      for (const alias of aliases) {
        if (alias.find.test(source)) {
          return alias.replacement
        }
      }
      return undefined
    },
  }
}
