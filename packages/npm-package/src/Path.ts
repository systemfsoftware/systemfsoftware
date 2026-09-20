/**
 * The two POSIX path operations this package used to reach into a compiler for.
 *
 * Both mirror the compiler helpers they replace for the inputs this package
 * supplies: `ensureTrailingDirectorySeparator` treats either separator as
 * trailing, and `combinePaths` normalises backslashes and lets a rooted second
 * segment win, but resolves no `.` or `..` segments and collapses no repeated
 * separators — the helper it replaces did neither.
 */

const isSeparator = (code: number): boolean => code === 47 /* / */ || code === 92 /* \ */

const withTrailingSeparator = (path: string): string => {
  if (isSeparator(path.charCodeAt(path.length - 1))) return path
  return `${path}/`
}

export const ensureTrailingDirectorySeparator = (path: string): string => {
  if (path.length === 0) return '/'
  return withTrailingSeparator(path)
}

const joinNormalized = (base: string, relative: string): string => {
  const normalized = relative.replaceAll('\\', '/')
  if (normalized.startsWith('/')) return normalized
  return ensureTrailingDirectorySeparator(base.replaceAll('\\', '/')) + normalized
}

export const combinePaths = (base: string, relative: string): string => {
  if (relative.length === 0) return base
  return joinNormalized(base, relative)
}

/** Anchor a package-relative path under an absolute base, leaving an already-absolute path alone. */
export const posixJoin = (base: string, relative: string): string => {
  if (relative.startsWith('/')) return relative
  return `${base}/${relative}`
}
