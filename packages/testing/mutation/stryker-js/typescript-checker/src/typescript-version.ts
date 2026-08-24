import { readFileSync } from 'fs'
import { createRequire } from 'module'

import { Predicate } from 'effect'

let cachedTSVersion: string | undefined

export function getTSVersion(): string {
  if (cachedTSVersion === undefined) {
    const require = createRequire(import.meta.url)
    const raw: unknown = JSON.parse(readFileSync(require.resolve('typescript/package.json'), 'utf-8'))
    let version = ''
    if (Predicate.hasProperty(raw, 'version') && typeof raw.version === 'string') {
      version = raw.version
    }
    cachedTSVersion = version
  }
  return cachedTSVersion
}

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

export function guardTSVersion(version = getTSVersion()): void {
  if (!isSupportedTypescriptVersion(version)) {
    throw new Error(
      `@systemfsoftware/stryker-js-typescript-checker only supports typescript@7.0.0 or higher. Found typescript@${version}`,
    )
  }
}
