import { Option } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import type * as PathType from 'effect/Path'
import * as S from 'effect/Schema'

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
  pathService: PathType.Path,
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
      find: new RegExp(`^${RegExp.escape(spec)}$`),
      replacement: pathService.resolve(projectRoot, target),
    })
  }
  return aliases
}

export const readSandboxSelfAliases = (
  projectRoot: string,
): Effect.Effect<readonly SandboxAlias[], never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const pathService = yield* Path.Path
    const raw = yield* fs.readFileString(pathService.join(projectRoot, 'package.json')).pipe(
      Effect.orElseSucceed(() => null as string | null),
    )
    if (raw === null) {
      return [] as readonly SandboxAlias[]
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return [] as readonly SandboxAlias[]
    }
    return Option.match(S.decodeUnknownOption(PackageManifest)(parsed), {
      onNone: () => [] as readonly SandboxAlias[],
      onSome: (manifest) => sandboxSelfAliases(manifest, projectRoot, pathService),
    })
  })

/**
 * Vite records a package specifier as a bare dep. Vitest related-mode then
 * joins that specifier onto the project root, misses the file, and reports
 * zero tests. Returning the sandbox source path from `resolveId` makes the
 * dep a real filesystem path related-mode can walk.
 */
export const sandboxSelfPlugin = (aliases: readonly SandboxAlias[]) => {
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
