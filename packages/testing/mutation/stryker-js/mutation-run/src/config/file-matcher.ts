import path from 'node:path'

import { normalizeFileName } from '@systemfsoftware/stryker-js-plugin-api/core'
import { minimatch } from 'minimatch'

const DEFAULT_GLOB = '**/*.{js,ts,jsx,tsx,html,vue,mjs,mts,cts,cjs}'

function normalizePattern(pattern: boolean | string): boolean | string {
  if (typeof pattern === 'string') {
    return normalizeFileName(path.resolve(pattern))
  }
  if (pattern) {
    return DEFAULT_GLOB
  }
  return false
}

export function createFileMatcher(
  pattern: boolean | string,
  allowHiddenFiles = true,
): (fileName: string) => boolean {
  const normalized = normalizePattern(pattern)
  if (typeof normalized === 'string') {
    return (fileName: string) =>
      minimatch(normalizeFileName(path.resolve(fileName)), normalized, {
        dot: allowHiddenFiles,
      })
  }
  return () => normalized
}

export function matchesFile(
  pattern: boolean | string,
  fileName: string,
  allowHiddenFiles = true,
): boolean {
  return createFileMatcher(pattern, allowHiddenFiles)(fileName)
}
