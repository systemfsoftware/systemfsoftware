import { relative } from '@std/path'

/**
 * Safe relative helper — returns null instead of throwing when paths are
 * incompatible (different roots). Forward-looking vs bash `realpath --relative-to`
 * which exits non-zero.
 */
export function tryRelative(from: string, to: string): string | null {
  try {
    return relative(from, to)
  } catch {
    return null
  }
}
