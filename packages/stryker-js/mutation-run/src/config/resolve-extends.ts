import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { pathToFileURL } from 'url'

import type { PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as S from 'effect/Schema'

import { ConfigError } from '../errors.js'

import { ConfigDocumentSchema, ImportedModuleSchema } from './config-document.schema.js'

export async function readConfigFile(configFile: string): Promise<PartialStrykerOptions> {
  const ext = path.extname(configFile).toLowerCase()
  if (ext === '.json') {
    let fileContent: string
    try {
      fileContent = await fs.promises.readFile(configFile, 'utf-8')
    } catch (err) {
      throw new ConfigError(
        `Cannot read config file "${configFile}"`,
        err,
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(fileContent)
    } catch (err) {
      throw new ConfigError(
        `Invalid config file "${configFile}". File contains invalid JSON`,
        err,
      )
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(
        `Invalid config file "${configFile}". Config must be a JSON object`,
      )
    }
    return S.decodeUnknownSync(ConfigDocumentSchema)(parsed)
  }
  // Dynamic import: the module specifier is the runtime-resolved config path,
  // not a literal known at author time, so static import cannot apply.
  let importedModule: unknown
  try {
    importedModule = await import(
      pathToFileURL(path.resolve(configFile)).toString()
    )
  } catch (err) {
    throw new ConfigError(
      `Invalid config file "${configFile}". Error during import`,
      err,
    )
  }
  const exported = S.decodeUnknownSync(ImportedModuleSchema)(importedModule).default
  if (exported === undefined || exported === null || typeof exported !== 'object') {
    throw new ConfigError(
      `Invalid config file "${configFile}". Default export of config file must be an object!`,
    )
  }
  return S.decodeUnknownSync(ConfigDocumentSchema)(exported)
}

/**
 * Merge a child config over a parent's resolved options.
 * R2: scalars replace wholesale; objects merge one level deep.
 * R3: a child key set to `null` deletes the inherited key.
 * R4: the `plugins` array is the one exception to wholesale array replacement — the
 * parent's plugin loaders stay inherited and the child's descriptors are appended,
 * with the first occurrence of a descriptor winning. A package under-specifies
 * `plugins` on purpose: the base preset carries the checker and ignorer loader
 * modules, and a sandwich package adds only what it names locally (KTD1).
 */
export function mergeConfigs(
  parent: PartialStrykerOptions,
  child: PartialStrykerOptions,
): PartialStrykerOptions {
  const out: Record<string, unknown> = { ...parent }
  for (const [key, value] of Object.entries(child)) {
    if (value === null) {
      delete out[key]
      continue
    }
    const parentValue = parent[key]
    if (key === 'plugins') {
      const parentPlugins: readonly unknown[] = Array.isArray(parentValue) ? parentValue : []
      const childPlugins: readonly unknown[] = Array.isArray(value) ? value : []
      const merged = [...parentPlugins, ...childPlugins]
      out[key] = merged.filter(
        (descriptor, index) => typeof descriptor !== 'string' || !merged.slice(0, index).includes(descriptor),
      )
      continue
    }
    const bothObjects = parentValue !== null &&
      parentValue !== undefined &&
      typeof parentValue === 'object' &&
      !Array.isArray(parentValue) &&
      typeof value === 'object' &&
      !Array.isArray(value)
    out[key] = bothObjects
      ? {
        ...S.decodeUnknownSync(ConfigDocumentSchema)(parentValue),
        ...S.decodeUnknownSync(ConfigDocumentSchema)(value),
      }
      : value
  }
  return out
}

/**
 * A bare package specifier (`pkg`, `@scope/pkg`, `@scope/pkg/sub`) versus a
 * filesystem path. Everything not starting with `./`, `../`, `/` or `\` is
 * treated as a specifier and routed through the Node resolver, so it honours
 * `package.json#exports` the way `@systemfsoftware/tsconfig` does for
 * `tsconfig.json`.
 */
function isModuleSpecifier(value: string): boolean {
  return !(value.startsWith('./') || value.startsWith('../') ||
    value.startsWith('/') || value.startsWith('\\'))
}

/**
 * Resolve an `extends` value to an absolute path, relative to `configDir` —
 * the directory of the config that declared it, never the process working
 * directory. That is what lets a published package's config inherit a preset
 * from its own dependencies regardless of where the run was started.
 */
export function resolveExtendsTarget(
  extendValue: string,
  configDir: string,
): string {
  if (!isModuleSpecifier(extendValue)) {
    return path.resolve(configDir, extendValue)
  }
  const requireFrom = createRequire(path.join(configDir, 'noop.js'))
  try {
    return requireFrom.resolve(extendValue)
  } catch (err) {
    throw new ConfigError(
      `Cannot resolve extends target "${extendValue}" from "${configDir}"`,
      err,
    )
  }
}

/**
 * Resolve an `extends` chain starting at `configFile`. Returns `configFile`'s
 * own options with its parent chain merged underneath, with the child's keys
 * taking precedence over inherited keys per the R2/R3 merge rules.
 *
 * When `configFile` declares no `extends`, the file's content is returned
 * unchanged (apart from stripping the absent `extends` key).
 *
 * Cycle detection mirrors `TSConfigPreprocessor.touched` (a Set of absolute
 * paths); on re-entry we throw `ConfigError` naming the offending file (R5).
 */
export async function resolveExtendsChain(
  configFile: string,
  visited: Set<string> = new Set<string>(),
): Promise<PartialStrykerOptions> {
  const absolute = path.resolve(configFile)
  if (visited.has(absolute)) {
    throw new ConfigError(`Config inheritance cycle detected at "${configFile}"`)
  }
  visited.add(absolute)

  const raw = await readConfigFile(absolute)
  const extendValue = raw['extends']
  if (extendValue === undefined || extendValue === null) {
    const { extends: _ignored, ...rest } = raw
    return rest
  }
  if (typeof extendValue !== 'string') {
    throw new ConfigError(
      `Invalid config file "${configFile}". "extends" must be a string`,
    )
  }

  let parentPath: string
  try {
    parentPath = resolveExtendsTarget(extendValue, path.dirname(absolute))
  } catch (err) {
    if (err instanceof ConfigError) throw err
    const reason = err instanceof Error ? `. ${err.message}` : ''
    throw new ConfigError(
      `Cannot resolve extends target "${extendValue}" from "${configFile}"${reason}`,
      err,
    )
  }
  const parentResolved = await resolveExtendsChain(parentPath, visited)
  const { extends: _ignored, ...selfRest } = raw
  return mergeConfigs(parentResolved, selfRest)
}
