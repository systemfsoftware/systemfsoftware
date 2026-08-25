import { createRequire } from 'module' // node:module — resolve only, no Effect equivalent

import { Predicate } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'

import { UnsupportedTypeScriptVersionError } from './typescript-version.schema.js'

let cachedTSVersion: string | undefined

export const getTSVersion = (fsService: FileSystem.FileSystem): Effect.Effect<string, unknown> =>
  Effect.gen(function*() {
    if (cachedTSVersion !== undefined) {
      return cachedTSVersion
    }
    const require = createRequire(import.meta.url) // node:module — resolve only
    const pkgPath = require.resolve('typescript/package.json')
    const text = yield* fsService.readFileString(pkgPath)
    const raw: unknown = JSON.parse(text)
    let version = ''
    if (Predicate.hasProperty(raw, 'version') && typeof raw.version === 'string') {
      version = raw.version
    }
    cachedTSVersion = version
    return version
  })

/**
 * Whether a TypeScript version satisfies the supported floor `>=7.0.0`.
 *
 * Prerelease handling: the suffix after `-` (e.g. `7.0.0-beta`, `7.0.0-rc.1`) and any
 * `+` build metadata is stripped before numeric comparison, so a `7.0.0` prerelease
 * compares as `7.0.0` and satisfies the floor. This preserves the prior
 * `satisfies(version, '>=7.0.0', { includePrerelease: true })` behaviour
 * where a TypeScript 7 prerelease must still pass the guard.
 */
export function isSupportedTypescriptVersion(version: string): boolean {
  const dashBase = version.split('-')[0] ?? version
  const base = dashBase.split('+')[0] ?? dashBase
  const parts = base.split('.').map((p) => Number.parseInt(p, 10))
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    return false
  }
  if (major !== 7) {
    return major > 7
  }
  if (minor !== 0) {
    return minor > 0
  }
  return patch >= 0
}

export const guardTSVersion = (fsService: FileSystem.FileSystem): Effect.Effect<void, unknown> =>
  Effect.gen(function*() {
    const version = yield* getTSVersion(fsService)
    if (!isSupportedTypescriptVersion(version)) {
      return yield* new UnsupportedTypeScriptVersionError({ version })
    }
  })
