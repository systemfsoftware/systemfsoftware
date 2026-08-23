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

export const ensureTrailingDirectorySeparator = (path: string): string => {
  if (path.length === 0) return '/'
  return isSeparator(path.charCodeAt(path.length - 1)) ? path : `${path}/`
}

export const combinePaths = (base: string, relative: string): string => {
  if (relative.length === 0) return base
  const normalized = relative.replaceAll('\\', '/')
  if (normalized.startsWith('/')) return normalized
  return ensureTrailingDirectorySeparator(base.replaceAll('\\', '/')) + normalized
}

/** Anchor a package-relative path under an absolute base, leaving an already-absolute path alone. */
export const posixJoin = (base: string, relative: string): string =>
  relative.startsWith('/') ? relative : `${base}/${relative}`
