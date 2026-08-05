import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

import type { PartialStrykerOptions } from '@stryker-mutator/api/core'

import { ConfigError } from '../errors.js'

export async function readConfigFile(configFile: string): Promise<PartialStrykerOptions> {
  const ext = path.extname(configFile).toLowerCase()
  if (ext === '.json') {
    const fileContent = await fs.promises.readFile(configFile, 'utf-8')
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
    return parsed as PartialStrykerOptions
  }
  // Dynamic import: the module specifier is the runtime-resolved config path,
  // not a literal known at author time, so static import cannot apply.
  let imported: { default?: unknown }
  try {
    imported = (await import(
      pathToFileURL(path.resolve(configFile)).toString()
    )) as { default?: unknown }
  } catch (err) {
    throw new ConfigError(
      `Invalid config file "${configFile}". Error during import`,
      err,
    )
  }
  const exported = imported.default
  if (exported === undefined || exported === null || typeof exported !== 'object') {
    throw new ConfigError(
      `Invalid config file "${configFile}". Default export of config file must be an object!`,
    )
  }
  return { ...(exported as PartialStrykerOptions) }
}

/**
 * Merge a child config over a parent's resolved options.
 * R2: scalars and arrays replace wholesale; objects merge one level deep.
 * R3: a child key set to `null` deletes the inherited key.
 */
export function mergeConfigs(
  parent: PartialStrykerOptions,
  child: PartialStrykerOptions,
): PartialStrykerOptions {
  const out: Record<string, unknown> = { ...(parent as Record<string, unknown>) }
  for (const [key, value] of Object.entries(child)) {
    if (value === null) {
      delete out[key]
      continue
    }
    const parentValue = (parent as Record<string, unknown>)[key]
    const bothObjects = parentValue !== null &&
      parentValue !== undefined &&
      typeof parentValue === 'object' &&
      !Array.isArray(parentValue) &&
      typeof value === 'object' &&
      !Array.isArray(value)
    out[key] = bothObjects
      ? { ...(parentValue as Record<string, unknown>), ...(value as Record<string, unknown>) }
      : value
  }
  return out as PartialStrykerOptions
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

  const raw = (await readConfigFile(absolute)) as Record<string, unknown>
  const extendValue = raw['extends']
  if (extendValue === undefined || extendValue === null) {
    const { extends: _ignored, ...rest } = raw
    return rest as PartialStrykerOptions
  }
  if (typeof extendValue !== 'string') {
    throw new ConfigError(
      `Invalid config file "${configFile}". "extends" must be a string`,
    )
  }

  const parentPath = path.resolve(path.dirname(absolute), extendValue)
  const parentExists = await fs.promises
    .stat(parentPath)
    .then(() => true)
    .catch(() => false)
  if (!parentExists) {
    throw new ConfigError(
      `Cannot resolve extends target "${parentPath}" from "${configFile}"`,
    )
  }
  const parentResolved = await resolveExtendsChain(parentPath, visited)
  const { extends: _ignored, ...selfRest } = raw
  return mergeConfigs(parentResolved, selfRest as PartialStrykerOptions)
}
