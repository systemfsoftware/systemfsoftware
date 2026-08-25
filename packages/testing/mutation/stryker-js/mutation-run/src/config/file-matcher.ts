import type * as Path from 'effect/Path'

import { normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'
import { minimatch } from 'minimatch'

const DEFAULT_GLOB = '**/*.{js,ts,jsx,tsx,html,vue,mjs,mts,cts,cjs}'

function normalizePattern(pattern: boolean | string, pathService: Path.Path): boolean | string {
  if (typeof pattern === 'string') {
    return normalizeFileName(pathService.resolve(pattern))
  }
  if (pattern) {
    return DEFAULT_GLOB
  }
  return false
}

export function createFileMatcher(
  pattern: boolean | string,
  pathService: Path.Path,
  allowHiddenFiles = true,
): (fileName: string) => boolean {
  const normalized = normalizePattern(pattern, pathService)
  if (typeof normalized === 'string') {
    return (fileName: string) =>
      minimatch(normalizeFileName(pathService.resolve(fileName)), normalized, {
        dot: allowHiddenFiles,
      })
  }
  return () => normalized
}

export function matchesFile(
  pattern: boolean | string,
  fileName: string,
  pathService: Path.Path,
  allowHiddenFiles = true,
): boolean {
  return createFileMatcher(pattern, pathService, allowHiddenFiles)(fileName)
}
